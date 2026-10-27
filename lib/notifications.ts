import { getDb } from '@/lib/db';
import { sendWebPushToEmail, sendWebPushToRole, sendWebPushToAllSubscriptions } from '@/lib/features/web-push-server';

export async function createUserNotification({
  userId,
  userEmail,
  title,
  message,
  type = 'general',
  link = '/',
}: {
  userId?: number | null;
  userEmail?: string;
  title: string;
  message: string;
  type?: string;
  link?: string;
}) {
  const sql = getDb();
  let resolvedEmail = userEmail;

  // 1. Insert into in-app notifications table
  if (userId) {
    try {
      await sql`
        INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
        VALUES (${userId}, ${title}, ${message}, ${type}, 0, ${link}, NOW())
      `;
      if (!resolvedEmail) {
        const u = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
        if (u.length > 0 && u[0].email) resolvedEmail = u[0].email;
      }
    } catch (err) {
      console.warn('[createUserNotification DB error]:', err);
    }
  }

  // 2. Dispatch Web Push notification to device(s)
  if (resolvedEmail) {
    try {
      await sendWebPushToEmail(resolvedEmail, {
        title,
        body: message,
        url: link,
        tag: `notif-${type}-${Date.now()}`,
      });
    } catch (pushErr) {
      console.warn('[createUserNotification WebPush error]:', pushErr);
    }
  }
}

export async function createRoleNotification({
  role,
  title,
  message,
  link = '/',
}: {
  role: 'owner' | 'tenant' | 'keeper' | 'researcher';
  title: string;
  message: string;
  link?: string;
}) {
  try {
    await sendWebPushToRole(role, {
      title,
      body: message,
      url: link,
      tag: `role-${role}-${Date.now()}`,
    });
  } catch (err) {
    console.warn('[createRoleNotification error]:', err);
  }
}

export async function broadcastSystemNotification({
  title,
  message,
  link = '/',
}: {
  title: string;
  message: string;
  link?: string;
}) {
  try {
    await sendWebPushToAllSubscriptions({
      title,
      body: message,
      url: link,
      tag: `broadcast-${Date.now()}`,
    });
  } catch (err) {
    console.warn('[broadcastSystemNotification error]:', err);
  }
}
