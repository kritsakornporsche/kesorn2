// Browser-side check of a signed paper contract file before upload (the server checks again: lib/contract-files.ts).
// The type comes from the file's first bytes, not its name or extension.

export const PAPER_FILE_MESSAGE = 'ไฟล์ต้องเป็นรูป JPG/PNG หรือ PDF ขนาดไม่เกิน 10MB';
const PAPER_MAX_BYTES = 10 * 1024 * 1024;

/** null when the file is a JPG, PNG or PDF of at most 10MB; otherwise the message to show. */
export async function checkPaperFile(file: File): Promise<string | null> {
  if (!file || file.size === 0 || file.size > PAPER_MAX_BYTES) return PAPER_FILE_MESSAGE;
  const b = new Uint8Array(await file.slice(0, 8).arrayBuffer());
  const isPdf = b.length >= 5 && String.fromCharCode(...b.subarray(0, 5)) === '%PDF-';
  const isPng = b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v);
  const isJpg = b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  return isPdf || isPng || isJpg ? null : PAPER_FILE_MESSAGE;
}
