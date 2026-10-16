// Labels and notes of the owner report (lib/reports.ts), shared with the page. No server imports here.

export const INCOME_GROUPS = ['rent', 'electric', 'water', 'common', 'late', 'booking_forfeit', 'deposit_forfeit', 'cleaning', 'damage', 'other'] as const;
export type IncomeGroup = (typeof INCOME_GROUPS)[number];
export const INCOME_GROUP_LABELS: Record<IncomeGroup, string> = {
  rent: 'ค่าเช่า',
  electric: 'ค่าไฟฟ้า',
  water: 'ค่าน้ำประปา',
  common: 'ค่าส่วนกลาง',
  late: 'ค่าปรับชำระล่าช้า',
  booking_forfeit: 'ค่าจองที่ถูกริบ',
  deposit_forfeit: 'เงินประกันที่ถูกริบ',
  cleaning: 'ค่าทำความสะอาด',
  damage: 'ค่าเสียหาย (หักจากเงินประกัน)',
  other: 'อื่น ๆ',
};
export const INCOME_SPLIT_NOTE = 'แยกตามรายการในบิลที่ชำระ ยอดรวมตรงกับบัญชีรายรับ';
export const TODAY_NOTE = 'อัตราการเข้าพักและบิลค้างชำระ แสดงสถานะ ณ วันนี้';
export const UNPAID_NOTE = 'ยอดค้างรวมค่าปรับถึงวันนี้';

/**
 * Line under "เงินประกันที่ถืออยู่": Active contracts from before deposits were booked as a liability (legacy in
 * lib/moveOut depositBase). Their deposit is confirmed and booked at move-out, so it is NOT in the accounts. null when none.
 */
export function legacyDepositNote(l: { count: number; amount: number } | null | undefined): string | null {
  if (!l || l.count <= 0) return null;
  const amount = l.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `สัญญาเดิมก่อนระบบบัญชีใหม่ ${l.count} สัญญา: เงินประกันตามสัญญา ${amount} บาท · ยืนยันยอดและบันทึกบัญชีตอนย้ายออก`;
}
