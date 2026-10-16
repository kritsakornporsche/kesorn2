// Labels and notes of the owner report (lib/reports.ts), shared with the page. No server imports here.

export const INCOME_GROUPS = ['rent', 'electric', 'water', 'common', 'late', 'booking_forfeit', 'cleaning', 'damage', 'other'] as const;
export type IncomeGroup = (typeof INCOME_GROUPS)[number];
export const INCOME_GROUP_LABELS: Record<IncomeGroup, string> = {
  rent: 'ค่าเช่า',
  electric: 'ค่าไฟฟ้า',
  water: 'ค่าน้ำประปา',
  common: 'ค่าส่วนกลาง',
  late: 'ค่าปรับชำระล่าช้า',
  booking_forfeit: 'ค่าจองที่ถูกริบ',
  cleaning: 'ค่าทำความสะอาด',
  damage: 'ค่าเสียหาย (หักจากเงินประกัน)',
  other: 'อื่น ๆ',
};
export const INCOME_SPLIT_NOTE = 'แยกตามรายการในบิลที่ชำระ ยอดรวมตรงกับบัญชีรายรับ';
export const TODAY_NOTE = 'อัตราการเข้าพักและบิลค้างชำระ แสดงสถานะ ณ วันนี้';
