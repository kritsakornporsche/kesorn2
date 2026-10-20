// The signed paper contract as the pages show it (commit 28a) — client-safe; lib/contract-files decides the state on
// the server (signedPaperOf). Only 'uploaded' is shown as the signed copy; the system-made form is never shown instead.
export type SignedPaper = 'uploaded' | 'missing' | 'none';

export const SIGNED_PAPER_TEXT: Record<Exclude<SignedPaper, 'uploaded'>, string> = {
  none: 'ยังไม่ได้อัปโหลดสัญญาที่ลงนาม',
  missing: 'ไม่พบไฟล์สัญญา',
};

/** Asked before a signed paper is saved (step 5, commit 28-3) — the server needs confirm: true. */
export const PAPER_CONFIRM_TEXT =
  'ยืนยันว่าไฟล์นี้คือสัญญาที่ผู้เช่าและผู้ให้เช่าลงนามแล้ว (รวมใบตรวจสภาพห้องที่ผู้เช่าลงชื่อ)?\nหลังบันทึก ข้อมูลสัญญาจะแก้ไม่ได้อีก';

/** Text for a contract without a signed copy to show ('none' when the state is not given). */
export const signedPaperText = (s: SignedPaper | null | undefined) => SIGNED_PAPER_TEXT[s === 'missing' ? 'missing' : 'none'];
