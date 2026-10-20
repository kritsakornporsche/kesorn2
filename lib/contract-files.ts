// Signed paper contracts contain the tenant's ID card number, so they are stored outside public/ (storage/contracts)
// and only served through /api/contracts/[id]/paper to owners/managers and the contract's own tenant.
// contract_file_url holds 'paper:<random name>' for these files; older values (/uploads/..., data URLs) are left as they are.

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getCurrentUser, type CurrentUser } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { depositFor } from '@/lib/billing';
import type { SignedPaper } from '@/lib/signed-paper';

export const PAPER_MAX_BYTES = 10 * 1024 * 1024;
const PAPER_PREFIX = 'paper:';
const NAME_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|png|jpg)$/;
const CONTENT_TYPES: Record<string, string> = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg' };

function storageDir() {
  return path.join(process.cwd(), 'storage', 'contracts');
}

/** File type from the bytes themselves (the MIME type sent by the browser is not trusted). */
function detectType(bytes: Buffer): 'pdf' | 'png' | 'jpg' | null {
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpg';
  return null;
}

export type PaperUpload = { ok: true; bytes: Buffer; ext: 'pdf' | 'png' | 'jpg' } | { ok: false; message: string };

/** Check an uploaded data URL: JPG, PNG or PDF by content, at most 10MB. */
export function parsePaperUpload(dataUrl: unknown): PaperUpload {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) return { ok: false, message: 'กรุณาแนบไฟล์สัญญาที่เซ็นแล้ว (JPG, PNG หรือ PDF)' };
  const comma = dataUrl.indexOf(',');
  if (comma === -1 || !dataUrl.slice(0, comma).includes(';base64')) return { ok: false, message: 'รูปแบบไฟล์ไม่ถูกต้อง' };
  const base64 = dataUrl.slice(comma + 1).replace(/\s/g, '');
  // Refuse before decoding when the text alone is already too long for 10MB
  if (base64.length > Math.ceil(PAPER_MAX_BYTES / 3) * 4 + 4) return { ok: false, message: 'ไฟล์ต้องมีขนาดไม่เกิน 10MB' };
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length === 0) return { ok: false, message: 'ไฟล์ว่างเปล่า' };
  if (bytes.length > PAPER_MAX_BYTES) return { ok: false, message: 'ไฟล์ต้องมีขนาดไม่เกิน 10MB' };
  const ext = detectType(bytes);
  if (!ext) return { ok: false, message: 'รองรับเฉพาะไฟล์ JPG, PNG หรือ PDF' };
  return { ok: true, bytes, ext };
}

/** Write the file under a random name; returns the value stored in contract_file_url. */
export function savePaper(upload: { bytes: Buffer; ext: string }): string {
  const dir = storageDir();
  fs.mkdirSync(dir, { recursive: true });
  const name = `${randomUUID()}.${upload.ext}`;
  fs.writeFileSync(path.join(dir, name), upload.bytes, { flag: 'wx' });
  return PAPER_PREFIX + name;
}

function paperName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.startsWith(PAPER_PREFIX)) return null;
  const name = value.slice(PAPER_PREFIX.length);
  return NAME_PATTERN.test(name) ? name : null;
}

export function isPaper(value: unknown): boolean {
  return paperName(value) !== null;
}

/** Remove a stored file (a replaced upload, or one whose contract update was refused). */
export function deletePaper(value: unknown) {
  const name = paperName(value);
  if (!name) return;
  try {
    fs.unlinkSync(path.join(storageDir(), name));
  } catch {
    // already gone
  }
}

/** Read a stored file for the paper route. */
export function readPaper(value: unknown): { bytes: Buffer; contentType: string; ext: string } | null {
  const name = paperName(value);
  if (!name) return null;
  try {
    const bytes = fs.readFileSync(path.join(storageDir(), name));
    const ext = name.split('.').pop() as string;
    return { bytes, contentType: CONTENT_TYPES[ext], ext };
  } catch {
    return null;
  }
}

/**
 * For API responses: a stored paper file becomes a link to the paper route; anything else is returned as before.
 * contract_file_is_pdf tells the pages whether to show it in a PDF viewer or as an image.
 */
/**
 * The signed paper contract of a row (commit 28a): 'uploaded' — a file from the signed-contract upload that is there;
 * 'missing' — something is recorded but no contract file can be found (a stored file that is gone, or a value that is
 * not a contract file, e.g. a site photo from old demo data); 'none' — nothing uploaded yet (empty, or the
 * CONTRACT_DOCUMENT placeholder of a contract made on the owner page). Only 'uploaded' is ever shown as the signed copy.
 */
export function signedPaperOf(value: unknown): SignedPaper {
  if (typeof value !== 'string' || !value.trim() || value === 'CONTRACT_DOCUMENT') return 'none';
  const name = paperName(value);
  if (name) return fs.existsSync(path.join(storageDir(), name)) ? 'uploaded' : 'missing';
  // older uploads kept in public/uploads/contracts, or saved inline as a data URL
  if (/^\/uploads\/contracts\/[\w.-]+$/.test(value)) return fs.existsSync(path.join(process.cwd(), 'public', value)) ? 'uploaded' : 'missing';
  if (/^data:(image\/(png|jpe?g)|application\/pdf);base64,/.test(value)) return 'uploaded';
  return 'missing';
}


/**
 * A contract row for the pages: contract_file_url is a link to the signed copy only when it is 'uploaded' (else null, so
 * no page can show something else in its place) and signed_paper says which case it is.
 */
export function withPaperLink<T extends Record<string, any>>(row: T, idField = 'id'): T & { contract_file_is_pdf: boolean; signed_paper: SignedPaper } {
  const value = row.contract_file_url;
  const signed = signedPaperOf(value);
  if (signed !== 'uploaded') return { ...row, contract_file_url: null, contract_file_is_pdf: false, signed_paper: signed };
  const name = paperName(value);
  if (name) {
    return { ...row, contract_file_url: `/api/contracts/${row[idField]}/paper`, contract_file_is_pdf: name.endsWith('.pdf'), signed_paper: signed };
  }
  const text = String(value).toLowerCase();
  return { ...row, contract_file_is_pdf: text.endsWith('.pdf') || text.startsWith('data:application/pdf'), signed_paper: signed };
}

/**
 * Deposit printed on the contract form: the full deposit of the room (the booking fee is part of it) while the
 * contract is still being prepared; the amount actually held once the contract is in effect.
 */
export function formDeposit(row: { status?: string | null; deposit_amount?: number | string | null; room_number?: string | null; room_deposit_amount?: number | string | null }): number {
  if (['Active', 'Renewed'].includes(String(row.status || ''))) return Number(row.deposit_amount || 0);
  return depositFor({ room_number: row.room_number, deposit_amount: row.room_deposit_amount });
}

/**
 * Who may open a contract's documents (printed form, signed paper): owner/manager, or the contract's own tenant.
 * Others get 404 so contract ids cannot be probed.
 */
export async function canViewContract(contractId: number): Promise<{ ok: true; user: CurrentUser } | { ok: false; status: 401 | 404 }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401 };
  if (!Number.isInteger(contractId) || contractId <= 0) return { ok: false, status: 404 };
  if (user.role === 'owner' || user.role === 'manager') return { ok: true, user };
  const sql = getDb();
  const rows = await sql`
    SELECT c.id FROM contracts c JOIN tenants t ON t.id = c.tenant_id
    WHERE c.id = ${contractId} AND (t.user_id = ${user.id} OR LOWER(t.email) = LOWER(${user.email}))
    LIMIT 1
  `;
  return rows.length > 0 ? { ok: true, user } : { ok: false, status: 404 };
}
