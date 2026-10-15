// Booking flow (approve, then pay): request -> owner/manager approves or rejects -> guest pays the booking fee
// within 10 minutes. There is no scheduler: expired bookings are expired when bookings or rooms are read or written
// (expireBookings). Every function takes `now` from the app; MySQL NOW() is never used for booking times.
// Times are stored as Thai local time (the pool in lib/mysql-adapter.js uses timezone +07:00).

import { bangkokDate, bookingFeeFor, getDormPromptPay } from '@/lib/billing';
import { type Client } from '@/lib/bill-status';
import { ROOM_HOLDING_STATUSES, createContractTx, Refused, contractMessage, withRetry, type ContractRefusal } from '@/lib/contracts';
import { recordPaymentInTransaction, slipPaidAt } from '@/lib/payments';
import { forfeitBookingFee } from '@/lib/deposits';
import { formatBaht } from '@/lib/format';

export const OPEN_HOUR = 8; // requests from 08:00:00
export const CLOSE_HOUR = 20; // until 19:59:59; requests not approved by 20:00 expire
export const PAY_MINUTES = 10; // transfer within 10 minutes of approval
export const UPLOAD_MINUTES = 15; // slip upload accepted until approval + 15 minutes

const MINUTE = 60 * 1000;
const OPEN = ['BookingRequested', 'BookingApproved'];
// Booking fee paid; the owner prepares the contract and the move-in bill
const PAID = ['PendingOwnerSignature', 'PendingContract', 'PendingFirstBill'];

export type BookingRefusal = ContractRefusal | 'outside_hours' | 'not_found' | 'not_owner'
  | 'not_requested' | 'not_approved' | 'expired' | 'slip_rejected' | 'slip_time' | 'payment_failed'
  | 'not_paid_booking' | 'too_early' | 'first_bill_paid' | 'legacy';

export type BookingResult<T> = ({ ok: true } & T) | { ok: false; reason: BookingRefusal; message: string; expected?: number };

class BookingRefused extends Error {
  constructor(public reason: BookingRefusal, public detail?: string) { super(reason); }
}
function refuse(reason: BookingRefusal, detail?: string): never {
  throw new BookingRefused(reason, detail);
}

const MESSAGES: Partial<Record<BookingRefusal, string>> = {
  outside_hours: 'รับคำขอจองทุกวัน 08:00–20:00 น. — ตอนนี้นอกเวลา กรุณาส่งคำขอใหม่ในช่วงเวลาดังกล่าว',
  not_found: 'ไม่พบข้อมูลการจอง',
  not_owner: 'ไม่พบข้อมูลการจอง',
  not_requested: 'การจองนี้ไม่ได้อยู่ในสถานะรออนุมัติ',
  not_approved: 'การจองนี้ไม่ได้อยู่ในสถานะรอชำระค่าจอง',
  slip_time: 'เวลาโอนในสลิปต้องอยู่หลังเวลาที่หอพักอนุมัติ และภายใน 10 นาที',
  not_paid_booking: 'ยกเลิกแบบไม่มาตามนัดได้เฉพาะการจองที่ชำระค่าจองแล้ว',
  too_early: 'ยังไม่เลยวันเข้าพักที่นัดไว้',
  first_bill_paid: 'มีการชำระบิลแรกเข้าแล้ว กรุณาจัดการด้วยมือ',
  legacy: 'สัญญาแบบเดิม — จัดการด้วยมือ (ไม่มีบิลเข้าอยู่ในระบบใหม่ จึงตรวจการชำระก่อนริบค่าจองไม่ได้)',
};

export { withRetry };

async function run<T>(work: (client: Client) => Promise<T>): Promise<BookingResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof BookingRefused) {
      return { ok: false, reason: error.reason, message: error.detail || MESSAGES[error.reason] || 'ทำรายการไม่สำเร็จ' };
    }
    if (error instanceof Refused) {
      return { ok: false, reason: error.reason, message: contractMessage(error), ...(error.expected !== undefined ? { expected: error.expected } : {}) };
    }
    throw error;
  }
}

/** Hour and minute in Asia/Bangkok. */
function bangkokClock(now: Date) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value || 0);
  return { hour: get('hour'), minute: get('minute') };
}

/** Whether requests are accepted at `now` (08:00:00–19:59:59 Thai time) and when today's requests expire (20:00). */
export function bookingWindow(now: Date) {
  const { hour } = bangkokClock(now);
  const closesAt = new Date(`${bangkokDate(now)}T${String(CLOSE_HOUR).padStart(2, '0')}:00:00+07:00`);
  return { open: hour >= OPEN_HOUR && hour < CLOSE_HOUR, closesAt };
}

/** Deadlines of an approved booking. */
export function bookingDeadlines(approvedAt: Date) {
  return {
    payBy: new Date(approvedAt.getTime() + PAY_MINUTES * MINUTE),
    uploadBy: new Date(approvedAt.getTime() + UPLOAD_MINUTES * MINUTE),
  };
}

/** A transfer counts if its minute is between the approval minute and the minute of approval + 10 (bank clocks differ slightly). */
export function slipTimeAllowed(slipAt: Date, approvedAt: Date) {
  const minute = (d: Date) => Math.floor(d.getTime() / MINUTE);
  return minute(slipAt) >= minute(approvedAt) && minute(slipAt) <= minute(bookingDeadlines(approvedAt).payBy);
}

/** The room goes back to Available when no contract holds it any more. */
export async function releaseRoom(client: Client, roomId: number) {
  const holding = (await client.query(
    `SELECT id FROM contracts WHERE room_id = ? AND status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')}) LIMIT 1`,
    [roomId, ...ROOM_HOLDING_STATUSES]
  )).rows[0];
  if (!holding) await client.query("UPDATE rooms SET status = 'Available' WHERE id = ? AND status = 'Reserved'", [roomId]);
}

async function cancelUnpaidBookingBill(client: Client, billId: number | null) {
  if (billId) await client.query("UPDATE bills SET status = 'Cancelled' WHERE id = ? AND LOWER(status) = 'unpaid'", [billId]);
}

/** Tell the booker their booking ran out of time (key booking_expired:<contract>, migration 016). */
async function notifyExpired(client: Client, c: { id: number; status: string }, now: Date) {
  const who = (await client.query(
    `SELECT r.room_number, COALESCE(t.user_id, u.id) AS user_id
     FROM contracts c
     LEFT JOIN rooms r ON r.id = c.room_id
     LEFT JOIN tenants t ON t.id = c.tenant_id
     LEFT JOIN users u ON t.user_id IS NULL AND LOWER(u.email) = LOWER(t.email)
     WHERE c.id = ?`,
    [c.id]
  )).rows[0];
  if (!who?.user_id) return;
  const room = who.room_number || '-';
  const message = c.status === 'BookingRequested'
    ? `คำขอจองห้อง ${room} หมดเวลา: หอพักยังไม่ได้อนุมัติภายใน 20:00 — ส่งคำขอใหม่ได้ (รับคำขอ 08:00–20:00)`
    : `การจองห้อง ${room} หมดเวลา: ไม่ได้ชำระค่าจองภายในเวลาที่กำหนด — ห้องถูกปล่อยว่างแล้ว`;
  await client.query(
    `INSERT IGNORE INTO notifications (user_id, title, message, type, is_read, link, created_at, event_key)
     VALUES (?, 'การจองหมดเวลา', ?, 'booking', 0, '/explore/booking-status', ?, ?)`,
    [who.user_id, message, now, `booking_expired:${c.id}`]
  ).catch((e) => console.warn('[booking expired notify]', e));
}

/**
 * Expire requests not approved by 20:00 and approved bookings not paid within the upload window.
 * Rows are locked, so a payment arriving at the same moment either completes first or sees the booking expired.
 */
export async function expireBookings(client: Client, now: Date): Promise<number> {
  const due = (await client.query(
    "SELECT id, status, room_id, booking_bill_id FROM contracts WHERE status IN ('BookingRequested', 'BookingApproved') AND expires_at <= ? FOR UPDATE",
    [now]
  )).rows;
  for (const c of due) {
    await client.query(
      "UPDATE contracts SET status = 'Expired', cancelled_at = ?, cancel_reason = 'หมดเวลา' WHERE id = ?",
      [now, c.id]
    );
    await cancelUnpaidBookingBill(client, c.booking_bill_id);
    await releaseRoom(client, c.room_id);
    await notifyExpired(client, c, now);
  }
  return due.length;
}

/** For read paths (room lists, booking status): expire what is due in its own short transaction. */
export async function expireDueBookings(now: Date = new Date()) {
  return withRetry((client) => expireBookings(client, now));
}

export interface BookingRequestInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  idCardNumber?: string | null;
  idCardImage?: string | null;
  address?: string | null;
  parentPhone?: string | null;
  roomId: number;
  startDate: string;
  endDate: string;
  signature?: string | null;
}

/** A guest asks to book a room (no payment yet). One booking/contract per account until it ends; the room must be free. */
export function requestBooking(input: BookingRequestInput, now: Date) {
  return run(async (client) => {
    const window = bookingWindow(now);
    if (!window.open) refuse('outside_hours');
    await expireBookings(client, now);

    const room = (await client.query('SELECT room_number FROM rooms WHERE id = ?', [input.roomId])).rows[0];
    if (!room) refuse('room_not_found');
    const created = await createContractTx(client, {
      account: {
        email: input.email, name: input.name, phone: input.phone, idCardNumber: input.idCardNumber,
        idCardImage: input.idCardImage, address: input.address, emergencyContact: input.parentPhone, role: 'guest',
      },
      roomId: input.roomId,
      startDate: input.startDate,
      endDate: input.endDate,
      depositAmount: bookingFeeFor(room.room_number),
      status: 'BookingRequested',
      requireRoomFree: true,
      // One booking/contract per account until it ends (requested, approved, paid, waiting to move in, or living here)
      oneOpenContract: true,
      signature: input.signature || 'CONFIRMED_E_CONTRACT',
      idCardNumber: input.idCardNumber,
      tenantAddress: input.address,
      parentPhone: input.parentPhone,
      expiresAt: window.closesAt,
    });
    return { contractId: created.contractId, tenantId: created.tenantId, roomNumber: created.roomNumber, expiresAt: window.closesAt };
  });
}

async function lockBooking(client: Client, contractId: number) {
  const c = (await client.query(
    `SELECT c.*, t.email AS tenant_email, t.user_id AS tenant_user_id, r.room_number, COALESCE(r.dorm_id, 1) AS dorm_id
     FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? FOR UPDATE`,
    [contractId]
  )).rows[0];
  if (!c) refuse('not_found');
  return c;
}

/** Owner/manager approves: the guest now has 10 minutes to transfer (upload until +15) and a booking bill is created. */
export function approveBooking(contractId: number, by: number, now: Date) {
  return run(async (client) => {
    await expireBookings(client, now);
    const c = await lockBooking(client, contractId);
    if (c.status === 'Expired') refuse('expired', 'คำขอนี้หมดอายุแล้ว (เลย 20:00 น.)');
    if (c.status !== 'BookingRequested') refuse('not_requested');

    const { payBy, uploadBy } = bookingDeadlines(now);
    const fee = bookingFeeFor(c.room_number);
    const billId = (await client.query(
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         billing_cycle, due_date, status, bill_type, slip_verified)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 'ค่าจองห้องพักเพื่อยืนยันสิทธิ์', ?, 'Unpaid', 'booking', 0)`,
      [c.tenant_id, c.dorm_id, c.room_number, `ค่าจองห้องพัก (ห้อง ${c.room_number})`, fee, fee, bangkokDate(payBy)]
    )).rows.insertId;
    await client.query(
      "UPDATE contracts SET status = 'BookingApproved', approved_at = ?, approved_by = ?, expires_at = ?, booking_bill_id = ? WHERE id = ?",
      [now, by, uploadBy, billId, contractId]
    );
    return { contractId, billId: Number(billId), payBy, uploadBy, tenantUserId: c.tenant_user_id as number | null, tenantEmail: c.tenant_email as string, roomNumber: c.room_number as string, fee };
  });
}

/** Owner/manager rejects a request that is still waiting for approval (nothing has been paid). */
export function rejectBooking(contractId: number, by: number, reason: string, now: Date) {
  return run(async (client) => {
    await expireBookings(client, now);
    const c = await lockBooking(client, contractId);
    if (c.status !== 'BookingRequested') refuse('not_requested');
    await client.query(
      "UPDATE contracts SET status = 'Rejected', cancelled_at = ?, cancelled_by = ?, cancel_reason = ? WHERE id = ?",
      [now, by, String(reason || '').trim().slice(0, 500) || 'ปฏิเสธโดยหอพัก', contractId]
    );
    await releaseRoom(client, c.room_id);
    return { contractId, tenantUserId: c.tenant_user_id as number | null, roomNumber: c.room_number as string };
  });
}

export interface PayBookingInput {
  contractId: number;
  userEmail: string;
  userId: number | null;
  /** Result of verifySlipWithSlipOK for the uploaded slip */
  slip: any;
  slipUrl?: string | null;
}

async function contactPhone(client: Client) {
  const row = (await client.query('SELECT phone FROM dormitory_profile LIMIT 1', [])).rows[0];
  return row?.phone || '';
}

/**
 * The guest pays an approved booking. The slip is checked by the route (SlipOK) before this; here, in one
 * transaction with the contract row locked, status and time are checked again and the payment is recorded.
 */
export function payBooking(input: PayBookingInput, now: Date) {
  return run(async (client) => {
    const c = await lockBooking(client, input.contractId);
    const owns = (c.tenant_email && String(c.tenant_email).toLowerCase() === input.userEmail.toLowerCase())
      || (c.tenant_user_id && Number(c.tenant_user_id) === Number(input.userId || 0));
    if (!owns) refuse('not_owner');

    const expiredMessage = async () => {
      const phone = await contactPhone(client);
      return `การจองหมดเวลาแล้ว หากโอนเงินแล้วกรุณาติดต่อหอพัก${phone ? ` โทร ${phone}` : ''}`;
    };
    if (c.status === 'Expired') refuse('expired', await expiredMessage());
    if (c.status !== 'BookingApproved' || !c.approved_at) refuse('not_approved');
    const approvedAt = new Date(c.approved_at);
    // Past the upload window: refused (the booking itself is expired by the next read/write)
    if (now.getTime() > bookingDeadlines(approvedAt).uploadBy.getTime()) refuse('expired', await expiredMessage());

    if (!input.slip?.success || input.slip.amount === undefined) {
      refuse('slip_rejected', input.slip?.message || 'สลิปไม่ผ่านการตรวจสอบ');
    }
    const paidAt = slipPaidAt(input.slip);
    if (!slipTimeAllowed(paidAt, approvedAt)) refuse('slip_time');

    const payment = await recordPaymentInTransaction(client, Number(c.booking_bill_id), {
      amount: Number(input.slip.amount),
      method: 'slip',
      paidAt,
      slipRef: input.slip.transRef || null,
      slipUrl: input.slipUrl || null,
      slipData: JSON.stringify(input.slip.rawData || {}),
      recordedBy: input.userId,
    });
    if (!payment.ok) {
      const message = payment.reason === 'amount_mismatch' ? `ยอดในสลิปไม่ตรงกับค่าจอง ฿${formatBaht(payment.required)}`
        : payment.reason === 'duplicate_slip' ? 'สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้'
        : 'บันทึกการชำระค่าจองไม่สำเร็จ';
      refuse('payment_failed', message);
    }
    await client.query(
      "UPDATE contracts SET status = 'PendingOwnerSignature', signed_at = ?, slip_url = COALESCE(?, slip_url) WHERE id = ?",
      [now, input.slipUrl || null, input.contractId]
    );
    return { contractId: input.contractId, paymentId: payment.paymentId, roomNumber: c.room_number as string };
  });
}

/** The guest cancels a booking that has not been paid yet: nothing to forfeit, the room is released. */
export function cancelUnpaidBooking(contractId: number, by: number | null, now: Date) {
  return run(async (client) => {
    const c = await lockBooking(client, contractId);
    if (!OPEN.includes(c.status)) refuse('not_requested');
    await client.query(
      "UPDATE contracts SET status = 'Cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = 'ผู้จองยกเลิกก่อนชำระค่าจอง' WHERE id = ?",
      [now, by, contractId]
    );
    await cancelUnpaidBookingBill(client, c.booking_bill_id);
    await releaseRoom(client, c.room_id);
    return { contractId };
  });
}

/**
 * The guest did not come on the move-in date: cancel and forfeit the booking fee (same as a booker cancelling).
 * Only after the move-in date, and not when the move-in bill already has a payment.
 */
export async function cancelNoShow(contractId: number, by: number, now: Date) {
  const result = await run(async (client) => {
    const c = await lockBooking(client, contractId);
    if (!PAID.includes(c.status)) refuse('not_paid_booking');
    // Older contract (PendingFirstBill without move_in_bill_id): its move-in payment cannot be checked here
    if (c.status === 'PendingFirstBill' && !c.move_in_bill_id) refuse('legacy');
    if (!c.start_date || bangkokDate(now) <= bangkokDate(c.start_date)) refuse('too_early');

    const firstBills = (await client.query(
      `SELECT b.id, b.status,
         (SELECT COUNT(*) FROM bill_payments p WHERE p.bill_id = b.id AND p.voided_at IS NULL) AS payments
       FROM bills b WHERE b.tenant_id = ? AND b.is_first_bill = 1 AND LOWER(b.status) <> 'cancelled' FOR UPDATE`,
      [c.tenant_id]
    )).rows;
    if (firstBills.some((b: any) => ['paid', 'partial'].includes(String(b.status).toLowerCase()) || Number(b.payments) > 0)) {
      refuse('first_bill_paid');
    }
    for (const b of firstBills) await client.query("UPDATE bills SET status = 'Cancelled' WHERE id = ?", [b.id]);
    await client.query(
      "UPDATE contracts SET status = 'Cancelled', cancelled_at = ?, cancelled_by = ?, cancel_reason = 'ไม่มาตามนัด' WHERE id = ?",
      [now, by, contractId]
    );
    await releaseRoom(client, c.room_id);
    return { contractId, tenantId: c.tenant_id as number, roomNumber: c.room_number as string };
  });
  if (!result.ok) return result;
  // Same as a booker cancelling: what is held as deposit from the booking fee becomes income
  const forfeited = await forfeitBookingFee(result.tenantId);
  return { ...result, forfeited };
}

/** Walk-in whose booking payment failed: undo the contract and bill just created and release the room. */
export function voidFailedBooking(contractId: number, billId: number | null, now: Date) {
  return withRetry(async (client) => {
    const c = await lockBooking(client, contractId);
    await client.query(
      "UPDATE contracts SET status = 'Cancelled', cancelled_at = ?, cancel_reason = 'ชำระค่าจองไม่สำเร็จ' WHERE id = ?",
      [now, contractId]
    );
    if (billId) await client.query("UPDATE bills SET status = 'Cancelled' WHERE id = ? AND LOWER(status) <> 'paid'", [billId]);
    await releaseRoom(client, c.room_id);
  });
}

/** Expected receiver for booking slips (the dorm's own PromptPay). */
export async function bookingSlipReceiver(sql: any) {
  const profile = (await sql`SELECT name, promptpay_name FROM dormitory_profile LIMIT 1`)[0] || {};
  return {
    name: profile.promptpay_name || profile.name || 'หอพักเกษร 2',
    promptpay: (await getDormPromptPay(sql)) || '',
    dormName: profile.name || 'หอพักเกษร 2',
    isBooking: true,
    checkPromptPayOnly: true,
  };
}
