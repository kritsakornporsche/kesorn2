// Dates as the pages pick them (commit 28-9): plain 'YYYY-MM-DD' strings in Thai time, shown in the Buddhist era.
// Client-safe. The lease shortcuts follow the contract: 6 / 12 months end the day before the same date (1 ธ.ค. →
// 30 พ.ย.), confirmed with the dorm (plan 28 Q6).

export const TH_MONTHS = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const TH_WEEKDAYS = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

const pad = (n: number) => String(n).padStart(2, '0');
export const isYmd = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && toYmd(fromYmd(v)) === v;

/** 'YYYY-MM-DD' → a UTC date at midnight (no time-zone shifts in calendar maths) */
export const fromYmd = (v: string) => { const [y, m, d] = v.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); };
export const toYmd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** Today in Thai time as 'YYYY-MM-DD' (not the UTC date, which is still yesterday until 07:00) */
export const todayTh = (now: Date = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

/** A date from the server (ISO string / Date / 'YYYY-MM-DD') as 'YYYY-MM-DD' in Thai time; '' when empty */
export function ymdTh(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? '' : todayTh(d);
}

export const addDays = (v: string, n: number) => { const d = fromYmd(v); d.setUTCDate(d.getUTCDate() + n); return toYmd(d); };

/** v + n months; a day that does not exist in the target month becomes its last day (31 ม.ค. + 1 → 28/29 ก.พ.) */
export function addMonths(v: string, n: number): string {
  const d = fromYmd(v);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return toYmd(new Date(Date.UTC(y, m, Math.min(d.getUTCDate(), last))));
}

/** End of a lease of n months from start: the day before the same date n months later (1 ธ.ค. 2569 + 12 → 30 พ.ย. 2570) */
export const leaseEnd = (start: string, months: number) => addDays(addMonths(start, months), -1);

/** "1 ธ.ค. 2569" (short) / "1 ธันวาคม 2569" (long) */
export function thaiDate(v: string | null | undefined, long = false): string {
  if (!isYmd(v)) return '';
  const d = fromYmd(v);
  return `${d.getUTCDate()} ${(long ? TH_MONTHS : TH_MONTHS_SHORT)[d.getUTCMonth()]} ${d.getUTCFullYear() + 543}`;
}
