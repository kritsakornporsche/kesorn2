// Repair / cleaning board (commit 13). One table, maintenance_requests, for both kinds; the flow is `state`:
//   Requested -> InProgress (a keeper of the right kind and of this dorm claims it, started at once)
//   Requested -> Assigned (owner/manager assigns or moves it, until it is started) -> InProgress (that keeper starts)
//   InProgress -> Closed (the keeper finishes without a charge) or -> Done (finished with a proposed charge, waiting
//   for the owner) -> Closed (the owner decides the charge)
//   Requested -> Cancelled (the tenant)   ·   Requested / Assigned -> Rejected (owner/manager, with a reason)
// Repairs go to technicians, cleaning to maids (users.role 'keeper', sub_role). A proposed charge is decided by the
// owner only (amount may be changed or 0; reason tenant_damage / wear_and_tear / service). tenant_damage and service
// bill the tenant of the job's contract (bill_type damage / service, paid through lib/payments.ts). A job of a move-out
// (move_out_settlement_id) is charged as a damage item of that settlement while the deposit is not settled yet
// (lib/moveOut.ts addJobDamage), so it is never billed twice; after settling it is billed to the same contract.
// Rows with state NULL are from before commit 13 ("งานแบบเดิม"): read-only, closed by the owner by hand.
// Every function takes `now` from the app; MySQL NOW() is never used. Single dorm: dorm_id is always 1.

import { getDb } from '@/lib/db';
import { type Client } from '@/lib/bill-status';
import { bangkokDate } from '@/lib/billing';
import { withRetry } from '@/lib/contracts';
import { addJobDamage, moveOutRefusalMessage } from '@/lib/moveOut';
import { deletePhoto, isPhotoName, parsePhotoList, photoUrl, savePhoto } from '@/lib/maintenance-files';

const DORM_ID = 1;
export const KINDS = ['repair', 'cleaning'] as const;
export type Kind = (typeof KINDS)[number];
export const STATES = ['Requested', 'Assigned', 'InProgress', 'Done', 'Closed', 'Cancelled', 'Rejected'] as const;
export type State = (typeof STATES)[number];
export const CHARGE_REASONS = ['tenant_damage', 'wear_and_tear', 'service'] as const;
export type ChargeReason = (typeof CHARGE_REASONS)[number];

/** Keeper sub_role that does each kind of job */
export const KIND_KEEPER: Record<Kind, 'technician' | 'maid'> = { repair: 'technician', cleaning: 'maid' };
export const KIND_TEXT: Record<Kind, string> = { repair: 'งานซ่อม', cleaning: 'งานทำความสะอาด' };
export const STATE_TEXT: Record<State, string> = {
  Requested: 'รอดำเนินการ', Assigned: 'มอบงานแล้ว', InProgress: 'กำลังดำเนินการ', Done: 'รอตรวจสอบค่าใช้จ่าย', Closed: 'เสร็จสิ้น',
  Cancelled: 'ยกเลิก', Rejected: 'ปฏิเสธ',
};
export const CHARGE_REASON_TEXT: Record<ChargeReason, string> = {
  tenant_damage: 'ผู้เช่าทำเสียหาย', wear_and_tear: 'เสื่อมตามสภาพ (ไม่เก็บเงิน)', service: 'ค่าบริการ',
};
const DUE_DAYS = 7;
const TEXT_MAX = 1000;

export type Refusal = 'not_found' | 'forbidden' | 'no_contract' | 'bad_input' | 'bad_photo' | 'invalid_state' | 'wrong_keeper'
  | 'not_assignee' | 'taken' | 'reason_required' | 'already_decided' | 'no_tenant' | 'move_out_not_returned' | 'legacy' | 'note_required';

export type Result<T> = ({ ok: true } & T) | { ok: false; reason: Refusal; message: string };

const MESSAGES: Record<Refusal, string> = {
  not_found: 'ไม่พบงาน',
  forbidden: 'ไม่มีสิทธิ์ทำรายการนี้',
  no_contract: 'แจ้งได้เฉพาะผู้เช่าที่มีสัญญาเช่าที่ใช้งานอยู่',
  bad_input: 'ข้อมูลไม่ถูกต้อง',
  bad_photo: 'รูปไม่ถูกต้อง',
  invalid_state: 'งานนี้อยู่ในสถานะที่ทำรายการนี้ไม่ได้',
  wrong_keeper: 'มอบงานได้เฉพาะพนักงานของหอนี้ที่ใช้งานอยู่และตรงประเภทงาน (งานซ่อม → ช่าง, งานทำความสะอาด → แม่บ้าน)',
  not_assignee: 'งานนี้ไม่ได้มอบให้คุณ',
  taken: 'งานนี้มีผู้รับไปแล้ว',
  reason_required: 'กรุณาระบุเหตุผล',
  already_decided: 'ตัดสินค่าใช้จ่ายของงานนี้ไปแล้ว',
  no_tenant: 'งานนี้ไม่มีผู้เช่าให้เรียกเก็บเงิน — อนุมัติเป็น 0 หรือเลือกเสื่อมตามสภาพ',
  move_out_not_returned: 'งานของการย้ายออกนี้ อนุมัติค่าใช้จ่ายได้หลังบันทึกการคืนห้อง',
  legacy: 'งานแบบเดิม — จัดการด้วยมือ',
  note_required: 'กรุณาระบุบันทึกการจัดการ',
};

class Refused extends Error {
  constructor(public reason: Refusal, public detail?: string) { super(reason); }
}
function refuse(reason: Refusal, detail?: string): never {
  throw new Refused(reason, detail);
}
function deny<T>(reason: Refusal, detail?: string): Promise<Result<T>> {
  return Promise.resolve({ ok: false, reason, message: detail || MESSAGES[reason] });
}
async function run<T>(work: (client: Client) => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error: any) {
    if (error instanceof Refused) return { ok: false, reason: error.reason, message: error.detail || MESSAGES[error.reason] };
    // A refusal from lib/moveOut.ts inside the same transaction (e.g. the damage bill was already paid)
    const moveOut = moveOutRefusalMessage(error);
    if (moveOut) return { ok: false, reason: 'invalid_state', message: moveOut };
    throw error;
  }
}

export interface Actor { id: number; email?: string | null; role: string; sub_role?: string | null }
const isStaff = (u: Actor) => u.role === 'owner' || u.role === 'manager';
const isOwner = (u: Actor) => u.role === 'owner';
const isKind = (v: unknown): v is Kind => KINDS.includes(v as Kind);
const round2 = (n: number) => Math.round(Number(n) * 100) / 100;
const text = (v: unknown, max = TEXT_MAX) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const DAY_MS = 24 * 60 * 60 * 1000;
const addDays = (ymd: string, days: number) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d) + days * DAY_MS).toISOString().slice(0, 10);
};

async function tenantIdsOf(client: Client, user: Actor): Promise<number[]> {
  const rows = (await client.query(
    "SELECT id FROM tenants WHERE user_id = ? OR (? <> '' AND LOWER(email) = LOWER(?))",
    [user.id, user.email || '', user.email || '']
  )).rows as any[];
  return rows.map((r) => Number(r.id));
}

/** The keeper account behind an action, checked in the database (active, role keeper, sub_role). */
async function keeperRow(client: Client, userId: number) {
  return (await client.query('SELECT id, name, role, sub_role, is_active FROM users WHERE id = ? FOR UPDATE', [userId])).rows[0];
}
const keeperFits = (k: any, kind: Kind) => !!k && Number(k.is_active) === 1 && k.role === 'keeper' && k.sub_role === KIND_KEEPER[kind];

/** Staff of this dorm: a keepers row with dorm_id (same rule as /api/owner/staff). Older accounts of other dorms are not. */
async function keeperOfDorm(client: Client, userId: number) {
  return !!(await client.query('SELECT id FROM keepers WHERE user_id = ? AND dorm_id = ? LIMIT 1', [userId, DORM_ID])).rows[0];
}

async function lockJob(client: Client, id: number) {
  const job = (await client.query(
    `SELECT m.*, t.user_id AS tenant_user_id, t.email AS tenant_email FROM maintenance_requests m
     LEFT JOIN tenants t ON t.id = m.tenant_id WHERE m.id = ? FOR UPDATE`,
    [id]
  )).rows[0];
  if (!job) refuse('not_found');
  if (!job.state) refuse('legacy');
  return job;
}

async function savePhotos(client: Client, requestId: number, files: string[], stage: 'report' | 'done', by: number, now: Date) {
  for (const file of files) {
    await client.query(
      'INSERT INTO maintenance_photos (request_id, stage, file, uploaded_by, uploaded_at) VALUES (?, ?, ?, ?, ?)',
      [requestId, stage, file, by, now]
    );
  }
}

/** Write the photos first (outside the transaction); removed again when the database work is refused or fails. */
async function withPhotos<T>(list: unknown, work: (files: string[]) => Promise<Result<T>>): Promise<Result<T>> {
  const parsed = parsePhotoList(list);
  if (!parsed.ok) return { ok: false, reason: 'bad_photo', message: parsed.message };
  const files = parsed.uploads.map(savePhoto);
  try {
    const result = await work(files);
    if (!result.ok) files.forEach(deletePhoto);
    return result;
  } catch (error) {
    files.forEach(deletePhoto);
    throw error;
  }
}

// ── Creating ────────────────────────────────────────────────────────────────────────

export interface TenantRequestInput { kind: unknown; issueType?: unknown; description: unknown; photos?: unknown }

/**
 * A tenant reports a repair or asks for cleaning for the room of their Active contract (an ended contract cannot).
 * The room comes from the contract, never from the tenant record or the page.
 */
export function createRequest(user: Actor, input: TenantRequestInput, now: Date) {
  if (!user) return deny<never>('forbidden');
  if (!isKind(input?.kind)) return deny<never>('bad_input', 'กรุณาเลือกประเภท (งานซ่อม / งานทำความสะอาด)');
  const description = text(input.description);
  if (!description) return deny<never>('bad_input', 'กรุณาอธิบายปัญหา');
  const kind = input.kind;
  return withPhotos(input.photos, (files) => run(async (client) => {
    const ids = await tenantIdsOf(client, user);
    if (ids.length === 0) refuse('no_contract');
    const c = (await client.query(
      `SELECT c.id, c.tenant_id, c.room_id, r.room_number FROM contracts c JOIN rooms r ON r.id = c.room_id
       WHERE c.tenant_id IN (?) AND c.status = 'Active' ORDER BY c.id DESC LIMIT 1 FOR UPDATE`,
      [ids]
    )).rows[0];
    if (!c) refuse('no_contract');
    const id = Number((await client.query(
      `INSERT INTO maintenance_requests (tenant_id, room_number, room_id, contract_id, issue_type, description, status, kind, state,
         requested_by, requested_at, dorm_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'Pending', ?, 'Requested', ?, ?, ?, ?)`,
      [c.tenant_id, c.room_number, c.room_id, c.id, text(input.issueType, 100) || KIND_TEXT[kind], description, kind, user.id, now, DORM_ID, now]
    )).rows.insertId);
    await savePhotos(client, id, files, 'report', user.id, now);
    return { id, roomNumber: String(c.room_number) };
  }));
}

export interface StaffCreateInput {
  kind: unknown; description: unknown; issueType?: unknown;
  /** a room (vacant or common work); the tenant of its Active contract is linked when there is one */
  roomId?: unknown;
  /** a move-out: room, contract and tenant come from the settlement */
  settlementId?: unknown;
  photos?: unknown;
}

/** Owner/manager opens a job themselves, e.g. cleaning after a move-out (linked to that settlement). */
export function staffCreate(by: Actor, input: StaffCreateInput, now: Date) {
  if (!by || !isStaff(by)) return deny<never>('forbidden');
  if (!isKind(input?.kind)) return deny<never>('bad_input', 'กรุณาเลือกประเภท (งานซ่อม / งานทำความสะอาด)');
  const description = text(input.description);
  if (!description) return deny<never>('bad_input', 'กรุณาระบุรายละเอียดงาน');
  const kind = input.kind;
  return withPhotos(input.photos, (files) => run(async (client) => {
    let place: { room_id: number; room_number: string; contract_id: number | null; tenant_id: number | null; settlement_id: number | null };
    if (input.settlementId) {
      const s = (await client.query(
        `SELECT s.id, s.state, s.contract_id, s.tenant_id, s.room_id, r.room_number FROM move_out_settlements s
         JOIN rooms r ON r.id = s.room_id WHERE s.id = ? FOR UPDATE`, [Number(input.settlementId)]
      )).rows[0];
      if (!s) refuse('not_found', 'ไม่พบคำขอย้ายออก');
      if (!['Notified', 'Returned'].includes(s.state)) refuse('invalid_state', 'สร้างงานของการย้ายออกได้ก่อนหักเงินประกันเท่านั้น');
      place = { room_id: s.room_id, room_number: s.room_number, contract_id: s.contract_id, tenant_id: s.tenant_id, settlement_id: s.id };
    } else {
      const room = (await client.query('SELECT id, room_number FROM rooms WHERE id = ?', [Number(input.roomId) || 0])).rows[0];
      if (!room) refuse('bad_input', 'กรุณาเลือกห้อง');
      const c = (await client.query(
        "SELECT id, tenant_id FROM contracts WHERE room_id = ? AND status = 'Active' ORDER BY id DESC LIMIT 1", [room.id]
      )).rows[0];
      place = { room_id: room.id, room_number: room.room_number, contract_id: c?.id || null, tenant_id: c?.tenant_id || null, settlement_id: null };
    }
    const id = Number((await client.query(
      `INSERT INTO maintenance_requests (tenant_id, room_number, room_id, contract_id, move_out_settlement_id, issue_type, description,
         status, kind, state, requested_by, requested_at, dorm_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, 'Requested', ?, ?, ?, ?)`,
      [place.tenant_id, place.room_number, place.room_id, place.contract_id, place.settlement_id,
        text(input.issueType, 100) || (place.settlement_id ? `${KIND_TEXT[kind]}ตอนย้ายออก` : KIND_TEXT[kind]), description,
        kind, by.id, now, DORM_ID, now]
    )).rows.insertId);
    await savePhotos(client, id, files, 'report', by.id, now);
    return { id };
  }));
}

// ── Flow ────────────────────────────────────────────────────────────────────────────

/** Owner/manager assigns (or reassigns until started) a keeper of this dorm whose sub_role fits the kind and whose account is active. */
export function assignJob(id: number, keeperUserId: number, by: Actor, now: Date) {
  if (!by || !isStaff(by)) return deny<never>('forbidden');
  return run(async (client) => {
    const job = await lockJob(client, id);
    if (!['Requested', 'Assigned'].includes(job.state)) refuse('invalid_state', 'มอบงานได้ก่อนเริ่มงานเท่านั้น');
    const k = await keeperRow(client, Number(keeperUserId) || 0);
    if (!keeperFits(k, job.kind) || !(await keeperOfDorm(client, Number(k.id)))) refuse('wrong_keeper');
    await client.query(
      "UPDATE maintenance_requests SET state = 'Assigned', assigned_to = ?, assigned_by = ?, assigned_at = ? WHERE id = ?",
      [k.id, by.id, now, id]
    );
    return { keeperUserId: Number(k.id), keeperName: String(k.name || ''), tenantUserId: (job.tenant_user_id as number) || null, roomNumber: job.room_number };
  });
}

/** Owner/manager refuses a job before it is started (reason required). */
export function rejectJob(id: number, reason: unknown, by: Actor, now: Date) {
  if (!by || !isStaff(by)) return deny<never>('forbidden');
  const why = text(reason, 500);
  if (!why) return deny<never>('reason_required');
  return run(async (client) => {
    const job = await lockJob(client, id);
    if (!['Requested', 'Assigned'].includes(job.state)) refuse('invalid_state');
    await client.query(
      "UPDATE maintenance_requests SET state = 'Rejected', closed_reason = ?, closed_by = ?, closed_at = ? WHERE id = ?",
      [why, by.id, now, id]
    );
    return { tenantUserId: (job.tenant_user_id as number) || null, roomNumber: job.room_number };
  });
}

/** The tenant withdraws their own request while nobody is assigned yet. */
export function cancelJob(id: number, user: Actor, now: Date) {
  if (!user) return deny<never>('forbidden');
  return run(async (client) => {
    const job = await lockJob(client, id);
    const ids = await tenantIdsOf(client, user);
    if (!ids.includes(Number(job.tenant_id)) || isStaff(user)) refuse('not_found');
    if (job.state !== 'Requested') refuse('invalid_state', 'ยกเลิกได้เฉพาะงานที่ยังไม่มอบให้พนักงาน');
    await client.query(
      "UPDATE maintenance_requests SET state = 'Cancelled', closed_reason = 'ผู้เช่ายกเลิก', closed_by = ?, closed_at = ? WHERE id = ?",
      [user.id, now, id]
    );
    return { id };
  });
}

/**
 * A keeper takes a Requested job themselves: right kind, staff of this dorm, account active. It starts at once
 * (InProgress). The job row is locked, so of two keepers pressing at the same time the second is refused.
 */
export function claimJob(id: number, keeper: Actor, now: Date) {
  if (!keeper || keeper.role !== 'keeper') return deny<never>('forbidden');
  return run(async (client) => {
    const job = await lockJob(client, id);
    const k = await keeperRow(client, keeper.id);
    if (!keeperFits(k, job.kind) || !(await keeperOfDorm(client, Number(k.id)))) refuse('wrong_keeper', 'รับงานได้เฉพาะพนักงานของหอนี้ที่ใช้งานอยู่และตรงประเภทงาน');
    if (job.state !== 'Requested') refuse('taken', job.assigned_to ? MESSAGES.taken : MESSAGES.invalid_state);
    await client.query(
      "UPDATE maintenance_requests SET state = 'InProgress', status = 'InProgress', assigned_to = ?, assigned_by = ?, assigned_at = ?, started_at = ? WHERE id = ?",
      [k.id, k.id, now, now, id]
    );
    return { tenantUserId: (job.tenant_user_id as number) || null, roomNumber: job.room_number, keeperName: String(k.name || '') };
  });
}

/** The assigned keeper starts the job (account still active, still the right kind). */
export function startJob(id: number, keeper: Actor, now: Date) {
  if (!keeper || keeper.role !== 'keeper') return deny<never>('forbidden');
  return run(async (client) => {
    const job = await lockJob(client, id);
    if (Number(job.assigned_to) !== Number(keeper.id)) refuse('not_assignee');
    if (!keeperFits(await keeperRow(client, keeper.id), job.kind)) refuse('forbidden');
    if (job.state !== 'Assigned') refuse('invalid_state', 'เริ่มงานได้เฉพาะงานที่มอบให้แล้ว');
    await client.query("UPDATE maintenance_requests SET state = 'InProgress', status = 'InProgress', started_at = ? WHERE id = ?", [now, id]);
    return { tenantUserId: (job.tenant_user_id as number) || null, roomNumber: job.room_number };
  });
}

export interface FinishInput { note?: unknown; photos?: unknown; chargeProposed?: unknown; chargeNote?: unknown }

/**
 * The assigned keeper finishes the job with a note, photos and an optional proposed charge. Without a charge (0 or
 * empty) the job is Closed at once; with one it is Done, waiting for the owner to decide the charge.
 */
export function finishJob(id: number, keeper: Actor, input: FinishInput, now: Date) {
  if (!keeper || keeper.role !== 'keeper') return deny<never>('forbidden');
  const raw = input?.chargeProposed;
  const proposed = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
  if (!Number.isFinite(proposed) || proposed < 0 || proposed > 1_000_000) return deny<never>('bad_input', 'ยอดค่าใช้จ่ายที่เสนอไม่ถูกต้อง');
  return withPhotos(input?.photos, (files) => run(async (client) => {
    const job = await lockJob(client, id);
    if (Number(job.assigned_to) !== Number(keeper.id)) refuse('not_assignee');
    if (!keeperFits(await keeperRow(client, keeper.id), job.kind)) refuse('forbidden');
    if (job.state !== 'InProgress') refuse('invalid_state', 'ปิดงานได้เฉพาะงานที่กำลังดำเนินการ');
    const charged = round2(proposed) > 0;
    await client.query(
      `UPDATE maintenance_requests SET state = ?, status = 'Completed', done_at = ?, done_note = ?,
         charge_proposed = ?, charge_proposed_note = ?, closed_by = ?, closed_at = ? WHERE id = ?`,
      [charged ? 'Done' : 'Closed', now, text(input.note), round2(proposed), text(input.chargeNote, 500),
        charged ? null : keeper.id, charged ? null : now, id]
    );
    await savePhotos(client, id, files, 'done', keeper.id, now);
    return { tenantUserId: (job.tenant_user_id as number) || null, roomNumber: job.room_number, chargeProposed: round2(proposed), closed: !charged };
  }));
}

// ── Charge ──────────────────────────────────────────────────────────────────────────

export interface ChargeInput { amount: unknown; reason: unknown; note?: unknown }

/**
 * Owner decides the charge of a job finished with a proposed charge (Done, once), then it is Closed. 0 or wear_and_tear: nothing billed. tenant_damage / service:
 * a job of a move-out still being settled becomes a damage item of that settlement (no separate bill); otherwise a
 * bill (damage / service) to the tenant of the job's contract, paid through recordPayment like every bill.
 */
export function decideCharge(id: number, input: ChargeInput, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden', 'การอนุมัติค่าใช้จ่ายต้องให้เจ้าของหอเป็นผู้ตัดสิน');
  const amount = Number(input?.amount);
  const wholeSatang = Math.abs(amount * 100 - Math.round(amount * 100)) < 1e-6;
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000 || !wholeSatang) return deny<never>('bad_input', 'ยอดค่าใช้จ่ายไม่ถูกต้อง');
  if (!CHARGE_REASONS.includes(input?.reason as ChargeReason)) return deny<never>('bad_input', 'กรุณาเลือกเหตุผลค่าใช้จ่าย');
  const reason = input.reason as ChargeReason;
  const note = text(input.note, 500);
  return run(async (client) => {
    const job = await lockJob(client, id);
    if (job.state !== 'Done') refuse('invalid_state', 'ตัดสินค่าใช้จ่ายได้เฉพาะงานที่รอตรวจสอบค่าใช้จ่าย');
    if (job.charge_decided_at) refuse('already_decided');

    const billable = round2(amount) > 0 && reason !== 'wear_and_tear';
    let billId: number | null = null;
    let toSettlement = false;
    if (billable) {
      if (!job.contract_id || !job.tenant_id) refuse('no_tenant');
      const label = `${KIND_TEXT[job.kind as Kind]} #${id} ห้อง ${job.room_number || '-'}: ${String(job.issue_type || '')}${note ? ` (${note})` : ''}`.slice(0, 200);
      const settlement = job.move_out_settlement_id
        ? (await client.query('SELECT id, state FROM move_out_settlements WHERE id = ? FOR UPDATE', [job.move_out_settlement_id])).rows[0]
        : null;
      if (settlement && settlement.state === 'Notified') refuse('move_out_not_returned');
      if (settlement && settlement.state === 'Returned') {
        const written = await addJobDamage(client, Number(settlement.id), { jobId: id, amount: round2(amount), reason: label }, by, now);
        billId = written.damageBillId;
        toSettlement = true;
      } else {
        // Billed to the tenant of the job's contract (never "whoever lives in the room now")
        const today = bangkokDate(now);
        billId = Number((await client.query(
          `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
             common_fee, billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified, sent_at, created_at)
           VALUES (?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, ?, ?, 'Unpaid', 0, ?, 0, ?, ?)`,
          [job.tenant_id, DORM_ID, job.room_number, `${reason === 'service' ? 'ค่าบริการ' : 'ค่าเสียหาย'} ${label}`, round2(amount),
            today.slice(0, 7), addDays(today, DUE_DAYS), reason === 'service' ? 'service' : 'damage', now, now]
        )).rows.insertId);
        await client.query(
          "INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by, changed_at) VALUES (?, NULL, 'Unpaid', ?, ?, ?)",
          [billId, `ค่าใช้จ่ายงาน #${id}`, by.id, now]
        );
      }
    }
    await client.query(
      `UPDATE maintenance_requests SET state = 'Closed', closed_by = ?, closed_at = ?, charge_amount = ?, charge_reason = ?, charge_note = ?,
         charge_decided_by = ?, charge_decided_at = ?, charge_bill_id = ?, cost = ?, bill_id = ? WHERE id = ?`,
      [by.id, now, round2(amount), reason, note, by.id, now, billId, billable ? round2(amount) : 0, billId, id]
    );
    return { billed: billable, billId, toSettlement, amount: round2(amount), tenantUserId: (job.tenant_user_id as number) || null };
  });
}

// ── Older jobs (before commit 13) ──────────────────────────────────────────────────────

/** Owner closes an older job by hand (no state flow, nothing billed). kind 'cleaning_jobs' closes an old cleaning_jobs row. */
export function closeLegacy(id: number, input: { note: unknown; table?: unknown }, by: Actor, now: Date) {
  if (!by || !isOwner(by)) return deny<never>('forbidden');
  const note = text(input?.note, 500);
  if (!note) return deny<never>('note_required');
  return run(async (client) => {
    if (input.table === 'cleaning_jobs') {
      const row = (await client.query('SELECT id, status FROM cleaning_jobs WHERE id = ? FOR UPDATE', [id])).rows[0];
      if (!row) refuse('not_found');
      if (String(row.status).toLowerCase() === 'completed') refuse('invalid_state', 'งานนี้ปิดไปแล้ว');
      await client.query("UPDATE cleaning_jobs SET status = 'completed', completed_at = ?, notes = ? WHERE id = ?",
        [now, `ปิดด้วยมือ (งานแบบเดิม): ${note}`, id]);
      return { id };
    }
    const row = (await client.query('SELECT id, state, status FROM maintenance_requests WHERE id = ? FOR UPDATE', [id])).rows[0];
    if (!row) refuse('not_found');
    if (row.state) refuse('invalid_state', 'งานนี้เป็นแบบใหม่ ใช้ขั้นตอนปกติ');
    if (['completed', 'resolved'].includes(String(row.status || '').toLowerCase())) refuse('invalid_state', 'งานนี้ปิดไปแล้ว');
    await client.query(
      "UPDATE maintenance_requests SET status = 'Completed', done_note = ?, closed_by = ?, closed_at = ? WHERE id = ?",
      [`ปิดด้วยมือ (งานแบบเดิม): ${note}`, by.id, now, id]
    );
    return { id };
  });
}

// ── Reading ─────────────────────────────────────────────────────────────────────────

export interface JobView {
  id: number;
  legacy: boolean;
  kind: Kind | null;
  state: State | null;
  status_text: string;
  legacy_status: string | null;
  issue_type: string | null;
  description: string | null;
  room_number: string | null;
  contract_id: number | null;
  move_out_settlement_id: number | null;
  requested_at: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  assigned_at: string | null;
  started_at: string | null;
  done_at: string | null;
  done_note: string | null;
  closed_reason: string | null;
  photos: { url: string; stage: 'report' | 'done' }[];
  charge: null | {
    proposed: number | null; proposed_note: string | null;
    decided: boolean; amount: number | null; reason: ChargeReason | null; reason_text: string | null; bill_id: number | null; to_settlement: boolean;
  };
}

/** Photos of older jobs: a public path or a JSON list of paths (left where they are). */
function legacyPhotos(value: unknown): string[] {
  if (typeof value !== 'string' || !value) return [];
  try {
    const list = value.startsWith('[') ? JSON.parse(value) : [value];
    return (Array.isArray(list) ? list : []).filter((p) => typeof p === 'string' && p.startsWith('/uploads/'));
  } catch {
    return [];
  }
}

function legacyStatusText(status: unknown) {
  const s = String(status || '').toLowerCase().replace(/\s/g, '');
  return s === 'pending' ? 'รอดำเนินการ' : s === 'inprogress' || s === 'in_progress' ? 'กำลังดำเนินการ' : s === 'completed' || s === 'resolved' ? 'เสร็จแล้ว' : String(status || '-');
}

/**
 * Jobs as the viewer may see them:
 *  owner/manager — every job (older ones marked legacy);
 *  keeper — jobs assigned to them, and Requested jobs of their kind to claim (without the tenant's name / phone until taken);
 *  tenant — their own jobs.
 * Proposed charges are shown to staff and the assigned keeper; the tenant sees only a decided charge.
 */
export async function listJobs(viewer: Actor): Promise<JobView[]> {
  const sql = getDb();
  let where = '';
  let params: any[] = [];
  if (isStaff(viewer)) {
    where = '1 = 1';
  } else if (viewer.role === 'keeper') {
    const kind = viewer.sub_role === 'technician' ? 'repair' : viewer.sub_role === 'maid' ? 'cleaning' : null;
    if (!kind) return [];
    where = "(m.assigned_to = ? OR (m.state = 'Requested' AND m.kind = ?))";
    params = [viewer.id, kind];
  } else {
    where = "m.tenant_id IN (SELECT id FROM tenants WHERE user_id = ? OR (? <> '' AND LOWER(email) = LOWER(?)))";
    params = [viewer.id, viewer.email || '', viewer.email || ''];
  }
  const rows = await sql(
    `SELECT m.*, t.name AS tenant_name, t.phone AS tenant_phone, k.name AS assignee_name
     FROM maintenance_requests m
     LEFT JOIN tenants t ON t.id = m.tenant_id
     LEFT JOIN users k ON k.id = m.assigned_to
     WHERE ${where}
     ORDER BY CASE m.state WHEN 'Requested' THEN 0 WHEN 'Assigned' THEN 1 WHEN 'InProgress' THEN 2 WHEN 'Done' THEN 3 WHEN 'Closed' THEN 4 ELSE 5 END,
       COALESCE(m.requested_at, m.created_at) DESC, m.id DESC`,
    params
  ) as any[];
  const ids = rows.map((r) => Number(r.id));
  const photos = ids.length
    ? await sql(`SELECT request_id, stage, file FROM maintenance_photos WHERE request_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ids) as any[]
    : [];
  return rows.map((r) => viewOf(r, photos.filter((p) => Number(p.request_id) === Number(r.id)), viewer));
}

function viewOf(r: any, photos: any[], viewer: Actor): JobView {
  const legacy = !r.state;
  const keeperOwnsIt = viewer.role === 'keeper' && Number(r.assigned_to) === Number(viewer.id);
  const showTenant = isStaff(viewer) || keeperOwnsIt || viewer.role !== 'keeper';
  const showProposed = isStaff(viewer) || keeperOwnsIt;
  const decided = !!r.charge_decided_at;
  const reason = (r.charge_reason || null) as ChargeReason | null;
  return {
    id: Number(r.id), legacy, kind: r.kind || null, state: r.state || null,
    status_text: legacy ? `งานแบบเดิม · ${legacyStatusText(r.status)}` : STATE_TEXT[r.state as State],
    legacy_status: legacy ? r.status : null,
    issue_type: r.issue_type, description: r.description, room_number: r.room_number,
    contract_id: r.contract_id ? Number(r.contract_id) : null,
    move_out_settlement_id: r.move_out_settlement_id ? Number(r.move_out_settlement_id) : null,
    requested_at: r.requested_at || r.created_at || null,
    tenant_name: showTenant ? r.tenant_name || null : null,
    tenant_phone: showTenant ? r.tenant_phone || null : null,
    assigned_to: r.assigned_to ? Number(r.assigned_to) : null,
    assignee_name: r.assignee_name || null, assigned_at: r.assigned_at, started_at: r.started_at, done_at: r.done_at,
    done_note: r.done_note || (legacy ? r.notes : null) || null,
    closed_reason: r.closed_reason || null,
    photos: [
      ...photos.filter((p) => isPhotoName(p.file)).map((p) => ({ url: photoUrl(Number(r.id), p.file), stage: p.stage })),
      ...(legacy ? legacyPhotos(r.photo_url || r.image_url).map((url) => ({ url, stage: 'report' as const })) : []),
    ],
    charge: legacy ? null : {
      proposed: showProposed && r.charge_proposed !== null ? Number(r.charge_proposed) : null,
      proposed_note: showProposed ? r.charge_proposed_note || null : null,
      decided,
      amount: decided ? Number(r.charge_amount || 0) : null,
      reason: decided ? reason : null,
      reason_text: decided && reason ? CHARGE_REASON_TEXT[reason] : null,
      bill_id: decided && r.charge_bill_id ? Number(r.charge_bill_id) : null,
      to_settlement: decided && !!r.move_out_settlement_id && !!r.charge_bill_id && r.charge_reason !== 'wear_and_tear',
    },
  };
}

/** Older cleaning_jobs rows (no longer written), for the owner to see and close by hand; empty when the table is missing. */
export async function legacyCleaningJobs() {
  try {
    const sql = getDb();
    return await sql`
      SELECT c.id, c.status, COALESCE(c.job_type, c.task) AS job_type, c.notes, c.created_at, c.completed_at, r.room_number
      FROM cleaning_jobs c LEFT JOIN rooms r ON r.id = c.room_id ORDER BY c.id DESC LIMIT 200
    `;
  } catch {
    return [];
  }
}

/** Active keepers of this dorm of a kind (for the assign list). */
export async function keepersFor(kind: Kind) {
  const sql = getDb();
  return sql`SELECT id, name, phone, sub_role FROM users WHERE role = 'keeper' AND sub_role = ${KIND_KEEPER[kind]} AND is_active = 1
    AND id IN (SELECT user_id FROM keepers WHERE dorm_id = ${DORM_ID} AND user_id IS NOT NULL) ORDER BY name`;
}

/** Whether the user may open a photo of this job: staff, the tenant of the job, or the keeper who can see the job. */
export async function canViewJobPhoto(user: Actor, requestId: number, file: string): Promise<boolean> {
  if (!isPhotoName(file)) return false;
  const sql = getDb();
  const rows = await sql`
    SELECT m.id, m.tenant_id, m.kind, m.state, m.assigned_to FROM maintenance_requests m
    JOIN maintenance_photos p ON p.request_id = m.id AND p.file = ${file}
    WHERE m.id = ${requestId} LIMIT 1
  `;
  const job = rows[0];
  if (!job) return false;
  if (isStaff(user)) return true;
  if (user.role === 'keeper') {
    const kind = user.sub_role === 'technician' ? 'repair' : user.sub_role === 'maid' ? 'cleaning' : null;
    return Number(job.assigned_to) === Number(user.id) || (job.state === 'Requested' && job.kind === kind);
  }
  const mine = await sql`SELECT id FROM tenants WHERE id = ${job.tenant_id} AND (user_id = ${user.id} OR LOWER(email) = LOWER(${user.email || ''})) LIMIT 1`;
  return mine.length > 0;
}

export function refusalStatus(reason: Refusal): number {
  if (reason === 'not_found') return 404;
  if (reason === 'forbidden' || reason === 'not_assignee') return 403;
  if (['invalid_state', 'taken', 'already_decided', 'legacy', 'move_out_not_returned'].includes(reason)) return 409;
  return 400;
}

