import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifySlipWithSlipOK } from '@/lib/slipok';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin' && role !== 'tenant')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { billId, slipUrl } = body;

    if (!billId && !slipUrl) {
      return NextResponse.json({ success: false, message: 'Missing billId or slipUrl' }, { status: 400 });
    }

    const sql = getDb();
    let targetSlip = slipUrl;

    const billRes = await sql`
      SELECT id, amount, common_fee, due_date, billing_cycle, created_at, status, slip_url 
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

    const dormProfileRes = await sql`SELECT name, promptpay_name, promptpay_number FROM dormitory_profile LIMIT 1`;
    const expectedDorm = dormProfileRes[0] || {};

    // 1. Run SlipOK Verification
    const verifyResult = await verifySlipWithSlipOK(targetSlip, {
      expectedReceiver: {
        name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
        promptpay: expectedDorm.promptpay_number || '0636040550',
        dormName: expectedDorm.name || 'หอพักเกษร 2'
      },
      billCreatedAt: bill.created_at
    });

    if (!verifyResult.success || !verifyResult.readSuccess) {
      return NextResponse.json({
        success: false,
        message: verifyResult.message || 'ไม่สามารถอ่านข้อมูลจากสลิปได้ กรุณาตรวจสอบความชัดเจนของภาพ',
        data: verifyResult
      }, { status: 400 });
    }

    // 2. Anti-Cheat 15.3: Check if slip timestamp is BEFORE bill creation date
    const slipDateTime = new Date(verifyResult.transDate ? `${verifyResult.transDate}T${verifyResult.transTime || '00:00:00'}` : Date.now());
    const billCreatedAt = new Date(bill.created_at);

    if (slipDateTime.getTime() < billCreatedAt.getTime() - 60000) { // 1 min margin
      return NextResponse.json({
        success: false,
        message: '❌ ไม่สามารถใช้สลิปนี้ได้ เนื่องจากสลิปถูกทำรายการก่อนวันที่ออกบิล',
        data: verifyResult
      }, { status: 400 });
    }

    // 3. Dynamic Late Fee Calculation (15.2: 50 THB/day, max 500 THB)
    let dueDate = new Date(bill.due_date || `${bill.billing_cycle}-05T23:59:59`);
    const diffTime = slipDateTime.getTime() - dueDate.getTime();
    const daysOverdue = diffTime > 0 ? Math.ceil(diffTime / (1000 * 60 * 60 * 24)) : 0;
    const penaltyAmount = Math.min(500, daysOverdue * 50);
    const expectedTotal = Number(bill.amount) + penaltyAmount;

    // 4. Verify Amount match
    const actualAmount = Number(verifyResult.transAmount || 0);
    if (Math.abs(actualAmount - expectedTotal) > 1) { // Allow minor rounding
      return NextResponse.json({
        success: false,
        message: `❌ ยอดเงินในสลิป (฿${actualAmount.toLocaleString()}) ไม่ตรงกับยอดที่ต้องชำระ (฿${expectedTotal.toLocaleString()}) รวมค่าปรับ ${daysOverdue} วัน (฿${penaltyAmount})`,
        data: verifyResult
      }, { status: 400 });
    }

    // 5. Update Bill as Paid
    await sql`
      UPDATE bills
      SET status = 'Paid',
          penalty_amount = ${penaltyAmount},
          days_overdue = ${daysOverdue},
          slip_verified = 1,
          slip_verified_at = NOW(),
          slipok_trans_ref = ${verifyResult.transRef || null},
          slip_data = ${JSON.stringify(verifyResult)},
          paid_at = ${slipDateTime}
      WHERE id = ${billId}
    `;

    return NextResponse.json({
      success: true,
      message: '✅ ตรวจสอบสลิปถูกต้องและอนุมัติการชำระเงินเรียบร้อยแล้ว',
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
