import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { computeRoomRisks, riskSummary } from '@/lib/risk';
import { loadPushSubscriptions, sendWebPushToRole } from '@/lib/features/web-push-server';

export const dynamic = 'force-dynamic';

// Researcher risk lab (commit 29): signed-in owner / manager / researcher only. The same real-data risk as the owner's
// page (lib/risk); a researcher sees rooms, not tenant names. Test alerts go to staff and researcher devices only.
const LAB_ROLES = ['owner', 'manager', 'researcher'] as const;

export async function GET() {
  const guard = await requireRole([...LAB_ROLES]);
  if ('response' in guard) return guard.response;
  try {
    const rooms = await computeRoomRisks(getDb(), new Date());
    rooms.sort((a, b) => (a.riskLevel === 'INSUFFICIENT' ? 1 : 0) - (b.riskLevel === 'INSUFFICIENT' ? 1 : 0) || b.totalScore - a.totalScore);
    const shown = guard.user.role === 'researcher' ? rooms.map((r) => ({ ...r, tenantName: r.contract ? 'ผู้เช่า' : r.tenantName })) : rooms;
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: { ...riskSummary(rooms), pushSubscribersCount: loadPushSubscriptions().length },
      rooms: shown,
    });
  } catch (error: any) {
    console.error('[Risk Analysis GET Error]', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการคำนวณความเสี่ยง: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const guard = await requireRole([...LAB_ROLES]);
  if ('response' in guard) return guard.response;
  try {
    const body = await req.json().catch(() => ({}));
    const { action, scenario, roomNumber } = body;

    if (action === 'trigger_simulation') {
      let title = '🚨 แจ้งเตือนความเสี่ยงระบบหอพักเกษร 2 (ทดสอบ)';
      let text = 'ตรวจพบเหตุการณ์ผิดปกติในระบบ';
      let url = '/researcher/lab/risk';
      const room = roomNumber ? String(roomNumber) : '-';

      if (scenario === 'financial') {
        title = `🚨 [ห้อง ${room}] ความเสี่ยงการเงิน (ทดสอบ)`;
        text = 'ทดสอบแจ้งเตือนยอดค้างชำระใกล้ชนเพดานเงินประกัน';
      } else if (scenario === 'phantom') {
        title = `⚡ [ห้อง ${room}] ความปลอดภัยไฟฟ้า (ทดสอบ)`;
        text = 'ทดสอบแจ้งเตือนการใช้ไฟขณะห้องว่าง';
        url = '/researcher/lab/iot-meter';
      } else if (scenario === 'overload') {
        title = `🔥 [ห้อง ${room}] โหลดไฟฟ้าเกิน (ทดสอบ)`;
        text = 'ทดสอบแจ้งเตือนโหลดเกินพิกัดและการตัดรีเลย์';
        url = '/researcher/lab/digital-twin';
      } else if (scenario === 'contract') {
        title = `📋 [ห้อง ${room}] สัญญาใกล้หมดอายุ (ทดสอบ)`;
        text = 'ทดสอบแจ้งเตือนสัญญาเช่าใกล้หมดอายุ';
      }

      // a test alert: staff and researcher devices only (never tenants)
      let sentCount = 0;
      let failedCount = 0;
      for (const role of LAB_ROLES) {
        const r: any = await sendWebPushToRole(role, { title, body: text, url, tag: `risk-alert-${scenario}-${Date.now()}` });
        sentCount += Number(r?.sentCount || 0);
        failedCount += Number(r?.failedCount || 0);
      }

      return NextResponse.json({
        success: true,
        message: `ยิงแจ้งเตือนทดสอบสำเร็จ (${sentCount} อุปกรณ์ของเจ้าของหอ/ผู้จัดการ/นักวิจัย)`,
        details: { sentCount, failedCount },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Risk Analysis POST Error]', error);
    return NextResponse.json(
      { success: false, message: 'ส่ง Web Push ไม่สำเร็จ: ' + error.message },
      { status: 500 }
    );
  }
}
