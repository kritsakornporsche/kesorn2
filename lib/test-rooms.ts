// Test rooms (commit 26c): T01 is a demo room with tiny prices for trying real payments (lib/billing.ts). It is in the
// database that goes to the website, so in production (NODE_ENV=production) it is hidden from the public pages, its
// room page answers 404, booking requests for it are refused and the demo prices are off. The owner / manager pages
// still list it (it can be set to Maintenance there). In development everything works as before.

export const TEST_ROOM_NUMBERS = ['T01', 'TC01'];

/** Whether a room number is a test room. */
export function isTestRoom(roomNumber: string | null | undefined): boolean {
  return TEST_ROOM_NUMBERS.includes(String(roomNumber ?? '').trim().toUpperCase());
}

/** Test rooms are hidden / refused (read at call time, so tests can switch it). */
export function testRoomsHidden(): boolean {
  return process.env.NODE_ENV === 'production';
}

/** A test room that must not be shown or booked by the public right now. */
export function isHiddenTestRoom(roomNumber: string | null | undefined): boolean {
  return testRoomsHidden() && isTestRoom(roomNumber);
}

/** Demo prices apply: a test room, and not in production. */
export function demoPricing(roomNumber: string | null | undefined): boolean {
  return isTestRoom(roomNumber) && !testRoomsHidden();
}
