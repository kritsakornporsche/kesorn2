import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { computeRoomRisks, riskSummary, INSUFFICIENT_TEXT } from '@/lib/risk';
import { loadPushSubscriptions, sendWebPushToRole } from '@/lib/features/web-push-server';

export const dynamic = 'force-dynamic';

// Room risk (commit 29): computed from real data in lib/risk — electricity units against the room's 3-cycle average,
// overdue bills, days left on the Active contract. Rooms without data are "ข้อมูลไม่พอ", not a made-up score.
export async function GET() {
  const guard = await requireRole(['owner', 'manager', 'researcher']);
  if ('response' in guard) return guard.response;
  try {
    const rooms = await computeRoomRisks(getDb(), new Date());
    rooms.sort((a, b) => (a.riskLevel === 'INSUFFICIENT' ? 1 : 0) - (b.riskLevel === 'INSUFFICIENT' ? 1 : 0) || b.totalScore - a.totalScore);
    // a researcher sees the risk of rooms, not who lives in them
    const shown = guard.user.role === 'researcher' ? rooms.map((r) => ({ ...r, tenantName: r.contract ? 'ผู้เช่า' : r.tenantName })) : rooms;
    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: { ...riskSummary(rooms), pushSubscribersCount: loadPushSubscriptions().length },
      rooms: shown,
    });
  } catch (error: any) {
    console.error('[Owner Risk API GET Error]', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการคำนวณความเสี่ยง: ' + error.message },
      { status: 500 }
    );
  }
}

// Push an alert about one room (its real figures) to owner / manager devices
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager', 'researcher']);
  if ('response' in guard) return guard.response;
  try {
    const body = await req.json().catch(() => ({}));
    const { action, roomNumber } = body;

    if (action === 'trigger_simulation') {
      const rooms = await computeRoomRisks(getDb(), new Date());
      const room = rooms.find((r) => r.roomNumber === String(roomNumber || ''));
      if (!room) return NextResponse.json({ success: false, message: 'ไม่พบห้องนี้' }, { status: 404 });
      if (room.riskLevel === 'INSUFFICIENT') {
        return NextResponse.json({ success: false, message: `ห้อง ${room.roomNumber}: ${INSUFFICIENT_TEXT} — ไม่ส่งแจ้งเตือน` }, { status: 409 });
      }
      const url = room.financialScore > 0 ? '/owner/billing' : room.energyScore > 0 ? '/owner/meters' : room.contractScore > 0 ? '/owner/contracts' : '/owner/risk';
      const payload = {
        title: `🚨 ห้อง ${room.roomNumber}: ความเสี่ยง ${room.totalScore} คะแนน`,
        body: room.primaryFactor,
        url,
        tag: `owner-risk-${room.roomNumber}-${Date.now()}`,
      };
      let sentCount = 0;
      let failedCount = 0;
      for (const role of ['owner', 'manager']) {
        const r: any = await sendWebPushToRole(role, payload);
        sentCount += Number(r?.sentCount || 0);
        failedCount += Number(r?.failedCount || 0);
      }
      return NextResponse.json({
        success: true,
        message: `ส่งแจ้งเตือนห้อง ${room.roomNumber} ถึงเจ้าของหอ/ผู้จัดการแล้ว (${sentCount} อุปกรณ์)`,
        details: { sentCount, failedCount },
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Owner Risk API POST Error]', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการส่งแจ้งเตือน: ' + error.message },
      { status: 500 }
    );
  }
}
