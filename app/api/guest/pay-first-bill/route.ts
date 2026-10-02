import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

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
      SELECT c.*, t.id as tenant_id, t.user_id, t.email as tenant_email, r.id as room_id, r.room_number, r.dorm_id
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

    // Find first bill
    let targetBill: any = null;
    if (billId) {
      const bRes = await sql`SELECT * FROM bills WHERE id = ${billId} LIMIT 1`;
      if (bRes.length > 0) targetBill = bRes[0];
    } else {
      const bRes = await sql`SELECT * FROM bills WHERE tenant_id = ${contract.tenant_id} AND (is_first_bill = 1 OR bill_type = 'booking') LIMIT 1`;
      if (bRes.length > 0) targetBill = bRes[0];
    }

    const expectedAmount = targetBill ? Number(targetBill.amount) : 1.00;

    // 2. Automated Slip Verification with SlipOK
    const { verifySlipWithSlipOK } = await import('@/lib/slipok');
    const dormProfileRes = await sql`
      SELECT name, promptpay_name, promptpay_number 
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
          promptpay: expectedDorm.promptpay_number || '0636040550',
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

    // 3. Update contract: deposit_amount = totalRequiredDeposit (20 for T01, 3000 for standard), status = 'Active' (Rule 2.1.3)
    const isTestRoom = (contract.room_number || '').toUpperCase() === 'T01';
    const totalDepositAmount = isTestRoom ? 20.00 : 3000.00;

    await sql`
      UPDATE contracts 
      SET 
        deposit_amount = ${totalDepositAmount},
        status = 'Active',
        slip_url = COALESCE(${storedSlipUrl}, slip_url)
      WHERE id = ${contractId}
    `;

    // 4. Mark the first bill as Paid
    if (targetBill) {
      await sql`
        UPDATE bills 
        SET 
          status = 'Paid',
          slip_url = ${storedSlipUrl},
          slip_verified = 1,
          slip_verified_at = NOW(),
          slipok_trans_ref = ${slipokRef},
          slip_data = ${slipRaw}
        WHERE id = ${targetBill.id}
      `;
    }

    // 5. Update room status to Occupied
    if (contract.room_id) {
      await sql`UPDATE rooms SET status = 'Occupied' WHERE id = ${contract.room_id}`;
    }

    // 6. Update user role to 'tenant' in users table
    const targetEmail = contract.tenant_email || session.user.email;
    await sql`
      UPDATE users 
      SET role = 'tenant', primary_role = 'tenant'
      WHERE LOWER(email) = LOWER(${targetEmail}) OR id = ${contract.user_id || 0}
    `;

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
