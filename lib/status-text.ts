// Thai labels for status values stored in the database, so screens never show raw English codes.
// Keys are normalised (lower case, no spaces/underscores/hyphens) because older rows mix 'Active' / 'active' / 'In Progress'.

export type StatusKind = 'contract' | 'bill' | 'room' | 'tenant' | 'request' | 'job';

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/[\s_-]/g, '');

const TEXT: Record<StatusKind, Record<string, string>> = {
  contract: {
    bookingrequested: 'รออนุมัติการจอง',
    bookingapproved: 'อนุมัติจองแล้ว — รอชำระค่าจอง',
    pendingownersignature: 'ชำระค่าจองแล้ว — รอทำสัญญา',
    pendingcontract: 'ชำระค่าจองแล้ว — รอทำสัญญา',
    pendingfirstbill: 'รอชำระบิลเข้าอยู่',
    pendingstart: 'รอเริ่มสัญญา',
    active: 'มีผลบังคับใช้',
    renewed: 'ต่ออายุแล้ว',
    moveoutpending: 'รอย้ายออก',
    ended: 'สิ้นสุดแล้ว',
    terminated: 'สิ้นสุดแล้ว',
    cancelled: 'ยกเลิกแล้ว',
    rejected: 'ไม่ได้รับการอนุมัติ',
    expired: 'หมดเวลา',
  },
  bill: {
    draft: 'บิลร่าง',
    unpaid: 'รอชำระเงิน',
    pending: 'กำลังตรวจสอบ',
    partial: 'ชำระบางส่วน',
    overdue: 'เกินกำหนดชำระ',
    pendingcorrection: 'รอแก้ไขบิล',
    paid: 'ชำระเรียบร้อย',
    cancelled: 'ยกเลิกแล้ว',
  },
  room: {
    available: 'ว่าง',
    reserved: 'ติดจอง',
    occupied: 'มีผู้เช่า',
    maintenance: 'ปิดปรับปรุง',
    movingout: 'กำลังย้ายออก',
  },
  tenant: {
    active: 'กำลังพักอยู่',
    inactive: 'ไม่ได้พักแล้ว',
    movedout: 'ย้ายออกแล้ว',
  },
  request: {
    pending: 'รอดำเนินการ',
    approved: 'อนุมัติแล้ว',
    completed: 'เสร็จสิ้น',
    rejected: 'ไม่อนุมัติ',
    cancelled: 'ยกเลิกแล้ว',
  },
  job: {
    pending: 'รอดำเนินการ',
    inprogress: 'กำลังดำเนินการ',
    completed: 'เสร็จแล้ว',
    resolved: 'เสร็จแล้ว',
    cancelled: 'ยกเลิกแล้ว',
  },
};

/** Thai label for a stored status; an unknown or empty value gives a neutral Thai text, never the raw code. */
export function statusText(kind: StatusKind, value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return TEXT[kind][norm(value)] || 'สถานะอื่น';
}

/** Every status value this file knows, for tests. */
export function knownStatuses(kind: StatusKind): string[] {
  return Object.keys(TEXT[kind]);
}

/** True only for a bill that has been paid in full (case-insensitive). */
export function isPaidStatus(value: unknown): boolean {
  return norm(value) === 'paid';
}
