// Central billing rules: rates, utility charges, due dates and late fees.
// Every day count uses the calendar date in Asia/Bangkok, never UTC or the server's local time.

export interface Rates {
  electricityPerUnit: number;
  waterPerPerson: number;
  commonFee: number;
  lateFeePerDay: number;
}

// Fallback only when dormitory_profile has no value
export const DEFAULT_RATES: Rates = {
  electricityPerUnit: 4.88,
  waterPerPerson: 100,
  commonFee: 150,
  lateFeePerDay: 50,
};

// Demo room used to test real payments with tiny amounts (rent comes from rooms.price)
const DEMO_ROOM_NUMBER = 'T01';
const DEMO_ROOM_RATES = { electricityPerUnit: 1, waterPerPerson: 5, commonFee: 5 };

const BOOKING_FEE = 1000;
const DEMO_BOOKING_FEE = 1;

// Late fees accrue only while the bill is payable (compared in lower case; older code wrote mixed case).
// PendingCorrection is frozen by a dispute and Draft has not been sent yet.
const LATE_FEE_STATUSES = new Set(['unpaid', 'overdue', 'pending', 'partial']);

const TIME_ZONE = 'Asia/Bangkok';
const DAY_MS = 24 * 60 * 60 * 1000;

const round2 = (n: number) => Math.round(n * 100) / 100;

const toNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  return value === null || value === undefined || value === '' || Number.isNaN(n) ? fallback : n;
};

/** Calendar date (YYYY-MM-DD) in Asia/Bangkok for a Date, timestamp or date string. */
export function bangkokDate(value: Date | string | number): string {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value));
}

const dayNumber = (ymd: string) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / DAY_MS;
};

const addDays = (ymd: string, days: number) =>
  new Date((dayNumber(ymd) + days) * DAY_MS).toISOString().slice(0, 10);

export async function getRates(sql: any): Promise<Rates> {
  const rows = await sql`
    SELECT electricity_rate, water_rate, common_fee, late_fee_per_day
    FROM dormitory_profile
    LIMIT 1
  `;
  const row = rows[0] || {};
  return {
    electricityPerUnit: toNumber(row.electricity_rate, DEFAULT_RATES.electricityPerUnit),
    waterPerPerson: toNumber(row.water_rate, DEFAULT_RATES.waterPerPerson),
    commonFee: toNumber(row.common_fee, DEFAULT_RATES.commonFee),
    lateFeePerDay: toNumber(row.late_fee_per_day, DEFAULT_RATES.lateFeePerDay),
  };
}

export function ratesForRoom(rates: Rates, roomNumber?: string | null): Rates {
  return String(roomNumber || '').toUpperCase() === DEMO_ROOM_NUMBER ? { ...rates, ...DEMO_ROOM_RATES } : rates;
}

export interface BillLine {
  key: 'room' | 'electric' | 'water' | 'common';
  label: string;
  detail: string;
  amount: number;
}

const fmt = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 });

export function calcUtility({ unitsUsed, occupants, rates }: { unitsUsed: number; occupants: number; rates: Rates }) {
  const electricUnits = Math.max(0, toNumber(unitsUsed, 0));
  const people = Math.max(1, Math.floor(toNumber(occupants, 1)));
  const electricAmount = round2(electricUnits * rates.electricityPerUnit);
  const waterAmount = round2(people * rates.waterPerPerson);
  const commonFee = round2(rates.commonFee);

  const lines: BillLine[] = [
    { key: 'electric', label: 'ค่าไฟฟ้า', detail: `${fmt(electricUnits)} หน่วย × ${fmt(rates.electricityPerUnit)} บาท`, amount: electricAmount },
    { key: 'water', label: 'ค่าน้ำ (เหมาจ่ายต่อคน)', detail: `${people} คน × ${fmt(rates.waterPerPerson)} บาท`, amount: waterAmount },
    { key: 'common', label: 'ค่าส่วนกลาง', detail: 'เหมาจ่ายรายเดือน', amount: commonFee },
  ];
  return { electricUnits, electricAmount, waterAmount, commonFee, occupants: people, lines };
}

export function calcMonthlyBill({ roomPrice, unitsUsed, occupants, rates }: {
  roomPrice: number; unitsUsed: number; occupants: number; rates: Rates;
}) {
  const utility = calcUtility({ unitsUsed, occupants, rates });
  const roomAmount = round2(toNumber(roomPrice, 0));
  const total = round2(roomAmount + utility.electricAmount + utility.waterAmount + utility.commonFee);
  return {
    ...utility,
    roomAmount,
    total,
    lines: [{ key: 'room', label: 'ค่าเช่าห้อง', detail: 'รายเดือน', amount: roomAmount } as BillLine, ...utility.lines],
  };
}

/**
 * Price a monthly rent bill for a room and billing cycle from server data only:
 * latest electricity reading of the cycle, rooms.price, the active contract's occupants and the rates.
 */
export async function priceMonthlyBill(sql: any, roomNumber: string, billingCycle: string, issueDate: Date | string | number = new Date()) {
  if (!roomNumber) return { error: 'ไม่ได้ระบุห้อง' };

  const rooms = await sql`SELECT id, room_number, price FROM rooms WHERE room_number = ${roomNumber} LIMIT 1`;
  if (rooms.length === 0) return { error: `ไม่พบห้อง ${roomNumber}` };
  const room = rooms[0];

  const readings = await sql`
    SELECT units_used FROM meter_readings
    WHERE room_id = ${room.id} AND type IN ('Electricity', 'Electric') AND billing_cycle = ${billingCycle}
    ORDER BY id DESC LIMIT 1
  `;
  if (readings.length === 0) return { error: `ห้อง ${roomNumber} ยังไม่มีเลขมิเตอร์ของรอบ ${billingCycle}` };

  const contracts = await sql`
    SELECT tenant_id, occupants FROM contracts
    WHERE room_id = ${room.id} AND status = 'Active'
    ORDER BY id DESC LIMIT 1
  `;
  if (contracts.length === 0 || !contracts[0].tenant_id) return { error: `ห้อง ${roomNumber} ไม่มีสัญญาเช่าที่ใช้งานอยู่` };

  const rates = ratesForRoom(await getRates(sql), room.room_number);
  const bill = calcMonthlyBill({ roomPrice: room.price, unitsUsed: readings[0].units_used, occupants: contracts[0].occupants, rates });

  return {
    tenant_id: contracts[0].tenant_id,
    amount: bill.total,
    due_date: calcDueDate(billingCycle, issueDate),
    water_units: 0,
    electric_units: bill.electricUnits,
    water_amount: bill.waterAmount,
    electric_amount: bill.electricAmount,
    room_amount: bill.roomAmount,
    common_fee: bill.commonFee,
    lines: bill.lines,
  };
}

/**
 * Due date for a monthly bill: the 5th of the month after the billing cycle (YYYY-MM),
 * but never earlier than 3 days after the bill is issued. Returns YYYY-MM-DD.
 */
export function calcDueDate(billingCycle: string, issueDate: Date | string | number = new Date()): string {
  const [y, m] = billingCycle.split('-').map(Number);
  const fifthOfNextMonth = new Date(Date.UTC(y, m, 5)).toISOString().slice(0, 10);
  const earliest = addDays(bangkokDate(issueDate), 3);
  return dayNumber(fifthOfNextMonth) >= dayNumber(earliest) ? fifthOfNextMonth : earliest;
}

/**
 * Late fee for monthly rent bills only: lateFeePerDay × whole days after the due date,
 * counted in Asia/Bangkok up to `asOf` (the actual transfer time when known). No cap.
 */
export function calcLateFee(
  bill: { bill_type?: string | null; status?: string | null; due_date?: Date | string | null },
  asOf: Date | string | number,
  rates: Rates
) {
  if (bill.bill_type !== 'monthly' || !bill.due_date || !LATE_FEE_STATUSES.has(String(bill.status || '').toLowerCase())) {
    return { daysOverdue: 0, lateFee: 0 };
  }
  const daysOverdue = daysPastDue(bill.due_date, asOf);
  return { daysOverdue, lateFee: round2(daysOverdue * rates.lateFeePerDay) };
}

/** Whole days after the due date, counted in Asia/Bangkok (0 on or before the due date). */
export function daysPastDue(dueDate: Date | string, asOf: Date | string | number): number {
  return Math.max(0, dayNumber(bangkokDate(asOf)) - dayNumber(bangkokDate(dueDate)));
}

/** Booking fee (it becomes part of the deposit). Set by the server, never taken from the client. */
export function bookingFeeFor(roomNumber?: string | null): number {
  return String(roomNumber || '').toUpperCase() === DEMO_ROOM_NUMBER ? DEMO_BOOKING_FEE : BOOKING_FEE;
}

/**
 * The dorm's PromptPay number, used both to build payment QR codes and to check the receiver on slips.
 * There is no fallback number: null means it is not configured and payments by QR/slip must be refused.
 */
export async function getDormPromptPay(sql: any): Promise<string | null> {
  const rows = await sql`SELECT promptpay_number FROM dormitory_profile LIMIT 1`;
  const clean = String(rows[0]?.promptpay_number || '').replace(/[\s-]/g, '');
  return clean || null;
}
