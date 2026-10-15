// Meter photos are the evidence for a tenant's electricity charge, so they are stored outside public/ (storage/meters)
// and only served through /api/meters/[id]/photo to owners/managers and the tenant billed for that room and cycle.
// meter_readings.photo_file holds the random file name only. Older readings keep their public/uploads/meters paths.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const METER_PHOTO_MAX_BYTES = 10 * 1024 * 1024;
const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/;
const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp' };

function storageDir() {
  return path.join(process.cwd(), 'storage', 'meters');
}

/** File type from the bytes themselves (the record page sends WebP; the MIME type from the browser is not trusted). */
function detectType(bytes: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString('latin1') === 'RIFF' && bytes.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

export type MeterPhoto = { ok: true; bytes: Buffer; ext: string } | { ok: false; message: string };

/** Check an uploaded data URL: JPG, PNG or WebP by content, at most 10MB. */
export function parseMeterPhoto(dataUrl: unknown): MeterPhoto {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { ok: false, message: 'รูปแบบไฟล์รูปมิเตอร์ไม่ถูกต้อง' };
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.slice(0, comma).includes(';base64')) return { ok: false, message: 'รูปแบบไฟล์รูปมิเตอร์ไม่ถูกต้อง' };
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
  if (base64.length > Math.ceil(METER_PHOTO_MAX_BYTES / 3) * 4 + 4) return { ok: false, message: 'รูปมิเตอร์ต้องมีขนาดไม่เกิน 10MB' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { ok: false, message: 'ไฟล์รูปมิเตอร์ว่างเปล่า' };
  const ext = detectType(bytes);
  if (!ext) return { ok: false, message: 'รูปมิเตอร์รองรับเฉพาะ JPG, PNG หรือ WebP' };
  return { ok: true, bytes, ext };
}

/** Write the photo under a random name; returns the name stored in meter_readings.photo_file. */
export function saveMeterPhoto(upload: { bytes: Buffer; ext: string }): string {
  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${upload.ext}`;
  fs.writeFileSync(path.join(dir, name), upload.bytes, { flag: 'wx' });
  return name;
}

export function isMeterPhotoName(value: unknown): value is string {
  return typeof value === 'string' && NAME_PATTERN.test(value);
}

export function deleteMeterPhoto(name: unknown) {
  if (!isMeterPhotoName(name)) return;
  try {
    fs.unlinkSync(path.join(storageDir(), name));
  } catch {
    // already gone
  }
}

export function readMeterPhoto(name: unknown): { bytes: Buffer; contentType: string } | null {
  if (!isMeterPhotoName(name)) return null;
  try {
    return { bytes: fs.readFileSync(path.join(storageDir(), name)), contentType: CONTENT_TYPES[name.split('.').pop() as string] };
  } catch {
    return null;
  }
}

export function meterPhotoUrl(readingId: number) {
  return `/api/meters/${readingId}/photo`;
}
