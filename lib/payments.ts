// The only place that marks a bill as Paid. Every payment is recorded in bill_payments and in
// accounting_transactions (deposit part as Liability, the rest as Income), inside a single transaction.

import { getDb } from '@/lib/db';
import { Pool } from '@/lib/mysql-adapter';
import { bangkokDate, calcLateFee, getRates, type Rates } from '@/lib/billing';
import { isStatus, logStatus } from '@/lib/bill-status';

/** deposit_offset: paid from the tenant's deposit at move-out (lib/moveOut.ts writes the matching Liability row) */
export type PaymentMethod = 'slip' | 'cash' | 'transfer' | 'deposit_offset';

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  slipRef?: string | null;
  slipUrl?: string | null;
  slipData?: string | null;
  recordedBy?: number | null;
  note?: string | null;
  /** Staff-recorded cash/transfer may cover part of the bill; slip payments must cover it all. */
  allowPartial?: boolean;
  /** Late fee counted up to this time instead of paidAt (deposit_offset: up to the room return date). */
  lateFeeAsOf?: Date;
}

export type PaymentResult =
  | { ok: true; paymentId: number; status: 'Paid' | 'Partial'; required: number; outstanding: number; lateFee: number; daysOverdue: number }
  | { ok: false; reason: 'invalid_input' | 'not_found' | 'already_paid' | 'cancelled' | 'not_sent' }
  | { ok: false; reason: 'duplicate_slip' }
  | { ok: false; reason: 'insufficient' | 'amount_mismatch'; required: number }
  | { ok: false; reason: 'exceeds'; outstanding: number };

// Validated here because MySQL may run without strict mode and silently coerce bad values
const METHODS: PaymentMethod[] = ['slip', 'cash', 'transfer', 'deposit_offset'];

// Income category of the non-deposit part (a move-in bill's first month of rent is Rent)
const ACCOUNTING_CATEGORY: Record<string, string> = { service: 'Service', move_out_damage: 'Damage' };

const toSatang = (n: number) => Math.round(Number(n) * 100);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Part of a bill that is a deposit (held for the tenant, a liability, not income):
 * a booking bill is all deposit; a move-in bill is its amount minus the first month of rent.
 */
export function depositPortion(bill: { bill_type?: string | null; is_first_bill?: number | boolean | null; amount: number | string; room_amount?: number | string | null }) {
  if (Number(bill.is_first_bill) === 1) return round2(Math.max(0, Number(bill.amount) - Number(bill.room_amount || 0)));
  return bill.bill_type === 'booking' ? round2(Number(bill.amount)) : 0;
}

/**
 * Amount still owed at `asOf`: bill amount + late fee at that time − payments already received (not voided).
 * The late fee is a flat daily rate, so it does not depend on how much has been paid.
 */
export function outstandingFor(
  bill: { amount: number | string; bill_type?: string | null; status?: string | null; due_date?: Date | string | null },
  paidTotal: number,
  asOf: Date | string | number,
  rates: Rates
) {
  const { lateFee, daysOverdue } = calcLateFee(bill, asOf, rates);
  const due = round2(Number(bill.amount) + lateFee);
  return { due, lateFee, daysOverdue, paidTotal: round2(paidTotal), outstanding: round2(Math.max(0, due - paidTotal)) };
}

export interface PaymentSummary {
  paid_total: number;
  payments: { id: number; amount: number; method: string; paid_at: Date; voided: boolean }[];
}

/** Payments per bill (voided ones included for history, excluded from paid_total). */
export async function getPaymentSummaries(sql: any, billIds: number[]): Promise<Map<number, PaymentSummary>> {
  const map = new Map<number, PaymentSummary>();
  if (billIds.length === 0) return map;
  const rows = await sql`
    SELECT id, bill_id, amount, method, paid_at, voided_at FROM bill_payments
    WHERE bill_id IN (${billIds}) ORDER BY id
  `;
  for (const r of rows) {
    const s = map.get(r.bill_id) || { paid_total: 0, payments: [] };
    const voided = r.voided_at !== null;
    if (!voided) s.paid_total = round2(s.paid_total + Number(r.amount));
    s.payments.push({ id: r.id, amount: Number(r.amount), method: r.method, paid_at: r.paid_at, voided });
    map.set(r.bill_id, s);
  }
  return map;
}

/**
 * Time of a transfer from a SlipOK result. SlipOK reports Thai local time, so +07:00 is added when the
 * value has no offset (the result must not depend on the server timezone). Falls back to now.
 */
export function slipPaidAt(verifyResult: any): Date {
  const text: string | undefined = verifyResult?.dateTime
    || (verifyResult?.transDate ? `${verifyResult.transDate}T${verifyResult.transTime || '00:00:00'}` : undefined);
  if (!text) return new Date();
  const parsed = new Date(/(Z|[+-]\d{2}:?\d{2})$/i.test(text) ? text : `${text.trim().replace(' ', 'T')}+07:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

/**
 * Record a payment for a bill. What is owed is the bill plus the late fee at `paidAt`, minus earlier payments.
 * Covering it marks the bill Paid. Less than that: with `allowPartial` the bill becomes Partial, otherwise
 * nothing is written and the required amount is returned. With `allowPartial`, more than owed is refused.
 * A slip must match what is owed exactly, and a slip reference can pay only once (voided payments excepted).
 */
export async function recordPayment(billId: number, input: PaymentInput): Promise<PaymentResult> {
  try {
    return await recordPaymentOnce(billId, input);
  } catch (error: any) {
    // The same slip sent twice at the same moment: MySQL rolls one back as a deadlock victim. Retrying once
    // waits for the other payment to commit, then finds the reference used and answers duplicate_slip.
    if (input.slipRef && (error?.code === 'ER_LOCK_DEADLOCK' || error?.errno === 1213)) {
      return recordPaymentOnce(billId, input);
    }
    throw error;
  }
}

async function recordPaymentOnce(billId: number, input: PaymentInput): Promise<PaymentResult> {
  const client = await new Pool({ connectionString: process.env.DATABASE_URL }).connect();
  try {
    await client.query('START TRANSACTION', []);
    const result = await recordPaymentInTransaction(client, billId, input);
    await client.query(result.ok ? 'COMMIT' : 'ROLLBACK', []);
    return result;
  } catch (error) {
    await client.query('ROLLBACK', []).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

type TxClient = { query: (text: string, params: any[]) => Promise<{ rows: any }> };

/**
 * Same as recordPayment, inside a transaction the caller has already started (and will commit or roll back).
 * Used when the payment must be atomic with other changes, e.g. a booking moving to "paid".
 * A refusal ({ ok: false }) happens before anything is written.
 */
export async function recordPaymentInTransaction(client: TxClient, billId: number, input: PaymentInput): Promise<PaymentResult> {
  const validInput = METHODS.includes(input.method)
    && Number.isFinite(Number(input.amount)) && Number(input.amount) > 0
    && input.paidAt instanceof Date && !Number.isNaN(input.paidAt.getTime())
    && (input.lateFeeAsOf === undefined || (input.lateFeeAsOf instanceof Date && !Number.isNaN(input.lateFeeAsOf.getTime())));
  if (!validInput) return { ok: false, reason: 'invalid_input' };

  const rates = await getRates(getDb());
  {
    const { rows } = await client.query(
      'SELECT id, amount, room_amount, is_first_bill, status, bill_type, due_date, dorm_id, room_number, title, billing_cycle FROM bills WHERE id = ? FOR UPDATE',
      [billId]
    );
    const bill = rows[0];
    const reject = async (result: PaymentResult) => result;

    if (!bill) return reject({ ok: false, reason: 'not_found' });
    if (isStatus(bill.status, 'paid')) return reject({ ok: false, reason: 'already_paid' });
    if (isStatus(bill.status, 'cancelled')) return reject({ ok: false, reason: 'cancelled' });
    // A draft has not been sent to the tenant yet
    if (isStatus(bill.status, 'draft')) return reject({ ok: false, reason: 'not_sent' });

    if (input.slipRef) {
      // Locks the index range, so the same slip sent twice at once cannot pay twice
      const used = (await client.query(
        'SELECT id FROM bill_payments WHERE slip_ref = ? AND voided_at IS NULL FOR UPDATE', [input.slipRef]
      )).rows;
      // Bills paid before bill_payments existed keep the reference on the bill only
      const usedLegacy = (await client.query(
        "SELECT id FROM bills WHERE slipok_trans_ref = ? AND id <> ? AND LOWER(status) = 'paid' LIMIT 1", [input.slipRef, billId]
      )).rows;
      if (used.length > 0 || usedLegacy.length > 0) return reject({ ok: false, reason: 'duplicate_slip' });
    }

    const paidBefore = (await client.query(
      'SELECT COALESCE(SUM(amount), 0) AS total FROM bill_payments WHERE bill_id = ? AND voided_at IS NULL', [billId]
    )).rows[0];
    const { lateFee, daysOverdue, outstanding: required } = outstandingFor(bill, Number(paidBefore?.total || 0), input.lateFeeAsOf || input.paidAt, rates);

    if (input.method === 'slip' && toSatang(input.amount) !== toSatang(required)) {
      return reject({ ok: false, reason: 'amount_mismatch', required });
    }
    const coversAll = toSatang(input.amount) >= toSatang(required);
    if (!coversAll && !input.allowPartial) return reject({ ok: false, reason: 'insufficient', required });
    if (input.allowPartial && toSatang(input.amount) > toSatang(required)) return reject({ ok: false, reason: 'exceeds', outstanding: required });

    const paymentRes = await client.query(
      'INSERT INTO bill_payments (bill_id, amount, method, paid_at, slip_ref, recorded_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [billId, input.amount, input.method, input.paidAt, input.slipRef || null, input.recordedBy || null, input.note || null]
    );

    const newStatus = coversAll ? 'Paid' : 'Partial';
    if (coversAll) {
      await client.query(
        `UPDATE bills
         SET status = 'Paid', paid_at = ?, payment_method = ?, penalty_amount = ?, days_overdue = ?,
             slip_url = COALESCE(?, slip_url), slip_data = COALESCE(?, slip_data), slipok_trans_ref = COALESCE(?, slipok_trans_ref),
             slip_verified = IF(? = 'slip', 1, slip_verified), slip_verified_at = IF(? = 'slip', NOW(), slip_verified_at)
         WHERE id = ?`,
        [input.paidAt, input.method, lateFee, daysOverdue,
          input.slipUrl || null, input.slipData || null, input.slipRef || null,
          input.method, input.method, billId]
      );
    } else {
      await client.query("UPDATE bills SET status = 'Partial' WHERE id = ?", [billId]);
    }

    // Deposit is filled first, the rest is income. One set of rows per payment, so an unpay can reverse it.
    const paymentId = paymentRes.rows.insertId;
    const paidBeforeTotal = Number(paidBefore?.total || 0);
    const depositPart = round2(Math.min(Number(input.amount), Math.max(0, depositPortion(bill) - paidBeforeTotal)));
    const incomePart = round2(Number(input.amount) - depositPart);
    const description = `ชำระบิลห้อง ${bill.room_number || '-'} (${bill.title || bill.billing_cycle || 'ค่าเช่าและบริการ'}) [${input.method}${input.slipRef ? ' Ref: ' + input.slipRef : ''}]`;
    const entries: [string, string, number][] = [];
    if (depositPart > 0) entries.push(['Liability', 'Deposit', depositPart]);
    if (incomePart > 0) entries.push(['Income', ACCOUNTING_CATEGORY[bill.bill_type] || 'Rent', incomePart]);
    for (const [type, category, amount] of entries) {
      await client.query(
        `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
         VALUES (?, ?, ?, ?, ?, ?, 'bill_payment', ?)`,
        [bill.dorm_id || 1, type, category, amount, description, paymentId, bangkokDate(input.paidAt)]
      );
    }
    if (newStatus !== bill.status) await logStatus(client, billId, bill.status, newStatus, null, input.recordedBy || null);

    return {
      ok: true, paymentId, status: newStatus, required, lateFee, daysOverdue,
      outstanding: round2(Math.max(0, required - Number(input.amount))),
    };
  }
}
