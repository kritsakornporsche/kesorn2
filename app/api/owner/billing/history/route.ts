import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';

// GET ?billId= — status history of a bill (who, when, why)
export async function GET(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;

  const billId = Number(new URL(req.url).searchParams.get('billId'));
  if (!Number.isInteger(billId) || billId <= 0) {
    return NextResponse.json({ success: false, message: 'ไม่ได้ระบุบิล' }, { status: 400 });
  }

  const sql = getDb();
  const history = await sql`
    SELECT h.id, h.from_status, h.to_status, h.reason, h.changed_at, h.changed_by, u.name AS changed_by_name
    FROM bill_status_history h
    LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.bill_id = ${billId}
    ORDER BY h.changed_at ASC, h.id ASC
  `;
  const payments = await sql`
    SELECT id, amount, method, paid_at, slip_ref, recorded_by, voided_at, voided_by, void_reason
    FROM bill_payments
    WHERE bill_id = ${billId}
    ORDER BY id ASC
  `;
  return NextResponse.json({ success: true, data: { history, payments } });
}
