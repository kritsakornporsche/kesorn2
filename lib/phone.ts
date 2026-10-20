// Phone numbers (commit 28a): digits only, 9–10 digits (Thai mobile 10, landline 9). The page keeps only digits while
// typing (phoneDigits) and every API that takes a phone checks it with parsePhone (400 when wrong). Spaces and dashes
// from older values are dropped; any other character is refused.

export const PHONE_MIN = 9;
export const PHONE_MAX = 10;
export const PHONE_MESSAGE = `เบอร์โทรต้องเป็นตัวเลข ${PHONE_MIN}–${PHONE_MAX} หลัก`;

/** For an input's onChange: digits only, at most PHONE_MAX. */
export const phoneDigits = (value: string | null | undefined) => String(value ?? '').replace(/\D/g, '').slice(0, PHONE_MAX);

/** Props for a phone <input>: numeric keyboard on phones, at most PHONE_MAX characters. */
export const PHONE_INPUT_PROPS = { type: 'tel', inputMode: 'numeric' as const, maxLength: PHONE_MAX, autoComplete: 'tel', pattern: `[0-9]{${PHONE_MIN},${PHONE_MAX}}` };

/**
 * A phone from a request. Empty → null when not required (else not ok). Otherwise only digits (spaces / dashes are
 * dropped), PHONE_MIN–PHONE_MAX of them.
 */
export function parsePhone(value: unknown, required = false): { ok: true; value: string | null } | { ok: false; message: string } {
  const raw = value === undefined || value === null ? '' : String(value).trim();
  if (!raw) return required ? { ok: false, message: `กรุณากรอกเบอร์โทร (ตัวเลข ${PHONE_MIN}–${PHONE_MAX} หลัก)` } : { ok: true, value: null };
  if (!/^[0-9\s-]+$/.test(raw)) return { ok: false, message: PHONE_MESSAGE };
  const digits = raw.replace(/\D/g, '');
  if (digits.length < PHONE_MIN || digits.length > PHONE_MAX) return { ok: false, message: PHONE_MESSAGE };
  return { ok: true, value: digits };
}

