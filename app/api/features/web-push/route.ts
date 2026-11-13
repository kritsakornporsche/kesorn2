import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, requireRole } from '@/lib/authz';
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

// Web Push (commit 29 security):
// - every action needs a signed-in user; a device is subscribed for the signed-in account only (role, name and email
//   from the database — never what the page sends)
// - unsubscribe: by the device's own endpoint (it works right after sign-out too); the account's other devices only
//   when signed in
// - sending to everyone / a role / an email: owner / manager; a researcher may send a test to their own devices only
const ALL_ROLES = ['owner', 'manager', 'keeper', 'tenant', 'guest', 'researcher', 'platform_admin', 'admin'] as const;

export async function GET() {
  const guard = await requireRole([...ALL_ROLES]);
  if ('response' in guard) return guard.response;
  try {
    const keys = getOrGenerateVapidKeys();
    const staff = guard.user.role === 'owner' || guard.user.role === 'manager';
    return NextResponse.json({
      success: true,
      publicKey: keys.publicKey,
      ...(staff ? { subscriberCount: loadPushSubscriptions().length } : {}),
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
    const { action, subscription, endpoint, title, message, url, targetRole, targetEmail } = body;

    // 1. Unsubscribe: the device's own endpoint (no sign-in needed — the endpoint is the device's secret); the account's
    //    other devices only for the signed-in user
    if (action === 'unsubscribe') {
      const me = await getCurrentUser();
      const ep = endpoint || subscription?.endpoint;
      if (!ep && !me) {
        return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
      }
      const updated = removePushSubscription(ep, me?.email || undefined);
      return NextResponse.json({ success: true, ...(me && (me.role === 'owner' || me.role === 'manager') ? { subscriberCount: updated.length } : {}) });
    }

    const guard = await requireRole([...ALL_ROLES]);
    if ('response' in guard) return guard.response;
    const me = guard.user;

    // 2. Subscribe this device for the signed-in account
    if (action === 'subscribe') {
      if (!subscription?.endpoint || !subscription?.keys) {
        return NextResponse.json({ success: false, message: 'ข้อมูลการสมัครรับแจ้งเตือนไม่ครบ' }, { status: 400 });
      }
      const email = String(me.email || '').trim().toLowerCase();
      let resolvedRole = String(me.role || '').toLowerCase();
      const resolvedSubRole = String(me.sub_role || '').toLowerCase();
      let resolvedName = String(me.name || '').trim();

      // A guest account with an Active tenant record is a tenant
      if (email && resolvedRole === 'guest') {
        try {
          const sql = getDb();
          const rows = await sql`SELECT COUNT(*) AS n FROM tenants WHERE LOWER(email) = ${email} AND status = 'Active'`;
          if (Number(rows[0]?.n) > 0) resolvedRole = 'tenant';
        } catch {
          // ignore DB lookup error
        }
      }
      if (!resolvedName) resolvedName = email;

      const updatedList = savePushSubscription({
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        role: resolvedRole,
        subRole: resolvedSubRole || undefined,
        userName: resolvedName,
        userEmail: email,
        userAgent: req.headers.get('user-agent') || '',
        createdAt: new Date().toISOString(),
      });

      // Send confirmation push if requested
      let pushRes = null;
      if (body.sendConfirmationPush) {
        pushRes = await sendWebPushToEmail(email, {
          title: `🔔 ระบบแจ้งเตือน SmartDom`,
          body: 'เปิดรับการแจ้งเตือนสำเร็จแล้ว คุณจะได้รับการแจ้งเตือนผลอนุมัติการจองและบิลต่างๆ ทันที',
          senderLabel: 'หอพักเกษร 2',
          url: typeof url === 'string' && url.startsWith('/') ? url : '/explore/booking-status',
          tag: `confirm-sub-${Date.now()}`,
        });
      }

      return NextResponse.json({
        success: true,
        roleLabel: formatRoleThaiLabel(resolvedRole, resolvedSubRole),
        message: 'เปิดรับการแจ้งเตือนเรียบร้อยแล้ว',
        pushResult: pushRes,
        ...(me.role === 'owner' || me.role === 'manager' ? { subscriberCount: updatedList.length } : {}),
      });
    }

    // 3. Sending: owner / manager; a researcher only a test to their own devices
    const staff = me.role === 'owner' || me.role === 'manager';
    const ownTest = me.role === 'researcher' && action === 'send_email'
      && String(targetEmail || '').trim().toLowerCase() === String(me.email || '').toLowerCase();
    if (['send_all', 'send_role', 'send_email'].includes(action) && !staff && !ownTest) {
      return NextResponse.json({ success: false, message: 'ส่งแจ้งเตือนได้เฉพาะเจ้าของหอ/ผู้จัดการ' }, { status: 403 });
    }
    const safeUrl = typeof url === 'string' && url.startsWith('/') ? url : '/';

    if (action === 'send_all') {
      const res = await sendWebPushToAllSubscriptions({
        title: title || 'ประกาศจากหอพักเกษร 2',
        body: message || 'มีประกาศสำคัญจากระบบ กรุณาตรวจสอบในระบบ',
        url: safeUrl,
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
        url: safeUrl,
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
        url: safeUrl,
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
