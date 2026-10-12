import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { calcLateFee, getRates } from '@/lib/billing';
import { recordPayment, slipPaidAt } from '@/lib/payments';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized: กรุณาเข้าสู่ระบบก่อนทำรายการ' }, { status: 401 });
    }

    const body = await req.json();
    const billId = body.billId || body.bill_id;
    const slipData = body.slipData || body.slip_url || body.slip;

    if (!billId || !slipData) {
      return NextResponse.json({ success: false, message: 'Missing billId or slipData' }, { status: 400 });
    }

    const sql = getDb();
    
    // 1. Verify bill exists
    const billRes = await sql`
      SELECT b.*, t.email as tenant_email, t.user_id as tenant_user_id
      FROM bills b 
      LEFT JOIN tenants t ON b.tenant_id = t.id 
      WHERE b.id = ${billId} 
      LIMIT 1
    `;

    if (billRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการบิลนี้ในระบบ' }, { status: 404 });
    }

    const bill = billRes[0];

    // SEC-07: Verify bill belongs to this user/tenant unless staff
    const userRole = (session.user as any)?.role;
    const isStaff = userRole === 'owner' || userRole === 'keeper' || userRole === 'platform_admin';
    if (!isStaff) {
      const isOwnerOfBill = 
        (bill.tenant_email && bill.tenant_email.toLowerCase() === session.user.email.toLowerCase()) ||
        (bill.tenant_user_id && bill.tenant_user_id === (session.user as any)?.id);

      if (!isOwnerOfBill) {
        // Also check if any tenant record with this email matches bill.tenant_id
        const tMatch = await sql`
          SELECT id FROM tenants 
          WHERE id = ${bill.tenant_id} AND (LOWER(email) = ${session.user.email.toLowerCase()} OR user_id = ${(session.user as any)?.id || 0})
          LIMIT 1
        `;
        if (tMatch.length === 0) {
          return NextResponse.json({ success: false, message: 'Forbidden: คุณไม่มีสิทธิ์ชำระบิลนี้' }, { status: 403 });
        }
      }
    }

    if (bill.status && bill.status.toLowerCase() === 'paid') {
      return NextResponse.json({ success: false, message: 'บิลนี้ได้รับการชำระเงินเรียบร้อยแล้ว' }, { status: 400 });
    }

    // 2. Automated Verification with SlipOK
    const { verifySlipWithSlipOK } = await import('@/lib/slipok');
    const dormProfileRes = await sql`
      SELECT name, promptpay_name, promptpay_number 
      FROM dormitory_profile 
      LIMIT 1
    `;
    const expectedDorm = dormProfileRes[0] || {};

    const baseAmount = Number(bill.amount);
    // Slip time is unknown before verification; verify-slip recounts against the transfer time
    const { lateFee } = calcLateFee(bill, new Date(), await getRates(sql));

    const dormConfig = {
      name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
      promptpay: expectedDorm.promptpay_number || '0636040550',
      dormName: expectedDorm.name || 'หอพักเกษร 2'
    };

    // Try total amount (including late fee if any)
    let verifyRes = await verifySlipWithSlipOK(slipData, {
      expectedAmount: baseAmount + lateFee,
      expectedReceiver: dormConfig,
      billCreatedAt: bill.created_at,
    });

    // If verification failed and late fee > 0, also check if tenant transferred exact base amount
    if (!verifyRes.success && lateFee > 0 && verifyRes.reason !== 'เวลาที่ทำรายการในสลิปเกิดขึ้นก่อนวันที่ออกบิล') {
      const baseVerifyRes = await verifySlipWithSlipOK(slipData, {
        expectedAmount: baseAmount,
        expectedReceiver: dormConfig,
        billCreatedAt: bill.created_at,
      });
      if (baseVerifyRes.success) {
        verifyRes = baseVerifyRes;
      }
    }

    // "แต่ถ้าไม่ตรง ไม่ว่าชื่อหรือยอดเงินให้ปฎิเสธ"
    if (!verifyRes.success) {
      try {
        const { saveBase64Image } = await import('@/lib/file-storage');
        const storedSlipUrl = saveBase64Image(slipData, 'slips', `bill_${billId}_failed_${Date.now()}`) || slipData;
        await sql`
          UPDATE bills 
          SET slip_url = ${storedSlipUrl},
              slip_verified = 0,
              slip_data = ${JSON.stringify(verifyRes)}
          WHERE id = ${billId}
        `;
      } catch (err) {
        console.warn('Failed to save rejected slip record:', err);
      }

      return NextResponse.json({
        success: false,
        message: `สลิปไม่ผ่านการตรวจสอบ: ${verifyRes.message || 'ข้อมูลชื่อผู้รับเงินหรือยอดเงินไม่ถูกต้อง กรุณาตรวจสอบสลิปแล้วลองใหม่อีกครั้ง'}`,
        data: verifyRes
      }, { status: 400 });
    }

    // "ถ้าโอนถูกยอดตรง ให้อนุมัติไปเลย ทั้งการจอง ค่าหอ ค่าซ่อมทำความสะอาด"
    const slipokRef = verifyRes.transRef || null;
    const slipRaw = JSON.stringify(verifyRes.rawData || {});

    // Save slip image to disk if Base64 to prevent large DB payloads
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = saveBase64Image(slipData, 'slips', `bill_${billId}_${Date.now()}`) || slipData;

    // Mark Paid (and record income) through the single payment entry point
    const amountNum = verifyRes.amount !== undefined ? Number(verifyRes.amount) : baseAmount + lateFee;
    const payment = await recordPayment(Number(billId), {
      amount: amountNum,
      method: 'slip',
      paidAt: slipPaidAt(verifyRes),
      slipRef: slipokRef,
      slipUrl: storedSlipUrl,
      slipData: slipRaw,
      recordedBy: Number((session.user as any)?.id) || null,
    });
    if (!payment.ok) {
      const message = payment.reason === 'insufficient'
        ? `ยอดในสลิป ฿${amountNum.toLocaleString('th-TH')} ไม่ครบ ต้องชำระ ฿${payment.required.toLocaleString('th-TH')} (รวมค่าปรับ)`
        : payment.reason === 'already_paid' ? 'บิลนี้ชำระเรียบร้อยแล้ว' : 'ไม่สามารถชำระบิลนี้ได้';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    const dormId = bill.dorm_id || 1;
    const roomNumber = bill.room_number || '-';
    const billTitle = bill.title || bill.billing_cycle || 'ค่าเช่าและบริการ';

    // 3. Create notifications for tenant and owner
    try {
      const tenantUserId = bill.tenant_user_id || (session.user as any)?.id;
      if (tenantUserId) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUserId},
            '✅ การชำระเงินได้รับการอนุมัติแล้ว',
            ${'บิล ' + billTitle + ' จำนวน ฿' + amountNum.toLocaleString('th-TH') + ' ได้รับการตรวจสอบและอนุมัติอัตโนมัติผ่าน SlipOK เรียบร้อยแล้ว'},
            'payment_approved',
            0,
            '/tenant/billing',
            NOW()
          )
        `;
      }

      const staff = await sql`
        SELECT DISTINCT u.id as user_id
        FROM users u
        WHERE (
          u.id IN (SELECT owner_id FROM dormitory_registry WHERE id = ${dormId} AND owner_id IS NOT NULL)
          OR LOWER(u.email) IN (SELECT LOWER(owner_email) FROM dormitory_registry WHERE id = ${dormId} AND owner_email IS NOT NULL)
          OR u.id IN (SELECT user_id FROM user_dorm_roles WHERE dorm_id = ${dormId} AND role IN ('owner', 'keeper'))
          OR u.role = 'owner'
        )
      `;

      for (const person of staff as any[]) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${person.user_id},
            '💰 ผู้เช่าชำระเงินสำเร็จ (SlipOK อนุมัติ)',
            ${'ผู้เช่าห้อง ' + roomNumber + ' ชำระบิล ' + billTitle + ' จำนวน ฿' + amountNum.toLocaleString('th-TH') + ' (SlipOK ยืนยันยอดเงินและบัญชีถูกต้อง)'},
            'payment',
            0,
            '/owner/billing',
            NOW()
          )
        `;
      }
    } catch (notifErr) {
      console.error('[POST /api/tenant/billing/payment] Notification Error:', notifErr);
    }

    return NextResponse.json({ 
      success: true, 
      verified: true,
      message: 'การชำระเงินได้รับการอนุมัติอัตโนมัติเรียบร้อยแล้ว (SlipOK ตรวจสอบยอดเงินและบัญชีถูกต้อง)',
      data: {
        billId,
        status: 'Paid',
        transRef: slipokRef
      }
    });

  } catch (error: any) {
    console.error('[POST /api/tenant/billing/payment] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
