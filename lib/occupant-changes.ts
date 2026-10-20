// Changing the number of occupants during a contract (commit 27, migration 020). Owner / manager only — a tenant cannot
// change it. contracts.occupants and a history row (old → new, who, when, reason) are written in one transaction and
// the tenant is notified. Bills already issued (drafts included) keep their amounts; only bills issued after the change
// use the new number (lib/billing reads contracts.occupants when a bill is made). `now` comes from the app.

import { getDb } from '@/lib/db';
import { withRetry } from '@/lib/bookings';
import { MAX_OCCUPANTS, OCCUPANTS_MESSAGE, parseOccupants } from '@/lib/occupants';

/** Contract states in which the number of occupants can be changed */
export const OCCUPANTS_EDITABLE = ['PendingOwnerSignature', 'PendingContract', 'PendingFirstBill', 'Active'];
export const REASON_MAX = 500;

/** Shown when the room has draft bills: they keep the old number */
export const DRAFT_BILLS_WARNING = 'บิลร่างที่มีอยู่ใช้จำนวนเดิม ถ้าต้องการให้ใช้ค่าใหม่ ให้ลบบิลร่างแล้วสร้างใหม่';

export type OccupantChangeRefusal = 'forbidden' | 'not_found' | 'invalid_status' | 'bad_occupants' | 'unchanged' | 'bad_reason';
const MESSAGES: Record<OccupantChangeRefusal, string> = {
  forbidden: 'แก้จำนวนผู้พักได้เฉพาะเจ้าของหอหรือผู้จัดการ',
  not_found: 'ไม่พบสัญญา',
  invalid_status: 'แก้จำนวนผู้พักได้เฉพาะสัญญาที่ยังมีผล (ตั้งแต่ชำระค่าจองจนถึงระหว่างเช่า)',
  bad_occupants: OCCUPANTS_MESSAGE,
  unchanged: 'จำนวนผู้พักเท่าเดิม',
  bad_reason: `เหตุผลยาวเกิน ${REASON_MAX} ตัวอักษร`,
};

export interface OccupantChange {
  id: number;
  old_occupants: number;
  new_occupants: number;
  changed_by_name: string | null;
  changed_at: string;
  reason: string | null;
}

class Refused extends Error { constructor(public reason: OccupantChangeRefusal) { super(reason); } }

/** Draft bills of the contract's tenant in its room (they keep the number they were made with). */
async function draftBillCount(q: (text: string, params: unknown[]) => Promise<any[]>, tenantId: number, roomNumber: string): Promise<number> {
  const rows = await q("SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ? AND room_number = ? AND LOWER(status) = 'draft'", [tenantId, roomNumber]);
  return Number(rows[0]?.n || 0);
}

export async function changeOccupants(
  contractId: number,
  input: { occupants: unknown; reason?: unknown },
  by: { id: number; role: string },
  now: Date
): Promise<{ ok: true; oldOccupants: number; newOccupants: number; draftBills: number; warning: string | null } | { ok: false; reason: OccupantChangeRefusal; message: string }> {
  try {
    if (!by || (by.role !== 'owner' && by.role !== 'manager')) throw new Refused('forbidden');
    if (input.occupants === undefined || input.occupants === null || input.occupants === '') throw new Refused('bad_occupants');
    const occ = parseOccupants(input.occupants);
    if (!occ.ok) throw new Refused('bad_occupants');
    const reason = typeof input.reason === 'string' && input.reason.trim() ? input.reason.trim() : null;
    if (reason && reason.length > REASON_MAX) throw new Refused('bad_reason');

    const result = await withRetry(async (client) => {
      const c = (await client.query(
        `SELECT c.id, c.status, c.occupants, c.tenant_id, r.room_number, t.user_id AS tenant_user_id
         FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
         WHERE c.id = ? FOR UPDATE`,
        [contractId]
      )).rows[0];
      if (!c) throw new Refused('not_found');
      if (!OCCUPANTS_EDITABLE.includes(c.status)) throw new Refused('invalid_status');
      const oldOccupants = Number(c.occupants) || 1;
      if (oldOccupants === occ.value) throw new Refused('unchanged');

      await client.query('UPDATE contracts SET occupants = ? WHERE id = ?', [occ.value, contractId]);
      await client.query(
        'INSERT INTO contract_occupant_changes (contract_id, old_occupants, new_occupants, changed_by, changed_at, reason) VALUES (?, ?, ?, ?, ?, ?)',
        [contractId, oldOccupants, occ.value, by.id, now, reason]
      );
      if (c.tenant_user_id) {
        await client.query(
          'INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at) VALUES (?, ?, ?, ?, 0, ?, ?)',
          [c.tenant_user_id, 'เปลี่ยนจำนวนผู้พักในสัญญา',
            `ห้อง ${c.room_number}: จำนวนผู้พักเปลี่ยนจาก ${oldOccupants} เป็น ${occ.value} คน${reason ? ` (เหตุผล: ${reason})` : ''} — ค่าน้ำในบิลที่ออกหลังจากนี้คิดตามจำนวนใหม่`,
            'contract', '/tenant/contract', now]
        );
      }
      const draftBills = await draftBillCount((t, p) => client.query(t, p).then((r) => r.rows), Number(c.tenant_id), String(c.room_number));
      return { oldOccupants, newOccupants: occ.value, draftBills };
    });
    return { ok: true, ...result, warning: result.draftBills > 0 ? DRAFT_BILLS_WARNING : null };
  } catch (error) {
    if (error instanceof Refused) return { ok: false, reason: error.reason, message: MESSAGES[error.reason] };
    throw error;
  }
}

/** Current number, the history (newest first) and the draft bills that would keep the old number — for the owner page. */
export async function occupantInfo(contractId: number) {
  const sql = getDb();
  const c = (await sql`SELECT c.id, c.status, c.occupants, c.tenant_id, r.room_number FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id WHERE c.id = ${contractId} LIMIT 1`)[0];
  if (!c) return null;
  const history = await sql`
    SELECT h.id, h.old_occupants, h.new_occupants, h.changed_at, h.reason, u.name AS changed_by_name
    FROM contract_occupant_changes h LEFT JOIN users u ON u.id = h.changed_by
    WHERE h.contract_id = ${contractId} ORDER BY h.changed_at DESC, h.id DESC
  `;
  const draftBills = await draftBillCount((t, p) => sql(t, p), Number(c.tenant_id), String(c.room_number));
  return {
    occupants: Number(c.occupants) || 1,
    max: MAX_OCCUPANTS,
    editable: OCCUPANTS_EDITABLE.includes(c.status),
    draftBills,
    warning: draftBills > 0 ? DRAFT_BILLS_WARNING : null,
    history: history as OccupantChange[],
  };
}

/** HTTP status for a refusal */
export const occupantRefusalStatus = (r: OccupantChangeRefusal) => (r === 'forbidden' ? 403 : r === 'not_found' ? 404 : r === 'invalid_status' || r === 'unchanged' ? 409 : 400);
