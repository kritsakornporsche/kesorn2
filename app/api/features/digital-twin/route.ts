import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { dynamicQrHistory } from '@/lib/features/dynamic-bill-qr';
import { sendWebPushToAllSubscriptions } from '@/lib/features/web-push-server';

export type OccupancyStatus = 'OCCUPIED' | 'AVAILABLE' | 'RESERVED' | 'MAINTENANCE';
export type BillingStatus = 'PAID' | 'PENDING' | 'OVERDUE' | 'NO_BILL';
export type MaintenanceStatus = 'NONE' | 'IN_PROGRESS' | 'URGENT';

export interface DigitalTwinRoom {
  roomNumber: string;
  floor: 1 | 2;
  wing: 'NORTH' | 'SOUTH';
  positionIndex: number; // 1..5 per wing
  roomType: string;
  rentPrice: number;
  occupancyStatus: OccupancyStatus;
  tenantName: string | null;
  tenantPhone: string | null;
  billingStatus: BillingStatus;
  billAmount: number;
  overdueDays: number;
  electricKwh: number;
  waterUnits: number;
  maintenanceStatus: MaintenanceStatus;
  maintenanceIssue: string | null;
  iotOnline: boolean;
  updatedAt: string;
}

export interface ResearcherPushLogItem {
  id: string;
  category: 'ELECTRIC_ANOMALY' | 'OVERDUE_BILL' | 'URGENT_MAINTENANCE' | 'PAYMENT_APPROVED' | 'SYSTEM_SCAN';
  roomNumber: string;
  title: string;
  body: string;
  url: string;
  createdAt: string;
}

const DEFAULT_20_ROOMS_SEED: Omit<DigitalTwinRoom, 'updatedAt'>[] = [
  // ── ชั้นที่ 1 (10 ห้อง: 101 - 110) ──
  {
    roomNumber: '101',
    floor: 1,
    wing: 'NORTH',
    positionIndex: 1,
    roomType: 'ห้องแอร์ Standard (IoT จริง)',
    rentPrice: 3500,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายธนกฤต วงศ์สวัสดิ์',
    tenantPhone: '081-234-5601',
    billingStatus: 'PAID',
    billAmount: 4320,
    overdueDays: 0,
    electricKwh: 112,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '102',
    floor: 1,
    wing: 'NORTH',
    positionIndex: 2,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3500,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวพิมพ์ชนก สุขเกษม',
    tenantPhone: '089-412-8802',
    billingStatus: 'PENDING',
    billAmount: 4180,
    overdueDays: 0,
    electricKwh: 95,
    waterUnits: 3,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '103',
    floor: 1,
    wing: 'NORTH',
    positionIndex: 3,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3500,
    occupancyStatus: 'AVAILABLE',
    tenantName: null,
    tenantPhone: null,
    billingStatus: 'NO_BILL',
    billAmount: 0,
    overdueDays: 0,
    electricKwh: 8,
    waterUnits: 0,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '104',
    floor: 1,
    wing: 'NORTH',
    positionIndex: 4,
    roomType: 'ห้องแอร์ VIP',
    rentPrice: 4000,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายกฤษกร บัวอินทร์',
    tenantPhone: '063-604-0550',
    billingStatus: 'OVERDUE',
    billAmount: 6190,
    overdueDays: 5,
    electricKwh: 298,
    waterUnits: 6,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '105',
    floor: 1,
    wing: 'NORTH',
    positionIndex: 5,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3500,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายณัฐวุฒิ ศรีสุวรรณ',
    tenantPhone: '082-991-1105',
    billingStatus: 'PAID',
    billAmount: 4450,
    overdueDays: 0,
    electricKwh: 128,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '106',
    floor: 1,
    wing: 'SOUTH',
    positionIndex: 1,
    roomType: 'ห้องพัดลม Standard',
    rentPrice: 2800,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวกัญญาณัฐ ทองดี',
    tenantPhone: '084-510-2206',
    billingStatus: 'PAID',
    billAmount: 3290,
    overdueDays: 0,
    electricKwh: 58,
    waterUnits: 3,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '107',
    floor: 1,
    wing: 'SOUTH',
    positionIndex: 2,
    roomType: 'ห้องพัดลม Standard',
    rentPrice: 2800,
    occupancyStatus: 'MAINTENANCE',
    tenantName: null,
    tenantPhone: null,
    billingStatus: 'NO_BILL',
    billAmount: 0,
    overdueDays: 0,
    electricKwh: 14,
    waterUnits: 1,
    maintenanceStatus: 'URGENT',
    maintenanceIssue: 'ท่อน้ำดีใต้อ่างล้างหน้าซึมและเบรกเกอร์ไฟตัด',
    iotOnline: true,
  },
  {
    roomNumber: '108',
    floor: 1,
    wing: 'SOUTH',
    positionIndex: 3,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3500,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวกมลชนก ศรีวิชัย',
    tenantPhone: '086-773-4108',
    billingStatus: 'OVERDUE',
    billAmount: 5840,
    overdueDays: 7,
    electricKwh: 276,
    waterUnits: 5,
    maintenanceStatus: 'IN_PROGRESS',
    maintenanceIssue: 'แอร์ไม่เย็น คอมเพรสเซอร์ทำงานหนักกินไฟสูงผิดปกติ',
    iotOnline: true,
  },
  {
    roomNumber: '109',
    floor: 1,
    wing: 'SOUTH',
    positionIndex: 4,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3500,
    occupancyStatus: 'RESERVED',
    tenantName: 'นายพีรพัฒน์ จันทร์เพ็ญ (จองเข้าพัก)',
    tenantPhone: '091-334-9109',
    billingStatus: 'PAID',
    billAmount: 3500,
    overdueDays: 0,
    electricKwh: 12,
    waterUnits: 0,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '110',
    floor: 1,
    wing: 'SOUTH',
    positionIndex: 5,
    roomType: 'ห้องแอร์ VIP',
    rentPrice: 4000,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายอภิสิทธิ์ รัตนโชติ',
    tenantPhone: '088-612-0110',
    billingStatus: 'PAID',
    billAmount: 4920,
    overdueDays: 0,
    electricKwh: 135,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },

  // ── ชั้นที่ 2 (10 ห้อง: 201 - 210) ──
  {
    roomNumber: '201',
    floor: 2,
    wing: 'NORTH',
    positionIndex: 1,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวชลธิชา วัฒนากูล',
    tenantPhone: '083-112-5201',
    billingStatus: 'PAID',
    billAmount: 4510,
    overdueDays: 0,
    electricKwh: 118,
    waterUnits: 3,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '202',
    floor: 2,
    wing: 'NORTH',
    positionIndex: 2,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายภูริทัต เจริญผล',
    tenantPhone: '085-449-6202',
    billingStatus: 'PENDING',
    billAmount: 4680,
    overdueDays: 0,
    electricKwh: 142,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '203',
    floor: 2,
    wing: 'NORTH',
    positionIndex: 3,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวสุพิชชา อมรรัตน์',
    tenantPhone: '087-203-7203',
    billingStatus: 'PAID',
    billAmount: 4390,
    overdueDays: 0,
    electricKwh: 104,
    waterUnits: 3,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '204',
    floor: 2,
    wing: 'NORTH',
    positionIndex: 4,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'AVAILABLE',
    tenantName: null,
    tenantPhone: null,
    billingStatus: 'NO_BILL',
    billAmount: 0,
    overdueDays: 0,
    electricKwh: 5,
    waterUnits: 0,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '205',
    floor: 2,
    wing: 'NORTH',
    positionIndex: 5,
    roomType: 'ห้องแอร์ VIP',
    rentPrice: 4200,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายศุภณัฐ อินทร์แก้ว',
    tenantPhone: '092-881-2205',
    billingStatus: 'OVERDUE',
    billAmount: 6580,
    overdueDays: 4,
    electricKwh: 315,
    waterUnits: 6,
    maintenanceStatus: 'URGENT',
    maintenanceIssue: 'มิเตอร์ไฟวิ่งสูงผิดปกติ (315 kWh) สงสัยไฟรั่วหรือเปิดแอร์ทิ้ง 24 ชม.',
    iotOnline: true,
  },
  {
    roomNumber: '206',
    floor: 2,
    wing: 'SOUTH',
    positionIndex: 1,
    roomType: 'ห้องพัดลม Standard',
    rentPrice: 2900,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายกิตติพงศ์ สายทอง',
    tenantPhone: '081-908-3206',
    billingStatus: 'PAID',
    billAmount: 3420,
    overdueDays: 0,
    electricKwh: 64,
    waterUnits: 3,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '207',
    floor: 2,
    wing: 'SOUTH',
    positionIndex: 2,
    roomType: 'ห้องพัดลม Standard',
    rentPrice: 2900,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาววรัญญา นาคประสิทธิ์',
    tenantPhone: '089-654-4207',
    billingStatus: 'PENDING',
    billAmount: 3560,
    overdueDays: 0,
    electricKwh: 78,
    waterUnits: 4,
    maintenanceStatus: 'IN_PROGRESS',
    maintenanceIssue: 'หลอดไฟระเบียงหลังห้องกะพริบ รอเปลี่ยนหลอด LED',
    iotOnline: true,
  },
  {
    roomNumber: '208',
    floor: 2,
    wing: 'SOUTH',
    positionIndex: 3,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นายเจษฎา ภักดี',
    tenantPhone: '090-117-5208',
    billingStatus: 'PAID',
    billAmount: 4720,
    overdueDays: 0,
    electricKwh: 148,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '209',
    floor: 2,
    wing: 'SOUTH',
    positionIndex: 4,
    roomType: 'ห้องแอร์ Standard',
    rentPrice: 3600,
    occupancyStatus: 'AVAILABLE',
    tenantName: null,
    tenantPhone: null,
    billingStatus: 'NO_BILL',
    billAmount: 0,
    overdueDays: 0,
    electricKwh: 6,
    waterUnits: 0,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
  {
    roomNumber: '210',
    floor: 2,
    wing: 'SOUTH',
    positionIndex: 5,
    roomType: 'ห้องแอร์ VIP',
    rentPrice: 4200,
    occupancyStatus: 'OCCUPIED',
    tenantName: 'นางสาวณัฐนิชา พงษ์พานิช',
    tenantPhone: '094-552-9210',
    billingStatus: 'PAID',
    billAmount: 5190,
    overdueDays: 0,
    electricKwh: 136,
    waterUnits: 4,
    maintenanceStatus: 'NONE',
    maintenanceIssue: null,
    iotOnline: true,
  },
];

const globalForTwin = globalThis as unknown as {
  researcherTwinRooms?: Map<string, DigitalTwinRoom>;
  researcherPushLogs?: ResearcherPushLogItem[];
};

function getTwinRoomsMap(): Map<string, DigitalTwinRoom> {
  if (!globalForTwin.researcherTwinRooms) {
    const map = new Map<string, DigitalTwinRoom>();
    const now = new Date().toISOString();
    for (const r of DEFAULT_20_ROOMS_SEED) {
      map.set(r.roomNumber, { ...r, updatedAt: now });
    }
    globalForTwin.researcherTwinRooms = map;
  }
  return globalForTwin.researcherTwinRooms;
}

function getPushLogs(): ResearcherPushLogItem[] {
  if (!globalForTwin.researcherPushLogs) {
    globalForTwin.researcherPushLogs = [
      {
        id: 'PUSH-INIT-1',
        category: 'ELECTRIC_ANOMALY',
        roomNumber: '205',
        title: '⚡ เตือนหน่วยไฟสูงผิดปกติ ห้อง 205 (315 kWh)',
        body: 'ชั้น 2 ห้อง 205 (นายศุภณัฐ) ใช้ไฟฟ้าพุ่งแตะ 315 kWh เกินเกณฑ์มาตรฐาน 250 kWh',
        url: '/researcher/lab/digital-twin?room=205',
        createdAt: new Date(Date.now() - 1000 * 60 * 12).toISOString(),
      },
      {
        id: 'PUSH-INIT-2',
        category: 'OVERDUE_BILL',
        roomNumber: '104',
        title: '💳 แจ้งเตือนบิลค้างชำระ ห้อง 104 (฿6,190)',
        body: 'ชั้น 1 ห้อง 104 (นายกฤษกร) ค้างชำระเกินกำหนด 5 วัน กดเพื่อเปิด QR ชำระเงิน',
        url: '/researcher/lab/dynamic-qr',
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      },
    ];
  }
  return globalForTwin.researcherPushLogs;
}

export async function GET() {
  try {
    const roomsMap = getTwinRoomsMap();
    const pushLogs = getPushLogs();

    // Sync paid bills from Module 2 (Dynamic QR History) automatically
    for (const paidSession of dynamicQrHistory) {
      if (paidSession.status === 'PAID' && roomsMap.has(paidSession.roomNumber)) {
        const room = roomsMap.get(paidSession.roomNumber)!;
        if (room.billingStatus !== 'PAID') {
          room.billingStatus = 'PAID';
          room.overdueDays = 0;
          room.updatedAt = paidSession.paidAt || new Date().toISOString();
        }
      }
    }

    // Optional lightweight read from DB rooms table to sync rent price if present
    try {
      const sql = getDb();
      const dbRooms = await sql`
        SELECT room_number, price, status
        FROM rooms
        WHERE dorm_id = 1 OR dorm_id IS NULL
        LIMIT 30
      `;
      for (const dbRoom of dbRooms) {
        const num = String(dbRoom.room_number || '').trim();
        if (roomsMap.has(num) && dbRoom.price) {
          const item = roomsMap.get(num)!;
          item.rentPrice = Number(dbRoom.price) || item.rentPrice;
        }
      }
    } catch {
      // Safe fallback to in-memory 20 rooms if DB is busy
    }

    const rooms = Array.from(roomsMap.values()).sort(
      (a, b) => Number(a.roomNumber) - Number(b.roomNumber)
    );

    const summary = {
      totalRooms: rooms.length,
      floor1Count: rooms.filter((r) => r.floor === 1).length,
      floor2Count: rooms.filter((r) => r.floor === 2).length,
      occupiedCount: rooms.filter((r) => r.occupancyStatus === 'OCCUPIED').length,
      availableCount: rooms.filter((r) => r.occupancyStatus === 'AVAILABLE').length,
      reservedCount: rooms.filter((r) => r.occupancyStatus === 'RESERVED').length,
      maintenanceCount: rooms.filter(
        (r) => r.occupancyStatus === 'MAINTENANCE' || r.maintenanceStatus !== 'NONE'
      ).length,
      overdueCount: rooms.filter((r) => r.billingStatus === 'OVERDUE').length,
      pendingBillCount: rooms.filter((r) => r.billingStatus === 'PENDING').length,
      paidBillCount: rooms.filter((r) => r.billingStatus === 'PAID').length,
      highElectricAnomalyCount: rooms.filter((r) => r.electricKwh >= 250).length,
      totalElectricKwh: rooms.reduce((sum, r) => sum + r.electricKwh, 0),
    };

    return NextResponse.json({
      success: true,
      rooms,
      summary,
      pushLogs: pushLogs.slice(0, 15),
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถโหลดข้อมูล Digital Twin ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, roomNumber } = body;
    const roomsMap = getTwinRoomsMap();
    const pushLogs = getPushLogs();

    // 1. Update a specific room's simulated state in Researcher Sandbox
    if (action === 'update_room' && roomNumber && roomsMap.has(roomNumber)) {
      const room = roomsMap.get(roomNumber)!;
      if (body.occupancyStatus !== undefined) room.occupancyStatus = body.occupancyStatus;
      if (body.billingStatus !== undefined) {
        room.billingStatus = body.billingStatus;
        if (body.billingStatus === 'PAID') room.overdueDays = 0;
        if (body.billingStatus === 'OVERDUE' && room.overdueDays === 0) room.overdueDays = 5;
      }
      if (body.electricKwh !== undefined) room.electricKwh = Math.max(0, Number(body.electricKwh));
      if (body.maintenanceStatus !== undefined) {
        room.maintenanceStatus = body.maintenanceStatus;
        if (body.maintenanceStatus === 'NONE') {
          room.maintenanceIssue = null;
        } else if (body.maintenanceIssue) {
          room.maintenanceIssue = body.maintenanceIssue;
        }
      }
      room.updatedAt = new Date().toISOString();

      let generatedPush: ResearcherPushLogItem | null = null;
      if (body.triggerPush) {
        generatedPush = {
          id: `PUSH-${Date.now()}`,
          category: body.pushCategory || 'SYSTEM_SCAN',
          roomNumber: room.roomNumber,
          title:
            body.pushTitle ||
            `🔔 อัปเดตสถานะห้อง ${room.roomNumber} (ชั้น ${room.floor})`,
          body:
            body.pushBody ||
            `หน่วยไฟ ${room.electricKwh} kWh • สถานะบิล ${room.billingStatus}`,
          url: body.pushUrl || `/researcher/lab/digital-twin?room=${room.roomNumber}`,
          createdAt: new Date().toISOString(),
        };
        pushLogs.unshift(generatedPush);
      }

      return NextResponse.json({
        success: true,
        room,
        generatedPush,
        pushLogs: pushLogs.slice(0, 15),
      });
    }

    // 2. Broadcast Test Notification from Researcher to ALL Authenticated Member Roles in Database (Excluding Guest)
    if (action === 'broadcast_all_roles') {
      const senderLabel = body.senderLabel || 'Researcher (ผู้วิจัยระบบ)';
      const rawMessage = body.message || 'นี้คือการทดสอบการแจ้งเดือน';
      let notifiedCount = 0;
      const roleSet = new Set<string>();
      const recipientsSummary: string[] = [];

      try {
        const sql = getDb();

        // Clean up any historical notifications that still mention Guest
        await sql`
          DELETE FROM notifications
          WHERE title LIKE '%Guest%' OR message LIKE '%Guest%'
        `;

        const allUsers = await sql`
          SELECT
            u.id,
            u.email,
            u.name,
            COALESCE(NULLIF(u.role, ''), NULLIF(u.primary_role, ''), 'guest') as role,
            u.sub_role,
            (
              SELECT COUNT(*)
              FROM tenants t
              WHERE LOWER(t.email) = LOWER(u.email) AND t.status = 'Active'
            ) as is_active_tenant
          FROM users u
        `;

        for (const u of allUsers as any[]) {
          let r = String(u.role || 'guest').toLowerCase();

          // If a user has an active tenant record in `tenants` table, their true role is 'tenant'
          if ((r === 'guest' || !r) && Number(u.is_active_tenant) > 0) {
            r = 'tenant';
          }

          // Do NOT notify guests or unauthenticated accounts
          if (!r || r === 'guest') {
            continue;
          }

          roleSet.add(r);
          let targetLink = '/explore';
          let roleThai = 'Member (สมาชิกในระบบ)';

          if (r === 'owner') {
            targetLink = '/owner';
            roleThai = 'Owner (เจ้าของหอพัก)';
          } else if (r === 'tenant') {
            targetLink = '/tenant';
            roleThai = 'Tenant (ผู้เช่า)';
          } else if (r === 'keeper') {
            targetLink = u.sub_role === 'maid' ? '/keeper/maid' : '/keeper/technician';
            roleThai =
              u.sub_role === 'maid' ? 'Keeper (แม่บ้าน)' : 'Keeper (ช่างซ่อมบำรุง)';
          } else if (r === 'researcher') {
            targetLink = '/researcher/lab/digital-twin';
            roleThai = 'Researcher (ผู้วิจัยระบบ)';
          } else if (r === 'platform_admin' || r === 'admin') {
            targetLink = '/platform';
            roleThai = 'Admin (ผู้ดูแลระบบ)';
          }

          const recipientDisplay = `${roleThai} • ${u.name || u.email || `User#${u.id}`}`;
          recipientsSummary.push(recipientDisplay);

          const personalizedTitle = `🔔 จาก: ${senderLabel} ➔ ถึง: ${recipientDisplay}`;
          const personalizedMessage = `${rawMessage} (จาก: ${senderLabel} ➔ ถึง: ${recipientDisplay})`;

          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${u.id},
              ${personalizedTitle},
              ${personalizedMessage},
              'announcement',
              0,
              ${targetLink},
              NOW()
            )
          `;
          notifiedCount++;
        }
      } catch (dbErr) {
        console.warn('[Broadcast All Roles DB Warning]:', dbErr);
      }

      const vapidPushResult = await sendWebPushToAllSubscriptions({
        title: `🔔 จาก: ${senderLabel} ➔ ถึง: ทุกบทบาท (Owner, Tenant, Keeper, Researcher)`,
        body: rawMessage,
        senderLabel,
        url: '/researcher/lab/digital-twin',
      });

      const broadcastPush: ResearcherPushLogItem = {
        id: `PUSH-ALL-${Date.now()}`,
        category: 'SYSTEM_SCAN',
        roomNumber: 'ALL',
        title: `🔔 จาก: ${senderLabel} ➔ ถึง: ทุกบทบาท (${notifiedCount} บัญชี • Push ${vapidPushResult.sentCount} เครื่อง)`,
        body: `${rawMessage} [ถึง: Owner, Tenant, Keeper, Researcher]`,
        url: '/researcher/lab/digital-twin',
        createdAt: new Date().toISOString(),
      };
      pushLogs.unshift(broadcastPush);

      return NextResponse.json({
        success: true,
        notifiedCount,
        vapidPushResult,
        senderLabel,
        recipientsSummary,
        roles: Array.from(roleSet),
        pushItem: broadcastPush,
        pushLogs: pushLogs.slice(0, 15),
      });
    }

    // 3. Log & Send Real VAPID Web Push Notification (iOS APNs / Android FCM)
    if (action === 'log_push') {
      const pushTitle = body.title || '🔔 แจ้งเตือนจาก Researcher Digital Twin';
      const pushBody = body.body || 'ตรวจพบเหตุการณ์สำคัญในแผนผังอาคาร 2 มิติ';
      const pushUrl = body.url || '/researcher/lab/digital-twin';

      const vapidPushResult = await sendWebPushToAllSubscriptions({
        title: pushTitle,
        body: pushBody,
        url: pushUrl,
      });

      const newPush: ResearcherPushLogItem = {
        id: `PUSH-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
        category: body.category || 'SYSTEM_SCAN',
        roomNumber: body.roomNumber || 'ALL',
        title: pushTitle,
        body: pushBody,
        url: pushUrl,
        createdAt: new Date().toISOString(),
      };
      pushLogs.unshift(newPush);

      return NextResponse.json({
        success: true,
        vapidPushResult,
        pushItem: newPush,
        pushLogs: pushLogs.slice(0, 15),
      });
    }

    // 3. Reset all 20 rooms to default seed
    if (action === 'reset_seed') {
      globalForTwin.researcherTwinRooms = undefined;
      const freshMap = getTwinRoomsMap();
      return NextResponse.json({
        success: true,
        rooms: Array.from(freshMap.values()),
        pushLogs: pushLogs.slice(0, 15),
      });
    }

    return NextResponse.json(
      { success: false, message: 'ไม่รู้จักคำสั่ง action ที่ส่งมา' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดใน Digital Twin API' },
      { status: 500 }
    );
  }
}
