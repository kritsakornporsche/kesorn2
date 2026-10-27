import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { bookingFeeFor, daysPastDue, getRates } from '@/lib/billing';
import { getPaymentSummaries, outstandingFor, unpaidBillsToday } from '@/lib/payments';
import { expireDueBookings } from '@/lib/bookings';
import { OVERDUE_ALERT_DAYS } from '@/lib/reminders';
import { TEST_ROOM_BADGE, isTestRoom, notTestRoomSql } from '@/lib/test-rooms';


export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    // Managers see outstanding amounts but not income
    const showIncome = guard.user.role === 'owner';

    const sql = getDb();
    // No scheduler: bookings past their deadline are expired whenever they are read
    await expireDueBookings().catch((e) => console.warn('[expire bookings]', e));

    // 1. Room stats (Kesorn 2: 20 rooms). Commit 26c: test rooms (T01) are left out of every figure on this page
    // (lib/test-rooms); their rows stay on the rooms / bills / contracts pages with a "ทดสอบ" badge.
    const realRoom = notTestRoomSql('room_number');
    const totalRoomsResult = await sql(`SELECT COUNT(*) as count FROM rooms WHERE ${realRoom}`, []);
    const totalRooms = Number(totalRoomsResult[0]?.count || 20);

    const occupiedResult = await sql(`SELECT COUNT(*) as count FROM rooms WHERE status = 'Occupied' AND ${realRoom}`, []);
    const occupiedRooms = Number(occupiedResult[0]?.count || 0);

    const bookedResult = await sql(`SELECT COUNT(*) as count FROM rooms WHERE (status = 'Reserved' OR id IN (SELECT room_id FROM contracts WHERE status IN ('PendingContract', 'PendingFirstBill'))) AND ${realRoom}`, []);
    const bookedRooms = Number(bookedResult[0]?.count || 0);

    const availableRooms = Math.max(0, totalRooms - occupiedRooms - bookedRooms);

    // 2. Tenants count
    const tenantsResult = await sql(`SELECT COUNT(*) as count FROM tenants t LEFT JOIN rooms r ON r.id = t.room_id WHERE t.status = 'active' AND ${notTestRoomSql('r.room_number')}`, []);
    const totalTenants = Number(tenantsResult[0]?.count || 0);

    // 3. Urgent Action Counts
    const pendingBookingsRes = await sql(`
      SELECT COUNT(*) as count
      FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id
      WHERE c.status IN ('BookingRequested', 'BookingApproved', 'PendingContract', 'PendingOwnerSignature') AND ${notTestRoomSql('r.room_number')}
    `, []);
    const pendingBookings = Number(pendingBookingsRes[0]?.count || 0);

    const pendingSlipsRes = await sql(`
      SELECT COUNT(*) as count
      FROM bills
      WHERE (LOWER(status) = 'pending'
         OR (slip_url IS NOT NULL AND LOWER(status) IN ('unpaid', 'overdue', 'partial'))) AND ${realRoom}
    `, []);
    const pendingSlips = Number(pendingSlipsRes[0]?.count || 0);

    // Open jobs: the board's states (commit 13), or the status of older jobs; before migration 013 only status
    const pendingMaintRes = await sql`
      SELECT COUNT(*) as count FROM maintenance_requests
      WHERE state IN ('Requested', 'Assigned', 'InProgress')
         OR (state IS NULL AND status IN ('Pending', 'In Progress', 'InProgress'))
    `.catch(() => sql`
      SELECT COUNT(*) as count FROM maintenance_requests WHERE status IN ('Pending', 'In Progress', 'InProgress')
    `);
    const pendingMaintenance = Number(pendingMaintRes[0]?.count || 0);

    // Still owed today incl. late fees to today, never below 0 (lib/payments unpaidBillsToday — same as the owner report)
    const unpaid = await unpaidBillsToday(sql, new Date(), { excludeTestRooms: true });
    const unpaidBillsCount = unpaid.count;
    const unpaidBillsAmount = unpaid.total;

    // Drafts are not owed yet (not sent to tenants); shown separately as work to do
    const draftBillsRes = await sql(`SELECT COUNT(*) as count FROM bills WHERE LOWER(status) = 'draft' AND ${realRoom}`, []);
    const draftBillsCount = Number(draftBillsRes[0]?.count || 0);

    const paidBillsRes = await sql(`
      SELECT COUNT(*) as count, COALESCE(SUM(amount), 0) as total
      FROM bills
      WHERE status = 'Paid' AND billing_cycle = DATE_FORMAT(NOW(), '%Y-%m') AND ${realRoom}
    `, []);
    const paidBillsCount = Number(paidBillsRes[0]?.count || 0);
    const paidBillsAmount = Number(paidBillsRes[0]?.total || 0);

    // 3.1 Bills still unpaid more than 15 days after the due date (any bill type; drafts,
    // cancelled bills and bills held by a correction request are excluded)
    const overdueCandidates = await sql`
      SELECT b.id, b.title, b.amount, b.bill_type, b.status, b.due_date, b.late_fee_rate, b.room_number, COALESCE(t.name, '-') as tenant_name
      FROM bills b
      LEFT JOIN tenants t ON t.id = b.tenant_id
      WHERE LOWER(b.status) IN ('unpaid', 'overdue', 'pending', 'partial') AND b.due_date IS NOT NULL
    `;
    const now = new Date();
    const longOverdue = overdueCandidates.filter((b: any) => !isTestRoom(b.room_number) && daysPastDue(b.due_date, now) > OVERDUE_ALERT_DAYS);
    const rates = await getRates(sql);
    const summaries = await getPaymentSummaries(sql, longOverdue.map((b: any) => b.id));
    const overdueBills = longOverdue
      .map((b: any) => ({
        id: b.id,
        title: b.title,
        room_number: b.room_number,
        tenant_name: b.tenant_name,
        days_overdue: daysPastDue(b.due_date, now),
        outstanding: outstandingFor(b, summaries.get(b.id)?.paid_total || 0, now, rates).outstanding,
      }))
      .sort((a: any, b: any) => b.days_overdue - a.days_overdue);

    // The alert for these bills is sent by lib/reminders.ts (once per bill to each active owner / manager)

    // 4. Expiring contracts within 30 days
    const expiringContractsRes = await sql(`
      SELECT COUNT(*) as count
      FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id
      WHERE c.status = 'Active'
        AND c.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) AND ${notTestRoomSql('r.room_number')}
    `, []);
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
        room_number: r.room_number,
        title: showIncome
          ? `ห้อง ${r.room_number} ชำระบิลรอบ ${r.billing_cycle} (฿${Number(r.amount).toLocaleString()})`
          : `ห้อง ${r.room_number} ชำระบิลรอบ ${r.billing_cycle}`,
        time: r.created_at,
        badge: '🟢 ชำระเงินแล้ว'
      });
    });

    // Recent bookings (web / walk-in): not owner-made contracts or renewals. The amount is the booking bill
    // (contracts.deposit_amount becomes the full deposit once the contract takes effect).
    const recentBook = await sql`
      SELECT r.room_number, bb.amount AS booking_amount, c.created_at, COALESCE(t.name, 'ผู้จอง') as tenant_name
      FROM contracts c
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN bills bb ON bb.id = c.booking_bill_id
      WHERE c.parent_contract_id IS NULL
        AND (c.booking_bill_id IS NOT NULL
             OR c.status IN ('BookingRequested', 'BookingApproved', 'PendingOwnerSignature', 'PendingContract', 'PendingFirstBill', 'Expired', 'Rejected'))
      ORDER BY c.id DESC
      LIMIT 3
    `;
    recentBook.forEach((b: any) => {
      recentActivities.push({
        type: 'booking',
        room_number: b.room_number,
        title: `มีการจองห้อง ${b.room_number} จากคุณ${b.tenant_name} (ค่าจอง ฿${Number(b.booking_amount ?? bookingFeeFor(b.room_number)).toLocaleString()})`,
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
        room_number: m.room_number,
        title: `ห้อง ${m.room_number} แจ้งซ่อม: ${m.issue_type}`,
        time: m.created_at,
        badge: m.status === 'Completed' ? '🔵 ซ่อมเสร็จแล้ว' : '🔴 รอดำเนินการ'
      });
    });

    // Activity rows of a test room stay (they are rows, not figures), marked "(ทดสอบ)"
    recentActivities.forEach((a) => { if (a.room_number && isTestRoom(a.room_number)) a.title += ` (${TEST_ROOM_BADGE})`; });
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
        draftBillsCount,
        overdueBills,
        paidBillsCount,
        paidBillsAmount: showIncome ? paidBillsAmount : null,
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
