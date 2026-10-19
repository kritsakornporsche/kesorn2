// Occupants of a room (commit 27). Confirmed with the dorm: at most 2 people per room, the contract has one tenant who
// represents the room, and nothing is kept about the other occupant (no name or details). The number decides the water
// charge (water per person × occupants, lib/billing calcUtility). Every page and API reads the limit from here.

export const MIN_OCCUPANTS = 1;
export const MAX_OCCUPANTS = 2;

export const OCCUPANTS_MESSAGE = `จำนวนผู้พักต้องเป็น ${MIN_OCCUPANTS}–${MAX_OCCUPANTS} คน`;

/** The allowed choices, for selects */
export const OCCUPANT_CHOICES: number[] = Array.from({ length: MAX_OCCUPANTS - MIN_OCCUPANTS + 1 }, (_, i) => MIN_OCCUPANTS + i);

/**
 * Occupants from a request. Left out (undefined / null / '') → `fallback` (1 unless given); otherwise a whole number in
 * MIN_OCCUPANTS..MAX_OCCUPANTS, else not ok (the API answers 400 with OCCUPANTS_MESSAGE).
 */
export function parseOccupants(value: unknown, fallback: number = MIN_OCCUPANTS): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined || value === null || value === '') return { ok: true, value: fallback };
  const n = Number(value);
  if (!Number.isInteger(n) || n < MIN_OCCUPANTS || n > MAX_OCCUPANTS) return { ok: false, message: OCCUPANTS_MESSAGE };
  return { ok: true, value: n };
}
