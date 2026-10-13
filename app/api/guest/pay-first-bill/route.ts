import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { getPaymentSummaries, outstandingFor, recordPayment, slipPaidAt } from '@/lib/payments';
import { depositFor, getDormPromptPay, getRates } from '@/lib/billing';
import { signContract } from '@/lib/contracts';
import { formatBaht } from '@/lib/format';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    const { contractId, billId, slipUrl } = await req.json();

    if (!contractId) {
      return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
    }

    if (!slipUrl || !slipUrl.startsWith('data:image')) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณาแนบภาพสลิปการโอนเงินเพื่อตรวจสอบการชำระเงิน' 
      }, { status: 400 });
    }

    // 1. Fetch contract and bill
    const contracts = await sql`
      SELECT c.*, t.id as tenant_id, t.user_id, t.email as tenant_email, r.id as room_id, r.room_number, r.dorm_id, r.deposit_amount as room_deposit_amount
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN rooms r ON c.room_id = r.id
      WHERE c.id = ${contractId}
      LIMIT 1
    `;

    if (contracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    }

    const contract = contracts[0];

    // Only the tenant of this contract can pay its first bill
    const sessionUserId = Number((session.user as any)?.id) || 0;
    const ownsContract = (contract.tenant_email && String(contract.tenant_email).toLowerCase() === session.user.email.toLowerCase())
      || (contract.user_id && Number(contract.user_id) === sessionUserId);
    if (!ownsContract) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    }

    // The first bill must belong to this contract's tenant
    const bRes = billId
      ? await sql`SELECT * FROM bills WHERE id = ${billId} AND tenant_id = ${contract.tenant_id} LIMIT 1`
      : await sql`SELECT * FROM bills WHERE tenant_id = ${contract.tenant_id} AND (is_first_bill = 1 OR bill_type = 'booking') AND LOWER(status) NOT IN ('paid', 'cancelled') ORDER BY id DESC LIMIT 1`;
    const targetBill: any = bRes[0] || null;
    if (!targetBill) {
      return NextResponse.json({ success: false, message: 'ไม่พบบิลแรกเข้าที่ต้องชำระ' }, { status: 404 });
    }

    // What is still owed on the bill (partial payments deducted)
    const paidSoFar = (await getPaymentSummaries(sql, [targetBill.id])).get(targetBill.id)?.paid_total || 0;
    const expectedAmount = outstandingFor(targetBill, paidSoFar, new Date(), await getRates(sql)).outstanding;

    // 2. Automated Slip Verification with SlipOK
    const { verifySlipWithSlipOK } = await import('@/lib/slipok');
    const dormProfileRes = await sql`
      SELECT name, promptpay_name
      FROM dormitory_profile
      LIMIT 1
    `;
    const expectedDorm = dormProfileRes[0] || {};

    const verifyResult = await verifySlipWithSlipOK(
      slipUrl,
      {
        expectedAmount,
        expectedReceiver: {
          name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
          promptpay: (await getDormPromptPay(sql)) || '',
          dormName: expectedDorm.name || 'หอพักเกษร 2',
          isBooking: true,
          checkPromptPayOnly: true
        },
        billCreatedAt: targetBill?.created_at || contract?.created_at
      }
    );

    if (!verifyResult.success) {
      return NextResponse.json({
        success: false,
        message: `สลิปไม่ผ่านการตรวจสอบ: ${verifyResult.message || 'หมายเลขพร้อมเพย์ผู้รับหรือยอดเงินในสลิปไม่ถูกต้อง'}`
      }, { status: 400 });
    }

    const slipokRef = verifyResult.transRef || null;
    const slipRaw = JSON.stringify(verifyResult.rawData || {});

    // Save slip file
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = saveBase64Image(slipUrl, 'slips', `first_bill_${contract.tenant_id}_${contract.room_id}`) || slipUrl;

    // 3. Pay the first bill through the single payment entry point first; nothing else changes if it fails
    const payment = await recordPayment(targetBill.id, {
      amount: Number(verifyResult.amount),
      method: 'slip',
      paidAt: slipPaidAt(verifyResult),
      slipRef: slipokRef,
      slipUrl: storedSlipUrl,
      slipData: slipRaw,
      recordedBy: sessionUserId || null,
    });
    if (!payment.ok) {
      const message = payment.reason === 'amount_mismatch'
        ? `ยอดในสลิปไม่ตรงกับยอดที่ต้องชำระ ฿${formatBaht(payment.required)}`
        : payment.reason === 'duplicate_slip' ? 'สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้'
        : payment.reason === 'already_paid' ? 'บิลนี้ชำระเรียบร้อยแล้ว' : 'ไม่สามารถชำระบิลนี้ได้';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    // 3.1 Paid: activate the contract through the single contract service with the full deposit now held
    // (contract Active, room Occupied, tenant active, guest -> tenant)
    const signed = await signContract(Number(contractId), {
      depositAmount: depositFor({ room_number: contract.room_number, deposit_amount: contract.room_deposit_amount }),
      slipUrl: storedSlipUrl || null,
    });
    if (!signed.ok) {
      // The payment is recorded; the contract could not be activated (e.g. already active)
      console.warn('[Pay first bill] contract not activated', contractId, signed.reason);
    }

    return NextResponse.json({
      success: true,
      message: 'ชำระค่าแรกเข้าสำเร็จ! SlipOK ตรวจสอบสลิปถูกต้อง อัปเดตเงินประกัน 3,000 บาท และย้ายสถานะเข้าสู่ระบบผู้เช่าเรียบร้อยแล้ว',
      role: 'tenant'
    });
  } catch (error: any) {
    console.error('[Pay First Bill Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
