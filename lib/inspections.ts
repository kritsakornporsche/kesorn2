// Room inspection before move-in: the owner/manager records the condition of each item in the room (with a photo),
// the tenant acknowledges it. Items start from the room's room_inventory (read only) or a default list, and more can
// be added. The inspection can be edited until the tenant acknowledges it, then it is locked. It does not hold up
// the contract taking effect (lib/moveIn.ts is unchanged). Every function takes `now` from the app; MySQL NOW() is
// never used for these times. The same inspection is done at move-out (kind 'move_out', commit 12): possible while
// the move-out is open and before the deposit is settled, compared with the move-in result, acknowledged the same way.

import { getDb } from '@/lib/db';
import { type Client } from '@/lib/bill-status';
import { withRetry } from '@/lib/bookings';
import { PHOTOS_TOTAL_MAX_BYTES, deletePhoto, isPhotoName, parsePhotoUpload, photoUrl, savePhoto } from '@/lib/inspection-files';

/** Booking fee paid up to the contract in effect */
export const INSPECTABLE = ['PendingOwnerSignature', 'PendingContract', 'PendingFirstBill', 'Active'];
export type InspectionKind = 'move_in' | 'move_out';
export const KINDS: InspectionKind[] = ['move_in', 'move_out'];
/** Move-out settlement states in which the move-out inspection can be done (lib/moveOut.ts) */
const MOVE_OUT_INSPECTABLE = ['Notified', 'Returned'];
export const CONDITIONS = ['Good', 'Damaged', 'Missing'] as const;
export type Condition = (typeof CONDITIONS)[number];
export const MAX_ITEMS = 30;
const NAME_MAX = 255;
const NOTE_MAX = 1000;

/** Used when the room has no room_inventory rows (or the table is not there) */
export const DEFAULT_ITEMS = [
  'เตียง', 'ที่นอน', 'ตู้เสื้อผ้า', 'โต๊ะ', 'เก้าอี้', 'เครื่องปรับอากาศ', 'พัดลม',
  'กุญแจห้อง', 'คีย์การ์ด', 'ผ้าม่าน', 'หลอดไฟ', 'ห้องน้ำ/สุขภัณฑ์',
];

export type InspectionStatus = 'none' | 'pending_ack' | 'acknowledged';
export const STATUS_TEXT: Record<InspectionStatus, string> = {
  none: 'ยังไม่ตรวจห้อง',
  pending_ack: 'รอผู้เช่ารับทราบ',
  acknowledged: 'รับทราบแล้ว',
};

export type InspectionRefusal = 'not_found' | 'forbidden' | 'invalid_status' | 'locked' | 'bad_items' | 'bad_photo'
  | 'too_large' | 'not_inspected' | 'already_acknowledged' | 'move_out_closed';

export type InspectionResult<T> = ({ ok: true } & T) | { ok: false; reason: InspectionRefusal; message: string; item?: number };

const MESSAGES: Record<InspectionRefusal, string> = {
  not_found: 'ไม่พบข้อมูลสัญญาเช่า',
  forbidden: 'ไม่มีสิทธิ์ทำรายการนี้',
  invalid_status: 'ตรวจห้องได้เฉพาะสัญญาที่ชำระค่าจองแล้วจนถึงสัญญาที่มีผลอยู่',
  locked: 'ผู้เช่ารับทราบผลตรวจห้องแล้ว แก้ไขไม่ได้',
  bad_items: 'รายการตรวจห้องไม่ถูกต้อง',
  bad_photo: 'รูปไม่ถูกต้อง',
  too_large: `รูปรวมกันต้องไม่เกิน ${PHOTOS_TOTAL_MAX_BYTES / 1024 / 1024}MB ต่อการบันทึกหนึ่งครั้ง`,
  not_inspected: 'ยังไม่มีผลตรวจห้องให้รับทราบ',
  already_acknowledged: 'รับทราบผลตรวจห้องไปแล้ว',
  move_out_closed: 'ตรวจห้องตอนย้ายออกได้ตั้งแต่แจ้งย้ายออกจนก่อนสรุปเงินประกันเท่านั้น',
};

class InspectionRefused extends Error {
  constructor(public reason: InspectionRefusal, public detail?: string, public item?: number) { super(reason); }
}
function refuse(reason: InspectionRefusal, detail?: string, item?: number): never {
  throw new InspectionRefused(reason, detail, item);
}
function refusal(error: InspectionRefused) {
  return { ok: false as const, reason: error.reason, message: error.detail || MESSAGES[error.reason], ...(error.item !== undefined ? { item: error.item } : {}) };
}

async function run<T>(work: (client: Client) => Promise<T>): Promise<InspectionResult<T>> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof InspectionRefused) return refusal(error);
    throw error;
  }
}

export interface Actor { id: number; email?: string | null; role: string }

const isStaff = (user: Actor) => user.role === 'owner' || user.role === 'manager';

/** The contract's own tenant: the tenant record is linked to the account, or has the same email. */
function isContractTenant(c: { tenant_user_id: number | null; tenant_email: string | null }, user: Actor) {
  if (c.tenant_user_id && Number(c.tenant_user_id) === Number(user.id)) return true;
  return !!c.tenant_email && !!user.email && c.tenant_email.toLowerCase() === user.email.toLowerCase();
}

async function lockContract(client: Client, contractId: number) {
  const c = (await client.query(
    `SELECT c.id, c.status, c.room_id, t.user_id AS tenant_user_id, t.email AS tenant_email
     FROM contracts c LEFT JOIN tenants t ON t.id = c.tenant_id
     WHERE c.id = ? FOR UPDATE`,
    [contractId]
  )).rows[0];
  if (!c) refuse('not_found');
  return c;
}

/** Whether the contract can be inspected now: move-in from booking paid to Active; move-out while the move-out is open. */
async function canInspect(client: Client, c: { id: number; status: string }, kind: InspectionKind) {
  if (kind === 'move_in') {
    if (!INSPECTABLE.includes(c.status)) refuse('invalid_status');
    return;
  }
  const open = (await client.query(
    `SELECT id FROM move_out_settlements WHERE contract_id = ? AND state IN (${MOVE_OUT_INSPECTABLE.map(() => '?').join(', ')}) LIMIT 1`,
    [c.id, ...MOVE_OUT_INSPECTABLE]
  )).rows[0];
  if (!open) refuse('move_out_closed');
}

const kindOf = (kind: unknown): InspectionKind => (kind === 'move_out' ? 'move_out' : 'move_in');

export function statusOf(row: { tenant_ack_at?: unknown } | null | undefined): InspectionStatus {
  if (!row) return 'none';
  return row.tenant_ack_at ? 'acknowledged' : 'pending_ack';
}

// ── Saving ─────────────────────────────────────────────────────────────────────

export interface InspectionItemInput {
  name?: unknown;
  condition?: unknown;
  note?: unknown;
  /** data URL of a new photo (JPG/PNG, at most 10MB) */
  photo?: unknown;
  /** file name of a photo already saved on this inspection, to keep it */
  keepPhoto?: unknown;
}

export interface InspectionInput {
  items: unknown;
  note?: unknown;
}

type CleanItem = {
  name: string; condition: Condition; note: string | null;
  upload: { bytes: Buffer; ext: string } | null; keepPhoto: string | null;
  /** set once the new photo is written */
  photoFile?: string;
};

function itemLabel(index: number, name: string) {
  return name ? `รายการที่ ${index + 1} "${name}"` : `รายการที่ ${index + 1}`;
}

/** Check every item and every new photo before anything is written. */
function cleanItems(raw: unknown): CleanItem[] {
  if (!Array.isArray(raw) || raw.length === 0) refuse('bad_items', 'กรุณาเพิ่มรายการตรวจอย่างน้อย 1 รายการ');
  if (raw.length > MAX_ITEMS) refuse('bad_items', `รายการตรวจได้ไม่เกิน ${MAX_ITEMS} รายการ`);
  let total = 0;
  const items = (raw as InspectionItemInput[]).map((item, index) => {
    const name = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!name) refuse('bad_items', `${itemLabel(index, '')}: กรุณาระบุชื่อรายการ`, index);
    if (name.length > NAME_MAX) refuse('bad_items', `${itemLabel(index, '')}: ชื่อรายการยาวเกิน ${NAME_MAX} ตัวอักษร`, index);
    const condition = CONDITIONS.includes(item.condition as Condition) ? (item.condition as Condition) : null;
    if (!condition) refuse('bad_items', `${itemLabel(index, name)}: กรุณาเลือกสภาพ (ปกติ / ชำรุด / สูญหาย)`, index);
    const note = typeof item.note === 'string' && item.note.trim() ? item.note.trim() : null;
    if (note && note.length > NOTE_MAX) refuse('bad_items', `${itemLabel(index, name)}: หมายเหตุยาวเกิน ${NOTE_MAX} ตัวอักษร`, index);

    let upload: CleanItem['upload'] = null;
    if (item.photo !== undefined && item.photo !== null && item.photo !== '') {
      const parsed = parsePhotoUpload(item.photo);
      if (!parsed.ok) refuse(parsed.tooLarge ? 'too_large' : 'bad_photo', `รูปของ${itemLabel(index, name)}: ${parsed.message}`, index);
      total += parsed.bytes.length;
      upload = parsed;
    }
    const keepPhoto = !upload && isPhotoName(item.keepPhoto) ? item.keepPhoto : null;
    return { name, condition, note, upload, keepPhoto };
  });
  if (total > PHOTOS_TOTAL_MAX_BYTES) refuse('too_large');
  return items;
}

/** Record (or replace) the move-in inspection of a contract (see saveInspection). */
export function saveMoveInInspection(contractId: number, input: InspectionInput, by: Actor, now: Date) {
  return saveInspection(contractId, 'move_in', input, by, now);
}

/**
 * Record (or replace) an inspection of a contract. Owner/manager only; refused once the tenant has
 * acknowledged it. Items are replaced as a whole; photos no longer used are removed from storage.
 */
export async function saveInspection(
  contractId: number,
  kindInput: InspectionKind,
  input: InspectionInput,
  by: Actor,
  now: Date
): Promise<InspectionResult<{ inspectionId: number }>> {
  const kind = kindOf(kindInput);
  if (!by || !isStaff(by)) return { ok: false, reason: 'forbidden', message: MESSAGES.forbidden };

  let items: CleanItem[];
  try {
    items = cleanItems(input?.items);
  } catch (error) {
    if (error instanceof InspectionRefused) return refusal(error);
    throw error;
  }
  const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim().slice(0, 2000) : null;

  const saved: string[] = [];
  let unused: string[] = [];
  try {
    for (const item of items) {
      if (!item.upload) continue;
      item.photoFile = savePhoto(item.upload);
      saved.push(item.photoFile);
    }

    const result = await run(async (client) => {
      const c = await lockContract(client, contractId);
      await canInspect(client, c, kind);

      const existing = (await client.query(
        'SELECT id, tenant_ack_at FROM contract_inspections WHERE contract_id = ? AND kind = ? FOR UPDATE',
        [contractId, kind]
      )).rows[0];
      if (existing?.tenant_ack_at) refuse('locked');

      let inspectionId: number;
      let previous: string[] = [];
      if (existing) {
        inspectionId = existing.id;
        previous = (await client.query(
          'SELECT photo_file FROM contract_inspection_items WHERE inspection_id = ? AND photo_file IS NOT NULL',
          [inspectionId]
        )).rows.map((r: any) => r.photo_file);
        await client.query(
          'UPDATE contract_inspections SET inspected_by = ?, inspected_at = ?, note = ? WHERE id = ?',
          [by.id, now, note, inspectionId]
        );
        await client.query('DELETE FROM contract_inspection_items WHERE inspection_id = ?', [inspectionId]);
      } else {
        const inserted = await client.query(
          'INSERT INTO contract_inspections (contract_id, kind, inspected_by, inspected_at, note) VALUES (?, ?, ?, ?, ?)',
          [contractId, kind, by.id, now, note]
        );
        inspectionId = Number(inserted.rows.insertId);
      }

      const kept = new Set<string>();
      for (const item of items) {
        // A kept photo must already belong to this inspection (no borrowing another contract's file)
        const photo = item.photoFile || (item.keepPhoto && previous.includes(item.keepPhoto) ? item.keepPhoto : null);
        if (photo && !item.photoFile) kept.add(photo);
        await client.query(
          'INSERT INTO contract_inspection_items (inspection_id, item_name, condition_status, note, photo_file) VALUES (?, ?, ?, ?, ?)',
          [inspectionId, item.name, item.condition, item.note, photo]
        );
      }
      unused = previous.filter((p) => !kept.has(p));
      return { inspectionId };
    });

    if (!result.ok) saved.forEach(deletePhoto);
    else unused.forEach(deletePhoto);
    return result;
  } catch (error) {
    saved.forEach(deletePhoto);
    throw error;
  }
}

/** The contract's own tenant acknowledges an inspection (move-in by default); it is locked from then on. */
export async function acknowledgeInspection(contractId: number, user: Actor, now: Date, kindInput: InspectionKind = 'move_in'): Promise<InspectionResult<{ acknowledgedAt: Date }>> {
  if (!user) return { ok: false, reason: 'forbidden', message: MESSAGES.forbidden };
  const kind = kindOf(kindInput);
  return run(async (client) => {
    const c = await lockContract(client, contractId);
    // Someone else's contract reads as not found, so contract ids cannot be probed
    if (isStaff(user) || !isContractTenant(c, user)) refuse('not_found');
    // A move-out inspection can still be acknowledged after the room is returned (contract Ended)
    if (kind === 'move_in') await canInspect(client, c, kind);

    const inspection = (await client.query(
      'SELECT id, tenant_ack_at FROM contract_inspections WHERE contract_id = ? AND kind = ? FOR UPDATE',
      [contractId, kind]
    )).rows[0];
    if (!inspection) refuse('not_inspected');
    if (inspection.tenant_ack_at) refuse('already_acknowledged');
    const count = (await client.query('SELECT COUNT(*) AS n FROM contract_inspection_items WHERE inspection_id = ?', [inspection.id])).rows[0];
    if (!Number(count?.n)) refuse('not_inspected');

    await client.query('UPDATE contract_inspections SET tenant_ack_at = ?, tenant_ack_by = ? WHERE id = ?', [now, user.id, inspection.id]);
    return { acknowledgedAt: now };
  });
}

// ── Reading ────────────────────────────────────────────────────────────────────

export interface InspectionView {
  id: number;
  contract_id: number;
  kind: InspectionKind;
  status: InspectionStatus;
  status_text: string;
  inspected_at: string;
  inspected_by_name: string | null;
  note: string | null;
  tenant_ack_at: string | null;
  items: { id: number; item_name: string; condition_status: Condition; note: string | null; photo_file: string | null; photo_url: string | null }[];
}

/** Starting items for a move-out inspection: the move-in items (same names and notes), else as for move-in. */
export async function defaultItemsFor(contractId: number, roomId: number, kind: InspectionKind) {
  if (kind === 'move_out') {
    const moveIn = await getInspection(contractId, 'move_in');
    if (moveIn && moveIn.items.length > 0) return moveIn.items.map((it) => ({ name: it.item_name, note: null as string | null }));
  }
  return defaultItems(roomId);
}

/** Starting items for a new inspection: the room's room_inventory, or the default list. */
export async function defaultItems(roomId: number): Promise<{ name: string; note: string | null }[]> {
  try {
    const sql = getDb();
    const rows = await sql`SELECT item_name, notes FROM room_inventory WHERE room_id = ${roomId} ORDER BY id`;
    const items = (rows as any[])
      .filter((r) => typeof r.item_name === 'string' && r.item_name.trim())
      .slice(0, MAX_ITEMS)
      .map((r) => ({ name: r.item_name.trim().slice(0, NAME_MAX), note: r.notes ? String(r.notes).slice(0, NOTE_MAX) : null }));
    if (items.length > 0) return items;
  } catch {
    // room_inventory is created outside the migrations; without it the default list is used
  }
  return DEFAULT_ITEMS.map((name) => ({ name, note: null }));
}

/** The move-in inspection of a contract, with photo links; null when not inspected yet. */
export function getMoveInInspection(contractId: number): Promise<InspectionView | null> {
  return getInspection(contractId, 'move_in');
}

/** An inspection of a contract, with photo links; null when not done yet. */
export async function getInspection(contractId: number, kindInput: InspectionKind): Promise<InspectionView | null> {
  const kind = kindOf(kindInput);
  const sql = getDb();
  const rows = await sql`
    SELECT i.id, i.contract_id, i.kind, i.inspected_at, i.note, i.tenant_ack_at, u.name AS inspected_by_name
    FROM contract_inspections i LEFT JOIN users u ON u.id = i.inspected_by
    WHERE i.contract_id = ${contractId} AND i.kind = ${kind} LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  const items = await sql`
    SELECT id, item_name, condition_status, note, photo_file FROM contract_inspection_items
    WHERE inspection_id = ${row.id} ORDER BY id
  `;
  const status = statusOf(row);
  return {
    ...row,
    status,
    status_text: STATUS_TEXT[status],
    items: (items as any[]).map((it) => ({ ...it, photo_url: photoUrl(contractId, it.photo_file) })),
  };
}

/** Status of several contracts at once (for lists). Contracts without an inspection are 'none'. */
export async function inspectionStatuses(contractIds: number[], kindInput: InspectionKind = 'move_in'): Promise<Record<number, InspectionStatus>> {
  const kind = kindOf(kindInput);
  const ids = contractIds.filter((id) => Number.isInteger(id) && id > 0);
  const result: Record<number, InspectionStatus> = {};
  for (const id of ids) result[id] = 'none';
  if (ids.length === 0) return result;
  const sql = getDb();
  const rows = await sql(
    `SELECT contract_id, tenant_ack_at FROM contract_inspections WHERE kind = ? AND contract_id IN (${ids.map(() => '?').join(',')})`,
    [kind, ...ids]
  );
  for (const r of rows as any[]) result[r.contract_id] = statusOf(r);
  return result;
}

/** Whether a photo file belongs to one of the contract's inspections (for the photo route). */
export async function photoBelongsTo(contractId: number, file: string): Promise<boolean> {
  if (!isPhotoName(file)) return false;
  const sql = getDb();
  const rows = await sql`
    SELECT it.id FROM contract_inspection_items it JOIN contract_inspections i ON i.id = it.inspection_id
    WHERE i.contract_id = ${contractId} AND it.photo_file = ${file} LIMIT 1
  `;
  return rows.length > 0;
}

/**
 * The tenant's contract to show the inspection for: the given one if it is theirs, otherwise their latest contract
 * that can be inspected. null when there is none (someone else's contract reads the same as none).
 */
export async function tenantContract(user: Actor, contractId?: number | null): Promise<{ id: number; status: string; room_number: string } | null> {
  const sql = getDb();
  const statuses = INSPECTABLE;
  const rows = await sql(
    `SELECT c.id, c.status, r.room_number FROM contracts c
     JOIN tenants t ON t.id = c.tenant_id LEFT JOIN rooms r ON r.id = c.room_id
     WHERE (t.user_id = ? OR LOWER(t.email) = LOWER(?))
       ${contractId ? 'AND c.id = ?' : `AND c.status IN (${statuses.map(() => '?').join(',')})`}
     ORDER BY c.id DESC LIMIT 1`,
    [user.id, user.email || '', ...(contractId ? [contractId] : statuses)]
  );
  return (rows[0] as any) || null;
}

/** HTTP status for a refusal (for the API routes). */
export function refusalStatus(reason: InspectionRefusal): number {
  if (reason === 'not_found') return 404;
  if (reason === 'forbidden') return 403;
  if (reason === 'locked' || reason === 'already_acknowledged' || reason === 'move_out_closed') return 409;
  if (reason === 'too_large') return 413;
  return 400;
}
