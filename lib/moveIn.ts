// Move-in: after the booking fee is paid, the owner/manager issues the move-in bill (first month of rent in full +
// the rest of the deposit, from the room's figures on the server) with the starting electricity meter. The contract
// takes effect (Active) only when both are done: the move-in bill is paid AND the signed paper contract is uploaded
// with its signing date. A move-in bill not paid by the contract start date cancels the contract (checked when read,
// no scheduler). Every function takes `now` from the app; MySQL NOW() is never used for these times.
// Contracts waiting for a move-in bill without move_in_bill_id are older ones: they are left for the owner to handle.

import { bangkokDate, capCheck, depositFor, moveInAmounts } from '@/lib/billing';
import { type Client } from '@/lib/bill-status';
import { Refused, contractMessage, signContractTx } from '@/lib/contracts';
import { releaseRoom, withRetry } from '@/lib/bookings';
import { forfeitBookingFee } from '@/lib/deposits';
import { deletePaper, isPaper, parsePaperUpload, savePaper } from '@/lib/contract-files';
import { formatBaht } from '@/lib/format';
import { parseOccupants, OCCUPANTS_MESSAGE } from '@/lib/occupants';

// Booking fee paid, contract and move-in bill not done yet
const BOOKING_PAID = ['PendingOwnerSignature', 'PendingContract'];
const WAITING = [...BOOKING_PAID, 'PendingFirstBill'];

export type MoveInRefusal = 'not_found' | 'not_paid_booking' | 'already_issued' | 'start_passed' | 'over_cap'
  | 'meter_required' | 'legacy' | 'invalid_status' | 'signed_date' | 'paper_locked' | 'bad_file' | 'bad_identity' | 'bad_occupants';
export type Missing = 'move_in_bill' | 'paper';

export type MoveInResult<T> = ({ ok: true } & T) | { ok: false; reason: MoveInRefusal; message: string };

class MoveInRefused extends Error {
  constructor(public reason: MoveInRefusal, public detail?: string) { super(reason); }
}
function refuse(reason: MoveInRefusal, detail?: string): never {
  throw new MoveInRefused(reason, detail);
}

const MESSAGES: Record<MoveInRefusal, string> = {
  not_found: 'ไม่พบข้อมูลสัญญาเช่า',
  not_paid_booking: 'ออกบิลเข้าอยู่ได้เฉพาะการจองที่ชำระค่าจองแล้ว',
  already_issued: 'สัญญานี้ออกบิลเข้าอยู่แล้ว',
  start_passed: 'เลยวันเริ่มสัญญาแล้ว — ออกบิลเข้าอยู่ไม่ได้ ใช้ปุ่มไม่มาตามนัด หรือให้ผู้จองจองใหม่',
  over_cap: 'เงินประกันรวมค่าเช่าล่วงหน้าเกิน 3 เท่าของค่าเช่า',
  meter_required: 'กรุณากรอกเลขมิเตอร์ไฟฟ้าเริ่มต้น (บังคับตอนทำสัญญา)',
  legacy: 'สัญญาแบบเดิม — จัดการด้วยมือ',
  invalid_status: 'สัญญานี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้',
  signed_date: 'กรุณาระบุวันที่เซ็นสัญญา (ไม่เกินวันนี้)',
  paper_locked: 'สัญญานี้มีผลแล้วและมีไฟล์สัญญาที่เซ็นแล้ว แก้ไขไม่ได้',
  bad_file: 'ไฟล์สัญญาไม่ถูกต้อง',
  bad_identity: 'ชื่อ-นามสกุลต้องไม่เกิน 255 ตัวอักษร และที่อยู่ต้องไม่เกิน 500 ตัวอักษร',
  bad_occupants: OCCUPANTS_MESSAGE,
};

const NAME_MAX = 255;
const ADDRESS_MAX = 500;

const MISSING_TEXT: Record<Missing, string> = {
  move_in_bill: 'ยังไม่ได้ชำระบิลเข้าอยู่',
  paper: 'ยังไม่ได้อัปโหลดสัญญาที่เซ็นแล้ว',
};

/** "ยังเปิดใช้สัญญาไม่ได้: ..." for what is still missing. */
export function missingMessage(missing: Missing[]) {
  return `ยังเปิดใช้สัญญาไม่ได้: ${missing.map((m) => MISSING_TEXT[m]).join(' / ')}`;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

async function run<T>(work: (client: Client) => Promise<T>): Promise<MoveInResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof MoveInRefused) return { ok: false, reason: error.reason, message: error.detail || MESSAGES[error.reason] };
    if (error instanceof Refused) return { ok: false, reason: 'invalid_status', message: contractMessage(error) };
    throw error;
  }
}

async function lockContract(client: Client, contractId: number) {
  const c = (await client.query(
    `SELECT c.*, r.room_number, r.price AS room_price, r.deposit_amount AS room_deposit, COALESCE(r.dorm_id, 1) AS dorm_id,
       t.user_id AS tenant_user_id, t.email AS tenant_email
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? FOR UPDATE`,
    [contractId]
  )).rows[0];
  if (!c) refuse('not_found');
  return c;
}

const isLegacy = (c: any) => c.status === 'PendingFirstBill' && !c.move_in_bill_id;

export interface IssueMoveInInput {
  /** Electricity meter when the room is handed over (required) */
  startMeter: unknown;
  by: number | null;
  /**
   * Tenant name / address for the contract, checked against the ID card (typed by hand; no OCR since commit 24c).
   * Empty = keep what the booker typed. PDPA: no ID number or card photo is ever taken here.
   */
  tenantName?: unknown;
  tenantAddress?: unknown;
  /** occupants (commit 27): left out = keep the number from the booking; else 1–MAX_OCCUPANTS */
  occupants?: unknown;
}

/**
 * Issue the move-in bill as a new bill (the paid booking bill is never touched): first month of rent in full plus the
 * rest of the deposit, from the room on the server, due on the contract start date. Checks the 3-month cap first.
 */
export function issueMoveInBill(contractId: number, input: IssueMoveInInput, now: Date) {
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    if (c.move_in_bill_id) refuse('already_issued');
    if (isLegacy(c)) refuse('legacy');
    if (!BOOKING_PAID.includes(c.status)) refuse('not_paid_booking');

    const raw = input.startMeter;
    const meter = Number(raw);
    if (raw === null || raw === undefined || String(raw).trim() === '' || !Number.isFinite(meter) || meter < 0) refuse('meter_required');
    if (!c.start_date || bangkokDate(now) > bangkokDate(c.start_date)) refuse('start_passed');

    const amounts = moveInAmounts({ room_number: c.room_number, price: c.room_price, deposit_amount: c.room_deposit });
    const cap = capCheck(amounts.rent, amounts.deposit);
    if (!cap.ok) refuse('over_cap', cap.message);

    // Name / address on the contract (printed by /contract-print and the Word file from tenants.name / contracts.tenant_address)
    const name = typeof input.tenantName === 'string' ? input.tenantName.trim() : '';
    const address = typeof input.tenantAddress === 'string' ? input.tenantAddress.trim() : '';
    if (name.length > NAME_MAX || address.length > ADDRESS_MAX) refuse('bad_identity');
    // Occupants (commit 27): the booking's number unless changed here, before the bill — water is charged per person
    const occ = parseOccupants(input.occupants, Number(c.occupants) || 1);
    if (!occ.ok) refuse('bad_occupants');
    if (occ.value !== Number(c.occupants)) await client.query('UPDATE contracts SET occupants = ? WHERE id = ?', [occ.value, contractId]);
    if (name) await client.query('UPDATE tenants SET name = ? WHERE id = ?', [name, c.tenant_id]);
    if (address) {
      await client.query('UPDATE tenants SET address = ? WHERE id = ?', [address, c.tenant_id]);
      await client.query('UPDATE contracts SET tenant_address = ? WHERE id = ?', [address, contractId]);
    }

    const dueDate = bangkokDate(c.start_date);
    const billId = Number((await client.query(
      // common_fee 0: the move-in bill charges rent + deposit only (the column defaults to 150)
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         common_fee, billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 'ค่าแรกเข้า (ค่าเช่าเดือนแรก + เงินประกันส่วนที่เหลือ)', ?, 'Unpaid', 1, 'booking', 0)`,
      [c.tenant_id, c.dorm_id, c.room_number,
        `บิลค่าแรกเข้า (ค่าห้องเดือนแรก ฿${formatBaht(amounts.rent)} + เงินประกันส่วนที่เหลือ ฿${formatBaht(amounts.depositAtMoveIn)})`,
        amounts.dueAtMoveIn, amounts.rent, dueDate]
    )).rows.insertId);

    // Starting meter as its own row (kind 'start'): the room's latest reading, so the next monthly reading counts from it
    // (lib/meters.ts). Other readings of the month are never overwritten.
    const cycle = bangkokDate(now).slice(0, 7);
    await client.query(
      `INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, units_used, billing_cycle, kind,
         recorded_by, recorded_at, confirmed_by, confirmed_at, created_at)
       VALUES (?, ?, 'Electricity', ?, ?, 0, ?, 'start', ?, ?, ?, ?, ?)`,
      [c.dorm_id, c.room_id, meter, meter, cycle, input.by ?? null, now, input.by ?? null, now, now]
    );
    const meterRecorded = true;

    await client.query(
      "UPDATE contracts SET status = 'PendingFirstBill', move_in_bill_id = ?, start_meter_reading = ? WHERE id = ?",
      [billId, round2(meter), contractId]
    );
    return {
      contractId, billId, ...amounts, dueDate, meterRecorded,
      tenantUserId: (c.tenant_user_id as number) || null, roomNumber: c.room_number as string,
    };
  });
}

/** What is still missing before a contract can take effect (the contract row must be locked by the caller). */
async function missingFor(client: Client, c: any): Promise<Missing[]> {
  const missing: Missing[] = [];
  const bill = c.move_in_bill_id
    ? (await client.query('SELECT status FROM bills WHERE id = ? FOR UPDATE', [c.move_in_bill_id])).rows[0]
    : null;
  if (!bill || String(bill.status || '').toLowerCase() !== 'paid') missing.push('move_in_bill');
  if (!isPaper(c.contract_file_url) || !c.paper_signed_date) missing.push('paper');
  return missing;
}

/** Make the contract Active when everything is done, inside the caller's transaction. */
async function activateLocked(client: Client, c: any) {
  const missing = await missingFor(client, c);
  if (missing.length > 0) return { activated: false, missing };
  await signContractTx(client, Number(c.id), {
    depositAmount: depositFor({ room_number: c.room_number, deposit_amount: c.room_deposit }),
  });
  return { activated: true, missing: [] as Missing[] };
}

/**
 * The only way a booked/walk-in contract becomes Active: move-in bill paid AND signed paper uploaded with its date.
 * Safe to call any time; returns what is still missing.
 */
export function activateIfReady(contractId: number) {
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    if (c.status === 'Active') return { activated: false, alreadyActive: true, missing: [] as Missing[], tenantUserId: (c.tenant_user_id as number) || null };
    if (isLegacy(c)) refuse('legacy');
    if (!WAITING.includes(c.status)) refuse('invalid_status');
    const result = await activateLocked(client, c);
    return { ...result, alreadyActive: false, tenantUserId: (c.tenant_user_id as number) || null, roomNumber: c.room_number as string };
  });
}

/**
 * After any successful payment: when the bill is a contract's move-in bill, activate that contract if it is ready.
 * The payment is already recorded, so a failure here is logged and never undoes it.
 */
export async function afterMoveInPayment(sql: any, billId: number) {
  try {
    const rows = await sql`SELECT id FROM contracts WHERE move_in_bill_id = ${billId} LIMIT 1`;
    if (rows.length === 0) return null;
    const result = await activateIfReady(Number(rows[0].id));
    return result.ok ? { contractId: Number(rows[0].id), activated: result.activated, missing: result.missing } : null;
  } catch (error) {
    console.error('[Move-in activation after payment]', billId, error);
    return null;
  }
}

export interface SignedPaperInput {
  /** data URL of the signed contract (JPG, PNG or PDF) */
  file: unknown;
  /** YYYY-MM-DD written on the signed contract */
  signedDate: unknown;
  by: number | null;
}

/**
 * Record the signed paper contract and its signing date. Replaceable until the contract is Active with a signed
 * paper; an Active contract that never had one (owner-created) can get one once. Activates the contract when ready.
 */
export async function recordSignedPaper(contractId: number, input: SignedPaperInput, now: Date): Promise<MoveInResult<{ activated: boolean; missing: Missing[]; tenantUserId: number | null }>> {
  const upload = parsePaperUpload(input.file);
  if (!upload.ok) return { ok: false, reason: 'bad_file', message: upload.message };
  const signedDate = String(input.signedDate || '');
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(signedDate) && !Number.isNaN(new Date(`${signedDate}T00:00:00+07:00`).getTime())
    && bangkokDate(new Date(`${signedDate}T12:00:00+07:00`)) === signedDate;
  if (!valid || signedDate > bangkokDate(now)) return { ok: false, reason: 'signed_date', message: MESSAGES.signed_date };

  const stored = savePaper(upload);
  let previous: string | null = null;
  const result = await run(async (client) => {
    const c = await lockContract(client, contractId);
    if (isLegacy(c)) refuse('legacy');
    if (c.status === 'Active' && isPaper(c.contract_file_url)) refuse('paper_locked');
    if (c.status !== 'Active' && !WAITING.includes(c.status)) refuse('invalid_status');
    previous = isPaper(c.contract_file_url) ? c.contract_file_url : null;

    await client.query(
      'UPDATE contracts SET contract_file_url = ?, paper_signed_date = ?, paper_uploaded_at = ?, paper_uploaded_by = ? WHERE id = ?',
      [stored, signedDate, now, input.by, contractId]
    );
    const tenantUserId = (c.tenant_user_id as number) || null;
    if (c.status === 'Active') return { activated: false, missing: [] as Missing[], tenantUserId };
    const activation = await activateLocked(client, { ...c, contract_file_url: stored, paper_signed_date: signedDate });
    return { ...activation, tenantUserId };
  });
  if (!result.ok) deletePaper(stored);
  else if (previous) deletePaper(previous);
  return result;
}

async function notify(client: Client, userIds: number[], title: string, message: string, link: string, now: Date) {
  for (const id of userIds) {
    await client.query(
      'INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
      [id, title, message, 'contract_cancelled', link, now]
    );
  }
}

/**
 * Cancel contracts whose move-in bill was not paid by the start date (from the next day, Thai date): contract and
 * move-in bill Cancelled, room released. A bill with any payment is left for the owner (shown as overdue).
 * Returns the tenants whose booking fee is to be forfeited after the transaction.
 */
export async function expireMoveIns(client: Client, now: Date): Promise<number[]> {
  const today = bangkokDate(now);
  const due = (await client.query(
    `SELECT c.id, c.room_id, c.tenant_id, c.move_in_bill_id, c.start_date, r.room_number, t.user_id AS tenant_user_id
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.status = 'PendingFirstBill' AND c.move_in_bill_id IS NOT NULL AND DATE(c.start_date) < ?
     FOR UPDATE`,
    [today]
  )).rows;
  if (due.length === 0) return [];

  const staff = (await client.query(
    "SELECT id FROM users WHERE role IN ('owner', 'manager') AND COALESCE(is_active, 1) = 1", []
  )).rows.map((u: any) => Number(u.id));
  const forfeit: number[] = [];
  for (const c of due) {
    const bill = (await client.query(
      `SELECT b.status, (SELECT COUNT(*) FROM bill_payments p WHERE p.bill_id = b.id AND p.voided_at IS NULL) AS payments
       FROM bills b WHERE b.id = ? FOR UPDATE`,
      [c.move_in_bill_id]
    )).rows[0];
    if (!bill) continue;
    if (['paid', 'partial'].includes(String(bill.status || '').toLowerCase()) || Number(bill.payments) > 0) continue;

    await client.query("UPDATE bills SET status = 'Cancelled' WHERE id = ?", [c.move_in_bill_id]);
    await client.query(
      "UPDATE contracts SET status = 'Cancelled', cancelled_at = ?, cancel_reason = 'ไม่ชำระบิลเข้าอยู่ภายในวันเริ่มสัญญา' WHERE id = ?",
      [now, c.id]
    );
    await releaseRoom(client, c.room_id);
    const message = `สัญญาห้อง ${c.room_number} ถูกยกเลิก: ไม่ชำระบิลเข้าอยู่ภายในวันเริ่มสัญญา (${bangkokDate(c.start_date)})`;
    if (c.tenant_user_id) await notify(client, [Number(c.tenant_user_id)], 'สัญญาถูกยกเลิก', message, '/guest', now);
    await notify(client, staff, 'สัญญาถูกยกเลิกอัตโนมัติ', message, '/owner/bookings', now);
    if (c.tenant_id) forfeit.push(Number(c.tenant_id));
  }
  return forfeit;
}

/** For read paths: cancel what is overdue in its own short transaction, then forfeit those booking fees. */
export async function expireDueMoveIns(now: Date = new Date()) {
  const tenants = await withRetry((client) => expireMoveIns(client, now));
  for (const tenantId of tenants) await forfeitBookingFee(tenantId);
  return tenants.length;
}
