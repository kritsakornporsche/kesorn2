import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

async function ensureTable(sql: any) {
  await sql`
    CREATE TABLE IF NOT EXISTS deposit_refund_requests (
      id SERIAL PRIMARY KEY,
      contract_id INTEGER NOT NULL,
      tenant_id INTEGER,
      room_id INTEGER NOT NULL,
      dorm_id INTEGER NOT NULL,
      requester_name VARCHAR(255),
      requester_email VARCHAR(255),
      deposit_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
      reason TEXT,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      owner_note TEXT,
      refund_slip_url TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
}

// ──────────────────────────────────────────────────────────
// GET  /api/tenant/refund-request
// Returns the current tenant's refund request(s) and
// their pending booking (PendingOwnerSignature) if any
// ──────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();
    await ensureTable(sql);

    const userEmail = session.user.email;
    const userId = (session.user as any)?.id || 0;

    // 1. Find tenant's pending booking (PendingOwnerSignature only)
    const pendingRes = await sql`
      SELECT
        c.id as contract_id,
        c.deposit_amount,
        c.start_date,
        c.status as contract_status,
        c.created_at as booking_created_at,
        t.id as tenant_id,
        t.name as tenant_name,
        r.id as room_id,
        r.room_number,
        r.room_type,
        r.floor,
        dr.id as dorm_id,
        COALESCE(dr.dorm_name, 'หอพักเกษร 2') as dorm_name,
        dr.address as dorm_address
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.id
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN dormitory_registry dr ON COALESCE(r.dorm_id, 1) = dr.id
      WHERE (t.email = ${userEmail}
         OR t.user_id = ${userId}
         OR t.user_id IN (SELECT id FROM users WHERE email = ${userEmail}))
        AND c.status = 'PendingOwnerSignature'
      ORDER BY c.id DESC
      LIMIT 1
    `;

    const pendingBooking = pendingRes.length > 0 ? pendingRes[0] : null;

    // 2. Find existing refund requests for this tenant
    const refundRequests = await sql`
      SELECT
        drr.*,
        r.room_number,
        COALESCE(dr.dorm_name, 'หอพักเกษร 2') as dorm_name
      FROM deposit_refund_requests drr
      JOIN rooms r ON drr.room_id = r.id
      LEFT JOIN dormitory_registry dr ON COALESCE(drr.dorm_id, 1) = dr.id
      WHERE drr.requester_email = ${userEmail}
         OR drr.tenant_id IN (
           SELECT id FROM tenants WHERE email = ${userEmail}
             OR user_id = ${userId}
             OR user_id IN (SELECT id FROM users WHERE email = ${userEmail})
         )
      ORDER BY drr.created_at DESC
    `;

    // Check if there is already a pending refund request for the current booking
    const existingPendingRequest = pendingBooking
      ? refundRequests.find((r: any) =>
          r.contract_id === pendingBooking.contract_id && r.status === 'pending'
        ) || null
      : null;

    return NextResponse.json({
      success: true,
      pendingBooking,
      refundRequests,
      existingPendingRequest,
    });
  } catch (error: any) {
    console.error('[API Tenant RefundRequest GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// ──────────────────────────────────────────────────────────
// POST /api/tenant/refund-request
// Tenant submits a new deposit refund request
// ──────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();
    await ensureTable(sql);

    const userEmail = session.user.email;
    const userId = (session.user as any)?.id || 0;
    const body = await req.json();
    const contractId = body.contractId || body.contract_id;
    const reason = body.reason;

    if (!contractId) {
      return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
    }

    // 1. Verify the contract belongs to this tenant and is still PendingOwnerSignature
    const contractRes = await sql`
      SELECT
        c.id,
        c.deposit_amount,
        c.status,
        c.room_id,
        t.id as tenant_id,
        t.name as tenant_name,
        t.email as tenant_email,
        r.dorm_id
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.id
      JOIN rooms r ON c.room_id = r.id
      WHERE c.id = ${contractId}
        AND (t.email = ${userEmail}
          OR t.user_id = ${userId}
          OR t.user_id IN (SELECT id FROM users WHERE email = ${userEmail}))
      LIMIT 1
    `;

    if (contractRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลการจองของคุณ' }, { status: 404 });
    }

    const contract = contractRes[0];

    if (contract.status !== 'PendingOwnerSignature') {
      return NextResponse.json({
        success: false,
        message: 'ไม่สามารถขอคืนเงินได้ เนื่องจากสัญญาไม่ได้อยู่ในสถานะรอการอนุมัติ'
      }, { status: 400 });
    }

    if (!contract.deposit_amount || Number(contract.deposit_amount) <= 0) {
      return NextResponse.json({
        success: false,
        message: 'ไม่พบจำนวนเงินมัดจำในสัญญานี้'
      }, { status: 400 });
    }

    // 2. Check for duplicate pending request
    const dupCheck = await sql`
      SELECT id FROM deposit_refund_requests
      WHERE contract_id = ${contractId} AND status = 'pending'
      LIMIT 1
    `;

    if (dupCheck.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'คุณมีคำร้องคืนเงินที่รออยู่แล้ว กรุณารอเจ้าของหอพักดำเนินการ'
      }, { status: 400 });
    }

    // 3. Insert the refund request
    await sql`
      INSERT INTO deposit_refund_requests (
        contract_id,
        tenant_id,
        room_id,
        dorm_id,
        requester_name,
        requester_email,
        deposit_amount,
        reason,
        status
      ) VALUES (
        ${contractId},
        ${contract.tenant_id},
        ${contract.room_id},
        ${contract.dorm_id || 1},
        ${contract.tenant_name || userEmail},
        ${contract.tenant_email || userEmail},
        ${contract.deposit_amount},
        ${reason || 'ต้องการยกเลิกการจองและขอคืนเงินมัดจำ'},
        'pending'
      )
    `;

    return NextResponse.json({
      success: true,
      message: 'ยื่นคำร้องขอคืนเงินมัดจำเรียบร้อยแล้ว กรุณารอเจ้าของหอพักดำเนินการ'
    });

  } catch (error: any) {
    console.error('[API Tenant RefundRequest POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
