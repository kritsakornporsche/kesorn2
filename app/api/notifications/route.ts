import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

// Fetch notifications for the current user
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const sql = getDb();
    let userId = (session.user as any)?.id;
    let userRole = String((session.user as any)?.role || '').toLowerCase();
    const userEmail = session.user.email ? session.user.email.toLowerCase() : '';

    if (userEmail) {
      const uRes = await sql`
        SELECT
          u.id,
          COALESCE(NULLIF(u.role, ''), NULLIF(u.primary_role, ''), 'guest') as role,
          (
            SELECT COUNT(*)
            FROM tenants t
            WHERE LOWER(t.email) = LOWER(u.email) AND t.status = 'Active'
          ) as is_active_tenant
        FROM users u
        WHERE LOWER(u.email) = ${userEmail}
        LIMIT 1
      `;
      if (uRes.length > 0) {
        userId = uRes[0].id;
        const dbRole = String(uRes[0].role || 'guest').toLowerCase();
        if ((dbRole === 'guest' || !dbRole) && Number(uRes[0].is_active_tenant) > 0) {
          userRole = 'tenant';
        } else if (!userRole || userRole === 'guest') {
          userRole = dbRole;
        }
      }
    }

    // Do not return notifications for unauthenticated or guest users
    if (!userId || !userRole || userRole === 'guest') {
      return NextResponse.json({ success: true, data: [], unreadCount: 0 });
    }

    // Clean up any stale notifications that still contain "Guest"
    await sql`
      DELETE FROM notifications
      WHERE user_id = ${userId}
        AND (title LIKE '%Guest%' OR message LIKE '%Guest%')
    `;

    const rawNotifications = await sql`
      SELECT * FROM notifications 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC 
      LIMIT 20
    `;

    const notifications = rawNotifications.map((n: any) => ({
      ...n,
      action_url: n.link || n.action_url || (n.type === 'booking' ? '/owner/bookings' : n.type === 'payment' ? '/owner/billing' : '/owner')
    }));

    // Get unread count
    const unreadRes = await sql`
      SELECT COUNT(*) as count FROM notifications WHERE user_id = ${userId} AND is_read = 0
    `;

    return NextResponse.json({ 
      success: true, 
      data: notifications,
      unreadCount: Number(unreadRes[0].count)
    });
  } catch (error: any) {
    console.error('[API Notifications GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Mark notifications as read
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    
    const sql = getDb();
    let userId = (session.user as any)?.id;
    if (!userId && session.user.email) {
      const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = ${session.user.email.toLowerCase()} LIMIT 1`;
      if (uRes.length > 0) userId = uRes[0].id;
    }

    if (userId) {
      // Mark all as read
      await sql`UPDATE notifications SET is_read = 1 WHERE user_id = ${userId} AND is_read = 0`;
    }

    return NextResponse.json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    console.error('[API Notifications PUT Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
