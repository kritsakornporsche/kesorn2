import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('roomId');
    const dormId = searchParams.get('dormId');
    const amountParam = searchParams.get('amount');

    const sql = getDb();

    let targetDormId = dormId && dormId !== 'undefined' ? parseInt(dormId) : 1;
    let targetAmount = amountParam ? parseFloat(amountParam) : 0;

    if (!targetAmount) {
      targetAmount = 1000; // จองห้องพักเพียง 1,000 บาท ตามเงื่อนไขหอพักเกษร 2
    }

    // Get owner's PromptPay number from dormitory_profile
    const profileRes = await sql`
      SELECT promptpay_number, promptpay_name, name 
      FROM dormitory_profile 
      LIMIT 1
    `;
    
    let promptpayNumber = profileRes.length > 0 ? profileRes[0].promptpay_number : null;
    const promptpayName = profileRes.length > 0 
      ? (profileRes[0].promptpay_name || profileRes[0].name) 
      : 'SmartDom PromptPay';

    if (!promptpayNumber) {
      promptpayNumber = '0812345678'; // Standard fallback promptpay
    }

    // Clean PromptPay number (remove dashes, spaces)
    const cleanPromptPay = promptpayNumber.replace(/[\s-]/g, '');

    // Generate PromptPay Payload
    const payload = generatePayload(cleanPromptPay, { amount: targetAmount });
    
    // Generate QR Code as Data URI
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
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
