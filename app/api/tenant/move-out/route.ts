import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { cancelMoveOut, refusalStatus, requestMoveOut, tenantSettlement } from '@/lib/moveOut';
import { notifyUser, ownerUserId } from '@/lib/move-out-notify';

// GET — the tenant's Active contract and their move-out (settlement from lib/moveOut.ts; an older request without
// one is returned as legacy and handled by the owner).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const sql = getDb();
    const now = new Date();
    const contracts = await sql`
      SELECT c.id, c.start_date, c.end_date, c.status, r.room_number
      FROM contracts c JOIN tenants t ON t.id = c.tenant_id LEFT JOIN rooms r ON r.id = c.room_id
      WHERE (t.user_id = ${user.id} OR LOWER(t.email) = LOWER(${user.email})) AND c.status IN ('Active', 'MoveOutPending')
      ORDER BY c.id DESC LIMIT 1
    `;
    const legacy = await sql`
      SELECT mor.id, mor.status, mor.desired_date FROM move_out_requests mor JOIN tenants t ON t.id = mor.tenant_id
      LEFT JOIN move_out_settlements s ON s.request_id = mor.id
      WHERE (t.user_id = ${user.id} OR LOWER(t.email) = LOWER(${user.email})) AND s.id IS NULL AND mor.status IN ('Pending', 'Approved')
      ORDER BY mor.id DESC LIMIT 1
    `;
    return NextResponse.json({
      success: true,
      contract: contracts[0] || null,
      settlement: await tenantSettlement(user, now),
      legacyRequest: legacy[0] || null,
    });
  } catch (error: any) {
    console.error('[GET /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}

// POST { returnDate (or desiredDate), reason, promptpayTarget, promptpayName, bankName } — give notice.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const result = await requestMoveOut(user, {
      returnDate: body.returnDate || body.desiredDate || body.desired_date,
      reason: body.reason,
      promptpayTarget: body.promptpayTarget,
      promptpayName: body.promptpayName,
      bankName: body.bankName,
    }, now);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });

    await notifyUser(await ownerUserId(), 'มีคำขอย้ายออกใหม่',
      `ผู้เช่า ${user.name || ''} แจ้งย้ายออก คืนห้องวันที่ ${new Date(`${body.returnDate || body.desiredDate}T00:00:00+07:00`).toLocaleDateString('th-TH')}`,
      '/owner/move-out', now);
    return NextResponse.json({
      success: true,
      message: 'ส่งเรื่องแจ้งย้ายออกแล้ว',
      warnings: result.warnings,
      clause13: result.clause13,
      settlementId: result.settlementId,
    });
  } catch (error: any) {
    console.error('[POST /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: 'ส่งเรื่องแจ้งย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}

// DELETE { settlementId } (or { requestId }) — withdraw the notice before the room is returned.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    let settlementId = Number(body.settlementId);
    if (!settlementId && body.requestId) {
      const sql = getDb();
      const rows = await sql`SELECT id FROM move_out_settlements WHERE request_id = ${Number(body.requestId)} LIMIT 1`;
      if (!rows[0]) {
        return NextResponse.json({ success: false, message: 'คำขอย้ายออกแบบเดิม — กรุณาติดต่อเจ้าของหอเพื่อยกเลิก' }, { status: 409 });
      }
      settlementId = Number(rows[0].id);
    }
    if (!settlementId) return NextResponse.json({ success: false, message: 'ไม่พบคำขอย้ายออก' }, { status: 404 });
    const result = await cancelMoveOut(settlementId, user, new Date());
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    return NextResponse.json({ success: true, message: 'ยกเลิกคำขอย้ายออกแล้ว' });
  } catch (error: any) {
    console.error('[DELETE /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: 'ยกเลิกคำขอย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}
