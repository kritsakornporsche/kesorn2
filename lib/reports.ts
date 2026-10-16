// Owner report (commit 22): one month of the dorm's accounts, occupancy and unpaid bills.
// Money comes only from accounting_transactions (the same sums as /api/owner/accounting); nothing is recomputed from
// bills. The income split divides each income row by the lines of the bill it paid (rent / electricity / water / common
// fee / late fee), so the split always adds up to the income in the accounts.
// Occupancy and unpaid bills are the state today (same rules as /api/owner/stats), whatever month is chosen.
// Managers get occupancy and unpaid bills only (no income, expense or deposits).

import { getDb } from '@/lib/db';
import { bangkokDate } from '@/lib/billing';
import { unpaidBillsToday, type UnpaidBill } from '@/lib/payments';
import { INCOME_GROUPS, INCOME_GROUP_LABELS, INCOME_SPLIT_NOTE, TODAY_NOTE, UNPAID_NOTE, type IncomeGroup } from '@/lib/report-text';

export { INCOME_GROUPS, INCOME_GROUP_LABELS, INCOME_SPLIT_NOTE, TODAY_NOTE, UNPAID_NOTE, type IncomeGroup };

const DORM_ID = 1;

const EXPENSE_LABELS: Record<string, string> = { 'Deposit Refund': 'คืนเงินประกัน (บันทึกแบบเดิม)' };

// Income entered by hand (no bill): its category name, when it is one of the groups
const MANUAL_GROUP: Record<string, IncomeGroup> = {
  rent: 'rent', 'ค่าเช่า': 'rent', 'ค่าเช่าห้อง': 'rent',
  electricity: 'electric', 'ค่าไฟ': 'electric', 'ค่าไฟฟ้า': 'electric',
  water: 'water', 'ค่าน้ำ': 'water', 'ค่าน้ำประปา': 'water',
  common: 'common', 'ค่าส่วนกลาง': 'common',
  'ค่าปรับ': 'late', 'ค่าปรับชำระล่าช้า': 'late',
  'ค่าทำความสะอาด': 'cleaning',
  damage: 'damage', 'ค่าเสียหาย': 'damage',
  'ริบค่าจอง': 'booking_forfeit',
  'ริบเงินประกัน': 'deposit_forfeit',
};

const toSatang = (n: unknown) => Math.round(Number(n || 0) * 100);
const baht = (satang: number) => satang / 100;

export function isMonth(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** First and last day (YYYY-MM-DD) of a month. */
export function monthRange(month: string): [string, string] {
  const [y, m] = month.split('-').map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return [`${month}-01`, `${month}-${String(last).padStart(2, '0')}`];
}

/** The month and the 5 before it, oldest first. */
export function lastMonths(month: string, count = 6): string[] {
  const [y, m] = month.split('-').map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

type Weights = Partial<Record<IncomeGroup, number>>;

/** Split satang over the weights; rounding left-overs go to the largest parts, so the parts add up exactly. */
export function allocate(satang: number, weights: Weights): Partial<Record<IncomeGroup, number>> {
  const entries = (Object.entries(weights) as [IncomeGroup, number][]).filter(([, w]) => w > 0);
  if (entries.length === 0) return { other: satang };
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const sign = satang < 0 ? -1 : 1;
  const abs = Math.abs(satang);
  const raw = entries.map(([g, w]) => ({ g, exact: (abs * w) / total }));
  const parts = raw.map((r) => ({ g: r.g, v: Math.floor(r.exact), rest: r.exact - Math.floor(r.exact) }));
  let left = abs - parts.reduce((s, p) => s + p.v, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest)) {
    if (left <= 0) break;
    p.v += 1;
    left -= 1;
  }
  const out: Partial<Record<IncomeGroup, number>> = {};
  for (const p of parts) out[p.g] = (out[p.g] || 0) + sign * p.v;
  return out;
}

interface BillForSplit {
  bill_type: string | null; is_first_bill: number | null; title: string | null;
  amount: number | string; room_amount: number | string | null; electric_amount: number | string | null;
  water_amount: number | string | null; common_fee: number | string | null; penalty_amount: number | string | null;
  /** income booked for this bill, all months, net of reversals (satang) */
  net_income: number;
  /** a payment was made after the due date */
  paid_late: boolean;
}

/**
 * How the income of one bill divides into groups (weights in satang).
 * Late fee: the one saved on the bill when it was paid (penalty_amount); without it, what was paid above the bill
 * counts as late fee only for a monthly bill paid after its due date — otherwise "อื่น ๆ".
 */
export function billWeights(b: BillForSplit): Weights {
  const type = String(b.bill_type || 'monthly');
  if (type === 'damage' || type === 'move_out_damage') return { damage: 1 };
  if (type === 'service') return String(b.title || '').includes('ทำความสะอาด') ? { cleaning: 1 } : { other: 1 };
  if (Number(b.is_first_bill) === 1) return { rent: 1 }; // move-in bill: its income part is the first month's rent
  if (type === 'booking') return { other: 1 }; // a booking fee is a deposit; no income part normally
  const w: Weights = {
    rent: toSatang(b.room_amount),
    electric: toSatang(b.electric_amount),
    water: toSatang(b.water_amount),
    common: toSatang(b.common_fee),
  };
  const lines = (w.rent || 0) + (w.electric || 0) + (w.water || 0) + (w.common || 0);
  const amount = toSatang(b.amount);
  if (amount > lines) w.other = amount - lines;
  const penalty = toSatang(b.penalty_amount);
  if (penalty > 0) {
    w.late = penalty;
  } else {
    const above = b.net_income - amount;
    if (above > 0) {
      if (type === 'monthly' && b.paid_late) w.late = above;
      else w.other = (w.other || 0) + above;
    }
  }
  return Object.values(w).some((v) => (v || 0) > 0) ? w : { other: 1 };
}

export interface OwnerReport {
  month: string;
  generatedAt: string;
  role: 'owner' | 'manager';
  money: null | {
    income: { group: IncomeGroup; label: string; amount: number }[];
    incomeTotal: number;
    expense: { category: string; label: string; amount: number }[];
    expenseTotal: number;
    profit: number;
    depositsHeld: number;
    months: { month: string; income: number; expense: number }[];
  };
  occupancy: { occupied: number; total: number; rate: number };
  unpaid: { count: number; total: number; bills: UnpaidBill[] };
}

async function incomeSplit(sql: any, first: string, last: string) {
  const rows = await sql`
    SELECT a.id, a.category, a.amount, a.reference_type, a.reference_id,
           CASE WHEN a.reference_type IN ('bill_payment', 'bill_payment_reversal') THEN p.bill_id
                WHEN a.reference_type IN ('bill', 'bill_reversal') THEN a.reference_id END AS bill_id
    FROM accounting_transactions a
    LEFT JOIN bill_payments p ON a.reference_type IN ('bill_payment', 'bill_payment_reversal') AND p.id = a.reference_id
    WHERE a.dorm_id = ${DORM_ID} AND a.type = 'Income' AND a.transaction_date BETWEEN ${first} AND ${last}
  `;
  const billIds = [...new Set((rows as any[]).map((r) => Number(r.bill_id)).filter((id) => id > 0))];
  const bills = new Map<number, BillForSplit>();
  if (billIds.length > 0) {
    const billRows = await sql`
      SELECT b.id, b.bill_type, b.is_first_bill, b.title, b.amount, b.room_amount, b.electric_amount, b.water_amount, b.common_fee,
             b.penalty_amount, b.due_date,
             (SELECT COALESCE(SUM(a.amount), 0) FROM accounting_transactions a
               LEFT JOIN bill_payments p ON a.reference_type IN ('bill_payment', 'bill_payment_reversal') AND p.id = a.reference_id
              WHERE a.type = 'Income'
                AND ((a.reference_type IN ('bill_payment', 'bill_payment_reversal') AND p.bill_id = b.id)
                  OR (a.reference_type IN ('bill', 'bill_reversal') AND a.reference_id = b.id))) AS net_income,
             (SELECT MAX(p.paid_at) FROM bill_payments p WHERE p.bill_id = b.id AND p.voided_at IS NULL) AS last_paid_at
      FROM bills b WHERE b.id IN (${billIds})
    `;
    for (const b of billRows as any[]) {
      const due = b.due_date ? (b.due_date instanceof Date ? bangkokDate(b.due_date) : String(b.due_date).slice(0, 10)) : null;
      bills.set(Number(b.id), {
        ...b,
        net_income: toSatang(b.net_income),
        paid_late: !!(due && b.last_paid_at && bangkokDate(new Date(b.last_paid_at)) > due),
      });
    }
  }
  const sums: Record<IncomeGroup, number> = Object.fromEntries(INCOME_GROUPS.map((g) => [g, 0])) as Record<IncomeGroup, number>;
  for (const r of rows as any[]) {
    const satang = toSatang(r.amount);
    const bill = r.bill_id ? bills.get(Number(r.bill_id)) : undefined;
    let parts: Partial<Record<IncomeGroup, number>>;
    if (bill) parts = allocate(satang, billWeights(bill));
    else if (r.reference_type === 'booking_forfeit') parts = { booking_forfeit: satang };
    else if (r.reference_type === 'settlement_forfeit') parts = { deposit_forfeit: satang }; // deposit kept at move-out (lib/moveOut.ts)
    else if (!r.reference_type) parts = { [MANUAL_GROUP[String(r.category || '').trim().toLowerCase()] || MANUAL_GROUP[String(r.category || '').trim()] || 'other']: satang };
    else parts = { other: satang };
    for (const [g, v] of Object.entries(parts) as [IncomeGroup, number][]) sums[g] += v;
  }
  return sums;
}

/** The report of a month (YYYY-MM). `now` decides "today" for occupancy and unpaid bills. */
export async function ownerReport(month: string, role: 'owner' | 'manager', now: Date): Promise<OwnerReport> {
  const sql = getDb();

  const [{ total }] = await sql`SELECT COUNT(*) AS total FROM rooms`;
  const [{ occupied }] = await sql`SELECT COUNT(*) AS occupied FROM rooms WHERE status = 'Occupied'`;
  const totalRooms = Number(total || 0);
  const occupiedRooms = Number(occupied || 0);

  // Same formula as the dashboard (lib/payments unpaidBillsToday): amount + late fee to today − payments, never below 0
  const unpaid = await unpaidBillsToday(sql, now);

  const report: OwnerReport = {
    month,
    generatedAt: now.toISOString(),
    role,
    money: null,
    occupancy: { occupied: occupiedRooms, total: totalRooms, rate: totalRooms > 0 ? Math.round((occupiedRooms / totalRooms) * 1000) / 10 : 0 },
    unpaid,
  };
  if (role !== 'owner') return report;

  const [first, last] = monthRange(month);
  const split = await incomeSplit(sql, first, last);
  const expenseRows = await sql`
    SELECT category, SUM(amount) AS amount FROM accounting_transactions
    WHERE dorm_id = ${DORM_ID} AND type = 'Expense' AND transaction_date BETWEEN ${first} AND ${last}
    GROUP BY category ORDER BY SUM(amount) DESC
  `;
  const months = lastMonths(month);
  const [seriesFirst] = monthRange(months[0]);
  const seriesRows = await sql`
    SELECT DATE_FORMAT(transaction_date, '%Y-%m') AS month,
           SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) AS income,
           SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) AS expense
    FROM accounting_transactions
    WHERE dorm_id = ${DORM_ID} AND transaction_date BETWEEN ${seriesFirst} AND ${last}
    GROUP BY DATE_FORMAT(transaction_date, '%Y-%m')
  `;
  const [held] = await sql`SELECT COALESCE(SUM(amount), 0) AS held FROM accounting_transactions WHERE dorm_id = ${DORM_ID} AND type = 'Liability'`;

  const incomeTotal = INCOME_GROUPS.reduce((s, g) => s + split[g], 0);
  const expense = (expenseRows as any[]).map((r) => ({ category: String(r.category), label: EXPENSE_LABELS[r.category] || String(r.category), amount: baht(toSatang(r.amount)) }));
  const expenseTotal = (expenseRows as any[]).reduce((s, r) => s + toSatang(r.amount), 0);
  const byMonth = new Map((seriesRows as any[]).map((r) => [String(r.month), r]));
  report.money = {
    income: INCOME_GROUPS.map((g) => ({ group: g, label: INCOME_GROUP_LABELS[g], amount: baht(split[g]) })),
    incomeTotal: baht(incomeTotal),
    expense,
    expenseTotal: baht(expenseTotal),
    profit: baht(incomeTotal - expenseTotal),
    depositsHeld: baht(toSatang(held?.held)),
    months: months.map((m) => ({ month: m, income: baht(toSatang(byMonth.get(m)?.income)), expense: baht(toSatang(byMonth.get(m)?.expense)) })),
  };
  return report;
}

const thaiMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

/** CSV of the report: UTF-8 with BOM (Thai text opens correctly in Excel), CRLF lines, plain numbers. */
export function reportCsv(r: OwnerReport): string {
  const cell = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const num = (n: number) => n.toFixed(2);
  const rows: unknown[][] = [
    ['รายงานหอพัก', thaiMonth(r.month)],
    ['สร้างเมื่อ', new Date(r.generatedAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })],
    [],
  ];
  if (r.money) {
    rows.push(['รายรับแยกประเภท', 'บาท']);
    for (const i of r.money.income) rows.push([i.label, num(i.amount)]);
    rows.push(['รวมรายรับ', num(r.money.incomeTotal)], [INCOME_SPLIT_NOTE], []);
    rows.push(['รายจ่าย', 'บาท']);
    for (const e of r.money.expense) rows.push([e.label, num(e.amount)]);
    rows.push(['รวมรายจ่าย', num(r.money.expenseTotal)], ['กำไรสุทธิ', num(r.money.profit)], []);
    rows.push(['เงินประกันที่ถืออยู่ (ณ วันนี้)', num(r.money.depositsHeld)], []);
    rows.push(['รายรับ/รายจ่าย 6 เดือน', 'รายรับ', 'รายจ่าย']);
    for (const m of r.money.months) rows.push([thaiMonth(m.month), num(m.income), num(m.expense)]);
    rows.push([]);
  }
  rows.push([TODAY_NOTE]);
  rows.push(['อัตราการเข้าพัก', `${r.occupancy.occupied}/${r.occupancy.total}`, `${r.occupancy.rate}%`], []);
  rows.push(['บิลค้างชำระ', `${r.unpaid.count} บิล`, num(r.unpaid.total)], [UNPAID_NOTE]);
  rows.push(['ห้อง', 'รายการ', 'รอบบิล', 'ครบกำหนด', 'ยอดบิล', 'ค่าปรับถึงวันนี้', 'ชำระแล้ว', 'ค้างชำระ (บาท)']);
  for (const b of r.unpaid.bills) rows.push([b.room_number, b.title, b.billing_cycle || '', b.due_date || '', num(b.amount), num(b.late_fee), num(b.paid), num(b.outstanding)]);
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}
