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
