// Display helpers shared by billing pages and receipts (Thai locale, Asia/Bangkok time)

/** Baht amount with exactly 2 decimals, e.g. 3196.4 -> "3,196.40" */
export function formatBaht(value: number | string | null | undefined): string {
  return Number(value || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** e.g. "12 ต.ค. 2569 23:00 น." in Asia/Bangkok; "-" when empty or invalid */
export function formatThaiDateTime(value: Date | string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) + ' น.';
}

/** e.g. "5 พ.ย. 2569" for a date-only value (YYYY-MM-DD strings are treated as Thai calendar dates) */
export function formatThaiDate(value: Date | string | null | undefined): string {
  if (!value) return '-';
  const d = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+07:00`) : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: 'numeric' });
}

/** Receipt number derived from the payment (unique and stable): RC-YYYYMM-00012 */
export function receiptNo(paymentId: number, paidAt: Date | string): string {
  const ym = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' })
    .format(new Date(paidAt)).replace('-', '');
  return `RC-${ym}-${String(paymentId).padStart(5, '0')}`;
}

export const PAYMENT_METHOD_LABEL: Record<string, string> = {
  slip: 'โอนผ่านสลิป (ตรวจอัตโนมัติ)',
  transfer: 'โอนเงิน',
  cash: 'เงินสด',
};
