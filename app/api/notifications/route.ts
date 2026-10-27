import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

// Fetch notifications for the current user
export async function GET() {
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

    if (!userId) {
      return NextResponse.json({ success: true, data: [], unreadCount: 0 });
    }

    const rawNotifications = await sql`
      SELECT * FROM notifications 
      WHERE user_id = ${userId}
      ORDER BY created_at DESC 
      LIMIT 30
    `;

    const userRole = String((session.user as any)?.role || 'guest').toLowerCase();

    const notifications = rawNotifications.map((n: any) => {
      let defaultLink = '/explore/booking-status';
      if (userRole === 'owner' || userRole === 'manager') {
        defaultLink = '/owner/bookings';
      } else if (userRole === 'tenant') {
        defaultLink = '/tenant';
      }

      // Check specific types & links
      let action_url = n.link || n.link_url || n.action_url;
      if (!action_url || !action_url.trim()) {
        const type = String(n.type || '').toLowerCase();
        if (type.startsWith('booking')) {
          action_url = userRole === 'owner' || userRole === 'manager' ? '/owner/bookings' : '/explore/booking-status';
        } else if (type.startsWith('billing') || type.startsWith('payment')) {
          action_url = userRole === 'owner' || userRole === 'manager' ? '/owner/billing' : '/tenant/billing';
        } else if (type.startsWith('move_out')) {
          action_url = userRole === 'owner' || userRole === 'manager' ? '/owner/move-out' : '/tenant/move-out';
        } else if (type.startsWith('contract')) {
          action_url = userRole === 'owner' || userRole === 'manager' ? '/owner/contracts' : '/tenant';
        } else {
          action_url = defaultLink;
        }
      }

      return {
        ...n,
        action_url: action_url.trim(),
      };
    });

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

// Mark notifications as read (single or all)
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

    if (!userId) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {
      // no body, mark all
    }

    if (body?.id) {
      await sql`UPDATE notifications SET is_read = 1 WHERE id = ${Number(body.id)} AND user_id = ${userId}`;
      return NextResponse.json({ success: true, message: 'Notification marked as read' });
    }

    // Mark all as read
    await sql`UPDATE notifications SET is_read = 1 WHERE user_id = ${userId} AND is_read = 0`;
    return NextResponse.json({ success: true, message: 'All notifications marked as read' });
  } catch (error: any) {
    console.error('[API Notifications PUT Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
