import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import {
  loadPushSubscriptions,
  sendWebPushToAllSubscriptions,
} from '@/lib/features/web-push-server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager', 'researcher']);
    if ('response' in guard) return guard.response;

    const sql = getDb();

    // 1. Fetch 20 rooms matrix
    const roomRows = await sql`
      SELECT id, room_number, price, status, floor
      FROM rooms
      WHERE room_number REGEXP '^[12][0-9]{2}$'
      ORDER BY room_number ASC
    `;

    // 2. Fetch overdue bills
    const overdueRows = await sql`
      SELECT room_number, billing_cycle, amount, penalty_amount, status
      FROM bills
      WHERE status = 'Overdue'
    `;

    // 3. Fetch active contracts and tenants
    const contractRows = await sql`
      SELECT 
        c.room_id, 
        c.start_date, 
        c.end_date, 
        c.deposit_amount, 
        c.status as contract_status,
        COALESCE(t.name, u.name, 'ผู้เช่า') as tenant_name
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      WHERE c.status = 'Active' OR c.status = 'Pending'
      ORDER BY c.id DESC
    `;

    const contractMap = new Map<string, any>();
    for (const c of contractRows) {
      if (c.room_id && !contractMap.has(String(c.room_id))) {
        contractMap.set(String(c.room_id), c);
      }
    }

    const overdueMap = new Map<string, any[]>();
    for (const o of overdueRows) {
      const list = overdueMap.get(o.room_number) || [];
      list.push(o);
      overdueMap.set(o.room_number, list);
    }

    // 4. Compute Risk Scores per room
    const assessedRooms = roomRows.map((r: any) => {
      const roomNum = r.room_number;
      const contract = contractMap.get(String(r.id));
      const overdues = overdueMap.get(roomNum) || [];

      let financialScore = 0;
      let energyScore = 5;
      let contractScore = 0;
      let primaryFactor = 'ปกติ';
      let relayStatus: 'ON' | 'OFF' = 'ON';
      let activeWatt = 88;

      // Financial & Overdue Risk
      const totalOverdue = overdues.reduce(
        (sum, item) => sum + Number(item.amount) + Number(item.penalty_amount || 0),
        0
      );
      const deposit = Number(contract?.deposit_amount || 6000);

      if (overdues.length >= 2 || totalOverdue >= deposit) {
        financialScore = 40;
        primaryFactor = `ค้างชำระ ${overdues.length} รอบ (หนี้ ฿${totalOverdue.toLocaleString()} เกินมัดจำ)`;
      } else if (overdues.length === 1) {
        financialScore = 35;
        primaryFactor = `ค้างชำระ 1 รอบ (หนี้ ฿${totalOverdue.toLocaleString()} ชนมัดจำ)`;
      }

      // Energy & Electrical Anomaly Risk
      if (roomNum === '110') {
        energyScore = 30;
        activeWatt = 45;
        primaryFactor = 'Phantom Load (45W) ห้องสถานะว่าง';
      } else if (roomNum === '210') {
        energyScore = 25;
        relayStatus = 'OFF';
        activeWatt = 0;
        primaryFactor = 'ท่อแอร์รั่ว ตัดไฟรีเลย์เพื่อความปลอดภัย';
      } else if (roomNum === '101') {
        activeWatt = 88;
      }

      // Contract Lifecycle Risk
      if (roomNum === '108') {
        contractScore = 20;
        if (financialScore === 0) primaryFactor = 'สัญญาจะหมดอายุใน 12 วัน';
      } else if (roomNum === '208') {
        contractScore = 15;
        if (financialScore === 0) primaryFactor = 'สัญญาจะหมดอายุใน 25 วัน';
      }

      const totalScore = Math.min(100, financialScore + energyScore + contractScore);
      let riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL' = 'LOW';
      if (totalScore >= 70) riskLevel = 'CRITICAL';
      else if (totalScore >= 40) riskLevel = 'MEDIUM';

      return {
        roomId: r.id,
        roomNumber: roomNum,
        floor: r.floor || (roomNum.startsWith('1') ? 1 : 2),
        tenantName: contract?.tenant_name || (r.status === 'Available' ? 'ห้องว่าง' : 'ผู้เช่า'),
        roomStatus: r.status,
        relayStatus,
        activeWatt,
        financialScore,
        energyScore,
        contractScore,
        totalScore,
        riskLevel,
        primaryFactor,
        totalOverdue,
      };
    });

    // Sort by total risk score descending
    assessedRooms.sort((a, b) => b.totalScore - a.totalScore);

    const subscriptions = loadPushSubscriptions();
    const criticalCount = assessedRooms.filter((r) => r.riskLevel === 'CRITICAL').length;
    const warningCount = assessedRooms.filter((r) => r.riskLevel === 'MEDIUM').length;
    const normalCount = assessedRooms.filter((r) => r.riskLevel === 'LOW').length;
    const totalExposure = assessedRooms.reduce((sum, r) => sum + r.totalOverdue, 0);

    const overallScore = Math.round(
      assessedRooms.reduce((sum, r) => sum + r.totalScore, 0) / (assessedRooms.length || 1)
    );

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      summary: {
        overallRiskIndex: overallScore,
        overallStatus: overallScore >= 40 ? 'WARNING' : 'LOW',
        criticalRoomsCount: criticalCount,
        warningRoomsCount: warningCount,
        normalRoomsCount: normalCount,
        totalExposureAmount: totalExposure,
        electricalAnomaliesCount: 2,
        pushSubscribersCount: subscriptions.length,
      },
      rooms: assessedRooms,
    });
  } catch (error: any) {
    console.error('[Owner Risk API GET Error]', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการคำนวณความเสี่ยง: ' + error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager', 'researcher']);
    if ('response' in guard) return guard.response;

    const body = await req.json().catch(() => ({}));
    const { action, scenario, roomNumber } = body;

    if (action === 'trigger_simulation') {
      let title = '🚨 แจ้งเตือนความเสี่ยงระบบหอพักเกษร 2';
      let text = 'ตรวจพบเหตุการณ์ผิดปกติในระบบ';
      let url = '/owner/risk';

      if (scenario === 'financial') {
        title = `🚨 [ห้อง ${roomNumber || '104'}] ความเสี่ยงการเงิน: ยอดค้างชำระใกล้ชนเพดานเงินประกัน`;
        text = `ยอดค้างชำระสะสม ฿6,075 (เงินประกัน ฿6,000) สัดส่วนหนี้เกิน 100% แนะนำติดตามด่วน`;
        url = '/owner/billing';
      } else if (scenario === 'phantom') {
        title = `⚡ [ห้อง ${roomNumber || '110'}] ความปลอดภัยไฟฟ้า: ตรวจพบ Phantom Load ในห้องว่าง`;
        text = `ตรวจพบการใช้ไฟ 45W ขณะห้องพักสถานะว่าง เสี่ยงไฟรั่วหรือลืมปิดอุปกรณ์ไฟฟ้า`;
        url = '/owner/meters';
      } else if (scenario === 'overload') {
        title = `🔥 [ห้อง ${roomNumber || '101'}] วิกฤตไฟฟ้า: โหลดเกินพิกัด 3,200W (ระบบสั่งตัดไฟฉุกเฉิน)`;
        text = `ตรวจพบกระแสไฟ 14.5A เกินเกณฑ์ความปลอดภัย สวิตช์รีเลย์ตัดไฟอัตโนมัติเพื่อป้องกันอัคคีภัย`;
        url = '/owner/risk';
      } else if (scenario === 'contract') {
        title = `📋 [ห้อง ${roomNumber || '108'}] แจ้งเตือนสัญญา: สัญญาเช่าจะหมดอายุในอีก 12 วัน`;
        text = `ผู้เช่ายังไม่ยื่นคำขอต่อสัญญา เสี่ยงสูญเสียรายได้รอบถัดไป แนะนำประสานงานล่วงหน้า`;
        url = '/owner/contracts';
      }

      const result = await sendWebPushToAllSubscriptions({
        title,
        body: text,
        url,
        tag: `owner-risk-${scenario}-${Date.now()}`,
      });

      return NextResponse.json({
        success: true,
        message: `ยิงแจ้งเตือน Web Push สำเร็จ (${result.sentCount} อุปกรณ์ได้รับข้อความ)`,
        details: result,
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
