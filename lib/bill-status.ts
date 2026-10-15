// Bill status flow: Draft -> Unpaid (sent) -> Paid. Paid bills are locked; only unpayBill
// (owner, with a reason) reverses a payment. Every transition is written to bill_status_history.

import { getDb } from '@/lib/db';
import { Pool } from '@/lib/mysql-adapter';
import { bangkokDate, calcDueDate, DEFAULT_RATES } from '@/lib/billing';

/** Case-insensitive status check; older code paths wrote statuses in different cases. */
export function isStatus(status: unknown, name: 'draft' | 'unpaid' | 'partial' | 'paid' | 'cancelled') {
  const s = String(status || '').toLowerCase();
  return name === 'cancelled' ? s === 'cancelled' || s === 'canceled' : s === name;
}

export type Client = { query: (text: string, params: any[]) => Promise<{ rows: any }> };

export async function logStatus(client: Client, billId: number, from: string | null, to: string, reason: string | null, by: number | null) {
  await client.query(
    'INSERT INTO bill_status_history (bill_id, from_status, to_status, reason, changed_by) VALUES (?, ?, ?, ?, ?)',
    [billId, from, to, reason, by]
  );
}

export async function withTransaction<T>(work: (client: Client) => Promise<T>): Promise<T> {
  const client = await new Pool({ connectionString: process.env.DATABASE_URL }).connect();
  try {
    await client.query('START TRANSACTION', []);
    const result = await work(client);
    await client.query('COMMIT', []);
    return result;
  } catch (error) {
    await client.query('ROLLBACK', []).catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Send draft bills to tenants: Draft -> Unpaid, due date recalculated from the send date
 * (5th of the next month, at least 3 days after sending), the late fee per day in force saved on the bill
 * (bills.late_fee_rate, so a later rate change does not change it), tenant notified, history recorded.
 * Bills that are not drafts are skipped and reported back.
 */
export async function sendBills(billIds: number[], sentBy: number | null) {
  const sent: number[] = [];
  const skipped: { id: number; status: string | null }[] = [];
  const now = new Date();

  for (const id of billIds) {
    const bill = await withTransaction(async (client) => {
      const { rows } = await client.query(
        'SELECT id, status, tenant_id, billing_cycle, amount, bill_type, due_date FROM bills WHERE id = ? FOR UPDATE', [id]
      );
      const b = rows[0];
      if (!b || !isStatus(b.status, 'draft')) {
        skipped.push({ id, status: b ? b.status : null });
        return null;
      }
      const dueDate = b.billing_cycle && /^\d{4}-\d{2}$/.test(b.billing_cycle)
        ? calcDueDate(b.billing_cycle, now)
        : bangkokDate(b.due_date || now);
      await client.query(
        `UPDATE bills SET status = 'Unpaid', sent_at = ?, due_date = ?,
           late_fee_rate = COALESCE((SELECT late_fee_per_day FROM dormitory_profile ORDER BY id LIMIT 1), ?) WHERE id = ?`,
        [now, dueDate, DEFAULT_RATES.lateFeePerDay, id]
      );
      await logStatus(client, id, b.status, 'Unpaid', null, sentBy);
      return { ...b, due_date: dueDate };
    });
    if (!bill) continue;
    sent.push(id);

    // Notify the tenant only once the bill is actually sent
    try {
      const sql = getDb();
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id
        FROM tenants t
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE t.id = ${bill.tenant_id}
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'ใบแจ้งหนี้ใหม่ประจำรอบบิล',
            ${'มีใบแจ้งหนี้รอบบิล ' + (bill.billing_cycle || '-') + ' จำนวน ฿' + Number(bill.amount || 0).toLocaleString('th-TH') + ' กำหนดชำระภายใน ' + new Date(bill.due_date).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })},
            'billing',
            0,
            '/tenant/billing',
            NOW()
          )
        `;
      }
    } catch (e) {
      console.warn('[sendBills notify]', id, e);
    }
  }
  return { sent, skipped };
}

export type UnpayResult =
  | { ok: true; voidedPayments: number; reversedAmount: number }
  | { ok: false; reason: 'reason_required' | 'not_found' | 'not_paid' | 'deposit_offset' };

/**
 * Reverse a payment (owner only, reason required). Payments are voided, not deleted, and each one
 * gets an Income row with a negative amount in category 'Reversal'. The bill returns to Unpaid.
 */
export async function unpayBill(billId: number, reason: string, by: number | null): Promise<UnpayResult> {
  const cleanReason = String(reason || '').trim();
  if (!cleanReason) return { ok: false, reason: 'reason_required' };

  return withTransaction(async (client) => {
    const { rows } = await client.query(
      'SELECT id, status, dorm_id, room_number, title, billing_cycle FROM bills WHERE id = ? FOR UPDATE', [billId]
    );
    const bill = rows[0];
    if (!bill) return { ok: false, reason: 'not_found' } as UnpayResult;
    // Partial bills are reversed the same way (every payment voided)
    if (!isStatus(bill.status, 'paid') && !isStatus(bill.status, 'partial')) return { ok: false, reason: 'not_paid' } as UnpayResult;

    const now = new Date();
    const today = bangkokDate(now);
    const description = (amount: number) =>
      `ยกเลิกการชำระบิลห้อง ${bill.room_number || '-'} (${bill.title || bill.billing_cycle || '-'}) ฿${amount.toLocaleString('th-TH')} — ${cleanReason}`;

    const payments = (await client.query(
      'SELECT id, amount, method FROM bill_payments WHERE bill_id = ? AND voided_at IS NULL', [billId]
    )).rows;
    // Paid from the deposit at move-out: reversing it would leave the deposit settlement (lib/moveOut.ts) wrong
    if (payments.some((p: any) => p.method === 'deposit_offset')) return { ok: false, reason: 'deposit_offset' } as UnpayResult;

    let reversedAmount = 0;
    for (const p of payments) {
      await client.query('UPDATE bill_payments SET voided_at = ?, voided_by = ?, void_reason = ? WHERE id = ?', [now, by, cleanReason, p.id]);
      // Reverse each part with its own type (deposit part stays a liability, the rest income)
      const parts = (await client.query(
        "SELECT type, SUM(amount) AS total FROM accounting_transactions WHERE reference_type = 'bill_payment' AND reference_id = ? GROUP BY type",
        [p.id]
      )).rows;
      const reversals = parts.length > 0 ? parts.map((r: any) => [r.type, Number(r.total)]) : [['Income', Number(p.amount)]];
      for (const [type, total] of reversals) {
        await client.query(
          `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
           VALUES (?, ?, 'Reversal', ?, ?, ?, 'bill_payment_reversal', ?)`,
          [bill.dorm_id || 1, type, -total, description(total), p.id, today]
        );
      }
      reversedAmount += Number(p.amount);
    }

    // Bills paid before bill_payments existed: reverse their bill-level income row, if any
    if (payments.length === 0) {
      const legacy = (await client.query(
        "SELECT COALESCE(SUM(amount), 0) AS total FROM accounting_transactions WHERE reference_type = 'bill' AND reference_id = ? AND type = 'Income'",
        [billId]
      )).rows[0];
      const legacyTotal = Number(legacy?.total || 0);
      if (legacyTotal > 0) {
        await client.query(
          `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
           VALUES (?, 'Income', 'Reversal', ?, ?, ?, 'bill_reversal', ?)`,
          [bill.dorm_id || 1, -legacyTotal, description(legacyTotal), billId, today]
        );
        reversedAmount += legacyTotal;
      }
    }

    await client.query(
      `UPDATE bills SET status = 'Unpaid', paid_at = NULL, payment_method = NULL, penalty_amount = 0, days_overdue = 0, slip_verified = 0
       WHERE id = ?`,
      [billId]
    );
    await logStatus(client, billId, bill.status, 'Unpaid', cleanReason, by);
    return { ok: true, voidedPayments: payments.length, reversedAmount } as UnpayResult;
  });
}
