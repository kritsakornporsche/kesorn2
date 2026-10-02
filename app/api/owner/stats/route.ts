import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();

    // 1. Room stats (Kesorn 2: 20 rooms)
    const totalRoomsResult = await sql`SELECT COUNT(*) as count FROM rooms`;
    const totalRooms = Number(totalRoomsResult[0]?.count || 20);

    const occupiedResult = await sql`SELECT COUNT(*) as count FROM rooms WHERE status = 'Occupied'`;
    const occupiedRooms = Number(occupiedResult[0]?.count || 0);

    const bookedResult = await sql`SELECT COUNT(*) as count FROM rooms WHERE status = 'Reserved' OR id IN (SELECT room_id FROM contracts WHERE status IN ('PendingContract', 'PendingFirstBill'))`;
    const bookedRooms = Number(bookedResult[0]?.count || 0);

    const availableRooms = Math.max(0, totalRooms - occupiedRooms - bookedRooms);

    // 2. Tenants count
    const tenantsResult = await sql`SELECT COUNT(*) as count FROM tenants WHERE status = 'active'`;
    const totalTenants = Number(tenantsResult[0]?.count || 0);

    // 3. Urgent Action Counts
    const pendingBookingsRes = await sql`
      SELECT COUNT(*) as count 
      FROM contracts 
      WHERE status IN ('PendingContract', 'PendingOwnerSignature')
    `;
    const pendingBookings = Number(pendingBookingsRes[0]?.count || 0);

    const pendingSlipsRes = await sql`
      SELECT COUNT(*) as count 
      FROM bills 
      WHERE status = 'Pending' OR (slip_url IS NOT NULL AND status = 'Unpaid')
    `;
    const pendingSlips = Number(pendingSlipsRes[0]?.count || 0);

    const pendingMaintRes = await sql`
      SELECT COUNT(*) as count 
      FROM maintenance_requests 
      WHERE status IN ('Pending', 'In Progress')
    `;
    const pendingMaintenance = Number(pendingMaintRes[0]?.count || 0);

    const unpaidBillsRes = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
      FROM bills 
      WHERE status IN ('Unpaid', 'Overdue')
    `;
    const unpaidBillsCount = Number(unpaidBillsRes[0]?.count || 0);
    const unpaidBillsAmount = Number(unpaidBillsRes[0]?.total || 0);

    const paidBillsRes = await sql`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total 
      FROM bills 
      WHERE status = 'Paid' AND billing_cycle = DATE_FORMAT(NOW(), '%Y-%m')
    `;
    const paidBillsCount = Number(paidBillsRes[0]?.count || 0);
    const paidBillsAmount = Number(paidBillsRes[0]?.total || 0);

    // 4. Expiring contracts within 30 days
    const expiringContractsRes = await sql`
      SELECT COUNT(*) as count 
      FROM contracts 
      WHERE status = 'Active' 
        AND end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)
    `;
    const expiringContracts = Number(expiringContractsRes[0]?.count || 0);

    // 5. Recent Live Activities (Last 5-10 entries)
    const recentActivities: any[] = [];

    // Recent payments
    const recentPaid = await sql`
      SELECT b.room_number, b.amount, b.billing_cycle, b.created_at, 'paid' as type
      FROM bills b
      WHERE b.status = 'Paid'
      ORDER BY b.created_at DESC
      LIMIT 3
    `;
    recentPaid.forEach((r: any) => {
      recentActivities.push({
        type: 'paid',
        title: `ห้อง ${r.room_number} ชำระบิลรอบ ${r.billing_cycle} (฿${Number(r.amount).toLocaleString()})`,
        time: r.created_at,
        badge: '🟢 ชำระเงินแล้ว'
      });
    });

    // Recent bookings
    const recentBook = await sql`
      SELECT r.room_number, c.deposit_amount, c.created_at, COALESCE(t.name, 'ผู้จอง') as tenant_name
      FROM contracts c
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ORDER BY c.id DESC
      LIMIT 3
    `;
    recentBook.forEach((b: any) => {
      recentActivities.push({
        type: 'booking',
        title: `มีการจองห้อง ${b.room_number} จากคุณ${b.tenant_name} (มัดจำ ฿${Number(b.deposit_amount).toLocaleString()})`,
        time: b.created_at,
        badge: '🟡 รายการจองใหม่'
      });
    });

    // Recent maintenance
    const recentMaint = await sql`
      SELECT m.room_number, m.issue_type, m.status, m.created_at
      FROM maintenance_requests m
      ORDER BY m.id DESC
      LIMIT 3
    `;
    recentMaint.forEach((m: any) => {
      recentActivities.push({
        type: 'maintenance',
        title: `ห้อง ${m.room_number} แจ้งซ่อม: ${m.issue_type}`,
        time: m.created_at,
        badge: m.status === 'Completed' ? '🔵 ซ่อมเสร็จแล้ว' : '🔴 รอดำเนินการ'
      });
    });

    recentActivities.sort((a, b) => new Date(b.time || 0).getTime() - new Date(a.time || 0).getTime());

    return NextResponse.json({
      success: true,
      data: {
        totalRooms,
        occupiedRooms,
        bookedRooms,
        availableRooms,
        totalTenants,
        pendingBookings,
        pendingSlips,
        pendingMaintenance,
        unpaidBillsCount,
        unpaidBillsAmount,
        paidBillsCount,
        paidBillsAmount,
        expiringContracts,
        occupancyRate: Math.round((occupiedRooms / (totalRooms || 1)) * 100),
        collectionRate: totalRooms > 0 ? Math.round((paidBillsCount / (totalRooms || 1)) * 100) : 0,
        recentActivities: recentActivities.slice(0, 8),
      }
    });
  } catch (error: any) {
    console.error('[Owner Stats Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
