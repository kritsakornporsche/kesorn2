// Room types as shown on every page (commit 25). The database keeps its values (Standard / Deluxe) — display only:
// Standard = ห้องพัดลม (fan room), Deluxe = ห้องแอร์ (air-conditioned room). Any other value is shown as stored.

export const ROOM_TYPES = [
  { value: 'Standard', label: 'ห้องพัดลม' },
  { value: 'Deluxe', label: 'ห้องแอร์' },
] as const;

const LABELS: Record<string, string> = { standard: 'ห้องพัดลม', deluxe: 'ห้องแอร์' };

/** Thai label of a stored room type; `fallback` when there is none. */
export function roomTypeLabel(type: string | null | undefined, fallback = 'ห้องพัก'): string {
  const t = String(type ?? '').trim();
  if (!t) return fallback;
  // a note in brackets after the type (e.g. "Standard (Test Room)" of T01) does not change the type
  return LABELS[t.toLowerCase()] ?? LABELS[t.toLowerCase().replace(/\s*\(.*\)\s*$/, '')] ?? t;
}

/** Air-conditioned room: Deluxe, or a type that already says air / แอร์. */
export function isAirconType(type: string | null | undefined): boolean {
  const t = String(type ?? '').trim().toLowerCase();
  return t === 'deluxe' || t.includes('air') || t.includes('แอร์');
}
