import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import generatePayload from 'promptpay-qr';

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = getDb();
    
    // Find tenant by email or user_id
    const tenantRes = await sql`
      SELECT id, room_id, name, phone, email, id_card_number 
      FROM tenants 
      WHERE email = ${session.user.email} 
      LIMIT 1
    `;
    if (tenantRes.length === 0) {
      return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    }
    const tenant = tenantRes[0];

    // Find active contract
    const contractRes = await sql`
      SELECT id, start_date, end_date, deposit_amount, status 
      FROM contracts 
      WHERE tenant_id = ${tenant.id} AND status IN ('Active', 'Approved') 
      ORDER BY id DESC 
      LIMIT 1
    `;
    const contract = contractRes.length > 0 ? contractRes[0] : null;

    // Find unpaid bills
    const unpaidBills = await sql`
      SELECT id, title, amount, billing_cycle, status, created_at
      FROM bills 
      WHERE tenant_id = ${tenant.id} AND status NOT IN ('Paid', 'paid')
      ORDER BY id ASC
    `;
    const unpaidTotal = unpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);

    // Find active move-out request
    const requestRes = await sql`
      SELECT * FROM move_out_requests 
      WHERE tenant_id = ${tenant.id} 
      ORDER BY id DESC 
      LIMIT 1
    `;
    const moveOutRequest = requestRes.length > 0 ? requestRes[0] : null;

    return NextResponse.json({
      success: true,
      tenant,
      contract,
      unpaidBills,
      unpaidTotal,
      moveOutRequest,
    });
  } catch (error: any) {
    console.error('[GET /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const desiredDate = body.desiredDate || body.desired_date || body.move_out_date || body.date;
    const reason = body.reason;
    const promptpayTargetInput = body.promptpayTarget || body.promptpay_target;
    const promptpayName = body.promptpayName || body.promptpay_name;
    const bankName = body.bankName || body.bank_name;

    if (!desiredDate) {
      return NextResponse.json({ success: false, message: 'กรุณาระบุวันที่ต้องการย้ายออก' }, { status: 400 });
    }

    const desiredDateObj = new Date(desiredDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const sql = getDb();
    
    // Find tenant by email
    const tenantRes = await sql`
      SELECT id, room_id, name, phone, email, id_card_number 
      FROM tenants 
      WHERE email = ${session.user.email} 
      LIMIT 1
    `;
    if (tenantRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลผู้เช่า' }, { status: 404 });
    }
    const tenant = tenantRes[0];
    const tenantId = tenant.id;
    const roomId = tenant.room_id || null;

    // Check if there is already an active pending/approved request
    const existingReq = await sql`
      SELECT id FROM move_out_requests 
      WHERE tenant_id = ${tenantId} AND status IN ('Pending', 'Approved')
    `;
    if (existingReq.length > 0) {
      return NextResponse.json({ success: false, message: 'คุณมีคำขอย้ายออกที่กำลังดำเนินการอยู่แล้ว' }, { status: 400 });
    }

    // 1. Audit Check 1: Check active contract and completion status
    const contractRes = await sql`
      SELECT id, start_date, end_date, deposit_amount, status 
      FROM contracts 
      WHERE tenant_id = ${tenantId} AND status IN ('Active', 'Approved') 
      ORDER BY id DESC 
      LIMIT 1
    `;
    const contract = contractRes.length > 0 ? contractRes[0] : null;
    const contractId = contract ? contract.id : null;
    const depositAmount = contract ? Number(contract.deposit_amount || 0) : 0;

    let isCompleted = true;
    if (contract && contract.end_date) {
      const moveDateObj = new Date(desiredDate);
      const endDateObj = new Date(contract.end_date);
      // Give a 1-day grace window for calendar comparisons
      isCompleted = moveDateObj.getTime() >= (endDateObj.getTime() - (24 * 60 * 60 * 1000));
    }

    // 2. Audit Check 2: Check unpaid bills
    const unpaidBills = await sql`
      SELECT id, amount, title, status FROM bills 
      WHERE tenant_id = ${tenantId} AND status NOT IN ('Paid', 'paid')
    `;
    const unpaidTotal = unpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);

    // 3. Audit Check 3: Calculate net refund
    // For early move out: deposit is not refunded, netRefund = 0
    const penaltyAmount = isCompleted ? 0 : depositAmount;
    const netRefund = isCompleted ? Math.max(0, depositAmount - unpaidTotal) : 0;

    // 4. Audit Check 4: PromptPay Target & Exact-Amount QR payload
    const rawTarget = isCompleted ? (promptpayTargetInput || tenant.phone || tenant.id_card_number || '') : (promptpayTargetInput || '-');
    const promptpayTarget = rawTarget.replace(/[\s-]/g, '') || '-';
    let qrPayload = '';
    try {
      if (isCompleted && promptpayTarget && promptpayTarget !== '-' && netRefund > 0) {
        qrPayload = generatePayload(promptpayTarget, { amount: netRefund });
      }
    } catch (e) {
      console.warn('Could not generate promptpay payload:', e);
    }

    // Insert new move-out request
    await sql`
      INSERT INTO move_out_requests (
        tenant_id, room_id, move_out_date, desired_date, reason, status,
        promptpay_target, promptpay_name, bank_name, contract_id,
        deposit_amount, unpaid_bills_total, penalty_amount, net_refund_amount,
        is_contract_completed, refund_qr_payload, settlement_status
      )
      VALUES (
        ${tenantId}, ${roomId}, ${desiredDate}, ${desiredDate}, ${reason || null}, 'Pending',
        ${promptpayTarget}, ${promptpayName || (isCompleted ? tenant.name : 'ผู้เช่า (ออกก่อนกำหนด)')}, ${bankName || (isCompleted ? 'พร้อมเพย์' : 'ไม่ต้องโอนคืน')}, ${contractId},
        ${depositAmount}, ${unpaidTotal}, ${penaltyAmount}, ${netRefund},
        ${isCompleted ? 1 : 0}, ${qrPayload || null}, 'PendingMeter'
      )
    `;

    // Rule 16.1: Mark contract as MoveOutPending immediately to prevent duplicate billing in Billing Portal
    if (contractId) {
      await sql`
        UPDATE contracts 
        SET status = 'MoveOutPending' 
        WHERE id = ${contractId}
      `;
    }

    // Notify owner about move-out request
    try {
      const dormOwners = await sql`
        SELECT u.id FROM users u
        JOIN dormitory_registry dr ON dr.owner_id = u.id OR LOWER(dr.owner_email) = LOWER(u.email)
        WHERE dr.id = 1
        LIMIT 1
      `;
      if (dormOwners.length > 0) {
        let roomLabel = '';
        if (roomId) {
          const rRes = await sql`SELECT room_number FROM rooms WHERE id = ${roomId} LIMIT 1`;
          if (rRes.length > 0) roomLabel = `ห้อง ${rRes[0].room_number}`;
        }
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${dormOwners[0].id},
            'มีคำขอย้ายออกใหม่',
            ${`ผู้เช่า ${tenant.name || ''} (${roomLabel || 'ไม่ระบุห้อง'}) ได้ส่งคำขอย้ายออกในวันที่ ` + new Date(desiredDate).toLocaleDateString('th-TH')},
            'move_out_requested',
            0,
            '/owner/bookings',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Move-out owner notify warn:', ne);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'ส่งเรื่องแจ้งย้ายออกเรียบร้อยแล้ว ระบบได้คำนวณเงินประกันเบื้องต้นให้ผู้ดูแลเรียบร้อย',
      calculation: {
        isCompleted,
        depositAmount,
        unpaidTotal,
        penaltyAmount,
        netRefund,
        promptpayTarget
      }
    });
  } catch (error: any) {
    console.error('[POST /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ success: false, message: 'Missing requestId' }, { status: 400 });

    const sql = getDb();
    
    // Find tenant by email
    const tenantRes = await sql`SELECT id FROM tenants WHERE email = ${session.user.email} LIMIT 1`;
    if (tenantRes.length === 0) return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    const tenantId = tenantRes[0].id;

    // Delete request if it belongs to tenant and is Pending
    const delRes = await sql`
      DELETE FROM move_out_requests 
      WHERE id = ${requestId} AND tenant_id = ${tenantId} AND status = 'Pending'
    `;

    if ((delRes as any).affectedRows === 0 && delRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่สามารถยกเลิกคำร้องนี้ได้' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'ยกเลิกคำร้องขอย้ายออกเรียบร้อยแล้ว' });
  } catch (error: any) {
    console.error('[DELETE /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
