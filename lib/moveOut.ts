// Move-out: notice, room return with the final bill, deposit settlement and refund (commit 12).
//
// Notified  — the tenant gives notice (30 days ahead is the rule; less is allowed with a warning). Contract stays Active.
// Returned  — owner/manager records the return date and the final meter: the contract ends (Ended, no more monthly
//             bills), the room is released when no other contract holds it, and the final bill is issued (whatever of
//             the return month is not billed yet). Clause 13 (สคบ.) is checked here for an early move-out.
// Settled   — owner: outstanding bills are paid from the deposit (recordPayment, method deposit_offset); for an early
//             move-out that does not meet clause 13 the rest is forfeited (Income); otherwise the rest is to be refunded
//             within 7 days of the return (14 days when something was deducted, สคบ. ข้อ 10).
// Closed    — refund recorded (or nothing to refund); the contract's deposit Liability must be 0.
//
// Every function takes `now` from the app; MySQL NOW() is never used. Money moves only through lib/payments.ts and
// accounting rows written here (reference_type settlement_*, reference_id = move_out_settlements.id).
// Move-out requests without a settlement row are from before commit 12 ("คำขอแบบเดิม — จัดการด้วยมือ").

import { getDb } from '@/lib/db';
import { type Client } from '@/lib/bill-status';
import { bangkokDate, calcMonthlyBill, calcUtility, getRates, ratesForRoom } from '@/lib/billing';
import { ROOM_HOLDING_STATUSES, withRetry } from '@/lib/contracts';
import { outstandingFor, recordPaymentInTransaction } from '@/lib/payments';
import { deleteRefundFile, parseRefundUpload, saveRefundFile } from '@/lib/move-out-files';
import { formatBaht } from '@/lib/format';

export const NOTICE_DAYS = 30;
const REFUND_DAYS = 7;
const REFUND_DAYS_WITH_DEDUCTION = 14;
const REFUND_SOON_DAYS = 2;
const MAX_DAMAGE_ITEMS = 20;
const FORFEIT_CATEGORY = 'ริบเงินประกัน';
export const RECLASS_CATEGORY = 'deposit_reclass';
const OPEN_STATES = ['Notified', 'Returned', 'Settled'];
const MOVE_OUT_BILL_TYPES = ['move_out', 'move_out_damage'];

export type MoveOutState = 'Notified' | 'Returned' | 'Settled' | 'Closed' | 'Cancelled';
export type DepositSource = 'system' | 'outside' | 'legacy_income' | 'legacy_outside';

export type MoveOutRefusal = 'not_found' | 'forbidden' | 'no_contract' | 'already_requested' | 'legacy_request' | 'bad_date'
  | 'invalid_state' | 'meter_required' | 'meter_lower' | 'prev_meter_required' | 'bad_damage' | 'deposit_unconfirmed'
  | 'bad_deposit' | 'drafts' | 'offset_failed' | 'bad_file' | 'liability_not_zero' | 'note_required' | 'move_in_unpaid';

export type MoveOutResult<T> = ({ ok: true } & T) | { ok: false; reason: MoveOutRefusal; message: string };

const MESSAGES: Record<MoveOutRefusal, string> = {
  not_found: 'ไม่พบคำขอย้ายออก',
  forbidden: 'ไม่มีสิทธิ์ทำรายการนี้',
  no_contract: 'ไม่พบสัญญาเช่าที่มีผลอยู่',
  already_requested: 'มีคำขอย้ายออกที่กำลังดำเนินการอยู่แล้ว',
  legacy_request: 'สัญญานี้มีคำขอย้ายออกแบบเดิม — ให้เจ้าของหอจัดการด้วยมือ',
  bad_date: 'วันที่ไม่ถูกต้อง',
  invalid_state: 'คำขอนี้อยู่ในขั้นที่ทำรายการนี้ไม่ได้',
  meter_required: 'กรุณากรอกเลขมิเตอร์ไฟฟ้าวันคืนห้อง',
  meter_lower: 'เลขมิเตอร์วันคืนห้องต้องไม่น้อยกว่าเลขมิเตอร์ล่าสุด',
  prev_meter_required: 'ห้องนี้ไม่มีเลขมิเตอร์ล่าสุดในระบบ กรุณากรอกเลขมิเตอร์ก่อนหน้า',
  bad_damage: 'รายการค่าเสียหายไม่ถูกต้อง (ระบุยอดมากกว่า 0 และเหตุผลทุกรายการ)',
  deposit_unconfirmed: 'สัญญาแบบเดิม — เจ้าของหอต้องยืนยันยอดเงินประกันที่รับไว้ก่อน',
  bad_deposit: 'ยอดเงินประกันไม่ถูกต้อง',
  drafts: 'ผู้เช่ายังมีบิลร่างที่ยังไม่ส่ง — ส่งหรือยกเลิกบิลร่างก่อน',
  offset_failed: 'หักบิลจากเงินประกันไม่สำเร็จ',
  bad_file: 'ไฟล์สลิปไม่ถูกต้อง',
  liability_not_zero: 'ยอดเงินประกันของสัญญานี้ยังไม่เป็น 0 — ปิดเรื่องไม่ได้',
  note_required: 'กรุณาระบุบันทึกการจัดการ',
  move_in_unpaid: 'บิลเข้าอยู่ยังไม่ชำระ กรุณาจัดการก่อน',
};

class MoveOutRefused extends Error {
  constructor(public reason: MoveOutRefusal, public detail?: string) { super(reason); }
}
function refuse(reason: MoveOutRefusal, detail?: string): never {
  throw new MoveOutRefused(reason, detail);
}

/** For callers that run lib/moveOut.ts work inside their own transaction: the message of a refusal, or null. */
export function moveOutRefusalMessage(error: unknown): string | null {
  return error instanceof MoveOutRefused ? error.detail || MESSAGES[error.reason] : null;
}

/** A refusal answered before any database work (role checks). */
function deny<T>(reason: MoveOutRefusal, detail?: string): Promise<MoveOutResult<T>> {
  return Promise.resolve({ ok: false, reason, message: detail || MESSAGES[reason] });
}

async function run<T>(work: (client: Client) => Promise<T>): Promise<MoveOutResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof MoveOutRefused) return { ok: false, reason: error.reason, message: error.detail || MESSAGES[error.reason] };
    throw error;
  }
}

export interface Actor { id: number; email?: string | null; role: string }
const isStaff = (u: Actor) => u.role === 'owner' || u.role === 'manager';
const isOwner = (u: Actor) => u.role === 'owner';

const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const toSatang = (n: number) => Math.round(Number(n) * 100);

// ── Dates (calendar dates in Asia/Bangkok, YYYY-MM-DD) ────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;
const isYmd = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && bangkokDate(new Date(`${v}T12:00:00+07:00`)) === v;
const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};
export const daysBetween = (from: string, to: string) => dayNumber(to) - dayNumber(from);
export const addDays = (ymd: string, days: number) => new Date((dayNumber(ymd) + days) * DAY_MS).toISOString().slice(0, 10);
const ymdOf = (v: unknown): string | null => (v ? bangkokDate(v as any) : null);

// ── Clause 13 (สคบ.) ─────────────────────────────────────────────────────────────────

export interface Clause13 {
  early: boolean;
  half: boolean;
  notice: boolean;
  noArrears: boolean;
  refundable: boolean;
  stayedDays: number;
  contractDays: number;
  noticeDays: number;
}

/**
 * Early = returning before the last day of the contract (one day of grace, as before). An early move-out keeps the
 * deposit refundable only when all three hold: (ก) stayed at least half of the contract, (ข) notice in writing at
 * least 30 days before the return, (ค) nothing overdue when giving notice and when returning the room.
 */
export function clause13(input: { startDate: string; endDate: string; returnDate: string; noticeDate: string; noArrears: boolean }): Clause13 {
  const early = daysBetween(input.returnDate, input.endDate) > 1;
  const contractDays = Math.max(0, daysBetween(input.startDate, input.endDate));
  const stayedDays = Math.max(0, daysBetween(input.startDate, input.returnDate));
  const noticeDays = daysBetween(input.noticeDate, input.returnDate);
  const half = stayedDays * 2 >= contractDays;
  const notice = noticeDays >= NOTICE_DAYS;
  return { early, half, notice, noArrears: input.noArrears, refundable: !early || (half && notice && input.noArrears), stayedDays, contractDays, noticeDays };
}

/** Days from the return date within which the rest of the deposit is refunded (สคบ. ข้อ 10). */
export function refundDueDate(returnDate: string, deducted: boolean) {
  return addDays(returnDate, deducted ? REFUND_DAYS_WITH_DEDUCTION : REFUND_DAYS);
}

export type RefundDueStatus = 'ok' | 'soon' | 'overdue';
export function refundDueStatus(dueDate: string, now: Date): RefundDueStatus {
  const left = daysBetween(bangkokDate(now), dueDate);
  return left < 0 ? 'overdue' : left <= REFUND_SOON_DAYS ? 'soon' : 'ok';
}

/** Bills of the tenant overdue on `date` (due before it and not fully paid before it), except the given ones. */
async function overdueOn(client: Client, tenantId: number, date: string, exceptBillIds: number[]) {
  const rows = (await client.query(
    `SELECT b.id, b.amount, b.status, b.paid_at,
       (SELECT COALESCE(SUM(p.amount), 0) FROM bill_payments p WHERE p.bill_id = b.id AND p.voided_at IS NULL AND p.paid_at < ?) AS paid_before,
       (SELECT COUNT(*) FROM bill_payments p WHERE p.bill_id = b.id) AS payment_rows
     FROM bills b
     WHERE b.tenant_id = ? AND b.due_date IS NOT NULL AND b.due_date < ? AND b.amount > 0
       AND LOWER(b.status) NOT IN ('cancelled', 'canceled', 'draft')`,
    [`${date} 00:00:00`, tenantId, date]
  )).rows as any[];
  return rows.filter((b) => {
    if (exceptBillIds.includes(Number(b.id))) return false;
    // Bills paid before bill_payments existed only have bills.paid_at
    if (Number(b.payment_rows) === 0) return String(b.status).toLowerCase() !== 'paid' || (b.paid_at && bangkokDate(b.paid_at) >= date);
    return toSatang(b.paid_before) < toSatang(b.amount);
  }).map((b) => Number(b.id));
}

// ── Deposit held for a contract ───────────────────────────────────────────────────────

/** The contract and the ones it renewed (oldest last). */
async function contractChain(client: Client, contractId: number) {
  const chain: any[] = [];
  let id: number | null = contractId;
  while (id && chain.length < 50) {
    const row: any = (await client.query(
      'SELECT id, parent_contract_id, booking_bill_id, move_in_bill_id, deposit_outside_system, deposit_amount FROM contracts WHERE id = ?',
      [id]
    )).rows[0];
    if (!row || chain.some((c) => c.id === row.id)) break;
    chain.push(row);
    id = row.parent_contract_id ? Number(row.parent_contract_id) : null;
  }
  return chain;
}

/**
 * Where the deposit of a contract is recorded:
 * system  — Liability rows of the booking / move-in bill payments (renewals follow parent_contract_id);
 * outside — received outside the system (deposit_outside_system): contract deposit_amount;
 * legacy  — no linked bills (before deposits were a Liability, or a contract the owner created): the owner confirms the
 *           amount by hand (the contract's deposit_amount is offered as the starting value).
 */
async function depositBase(client: Client, contractId: number) {
  const chain = await contractChain(client, contractId);
  const billIds = chain.flatMap((c) => [c.booking_bill_id, c.move_in_bill_id]).filter(Boolean).map(Number);
  if (chain.some((c) => Number(c.deposit_outside_system) === 1)) {
    return { kind: 'outside' as const, billIds, amount: round2(Number(chain[0]?.deposit_amount || 0)) };
  }
  if (billIds.length === 0) return { kind: 'legacy' as const, billIds, amount: null };
  return { kind: 'system' as const, billIds, amount: null };
}

/** Liability held for the contract: its deposit bill payments (and reversals / booking forfeits) + this settlement's rows. */
async function liabilityHeld(client: Client, billIds: number[], settlementId: number) {
  const ids = billIds.length > 0 ? billIds : [0];
  const row = (await client.query(
    `SELECT COALESCE(SUM(amount), 0) AS held FROM accounting_transactions
     WHERE type = 'Liability' AND (
       (reference_type IN ('bill_payment', 'bill_payment_reversal')
         AND reference_id IN (SELECT id FROM bill_payments WHERE bill_id IN (?)))
       OR (reference_type = 'booking_forfeit' AND reference_id IN (?))
       OR (reference_type IN ('settlement_opening', 'settlement_offset', 'settlement_forfeit', 'settlement_refund') AND reference_id = ?)
     )`,
    [ids, ids, settlementId]
  )).rows[0];
  return round2(Number(row?.held || 0));
}

async function entry(client: Client, s: any, type: 'Liability' | 'Income', category: string, amount: number, description: string, referenceType: string, now: Date) {
  await client.query(
    `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [s.dorm_id || 1, type, category, round2(amount), description, s.id, referenceType, bangkokDate(now)]
  );
}

// ── Loading ───────────────────────────────────────────────────────────────────────────

async function lockSettlement(client: Client, settlementId: number) {
  const s = (await client.query(
    `SELECT s.*, c.status AS contract_status, c.start_date, c.end_date, c.deposit_amount AS contract_deposit, c.occupants,
       c.start_meter_reading, r.room_number, r.price AS room_price, COALESCE(r.dorm_id, 1) AS dorm_id,
       t.user_id AS tenant_user_id, t.email AS tenant_email, t.name AS tenant_name
     FROM move_out_settlements s
     JOIN contracts c ON c.id = s.contract_id
     JOIN rooms r ON r.id = s.room_id
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.id = ? FOR UPDATE`,
    [settlementId]
  )).rows[0];
  if (!s) refuse('not_found');
  return s;
}

async function lockContractRow(client: Client, contractId: number) {
  return (await client.query('SELECT id, status, room_id FROM contracts WHERE id = ? FOR UPDATE', [contractId])).rows[0];
}

/** Tenant records of an account (linked by user_id or by the same email). */
async function tenantIdsOf(client: Client, user: Actor): Promise<number[]> {
  const rows = (await client.query(
    'SELECT id FROM tenants WHERE user_id = ? OR (? <> \'\' AND LOWER(email) = LOWER(?))',
    [user.id, user.email || '', user.email || '']
  )).rows as any[];
  return rows.map((r) => Number(r.id));
}

async function roomHeldByOther(client: Client, roomId: number, contractId: number) {
  const row = (await client.query(
    `SELECT id FROM contracts WHERE room_id = ? AND id <> ? AND status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')}) LIMIT 1`,
    [roomId, contractId, ...ROOM_HOLDING_STATUSES]
  )).rows[0];
  return !!row;
}

/**
 * End the contract and free the room unless another contract holds it. The tenant record follows its other contract
 * that has not ended (room_id points to that contract's room); with none, it is marked past and its room cleared when
 * it was the room of the contract that ended.
 */
async function endContract(client: Client, contractId: number, roomId: number, tenantId: number, returnDate: string) {
  await client.query("UPDATE contracts SET status = 'Ended' WHERE id = ?", [contractId]);
  if (!(await roomHeldByOther(client, roomId, contractId))) {
    await client.query("UPDATE rooms SET status = 'Available', tenant_id = NULL WHERE id = ?", [roomId]);
  }
  const other = (await client.query(
    `SELECT room_id FROM contracts WHERE tenant_id = ? AND id <> ? AND status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')})
     ORDER BY (status = 'Active') DESC, id DESC LIMIT 1`,
    [tenantId, contractId, ...ROOM_HOLDING_STATUSES]
  )).rows[0];
  if (other) {
    await client.query('UPDATE tenants SET room_id = ? WHERE id = ?', [other.room_id, tenantId]);
  } else {
    await client.query(
      "UPDATE tenants SET status = 'past', room_id = IF(room_id = ?, NULL, room_id), move_out_date = ? WHERE id = ?",
      [roomId, returnDate, tenantId]
    );
  }
}

/** Back to guest when the account has no other contract that holds a room. Staff accounts are never changed. */
async function downgradeRole(client: Client, userId: number | null, exceptContractId: number) {
  if (!userId) return;
  const user = (await client.query('SELECT id, email, role FROM users WHERE id = ? FOR UPDATE', [userId])).rows[0];
  if (!user || String(user.role).toLowerCase() !== 'tenant') return;
  const other = (await client.query(
    `SELECT c.id FROM contracts c JOIN tenants t ON t.id = c.tenant_id
     WHERE (t.user_id = ? OR LOWER(t.email) = LOWER(?)) AND c.id <> ?
       AND c.status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')}) LIMIT 1`,
    [userId, user.email || '', exceptContractId, ...ROOM_HOLDING_STATUSES]
  )).rows[0];
  if (!other) await client.query("UPDATE users SET role = 'guest', primary_role = 'guest' WHERE id = ?", [userId]);
}

// ── Notice ────────────────────────────────────────────────────────────────────────────

export interface MoveOutNoticeInput {
  returnDate: unknown;
  reason?: unknown;
  promptpayTarget?: unknown;
  promptpayName?: unknown;
  bankName?: unknown;
}

const text = (v: unknown, max: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);

/**
 * The tenant gives notice for their Active contract. Less than 30 days' notice, or a return before the contract ends,
 * is allowed and answered with warnings. The contract stays Active until the room is returned.
 */
export function requestMoveOut(user: Actor, input: MoveOutNoticeInput, now: Date) {
  if (!user) return deny<never>('forbidden');
  return run(async (client) => {
    const today = bangkokDate(now);
    if (!isYmd(input.returnDate) || input.returnDate < today) refuse('bad_date', 'กรุณาเลือกวันคืนห้อง (ตั้งแต่วันนี้เป็นต้นไป)');
    const returnDate = input.returnDate;

    const tenantIds = await tenantIdsOf(client, user);
    if (tenantIds.length === 0) refuse('no_contract');
    const c = (await client.query(
      `SELECT c.*, t.name AS tenant_name, t.phone AS tenant_phone, t.user_id AS tenant_user_id FROM contracts c JOIN tenants t ON t.id = c.tenant_id
       WHERE c.tenant_id IN (?) AND c.status IN ('Active', 'MoveOutPending') ORDER BY c.id DESC LIMIT 1 FOR UPDATE`,
      [tenantIds]
    )).rows[0];
    if (!c) refuse('no_contract');
    if (c.status === 'MoveOutPending') refuse('legacy_request');

    const openRequest = (await client.query(
      "SELECT id FROM move_out_requests WHERE (contract_id = ? OR tenant_id = ?) AND status IN ('Pending', 'Approved') LIMIT 1 FOR UPDATE",
      [c.id, c.tenant_id]
    )).rows[0];
    if (openRequest) {
      const hasSettlement = (await client.query('SELECT id FROM move_out_settlements WHERE request_id = ?', [openRequest.id])).rows[0];
      refuse(hasSettlement ? 'already_requested' : 'legacy_request');
    }
    const openSettlement = (await client.query(
      `SELECT id FROM move_out_settlements WHERE contract_id = ? AND state IN (${OPEN_STATES.map(() => '?').join(', ')}) LIMIT 1`,
      [c.id, ...OPEN_STATES]
    )).rows[0];
    if (openSettlement) refuse('already_requested');

    const startDate = ymdOf(c.start_date) as string;
    const endDate = ymdOf(c.end_date) as string;
    const check = clause13({ startDate, endDate, returnDate, noticeDate: today, noArrears: true });
    const promptpayTarget = (text(input.promptpayTarget, 30) || '').replace(/[\s-]/g, '') || null;

    const requestId = Number((await client.query(
      `INSERT INTO move_out_requests (tenant_id, room_id, move_out_date, desired_date, reason, status, promptpay_target, promptpay_name,
         bank_name, contract_id, deposit_amount, unpaid_bills_total, penalty_amount, net_refund_amount, is_contract_completed,
         refund_qr_payload, settlement_status)
       VALUES (?, ?, ?, ?, ?, 'Pending', ?, ?, ?, ?, ?, 0, 0, 0, ?, NULL, 'PendingMeter')`,
      [c.tenant_id, c.room_id, returnDate, returnDate, text(input.reason, 1000), promptpayTarget,
        text(input.promptpayName, 200) || c.tenant_name || null, text(input.bankName, 100), c.id, Number(c.deposit_amount || 0),
        check.early ? 0 : 1]
    )).rows.insertId);
    const settlementId = Number((await client.query(
      `INSERT INTO move_out_settlements (request_id, contract_id, tenant_id, room_id, state, notice_at, notice_by, planned_return_date)
       VALUES (?, ?, ?, ?, 'Notified', ?, ?, ?)`,
      [requestId, c.id, c.tenant_id, c.room_id, now, user.id, returnDate]
    )).rows.insertId);

    const warnings: string[] = [];
    if (!check.notice) warnings.push(`แจ้งล่วงหน้า ${check.noticeDays} วัน (กติกาหอคือแจ้งล่วงหน้าอย่างน้อย ${NOTICE_DAYS} วัน)`);
    if (check.early) {
      warnings.push(check.refundable
        ? 'ย้ายออกก่อนครบสัญญา: จะได้รับเงินประกันคืนเมื่อไม่มียอดค้างชำระทั้งวันแจ้งและวันคืนห้อง (สคบ. ข้อ 13)'
        : 'ย้ายออกก่อนครบสัญญา และไม่เข้าเงื่อนไข สคบ. ข้อ 13 ครบทั้ง 3 ข้อ — เงินประกันจะถูกยึดหลังหักยอดค้าง');
    }
    return { requestId, settlementId, tenantUserId: (c.tenant_user_id as number) || null, roomId: Number(c.room_id), clause13: check, warnings };
  });
}

/** Withdraw a notice before the room is returned: the tenant themselves, or owner/manager. */
export function cancelMoveOut(settlementId: number, user: Actor, now: Date) {
  return run(async (client) => {
    const s = await lockSettlement(client, settlementId);
    if (!isStaff(user)) {
      const ids = await tenantIdsOf(client, user);
      if (!ids.includes(Number(s.tenant_id))) refuse('not_found');
    }
    if (s.state !== 'Notified') refuse('invalid_state', 'ยกเลิกได้เฉพาะก่อนบันทึกการคืนห้อง');
    await client.query("UPDATE move_out_settlements SET state = 'Cancelled', cancelled_at = ?, cancelled_by = ? WHERE id = ?", [now, user.id, s.id]);
    // The request row is removed as before (its status values are not known to allow 'Cancelled')
    await client.query("DELETE FROM move_out_requests WHERE id = ? AND status = 'Pending'", [s.request_id]);
    return { settlementId: Number(s.id) };
  });
}

// ── Room return and final bill ────────────────────────────────────────────────────────

export interface ReturnInput {
  returnDate: unknown;
  finalMeter: unknown;
  /** only when the room has no meter reading and no start meter */
  prevMeter?: unknown;
  /** date the written notice was received on paper, when earlier than the notice in the system */
  paperNoticeDate?: unknown;
}

const meterValue = (v: unknown) => {
  if (v === null || v === undefined || String(v).trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? round2(n) : null;
};

/**
 * Owner/manager records the room return. The contract ends (Ended), the room is released unless another contract holds
 * it, and the final bill is issued for the return month: full rent + electricity + water + common fee when that month
 * has no monthly bill yet; only the electricity since the latest reading when it has one. No daily rent.
 */
export function recordReturn(settlementId: number, input: ReturnInput, by: Actor, now: Date) {
  if (!by || !isStaff(by)) return deny<never>('forbidden');
  return run(async (client) => {
    const s = await lockSettlement(client, settlementId);
    if (s.state !== 'Notified') refuse('invalid_state');
    const c = await lockContractRow(client, s.contract_id);
    if (!c || c.status !== 'Active') refuse('invalid_state', 'สัญญานี้ไม่ได้อยู่ในสถานะใช้งาน');

    const today = bangkokDate(now);
    const startDate = ymdOf(s.start_date) as string;
    const endDate = ymdOf(s.end_date) as string;
    if (!isYmd(input.returnDate) || input.returnDate > today || input.returnDate < startDate) {
      refuse('bad_date', 'วันคืนห้องต้องไม่เกินวันนี้ และไม่ก่อนวันเริ่มสัญญา');
    }
    const returnDate = input.returnDate;
    const noticeDate = bangkokDate(s.notice_at);
    let paperNoticeDate: string | null = null;
    if (input.paperNoticeDate !== undefined && input.paperNoticeDate !== null && input.paperNoticeDate !== '') {
      if (!isYmd(input.paperNoticeDate) || input.paperNoticeDate > returnDate) refuse('bad_date', 'วันที่ได้รับหนังสือแจ้งย้ายออกไม่ถูกต้อง');
      paperNoticeDate = input.paperNoticeDate;
    }

    const finalMeter = meterValue(input.finalMeter);
    if (finalMeter === null) refuse('meter_required');
    const latest = (await client.query(
      "SELECT current_reading FROM meter_readings WHERE room_id = ? AND type IN ('Electricity', 'Electric') AND current_reading IS NOT NULL ORDER BY billing_cycle DESC, id DESC LIMIT 1",
      [s.room_id]
    )).rows[0];
    let prevMeter = latest ? round2(Number(latest.current_reading)) : meterValue(s.start_meter_reading);
    if (prevMeter === null) {
      prevMeter = meterValue(input.prevMeter);
      if (prevMeter === null) refuse('prev_meter_required');
    }
    if (finalMeter < prevMeter) refuse('meter_lower', `${MESSAGES.meter_lower} (${prevMeter})`);
    const units = round2(finalMeter - prevMeter);

    // What of the return month is already billed: a monthly bill of that cycle, or the move-in bill (first month)
    const cycle = returnDate.slice(0, 7);
    const monthly = (await client.query(
      `SELECT id FROM bills WHERE tenant_id = ? AND billing_cycle = ? AND COALESCE(bill_type, 'monthly') = 'monthly'
         AND COALESCE(is_first_bill, 0) = 0 AND LOWER(status) NOT IN ('cancelled', 'canceled') LIMIT 1`,
      [s.tenant_id, cycle]
    )).rows[0];
    const monthBilled = !!monthly || startDate.slice(0, 7) === cycle;

    const rates = ratesForRoom(await getRates(getDb()), s.room_number);
    const priced = monthBilled
      ? { ...calcUtility({ unitsUsed: units, occupants: 1, rates }), roomAmount: 0, waterAmount: 0, commonFee: 0 }
      : calcMonthlyBill({ roomPrice: Number(s.room_price || 0), unitsUsed: units, occupants: Number(s.occupants || 1), rates });
    const amount = round2(priced.roomAmount + priced.electricAmount + priced.waterAmount + priced.commonFee);

    let finalBillId: number | null = null;
    if (amount > 0) {
      const title = monthBilled
        ? `บิลสุดท้ายก่อนย้ายออก ห้อง ${s.room_number} (ค่าไฟ ${units} หน่วย ถึงวันคืนห้อง ${returnDate})`
        : `บิลสุดท้ายก่อนย้ายออก ห้อง ${s.room_number} รอบ ${cycle} (ค่าเช่า + ค่าไฟถึงวันคืนห้อง + ค่าน้ำ + ส่วนกลาง)`;
      finalBillId = Number((await client.query(
        `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
           common_fee, billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified, sent_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'Unpaid', 0, 'move_out', 0, ?, ?)`,
        [s.tenant_id, s.dorm_id, s.room_number, title, amount, priced.roomAmount, priced.waterAmount, priced.electricAmount,
          units, priced.commonFee, cycle, returnDate, now, now]
      )).rows.insertId);
      await client.query(
        "INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by, changed_at) VALUES (?, NULL, 'Unpaid', 'บิลสุดท้ายก่อนย้ายออก', ?, ?)",
        [finalBillId, by.id, now]
      );
    }
    // The final reading becomes the room's latest reading (the next tenant starts from it)
    await client.query(
      `INSERT INTO meter_readings (dorm_id, room_id, type, billing_cycle, previous_reading, current_reading, units_used, created_at)
       VALUES (?, ?, 'Electricity', ?, ?, ?, ?, ?)`,
      [s.dorm_id, s.room_id, cycle, prevMeter, finalMeter, units, now]
    );

    // Clause 13 (early move-out only matters for the deposit); notice in writing = the earlier of system / paper
    const effectiveNotice = paperNoticeDate && paperNoticeDate < noticeDate ? paperNoticeDate : noticeDate;
    const arrearsAtNotice = await overdueOn(client, s.tenant_id, effectiveNotice, finalBillId ? [finalBillId] : []);
    const arrearsAtReturn = await overdueOn(client, s.tenant_id, returnDate, finalBillId ? [finalBillId] : []);
    const check = clause13({ startDate, endDate, returnDate, noticeDate: effectiveNotice, noArrears: arrearsAtNotice.length === 0 && arrearsAtReturn.length === 0 });

    await endContract(client, s.contract_id, s.room_id, s.tenant_id, returnDate);
    await client.query(
      `UPDATE move_out_settlements SET state = 'Returned', return_date = ?, returned_at = ?, returned_by = ?, paper_notice_date = ?,
         prev_meter = ?, final_meter = ?, final_bill_id = ?, early = ?, c13_half = ?, c13_notice = ?, c13_no_arrears = ?, refundable = ?
       WHERE id = ?`,
      [returnDate, now, by.id, paperNoticeDate, prevMeter, finalMeter, finalBillId, check.early ? 1 : 0, check.half ? 1 : 0,
        check.notice ? 1 : 0, check.noArrears ? 1 : 0, check.refundable ? 1 : 0, s.id]
    );
    // Columns of the older move-out pages
    await client.query(
      `UPDATE move_out_requests SET status = 'Approved', settlement_status = 'PendingPayment', move_out_type = ?, move_out_date = ?,
         electric_prev_unit = ?, electric_new_unit = ?, electric_units_used = ?, electric_amount = ?, water_amount = ?, common_fee = ?,
         room_rent_amount = ?, is_contract_completed = ?
       WHERE id = ?`,
      [check.early ? 'Early' : 'Normal', returnDate, prevMeter, finalMeter, units, priced.electricAmount, priced.waterAmount,
        priced.commonFee, priced.roomAmount, check.early ? 0 : 1, s.request_id]
    );
    return { finalBillId, finalAmount: amount, monthBilled, clause13: check, tenantUserId: (s.tenant_user_id as number) || null };
  });
}

// ── Damages (from the move-out inspection) ────────────────────────────────────────────

export interface DamageItem { amount: unknown; reason: unknown }

type DamageEntry = { amount: number; reason: string; job_id?: number };

const parseDamageItems = (value: unknown): DamageEntry[] => {
  try {
    const list = typeof value === 'string' && value ? JSON.parse(value) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

/**
 * Owner sets the damage charges (amount + reason each); one damage bill, replaced until the settlement is done.
 * Items that come from an approved repair / cleaning job (job_id, lib/maintenance.ts) are kept as they are.
 */
export function setDamages(settlementId: number, items: unknown, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden', 'ค่าเสียหายต้องให้เจ้าของหอเป็นผู้ระบุ');
  return run(async (client) => {
    if (!Array.isArray(items) || items.length > MAX_DAMAGE_ITEMS) refuse('bad_damage');
    const clean = (items as DamageItem[]).filter((it: any) => !it?.job_id).map((it) => {
      const amount = Number(it?.amount);
      const reason = text(it?.reason, 200);
      const wholeSatang = Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000 || !wholeSatang || !reason) refuse('bad_damage');
      return { amount: round2(amount), reason };
    });
    const s = await lockSettlement(client, settlementId);
    if (s.state !== 'Returned') refuse('invalid_state', 'ระบุค่าเสียหายได้หลังบันทึกการคืนห้อง และก่อนหักเงินประกัน');
    const fromJobs = parseDamageItems(s.damage_items).filter((it) => it.job_id);
    return writeDamages(client, s, [...fromJobs, ...clean], by, now);
  });
}

/**
 * The approved charge of a repair / cleaning job of this move-out becomes one of its damage items (replacing an earlier
 * one of the same job), inside the caller's transaction. Only while the room is returned and the deposit not settled.
 */
export async function addJobDamage(client: Client, settlementId: number, item: { jobId: number; amount: number; reason: string }, by: Actor, now: Date) {
  const s = await lockSettlement(client, settlementId);
  if (s.state !== 'Returned') refuse('invalid_state');
  const others = parseDamageItems(s.damage_items).filter((it) => Number(it.job_id) !== item.jobId);
  if (others.length >= MAX_DAMAGE_ITEMS) refuse('bad_damage');
  const entry: DamageEntry = { amount: round2(item.amount), reason: String(item.reason).slice(0, 200), job_id: item.jobId };
  return writeDamages(client, s, [...others, entry], by, now);
}

async function writeDamages(client: Client, s: any, items: DamageEntry[], by: Actor, now: Date) {
  const total = round2(items.reduce((sum, it) => sum + it.amount, 0));
  const title = `ค่าเสียหายตรวจห้องตอนย้ายออก ห้อง ${s.room_number}: ${items.map((it) => `${it.reason} ฿${formatBaht(it.amount)}`).join(', ')}`.slice(0, 250);
  let damageBillId: number | null = s.damage_bill_id ? Number(s.damage_bill_id) : null;
  if (damageBillId) {
    const bill = (await client.query('SELECT id, status FROM bills WHERE id = ? FOR UPDATE', [damageBillId])).rows[0];
    if (bill && String(bill.status).toLowerCase() !== 'unpaid') refuse('invalid_state', 'บิลค่าเสียหายมีการชำระแล้ว แก้ไขไม่ได้');
    if (items.length === 0) {
      await client.query("UPDATE bills SET status = 'Cancelled' WHERE id = ?", [damageBillId]);
      await client.query(
        "INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by, changed_at) VALUES (?, 'Unpaid', 'Cancelled', 'ไม่มีค่าเสียหาย', ?, ?)",
        [damageBillId, by.id, now]
      );
      damageBillId = null;
    } else {
      await client.query('UPDATE bills SET amount = ?, title = ? WHERE id = ?', [total, title, damageBillId]);
    }
  } else if (items.length > 0) {
    damageBillId = Number((await client.query(
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         common_fee, billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, 'Unpaid', 0, 'move_out_damage', 0, ?, ?)`,
      [s.tenant_id, s.dorm_id, s.room_number, title, total, String(bangkokDate(s.return_date)).slice(0, 7), bangkokDate(s.return_date), now, now]
    )).rows.insertId);
    await client.query(
      "INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by, changed_at) VALUES (?, NULL, 'Unpaid', 'ค่าเสียหายตอนย้ายออก', ?, ?)",
      [damageBillId, by.id, now]
    );
  }
  await client.query('UPDATE move_out_settlements SET damage_bill_id = ?, damage_items = ? WHERE id = ?', [damageBillId, JSON.stringify(items), s.id]);
  await client.query('UPDATE move_out_requests SET extra_damage_amount = ?, extra_damage_note = ? WHERE id = ?',
    [total, items.map((it) => it.reason).join(', ') || null, s.request_id]);
  return { damageBillId, damageTotal: total };
}

// ── Deposit of an older contract ─────────────────────────────────────────────────────

export interface ConfirmDepositInput {
  amount: unknown;
  /** 'income': booked as Income/Deposit before deposits were a Liability; 'outside': never recorded in the system */
  recordedAs: unknown;
  note: unknown;
}

/** Owner confirms by hand how much deposit an older contract holds (never guessed). */
export function confirmLegacyDeposit(settlementId: number, input: ConfirmDepositInput, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden', 'การยืนยันยอดเงินประกันต้องให้เจ้าของหอเป็นผู้บันทึก');
  return run(async (client) => {
    const s = await lockSettlement(client, settlementId);
    if (!['Notified', 'Returned'].includes(s.state)) refuse('invalid_state');
    const base = await depositBase(client, s.contract_id);
    if (base.kind !== 'legacy') refuse('invalid_state', 'ยอดเงินประกันของสัญญานี้มาจากระบบแล้ว ไม่ต้องยืนยันด้วยมือ');
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) refuse('bad_deposit');
    if (input.recordedAs !== 'income' && input.recordedAs !== 'outside') refuse('bad_deposit', 'กรุณาเลือกว่าเงินประกันนี้เคยบันทึกเป็นรายรับในระบบ หรือรับนอกระบบ');
    const note = text(input.note, 500);
    if (!note) refuse('note_required', 'กรุณาระบุที่มาของยอด (เช่น ใบเสร็จเลขที่ / สมุดบัญชี)');
    await client.query(
      'UPDATE move_out_settlements SET deposit_source = ?, deposit_amount = ?, deposit_note = ?, deposit_confirmed_by = ?, deposit_confirmed_at = ? WHERE id = ?',
      [input.recordedAs === 'income' ? 'legacy_income' : 'legacy_outside', round2(amount), note, by.id, now, s.id]
    );
    return { amount: round2(amount) };
  });
}

// ── Settlement ───────────────────────────────────────────────────────────────────────

/** Late fees of bills settled at move-out run up to the room return date (until then: now). */
function lateFeeDate(s: { return_date?: unknown }, now: Date): Date {
  const returnDate = ymdOf(s.return_date);
  if (!returnDate) return now;
  const end = new Date(`${returnDate}T23:59:59+07:00`);
  return end < now ? end : now;
}

/** Bills still owed by the tenant, late fees counted up to `feeAsOf`. */
async function outstandingBills(client: Client, tenantId: number, feeAsOf: Date, lock: boolean) {
  const bills = (await client.query(
    `SELECT id, title, amount, status, bill_type, due_date, billing_cycle FROM bills
     WHERE tenant_id = ? AND LOWER(status) IN ('unpaid', 'overdue', 'pending', 'partial')
     ORDER BY CASE WHEN bill_type IN (${MOVE_OUT_BILL_TYPES.map(() => '?').join(', ')}) THEN 1 ELSE 0 END, due_date, id${lock ? ' FOR UPDATE' : ''}`,
    [tenantId, ...MOVE_OUT_BILL_TYPES]
  )).rows as any[];
  if (bills.length === 0) return [];
  const rates = await getRates(getDb());
  const paid = (await client.query(
    'SELECT bill_id, COALESCE(SUM(amount), 0) AS total FROM bill_payments WHERE bill_id IN (?) AND voided_at IS NULL GROUP BY bill_id',
    [bills.map((b) => b.id)]
  )).rows as any[];
  return bills.map((b) => {
    const o = outstandingFor(b, Number(paid.find((p) => Number(p.bill_id) === Number(b.id))?.total || 0), feeAsOf, rates);
    return { id: Number(b.id), title: b.title, bill_type: b.bill_type, status: b.status, due_date: b.due_date, outstanding: o.outstanding, late_fee: o.lateFee };
  }).filter((b) => b.outstanding > 0);
}

/** Deposit to settle from: system Liability, contract amount (outside), or the owner-confirmed amount (older contract). */
async function depositFor(client: Client, s: any): Promise<{ source: DepositSource | null; amount: number | null; opening: number }> {
  const base = await depositBase(client, s.contract_id);
  if (base.kind === 'system') return { source: 'system', amount: await liabilityHeld(client, base.billIds, s.id), opening: 0 };
  if (base.kind === 'outside') return { source: 'outside', amount: base.amount, opening: base.amount ?? 0 };
  if (!s.deposit_source) return { source: null, amount: null, opening: 0 };
  return { source: s.deposit_source, amount: round2(Number(s.deposit_amount || 0)), opening: round2(Number(s.deposit_amount || 0)) };
}

/**
 * Owner settles the deposit: outstanding bills (oldest first, final and damage bills last) are paid from it through
 * recordPayment (deposit_offset) with a matching Liability decrease; the rest is forfeited (early, clause 13 not met)
 * or left to refund. With nothing to refund the move-out is closed at once.
 */
export function settleMoveOut(settlementId: number, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden', 'การหักและคืนเงินประกันต้องให้เจ้าของหอเป็นผู้บันทึก');
  return run(async (client) => {
    const s = await lockSettlement(client, settlementId);
    if (s.state !== 'Returned') refuse('invalid_state');
    const drafts = (await client.query("SELECT id FROM bills WHERE tenant_id = ? AND LOWER(status) = 'draft' LIMIT 1", [s.tenant_id])).rows[0];
    if (drafts) refuse('drafts');
    // The move-in bill holds part of the deposit: settling while it is unpaid would leave the deposit wrong
    const chainBills = (await contractChain(client, s.contract_id)).map((c) => c.move_in_bill_id).filter(Boolean).map(Number);
    if (chainBills.length > 0) {
      const unpaidMoveIn = (await client.query(
        "SELECT id FROM bills WHERE id IN (?) AND LOWER(status) NOT IN ('paid', 'cancelled', 'canceled') LIMIT 1", [chainBills]
      )).rows[0];
      if (unpaidMoveIn) refuse('move_in_unpaid');
    }

    const deposit = await depositFor(client, s);
    if (deposit.source === null) refuse('deposit_unconfirmed');
    const base = await depositBase(client, s.contract_id);
    const room = `ห้อง ${s.room_number} (ย้ายออก #${s.id})`;

    // Opening: a deposit not yet in Liability is brought in first, so every case settles the same way
    if (deposit.opening > 0) {
      if (deposit.source === 'legacy_income') {
        // Booked as income before deposits were a Liability: moved, not counted as income again (deposit_reclass)
        await entry(client, s, 'Income', RECLASS_CATEGORY, -deposit.opening, `ปรับประเภทเงินประกันแบบเดิม ${room}: ${s.deposit_note || ''}`, 'settlement_opening', now);
      }
      await entry(client, s, 'Liability', 'Deposit', deposit.opening,
        deposit.source === 'outside' ? `เงินประกันรับนอกระบบ (ตามสัญญา) ${room}` : `เงินประกันแบบเดิม (ยืนยันโดยเจ้าของหอ) ${room}: ${s.deposit_note || ''}`,
        'settlement_opening', now);
    }

    let remaining = await liabilityHeld(client, base.billIds, s.id);
    if (remaining < 0) refuse('bad_deposit', `ยอดเงินประกันคงเหลือติดลบ (฿${formatBaht(remaining)}) — ตรวจสอบบัญชีก่อน`);

    let offsetTotal = 0;
    // Late fees stop at the room return date, however late the owner settles (payment time is still now)
    const feeAsOf = lateFeeDate(s, now);
    for (const bill of await outstandingBills(client, s.tenant_id, feeAsOf, true)) {
      const pay = round2(Math.min(bill.outstanding, remaining));
      if (pay <= 0) break;
      const paid = await recordPaymentInTransaction(client, bill.id, {
        amount: pay, method: 'deposit_offset', paidAt: now, lateFeeAsOf: feeAsOf, recordedBy: by.id, allowPartial: true, note: `หักจากเงินประกัน ${room}`,
      });
      if (!paid.ok) refuse('offset_failed', `${MESSAGES.offset_failed} (บิล #${bill.id}: ${paid.reason})`);
      await entry(client, s, 'Liability', 'Deposit Offset', -pay, `หักเงินประกันชำระบิล #${bill.id} ${room}`, 'settlement_offset', now);
      remaining = round2(remaining - pay);
      offsetTotal = round2(offsetTotal + pay);
    }

    let forfeit = 0;
    let refund = 0;
    if (Number(s.refundable) !== 1) {
      forfeit = remaining;
      if (forfeit > 0) {
        await entry(client, s, 'Liability', FORFEIT_CATEGORY, -forfeit, `ริบเงินประกัน ${room} (ย้ายออกก่อนครบสัญญา ไม่เข้า สคบ. ข้อ 13)`, 'settlement_forfeit', now);
        await entry(client, s, 'Income', FORFEIT_CATEGORY, forfeit, `ริบเงินประกัน ${room} (ย้ายออกก่อนครบสัญญา ไม่เข้า สคบ. ข้อ 13)`, 'settlement_forfeit', now);
      }
    } else {
      refund = remaining;
    }
    const returnDate = bangkokDate(s.return_date);
    const dueDate = refund > 0 ? refundDueDate(returnDate, offsetTotal > 0) : null;
    await client.query(
      `UPDATE move_out_settlements SET state = 'Settled', deposit_source = ?, deposit_amount = ?, offset_total = ?, forfeit_total = ?,
         refund_amount = ?, refund_due_date = ?, settled_at = ?, settled_by = ? WHERE id = ?`,
      [deposit.source, deposit.source === 'system' ? deposit.amount : (s.deposit_amount ?? deposit.amount), offsetTotal, forfeit, refund, dueDate, now, by.id, s.id]
    );
    await client.query(
      "UPDATE move_out_requests SET deposit_amount = ?, total_expenses = ?, net_refund_amount = ?, penalty_amount = ?, settlement_type = ? WHERE id = ?",
      [deposit.amount, offsetTotal, refund, forfeit, refund > 0 ? 'OwnerRefund' : 'ZeroBalance', s.request_id]
    );

    const left = await outstandingBills(client, s.tenant_id, feeAsOf, false);
    if (refund === 0) await closeLocked(client, { ...s, state: 'Settled' }, base.billIds, by, now);
    return {
      deposit: deposit.amount ?? 0, offsetTotal, forfeit, refund, refundDueDate: dueDate, closed: refund === 0,
      tenantStillOwes: round2(left.reduce((sum, b) => sum + b.outstanding, 0)), tenantUserId: (s.tenant_user_id as number) || null,
    };
  });
}

/** Owner records the refund transfer (slip required), then the move-out is closed. */
export async function recordRefund(settlementId: number, input: { file: unknown }, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return { ok: false as const, reason: 'forbidden' as const, message: 'การคืนเงินประกันต้องให้เจ้าของหอเป็นผู้บันทึก' };
  const upload = parseRefundUpload(input?.file);
  if (!upload.ok) return { ok: false as const, reason: 'bad_file' as const, message: upload.message };
  const stored = saveRefundFile(upload);
  const result = await run(async (client) => {
    const s = await lockSettlement(client, settlementId);
    if (s.state !== 'Settled' || !(Number(s.refund_amount) > 0)) refuse('invalid_state');
    const base = await depositBase(client, s.contract_id);
    const refund = round2(Number(s.refund_amount));
    await entry(client, s, 'Liability', 'Deposit Refund', -refund, `คืนเงินประกัน ห้อง ${s.room_number} (ย้ายออก #${s.id})`, 'settlement_refund', now);
    await client.query('UPDATE move_out_settlements SET refund_file = ?, refunded_at = ?, refunded_by = ? WHERE id = ?', [stored, now, by.id, s.id]);
    await client.query('UPDATE move_out_requests SET refunded_at = ? WHERE id = ?', [now, s.request_id]);
    await closeLocked(client, s, base.billIds, by, now);
    return { refund, tenantUserId: (s.tenant_user_id as number) || null };
  });
  if (!result.ok) deleteRefundFile(stored);
  return result;
}

/** Close: the contract's deposit Liability must be 0; the account goes back to guest unless it holds another room. */
async function closeLocked(client: Client, s: any, billIds: number[], by: Actor, now: Date) {
  const held = await liabilityHeld(client, billIds, s.id);
  if (held !== 0) refuse('liability_not_zero', `${MESSAGES.liability_not_zero} (คงเหลือ ฿${formatBaht(held)})`);
  await client.query("UPDATE move_out_settlements SET state = 'Closed', closed_at = ?, closed_by = ? WHERE id = ?", [now, by.id, s.id]);
  await client.query("UPDATE move_out_requests SET status = 'Completed', settlement_status = 'Completed' WHERE id = ?", [s.request_id]);
  await downgradeRole(client, s.tenant_user_id ? Number(s.tenant_user_id) : null, s.contract_id);
}

// ── Older move-out requests (before commit 12) ─────────────────────────────────────────

/**
 * Owner closes a move-out request from before commit 12 by hand: the contract ends, the room is released when nothing
 * else holds it, the account goes back to guest. No money is moved here (bills and the deposit are handled by hand).
 */
export function closeLegacyRequest(requestId: number, input: { note: unknown; returnDate?: unknown }, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden');
  const note = text(input?.note, 500);
  if (!note) return deny<never>('note_required');
  return run(async (client) => {
    const r = (await client.query(
      `SELECT mor.*, t.user_id AS tenant_user_id FROM move_out_requests mor LEFT JOIN tenants t ON t.id = mor.tenant_id
       WHERE mor.id = ? FOR UPDATE`, [requestId]
    )).rows[0];
    if (!r) refuse('not_found');
    if ((await client.query('SELECT id FROM move_out_settlements WHERE request_id = ?', [requestId])).rows[0]) refuse('invalid_state', 'คำขอนี้เป็นแบบใหม่ ใช้ขั้นตอนปกติ');
    if (!['Pending', 'Approved'].includes(r.status)) refuse('invalid_state', 'คำขอนี้ปิดไปแล้ว');
    const returnDate = isYmd(input?.returnDate) ? input.returnDate : bangkokDate(r.desired_date || r.move_out_date || now);

    const contractId = r.contract_id ? Number(r.contract_id) : null;
    if (contractId) {
      const c = await lockContractRow(client, contractId);
      if (c && ['Active', 'MoveOutPending'].includes(c.status)) await endContract(client, contractId, Number(c.room_id), Number(r.tenant_id), returnDate);
    }
    await client.query(
      "UPDATE move_out_requests SET status = 'Completed', settlement_status = 'Completed', inspection_notes = ? WHERE id = ?",
      [`ปิดด้วยมือ (คำขอแบบเดิม) ${bangkokDate(now)}: ${note}`, requestId]
    );
    await downgradeRole(client, r.tenant_user_id ? Number(r.tenant_user_id) : null, contractId || 0);
    return { requestId };
  });
}

// ── Reading ──────────────────────────────────────────────────────────────────────────

export interface SettlementView {
  id: number;
  request_id: number;
  contract_id: number;
  state: MoveOutState;
  room_number: string;
  tenant_name: string | null;
  notice_date: string;
  paper_notice_date: string | null;
  planned_return_date: string;
  return_date: string | null;
  notice_days: number;
  contract_start: string;
  contract_end: string;
  final_bill_id: number | null;
  damage_items: { amount: number; reason: string; job_id?: number }[];
  /** repair / cleaning jobs of this move-out (lib/maintenance.ts) with the charge proposed and decided */
  jobs: SettlementJob[];
  /** The bills this move-out issued, as recorded (for the history / receipt screens; nothing recalculated) */
  final_bill: null | { id: number; amount: number; room_amount: number; electric_amount: number; electric_units: number; water_amount: number; common_fee: number };
  damage_bill: null | { id: number; amount: number };
  prev_meter: number | null;
  final_meter: number | null;
  clause13: Clause13 | null;
  outstanding: { id: number; title: string; bill_type: string; outstanding: number; late_fee: number }[];
  outstanding_total: number;
  /** null for managers (they do not see the deposit, forfeits or refunds) */
  money: null | {
    deposit_source: DepositSource | null;
    deposit_needs_confirmation: boolean;
    /** starting value for the owner's confirmation: the deposit written on the contract (never applied by itself) */
    suggested_deposit: number | null;
    deposit: number | null;
    offset: number;
    forfeit: number;
    refund: number;
    refund_due_date: string | null;
    refund_due_status: RefundDueStatus | null;
    refunded_at: string | null;
    has_refund_file: boolean;
    projected: boolean;
  };
}

function viewOf(s: any, base: Awaited<ReturnType<typeof depositBase>>, held: number, outstanding: any[], viewer: Actor, now: Date): SettlementView {
  const startDate = ymdOf(s.start_date) as string;
  const endDate = ymdOf(s.end_date) as string;
  const noticeDate = bangkokDate(s.notice_at);
  const returnDate = ymdOf(s.return_date);
  const effectiveNotice = s.paper_notice_date && ymdOf(s.paper_notice_date)! < noticeDate ? ymdOf(s.paper_notice_date)! : noticeDate;
  const check: Clause13 | null = returnDate
    ? {
        ...clause13({ startDate, endDate, returnDate, noticeDate: effectiveNotice, noArrears: Number(s.c13_no_arrears) === 1 }),
        early: Number(s.early) === 1, half: Number(s.c13_half) === 1, notice: Number(s.c13_notice) === 1,
        noArrears: Number(s.c13_no_arrears) === 1, refundable: Number(s.refundable) === 1,
      }
    : null;
  const outstandingTotal = round2(outstanding.reduce((sum, b) => sum + b.outstanding, 0));

  let money: SettlementView['money'] = null;
  if (viewer.role !== 'manager') {
    const settled = ['Settled', 'Closed'].includes(s.state);
    let deposit: number | null;
    let source: DepositSource | null;
    if (settled) {
      deposit = s.deposit_amount !== null ? round2(Number(s.deposit_amount)) : null;
      source = s.deposit_source;
    } else if (base.kind === 'system') {
      deposit = held; source = 'system';
    } else if (base.kind === 'outside') {
      deposit = base.amount; source = 'outside';
    } else {
      deposit = s.deposit_source ? round2(Number(s.deposit_amount || 0)) : null; source = s.deposit_source || null;
    }
    const projectedOffset = deposit === null ? 0 : round2(Math.min(deposit, outstandingTotal));
    const rest = deposit === null ? 0 : round2(deposit - projectedOffset);
    const refundable = check ? check.refundable : true;
    const refund = settled ? round2(Number(s.refund_amount || 0)) : refundable ? rest : 0;
    const dueDate = settled ? ymdOf(s.refund_due_date) : returnDate && refund > 0 ? refundDueDate(returnDate, projectedOffset > 0) : null;
    money = {
      deposit_source: source,
      deposit_needs_confirmation: base.kind === 'legacy' && !s.deposit_source,
      suggested_deposit: base.kind === 'legacy' && s.contract_deposit !== null && s.contract_deposit !== undefined ? round2(Number(s.contract_deposit)) : null,
      deposit,
      offset: settled ? round2(Number(s.offset_total || 0)) : projectedOffset,
      forfeit: settled ? round2(Number(s.forfeit_total || 0)) : refundable ? 0 : rest,
      refund,
      refund_due_date: dueDate,
      refund_due_status: dueDate && !s.refunded_at && refund > 0 ? refundDueStatus(dueDate, now) : null,
      refunded_at: s.refunded_at ? String(s.refunded_at) : null,
      has_refund_file: !!s.refund_file,
      projected: !settled,
    };
  }
  let damageItems: { amount: number; reason: string }[] = [];
  try { damageItems = s.damage_items ? JSON.parse(s.damage_items) : []; } catch { damageItems = []; }

  return {
    id: Number(s.id), request_id: Number(s.request_id), contract_id: Number(s.contract_id), state: s.state,
    room_number: s.room_number, tenant_name: s.tenant_name || null,
    notice_date: noticeDate, paper_notice_date: ymdOf(s.paper_notice_date), planned_return_date: ymdOf(s.planned_return_date) as string,
    return_date: returnDate, notice_days: daysBetween(effectiveNotice, returnDate || (ymdOf(s.planned_return_date) as string)),
    contract_start: startDate, contract_end: endDate,
    final_bill_id: s.final_bill_id ? Number(s.final_bill_id) : null,
    damage_items: damageItems, jobs: [], final_bill: null, damage_bill: null,
    prev_meter: s.prev_meter === null || s.prev_meter === undefined ? null : Number(s.prev_meter),
    final_meter: s.final_meter === null || s.final_meter === undefined ? null : Number(s.final_meter),
    clause13: check,
    outstanding: outstanding.map((b) => ({ id: b.id, title: b.title, bill_type: b.bill_type, outstanding: b.outstanding, late_fee: b.late_fee })),
    outstanding_total: outstandingTotal, money,
  };
}

/** One settlement as seen by the viewer (owner, manager without money, or the contract's own tenant). */
export async function getSettlement(settlementId: number, viewer: Actor, now: Date): Promise<SettlementView | null> {
  return withRetry(async (client) => {
    const s = (await client.query(
      `SELECT s.*, c.start_date, c.end_date, c.deposit_amount AS contract_deposit, r.room_number, t.name AS tenant_name
       FROM move_out_settlements s JOIN contracts c ON c.id = s.contract_id JOIN rooms r ON r.id = s.room_id
       LEFT JOIN tenants t ON t.id = s.tenant_id WHERE s.id = ?`, [settlementId]
    )).rows[0];
    if (!s) return null;
    if (!isStaff(viewer)) {
      const ids = await tenantIdsOf(client, viewer);
      if (!ids.includes(Number(s.tenant_id))) return null;
    }
    const base = await depositBase(client, s.contract_id);
    const held = base.kind === 'system' ? await liabilityHeld(client, base.billIds, s.id) : 0;
    // Before settling: as the settlement will count them (late fees up to the return date). After: what is owed now.
    const outstanding = s.state === 'Cancelled' ? [] : await outstandingBills(client, s.tenant_id, s.state === 'Returned' ? lateFeeDate(s, now) : now, false);
    const billOf = async (id: unknown) => (id ? (await client.query(
      'SELECT id, amount, room_amount, electric_amount, electric_units, water_amount, common_fee FROM bills WHERE id = ?', [Number(id)]
    )).rows[0] : null);
    const fb = await billOf(s.final_bill_id);
    const db = await billOf(s.damage_bill_id);
    return {
      ...viewOf(s, base, held, outstanding, viewer, now),
      jobs: await settlementJobs(client, Number(s.id)),
      final_bill: fb ? {
        id: Number(fb.id), amount: Number(fb.amount), room_amount: Number(fb.room_amount || 0), electric_amount: Number(fb.electric_amount || 0),
        electric_units: Number(fb.electric_units || 0), water_amount: Number(fb.water_amount || 0), common_fee: Number(fb.common_fee || 0),
      } : null,
      damage_bill: db ? { id: Number(db.id), amount: Number(db.amount) } : null,
    };
  });
}

export interface SettlementJob {
  id: number; kind: string | null; issue_type: string | null; state: string | null;
  charge_proposed: number | null; charge_amount: number | null; charge_reason: string | null; charge_decided: boolean;
}

/** Jobs linked to a settlement; empty before migration 013 is run. */
async function settlementJobs(client: Client, settlementId: number): Promise<SettlementJob[]> {
  try {
    const rows = (await client.query(
      `SELECT id, kind, issue_type, state, charge_proposed, charge_amount, charge_reason, charge_decided_at
       FROM maintenance_requests WHERE move_out_settlement_id = ? ORDER BY id`, [settlementId]
    )).rows as any[];
    return rows.map((r) => ({
      id: Number(r.id), kind: r.kind, issue_type: r.issue_type, state: r.state,
      charge_proposed: r.charge_proposed === null ? null : Number(r.charge_proposed),
      charge_amount: r.charge_amount === null ? null : Number(r.charge_amount),
      charge_reason: r.charge_reason, charge_decided: !!r.charge_decided_at,
    }));
  } catch {
    return [];
  }
}

/** The tenant's latest settlement that is not cancelled (null when none). */
export async function tenantSettlement(user: Actor, now: Date): Promise<SettlementView | null> {
  const id = await withRetry(async (client) => {
    const ids = await tenantIdsOf(client, user);
    if (ids.length === 0) return null;
    const row = (await client.query(
      "SELECT id FROM move_out_settlements WHERE tenant_id IN (?) AND state <> 'Cancelled' ORDER BY id DESC LIMIT 1", [ids]
    )).rows[0];
    return row ? Number(row.id) : null;
  });
  return id ? getSettlement(id, user, now) : null;
}

/** Owner/manager list: every move-out request, newest first; older ones are marked legacy (handled by hand). */
export async function listMoveOuts(viewer: Actor, now: Date) {
  const sql = getDb();
  const rows = await sql`
    SELECT mor.id AS request_id, mor.status AS request_status, mor.desired_date, mor.reason, mor.promptpay_target, mor.promptpay_name,
      mor.bank_name, mor.contract_id, mor.tenant_id, s.id AS settlement_id, s.state,
      COALESCE(r.room_number, '-') AS room_number, t.name AS tenant_name, t.phone AS tenant_phone, c.status AS contract_status
    FROM move_out_requests mor
    LEFT JOIN move_out_settlements s ON s.request_id = mor.id
    LEFT JOIN contracts c ON c.id = mor.contract_id
    LEFT JOIN rooms r ON r.id = COALESCE(s.room_id, mor.room_id, c.room_id)
    LEFT JOIN tenants t ON t.id = mor.tenant_id
    ORDER BY mor.id DESC
  `;
  const out = [];
  for (const row of rows as any[]) {
    const legacy = !row.settlement_id;
    out.push({
      ...row,
      legacy,
      legacy_open: legacy && ['Pending', 'Approved'].includes(row.request_status),
      settlement: legacy ? null : await getSettlement(Number(row.settlement_id), viewer, now),
    });
  }
  return out;
}

/** HTTP status for a refusal (for the API routes). */
export function refusalStatus(reason: MoveOutRefusal): number {
  if (reason === 'not_found') return 404;
  if (reason === 'forbidden') return 403;
  if (reason === 'already_requested' || reason === 'legacy_request' || reason === 'invalid_state' || reason === 'liability_not_zero') return 409;
  return 400;
}
