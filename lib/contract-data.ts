// Step 3 of booking → tenant (commit 28, lib/booking-steps.ts): the owner / manager fills in / checks the contract data
// (tenant title / first / last name, address, occupants, start / end date) and confirms it. Confirmed data is locked: a
// change needs a reason and is kept in contract_data_changes (old → new, who, when) with the booker told; once the
// signed paper is uploaded nothing can change (a new contract is needed). The print page shows a draft mark until the
// data is confirmed. Every function takes `now` from the app; MySQL NOW() is never used for these times.
// Commit 28-8 (migration 022): the name and address are kept in separate fields on the contract (lib/contract-party);
// the single-field name / address still go to tenants.name / tenants.address / contracts.tenant_address for every other
// page. A request may still send one-field tenantName / tenantAddress (split here, best effort).

import { type Client } from '@/lib/bill-status';
import { withRetry } from '@/lib/bookings';
import { bangkokDate } from '@/lib/billing';
import { isPaper } from '@/lib/contract-files';
import { parseOccupants, OCCUPANTS_MESSAGE } from '@/lib/occupants';
import { BOOKING_PAID_STATUSES } from '@/lib/booking-steps';
import {
  ADDRESS_FIELDS, NAME_PART_MAX, TITLES, addressFromText, joinAddress, joinName, splitName,
  type AddressParts, type Title,
} from '@/lib/contract-party';

export const NAME_MAX = 255;
export const ADDRESS_MAX = 500;
export const REASON_MAX = 500;

export type ContractDataRefusal = 'not_found' | 'invalid_status' | 'already_confirmed' | 'not_confirmed' | 'paper_locked'
  | 'bad_name' | 'bad_title' | 'bad_address' | 'bad_postcode' | 'bad_occupants' | 'bad_dates' | 'start_passed' | 'reason_required' | 'no_change';

export type ContractDataResult<T> = ({ ok: true } & T) | { ok: false; reason: ContractDataRefusal; message: string };

const MESSAGES: Record<ContractDataRefusal, string> = {
  not_found: 'ไม่พบข้อมูลสัญญาเช่า',
  invalid_status: 'ยืนยัน/แก้ข้อมูลสัญญาได้หลังผู้จองชำระค่าจองแล้ว และก่อนออกบิลค่าแรกเข้า',
  already_confirmed: 'ยืนยันข้อมูลสัญญานี้แล้ว — ถ้าต้องแก้ ให้ใช้ "แก้ข้อมูลสัญญา" พร้อมเหตุผล',
  not_confirmed: 'ยังไม่ได้ยืนยันข้อมูลสัญญา — กด "ยืนยันข้อมูลสัญญา" ก่อน',
  paper_locked: 'อัปโหลดสัญญาที่ลงนามแล้ว แก้ข้อมูลไม่ได้ ต้องทำสัญญาใหม่',
  bad_name: `กรุณากรอกชื่อและนามสกุลผู้เช่า (ช่องละไม่เกิน ${NAME_PART_MAX} ตัวอักษร)`,
  bad_title: `กรุณาเลือกคำนำหน้า (${TITLES.join(' / ')})`,
  bad_address: 'กรุณากรอกที่อยู่ตามบัตรประชาชน: บ้านเลขที่ ตำบล/แขวง อำเภอ/เขต และจังหวัด (ช่องละไม่เกิน 100 ตัวอักษร)',
  bad_postcode: 'รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก',
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
  title: Title | '';
  firstName: string;
  lastName: string;
  address: AddressParts;
  /** the address as one line (contracts.tenant_address) */
  addressText: string;
  occupants: number;
  startDate: string;
  endDate: string;
}
/** Fields compared for the change history */
type Field = 'title' | 'firstName' | 'lastName' | 'address' | 'occupants' | 'startDate' | 'endDate';
export const FIELD_TEXT: Record<Field, string> = {
  title: 'คำนำหน้า',
  firstName: 'ชื่อ',
  lastName: 'นามสกุล',
  address: 'ที่อยู่ตามบัตรประชาชน',
  occupants: 'จำนวนผู้พัก',
  startDate: 'วันเริ่มสัญญา',
  endDate: 'วันสิ้นสุดสัญญา',
};
const FIELDS = Object.keys(FIELD_TEXT) as Field[];
const valueOf = (d: ContractData, f: Field): string | number => (f === 'address' ? d.addressText : d[f]);

export interface DataChange { field: Field; label: string; from: string | number; to: string | number }

/** What a request may send: separate fields (the step-3 form) or one-field name / address (older callers). */
export type ContractDataInput = Partial<Record<'title' | 'firstName' | 'lastName' | 'tenantName' | 'tenantAddress' | 'occupants' | 'startDate' | 'endDate' | keyof AddressParts, unknown>>;

const isDate = (v: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00+07:00`);
  return !Number.isNaN(d.getTime()) && bangkokDate(d) === v;
};
const str = (v: unknown) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '');

/** Check the data sent by the page; refuses with the first problem. */
function clean(input: ContractDataInput, now: Date): ContractData {
  // Name: separate fields, or one field split into title / first / last
  let title: Title | '';
  let firstName: string;
  let lastName: string;
  if (input.firstName !== undefined || input.lastName !== undefined || input.title !== undefined) {
    const t = str(input.title);
    if (!TITLES.includes(t as Title)) refuse('bad_title');
    title = t as Title;
    firstName = str(input.firstName);
    lastName = str(input.lastName);
    if (!firstName || !lastName || firstName.length > NAME_PART_MAX || lastName.length > NAME_PART_MAX) refuse('bad_name');
  } else {
    const full = str(input.tenantName);
    if (!full || full.length > NAME_MAX) refuse('bad_name');
    ({ title, firstName, lastName } = splitName(full));
    if (!firstName || firstName.length > NAME_PART_MAX || lastName.length > NAME_PART_MAX) refuse('bad_name');
  }

  // Address: separate fields, or one line split into the parts
  let address: AddressParts;
  let addressText: string;
  if (input.houseNo !== undefined) {
    address = Object.fromEntries(ADDRESS_FIELDS.map((f) => [f.key, str(input[f.key])])) as unknown as AddressParts;
    if (ADDRESS_FIELDS.some((f) => (f.required && !address[f.key]) || address[f.key].length > 100)) refuse('bad_address');
    if (address.postcode && !/^\d{5}$/.test(address.postcode)) refuse('bad_postcode');
    addressText = joinAddress(address);
  } else {
    addressText = typeof input.tenantAddress === 'string' ? input.tenantAddress.trim() : '';
    if (!addressText || addressText.length > ADDRESS_MAX) refuse('bad_address');
    address = addressFromText(addressText);
  }

  const occ = parseOccupants(input.occupants, NaN);
  if (!occ.ok || !Number.isInteger(occ.value)) refuse('bad_occupants');
  const startDate = String(input.startDate ?? '');
  const endDate = String(input.endDate ?? '');
  if (!isDate(startDate) || !isDate(endDate) || endDate <= startDate) refuse('bad_dates');
  if (startDate < bangkokDate(now)) refuse('start_passed');
  return { title, firstName, lastName, address, addressText, occupants: occ.value, startDate, endDate };
}

const CONTRACT_COLUMNS = `c.id, c.status, c.tenant_id, c.occupants, c.start_date, c.end_date, c.contract_file_url, c.move_in_bill_id,
       c.data_confirmed_at, c.tenant_title, c.tenant_first_name, c.tenant_last_name,
       c.addr_house_no, c.addr_moo, c.addr_soi, c.addr_road, c.addr_subdistrict, c.addr_district, c.addr_province, c.addr_postcode,
       r.room_number, t.user_id AS tenant_user_id,
       t.name AS tenant_name, COALESCE(NULLIF(c.tenant_address, ''), t.address) AS address`;

async function lockContract(client: Client, contractId: number) {
  const c = (await client.query(
    `SELECT ${CONTRACT_COLUMNS}
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? FOR UPDATE`,
    [contractId]
  )).rows[0];
  if (!c) refuse('not_found');
  return c;
}

/** The contract's data: its own separate fields (022), or split from the single-field name / address of older ones. */
function currentData(c: any): ContractData {
  const saved = Boolean(c.tenant_first_name);
  const name = saved
    ? { title: (c.tenant_title || '') as Title | '', firstName: String(c.tenant_first_name || ''), lastName: String(c.tenant_last_name || '') }
    : splitName(c.tenant_name);
  const address: AddressParts = c.addr_house_no
    ? {
      houseNo: c.addr_house_no || '', moo: c.addr_moo || '', soi: c.addr_soi || '', road: c.addr_road || '',
      subdistrict: c.addr_subdistrict || '', district: c.addr_district || '', province: c.addr_province || '', postcode: c.addr_postcode || '',
    }
    : addressFromText(c.address);
  return {
    ...name,
    address,
    addressText: String(c.address || ''),
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
  const fullName = joinName(data);
  await client.query('UPDATE tenants SET name = ?, address = ? WHERE id = ?', [fullName, data.addressText, c.tenant_id]);
  const a = data.address;
  await client.query(
    `UPDATE contracts SET tenant_address = ?, occupants = ?, start_date = ?, end_date = ?,
       tenant_title = ?, tenant_first_name = ?, tenant_last_name = ?,
       addr_house_no = ?, addr_moo = ?, addr_soi = ?, addr_road = ?, addr_subdistrict = ?, addr_district = ?, addr_province = ?, addr_postcode = ?
     WHERE id = ?`,
    [data.addressText, data.occupants, data.startDate, data.endDate,
      data.title || null, data.firstName, data.lastName || null,
      a.houseNo || null, a.moo || null, a.soi || null, a.road || null, a.subdistrict || null, a.district || null, a.province || null, a.postcode || null,
      c.id]
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
export function confirmContractData(contractId: number, input: ContractDataInput, by: number, now: Date) {
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
export function changeContractData(contractId: number, input: ContractDataInput, reason: unknown, by: number, now: Date) {
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    checkOpen(c);
    if (!c.data_confirmed_at) refuse('not_confirmed');
    const why = typeof reason === 'string' ? reason.trim() : '';
    if (!why || why.length > REASON_MAX) refuse('reason_required');
    const before = currentData(c);
    const data = clean(input, now);
    const changes: DataChange[] = FIELDS.filter((f) => String(valueOf(before, f)) !== String(valueOf(data, f)))
      .map((f) => ({ field: f, label: FIELD_TEXT[f], from: valueOf(before, f), to: valueOf(data, f) }));
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
  const rows = await sql(
    `SELECT ${CONTRACT_COLUMNS}, (SELECT u.name FROM users u WHERE u.id = c.data_confirmed_by) AS data_confirmed_by_name
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? LIMIT 1`,
    [contractId]
  );
  const c = rows[0];
  if (!c) return null;
  const history = await sql`
    SELECT h.id, h.changes, h.reason, h.changed_at, u.name AS changed_by_name
    FROM contract_data_changes h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.contract_id = ${contractId} ORDER BY h.id DESC
  `;
  const paper = isPaper(c.contract_file_url);
  const open = BOOKING_PAID_STATUSES.includes(c.status) && !c.move_in_bill_id && !paper;
  const d = currentData(c);
  return {
    contractId: Number(c.id),
    roomNumber: c.room_number as string,
    status: c.status as string,
    data: {
      ...d,
      /** one-field forms (older callers / display) */
      tenantName: joinName(d),
      tenantAddress: d.addressText,
    },
    /** the separate fields are saved on this contract (else they were split from the single-field name / address) */
    fieldsSaved: Boolean(c.tenant_first_name),
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
