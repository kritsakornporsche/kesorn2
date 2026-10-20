// Booking → tenant in 7 steps (commit 28). One function reads where a booking/contract is from what it already has, so
// the owner pages, the booker's pages and the server checks all see the same step. No status values are added: the
// steps come from contracts.status plus data_confirmed_at (migration 021), the move-in inspection, the signed paper
// and the move-in bill. Client-safe (no database / file access): the API passes the facts in.
//
//  1 ขอจอง → หอพักอนุมัติ          BookingRequested → BookingApproved
//  2 ชำระค่าจอง (10 นาที)          BookingApproved → PendingOwnerSignature
//  3 ยืนยันข้อมูลสัญญา (ล็อก)        data_confirmed_at
//  4 ตรวจห้อง → ผู้เช่ารับทราบ        move-in inspection acknowledged (in the app, or on paper recorded by staff)
//  5 ลงนามสัญญา → อัปโหลด           signed paper + signing date
//  6 ออกบิลค่าแรกเข้า               → PendingFirstBill (only when 3–5 are done)
//  7 ชำระบิลค่าแรกเข้า → สัญญามีผล    → Active, the booker becomes a tenant
//
// Inspection before signing (steps 4 / 5): the contract says the inspection record is part of it (clauses 11, 13) and
// the printed contract carries it as its last page. Contracts whose move-in bill was issued before step 3 existed
// ("ขั้นตอนเดิม") keep the old rule: they take effect when the bill is paid and the signed paper is uploaded.

export type StepNo = 1 | 2 | 3 | 4 | 5 | 6 | 7;
export type StepWho = 'booker' | 'owner' | 'both';
export type StepState = 'done' | 'current' | 'todo';
/** step = in steps 1–7 · active = the contract is in effect · closed = cancelled / rejected / expired / ended · legacy = an older contract handled by hand */
export type StepPhase = 'step' | 'active' | 'closed' | 'legacy';
export type InspectionState = 'none' | 'pending_ack' | 'acknowledged';

export const STEP_TITLES: Record<StepNo, string> = {
  1: 'ขอจอง → หอพักอนุมัติ',
  2: 'ชำระค่าจอง',
  3: 'ยืนยันข้อมูลสัญญา',
  4: 'ตรวจห้อง → ผู้เช่ารับทราบ',
  5: 'ลงนามสัญญา → อัปโหลด',
  6: 'ออกบิลค่าแรกเข้า',
  7: 'ชำระบิลค่าแรกเข้า → สัญญามีผล',
};
export const STEP_SHORT: Record<StepNo, string> = {
  1: 'ขอจอง', 2: 'ชำระค่าจอง', 3: 'ยืนยันข้อมูล', 4: 'ตรวจห้อง', 5: 'ลงนาม', 6: 'บิลค่าแรกเข้า', 7: 'รอชำระ',
};
export const STEP_WHO: Record<StepNo, StepWho> = { 1: 'both', 2: 'booker', 3: 'owner', 4: 'both', 5: 'owner', 6: 'owner', 7: 'booker' };
export const WHO_TEXT: Record<StepWho, string> = { booker: 'ผู้จอง', owner: 'หอพัก', both: 'ผู้จอง + หอพัก' };

/** Booking fee paid, contract not in effect yet (PendingContract is an older name for the same state) */
export const BOOKING_PAID_STATUSES = ['PendingOwnerSignature', 'PendingContract'];
const ACTIVE_STATUSES = ['Active', 'Renewed', 'MoveOutPending'];
const CLOSED_STATUSES = ['Cancelled', 'Rejected', 'Expired', 'Ended', 'Terminated'];

/** What a contract row already has (the API fills these in). */
export interface StepFacts {
  status: string;
  data_confirmed_at?: string | Date | null;
  move_in_bill_id?: number | string | null;
  /** status of the move-in bill */
  move_in_bill_status?: string | null;
  inspection_status?: InspectionState | null;
  /** the signed paper is stored and its signing date recorded */
  paper_uploaded?: boolean | null;
}

export interface StepItem { no: StepNo; title: string; who: StepWho; state: StepState; note?: string }

export interface BookingSteps {
  phase: StepPhase;
  /** the step to do now (null outside steps 1–7) */
  current: StepNo | null;
  /** 'old' = the move-in bill was issued before step 3 existed (old activation rule) */
  order: 'new' | 'old';
  items: StepItem[];
  /** who does the next thing and what (null when nothing is left) */
  next: { who: StepWho; text: string } | null;
  /** step 6 is open: data confirmed, inspection acknowledged, signed paper uploaded, no move-in bill yet */
  canIssueMoveIn: boolean;
  /** what still stops the move-in bill (Thai, for the page and the server's 409) */
  missingForMoveIn: string[];
}

const NEXT_TEXT: Record<StepNo, string> = {
  1: 'หอพักอนุมัติหรือปฏิเสธคำขอจอง',
  2: 'ผู้จองชำระค่าจองและอัปโหลดสลิปภายในเวลาที่กำหนด',
  3: 'หอพักกรอก/ตรวจข้อมูลสัญญา แล้วกด "ยืนยันข้อมูลสัญญา"',
  4: 'หอพักตรวจสภาพห้องและบันทึกผล แล้วผู้เช่ากดรับทราบ',
  5: 'พิมพ์สัญญา ลงนามทั้งสองฝ่าย แล้วหอพักอัปโหลดสัญญาที่ลงนาม',
  6: 'หอพักออกบิลค่าแรกเข้า',
  7: 'ผู้จองชำระบิลค่าแรกเข้า — สัญญามีผลทันทีที่ชำระครบ',
};

export const MISSING_TEXT = {
  confirm: 'ยังไม่ได้ยืนยันข้อมูลสัญญา',
  inspect: 'ยังไม่ได้ตรวจห้อง',
  ack: 'ผู้เช่ายังไม่รับทราบผลตรวจห้อง',
  paper: 'ยังไม่ได้อัปโหลดสัญญาที่ลงนาม',
  issued: 'ออกบิลค่าแรกเข้าแล้ว',
  status: 'สถานะการจองยังไม่ถึงขั้นออกบิลค่าแรกเข้า',
} as const;

const isPaid = (s: unknown) => String(s || '').toLowerCase() === 'paid';

/** Step 3 counts as done when confirmed, or when an older contract already has its signed paper (old order). */
export function dataConfirmed(f: StepFacts): boolean {
  return Boolean(f.data_confirmed_at) || Boolean(f.paper_uploaded);
}

/** What still stops the move-in bill (step 6) — the server checks the same list on the locked row. */
export function missingForMoveIn(f: StepFacts): string[] {
  const missing: string[] = [];
  if (f.move_in_bill_id) return [MISSING_TEXT.issued];
  if (!BOOKING_PAID_STATUSES.includes(f.status)) return [MISSING_TEXT.status];
  if (!dataConfirmed(f)) missing.push(MISSING_TEXT.confirm);
  const insp = f.inspection_status || 'none';
  if (insp === 'none') missing.push(MISSING_TEXT.inspect);
  else if (insp === 'pending_ack') missing.push(MISSING_TEXT.ack);
  if (!f.paper_uploaded) missing.push(MISSING_TEXT.paper);
  return missing;
}

function list(current: StepNo | null, doneUpTo: number, notes: Partial<Record<StepNo, string>> = {}, done: Partial<Record<StepNo, boolean>> = {}): StepItem[] {
  return ([1, 2, 3, 4, 5, 6, 7] as StepNo[]).map((no) => {
    const isDone = done[no] ?? no <= doneUpTo;
    const state: StepState = isDone ? 'done' : no === current ? 'current' : 'todo';
    return { no, title: STEP_TITLES[no], who: STEP_WHO[no], state, ...(notes[no] ? { note: notes[no] } : {}) };
  });
}

function nextFor(step: StepNo, f: StepFacts): { who: StepWho; text: string } {
  if (step === 4) {
    const insp = f.inspection_status || 'none';
    return insp === 'pending_ack'
      ? { who: 'booker', text: 'ผู้เช่ากดรับทราบผลตรวจห้อง (หรือหอพักบันทึกว่าผู้เช่ารับทราบบนกระดาษ)' }
      : { who: 'owner', text: 'หอพักตรวจสภาพห้องร่วมกับผู้เช่าและบันทึกผล' };
  }
  const who = STEP_WHO[step];
  return { who: who === 'both' ? 'owner' : who, text: NEXT_TEXT[step] };
}

/** Where a booking/contract is in steps 1–7, with the checklist and the next thing to do. */
export function stepOf(f: StepFacts): BookingSteps {
  const status = String(f.status || '');
  const base = { order: 'new' as const, canIssueMoveIn: false, missingForMoveIn: [] as string[] };

  if (ACTIVE_STATUSES.includes(status)) {
    return { ...base, phase: 'active', current: null, items: list(null, 7), next: null };
  }
  if (CLOSED_STATUSES.includes(status)) {
    return { ...base, phase: 'closed', current: null, items: list(null, 0), next: null };
  }
  if (status === 'PendingFirstBill' && !f.move_in_bill_id) {
    return { ...base, phase: 'legacy', current: null, items: list(null, 0), next: { who: 'owner', text: 'สัญญาแบบเดิม — หอพักจัดการด้วยมือ' } };
  }
  if (status === 'BookingRequested') {
    return { ...base, phase: 'step', current: 1, items: list(1, 0), next: nextFor(1, f) };
  }
  if (status === 'BookingApproved') {
    return { ...base, phase: 'step', current: 2, items: list(2, 1), next: nextFor(2, f) };
  }

  const insp = f.inspection_status || 'none';
  const acknowledged = insp === 'acknowledged';
  const paper = Boolean(f.paper_uploaded);

  if (BOOKING_PAID_STATUSES.includes(status)) {
    const confirmed = dataConfirmed(f);
    const missing = missingForMoveIn(f);
    const current: StepNo = !confirmed ? 3 : !acknowledged ? 4 : !paper ? 5 : 6;
    const notes: Partial<Record<StepNo, string>> = {};
    if (confirmed && !f.data_confirmed_at) notes[3] = 'ตามขั้นตอนเดิม (อัปโหลดสัญญาที่ลงนามแล้ว)';
    if (current === 4 && insp === 'pending_ack') notes[4] = 'บันทึกผลตรวจแล้ว รอผู้เช่ารับทราบ';
    if (current === 6) notes[6] = 'พร้อมออกบิล';
    // Steps are done in order, except an older contract may already have its signed paper (step 5) before step 4
    const items = list(current, 2, notes, { 3: confirmed, 4: acknowledged, 5: paper, 6: false, 7: false });
    return {
      phase: 'step', current, order: 'new', items, next: nextFor(current, f),
      canIssueMoveIn: missing.length === 0, missingForMoveIn: missing,
    };
  }

  if (status === 'PendingFirstBill') {
    const billPaid = isPaid(f.move_in_bill_status);
    if (f.data_confirmed_at) {
      // New order: everything before the bill was required to issue it
      const items = list(7, 6, { 7: billPaid ? 'ชำระแล้ว กำลังเปิดใช้สัญญา' : '' }, { 7: false });
      return { ...base, phase: 'step', current: 7, items, next: nextFor(7, f) };
    }
    // Old order: the bill was issued before step 3 existed. Takes effect when the bill is paid and the paper uploaded;
    // the inspection is not required for it (shown as recommended).
    const current: StepNo = !paper ? 5 : 7;
    const notes: Partial<Record<StepNo, string>> = { 3: 'ตามขั้นตอนเดิม', 6: 'ออกบิลตามขั้นตอนเดิม' };
    if (!acknowledged) notes[4] = insp === 'pending_ack' ? 'ไม่บังคับ (ขั้นตอนเดิม) · รอผู้เช่ารับทราบ' : 'ไม่บังคับ (ขั้นตอนเดิม) · แนะนำให้ตรวจห้อง';
    if (!paper) notes[7] = billPaid ? 'ชำระแล้ว · รออัปโหลดสัญญาที่ลงนาม' : 'ชำระได้แล้ว · สัญญามีผลเมื่อชำระครบและอัปโหลดสัญญาที่ลงนาม';
    const items = list(current, 2, notes, { 3: true, 4: acknowledged, 5: paper, 6: true, 7: false });
    const next = !paper
      ? { who: 'owner' as StepWho, text: billPaid ? 'หอพักอัปโหลดสัญญาที่ลงนาม — สัญญามีผลทันที' : 'หอพักอัปโหลดสัญญาที่ลงนาม และผู้จองชำระบิลค่าแรกเข้า' }
      : nextFor(7, f);
    return { ...base, phase: 'step', current, order: 'old', items, next };
  }

  // A status this flow does not know: show nothing as done
  return { ...base, phase: 'closed', current: null, items: list(null, 0), next: null };
}

/** "ขั้น 4/7 · ตรวจห้อง" style label for badges. */
export function stepLabel(s: BookingSteps): string {
  if (s.phase === 'active') return 'สัญญามีผลแล้ว';
  if (s.phase === 'closed') return 'ยกเลิก / สิ้นสุด';
  if (s.phase === 'legacy') return 'สัญญาแบบเดิม';
  return `ขั้น ${s.current}/7 · ${STEP_SHORT[s.current as StepNo]}`;
}
