import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { bookingFeeFor } from '@/lib/billing';
import { bookingDeadlines, bookingSlipReceiver, payBooking } from '@/lib/bookings';

// POST { contractId, slipData } — the guest pays an approved booking (transfer within 10 minutes of approval,
// slip upload until +15 minutes). The slip is checked by SlipOK here; payBooking re-checks status and time with
// the contract row locked and records the payment in the same transaction.
export async function POST(req: Request) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userId = Number((session.user as any)?.id) || null;
  const sql = getDb();
  const now = new Date();

  try {
    const { contractId, slipData } = await req.json();
    if (!contractId || typeof slipData !== 'string' || !slipData.startsWith('data:image')) {
      return NextResponse.json({ success: false, message: 'กรุณาแนบรูปสลิปการโอนเงิน' }, { status: 400 });
    }

    // Quick check before sending the slip to SlipOK (a slip sent there is remembered, so do not waste it)
    const rows = await sql`
      SELECT c.status, c.approved_at, r.room_number, t.email AS tenant_email, t.user_id AS tenant_user_id, dp.phone AS dorm_phone
      FROM contracts c JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
      LEFT JOIN dormitory_profile dp ON 1 = 1
      WHERE c.id = ${Number(contractId)} LIMIT 1
    `;
    const c = rows[0];
    const owns = c && ((c.tenant_email && String(c.tenant_email).toLowerCase() === email.toLowerCase())
      || (c.tenant_user_id && Number(c.tenant_user_id) === Number(userId || 0)));
    if (!owns) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลการจอง' }, { status: 404 });
    }
    const expiredMessage = `การจองหมดเวลาแล้ว หากโอนเงินแล้วกรุณาติดต่อหอพัก${c.dorm_phone ? ` โทร ${c.dorm_phone}` : ''}`;
    if (c.status === 'Expired' || (c.status === 'BookingApproved' && c.approved_at
      && now.getTime() > bookingDeadlines(new Date(c.approved_at)).uploadBy.getTime())) {
      return NextResponse.json({ success: false, reason: 'expired', message: expiredMessage }, { status: 400 });
    }
    if (c.status !== 'BookingApproved') {
      return NextResponse.json({ success: false, message: 'การจองนี้ไม่ได้อยู่ในสถานะรอชำระค่าจอง' }, { status: 400 });
    }

    const { verifySlipWithSlipOK } = await import('@/lib/slipok');
    const slip = await verifySlipWithSlipOK(slipData, {
      expectedAmount: bookingFeeFor(c.room_number),
      expectedReceiver: await bookingSlipReceiver(sql),
    });

    const result = await payBooking({ contractId: Number(contractId), userEmail: email, userId, slip }, now);
    if (!result.ok) {
      return NextResponse.json({ success: false, reason: result.reason, message: result.message }, { status: 400 });
    }

    // Keep the slip image only for a booking that was paid
    try {
      const { saveBase64Image } = await import('@/lib/file-storage');
      const storedSlipUrl = saveBase64Image(slipData, 'slips', `booking_${contractId}`);
      if (storedSlipUrl) {
        await sql`UPDATE contracts SET slip_url = ${storedSlipUrl} WHERE id = ${Number(contractId)}`;
        await sql`UPDATE bills SET slip_url = ${storedSlipUrl} WHERE id = (SELECT booking_bill_id FROM contracts WHERE id = ${Number(contractId)})`;
      }
    } catch (e) {
      console.warn('[Booking pay] slip image not saved', e);
    }

    return NextResponse.json({ success: true, message: 'ชำระค่าจองเรียบร้อยแล้ว หอพักจะติดต่อเพื่อทำสัญญาและนัดวันเข้าพัก', contractId: result.contractId });
  } catch (error: any) {
    console.error('[Booking pay Error]', error);
    return NextResponse.json({ success: false, message: 'ชำระค่าจองไม่สำเร็จ' }, { status: 500 });
  }
}
