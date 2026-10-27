// Meter readings and monthly bills (commit 14). Owner/manager only: they record and confirm in one step.
//
// Cycle (Thai time): from the 25th to the end of a month the reading belongs to that month; from the 1st to the 24th it
// is a late reading of the previous month. The server decides the cycle, never the page.
// Previous reading: the latest row of the room in the order it was recorded (id), whatever its kind (start / cycle /
// move_out); none → the contract's start meter; none → the owner enters it. A lower reading is refused unless it is a
// rollover (the meter passed its maximum) or a replaced meter. More than 200 units needs a confirmation. A photo is
// optional (storage/meters). A reading whose monthly bill was sent (not Draft / Cancelled) cannot be changed; while
// the bill is a draft, changing the reading re-prices the draft.
// Monthly bills: only rooms with a reading of the cycle and an Active contract; one monthly bill per tenant and cycle,
// kept unique in a transaction with the contract row locked (other bills of the month — repair, service, the final
// bill — are not counted). A contract that already has its final (move-out) bill for the cycle is skipped.
// AI meter reading (/api/owner/meters/ocr) only fills the page's field; its number comes here like a typed one.

import { type Client } from '@/lib/bill-status';
import { bangkokDate, priceMonthlyBill } from '@/lib/billing';
import { withRetry } from '@/lib/contracts';
import { getDb } from '@/lib/db';
import { deleteMeterPhoto, meterPhotoUrl, parseMeterPhoto, saveMeterPhoto } from '@/lib/meter-files';

export const LARGE_UNITS = 200;
const ELECTRICITY = 'Electricity';

export type MeterRefusal =
  | 'forbidden' | 'not_found' | 'no_contract' | 'bad_reading' | 'no_previous' | 'lower' | 'bad_event'
  | 'large_unconfirmed' | 'bill_sent' | 'later_reading' | 'bad_photo' | 'bad_cycle';

const MESSAGES: Record<MeterRefusal, string> = {
  forbidden: 'ไม่มีสิทธิ์จดมิเตอร์หรือออกบิล',
  not_found: 'ไม่พบห้องนี้',
  no_contract: 'ห้องนี้ไม่มีสัญญาเช่าที่ใช้งานอยู่ — ไม่ต้องจดมิเตอร์',
  bad_reading: 'เลขมิเตอร์ไม่ถูกต้อง (ต้องเป็นตัวเลขไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง)',
  no_previous: 'ห้องนี้ไม่มีเลขมิเตอร์ก่อนหน้าในระบบ กรุณากรอกเลขก่อนหน้า',
  lower: 'เลขมิเตอร์ใหม่น้อยกว่าเลขก่อนหน้า — ถ้ามิเตอร์วนรอบหรือเปลี่ยนเครื่อง ให้เลือกเหตุการณ์นั้น',
  bad_event: 'ข้อมูลมิเตอร์วนรอบ / เปลี่ยนเครื่องไม่ถูกต้อง',
  large_unconfirmed: `หน่วยที่ใช้เกิน ${LARGE_UNITS} หน่วย กรุณายืนยันก่อนบันทึก`,
  bill_sent: 'ส่งบิลรอบนี้ของห้องนี้ให้ผู้เช่าแล้ว แก้เลขมิเตอร์ไม่ได้',
  later_reading: 'มีการบันทึกมิเตอร์ของห้องนี้หลังจากรอบนี้แล้ว แก้เลขรอบนี้ไม่ได้',
  bad_photo: 'รูปมิเตอร์ไม่ถูกต้อง',
  bad_cycle: 'รอบบิลไม่ถูกต้อง',
};

class MeterRefused extends Error {
  constructor(public reason: MeterRefusal, public detail?: string) {
    super(reason);
  }
}

function refuse(reason: MeterRefusal, detail?: string): never {
  throw new MeterRefused(reason, detail);
}

export type MeterResult<T> = ({ ok: true } & T) | { ok: false; reason: MeterRefusal; message: string };

async function run<T>(work: (client: Client) => Promise<T>): Promise<MeterResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof MeterRefused) return { ok: false, reason: error.reason, message: error.detail || MESSAGES[error.reason] };
    throw error;
  }
}

export function meterRefusalStatus(reason: MeterRefusal): number {
  if (reason === 'forbidden') return 403;
  if (reason === 'not_found') return 404;
  if (reason === 'bill_sent' || reason === 'later_reading') return 409;
  return 400;
}

export interface Actor { id: number; role: string }
const isStaff = (u: Actor | null | undefined) => !!u && (u.role === 'owner' || u.role === 'manager');

const round2 = (n: number) => Math.round(n * 100) / 100;

/** A meter number: finite, not negative, at most 2 decimals. null when missing or invalid. */
function meterNumber(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || Math.abs(round2(n) - n) > 1e-9) return null;
  return round2(n);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** Billing cycle (YYYY-MM) a reading taken at `now` belongs to: 25th–end of month → that month; 1st–24th → previous month. */
export function cycleFor(now: Date): string {
  const [y, m, d] = bangkokDate(now).split('-').map(Number);
  if (d >= 25) return `${y}-${pad2(m)}`;
  return m === 1 ? `${y - 1}-12` : `${y}-${pad2(m - 1)}`;
}

/** Default maximum of a meter that rolled over: 10^(digits of the previous reading) − 1 (9,870 → 9,999). */
export function rolloverDefault(previous: number): number {
  const digits = String(Math.floor(Math.max(0, previous))).length;
  return 10 ** digits - 1;
}

/** Smallest step of a number as written (9999 → 1, 9999.9 → 0.1, 9999.99 → 0.01). */
function stepOf(n: number): number {
  const decimals = (String(n).split('.')[1] || '').length;
  return decimals === 0 ? 1 : decimals === 1 ? 0.1 : 0.01;
}

export type MeterEvent = 'normal' | 'rollover' | 'replaced';

export interface ReadingInput {
  current: unknown;
  event?: MeterEvent;
  rolloverAt?: unknown;
  oldMeterFinal?: unknown;
  newMeterStart?: unknown;
  note?: unknown;
  confirmLarge?: boolean;
  /** data URL of the meter photo (optional) */
  photo?: unknown;
  /** only used when the room has no earlier reading and no start meter */
  previous?: unknown;
}

/**
 * Units used from the previous reading. Refuses a lower reading without an event, and an event whose numbers do not fit.
 */
export function unitsFor(previous: number, input: ReadingInput) {
  const current = meterNumber(input.current);
  if (current === null) refuse('bad_reading');
  const event: MeterEvent = input.event === 'rollover' || input.event === 'replaced' ? input.event : 'normal';
  if (input.event !== undefined && input.event !== null && !['normal', 'rollover', 'replaced'].includes(input.event)) refuse('bad_event');

  if (event === 'normal') {
    if (current < previous) refuse('lower', `${MESSAGES.lower} (เลขก่อนหน้า ${previous})`);
    return { current, event, units: round2(current - previous), rolloverAt: null, oldMeterFinal: null, newMeterStart: null };
  }
  if (event === 'rollover') {
    const rolloverAt = input.rolloverAt === undefined || input.rolloverAt === null || input.rolloverAt === ''
      ? rolloverDefault(previous) : meterNumber(input.rolloverAt);
    if (rolloverAt === null || rolloverAt < previous) refuse('bad_event', `เลขสูงสุดของมิเตอร์ต้องไม่น้อยกว่าเลขก่อนหน้า (${previous})`);
    if (current >= previous) refuse('bad_event', 'มิเตอร์วนรอบ: เลขใหม่ต้องน้อยกว่าเลขก่อนหน้า');
    if (current > rolloverAt) refuse('bad_event', 'มิเตอร์วนรอบ: เลขใหม่ต้องไม่เกินเลขสูงสุดของมิเตอร์');
    const units = round2(rolloverAt - previous + stepOf(rolloverAt) + current);
    return { current, event, units, rolloverAt, oldMeterFinal: null, newMeterStart: null };
  }
  const oldMeterFinal = meterNumber(input.oldMeterFinal);
  const newMeterStart = meterNumber(input.newMeterStart);
  if (oldMeterFinal === null || newMeterStart === null) refuse('bad_event', 'เปลี่ยนเครื่อง: กรอกเลขสุดท้ายของเครื่องเก่าและเลขเริ่มของเครื่องใหม่');
  if (oldMeterFinal < previous) refuse('bad_event', `เปลี่ยนเครื่อง: เลขสุดท้ายของเครื่องเก่าต้องไม่น้อยกว่าเลขก่อนหน้า (${previous})`);
  if (current < newMeterStart) refuse('bad_event', 'เปลี่ยนเครื่อง: เลขใหม่ต้องไม่น้อยกว่าเลขเริ่มของเครื่องใหม่');
  const units = round2(oldMeterFinal - previous + (current - newMeterStart));
  return { current, event, units, rolloverAt: null, oldMeterFinal, newMeterStart };
}

/** Tagged-template wrapper so lib/billing.ts helpers run inside the transaction. */
const tagged = (client: Client) => (strings: TemplateStringsArray, ...values: any[]) =>
  client.query(strings.join('?'), values).then((r) => r.rows);

/** The latest reading of the room (any kind), optionally only rows recorded before `beforeId`. Locking read. */
async function latestReading(client: Client, roomId: number, beforeId?: number) {
  const rows = (await client.query(
    `SELECT id, current_reading FROM meter_readings
     WHERE room_id = ? AND type IN ('Electricity', 'Electric') AND current_reading IS NOT NULL ${beforeId ? 'AND id < ?' : ''}
     ORDER BY id DESC LIMIT 1 FOR UPDATE`,
    beforeId ? [roomId, beforeId] : [roomId]
  )).rows;
  return rows[0] ? round2(Number(rows[0].current_reading)) : null;
}

/** The previous reading for a new (or changed) reading of the room — what the record page shows. */
export async function previousReadingFor(client: Client, roomId: number, startMeter: unknown): Promise<number | null> {
  const latest = await latestReading(client, roomId);
  return latest !== null ? latest : meterNumber(startMeter);
}

/** The monthly bill of a room and cycle (not cancelled, not the move-in bill). Locking read. */
async function monthlyBillOfRoom(client: Client, roomNumber: string, cycle: string) {
  return (await client.query(
    `SELECT id, status FROM bills WHERE room_number = ? AND billing_cycle = ? AND COALESCE(bill_type, 'monthly') = 'monthly'
       AND COALESCE(is_first_bill, 0) = 0 AND LOWER(status) NOT IN ('cancelled', 'canceled') ORDER BY id LIMIT 1 FOR UPDATE`,
    [roomNumber, cycle]
  )).rows[0] || null;
}

/** Write the server price of a draft monthly bill (after its reading or the rates changed). */
export async function repriceDraft(client: Client, billId: number, roomNumber: string, cycle: string, now: Date) {
  const priced = await priceMonthlyBill(tagged(client), roomNumber, cycle, now);
  if ('error' in priced) return false;
  await client.query(
    `UPDATE bills SET amount = ?, room_amount = ?, water_amount = ?, electric_amount = ?, electric_units = ?, common_fee = ?, due_date = ?
     WHERE id = ?`,
    [priced.amount, priced.room_amount, priced.water_amount, priced.electric_amount, priced.electric_units, priced.common_fee, priced.due_date, billId]
  );
  return true;
}

/**
 * Record (or, before its bill is sent, correct) the monthly electricity reading of a room for the cycle of `now`.
 */
export async function recordReading(roomId: number, input: ReadingInput, by: Actor, now: Date) {
  if (!isStaff(by)) return { ok: false, reason: 'forbidden', message: MESSAGES.forbidden } as MeterResult<never>;
  let photo: { bytes: Buffer; ext: string } | null = null;
  if (input.photo !== undefined && input.photo !== null && input.photo !== '') {
    const parsed = parseMeterPhoto(input.photo);
    if (!parsed.ok) return { ok: false, reason: 'bad_photo', message: parsed.message } as MeterResult<never>;
    photo = parsed;
  }
  const note = typeof input.note === 'string' ? input.note.trim().slice(0, 500) : '';
  let savedFile: string | null = null;

  try {
    const result = await run(async (client) => {
      const room = (await client.query('SELECT id, room_number, COALESCE(dorm_id, 1) AS dorm_id FROM rooms WHERE id = ? FOR UPDATE', [roomId])).rows[0];
      if (!room) refuse('not_found');
      const contract = (await client.query(
        "SELECT id, tenant_id, start_meter_reading FROM contracts WHERE room_id = ? AND status = 'Active' ORDER BY id DESC LIMIT 1 FOR UPDATE",
        [roomId]
      )).rows[0];
      if (!contract) refuse('no_contract');

      const cycle = cycleFor(now);
      const existing = (await client.query(
        "SELECT id, photo_file FROM meter_readings WHERE room_id = ? AND type = ? AND kind = 'cycle' AND billing_cycle = ? FOR UPDATE",
        [roomId, ELECTRICITY, cycle]
      )).rows[0] || null;
      const bill = await monthlyBillOfRoom(client, room.room_number, cycle);
      if (bill && String(bill.status).toLowerCase() !== 'draft') refuse('bill_sent', `${MESSAGES.bill_sent} (บิล #${bill.id} รอบ ${cycle})`);

      let previous: number | null;
      if (existing) {
        const later = (await client.query(
          "SELECT id FROM meter_readings WHERE room_id = ? AND type IN ('Electricity', 'Electric') AND id > ? LIMIT 1 FOR UPDATE",
          [roomId, existing.id]
        )).rows[0];
        if (later) refuse('later_reading');
        previous = await latestReading(client, roomId, existing.id);
      } else {
        previous = await latestReading(client, roomId);
      }
      if (previous === null) previous = meterNumber(contract.start_meter_reading);
      if (previous === null) previous = meterNumber(input.previous);
      if (previous === null) refuse('no_previous');

      const reading = unitsFor(previous, input);
      if (reading.units > LARGE_UNITS && input.confirmLarge !== true) {
        refuse('large_unconfirmed', `หน่วยที่ใช้ ${reading.units} หน่วย (เกิน ${LARGE_UNITS}) กรุณายืนยันก่อนบันทึก`);
      }

      if (photo) savedFile = saveMeterPhoto(photo);
      const values = [previous, reading.current, reading.units, reading.event, reading.rolloverAt, reading.oldMeterFinal,
        reading.newMeterStart, note || null, reading.units > LARGE_UNITS ? 1 : 0, by.id, now, by.id, now];
      let readingId: number;
      if (existing) {
        readingId = Number(existing.id);
        await client.query(
          `UPDATE meter_readings SET previous_reading = ?, current_reading = ?, units_used = ?, event = ?, rollover_at = ?, old_meter_final = ?,
             new_meter_start = ?, event_note = ?, large_confirmed = ?, recorded_by = ?, recorded_at = ?, confirmed_by = ?, confirmed_at = ?
           WHERE id = ?`,
          [...values, readingId]
        );
      } else {
        readingId = Number((await client.query(
          `INSERT INTO meter_readings (dorm_id, room_id, type, billing_cycle, kind, previous_reading, current_reading, units_used, event, rollover_at,
             old_meter_final, new_meter_start, event_note, large_confirmed, recorded_by, recorded_at, confirmed_by, confirmed_at, created_at)
           VALUES (?, ?, ?, ?, 'cycle', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [room.dorm_id, roomId, ELECTRICITY, cycle, ...values, now]
        )).rows.insertId);
      }
      let replacedFile: string | null = null;
      if (savedFile) {
        await client.query('UPDATE meter_readings SET photo_file = ?, photo_url = ? WHERE id = ?', [savedFile, meterPhotoUrl(readingId), readingId]);
        replacedFile = existing?.photo_file || null;
      }
      const draftRepriced = bill ? await repriceDraft(client, Number(bill.id), room.room_number, cycle, now) : false;
      return {
        readingId, cycle, roomNumber: room.room_number as string, previous, current: reading.current, units: reading.units,
        event: reading.event, updated: !!existing, draftBillId: bill ? Number(bill.id) : null, draftRepriced, replacedFile,
      };
    });
    if (!result.ok) deleteMeterPhoto(savedFile);
    else if (result.replacedFile) deleteMeterPhoto(result.replacedFile);
    return result;
  } catch (error) {
    deleteMeterPhoto(savedFile);
    throw error;
  }
}

export type IssueSkip = 'no_contract' | 'not_recorded' | 'exists' | 'final_bill' | 'price_error';

/**
 * Issue the draft monthly bill of one room for a cycle. Skips (not an error) when the room has no Active contract,
 * no reading of the cycle, already a monthly bill, or the final bill of the contract for this cycle.
 */
export async function issueMonthlyBill(roomNumber: string, cycle: string, by: Actor, now: Date, title?: string | null) {
  if (!isStaff(by)) return { ok: false, reason: 'forbidden', message: MESSAGES.forbidden } as MeterResult<never>;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(cycle) || cycle > cycleFor(now)) {
    return { ok: false, reason: 'bad_cycle', message: `${MESSAGES.bad_cycle} (ออกได้ถึงรอบ ${cycleFor(now)})` } as MeterResult<never>;
  }
  return run(async (client) => {
    const room = (await client.query('SELECT id, room_number, COALESCE(dorm_id, 1) AS dorm_id FROM rooms WHERE room_number = ? LIMIT 1', [roomNumber])).rows[0];
    if (!room) refuse('not_found', `ไม่พบห้อง ${roomNumber}`);
    const skip = (reason: IssueSkip, message: string, billId: number | null = null) =>
      ({ issued: false as const, skipped: reason, message, billId, roomNumber: room.room_number as string, amount: 0 });

    // The contract row lock makes two issuers of the same tenant and cycle wait for each other
    const contract = (await client.query(
      "SELECT id, tenant_id FROM contracts WHERE room_id = ? AND status = 'Active' ORDER BY id DESC LIMIT 1 FOR UPDATE",
      [room.id]
    )).rows[0];
    if (!contract || !contract.tenant_id) return skip('no_contract', 'ไม่มีสัญญาเช่าที่ใช้งานอยู่');
    const reading = (await client.query(
      "SELECT id FROM meter_readings WHERE room_id = ? AND type IN ('Electricity', 'Electric') AND kind = 'cycle' AND billing_cycle = ? LIMIT 1",
      [room.id, cycle]
    )).rows[0];
    if (!reading) return skip('not_recorded', `ยังไม่ได้จดมิเตอร์รอบ ${cycle}`);
    const finalBill = (await client.query(
      `SELECT id FROM bills WHERE tenant_id = ? AND billing_cycle = ? AND bill_type = 'move_out' AND LOWER(status) NOT IN ('cancelled', 'canceled')
       LIMIT 1 FOR UPDATE`,
      [contract.tenant_id, cycle]
    )).rows[0];
    if (finalBill) return skip('final_bill', `มีบิลสุดท้ายก่อนย้ายออกรอบ ${cycle} แล้ว (บิล #${finalBill.id})`, Number(finalBill.id));
    const existing = (await client.query(
      `SELECT id FROM bills WHERE tenant_id = ? AND billing_cycle = ? AND COALESCE(bill_type, 'monthly') = 'monthly'
         AND COALESCE(is_first_bill, 0) = 0 AND LOWER(status) NOT IN ('cancelled', 'canceled') LIMIT 1 FOR UPDATE`,
      [contract.tenant_id, cycle]
    )).rows[0];
    if (existing) return skip('exists', `มีบิลรายเดือนรอบ ${cycle} แล้ว (บิล #${existing.id})`, Number(existing.id));

    const priced = await priceMonthlyBill(tagged(client), room.room_number, cycle, now);
    if ('error' in priced) return skip('price_error', priced.error as string);
    const billId = Number((await client.query(
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         common_fee, billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, 'Draft', 0, 'monthly', 0, ?)`,
      [priced.tenant_id, room.dorm_id, room.room_number,
        ((title && String(title).trim()) || `ค่าเช่าห้องและสาธารณูปโภค (${cycle})`) + (priced.move_in_covered.includes('room') ? ' — ไม่รวมค่าเช่า (เก็บในบิลค่าแรกเข้าแล้ว)' : ''), priced.amount,
        priced.room_amount, priced.water_amount, priced.electric_amount, priced.electric_units, priced.common_fee, cycle, priced.due_date, now]
    )).rows.insertId);
    await client.query(
      "INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by, changed_at) VALUES (?, NULL, 'Draft', 'ออกบิลรายเดือน (ร่าง)', ?, ?)",
      [billId, by.id, now]
    );
    return { issued: true as const, skipped: null, message: 'ออกบิลร่างแล้ว', billId, roomNumber: room.room_number as string, amount: priced.amount, tenantId: Number(priced.tenant_id), dueDate: priced.due_date };
  });
}

/**
 * Issue draft monthly bills of a cycle for every room with an Active contract. Rooms without a reading get no bill.
 */
export async function issueMonthlyBills(cycle: string | null | undefined, by: Actor, now: Date) {
  if (!isStaff(by)) return { ok: false, reason: 'forbidden', message: MESSAGES.forbidden } as MeterResult<never>;
  const target = cycle || cycleFor(now);
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(target) || target > cycleFor(now)) {
    return { ok: false, reason: 'bad_cycle', message: `${MESSAGES.bad_cycle} (ออกได้ถึงรอบ ${cycleFor(now)})` } as MeterResult<never>;
  }
  const sql = getDb();
  const rooms = await sql`
    SELECT DISTINCT r.room_number FROM rooms r JOIN contracts c ON c.room_id = r.id AND c.status = 'Active'
    ORDER BY r.room_number
  `;
  const results = [];
  for (const r of rooms) {
    const res = await issueMonthlyBill(r.room_number, target, by, now);
    results.push(res.ok ? res : { issued: false, skipped: res.reason, message: res.message, billId: null, roomNumber: r.room_number, amount: 0 });
  }
  return {
    ok: true as const,
    cycle: target,
    issued: results.filter((r: any) => r.issued),
    skipped: results.filter((r: any) => !r.issued),
  };
}

/** Owner/manager, or a tenant who was billed for that room and cycle (or initial move-in meter photo). */
export async function canViewMeterPhoto(user: { id: number; email?: string | null; role: string }, readingId: number) {
  const sql = getDb();
  const rows = await sql`
    SELECT m.id, m.photo_file, m.billing_cycle, m.kind, m.room_id, r.room_number FROM meter_readings m JOIN rooms r ON r.id = m.room_id
    WHERE m.id = ${readingId} LIMIT 1
  `;
  const m = rows[0];
  if (!m || !m.photo_file) return null;
  if (isStaff(user)) return m.photo_file as string;

  // Allow tenant or guest who holds the contract for this room (e.g. for initial meter photo)
  if (m.kind === 'start') {
    const contract = await sql`
      SELECT c.id FROM contracts c
      LEFT JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN users u ON u.id = t.user_id
      WHERE c.room_id = ${m.room_id}
        AND (u.id = ${user.id} OR LOWER(COALESCE(t.email, u.email, '')) = LOWER(${user.email || ''}))
      LIMIT 1
    `;
    if (contract.length > 0) return m.photo_file as string;
  }

  if (user.role !== 'tenant') return null;
  const mine = await sql`
    SELECT b.id FROM bills b JOIN tenants t ON t.id = b.tenant_id
    WHERE b.room_number = ${m.room_number} AND b.billing_cycle = ${m.billing_cycle}
      AND (t.user_id = ${user.id} OR LOWER(t.email) = LOWER(${user.email || ''}))
    LIMIT 1
  `;
  return mine.length > 0 ? (m.photo_file as string) : null;
}
