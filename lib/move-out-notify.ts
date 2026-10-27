// Notifications for the move-out & maintenance flow. Times come from the app, never MySQL NOW().
// A failed notification never undoes the step that was already committed.

import { getDb } from '@/lib/db';
import { sendWebPushToEmail, sendWebPushToRole } from '@/lib/features/web-push-server';

export async function notifyUser(userId: number | null | undefined, title: string, message: string, link: string, now: Date, type = 'move_out') {
  if (!userId) return;
  try {
    const sql = getDb();
    await sql`
      INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
      VALUES (${userId}, ${title}, ${message}, ${type}, 0, ${link}, ${now})
    `;

    // Dispatch Web Push to user's registered device(s)
    const u = await sql`SELECT email FROM users WHERE id = ${userId} LIMIT 1`;
    if (u.length > 0 && u[0].email) {
      await sendWebPushToEmail(u[0].email, {
        title,
        body: message,
        url: link,
        tag: `${type}-${Date.now()}`,
      }).catch(() => null);
    }

    if (type === 'maintenance') {
      await sendWebPushToRole('keeper', {
        title,
        body: message,
        url: link,
        tag: `maintenance-${Date.now()}`,
      }).catch(() => null);
    }
  } catch (error) {
    console.warn('[notifyUser error]', error);
  }
}

/** The dorm owner's account (dormitory_registry), or null. */
export async function ownerUserId(): Promise<number | null> {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT u.id FROM users u
      JOIN dormitory_registry dr ON dr.owner_id = u.id OR LOWER(dr.owner_email) = LOWER(u.email)
      WHERE dr.id = 1 LIMIT 1
    `;
    return rows[0]?.id || null;
  } catch {
    return null;
  }
}
