// Number fields of a room (rooms page + /api/rooms, /api/rooms/[id], /api/rooms/batch): none may be negative (commit 24).
// Pure — used by the page (red "ห้ามติดลบ" + save disabled) and by the API (400) so both apply the same rule.

export const NEGATIVE_TEXT = 'ห้ามติดลบ';

export const ROOM_NUMBER_FIELDS = { price: 'ค่าเช่า', deposit_amount: 'เงินประกัน', floor: 'ชั้น' } as const;

export const isNegative = (v: unknown) => v !== undefined && v !== null && v !== '' && Number(v) < 0;

/** The first number field of a room that is negative or not a number, with the reason; null when all are fine. */
export function badRoomNumber(room: Record<string, unknown> | null | undefined): { field: string; message: string } | null {
  for (const [field, label] of Object.entries(ROOM_NUMBER_FIELDS)) {
    const v = room?.[field];
    if (v === undefined || v === null || v === '') continue;
    if (!Number.isFinite(Number(v))) return { field, message: `${label}ต้องเป็นตัวเลข` };
    if (Number(v) < 0) return { field, message: `${label}${NEGATIVE_TEXT}` };
  }
  return null;
}

// ── Room status (commit 28a) ────────────────────────────────────────────────────────────────────────────────────────
// The owner sets only "ว่าง" (Available) or "ปิดปรับปรุง" (Maintenance). Occupied / Reserved / pending states come from
// contracts only — a room set to "มีผู้เช่า" by hand had no contract, left the walk-in list and could not get a contract.
export const MANUAL_ROOM_STATUSES = ['Available', 'Maintenance'] as const;
export const isManualRoomStatus = (s: unknown) => (MANUAL_ROOM_STATUSES as readonly string[]).includes(String(s ?? ''));
export const ROOM_STATUS_MESSAGE = 'ตั้งสถานะห้องเองได้เฉพาะ "ว่าง" หรือ "ปิดปรับปรุง" — "มีผู้เช่า" / "จองแล้ว" / "รออนุมัติ" ระบบตั้งจากสัญญาเท่านั้น';
export const ROOM_STATUS_LOCKED_MESSAGE = 'สถานะห้องนี้ระบบตั้งจากสัญญา แก้สถานะเองไม่ได้';

/**
 * The status a create / edit may save, or the reason it may not. `current` is the room's status on an edit (undefined
 * on a create). A room whose status comes from a contract keeps it; a free room may be Available or Maintenance only.
 */
export function roomStatusFor(next: unknown, current?: string | null): { ok: true; status: string } | { ok: false; message: string } {
  const wanted = next === undefined || next === null || next === '' ? (current ?? 'Available') : String(next);
  if (current !== undefined && current !== null && !isManualRoomStatus(current)) {
    return wanted === current ? { ok: true, status: current } : { ok: false, message: ROOM_STATUS_LOCKED_MESSAGE };
  }
  return isManualRoomStatus(wanted) ? { ok: true, status: wanted } : { ok: false, message: ROOM_STATUS_MESSAGE };
}
