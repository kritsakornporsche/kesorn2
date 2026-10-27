// Booking → tenant in 4 steps (combining room inspection, contract confirmation, signing & move-in bill into step 3).
//
//  1 ขอจอง → หอพักอนุมัติ          BookingRequested → BookingApproved
//  2 ชำระค่าจอง (10 นาที)          BookingApproved → PendingOwnerSignature
//  3 ตรวจรับห้อง ทำสัญญา & ออกบิล   data confirmation, inspection, signed paper, move-in bill
//  4 ชำระบิลค่าแรกเข้า → สัญญามีผล   PendingFirstBill → Active, the booker becomes a tenant

export type StepNo = 1 | 2 | 3 | 4;
export type StepWho = 'booker' | 'owner' | 'both';
export type StepState = 'done' | 'current' | 'todo';
/** step = in steps 1–4 · active = the contract is in effect · closed = cancelled / rejected / expired / ended · legacy = an older contract handled by hand */
export type StepPhase = 'step' | 'active' | 'closed' | 'legacy';
export type InspectionState = 'none' | 'pending_ack' | 'acknowledged';

export const STEP_TITLES: Record<StepNo, string> = {
  1: 'ขอจอง → หอพักอนุมัติ',
  2: 'ชำระค่าจอง',
  3: 'ตรวจรับห้อง ทำสัญญา & ออกบิล',
  4: 'ชำระบิลค่าแรกเข้า → สัญญามีผล',
};
export const STEP_SHORT: Record<StepNo, string> = {
  1: 'ขอจอง',
  2: 'ชำระค่าจอง',
  3: 'ตรวจรับ & สัญญา',
  4: 'ชำระแรกเข้า',
};
export const STEP_WHO: Record<StepNo, StepWho> = {
  1: 'both',
  2: 'booker',
  3: 'both',
  4: 'booker',
};
export const WHO_TEXT: Record<StepWho, string> = {
  booker: 'ผู้จอง',
  owner: 'หอพัก',
  both: 'ผู้จอง + หอพัก',
};

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
  /** the step to do now (null outside steps 1–4) */
  current: StepNo | null;
  /** 'old' = the move-in bill was issued before step 3 existed (old activation rule) */
  order: 'new' | 'old';
  items: StepItem[];
  /** who does the next thing and what (null when nothing is left) */
  next: { who: StepWho; text: string } | null;
  /** step 3 ready to issue move-in: data confirmed, inspection acknowledged, signed paper uploaded, no move-in bill yet */
  canIssueMoveIn: boolean;
  /** what still stops the move-in bill (Thai, for the page and the server's 409) */
  missingForMoveIn: string[];
}

const NEXT_TEXT: Record<StepNo, string> = {
  1: 'หอพักอนุมัติหรือปฏิเสธคำขอจอง',
  2: 'ผู้จองชำระค่าจองและอัปโหลดสลิปภายในเวลาที่กำหนด',
  3: 'ตรวจรับสภาพห้อง ตรวจสอบยืนยันข้อมูลสัญญา ลงนาม และออกบิลค่าแรกเข้า',
  4: 'ผู้จองชำระบิลค่าแรกเข้า — สัญญามีผลทันทีที่ชำระครบ',
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

/** Step 3 counts as confirmed when confirmed, or when an older contract already has its signed paper (old order). */
export function dataConfirmed(f: StepFacts): boolean {
  return Boolean(f.data_confirmed_at) || Boolean(f.paper_uploaded);
}

/** What still stops the move-in bill (in step 3) — the server checks the same list on the locked row. */
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
  return ([1, 2, 3, 4] as StepNo[]).map((no) => {
    const isDone = done[no] ?? no <= doneUpTo;
    const state: StepState = isDone ? 'done' : no === current ? 'current' : 'todo';
    return { no, title: STEP_TITLES[no], who: STEP_WHO[no], state, ...(notes[no] ? { note: notes[no] } : {}) };
  });
}

function nextFor(step: StepNo, f: StepFacts): { who: StepWho; text: string } {
  if (step === 3) {
    const confirmed = dataConfirmed(f);
    const insp = f.inspection_status || 'none';
    if (!confirmed && insp === 'none') {
      return { who: 'both', text: 'หอพักและผู้เช่าตรวจรับสภาพห้อง และตรวจสอบยืนยันข้อมูลสัญญา' };
    }
    if (!confirmed) {
      return { who: 'owner', text: 'หอพักตรวจสอบและยืนยันข้อมูลสัญญา' };
    }
    if (insp === 'none') {
      return { who: 'owner', text: 'หอพักตรวจสภาพห้องร่วมกับผู้เช่าและบันทึกผล' };
    }
    if (insp === 'pending_ack') {
      return { who: 'booker', text: 'ผู้เช่ากดรับทราบผลตรวจห้อง (หรือหอพักบันทึกว่าผู้เช่ารับทราบบนกระดาษ)' };
    }
    if (!f.paper_uploaded) {
      return { who: 'owner', text: 'หอพักลงนามสัญญาและอัปโหลดสัญญา' };
    }
    if (!f.move_in_bill_id) {
      return { who: 'owner', text: 'หอพักบันทึกมิเตอร์เริ่มต้นและออกบิลค่าแรกเข้า' };
    }
  }
  const who = STEP_WHO[step];
  return { who: who === 'both' ? 'owner' : who, text: NEXT_TEXT[step] };
}

/** Where a booking/contract is in steps 1–4, with the checklist and the next thing to do. */
export function stepOf(f: StepFacts): BookingSteps {
  const status = String(f.status || '');
  const base = { order: 'new' as const, canIssueMoveIn: false, missingForMoveIn: [] as string[] };

  if (ACTIVE_STATUSES.includes(status)) {
    return { ...base, phase: 'active', current: null, items: list(null, 4), next: null };
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
    const current: StepNo = 3;
    const notes: Partial<Record<StepNo, string>> = {};
    if (!confirmed && !acknowledged && !paper) {
      notes[3] = 'รอยืนยันข้อมูล ตรวจห้อง และแนบสัญญา';
    } else if (!confirmed) {
      notes[3] = 'ตรวจห้องแล้ว ✓ · รอยืนยันข้อมูลสัญญา';
    } else if (!acknowledged) {
      notes[3] = insp === 'pending_ack' ? 'บันทึกผลตรวจแล้ว · รอผู้เช่ารับทราบ' : 'ยืนยันข้อมูลแล้ว ✓ · รอตรวจห้อง';
    } else if (!paper) {
      notes[3] = 'ตรวจรับห้องแล้ว ✓ · รอลงนามและแนบสัญญา';
    } else if (!f.move_in_bill_id) {
      notes[3] = 'แนบสัญญาแล้ว ✓ · พร้อมออกบิลค่าแรกเข้า';
    }
    const items = list(current, 2, notes, { 3: false, 4: false });
    return {
      phase: 'step', current, order: 'new', items, next: nextFor(current, f),
      canIssueMoveIn: missing.length === 0, missingForMoveIn: missing,
    };
  }

  if (status === 'PendingFirstBill') {
    const billPaid = isPaid(f.move_in_bill_status);
    if (f.data_confirmed_at) {
      // New order: everything in step 3 was completed before issuing the bill
      const items = list(4, 3, { 4: billPaid ? 'ชำระแล้ว กำลังเปิดใช้สัญญา' : 'รอชำระบิลค่าแรกเข้า' }, { 3: true, 4: false });
      return { ...base, phase: 'step', current: 4, items, next: nextFor(4, f) };
    }
    // Old order:
    const notes: Partial<Record<StepNo, string>> = { 3: 'ตามขั้นตอนเดิม' };
    if (!paper) notes[4] = billPaid ? 'ชำระแล้ว · รออัปโหลดสัญญาที่ลงนาม' : 'ชำระได้แล้ว · สัญญามีผลเมื่อชำระครบและอัปโหลดสัญญาที่ลงนาม';
    const items = list(4, 2, notes, { 3: true, 4: false });
    const next = !paper
      ? { who: 'owner' as StepWho, text: billPaid ? 'หอพักอัปโหลดสัญญาที่ลงนาม — สัญญามีผลทันที' : 'หอพักอัปโหลดสัญญาที่ลงนาม และผู้จองชำระบิลค่าแรกเข้า' }
      : nextFor(4, f);
    return { ...base, phase: 'step', current: 4, order: 'old', items, next };
  }

  // A status this flow does not know: show nothing as done
  return { ...base, phase: 'closed', current: null, items: list(null, 0), next: null };
}

/** "ขั้น 3/4 · ตรวจรับ & สัญญา" style label for badges. */
export function stepLabel(s: BookingSteps): string {
  if (s.phase === 'active') return 'สัญญามีผลแล้ว';
  if (s.phase === 'closed') return 'ยกเลิก / สิ้นสุด';
  if (s.phase === 'legacy') return 'สัญญาแบบเดิม';
  return `ขั้น ${s.current}/4 · ${STEP_SHORT[s.current as StepNo]}`;
}
