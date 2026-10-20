// Repair / cleaning photos show the inside of a tenant's room, so they are stored outside public/ (storage/maintenance)
// and only served through /api/maintenance/[id]/photo/[file] to owners/managers, the keeper of the job and the tenant
// who reported it. maintenance_photos.file holds the random file name only. Older jobs keep their public/uploads paths.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTOS_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
export const MAX_PHOTOS = 5;
const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;
const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' };

function storageDir() {
  return path.join(process.cwd(), 'storage', 'maintenance');
}

/** File type from the bytes themselves (the MIME type sent by the browser is not trusted). */
function detectType(bytes: Buffer): 'png' | 'jpg' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

export type PhotoUpload = { ok: true; bytes: Buffer; ext: 'png' | 'jpg' } | { ok: false; message: string };

/** Check an uploaded data URL: JPG or PNG by content, at most 10MB. */
export function parsePhotoUpload(dataUrl: unknown): PhotoUpload {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { ok: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.slice(0, comma).includes(';base64')) return { ok: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
  if (base64.length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 4) return { ok: false, message: 'รูปต้องมีขนาดไม่เกิน 10MB' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { ok: false, message: 'ไฟล์รูปว่างเปล่า' };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, message: 'รูปต้องมีขนาดไม่เกิน 10MB' };
  const ext = detectType(bytes);
  if (!ext) return { ok: false, message: 'รองรับเฉพาะรูป JPG หรือ PNG' };
  return { ok: true, bytes, ext };
}

/** Check a list of photos (at most 5, 20MB together); the message names the photo that is refused. */
export function parsePhotoList(list: unknown): { ok: true; uploads: { bytes: Buffer; ext: string }[] } | { ok: false; message: string } {
  if (list === undefined || list === null) return { ok: true, uploads: [] };
  if (!Array.isArray(list)) return { ok: false, message: 'รูปแบบรูปไม่ถูกต้อง' };
  if (list.length > MAX_PHOTOS) return { ok: false, message: `แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป` };
  const uploads: { bytes: Buffer; ext: string }[] = [];
  let total = 0;
  for (let i = 0; i < list.length; i++) {
    const parsed = parsePhotoUpload(list[i]);
    if (!parsed.ok) return { ok: false, message: `รูปที่ ${i + 1}: ${parsed.message}` };
    total += parsed.bytes.length;
    uploads.push(parsed);
  }
  if (total > PHOTOS_TOTAL_MAX_BYTES) return { ok: false, message: 'รูปรวมกันต้องไม่เกิน 20MB ต่อการส่งหนึ่งครั้ง' };
  return { ok: true, uploads };
}

/** Write the photo under a random name; returns the name stored in maintenance_photos.file. */
export function savePhoto(upload: { bytes: Buffer; ext: string }): string {
  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${upload.ext}`;
  fs.writeFileSync(path.join(dir, name), upload.bytes, { flag: 'wx' });
  return name;
}

export function isPhotoName(value: unknown): value is string {
  return typeof value === 'string' && NAME_PATTERN.test(value);
}

export function deletePhoto(name: unknown) {
  if (!isPhotoName(name)) return;
  try {
    fs.unlinkSync(path.join(storageDir(), name));
  } catch {
    // already gone
  }
}

export function readPhoto(name: unknown): { bytes: Buffer; contentType: string } | null {
  if (!isPhotoName(name)) return null;
  try {
    return { bytes: fs.readFileSync(path.join(storageDir(), name)), contentType: CONTENT_TYPES[name.split('.').pop() as string] };
  } catch {
    return null;
  }
}

export function photoUrl(requestId: number, name: string) {
  return `/api/maintenance/${requestId}/photo/${name}`;
}
