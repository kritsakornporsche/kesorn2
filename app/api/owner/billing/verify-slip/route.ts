import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { getDormPromptPay, getRates } from '@/lib/billing';
import { formatBaht } from '@/lib/format';
import { getPaymentSummaries, outstandingFor, recordPayment, slipPaidAt } from '@/lib/payments';
import { afterMoveInPayment, missingMessage } from '@/lib/moveIn';
import { NextResponse } from 'next/server';
import { verifySlipWithSlipOK } from '@/lib/slipok';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { billId, slipUrl } = body;

    if (!billId && !slipUrl) {
      return NextResponse.json({ success: false, message: 'Missing billId or slipUrl' }, { status: 400 });
    }

    const sql = getDb();
    let targetSlip = slipUrl;

    const billRes = await sql`
      SELECT id, amount, common_fee, due_date, billing_cycle, created_at, status, slip_url, bill_type
      FROM bills 
      WHERE id = ${billId} 
      LIMIT 1
    `;

    if (billRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลบิล' }, { status: 404 });
    }

    const bill = billRes[0];
    targetSlip = targetSlip || bill.slip_url;

    if (!targetSlip) {
      return NextResponse.json({ success: false, message: 'ไม่พบรูปภาพสลิปสำหรับตรวจสอบ' }, { status: 400 });
    }

    const dormProfileRes = await sql`SELECT name, promptpay_name FROM dormitory_profile LIMIT 1`;
    const expectedDorm = dormProfileRes[0] || {};

    // 1. Run SlipOK Verification
    const verifyResult = await verifySlipWithSlipOK(targetSlip, {
      expectedReceiver: {
        name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
        promptpay: (await getDormPromptPay(sql)) || '',
        dormName: expectedDorm.name || 'หอพักเกษร 2'
      },
      billCreatedAt: bill.created_at,
      // The tenant usually sent this slip already; it may still pay once (recordPayment refuses a used reference)
      allowRepeat: true,
    });

    if (!verifyResult.success || !verifyResult.readSuccess) {
      return NextResponse.json({
        success: false,
        message: verifyResult.message || 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาตรวจสอบความชัดเจนของภาพ',
        data: verifyResult
      }, { status: 400 });
    }

    // 2. Anti-Cheat 15.3: Check if slip timestamp is BEFORE bill creation date
    const slipDateTime = slipPaidAt(verifyResult);
    const billCreatedAt = new Date(bill.created_at);

    if (slipDateTime.getTime() < billCreatedAt.getTime() - 60000) { // 1 min margin
      return NextResponse.json({
        success: false,
        message: '❌ ไม่สามารถใช้สลิปนี้ได้ เนื่องจากสลิปถูกทำรายการก่อนวันที่ออกบิล',
        data: verifyResult
      }, { status: 400 });
    }

    // 3. Late fee counted up to the actual transfer time (monthly rent bills only, no cap)
    // Expected = what is still owed at the transfer time (partial payments deducted)
    const paidSoFar = (await getPaymentSummaries(sql, [Number(billId)])).get(Number(billId))?.paid_total || 0;
    const owed = outstandingFor(bill, paidSoFar, slipDateTime, await getRates(sql));
    const { daysOverdue, lateFee: penaltyAmount } = owed;
    const expectedTotal = owed.outstanding;

    // 4. Mark Paid through the single payment entry point (the slip amount must match exactly)
    const actualAmount = Number(verifyResult.amount || 0);
    const payment = await recordPayment(Number(billId), {
      amount: actualAmount,
      method: 'slip',
      paidAt: slipDateTime,
      slipRef: verifyResult.transRef || null,
      slipData: JSON.stringify(verifyResult),
      recordedBy: guard.user.id,
    });
    if (!payment.ok) {
      const message = payment.reason === 'amount_mismatch'
        ? `❌ ยอดเงินในสลิป (฿${formatBaht(actualAmount)}) ไม่ตรงกับยอดที่ต้องชำระ (฿${formatBaht(payment.required)}) รวมค่าปรับ ${daysOverdue} วัน (฿${formatBaht(penaltyAmount)})`
        : payment.reason === 'duplicate_slip' ? '❌ สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้'
        : payment.reason === 'already_paid' ? 'บิลนี้ชำระเรียบร้อยแล้ว' : 'ไม่สามารถบันทึกการชำระบิลนี้ได้';
      return NextResponse.json({ success: false, message, data: verifyResult }, { status: 400 });
    }

    // A paid move-in bill may complete its contract (lib/moveIn.ts)
    const activation = payment.status === 'Paid' ? await afterMoveInPayment(sql, Number(billId)) : null;

    return NextResponse.json({
      success: true,
      message: '✅ ตรวจสอบสลิปถูกต้องและอนุมัติการชำระเงินเรียบร้อยแล้ว'
        + (activation ? (activation.activated ? ' · สัญญามีผลแล้ว' : ` · ${missingMessage(activation.missing)}`) : ''),
      activated: Boolean(activation?.activated),
      data: {
        ...verifyResult,
        penaltyAmount,
        daysOverdue,
        totalAmount: expectedTotal
      }
    });
  } catch (error: any) {
    console.error('[Verify Slip Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
