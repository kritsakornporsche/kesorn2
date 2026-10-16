// Deposits are a liability (money held for the tenant), not income.
// A paid booking fee is part of the deposit until the booking is cancelled by the booker, when it is forfeited.

import { bangkokDate } from '@/lib/billing';
import { withTransaction } from '@/lib/bill-status';

const FORFEIT_CATEGORY = 'ริบค่าจอง';

/**
 * Move what is still held from a tenant's paid booking bills from Liability to Income ("ริบค่าจอง").
 * Safe to call more than once: only the amount still held is moved. Returns the amount forfeited.
 */
export async function forfeitBookingFee(tenantId: number): Promise<number> {
  return withTransaction(async (client) => {
    const bills = (await client.query(
      `SELECT id, dorm_id, room_number FROM bills
       WHERE tenant_id = ? AND bill_type = 'booking' AND COALESCE(is_first_bill, 0) = 0 AND LOWER(status) = 'paid'
       FOR UPDATE`,
      [tenantId]
    )).rows;

    let total = 0;
    for (const bill of bills) {
      const held = Number((await client.query(
        `SELECT COALESCE(SUM(amount), 0) AS held FROM accounting_transactions
         WHERE type = 'Liability' AND (
           (reference_type IN ('bill_payment', 'bill_payment_reversal')
             AND reference_id IN (SELECT id FROM bill_payments WHERE bill_id = ?))
           OR (reference_type = 'booking_forfeit' AND reference_id = ?)
         )`,
        [bill.id, bill.id]
      )).rows[0]?.held || 0);
      if (held <= 0) continue;

      const description = `ริบค่าจองห้อง ${bill.room_number || '-'} (ผู้จองยกเลิกการจอง)`;
      const today = bangkokDate(new Date());
      for (const [type, amount] of [['Liability', -held], ['Income', held]] as const) {
        await client.query(
          `INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
           VALUES (?, ?, ?, ?, ?, ?, 'booking_forfeit', ?)`,
          [bill.dorm_id || 1, type, FORFEIT_CATEGORY, amount, description, bill.id, today]
        );
      }
      total += held;
    }
    return Math.round(total * 100) / 100;
  });
}
