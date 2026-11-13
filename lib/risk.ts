// Room risk from real data (commit 29) — replaces the old fixed scores by room number (110, 210, 108 …).
// - energy: the room's latest monthly electricity units against the average of the 3 cycles before it
//   (meter_readings, kind 'cycle'); fewer than 4 cycles → "ข้อมูลไม่พอ"
// - money: bills past their due date that still have money owed (lib/payments unpaidBillsToday)
// - contract: days left to the end date of the room's Active contract
// A room with neither meter history nor a contract is "ข้อมูลไม่พอ" (riskLevel INSUFFICIENT), never a made-up score.
// Owner figures leave test rooms (T01) out, as elsewhere (commit 26c).

import { bangkokDate } from '@/lib/billing';
import { unpaidBillsToday } from '@/lib/payments';
import { isTestRoom } from '@/lib/test-rooms';

export const INSUFFICIENT_TEXT = 'ข้อมูลไม่พอ';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'CRITICAL' | 'INSUFFICIENT';

export interface RoomRisk {
  roomId: number;
  roomNumber: string;
  floor: number | null;
  tenantName: string;
  roomStatus: string;
  financialScore: number;
  energyScore: number;
  contractScore: number;
  totalScore: number;
  riskLevel: RiskLevel;
  primaryFactor: string;
  totalOverdue: number;
  overdueBills: number;
  /** energy: latest cycle units, average of the 3 cycles before, ratio; null = ข้อมูลไม่พอ */
  energy: { cycle: string; units: number; average3: number; ratio: number | null } | null;
  /** contract: end date and days left; null = no Active contract */
  contract: { endDate: string; daysLeft: number } | null;
  dataStatus: 'ok' | 'insufficient';
}

const DAY = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;
const dayNum = (ymd: string) => Date.UTC(Number(ymd.slice(0, 4)), Number(ymd.slice(5, 7)) - 1, Number(ymd.slice(8, 10))) / DAY;

/** Energy score from the latest units vs the 3-cycle average */
export function energyRisk(units: number[]): { score: number; ratio: number | null; average3: number } | null {
  // units: newest first
  if (units.length < 4) return null;
  const [latest, ...rest] = units;
  const average3 = round2((rest[0] + rest[1] + rest[2]) / 3);
  if (average3 <= 0) return { score: latest > 0 ? 30 : 0, ratio: null, average3 };
  const ratio = round2(latest / average3);
  return { score: ratio >= 1.5 ? 30 : ratio >= 1.25 ? 15 : 0, ratio, average3 };
}

/** Contract score from days left (Active contract) */
export function contractRisk(daysLeft: number): number {
  if (daysLeft <= 30) return 20;
  if (daysLeft <= 60) return 10;
  return 0;
}

/** Money score from overdue bills */
export function financialRisk(count: number, total: number, deposit: number): number {
  if (count === 0) return 0;
  if (count >= 2 || (deposit > 0 && total >= deposit)) return 40;
  return 25;
}

export function levelOf(total: number): Exclude<RiskLevel, 'INSUFFICIENT'> {
  return total >= 70 ? 'CRITICAL' : total >= 40 ? 'MEDIUM' : 'LOW';
}

export async function computeRoomRisks(sql: any, now: Date = new Date()): Promise<RoomRisk[]> {
  const today = bangkokDate(now);
  const rooms = (await sql`SELECT id, room_number, status, floor FROM rooms ORDER BY room_number + 0, room_number`)
    .filter((r: any) => !isTestRoom(r.room_number));

  const contracts = await sql`
    SELECT c.id, c.room_id, c.end_date, c.deposit_amount, COALESCE(t.name, '') AS tenant_name
    FROM contracts c LEFT JOIN tenants t ON t.id = c.tenant_id
    WHERE c.status = 'Active'
    ORDER BY c.id DESC
  `;
  const contractOf = new Map<number, any>();
  for (const c of contracts) if (!contractOf.has(Number(c.room_id))) contractOf.set(Number(c.room_id), c);

  const readings = await sql`
    SELECT room_id, billing_cycle, units_used FROM meter_readings
    WHERE type IN ('Electricity', 'Electric') AND kind = 'cycle' AND billing_cycle IS NOT NULL
    ORDER BY billing_cycle DESC, id DESC
  `;
  const unitsOf = new Map<number, { cycle: string; units: number }[]>();
  for (const r of readings) {
    const list = unitsOf.get(Number(r.room_id)) || [];
    if (!list.some((x) => x.cycle === r.billing_cycle)) list.push({ cycle: String(r.billing_cycle), units: Number(r.units_used) || 0 });
    unitsOf.set(Number(r.room_id), list);
  }

  const unpaid = await unpaidBillsToday(sql, now, { excludeTestRooms: true });
  const overdueOf = new Map<string, { count: number; total: number }>();
  for (const b of unpaid.bills) {
    if (!b.due_date || b.due_date >= today || b.outstanding <= 0) continue;
    const o = overdueOf.get(b.room_number) || { count: 0, total: 0 };
    o.count += 1;
    o.total = round2(o.total + b.outstanding);
    overdueOf.set(b.room_number, o);
  }

  return rooms.map((r: any): RoomRisk => {
    const roomNumber = String(r.room_number);
    const c = contractOf.get(Number(r.id));
    const history = unitsOf.get(Number(r.id)) || [];
    const e = energyRisk(history.map((h) => h.units));
    const od = overdueOf.get(roomNumber) || { count: 0, total: 0 };
    const deposit = Number(c?.deposit_amount || 0);
    const financialScore = financialRisk(od.count, od.total, deposit);
    const end = c?.end_date ? bangkokDate(c.end_date) : null;
    const daysLeft = end ? Math.round(dayNum(end) - dayNum(today)) : null;
    const contractScore = daysLeft === null ? 0 : contractRisk(daysLeft);
    const energyScore = e?.score ?? 0;
    const insufficient = !e && !c && od.count === 0;
    const totalScore = Math.min(100, financialScore + energyScore + contractScore);

    const factors: string[] = [];
    if (od.count > 0) factors.push(`ค้างชำระเกินกำหนด ${od.count} บิล (฿${od.total.toLocaleString('th-TH')})`);
    if (e && e.score > 0) factors.push(e.ratio === null ? `ใช้ไฟ ${history[0].units} หน่วย (3 เดือนก่อนไม่ใช้)` : `ใช้ไฟ ${history[0].units} หน่วย = ${e.ratio} เท่าของเฉลี่ย 3 เดือน (${e.average3})`);
    if (daysLeft !== null && contractScore > 0) factors.push(daysLeft < 0 ? `สัญญาสิ้นสุดแล้ว ${-daysLeft} วัน` : `สัญญาสิ้นสุดในอีก ${daysLeft} วัน`);
    const primaryFactor = insufficient
      ? INSUFFICIENT_TEXT
      : factors[0] || (e ? 'ปกติ' : `ปกติ (หน่วยไฟ: ${INSUFFICIENT_TEXT})`);

    return {
      roomId: Number(r.id),
      roomNumber,
      floor: r.floor === null || r.floor === undefined ? null : Number(r.floor),
      tenantName: c ? (String(c.tenant_name || '').trim() || 'ผู้เช่า') : (String(r.status) === 'Available' ? 'ห้องว่าง' : '-'),
      roomStatus: String(r.status || ''),
      financialScore,
      energyScore,
      contractScore,
      totalScore,
      riskLevel: insufficient ? 'INSUFFICIENT' : levelOf(totalScore),
      primaryFactor,
      totalOverdue: od.total,
      overdueBills: od.count,
      energy: e ? { cycle: history[0].cycle, units: history[0].units, average3: e.average3, ratio: e.ratio } : null,
      contract: end && daysLeft !== null ? { endDate: end, daysLeft } : null,
      dataStatus: insufficient ? 'insufficient' : 'ok',
    };
  });
}

/** Totals for the risk page header (rooms with too little data are counted apart, not as "normal") */
export function riskSummary(rooms: RoomRisk[]) {
  const rated = rooms.filter((r) => r.riskLevel !== 'INSUFFICIENT');
  return {
    overallRiskIndex: Math.round(rated.reduce((s, r) => s + r.totalScore, 0) / (rated.length || 1)),
    overallStatus: rated.some((r) => r.riskLevel !== 'LOW') ? 'WARNING' : 'LOW',
    criticalRoomsCount: rooms.filter((r) => r.riskLevel === 'CRITICAL').length,
    warningRoomsCount: rooms.filter((r) => r.riskLevel === 'MEDIUM').length,
    normalRoomsCount: rooms.filter((r) => r.riskLevel === 'LOW').length,
    insufficientRoomsCount: rooms.filter((r) => r.riskLevel === 'INSUFFICIENT').length,
    energyInsufficientCount: rooms.filter((r) => !r.energy).length,
    totalExposureAmount: round2(rooms.reduce((s, r) => s + r.totalOverdue, 0)),
    electricalAnomaliesCount: rooms.filter((r) => r.energyScore > 0).length,
  };
}
