import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const sql = getDb();

    const totalRoomsResult = await sql`SELECT COUNT(*) as count FROM rooms`;
    const totalRooms = Number(totalRoomsResult[0]?.count || 0);

    const occupiedResult = await sql`SELECT COUNT(*) as count FROM rooms WHERE status = 'Occupied'`;
    const occupiedRooms = Number(occupiedResult[0]?.count || 0);

    const tenantsResult = await sql`
      SELECT COUNT(*) as count 
      FROM tenants t
      WHERE t.status = 'active'
    `.catch(() => [{ count: 0 }]);
    const totalTenants = Number(tenantsResult[0]?.count || 0);

    const maintResult = await sql`
      SELECT COUNT(*) as count 
      FROM maintenance_requests m
      WHERE m.status = 'Pending'
    `.catch(() => [{ count: 0 }]);
    const pendingMaintenance = Number(maintResult[0]?.count || 0);

    const pendingSlipsResult = await sql`
      SELECT COUNT(*) as count 
      FROM bills b
      WHERE b.status = 'Pending' OR (b.slip_url IS NOT NULL AND b.status = 'Unpaid')
    `.catch(() => [{ count: 0 }]);
    const pendingSlips = Number(pendingSlipsResult[0]?.count || 0);

    const unpaidBillsResult = await sql`
      SELECT COUNT(*) as count 
      FROM bills b
      WHERE b.status = 'Unpaid'
    `.catch(() => [{ count: 0 }]);
    const unpaidBills = Number(unpaidBillsResult[0]?.count || 0);

    const pendingContractsResult = await sql`
      SELECT COUNT(*) as count 
      FROM contracts c
      WHERE c.status = 'PendingOwnerSignature'
    `.catch(() => [{ count: 0 }]);

    const pendingDraftsResult = await sql`
      SELECT COUNT(*) as count 
      FROM booking_progress bp
      WHERE bp.status IN ('pending', 'awaiting_approval', 'deposit_submitted')
    `.catch(() => [{ count: 0 }]);

    const pendingBookings = Number(pendingContractsResult[0]?.count || 0) + Number(pendingDraftsResult[0]?.count || 0);
    const availableRooms = Math.max(0, totalRooms - occupiedRooms);

    let latestMaintenance = null;
    if (pendingMaintenance > 0) {
      const latest = await sql`
        SELECT m.room_number, m.issue_type, m.description 
        FROM maintenance_requests m
        WHERE m.status = 'Pending' 
        ORDER BY m.id DESC 
        LIMIT 1
      `.catch(() => []);
      if (latest && latest.length > 0) {
        latestMaintenance = {
          roomNumber: latest[0].room_number,
          issueType: latest[0].issue_type,
          description: latest[0].description,
        };
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        totalRooms,
        occupiedRooms,
        availableRooms,
        totalTenants,
        pendingMaintenance,
        pendingSlips,
        unpaidBills,
        pendingBookings,
        latestMaintenance,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
