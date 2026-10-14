// Notifications for the move-out flow (lib/moveOut.ts). Times come from the app, never MySQL NOW().
// A failed notification never undoes the move-out step that was already committed.

import { getDb } from '@/lib/db';

export async function notifyUser(userId: number | null | undefined, title: string, message: string, link: string, now: Date, type = 'move_out') {
  if (!userId) return;
  try {
    const sql = getDb();
    await sql`
      INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
      VALUES (${userId}, ${title}, ${message}, ${type}, 0, ${link}, ${now})
    `;
  } catch (error) {
    console.warn('[move-out notify]', error);
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
