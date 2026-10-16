import { NextResponse } from 'next/server';
import { createHash, timingSafeEqual } from 'crypto';
import { runReminders } from '@/lib/reminders';

// POST /api/cron/reminders — for a scheduler on the server (crontab / PM2), e.g. every hour:
//   curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3001/api/cron/reminders
// Needs CRON_SECRET in the environment; without it (or with a wrong one) every call gets 401.
// Reminders are sent once per event (lib/reminders.ts), so this and the check from page loads never send one twice.
function authorized(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const header = req.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!secret || !given) return false;
  // Compare digests: same length, constant time
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(secret), digest(given));
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  try {
    const counts = await runReminders(new Date());
    return NextResponse.json({ success: counts.errors.length === 0, ...counts });
  } catch (err: any) {
    console.error('[POST /api/cron/reminders]', err);
    return NextResponse.json({ success: false, message: 'ส่งการแจ้งเตือนไม่สำเร็จ' }, { status: 500 });
  }
}
