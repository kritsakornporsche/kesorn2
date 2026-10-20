// Step 3 of booking → tenant (commit 28, lib/booking-steps.ts): the owner / manager fills in / checks the contract data
// (tenant name, address, occupants, start / end date) and confirms it. Confirmed data is locked: a change needs a
// reason and is kept in contract_data_changes (old → new, who, when) with the booker told; once the signed paper is
// uploaded nothing can change (a new contract is needed). The print page shows a draft mark until the data is confirmed.
// Every function takes `now` from the app; MySQL NOW() is never used for these times.

import { type Client } from '@/lib/bill-status';
import { withRetry } from '@/lib/bookings';
import { bangkokDate } from '@/lib/billing';
import { isPaper } from '@/lib/contract-files';
import { parseOccupants, OCCUPANTS_MESSAGE } from '@/lib/occupants';
import { BOOKING_PAID_STATUSES } from '@/lib/booking-steps';

export const NAME_MAX = 255;
export const ADDRESS_MAX = 500;
export const REASON_MAX = 500;

export type ContractDataRefusal = 'not_found' | 'invalid_status' | 'already_confirmed' | 'not_confirmed' | 'paper_locked'
  | 'bad_name' | 'bad_address' | 'bad_occupants' | 'bad_dates' | 'start_passed' | 'reason_required' | 'no_change';

export type ContractDataResult<T> = ({ ok: true } & T) | { ok: false; reason: ContractDataRefusal; message: string };

const MESSAGES: Record<ContractDataRefusal, string> = {
  not_found: 'ไม่พบข้อมูลสัญญาเช่า',
  invalid_status: 'ยืนยัน/แก้ข้อมูลสัญญาได้หลังผู้จองชำระค่าจองแล้ว และก่อนออกบิลค่าแรกเข้า',
  already_confirmed: 'ยืนยันข้อมูลสัญญานี้แล้ว — ถ้าต้องแก้ ให้ใช้ "แก้ข้อมูลสัญญา" พร้อมเหตุผล',
  not_confirmed: 'ยังไม่ได้ยืนยันข้อมูลสัญญา — กด "ยืนยันข้อมูลสัญญา" ก่อน',
  paper_locked: 'อัปโหลดสัญญาที่ลงนามแล้ว แก้ข้อมูลไม่ได้ ต้องทำสัญญาใหม่',
  bad_name: `กรุณากรอกชื่อ-นามสกุลผู้เช่า (ไม่เกิน ${NAME_MAX} ตัวอักษร)`,
  bad_address: `กรุณากรอกที่อยู่ตามบัตรประชาชน (ไม่เกิน ${ADDRESS_MAX} ตัวอักษร)`,
  bad_occupants: OCCUPANTS_MESSAGE,
  bad_dates: 'วันที่ไม่ถูกต้อง: วันสิ้นสุดสัญญาต้องอยู่หลังวันเริ่มสัญญา',
  start_passed: 'วันเริ่มสัญญาต้องไม่ก่อนวันนี้',
  reason_required: `กรุณาระบุเหตุผลที่แก้ข้อมูล (ไม่เกิน ${REASON_MAX} ตัวอักษร)`,
  no_change: 'ไม่มีข้อมูลที่เปลี่ยน',
};

/** HTTP status for a refusal (for the API route). */
export function contractDataStatus(reason: ContractDataRefusal): number {
  if (reason === 'not_found') return 404;
  if (['invalid_status', 'already_confirmed', 'not_confirmed', 'paper_locked'].includes(reason)) return 409;
  return 400;
}

class ContractDataRefused extends Error {
  constructor(public reason: ContractDataRefusal) { super(reason); }
}
function refuse(reason: ContractDataRefusal): never {
  throw new ContractDataRefused(reason);
}

async function run<T>(work: (client: Client) => Promise<T>): Promise<ContractDataResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof ContractDataRefused) return { ok: false, reason: error.reason, message: MESSAGES[error.reason] };
    throw error;
  }
}

/** The data printed on the contract that step 3 confirms. */
export interface ContractData {
  tenantName: string;
  tenantAddress: string;
  occupants: number;
  startDate: string;
  endDate: string;
}
export const FIELD_TEXT: Record<keyof ContractData, string> = {
  tenantName: 'ชื่อ-นามสกุลผู้เช่า',
  tenantAddress: 'ที่อยู่ตามบัตรประชาชน',
  occupants: 'จำนวนผู้พัก',
  startDate: 'วันเริ่มสัญญา',
  endDate: 'วันสิ้นสุดสัญญา',
};
const FIELDS = Object.keys(FIELD_TEXT) as (keyof ContractData)[];

export interface DataChange { field: keyof ContractData; label: string; from: string | number; to: string | number }

const isDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00+07:00`);
  return !Number.isNaN(d.getTime()) && bangkokDate(d) === v;
};

/** Check the data sent by the page; refuses with the first problem. */
function clean(input: Partial<Record<keyof ContractData, unknown>>, now: Date): ContractData {
  const tenantName = typeof input.tenantName === 'string' ? input.tenantName.trim().replace(/\s+/g, ' ') : '';
  if (!tenantName || tenantName.length > NAME_MAX) refuse('bad_name');
  const tenantAddress = typeof input.tenantAddress === 'string' ? input.tenantAddress.trim() : '';
  if (!tenantAddress || tenantAddress.length > ADDRESS_MAX) refuse('bad_address');
  const occ = parseOccupants(input.occupants, NaN);
  if (!occ.ok || !Number.isInteger(occ.value)) refuse('bad_occupants');
  const startDate = String(input.startDate ?? '');
  const endDate = String(input.endDate ?? '');
  if (!isDate(startDate) || !isDate(endDate) || endDate <= startDate) refuse('bad_dates');
  if (startDate < bangkokDate(now)) refuse('start_passed');
  return { tenantName, tenantAddress, occupants: occ.value, startDate, endDate };
}

async function lockContract(client: Client, contractId: number) {
  const c = (await client.query(
    `SELECT c.id, c.status, c.tenant_id, c.occupants, c.start_date, c.end_date, c.contract_file_url, c.move_in_bill_id,
       c.data_confirmed_at, r.room_number, t.user_id AS tenant_user_id,
       t.name AS tenant_name, COALESCE(NULLIF(c.tenant_address, ''), t.address) AS address
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? FOR UPDATE`,
    [contractId]
  )).rows[0];
  if (!c) refuse('not_found');
  return c;
}

function currentData(c: any): ContractData {
  return {
    tenantName: String(c.tenant_name || ''),
    tenantAddress: String(c.address || ''),
    occupants: Number(c.occupants) || 1,
    startDate: c.start_date ? bangkokDate(c.start_date) : '',
    endDate: c.end_date ? bangkokDate(c.end_date) : '',
  };
}

/** Steps 3 open: booking fee paid, no move-in bill, no signed paper. */
function checkOpen(c: any) {
  if (!BOOKING_PAID_STATUSES.includes(c.status) || c.move_in_bill_id) refuse('invalid_status');
  if (isPaper(c.contract_file_url)) refuse('paper_locked');
}

async function write(client: Client, c: any, data: ContractData) {
  await client.query('UPDATE tenants SET name = ?, address = ? WHERE id = ?', [data.tenantName, data.tenantAddress, c.tenant_id]);
  await client.query(
    'UPDATE contracts SET tenant_address = ?, occupants = ?, start_date = ?, end_date = ? WHERE id = ?',
    [data.tenantAddress, data.occupants, data.startDate, data.endDate, c.id]
  );
}

async function notify(client: Client, userId: number | null, title: string, message: string, now: Date) {
  if (!userId) return;
  await client.query(
    "INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at) VALUES (?, ?, ?, 'contract_data', 0, '/guest', ?)",
    [userId, title, message, now]
  );
}

/** Step 3: confirm the contract data (writes what the page sent, then locks it). */
export function confirmContractData(contractId: number, input: Partial<Record<keyof ContractData, unknown>>, by: number, now: Date) {
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    checkOpen(c);
    if (c.data_confirmed_at) refuse('already_confirmed');
    const data = clean(input, now);
    await write(client, c, data);
    await client.query('UPDATE contracts SET data_confirmed_at = ?, data_confirmed_by = ? WHERE id = ?', [now, by, contractId]);
    await notify(client, Number(c.tenant_user_id) || null, 'หอพักยืนยันข้อมูลสัญญาแล้ว',
      `ห้อง ${c.room_number}: ข้อมูลสัญญาถูกยืนยันแล้ว ขั้นถัดไปคือตรวจสภาพห้องในวันเข้าพัก`, now);
    return { contractId, data, confirmedAt: now };
  });
}

/** After step 3: change confirmed data with a reason; kept in contract_data_changes and the booker is told. */
export function changeContractData(contractId: number, input: Partial<Record<keyof ContractData, unknown>>, reason: unknown, by: number, now: Date) {
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    checkOpen(c);
    if (!c.data_confirmed_at) refuse('not_confirmed');
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (!why || why.length > REASON_MAX) refuse('reason_required');
    const before = currentData(c);
    const data = clean(input, now);
    const changes: DataChange[] = FIELDS.filter((f) => String(before[f]) !== String(data[f]))
      .map((f) => ({ field: f, label: FIELD_TEXT[f], from: before[f], to: data[f] }));
    if (changes.length === 0) refuse('no_change');
    await write(client, c, data);
    await client.query(
      'INSERT INTO contract_data_changes (contract_id, changes, reason, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)',
      [contractId, JSON.stringify(changes), why, by, now]
    );
    await notify(client, Number(c.tenant_user_id) || null, 'ข้อมูลสัญญาถูกแก้ไข',
      `ห้อง ${c.room_number}: แก้ ${changes.map((x) => x.label).join(', ')} — เหตุผล: ${why.slice(0, 200)}`, now);
    return { contractId, data, changes };
  });
}

export interface DataChangeRow { id: number; changes: DataChange[]; reason: string; changed_at: string; changed_by_name: string | null }

/** The contract data, whether it is confirmed / locked, and the change history (newest first). */
export async function contractDataView(sql: any, contractId: number) {
  const rows = await sql`
    SELECT c.id, c.status, c.occupants, c.start_date, c.end_date, c.contract_file_url, c.move_in_bill_id,
           c.data_confirmed_at, (SELECT u.name FROM users u WHERE u.id = c.data_confirmed_by) AS data_confirmed_by_name,
           r.room_number, t.name AS tenant_name, COALESCE(NULLIF(c.tenant_address, ''), t.address) AS address
    FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE c.id = ${contractId} LIMIT 1
  `;
  const c = rows[0];
  if (!c) return null;
  const history = await sql`
    SELECT h.id, h.changes, h.reason, h.changed_at, u.name AS changed_by_name
    FROM contract_data_changes h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.contract_id = ${contractId} ORDER BY h.id DESC
  `;
  const paper = isPaper(c.contract_file_url);
  const open = BOOKING_PAID_STATUSES.includes(c.status) && !c.move_in_bill_id && !paper;
  return {
    contractId: Number(c.id),
    roomNumber: c.room_number as string,
    status: c.status as string,
    data: currentData(c),
    confirmedAt: c.data_confirmed_at || null,
    confirmedByName: c.data_confirmed_by_name || null,
    /** what the page may do now */
    canConfirm: open && !c.data_confirmed_at,
    canChange: open && Boolean(c.data_confirmed_at),
    lockedReason: paper ? MESSAGES.paper_locked : !open ? MESSAGES.invalid_status : null,
    history: (history as any[]).map((h) => ({ ...h, changes: safeJson(h.changes) })) as DataChangeRow[],
  };
}

function safeJson(text: unknown): DataChange[] {
  try {
    const v = JSON.parse(String(text || '[]'));
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
