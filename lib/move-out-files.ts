// Deposit refund slips show the tenant's bank details, so they are stored outside public/ (storage/move-out) and only
// served through /api/move-out/[id]/refund-file to owners/managers and the contract's own tenant.
// move_out_settlements.refund_file holds the random file name only.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const REFUND_FILE_MAX_BYTES = 10 * 1024 * 1024;
const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/;
const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };

function storageDir() {
  return path.join(process.cwd(), 'storage', 'move-out');
}

/** File type from the bytes themselves (the MIME type sent by the browser is not trusted). */
function detectType(bytes: Buffer): 'pdf' | 'png' | 'jpg' | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

export type RefundUpload = { ok: true; bytes: Buffer; ext: 'pdf' | 'png' | 'jpg' } | { ok: false; message: string };

/** Check an uploaded data URL: JPG, PNG or PDF by content, at most 10MB. */
export function parseRefundUpload(dataUrl: unknown): RefundUpload {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { ok: false, message: 'กรุณาแนบสลิปการโอนคืนเงินประกัน (JPG, PNG หรือ PDF)' };
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.slice(0, comma).includes(';base64')) return { ok: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
  // Refuse before decoding when the text alone is already too long for 10MB
  if (base64.length > Math.ceil(REFUND_FILE_MAX_BYTES / 3) * 4 + 4) return { ok: false, message: 'ไฟล์ต้องมีขนาดไม่เกิน 10MB' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { ok: false, message: 'ไฟล์ว่างเปล่า' };
  if (bytes.length > REFUND_FILE_MAX_BYTES) return { ok: false, message: 'ไฟล์ต้องมีขนาดไม่เกิน 10MB' };
  const ext = detectType(bytes);
  if (!ext) return { ok: false, message: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF' };
  return { ok: true, bytes, ext };
}

/** Write the file under a random name; returns the name stored in refund_file. */
export function saveRefundFile(upload: { bytes: Buffer; ext: string }): string {
  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${upload.ext}`;
  fs.writeFileSync(path.join(dir, name), upload.bytes, { flag: 'wx' });
  return name;
}

export function isRefundFileName(value: unknown): value is string {
  return typeof value === 'string' && NAME_PATTERN.test(value);
}

/** Remove a stored file (saved for a refused update). */
export function deleteRefundFile(name: unknown) {
  if (!isRefundFileName(name)) return;
  try {
    fs.unlinkSync(path.join(storageDir(), name));
  } catch {
    // already gone
  }
}

/** Read a stored file for the refund-file route. */
export function readRefundFile(name: unknown): { bytes: Buffer; contentType: string; ext: string } | null {
  if (!isRefundFileName(name)) return null;
  try {
    const bytes = fs.readFileSync(path.join(storageDir(), name));
    const ext = name.split('.').pop() as string;
    return { bytes, contentType: CONTENT_TYPES[ext], ext };
  } catch {
    return null;
  }
}
