import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import {
  getOrGenerateVapidKeys,
  loadPushSubscriptions,
  savePushSubscription,
  removePushSubscription,
  sendWebPushToAllSubscriptions,
  sendWebPushToRole,
  sendWebPushToEmail,
  formatRoleThaiLabel,
} from '@/lib/features/web-push-server';

export async function GET() {
  try {
    const keys = getOrGenerateVapidKeys();
    const subs = loadPushSubscriptions();
    return NextResponse.json({
      success: true,
      publicKey: keys.publicKey,
      subscriberCount: subs.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถโหลด VAPID Public Key ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const session = await auth();
    const { action, subscription, endpoint, title, message, url, targetRole, targetEmail } = body;

    // 1. Unsubscribe on sign-out so logged-out users never receive notifications
    if (action === 'unsubscribe') {
      const email = body.userEmail || session?.user?.email || undefined;
      const updated = removePushSubscription(endpoint || subscription?.endpoint, email);
      return NextResponse.json({
        success: true,
        subscriberCount: updated.length,
      });
    }

    // 2. Subscribe device
    if (action === 'subscribe' && subscription?.endpoint && subscription?.keys) {
      const email = (session?.user?.email || body.userEmail || '').trim().toLowerCase();
      const requestedRole = String(body.role || '').toLowerCase();

      if (!session?.user && !email && requestedRole !== 'researcher') {
        removePushSubscription(subscription.endpoint);
        return NextResponse.json(
          { success: false, message: 'ต้องเข้าสู่ระบบก่อนจึงจะเปิดรับการแจ้งเตือนได้' },
          { status: 401 }
        );
      }

      let resolvedRole = String((session?.user as any)?.role || requestedRole || '').toLowerCase();
      let resolvedSubRole = String((session?.user as any)?.sub_role || body.subRole || '').toLowerCase();
      let resolvedName = String(
        session?.user?.name || body.userName || (resolvedRole === 'researcher' ? 'Researcher' : '')
      ).trim();

      // Query MySQL users & tenants table to resolve the role accurately
      if (email) {
        try {
          const sql = getDb();
          const uRows = await sql`
            SELECT u.id, u.name, u.email,
                   COALESCE(u.role, u.primary_role) as db_role,
                   u.sub_role,
                   (SELECT COUNT(*) FROM tenants t WHERE LOWER(t.email) = LOWER(u.email) AND t.status = 'Active') as is_active_tenant
            FROM users u
            WHERE LOWER(u.email) = ${email}
            LIMIT 1
          `;
          if (uRows.length > 0) {
            const u = uRows[0];
            if (u.name) resolvedName = u.name;
            if (u.sub_role) resolvedSubRole = String(u.sub_role).toLowerCase();
            const dbRole = String(u.db_role || '').toLowerCase();
            if (dbRole) {
              resolvedRole = dbRole;
            } else if (Number(u.is_active_tenant) > 0) {
              resolvedRole = 'tenant';
            }
          }
        } catch {
          // ignore DB lookup error
        }
      }

      if (!resolvedRole) {
        resolvedRole = 'guest';
      }

      const updatedList = savePushSubscription({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        role: resolvedRole,
        subRole: resolvedSubRole || undefined,
        userName: resolvedName || email,
        userEmail: email,
        userAgent: req.headers.get('user-agent') || '',
        createdAt: new Date().toISOString(),
      });

      // Send confirmation push if requested
      let pushRes = null;
      if (body.sendConfirmationPush) {
        const roleLabel = formatRoleThaiLabel(resolvedRole, resolvedSubRole);
        pushRes = await sendWebPushToEmail(email, {
          title: `🔔 ระบบแจ้งเตือน SmartDom`,
          body: message || 'เปิดรับการแจ้งเตือนสำเร็จแล้ว คุณจะได้รับการแจ้งเตือนผลอนุมัติการจองและบิลต่างๆ ทันที',
          senderLabel: 'หอพักเกษร 2',
          url: url || '/explore/booking-status',
          tag: `confirm-sub-${Date.now()}`,
        });
      }

      return NextResponse.json({
        success: true,
        subscriberCount: updatedList.length,
        roleLabel: formatRoleThaiLabel(resolvedRole, resolvedSubRole),
        message: 'เปิดรับการแจ้งเตือนเรียบร้อยแล้ว',
        pushResult: pushRes,
      });
    }

    // 3. Send Push Notification to all, by role, or by email
    const sender = (session?.user as any)?.role || 'system';

    if (action === 'send_all') {
      const res = await sendWebPushToAllSubscriptions({
        title: title || 'ประกาศจากหอพักเกษร 2',
        body: message || 'มีประกาศสำคัญจากระบบ กรุณาตรวจสอบในระบบ',
        url: url || '/',
        tag: `push-all-${Date.now()}`,
      });
      return NextResponse.json({ success: true, ...res });
    }

    if (action === 'send_role') {
      if (!targetRole) {
        return NextResponse.json({ success: false, message: 'Missing targetRole' }, { status: 400 });
      }
      const res = await sendWebPushToRole(targetRole, {
        title: title || 'แจ้งเตือนตามบทบาทหน้าที่',
        body: message || '',
        url: url || '/',
        tag: `push-role-${targetRole}-${Date.now()}`,
      });
      return NextResponse.json({ success: true, ...res });
    }

    if (action === 'send_email') {
      if (!targetEmail) {
        return NextResponse.json({ success: false, message: 'Missing targetEmail' }, { status: 400 });
      }
      const res = await sendWebPushToEmail(targetEmail, {
        title: title || 'แจ้งเตือนเฉพาะบุคคล',
        body: message || '',
        url: url || '/',
        tag: `push-email-${Date.now()}`,
      });
      return NextResponse.json({ success: true, ...res });
    }

    return NextResponse.json({ success: false, message: 'Unknown action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Web Push API Error]', error);
    return NextResponse.json({ success: false, message: error.message || 'Server error' }, { status: 500 });
  }
}
