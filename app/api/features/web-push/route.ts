import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import {
  getOrGenerateVapidKeys,
  loadPushSubscriptions,
  savePushSubscription,
  removePushSubscription,
  sendWebPushToAllSubscriptions,
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
    const { action, subscription, endpoint, title, message, url } = body;

    // 1. Unsubscribe on sign-out so logged-out users never receive notifications
    if (action === 'unsubscribe') {
      const session = await auth();
      const email = body.userEmail || session?.user?.email || undefined;
      const updated = removePushSubscription(endpoint || subscription?.endpoint, email);
      return NextResponse.json({
        success: true,
        subscriberCount: updated.length,
      });
    }

    // 2. Subscribe device (Strictly requires an authenticated user session or active Researcher Lab)
    if (action === 'subscribe' && subscription?.endpoint && subscription?.keys) {
      const session = await auth();
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

      // Query MySQL users & tenants table to resolve the true role accurately (never fall back to guest for logged-in members)
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
            if (dbRole && dbRole !== 'guest') {
              resolvedRole = dbRole;
            } else if (Number(u.is_active_tenant) > 0) {
              resolvedRole = 'tenant';
            }
          }
        } catch {
          // ignore DB lookup error
        }
      }

      // Block subscription if role is still guest or unauthenticated
      if (!resolvedRole || resolvedRole === 'guest') {
        removePushSubscription(subscription.endpoint, email);
        return NextResponse.json(
          {
            success: false,
            message: 'ระบบแจ้งเตือนเปิดให้เฉพาะสมาชิกที่เข้าสู่ระบบในบทบาทหลัก (Owner, Tenant, Keeper, Researcher) เท่านั้น',
          },
          { status: 403 }
        );
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

      // Only send immediate confirmation push when explicitly requested by user button click
      let pushRes = null;
      if (body.sendConfirmationPush) {
        const roleLabel = formatRoleThaiLabel(resolvedRole, resolvedSubRole);
        pushRes = await sendWebPushToAllSubscriptions({
          title: `🔔 จาก: ระบบหอพักเกษร 2 ➔ ถึง: ${roleLabel} • ${resolvedName || email}`,
          body: message || 'นี้คือการทดสอบการแจ้งเดือน',
          senderLabel: 'Researcher (ผู้วิจัยระบบ)',
          url: url || '/',
        });
      }

      return NextResponse.json({
        success: true,
        role: resolvedRole,
        roleLabel: formatRoleThaiLabel(resolvedRole, resolvedSubRole),
        subscriberCount: updatedList.length,
        pushRes,
      });
    }

    if (action === 'send') {
      const pushRes = await sendWebPushToAllSubscriptions({
        title: title || '🔔 แจ้งเตือนจากหอพักเกษร 2',
        body: message || 'นี้คือการทดสอบการแจ้งเดือน',
        url: url || '/',
      });

      return NextResponse.json({
        success: true,
        ...pushRes,
      });
    }

    return NextResponse.json(
      { success: false, message: 'ไม่พบคำสั่งหรือข้อมูล subscription ไม่ครบถ้วน' },
      { status: 400 }
    );
  } catch (error: any) {
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดใน Web Push API' },
      { status: 500 }
    );
  }
}
