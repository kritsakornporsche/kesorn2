// Central billing rules: rates, utility charges, due dates and late fees.
// Every day count uses the calendar date in Asia/Bangkok, never UTC or the server's local time.

import { formatBaht } from '@/lib/format';
import { demoPricing } from '@/lib/test-rooms';
import { RENT_DUE_DAY, type ContractParty } from '@/lib/settings-fields';

export interface Rates {
  electricityPerUnit: number;
  waterPerPerson: number;
  commonFee: number;
  lateFeePerDay: number;
  /** Default proposed charge of a maid's cleaning job (owner decides the charge) */
  cleaningFee: number;
}

// Fallback only when dormitory_profile has no value
export const DEFAULT_RATES: Rates = {
  electricityPerUnit: 4.88,
  waterPerPerson: 100,
  commonFee: 150,
  lateFeePerDay: 50,
  cleaningFee: 300,
};

// Demo room (T01) used to test real payments with tiny amounts (rent comes from rooms.price) — off in production
// (lib/test-rooms.ts demoPricing, commit 26c)
const DEMO_ROOM_RATES = { electricityPerUnit: 1, waterPerPerson: 5, commonFee: 5 };

const BOOKING_FEE = 1000;
const DEMO_BOOKING_FEE = 1;
const DEMO_DEPOSIT = 20;
const DEFAULT_DEPOSIT = 3000;

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
    SELECT electricity_rate, water_rate, common_fee, late_fee_per_day, cleaning_fee
    FROM dormitory_profile
    LIMIT 1
  `;
  const row = rows[0] || {};
  return {
    electricityPerUnit: toNumber(row.electricity_rate, DEFAULT_RATES.electricityPerUnit),
    waterPerPerson: toNumber(row.water_rate, DEFAULT_RATES.waterPerPerson),
    commonFee: toNumber(row.common_fee, DEFAULT_RATES.commonFee),
    lateFeePerDay: toNumber(row.late_fee_per_day, DEFAULT_RATES.lateFeePerDay),
    cleaningFee: toNumber(row.cleaning_fee, DEFAULT_RATES.cleaningFee),
  };
}

export interface PaymentInfo {
  promptpayNumber: string | null;
  promptpayName: string | null;
  bankName: string | null;
  bankAccount: string | null;
  bankAccountName: string | null;
}

/** Where tenants transfer money (printed on the contract). No fallback: empty fields are null. */
export async function getPaymentInfo(sql: any): Promise<PaymentInfo> {
  const rows = await sql`
    SELECT promptpay_number, promptpay_name, bank_name, bank_account, bank_account_name FROM dormitory_profile LIMIT 1
  `;
  const row = rows[0] || {};
  const text = (v: unknown) => (String(v ?? '').trim() || null);
  return {
    promptpayNumber: text(row.promptpay_number),
    promptpayName: text(row.promptpay_name),
    bankName: text(row.bank_name),
    bankAccount: text(row.bank_account),
    bankAccountName: text(row.bank_account_name),
  };
}

/** Dorm and landlord details for the contract (settings page). No fallback: empty fields are null. */
export async function getContractParty(sql: any): Promise<ContractParty> {
  const rows = await sql`SELECT name, address, phone, landlord_name, landlord_phone FROM dormitory_profile ORDER BY id LIMIT 1`;
  const row = rows[0] || {};
  const text = (v: unknown) => (String(v ?? '').trim() || null);
  return {
    dormName: text(row.name),
    dormAddress: text(row.address),
    dormPhone: text(row.phone),
    landlordName: text(row.landlord_name),
    landlordPhone: text(row.landlord_phone),
  };
}

export function ratesForRoom(rates: Rates, roomNumber?: string | null): Rates {
  return demoPricing(roomNumber) ? { ...rates, ...DEMO_ROOM_RATES } : rates;
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
 * the monthly (kind = 'cycle') electricity reading of the cycle, rooms.price, the active contract's occupants and the rates.
 */
export async function priceMonthlyBill(sql: any, roomNumber: string, billingCycle: string, issueDate: Date | string | number = new Date()) {
  if (!roomNumber) return { error: 'ไม่ได้ระบุห้อง' };

  const rooms = await sql`SELECT id, room_number, price FROM rooms WHERE room_number = ${roomNumber} LIMIT 1`;
  if (rooms.length === 0) return { error: `ไม่พบห้อง ${roomNumber}` };
  const room = rooms[0];

  const readings = await sql`
    SELECT units_used FROM meter_readings
    WHERE room_id = ${room.id} AND type IN ('Electricity', 'Electric') AND billing_cycle = ${billingCycle} AND kind = 'cycle'
    ORDER BY id DESC LIMIT 1
  `;
  if (readings.length === 0) return { error: `ห้อง ${roomNumber} ยังไม่มีเลขมิเตอร์ของรอบ ${billingCycle}` };

  const contracts = await sql`
    SELECT tenant_id, occupants, start_date, move_in_bill_id FROM contracts
    WHERE room_id = ${room.id} AND status = 'Active'
    ORDER BY id DESC LIMIT 1
  `;
  if (contracts.length === 0 || !contracts[0].tenant_id) return { error: `ห้อง ${roomNumber} ไม่มีสัญญาเช่าที่ใช้งานอยู่` };

  const rates = ratesForRoom(await getRates(sql), room.room_number);
  const full = calcMonthlyBill({ roomPrice: room.price, unitsUsed: readings[0].units_used, occupants: contracts[0].occupants, rates });
  const bill = withoutMoveInCover(full, await moveInCover(sql, contracts[0], billingCycle));

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
    move_in_covered: bill.covered,
  };
}

type MoveInCover = { room: boolean; electric: boolean; water: boolean; common: boolean } | null;

/**
 * What the move-in bill already charged when the cycle is the contract's first month (start month in Thai time,
 * as lib/moveOut.ts counts it): each part it charged (> 0) is not charged again by that cycle's monthly bill.
 * Today the move-in bill charges the first month's rent only. Its common_fee column is never a charge (lib/moveIn.ts
 * never charges it; older rows hold the column default 150), so the common fee is always charged by the monthly bill.
 */
export async function moveInCover(sql: any, contract: { start_date?: unknown; move_in_bill_id?: unknown }, billingCycle: string): Promise<MoveInCover> {
  if (!contract.move_in_bill_id || !contract.start_date) return null;
  if (bangkokDate(contract.start_date as any).slice(0, 7) !== billingCycle) return null;
  const rows = await sql`
    SELECT room_amount, water_amount, electric_amount FROM bills
    WHERE id = ${contract.move_in_bill_id} AND LOWER(status) NOT IN ('cancelled', 'canceled') LIMIT 1
  `;
  const b = rows[0];
  if (!b) return null;
  return {
    room: Number(b.room_amount || 0) > 0,
    electric: Number(b.electric_amount || 0) > 0,
    water: Number(b.water_amount || 0) > 0,
    common: false,
  };
}

/** A monthly bill with the parts the move-in bill already charged set to 0 (lines say so). */
export function withoutMoveInCover<T extends ReturnType<typeof calcMonthlyBill>>(bill: T, cover: MoveInCover) {
  if (!cover) return { ...bill, covered: [] as string[] };
  const roomAmount = cover.room ? 0 : bill.roomAmount;
  const electricAmount = cover.electric ? 0 : bill.electricAmount;
  const waterAmount = cover.water ? 0 : bill.waterAmount;
  const commonFee = cover.common ? 0 : bill.commonFee;
  const covered = (['room', 'electric', 'water', 'common'] as const).filter((k) => cover[k]);
  const lines = bill.lines.map((l) => (covered.includes(l.key)
    ? { ...l, amount: 0, detail: `${l.detail} · เก็บในบิลค่าแรกเข้าแล้ว` }
    : l));
  return {
    ...bill, roomAmount, electricAmount, waterAmount, commonFee, lines, covered: covered as string[],
    total: round2(roomAmount + electricAmount + waterAmount + commonFee),
  };
}

/**
 * Due date for a monthly bill: the 5th of the month after the billing cycle (YYYY-MM),
 * but never earlier than 3 days after the bill is issued. Returns YYYY-MM-DD.
 */
export function calcDueDate(billingCycle: string, issueDate: Date | string | number = new Date()): string {
  const [y, m] = billingCycle.split('-').map(Number);
  const fifthOfNextMonth = new Date(Date.UTC(y, m, RENT_DUE_DAY)).toISOString().slice(0, 10);
  const earliest = addDays(bangkokDate(issueDate), 3);
  return dayNumber(fifthOfNextMonth) >= dayNumber(earliest) ? fifthOfNextMonth : earliest;
}

/** Late fee per day of a bill: the rate saved when it was sent (bills.late_fee_rate), else the current rate. */
export function lateFeeRateOf(bill: { late_fee_rate?: number | string | null }, rates: Rates): number {
  const saved = bill.late_fee_rate;
  return saved === null || saved === undefined || saved === '' || Number.isNaN(Number(saved)) ? rates.lateFeePerDay : Number(saved);
}

/**
 * Late fee for monthly rent bills only: the bill's late fee per day × whole days after the due date,
 * counted in Asia/Bangkok up to `asOf` (the actual transfer time when known). No cap.
 */
export function calcLateFee(
  bill: { bill_type?: string | null; status?: string | null; due_date?: Date | string | null; late_fee_rate?: number | string | null },
  asOf: Date | string | number,
  rates: Rates
) {
  const lateFeePerDay = lateFeeRateOf(bill, rates);
  if (bill.bill_type !== 'monthly' || !bill.due_date || !LATE_FEE_STATUSES.has(String(bill.status || '').toLowerCase())) {
    return { daysOverdue: 0, lateFee: 0, lateFeePerDay };
  }
  const daysOverdue = daysPastDue(bill.due_date, asOf);
  return { daysOverdue, lateFee: round2(daysOverdue * lateFeePerDay), lateFeePerDay };
}

/** Whole days after the due date, counted in Asia/Bangkok (0 on or before the due date). */
export function daysPastDue(dueDate: Date | string, asOf: Date | string | number): number {
  return Math.max(0, dayNumber(bangkokDate(asOf)) - dayNumber(bangkokDate(dueDate)));
}

/** Booking fee (it becomes part of the deposit). Set by the server, never taken from the client. */
export function bookingFeeFor(roomNumber?: string | null): number {
  const clean = String(roomNumber ?? '').trim().toUpperCase();
  if (clean === '1' || clean === '01' || clean === '101' || demoPricing(roomNumber)) {
    return DEMO_BOOKING_FEE;
  }
  return BOOKING_FEE;
}

/** Total deposit held for a room (the booking fee is part of it). */
export function depositFor(room: { room_number?: string | null; deposit_amount?: number | string | null }): number {
  const clean = String(room?.room_number ?? '').trim().toUpperCase();
  if (clean === '1' || clean === '01' || clean === '101') {
    return toNumber(room?.deposit_amount, 1);
  }
  if (demoPricing(room.room_number)) return DEMO_DEPOSIT;
  return toNumber(room.deposit_amount, DEFAULT_DEPOSIT) || DEFAULT_DEPOSIT;
}

/**
 * Consumer protection cap: the deposit plus rent paid in advance (the first month) may be at most 3 months of rent.
 * Returns the message to show when the room's figures go over it.
 */
export function capCheck(rent: number, deposit: number): { ok: true } | { ok: false; message: string } {
  const total = round2(Number(rent) + Number(deposit));
  const cap = round2(Number(rent) * 3);
  if (Math.round(total * 100) <= Math.round(cap * 100)) return { ok: true };
  return {
    ok: false,
    message: `เงินประกัน ฿${formatBaht(deposit)} + ค่าเช่าล่วงหน้า ฿${formatBaht(rent)} = ฿${formatBaht(total)} เกิน 3 เท่าของค่าเช่า (฿${formatBaht(cap)}) ตามประกาศ สคบ. พ.ศ. 2568 — กรุณาแก้ราคาห้อง/เงินประกันในหน้าห้องพัก`,
  };
}

/**
 * What a new tenant pays for a room: the booking fee now, then at move-in the first month of rent in full
 * (not pro-rated) plus the rest of the deposit. Monthly utility rates are included for estimates.
 */
export async function moveInCosts(sql: any, roomNumber: string) {
  const rows = await sql`SELECT room_number, price, deposit_amount FROM rooms WHERE room_number = ${roomNumber} LIMIT 1`;
  const room = rows[0];
  if (!room) return null;
  const rates = ratesForRoom(await getRates(sql), room.room_number);
  return {
    roomNumber: String(room.room_number),
    ...moveInAmounts(room),
    rates: { electricityPerUnit: rates.electricityPerUnit, waterPerPerson: rates.waterPerPerson, commonFee: rates.commonFee, lateFeePerDay: rates.lateFeePerDay, cleaningFee: rates.cleaningFee },
  };
}

/** Amounts of moveInCosts for a room row already read (the move-in bill is issued from these). */
export function moveInAmounts(room: { room_number?: string | null; price?: number | string | null; deposit_amount?: number | string | null }) {
  const rent = round2(Number(room.price || 0));
  const deposit = depositFor(room);
  const bookingFee = bookingFeeFor(room.room_number);
  const depositAtMoveIn = round2(Math.max(0, deposit - bookingFee));
  return { rent, deposit, bookingFee, depositAtMoveIn, dueAtMoveIn: round2(rent + depositAtMoveIn) };
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
