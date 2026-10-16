// Timed notifications (commit 15b). Every reminder is sent once per (user, event): notifications.event_key is unique per
// user and reminders are inserted with INSERT IGNORE, so running again — the check from GET /api/notifications, the
// cron route, two servers at once — never repeats one. Every function takes `now`; days are Thai calendar days.
// Staff reminders go only to owner / manager accounts with is_active = 1.
//
//   meter:<cycle>          from the 28th to the end of the month, while rooms with an Active contract have no reading
//   due_soon:<bill>        1–3 days before the due date (not on the day the bill was sent: that notice gives the date)
//   due_today:<bill>       on the due date
//   overdue15:<bill>       more than 15 days past due (staff; commit 8, moved here from /api/owner/stats)
//   movein_due:<contract>  the move-in bill is unpaid the day before (or on) the contract start date
//   booking_expired:<contract> is sent by lib/bookings.ts expireBookings when a booking runs out of time

import { getDb } from '@/lib/db';
import { bangkokDate, daysPastDue, getRates, lateFeeRateOf } from '@/lib/billing';
import { formatBaht } from '@/lib/format';
import { cycleFor } from '@/lib/meters';
import { getPaymentSummaries, outstandingFor } from '@/lib/payments';

export const METER_REMINDER_DAY = 28;
export const DUE_SOON_DAYS = 3;
export const OVERDUE_ALERT_DAYS = 15;
const RUN_EVERY_MINUTES = 10;

const DAY_MS = 24 * 60 * 60 * 1000;
const THAI_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const PAYABLE = ['unpaid', 'partial', 'overdue', 'pending'];

const dayNumber = (ymd: string) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d) / DAY_MS; };
/** Whole Thai calendar days from `now` to `date` (negative when it has passed). */
const daysUntil = (date: Date | string, now: Date) => dayNumber(bangkokDate(date)) - dayNumber(bangkokDate(now));
const thaiDate = (date: Date | string) => {
  const [y, m, d] = bangkokDate(date).split('-').map(Number);
  return `${d} ${THAI_MONTHS[m - 1]} ${y + 543}`;
};
const thaiCycle = (cycle: string) => { const [y, m] = cycle.split('-').map(Number); return `${THAI_MONTHS[m - 1]} ${y + 543}`; };

export interface Notice { title: string; message: string; link: string; type: string }

/** Insert a notification unless this user already has one with this key. Returns true when it was sent now. */
export async function notifyOnce(sql: any, userId: number | null | undefined, eventKey: string, n: Notice, now: Date): Promise<boolean> {
  if (!userId) return false;
  const res = await sql`
    INSERT IGNORE INTO notifications (user_id, title, message, type, is_read, link, created_at, event_key)
    VALUES (${userId}, ${n.title}, ${n.message}, ${n.type}, 0, ${n.link}, ${now}, ${eventKey})
  `;
  return Number(res?.affectedRows || 0) > 0;
}

/** Owner and manager accounts that are active. */
export async function activeStaff(sql: any): Promise<number[]> {
  const rows = await sql`SELECT id FROM users WHERE role IN ('owner', 'manager') AND is_active = 1`;
  return rows.map((r: any) => Number(r.id));
}

async function toStaff(sql: any, key: string, n: Notice, now: Date) {
  let sent = 0;
  for (const id of await activeStaff(sql)) if (await notifyOnce(sql, id, key, n, now)) sent++;
  return sent;
}

/** From the 28th: remind staff to record the meters of rooms with an Active contract that have no reading this cycle. */
export async function meterReminder(sql: any, now: Date) {
  if (Number(bangkokDate(now).slice(8, 10)) < METER_REMINDER_DAY) return 0;
  const cycle = cycleFor(now);
  const rows = await sql`
    SELECT COUNT(DISTINCT r.id) AS n FROM rooms r
    JOIN contracts c ON c.room_id = r.id AND c.status = 'Active'
    WHERE NOT EXISTS (
      SELECT 1 FROM meter_readings m
      WHERE m.room_id = r.id AND m.kind = 'cycle' AND m.type IN ('Electricity', 'Electric') AND m.billing_cycle = ${cycle}
    )
  `;
  const missing = Number(rows[0]?.n || 0);
  if (missing === 0) return 0;
  return toStaff(sql, `meter:${cycle}`, {
    title: 'เตือนจดมิเตอร์ประจำเดือน',
    message: `ยังไม่ได้จดมิเตอร์รอบ ${thaiCycle(cycle)} อีก ${missing} ห้อง — จดภายในสิ้นเดือนเพื่อออกบิลรายเดือน (ห้องที่ไม่จดจะไม่ออกบิล)`,
    link: '/owner/meters/record',
    type: 'meter_reminder',
  }, now);
}

/** Tenants: a sent bill due within 3 days (due_soon) and on its due date (due_today), while something is still owed. */
export async function dueReminders(sql: any, now: Date) {
  const today = bangkokDate(now);
  const until = new Date((dayNumber(today) + DUE_SOON_DAYS) * DAY_MS).toISOString().slice(0, 10);
  const bills = await sql`
    SELECT b.id, b.title, b.amount, b.bill_type, b.status, b.due_date, b.late_fee_rate, b.sent_at, b.room_number,
      COALESCE(t.user_id, u.id) AS user_id
    FROM bills b
    JOIN tenants t ON t.id = b.tenant_id
    LEFT JOIN users u ON t.user_id IS NULL AND LOWER(u.email) = LOWER(t.email)
    WHERE LOWER(b.status) IN (${PAYABLE}) AND b.due_date IS NOT NULL
      AND COALESCE(b.is_first_bill, 0) = 0 AND COALESCE(b.bill_type, 'monthly') <> 'booking'
      AND DATE(b.due_date) BETWEEN ${today} AND ${until}
  `;
  if (bills.length === 0) return { dueSoon: 0, dueToday: 0 };
  const rates = await getRates(sql);
  const summaries = await getPaymentSummaries(sql, bills.map((b: any) => b.id));
  let dueSoon = 0;
  let dueToday = 0;
  for (const b of bills) {
    const owed = outstandingFor(b, summaries.get(b.id)?.paid_total || 0, now, rates).outstanding;
    if (owed <= 0) continue;
    const left = daysUntil(b.due_date, now);
    const name = `${b.title || 'บิล'}${b.room_number ? ` (ห้อง ${b.room_number})` : ''}`;
    if (left === 0) {
      const fee = b.bill_type === 'monthly' ? ` หลังจากวันนี้คิดค่าปรับวันละ ฿${formatBaht(lateFeeRateOf(b, rates))}` : '';
      if (await notifyOnce(sql, b.user_id, `due_today:${b.id}`, {
        title: 'ครบกำหนดชำระวันนี้',
        message: `${name} ครบกำหนดชำระวันนี้ ยอดค้าง ฿${formatBaht(owed)}${fee}`,
        link: '/tenant/billing',
        type: 'due_reminder',
      }, now)) dueToday++;
    } else if (!b.sent_at || bangkokDate(b.sent_at) !== today) {
      if (await notifyOnce(sql, b.user_id, `due_soon:${b.id}`, {
        title: 'ใกล้ครบกำหนดชำระ',
        message: `${name} ครบกำหนดชำระ ${thaiDate(b.due_date)} (อีก ${left} วัน) ยอดค้าง ฿${formatBaht(owed)}`,
        link: '/tenant/billing',
        type: 'due_reminder',
      }, now)) dueSoon++;
    }
  }
  return { dueSoon, dueToday };
}

/** Staff: bills still unpaid more than 15 days after the due date (any bill type; drafts and held bills excluded). */
export async function overdueReminder(sql: any, now: Date) {
  const candidates = await sql`
    SELECT b.id, b.amount, b.bill_type, b.status, b.due_date, b.late_fee_rate, b.room_number, COALESCE(t.name, '-') AS tenant_name
    FROM bills b LEFT JOIN tenants t ON t.id = b.tenant_id
    WHERE LOWER(b.status) IN (${PAYABLE}) AND b.due_date IS NOT NULL
  `;
  const late = candidates.filter((b: any) => daysPastDue(b.due_date, now) > OVERDUE_ALERT_DAYS);
  if (late.length === 0) return 0;
  const rates = await getRates(sql);
  const summaries = await getPaymentSummaries(sql, late.map((b: any) => b.id));
  let sent = 0;
  for (const b of late) {
    const owed = outstandingFor(b, summaries.get(b.id)?.paid_total || 0, now, rates).outstanding;
    sent += await toStaff(sql, `overdue15:${b.id}`, {
      title: 'บิลค้างชำระเกิน 15 วัน',
      message: `ห้อง ${b.room_number || '-'} (${b.tenant_name}) ค้างชำระ ${daysPastDue(b.due_date, now)} วัน คงเหลือ ฿${formatBaht(owed)}`,
      link: `/owner/billing?bill=${b.id}`,
      type: 'overdue_alert',
    }, now);
  }
  return sent;
}

/** New tenant: the move-in bill is still unpaid the day before (or on) the contract start date. */
export async function moveInReminder(sql: any, now: Date) {
  const rows = await sql`
    SELECT c.id, c.start_date, r.room_number, b.id AS bill_id, b.amount, b.bill_type, b.status, b.due_date, b.late_fee_rate,
      COALESCE(t.user_id, u.id) AS user_id
    FROM contracts c
    JOIN bills b ON b.id = c.move_in_bill_id
    JOIN tenants t ON t.id = c.tenant_id
    LEFT JOIN users u ON t.user_id IS NULL AND LOWER(u.email) = LOWER(t.email)
    LEFT JOIN rooms r ON r.id = c.room_id
    WHERE c.status = 'PendingFirstBill' AND LOWER(b.status) IN ('unpaid', 'partial')
  `;
  let sent = 0;
  const rates = rows.length ? await getRates(sql) : null;
  const summaries = await getPaymentSummaries(sql, rows.map((r: any) => r.bill_id));
  for (const c of rows) {
    const left = daysUntil(c.start_date, now);
    if (left < 0 || left > 1) continue;
    const owed = outstandingFor(c, summaries.get(c.bill_id)?.paid_total || 0, now, rates!).outstanding;
    if (owed <= 0) continue;
    if (await notifyOnce(sql, c.user_id, `movein_due:${c.id}`, {
      title: 'ชำระบิลเข้าอยู่ภายในวันเริ่มสัญญา',
      message: `บิลเข้าอยู่ห้อง ${c.room_number || '-'} ยอดค้าง ฿${formatBaht(owed)} ต้องชำระภายใน ${thaiDate(c.start_date)} — หากไม่ชำระ สัญญาจะถูกยกเลิกและค่าจองไม่คืน`,
      link: '/guest',
      type: 'movein_reminder',
    }, now)) sent++;
  }
  return sent;
}

export type ReminderCounts = { meter: number; dueSoon: number; dueToday: number; overdue: number; moveIn: number; errors: string[] };

/** Run every reminder. One failing kind does not stop the others (its error is returned). */
export async function runReminders(now: Date, sql: any = getDb()): Promise<ReminderCounts> {
  const out: ReminderCounts = { meter: 0, dueSoon: 0, dueToday: 0, overdue: 0, moveIn: 0, errors: [] };
  const step = async (name: string, work: () => Promise<void>) => {
    try { await work(); } catch (e: any) { out.errors.push(`${name}: ${e?.message || e}`); console.error(`[reminders ${name}]`, e); }
  };
  await step('meter', async () => { out.meter = await meterReminder(sql, now); });
  await step('due', async () => { const d = await dueReminders(sql, now); out.dueSoon = d.dueSoon; out.dueToday = d.dueToday; });
  await step('overdue', async () => { out.overdue = await overdueReminder(sql, now); });
  await step('move_in', async () => { out.moveIn = await moveInReminder(sql, now); });
  return out;
}

/**
 * For page loads (GET /api/notifications): run the reminders at most every 10 minutes. The run is claimed with one
 * UPDATE on job_runs, so only one request (or server) runs it. Returns null when it was not this request's turn.
 */
export async function maybeRunReminders(now: Date, sql: any = getDb()): Promise<ReminderCounts | null> {
  const claimed = await sql`
    UPDATE job_runs SET ran_at = ${now}
    WHERE name = 'reminders' AND ran_at <= ${new Date(now.getTime() - RUN_EVERY_MINUTES * 60 * 1000)}
  `;
  if (!Number(claimed?.affectedRows || 0)) return null;
  return runReminders(now, sql);
}
