// Room inspection photos show the inside of a tenant's room, so they are stored outside public/ (storage/inspections)
// and only served through /api/contracts/[id]/inspection-photo/[file] to owners/managers and the contract's own tenant.
// contract_inspection_items.photo_file holds the random file name only.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
/** All new photos in one save together */
export const PHOTOS_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg)$/;
const CONTENT_TYPES: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg' };

function storageDir() {
  return path.join(process.cwd(), 'storage', 'inspections');
}

/** File type from the bytes themselves (the MIME type sent by the browser is not trusted). */
function detectType(bytes: Buffer): 'png' | 'jpg' | null {
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

export type PhotoUpload = { ok: true; bytes: Buffer; ext: 'png' | 'jpg' } | { ok: false; tooLarge: boolean; message: string };

/** Check an uploaded data URL: JPG or PNG by content, at most 10MB. */
export function parsePhotoUpload(dataUrl: unknown): PhotoUpload {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { ok: false, tooLarge: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.slice(0, comma).includes(';base64')) return { ok: false, tooLarge: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
  // Refuse before decoding when the text alone is already too long for 10MB
  if (base64.length > Math.ceil(PHOTO_MAX_BYTES / 3) * 4 + 4) return { ok: false, tooLarge: true, message: 'รูปต้องมีขนาดไม่เกิน 10MB' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { ok: false, tooLarge: false, message: 'ไฟล์รูปว่างเปล่า' };
  if (bytes.length > PHOTO_MAX_BYTES) return { ok: false, tooLarge: true, message: 'รูปต้องมีขนาดไม่เกิน 10MB' };
  const ext = detectType(bytes);
  if (!ext) return { ok: false, tooLarge: false, message: 'รองรับเฉพาะรูป JPG หรือ PNG' };
  return { ok: true, bytes, ext };
}

/** Write the photo under a random name; returns the name stored in photo_file. */
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

/** Remove a stored photo (replaced, removed with its item, or saved for a refused update). */
export function deletePhoto(name: unknown) {
  if (!isPhotoName(name)) return;
  try {
    fs.unlinkSync(path.join(storageDir(), name));
  } catch {
    // already gone
  }
}

/** Read a stored photo for the photo route. */
export function readPhoto(name: unknown): { bytes: Buffer; contentType: string } | null {
  if (!isPhotoName(name)) return null;
  try {
    const bytes = fs.readFileSync(path.join(storageDir(), name));
    return { bytes, contentType: CONTENT_TYPES[name.split('.').pop() as string] };
  } catch {
    return null;
  }
}

export function photoUrl(contractId: number, name: string | null | undefined): string | null {
  return isPhotoName(name) ? `/api/contracts/${contractId}/inspection-photo/${name}` : null;
}
