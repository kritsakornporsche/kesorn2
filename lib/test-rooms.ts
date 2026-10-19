// Test rooms (commit 26c): T01 (rooms.id 21) is a working test room with tiny demo prices for trying real payments
// (lib/billing.ts). It stays usable, but the dorm must look like it has its 20 real rooms everywhere:
//  - public pages (NODE_ENV=production): T01 is left out of the room lists and the "ห้องว่าง" counts; its room page
//    still opens from a direct link (/explore/room/21) and can be booked as usual (the owner approves bookings), with a
//    "ห้องทดสอบระบบ" badge
//  - owner numbers (every environment): reports and dashboard figures leave T01 out; rows of T01 (ledger, bills,
//    contracts, rooms) are still shown, with a "ทดสอบ" badge
// Every check goes through isTestRoom() here.

export const TEST_ROOM_NUMBERS = ['T01', 'TC01'];

/** Whether a room number is a test room. */
export function isTestRoom(roomNumber: string | null | undefined): boolean {
  return TEST_ROOM_NUMBERS.includes(String(roomNumber ?? '').trim().toUpperCase());
}

/** Public room lists leave test rooms out (production only; read at call time, so tests can switch it). */
export function testRoomsHidden(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** A test room to leave out of a public room list / count right now. */
export function isHiddenTestRoom(roomNumber: string | null | undefined): boolean {
  return testRoomsHidden() && isTestRoom(roomNumber);
}

/** Demo prices apply to test rooms (every environment — the one place is lib/billing.ts). */
export function demoPricing(roomNumber: string | null | undefined): boolean {
  return isTestRoom(roomNumber);
}

// ── SQL for owner figures (every environment) ─────────────────────────────────────────────────────────────────────
// The list is code constants (letters / digits only), so it is written into the SQL text; column / alias names passed
// in are code constants too, never user input.
const SQL_LIST = `(${TEST_ROOM_NUMBERS.map((n) => {
  if (!/^[A-Z0-9]+$/.test(n)) throw new Error('bad test room number');
  return `'${n}'`;
}).join(', ')})`;

/** SQL condition: the room-number column is not a test room (NULL counts as a real room). */
export function notTestRoomSql(column: string): string {
  return `UPPER(COALESCE(${column}, '')) NOT IN ${SQL_LIST}`;
}

/**
 * SQL condition: an accounting_transactions row (alias `a`) belongs to a test room. The table has no room column, so
 * the room comes from the reference: a payment / bill / forfeited booking fee → its bill's room; a move-out settlement
 * or an older move-out refund → its room. Rows typed in by hand (no reference) are not tied to a room → never test.
 */
export function testRoomAccountSql(a: string): string {
  return `(EXISTS (SELECT 1 FROM bill_payments tp JOIN bills tb ON tb.id = tp.bill_id
                    WHERE ${a}.reference_type IN ('bill_payment', 'bill_payment_reversal') AND tp.id = ${a}.reference_id
                      AND UPPER(tb.room_number) IN ${SQL_LIST})
        OR EXISTS (SELECT 1 FROM bills tb WHERE ${a}.reference_type IN ('bill', 'bill_reversal', 'booking_forfeit')
                      AND tb.id = ${a}.reference_id AND UPPER(tb.room_number) IN ${SQL_LIST})
        OR EXISTS (SELECT 1 FROM move_out_settlements ts JOIN rooms tr ON tr.id = ts.room_id
                    WHERE ${a}.reference_type LIKE 'settlement\\_%' AND ts.id = ${a}.reference_id
                      AND UPPER(tr.room_number) IN ${SQL_LIST})
        OR EXISTS (SELECT 1 FROM move_out_requests tm JOIN rooms tr ON tr.id = tm.room_id
                    WHERE ${a}.reference_type = 'move_out_refund' AND tm.id = ${a}.reference_id
                      AND UPPER(tr.room_number) IN ${SQL_LIST}))`;
}

/** Room pickers of owner / manager (commit 27b): the same list with test rooms moved to the end (order kept otherwise). */
export function testRoomsLast<T>(list: T[], roomNumberOf: (item: T) => string | null | undefined): T[] {
  return [...list.filter((x) => !isTestRoom(roomNumberOf(x))), ...list.filter((x) => isTestRoom(roomNumberOf(x)))];
}

/** Text after a room number in a <select> option, where a badge cannot be drawn: " (ทดสอบ)" for a test room. */
export const testRoomSuffix = (roomNumber: string | null | undefined) => (isTestRoom(roomNumber) ? ` (${TEST_ROOM_BADGE})` : '');

/** Badge texts */
export const TEST_ROOM_BADGE = 'ทดสอบ';
export const TEST_ROOM_PAGE_BADGE = 'ห้องทดสอบระบบ';
