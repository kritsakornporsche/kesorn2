import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const billId = searchParams.get('billId');
    const amountParam = searchParams.get('amount');

    if (!billId && !amountParam) {
      return NextResponse.json({ success: false, message: 'Missing billId or amount' }, { status: 400 });
    }

    const sql = getDb();
    let amount = 0;
    let dormId = 1;
    let billTitle = 'ค่าเช่าห้องพัก';

    if (billId) {
      // 1. Find the bill
      const billRes = await sql`
        SELECT b.*, t.email as tenant_email, t.dorm_id as tenant_dorm_id
        FROM bills b
        LEFT JOIN tenants t ON b.tenant_id = t.id
        WHERE b.id = ${billId}
        LIMIT 1
      `;

      if (billRes.length === 0) {
        return NextResponse.json({ success: false, message: 'ไม่พบรายการบิลนี้ในระบบ' }, { status: 404 });
      }

      const bill = billRes[0];
      amount = Number(bill.amount);
      dormId = bill.dorm_id || bill.tenant_dorm_id || 1;
      billTitle = bill.title;
    } else {
      amount = parseFloat(amountParam!);
    }

    // 2. Get owner's PromptPay number from dormitory_profile or dormitory_registry
    const profileRes = await sql`
      SELECT promptpay_number, promptpay_name, name 
      FROM dormitory_profile 
      WHERE dorm_id = ${dormId} OR id = ${dormId}
      LIMIT 1
    `;
    
    let promptpayNumber = profileRes.length > 0 ? profileRes[0].promptpay_number : null;
    let dormDisplayName = profileRes.length > 0 ? (profileRes[0].name || profileRes[0].promptpay_name) : null;
    
    if (!promptpayNumber) {
      // Check dormitory_registry (use phone as promptpay number)
      const regRes = await sql`SELECT dorm_name, phone FROM dormitory_registry WHERE id = ${dormId} LIMIT 1`;
      if (regRes.length > 0) {
        if (regRes[0].phone) promptpayNumber = regRes[0].phone;
        if (!dormDisplayName && regRes[0].dorm_name) dormDisplayName = regRes[0].dorm_name;
      }
    }

    if (!promptpayNumber) {
      promptpayNumber = '0829853519'; // Kesorn 2 verified PromptPay
    }

    // Clean PromptPay number (remove dashes, spaces)
    promptpayNumber = promptpayNumber.replace(/[\s-]/g, '');

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
      dormName: dormDisplayName || 'SmartDom Dormitory'
    });

  } catch (error: any) {
    console.error('[API QR Generate Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
