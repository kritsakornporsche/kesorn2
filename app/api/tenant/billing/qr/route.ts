import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getDormPromptPay, getRates } from '@/lib/billing';
import { getPaymentSummaries, outstandingFor } from '@/lib/payments';
import { auth } from '@/auth';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const billId = searchParams.get('billId');
    // The amount is what is still owed on the bill (server); an amount sent by the page is ignored
    if (!billId) {
      return NextResponse.json({ success: false, message: 'Missing billId' }, { status: 400 });
    }

    const sql = getDb();
    let amount = 0;
    let dormId = 1;
    let billTitle = 'ค่าเช่าห้องพัก';

    {
      // 1. Find the bill
      const billRes = await sql`
        SELECT b.*, t.email as tenant_email, t.dorm_id as tenant_dorm_id
        FROM bills b
        LEFT JOIN tenants t ON b.tenant_id = t.id
        WHERE b.id = ${billId}
        LIMIT 1
      `;

      // Drafts have not been sent to the tenant yet
      if (billRes.length === 0 || String(billRes[0].status || '').toLowerCase() === 'draft') {
        return NextResponse.json({ success: false, message: 'ไม่พบรายการบิลนี้ในระบบ' }, { status: 404 });
      }

      const bill = billRes[0];
      // QR asks for what is still owed (partial payments already received are deducted)
      const paid = (await getPaymentSummaries(sql, [bill.id])).get(bill.id)?.paid_total || 0;
      amount = outstandingFor(bill, paid, new Date(), await getRates(sql)).outstanding;
      dormId = bill.dorm_id || bill.tenant_dorm_id || 1;
      billTitle = bill.title;
    }

    // 2. Same PromptPay number that slips are checked against; no fallback number
    const promptpayNumber = await getDormPromptPay(sql);
    if (!promptpayNumber) {
      return NextResponse.json({ success: false, message: 'หอพักยังไม่ได้ตั้งค่าพร้อมเพย์สำหรับรับเงิน' }, { status: 400 });
    }
    const profileRes = await sql`
      SELECT promptpay_name, name
      FROM dormitory_profile
      WHERE dorm_id = ${dormId} OR id = ${dormId}
      LIMIT 1
    `;
    const dormDisplayName = profileRes.length > 0 ? (profileRes[0].name || profileRes[0].promptpay_name) : null;

    // 3. Generate PromptPay Payload & QR Code
    const payload = generatePayload(promptpayNumber, { amount });
    const qrDataUrl = await qrcode.toDataURL(payload, { 
      type: 'image/png', 
      errorCorrectionLevel: 'H', 
      margin: 2, 
      scale: 6 
    });

    return NextResponse.json({ 
      success: true, 
      qrImage: qrDataUrl, 
      amount, 
      promptpayNumber,
      billTitle: billTitle || 'ค่าเช่าห้องพัก',
      // Payee shown under the PromptPay number: the account name from /owner/settings (null when not set)
      promptpayName: String(profileRes[0]?.promptpay_name || '').trim() || null,
      dormName: dormDisplayName || 'SmartDom Dormitory'
    });

  } catch (error: any) {
    console.error('[API QR Generate Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
