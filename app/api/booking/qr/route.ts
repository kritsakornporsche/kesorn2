import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { bookingFeeFor, getDormPromptPay, getRates } from '@/lib/billing';
import { getPaymentSummaries, outstandingFor } from '@/lib/payments';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

// GET /api/booking/qr?roomId=            → QR for the room's booking fee (bookingFeeFor)
// GET /api/booking/qr?roomId=&contractId= → QR for what is still owed on that contract's move-in bill (its tenant only)
// The amount is always worked out here; an amount sent by the page is ignored.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = Number(searchParams.get('roomId'));
    const contractId = Number(searchParams.get('contractId'));
    if (!roomId) return NextResponse.json({ success: false, message: 'ไม่ได้ระบุห้อง' }, { status: 400 });

    const sql = getDb();
    const room = (await sql`SELECT id, room_number FROM rooms WHERE id = ${roomId} LIMIT 1`)[0];
    if (!room) return NextResponse.json({ success: false, message: 'ไม่พบห้อง' }, { status: 404 });

    let targetAmount = bookingFeeFor(room.room_number);
    if (contractId) {
      const session = await auth();
      if (!session?.user?.email) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
      const contract = (await sql`
        SELECT c.id, c.status, c.room_id, c.move_in_bill_id, t.user_id, t.email AS tenant_email
        FROM contracts c LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = ${contractId} LIMIT 1
      `)[0];
      const sessionUserId = Number((session.user as any)?.id) || 0;
      const owns = contract && ((contract.tenant_email && String(contract.tenant_email).toLowerCase() === session.user.email.toLowerCase())
        || (contract.user_id && Number(contract.user_id) === sessionUserId));
      if (!owns || Number(contract.room_id) !== roomId) {
        return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
      }
      const bill = contract.status === 'PendingFirstBill' && contract.move_in_bill_id
        ? (await sql`SELECT * FROM bills WHERE id = ${contract.move_in_bill_id} LIMIT 1`)[0]
        : null;
      if (!bill || ['paid', 'cancelled', 'canceled'].includes(String(bill.status || '').toLowerCase())) {
        return NextResponse.json({ success: false, message: 'ไม่พบบิลแรกเข้าที่ต้องชำระ' }, { status: 404 });
      }
      const paid = (await getPaymentSummaries(sql, [bill.id])).get(bill.id)?.paid_total || 0;
      targetAmount = outstandingFor(bill, paid, new Date(), await getRates(sql)).outstanding;
    }

    // Same PromptPay number that slips are checked against; no fallback number
    const cleanPromptPay = await getDormPromptPay(sql);
    if (!cleanPromptPay) {
      return NextResponse.json({ success: false, message: 'หอพักยังไม่ได้ตั้งค่าพร้อมเพย์สำหรับรับเงิน — สร้าง QR ไม่ได้ กรุณาติดต่อหอพัก' }, { status: 400 });
    }
    const profileRes = await sql`SELECT promptpay_name, name FROM dormitory_profile LIMIT 1`;
    const promptpayName = profileRes[0]?.promptpay_name || profileRes[0]?.name || '';

    const payload = generatePayload(cleanPromptPay, { amount: targetAmount });
    const svgUrl = await qrcode.toDataURL(payload, {
      type: 'image/png',
      errorCorrectionLevel: 'H',
      margin: 2,
      scale: 7
    });

    return NextResponse.json({
      success: true,
      qrImage: svgUrl,
      amount: targetAmount,
      promptpayNumber: cleanPromptPay,
      promptpayName: promptpayName
    });
  } catch (error: any) {
    console.error('[API Booking QR Generate Error]', error);
    return NextResponse.json({ success: false, message: 'สร้าง QR ไม่สำเร็จ' }, { status: 500 });
  }
}
