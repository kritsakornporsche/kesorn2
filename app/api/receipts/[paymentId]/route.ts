import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getCurrentUser } from '@/lib/authz';
import { getRates } from '@/lib/billing';
import { outstandingFor } from '@/lib/payments';
import { receiptNo } from '@/lib/format';

// GET — receipt data for one payment. Owner/manager: any receipt · tenant or guest (a booker before the contract
// takes effect, or after moving out): only receipts of their own bills.
export async function GET(_req: Request, { params }: { params: Promise<{ paymentId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const paymentId = Number((await params).paymentId);
  if (!Number.isInteger(paymentId) || paymentId <= 0) {
    return NextResponse.json({ success: false, message: 'ไม่พบใบเสร็จ' }, { status: 404 });
  }

  const sql = getDb();
  const rows = await sql`
    SELECT p.*, b.id AS bill_id, b.title, b.room_number, b.billing_cycle, b.amount AS bill_amount, b.bill_type, b.status AS bill_status,
           b.due_date, b.late_fee_rate, b.room_amount, b.electric_units, b.electric_amount, b.water_amount, b.common_fee,
           t.name AS tenant_name, t.user_id AS tenant_user_id, t.email AS tenant_email,
           r.name AS recorded_by_name, v.name AS voided_by_name
    FROM bill_payments p
    JOIN bills b ON b.id = p.bill_id
    LEFT JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN users r ON r.id = p.recorded_by
    LEFT JOIN users v ON v.id = p.voided_by
    WHERE p.id = ${paymentId}
    LIMIT 1
  `;
  const p = rows[0];
  if (!p) return NextResponse.json({ success: false, message: 'ไม่พบใบเสร็จ' }, { status: 404 });

  const isStaff = user.role === 'owner' || user.role === 'manager';
  const isOwnTenant = (user.role === 'tenant' || user.role === 'guest')
    && (p.tenant_user_id === user.id || String(p.tenant_email || '').toLowerCase() === user.email.toLowerCase());
  if (!isStaff && !isOwnTenant) {
    return NextResponse.json({ success: false, message: 'ไม่มีสิทธิ์ดูใบเสร็จนี้' }, { status: 403 });
  }

  // Running totals as of this payment (voided payments do not count)
  const paidUpTo = await sql`
    SELECT COALESCE(SUM(amount), 0) AS total FROM bill_payments
    WHERE bill_id = ${p.bill_id} AND voided_at IS NULL AND id <= ${paymentId}
  `;
  const paidThrough = Number(paidUpTo[0]?.total || 0);
  // Late fee owed at the time of this payment
  const owed = outstandingFor(
    { amount: p.bill_amount, bill_type: p.bill_type, status: 'Unpaid', due_date: p.due_date, late_fee_rate: p.late_fee_rate },
    0, p.paid_at, await getRates(sql)
  );
  const profile = (await sql`SELECT name, address, phone, tax_id FROM dormitory_profile LIMIT 1`)[0] || {};

  // Itemised lines only when they add up to the bill (booking/service bills keep their amount in one field)
  const lines = [
    { label: 'ค่าเช่าห้อง', amount: Number(p.room_amount || 0) },
    { label: `ค่าไฟฟ้า${Number(p.electric_units) > 0 ? ` (${Number(p.electric_units)} หน่วย)` : ''}`, amount: Number(p.electric_amount || 0) },
    { label: 'ค่าน้ำ', amount: Number(p.water_amount || 0) },
    { label: 'ค่าส่วนกลาง', amount: Number(p.common_fee || 0) },
  ].filter((i) => i.amount > 0);
  const linesTotal = lines.reduce((s, i) => s + i.amount, 0);
  const items = Math.abs(linesTotal - Number(p.bill_amount)) < 0.01 ? lines : [{ label: p.title || 'ค่าบริการ', amount: Number(p.bill_amount) }];

  return NextResponse.json({
    success: true,
    data: {
      receipt_no: receiptNo(p.id, p.paid_at),
      dorm: { name: profile.name || 'หอพักเกษร 2', address: profile.address || '', phone: profile.phone || '', tax_id: String(profile.tax_id || '').trim() },
      payment: {
        id: p.id, amount: Number(p.amount), method: p.method, paid_at: p.paid_at, slip_ref: p.slip_ref, note: p.note,
        received_by: p.recorded_by_name || (p.method === 'slip' ? 'ระบบตรวจสลิปอัตโนมัติ' : '-'),
        voided: p.voided_at !== null, voided_at: p.voided_at, void_reason: p.void_reason, voided_by: p.voided_by_name,
      },
      bill: {
        id: p.bill_id, title: p.title, room_number: p.room_number, billing_cycle: p.billing_cycle, tenant_name: p.tenant_name,
        items,
        amount: Number(p.bill_amount),
        late_fee: owed.lateFee,
        days_overdue: owed.daysOverdue,
        total_due: owed.due,
        paid_through: paidThrough,
        remaining: Math.max(0, Math.round((owed.due - paidThrough) * 100) / 100),
      },
    },
  });
}
