// Browser-side preparation of a room inspection photo (the server checks again: lib/inspection-files.ts).
// The type comes from the file's first bytes, not its name. The photo is resized before sending (long side at most
// 1600px, JPEG quality 0.8) so a save with many photos stays under the 20MB limit.

export const PHOTO_MAX_BYTES = 10 * 1024 * 1024;
export const PHOTOS_TOTAL_MAX_BYTES = 20 * 1024 * 1024;
const MAX_SIDE = 1600;
const QUALITY = 0.8;

async function isJpgOrPng(file: File) {
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPng = b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  const isJpg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return isPng || isJpg;
}

function readAsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function resize(file: File): Promise<Blob | null> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY));
  } catch {
    return null;
  }
}

/** Bytes of a base64 data URL once decoded. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.floor((base64.length * 3) / 4) - (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);
}

/** A data URL ready to send, or the message to show. */
export async function preparePhoto(file: File): Promise<{ ok: true; dataUrl: string; bytes: number } | { ok: false; message: string }> {
  if (!file || file.size === 0) return { ok: false, message: 'ไฟล์รูปว่างเปล่า' };
  if (!(await isJpgOrPng(file))) return { ok: false, message: 'รองรับเฉพาะรูป JPG หรือ PNG' };
  // When the browser cannot resize, the original is sent as it is
  const blob = (await resize(file)) || file;
  if (blob.size > PHOTO_MAX_BYTES) return { ok: false, message: `รูปใหญ่เกิน 10MB (${(blob.size / 1024 / 1024).toFixed(1)}MB)` };
  const dataUrl = await readAsDataUrl(blob);
  return { ok: true, dataUrl, bytes: blob.size };
}
