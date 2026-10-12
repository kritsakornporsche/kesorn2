// The only place that marks a bill as Paid. Every payment is recorded in bill_payments
// and as one income row in accounting_transactions, inside a single transaction.

import { getDb } from '@/lib/db';
import { Pool } from '@/lib/mysql-adapter';
import { bangkokDate, calcLateFee, getRates } from '@/lib/billing';

export type PaymentMethod = 'slip' | 'cash' | 'transfer';

export interface PaymentInput {
  amount: number;
  method: PaymentMethod;
  paidAt: Date;
  slipRef?: string | null;
  slipUrl?: string | null;
  slipData?: string | null;
  recordedBy?: number | null;
  note?: string | null;
}

export type PaymentResult =
  | { ok: true; paymentId: number; required: number; lateFee: number; daysOverdue: number }
  | { ok: false; reason: 'invalid_input' | 'not_found' | 'already_paid' | 'cancelled' }
  | { ok: false; reason: 'insufficient'; required: number };

// Validated here because MySQL may run without strict mode and silently coerce bad values
const METHODS: PaymentMethod[] = ['slip', 'cash', 'transfer'];

const ACCOUNTING_CATEGORY: Record<string, string> = { service: 'Service', booking: 'Deposit' };

const toSatang = (n: number) => Math.round(Number(n) * 100);

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
 * Record a full payment for a bill. The amount must cover the bill plus the late fee at `paidAt`;
 * otherwise nothing is written and the required amount is returned (partial payments come later).
 */
export async function recordPayment(billId: number, input: PaymentInput): Promise<PaymentResult> {
  const validInput = METHODS.includes(input.method)
    && Number.isFinite(Number(input.amount)) && Number(input.amount) > 0
    && input.paidAt instanceof Date && !Number.isNaN(input.paidAt.getTime());
  if (!validInput) return { ok: false, reason: 'invalid_input' };

  const rates = await getRates(getDb());
  const client = await new Pool({ connectionString: process.env.DATABASE_URL }).connect();

  try {
    await client.query('START TRANSACTION', []);

    const { rows } = await client.query(
      'SELECT id, amount, status, bill_type, due_date, dorm_id, room_number, title, billing_cycle FROM bills WHERE id = ? FOR UPDATE',
      [billId]
    );
    const bill = rows[0];
    const reject = async (result: PaymentResult) => {
      await client.query('ROLLBACK', []);
      return result;
    };

    if (!bill) return reject({ ok: false, reason: 'not_found' });
    // Older code paths wrote statuses in different cases (e.g. 'paid')
    const status = String(bill.status || '').toLowerCase();
    if (status === 'paid') return reject({ ok: false, reason: 'already_paid' });
    if (status === 'cancelled' || status === 'canceled') return reject({ ok: false, reason: 'cancelled' });

    const { lateFee, daysOverdue } = calcLateFee(bill, input.paidAt, rates);
    const required = Math.round((Number(bill.amount) + lateFee) * 100) / 100;
    if (toSatang(input.amount) < toSatang(required)) return reject({ ok: false, reason: 'insufficient', required });

    const paymentRes = await client.query(
      'INSERT INTO bill_payments (bill_id, amount, method, paid_at, slip_ref, recorded_by, note) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [billId, input.amount, input.method, input.paidAt, input.slipRef || null, input.recordedBy || null, input.note || null]
    );

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

    const existingTx = await client.query(
      "SELECT id FROM accounting_transactions WHERE reference_id = ? AND reference_type = 'bill' LIMIT 1",
      [billId]
    );
    if (existingTx.rows.length === 0) {
      await client.query(
        `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
         VALUES (?, 'Income', ?, ?, ?, ?, 'bill', ?)`,
        [
          bill.dorm_id || 1,
          ACCOUNTING_CATEGORY[bill.bill_type] || 'Rent',
          input.amount,
          `ชำระบิลห้อง ${bill.room_number || '-'} (${bill.title || bill.billing_cycle || 'ค่าเช่าและบริการ'}) [${input.method}${input.slipRef ? ' Ref: ' + input.slipRef : ''}]`,
          billId,
          bangkokDate(input.paidAt),
        ]
      );
    }

    await client.query('COMMIT', []);
    return { ok: true, paymentId: paymentRes.rows.insertId, required, lateFee, daysOverdue };
  } catch (error) {
    await client.query('ROLLBACK', []).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
