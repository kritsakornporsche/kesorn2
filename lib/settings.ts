// Dorm settings (commit 15): dormitory_profile is the one place for rates and payment details.
// Only the owner changes them (app/api/owner/settings); managers read them without the OCR key.
// A save writes only the fields it was given, checks every value first (nothing is written when one is wrong) and
// records each changed rate / payment field in rate_changes. Changing the electricity, water or common rate re-prices
// draft monthly bills in the same transaction; sent and paid bills keep their amounts and their late fee per day
// (bills.late_fee_rate, saved when sent).

import { withTransaction, type Client } from '@/lib/bill-status';
import { getDb } from '@/lib/db';
import { repriceDraft } from '@/lib/meters';
import { FIELD_LABELS, PAYMENT_FIELDS, RATE_FIELDS, RATE_LIMITS, type PaymentField, type RateField } from '@/lib/settings-fields';

const PROFILE_TEXT = ['name', 'address', 'phone', 'description', 'facilities', 'map_url', 'cover_image'] as const;
const PROFILE_FLAGS = ['has_wifi', 'has_parking', 'pet_friendly', 'has_lan', 'has_air_con'] as const;
// Rates that are part of a monthly bill's amount (late fee and cleaning fee are not)
const BILL_RATES: RateField[] = ['electricity_rate', 'water_rate', 'common_fee'];
const MAX_TEXT = 255;

const round2 = (n: number) => Math.round(n * 100) / 100;
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k) && o[k] !== undefined;
const digits = (v: unknown) => String(v ?? '').replace(/[\s-]/g, '');

export type SettingsChange = { field: RateField | PaymentField; old: string | null; new: string | null };
export type SettingsResult =
  | { ok: true; changed: SettingsChange[]; draftsRepriced: number; draftsSkipped: number }
  | { ok: false; reason: 'invalid'; errors: string[] };

/** Check and normalise the given fields. Returns the column values to write, or the error messages. */
export function validateSettings(patch: Record<string, unknown>) {
  const values: Record<string, string | number | null> = {};
  const errors: string[] = [];

  for (const f of RATE_FIELDS) {
    if (!has(patch, f)) continue;
    const raw = patch[f];
    const n = Number(raw);
    const { min, max, aboveZero } = RATE_LIMITS[f];
    if (raw === null || String(raw).trim() === '' || !Number.isFinite(n)) errors.push(`${FIELD_LABELS[f]}: ต้องเป็นตัวเลข`);
    else if (aboveZero ? n <= 0 : n < min) errors.push(`${FIELD_LABELS[f]}: ต้อง${aboveZero ? 'มากกว่า 0' : `ไม่ต่ำกว่า ${min}`}`);
    else if (n > max) errors.push(`${FIELD_LABELS[f]}: ต้องไม่เกิน ${max.toLocaleString('th-TH')} บาท`);
    else values[f] = round2(n);
  }

  if (has(patch, 'promptpay_number')) {
    const v = digits(patch.promptpay_number);
    if (v && !/^0\d{9}$/.test(v) && !/^\d{13}$/.test(v)) errors.push(`${FIELD_LABELS.promptpay_number}: เบอร์มือถือ 10 หลัก หรือเลขประจำตัว 13 หลัก`);
    else values.promptpay_number = v || null;
  }
  if (has(patch, 'tax_id')) {
    const v = digits(patch.tax_id);
    if (v && !/^\d{13}$/.test(v)) errors.push(`${FIELD_LABELS.tax_id}: ตัวเลข 13 หลัก`);
    else values.tax_id = v || null;
  }
  if (has(patch, 'bank_account')) {
    const v = String(patch.bank_account ?? '').trim();
    const n = digits(v).length;
    if (v && (!/^[0-9\s-]+$/.test(v) || n < 10 || n > 15)) errors.push(`${FIELD_LABELS.bank_account}: ตัวเลข 10–15 หลัก (ใส่ขีดได้)`);
    else values.bank_account = v || null;
  }
  for (const f of ['promptpay_name', 'bank_name', 'bank_account_name'] as const) {
    if (!has(patch, f)) continue;
    const v = String(patch[f] ?? '').trim();
    if (v.length > MAX_TEXT) errors.push(`${FIELD_LABELS[f]}: ยาวเกิน ${MAX_TEXT} ตัวอักษร`);
    else values[f] = v || null;
  }

  for (const f of PROFILE_TEXT) {
    if (!has(patch, f)) continue;
    const v = String(patch[f] ?? '').trim();
    if (f === 'name' && !v) errors.push('ชื่อหอพัก: ห้ามว่าง');
    else if (f === 'name' && v.length > MAX_TEXT) errors.push(`ชื่อหอพัก: ยาวเกิน ${MAX_TEXT} ตัวอักษร`);
    else if (f === 'phone' && v.length > 50) errors.push('เบอร์โทรศัพท์: ยาวเกิน 50 ตัวอักษร');
    else values[f] = v;
  }
  for (const f of PROFILE_FLAGS) if (has(patch, f)) values[f] = patch[f] ? 1 : 0;
  // OCR key: an empty value keeps the saved key (as before); the provider is kept when not given
  if (has(patch, 'ocr_api_key') && String(patch.ocr_api_key).trim()) values.ocr_api_key = String(patch.ocr_api_key).trim();
  if (has(patch, 'ocr_provider') && String(patch.ocr_provider).trim()) values.ocr_provider = String(patch.ocr_provider).trim();

  return { values, errors };
}

const asText = (f: string, v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  return (RATE_FIELDS as readonly string[]).includes(f) ? round2(Number(v)).toFixed(2) : String(v);
};

/**
 * Save dorm settings (owner). Only the given fields are written. Rate / payment changes are recorded with who and when;
 * draft monthly bills are re-priced when a bill rate changed.
 */
export async function updateSettings(patch: Record<string, unknown>, by: number | null, now: Date): Promise<SettingsResult> {
  const { values, errors } = validateSettings(patch || {});
  if (errors.length > 0) return { ok: false, reason: 'invalid', errors };

  return withTransaction(async (client: Client) => {
    let row = (await client.query('SELECT * FROM dormitory_profile ORDER BY id LIMIT 1 FOR UPDATE', [])).rows[0];
    if (!row) {
      await client.query("INSERT INTO dormitory_profile (name) VALUES (?)", [String(values.name || '')]);
      row = (await client.query('SELECT * FROM dormitory_profile ORDER BY id LIMIT 1 FOR UPDATE', [])).rows[0];
    }

    const changed: SettingsChange[] = [];
    for (const f of [...RATE_FIELDS, ...PAYMENT_FIELDS]) {
      if (!(f in values)) continue;
      const before = asText(f, row[f]);
      const after = asText(f, values[f]);
      if (before !== after) changed.push({ field: f, old: before, new: after });
    }

    const cols = Object.keys(values);
    if (cols.length > 0) {
      // Column names come from the fixed lists above, never from the request
      await client.query(
        `UPDATE dormitory_profile SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
        [...cols.map((c) => values[c]), row.id]
      );
    }
    for (const c of changed) {
      await client.query(
        'INSERT INTO rate_changes (field, old_value, new_value, changed_by, changed_at) VALUES (?, ?, ?, ?, ?)',
        [c.field, c.old, c.new, by, now]
      );
    }

    let draftsRepriced = 0;
    let draftsSkipped = 0;
    if (changed.some((c) => (BILL_RATES as string[]).includes(c.field))) {
      const drafts = (await client.query(
        `SELECT id, room_number, billing_cycle FROM bills
         WHERE LOWER(status) = 'draft' AND COALESCE(bill_type, 'monthly') = 'monthly' AND COALESCE(is_first_bill, 0) = 0
         ORDER BY id FOR UPDATE`,
        []
      )).rows;
      for (const d of drafts) {
        if (d.room_number && d.billing_cycle && await repriceDraft(client, Number(d.id), String(d.room_number), String(d.billing_cycle), now)) draftsRepriced++;
        else draftsSkipped++;
      }
    }
    return { ok: true as const, changed, draftsRepriced, draftsSkipped };
  });
}

/** The settings row for the page. Managers do not get the OCR key. null when the dorm has none yet. */
export async function getSettings(role: string) {
  const sql = getDb();
  const rows = await sql`SELECT * FROM dormitory_profile ORDER BY id LIMIT 1`;
  if (rows.length === 0) return null;
  const row = { ...rows[0] };
  if (role !== 'owner') delete row.ocr_api_key;
  return row;
}

/** Latest 50 rate / payment changes with who made them. */
export async function rateHistory() {
  const sql = getDb();
  return sql`
    SELECT rc.id, rc.field, rc.old_value, rc.new_value, rc.changed_at, rc.changed_by, u.name AS changed_by_name
    FROM rate_changes rc LEFT JOIN users u ON u.id = rc.changed_by
    ORDER BY rc.id DESC LIMIT 50
  `;
}
