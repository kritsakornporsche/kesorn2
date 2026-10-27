import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { acknowledgeInspection, getInspection, refusalStatus } from '@/lib/inspections';
import { serverErrorMessage } from '@/lib/db-errors';

// POST { contractId, kind? } — the contract's own tenant acknowledges an inspection (locked from then on).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const contractId = Number(body?.contractId);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    }
    const kind = body?.kind === 'move_out' ? 'move_out' : 'move_in';
    const result = await acknowledgeInspection(contractId, user, new Date(), kind);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    // Send WebPush & In-App Notification to owner
    try {
      const { getDb } = await import('@/lib/db');
      const sql = getDb();
      const rows = await sql`
        SELECT c.id, r.room_number, t.name as tenant_name
        FROM contracts c
        LEFT JOIN rooms r ON r.id = c.room_id
        LEFT JOIN tenants t ON t.id = c.tenant_id
        WHERE c.id = ${contractId}
        LIMIT 1
      `;
      const roomNum = rows[0]?.room_number || '';
      const tenantName = rows[0]?.tenant_name || user.email || 'ผู้เช่า';
      const { createRoleNotification } = await import('@/lib/notifications');
      await createRoleNotification({
        role: 'owner',
        title: '✅ ผู้เช่ารับทราบผลตรวจสภาพห้องแล้ว',
        message: `คุณ ${tenantName} (ห้อง ${roomNum}) ได้กดยืนยันรับทราบผลตรวจสภาพห้องพักแล้ว`,
        link: `/owner/contracts/${contractId}`,
      });
    } catch (ne) {
      console.warn('[Inspection ack notify warn]:', ne);
    }

    return NextResponse.json({ success: true, message: 'รับทราบผลตรวจห้องแล้ว', inspection: await getInspection(contractId, kind) });
  } catch (error: any) {
    console.error('[Tenant inspection acknowledge Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'บันทึกการรับทราบไม่สำเร็จ') }, { status: 500 });
  }
}
