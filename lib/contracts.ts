// The only place that creates, signs (activates) and renews contracts. Each runs in one transaction:
// the tenant account, the contract, the room status and the user role change together or not at all.
// Bills and payments are not created here; callers use recordPayment (lib/payments.ts) as before.

import bcrypt from 'bcryptjs';
import { randomInt } from 'crypto';
import { bangkokDate, bookingFeeFor, depositFor } from '@/lib/billing';
import { formatBaht } from '@/lib/format';
import { withTransaction, type Client } from '@/lib/bill-status';

// Accounts that run the dorm can never be turned into a tenant (or have their password/role changed here)
const STAFF_ROLES = new Set(['owner', 'manager', 'keeper', 'admin', 'platform_admin', 'researcher']);
// Statuses a contract can be signed (activated) from
const SIGNABLE = new Set(['pendingownersignature', 'pendingcontract', 'pendingfirstbill']);
// Contracts that hold a room: a new booking or walk-in for that room is refused while one exists
// MoveOutPending: set by the move-out flow before commit 12; such contracts keep their room until the owner closes them
export const ROOM_HOLDING_STATUSES = ['BookingRequested', 'BookingApproved', 'PendingOwnerSignature', 'PendingContract', 'PendingFirstBill', 'Active', 'MoveOutPending'];

export type ContractRefusal = 'room_not_found' | 'room_unavailable' | 'room_has_active_contract' | 'staff_account'
  | 'no_account' | 'not_found' | 'invalid_status' | 'deposit_mismatch' | 'deposit_reason_required' | 'has_open_contract';

export const CONTRACT_MESSAGES: Record<ContractRefusal, string> = {
  room_not_found: 'ไม่พบข้อมูลห้องพัก',
  room_unavailable: 'ห้องพักนี้ไม่ว่างในขณะนี้',
  room_has_active_contract: 'ห้องพักนี้มีสัญญาที่มีสถานะ Active อยู่แล้ว ไม่สามารถสร้างสัญญาใหม่ได้',
  staff_account: 'อีเมลนี้เป็นบัญชีพนักงาน/เจ้าของหอ ใช้เป็นบัญชีผู้เช่าไม่ได้',
  no_account: 'ไม่พบบัญชีผู้ใช้',
  not_found: 'ไม่พบข้อมูลสัญญาเช่า',
  invalid_status: 'สัญญานี้อยู่ในสถานะที่เปิดใช้งานไม่ได้',
  deposit_mismatch: 'เงินประกันไม่ตรงกับกติกาของห้อง',
  deposit_reason_required: 'กำหนดเงินประกันเองได้เฉพาะผู้เช่าเดิม (ก่อนใช้ระบบ) และต้องระบุเหตุผล',
  has_open_contract: 'บัญชีนี้มีการจอง/สัญญาที่ยังไม่สิ้นสุดอยู่แล้ว',
};

/** Message for a refusal; a deposit mismatch says which amount is correct, an open contract which room. */
export function contractMessage(result: { reason: ContractRefusal; expected?: number; room?: string }) {
  if (result.reason === 'deposit_mismatch' && result.expected !== undefined) return `เงินประกันต้องเป็น ฿${formatBaht(result.expected)} ตามกติกาของห้อง`;
  if (result.reason === 'has_open_contract' && result.room) return `${CONTRACT_MESSAGES.has_open_contract} (ห้อง ${result.room})`;
  return CONTRACT_MESSAGES[result.reason];
}

export class Refused extends Error {
  constructor(public reason: ContractRefusal, public expected?: number, public room?: string) { super(reason); }
}
function refuse(reason: ContractRefusal, expected?: number, room?: string): never {
  throw new Refused(reason, expected, room);
}

// Two requests for the same rows: a lock deadlock, or both creating the same new account (unique email)
const isRace = (error: any) => ['ER_LOCK_DEADLOCK', 'ER_DUP_ENTRY'].includes(error?.code) || [1213, 1062].includes(error?.errno);

/** Run in a transaction; a lost race is retried once (the retry then sees the other request's rows). */
export async function withRetry<T>(work: (client: Client) => Promise<T>): Promise<T> {
  try {
    return await withTransaction(work);
  } catch (error) {
    if (isRace(error)) return withTransaction(work);
    throw error;
  }
}

async function run<T>(work: (client: Client) => Promise<T>): Promise<({ ok: true } & T) | { ok: false; reason: ContractRefusal; expected?: number; room?: string }> {
  try {
    return { ok: true, ...(await withRetry(work)) };
  } catch (error) {
    if (error instanceof Refused) {
      return { ok: false, reason: error.reason, ...(error.expected !== undefined ? { expected: error.expected } : {}), ...(error.room ? { room: error.room } : {}) };
    }
    throw error;
  }
}

/**
 * The account's booking or contract that has not ended (any status that holds a room), or null.
 * Locks the user row first, so two requests for the same account wait for each other. The contract lookup is a
 * locking read: it sees contracts committed by the other request, not the snapshot taken by earlier plain reads.
 */
export async function findOpenContract(client: Client, email: string): Promise<{ id: number; roomNumber: string } | null> {
  const clean = email.trim().toLowerCase();
  await client.query('SELECT id FROM users WHERE LOWER(email) = ? FOR UPDATE', [clean]);
  const row = (await client.query(
    `SELECT c.id, r.room_number FROM contracts c
       JOIN tenants t ON t.id = c.tenant_id
       LEFT JOIN users u ON u.id = t.user_id
       JOIN rooms r ON r.id = c.room_id
     WHERE (LOWER(t.email) = ? OR LOWER(u.email) = ?) AND c.status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')})
     ORDER BY c.id DESC LIMIT 1 LOCK IN SHARE MODE`,
    [clean, clean, ...ROOM_HOLDING_STATUSES]
  )).rows[0];
  return row ? { id: Number(row.id), roomNumber: String(row.room_number) } : null;
}

/** Temporary password for an account the owner creates (shown once, the tenant changes it after logging in). */
export function temporaryPassword(length = 10): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; // no 0/O/1/l/I
  return Array.from({ length }, () => chars[randomInt(chars.length)]).join('');
}

export interface AccountInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  /** @deprecated Ignored — the ID number is not stored (PDPA, commit 16) */
  idCardNumber?: string | null;
  /** @deprecated Ignored — the ID card image is not stored (PDPA, commit 16) */
  idCardImage?: string | null;
  address?: string | null;
  emergencyContact?: string | null;
  /** guest while the booking is pending, tenant once the contract is active */
  role: 'guest' | 'tenant';
  /** Password for a new account only; an existing account keeps its password. Without it, the account must exist. */
  newPassword?: string | null;
}

/**
 * Find or create the user + tenant record for a contract. Staff accounts are refused; a tenant is never lowered to guest.
 * An account that still has a booking/contract that has not ended (owner-made 2nd contract) keeps its profile and room:
 * what was entered this time is kept on the new contract only (id card number/image, address — the caller passes them).
 */
async function resolveAccount(client: Client, input: AccountInput, place: { roomId: number; dormId: number; moveInDate: string; tenantStatus: 'pending' | 'active' }) {
  const email = input.email.trim().toLowerCase();
  const name = input.name?.trim() || null;
  const phone = input.phone?.trim() || null;

  const existing = (await client.query('SELECT id, role FROM users WHERE LOWER(email) = ? LIMIT 1 FOR UPDATE', [email])).rows[0];
  let userId: number;
  let createdUser = false;
  let keepProfile = false;
  if (existing) {
    if (STAFF_ROLES.has(String(existing.role || '').toLowerCase())) refuse('staff_account');
    userId = existing.id;
    keepProfile = Boolean(await findOpenContract(client, email));
    const keepTenant = String(existing.role || '').toLowerCase() === 'tenant';
    const role = input.role === 'tenant' || keepTenant ? 'tenant' : 'guest';
    if (keepProfile) {
      await client.query('UPDATE users SET role = ?, primary_role = ? WHERE id = ?', [role, role, userId]);
    } else {
      await client.query(
        'UPDATE users SET role = ?, primary_role = ?, name = COALESCE(?, name), phone = COALESCE(?, phone) WHERE id = ?',
        [role, role, name, phone, userId]
      );
    }
  } else {
    if (!input.newPassword) refuse('no_account');
    const hash = await bcrypt.hash(String(input.newPassword), 12);
    userId = (await client.query(
      'INSERT INTO users (name, email, password, phone, role, primary_role) VALUES (?, ?, ?, ?, ?, ?)',
      [name || email, email, hash, phone, input.role, input.role]
    )).rows.insertId;
    createdUser = true;
  }

  const tenant = (await client.query(
    'SELECT id FROM tenants WHERE user_id = ? OR LOWER(email) = ? ORDER BY id LIMIT 1 FOR UPDATE', [userId, email]
  )).rows[0];
  let tenantId: number;
  if (tenant && keepProfile) {
    // Still living here / still booked: profile, room, status and move-in date stay as they are
    tenantId = tenant.id;
    await client.query('UPDATE tenants SET user_id = COALESCE(user_id, ?) WHERE id = ?', [userId, tenantId]);
  } else if (tenant) {
    tenantId = tenant.id;
    await client.query(
      `UPDATE tenants SET user_id = ?, room_id = ?, status = ?, move_in_date = ?, move_out_date = NULL, dorm_id = ?,
         name = COALESCE(?, name), phone = COALESCE(?, phone),
         address = COALESCE(?, address), emergency_contact = COALESCE(?, emergency_contact)
       WHERE id = ?`,
      [userId, place.roomId, place.tenantStatus, place.moveInDate, place.dormId, name, phone,
        input.address || null, input.emergencyContact || null, tenantId]
    );
  } else {
    tenantId = (await client.query(
      `INSERT INTO tenants (name, email, phone, room_id, user_id, address, emergency_contact, status, move_in_date, dorm_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name || email, email, phone, place.roomId, userId,
        input.address || null, input.emergencyContact || null, place.tenantStatus, place.moveInDate, place.dormId]
    )).rows.insertId;
  }

  const dormRole = (await client.query('SELECT id FROM user_dorm_roles WHERE user_id = ? AND dorm_id = ? LIMIT 1', [userId, place.dormId])).rows[0];
  if (!dormRole) {
    await client.query('INSERT INTO user_dorm_roles (user_id, dorm_id, role) VALUES (?, ?, ?)', [userId, place.dormId, input.role]);
  }
  return { userId, tenantId, createdUser };
}

export interface CreateContractInput {
  /** A new or existing account, or an existing tenant (renewals) */
  account?: AccountInput;
  tenantId?: number;
  roomId: number;
  startDate: string;
  endDate: string;
  depositAmount: number;
  /** Waiting for the owner, or active right away (owner-created and renewed contracts) */
  /** BookingRequested: a guest's request waiting for approval (no payment yet) */
  status: 'BookingRequested' | 'PendingOwnerSignature' | 'Active';
  /** Booking timing (Thai time via the pool; always from the app's clock) */
  approvedAt?: Date | null;
  approvedBy?: number | null;
  expiresAt?: Date | null;
  /** Walk-in: the room must not already be occupied or reserved */
  requireRoomFree?: boolean;
  /** Web booking and walk-in: one booking/contract per account until it ends (renewals and owner-made contracts skip this) */
  oneOpenContract?: boolean;
  signature?: string | null;
  ownerSignature?: string | null;
  signedAt?: Date | null;
  slipUrl?: string | null;
  contractFileUrl?: string | null;
  /** @deprecated Ignored — the ID number is not stored (PDPA, commit 16) */
  idCardNumber?: string | null;
  /** @deprecated Ignored — the ID card image is not stored (PDPA, commit 16) */
  idCardImage?: string | null;
  tenantAddress?: string | null;
  parentPhone?: string | null;
  parentContractId?: number | null;
  note?: string | null;
  /** Number of people living in the room (water is charged per person); 1 when not given */
  occupants?: number | null;
  /**
   * Tenant who was already living here before the system (owner only, checked by the route): the deposit was
   * received outside the system, so another amount is allowed and the contract is marked deposit_outside_system.
   */
  depositOutsideSystem?: { reason: string } | null;
}

/** createContract inside a transaction the caller has started (refusals throw Refused). */
export async function createContractTx(client: Client, input: CreateContractInput) {
  const room = (await client.query('SELECT id, room_number, status, dorm_id, deposit_amount FROM rooms WHERE id = ? FOR UPDATE', [input.roomId])).rows[0];
  if (!room) refuse('room_not_found');
  const roomStatus = String(room.status || '').toLowerCase();
  if (input.requireRoomFree) {
    // Bookings and walk-ins: the room row is locked above, so two requests for the same room cannot both pass
    if (['occupied', 'reserved', 'ไม่ว่าง'].includes(roomStatus)) refuse('room_unavailable');
    const holding = (await client.query(
      `SELECT id FROM contracts WHERE room_id = ? AND status IN (${ROOM_HOLDING_STATUSES.map(() => '?').join(', ')}) LIMIT 1`,
      [input.roomId, ...ROOM_HOLDING_STATUSES]
    )).rows[0];
    if (holding) refuse('room_unavailable');
  }
  if (input.oneOpenContract && input.account) {
    const open = await findOpenContract(client, input.account.email);
    if (open) refuse('has_open_contract', undefined, open.roomNumber);
  }
  const active = (await client.query(
    "SELECT id FROM contracts WHERE room_id = ? AND status = 'Active' AND id <> ? LIMIT 1", [input.roomId, input.parentContractId || 0]
  )).rows[0];
  if (active) refuse('room_has_active_contract');

  const isActive = input.status === 'Active';
  // The deposit follows the room's rules: a pending booking holds the booking fee, a new active contract the full
  // deposit. A renewal carries the old contract's deposit. Pre-system tenants may differ, with a reason.
  const deposit = Math.round(Number(input.depositAmount) * 100) / 100;
  const outside = input.depositOutsideSystem;
  if (outside) {
    if (!isActive || input.parentContractId || !String(outside.reason || '').trim() || !(deposit > 0)) refuse('deposit_reason_required');
  } else if (!input.parentContractId) {
    const expected = isActive ? depositFor(room) : bookingFeeFor(room.room_number);
    if (Math.round(deposit * 100) !== Math.round(expected * 100)) refuse('deposit_mismatch', expected);
  }
  const dormId = room.dorm_id || 1;
  let tenantId = input.tenantId || 0;
  let userId: number | null = null;
  let createdUser = false;
  if (input.account) {
    ({ tenantId, userId, createdUser } = await resolveAccount(client, input.account, {
      roomId: room.id, dormId, moveInDate: bangkokDate(input.startDate), tenantStatus: isActive ? 'active' : 'pending',
    }));
  }
  if (!tenantId) refuse('no_account');

  const contractId = (await client.query(
    `INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, signature_data, owner_signature_data,
       signed_at, slip_url, contract_file_url, tenant_address, parent_phone, parent_contract_id, renewal_note, occupants,
       deposit_outside_system, deposit_note, approved_at, approved_by, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [tenantId, room.id, input.startDate, input.endDate, deposit, input.status, input.signature || null,
      input.ownerSignature || null, input.signedAt || null, input.slipUrl || null, input.contractFileUrl || null,
      input.tenantAddress || null, input.parentPhone || null,
      input.parentContractId || null, input.note || null, Math.max(1, Math.floor(Number(input.occupants) || 1)),
      outside ? 1 : 0, outside ? String(outside.reason).trim().slice(0, 500) : null,
      input.approvedAt || null, input.approvedBy || null, input.expiresAt || null]
  )).rows.insertId;

  await client.query('UPDATE rooms SET status = ? WHERE id = ?', [isActive ? 'Occupied' : 'Reserved', room.id]);
  return { contractId: Number(contractId), tenantId, userId, createdUser, roomNumber: String(room.room_number), dormId };
}

/** Create a contract (and the tenant account when given). Refusals return { ok: false, reason } with nothing written. */
export function createContract(input: CreateContractInput) {
  return run((client) => createContractTx(client, input));
}

export interface SignContractInput {
  ownerSignature?: string | null;
  contractFileUrl?: string | null;
  /** First move-in bill paid: the full deposit now held */
  depositAmount?: number | null;
  slipUrl?: string | null;
}

/**
 * Activate a pending contract: contract Active, room Occupied, tenant active in that room, guest account becomes tenant.
 * Runs inside the caller's transaction (refusals throw Refused); booked contracts are activated through lib/moveIn.ts.
 */
export async function signContractTx(client: Client, contractId: number, input: SignContractInput = {}) {
  const contract = (await client.query(
    `SELECT c.id, c.status, c.room_id, c.tenant_id, t.user_id, t.email
     FROM contracts c LEFT JOIN tenants t ON t.id = c.tenant_id WHERE c.id = ? FOR UPDATE`, [contractId]
  )).rows[0];
  if (!contract) refuse('not_found');
  if (!SIGNABLE.has(String(contract.status || '').toLowerCase())) refuse('invalid_status');

  await client.query(
    `UPDATE contracts SET status = 'Active', owner_signature_data = COALESCE(?, owner_signature_data), signed_at = COALESCE(signed_at, NOW()),
       contract_file_url = COALESCE(?, contract_file_url), deposit_amount = COALESCE(?, deposit_amount), slip_url = COALESCE(?, slip_url)
     WHERE id = ?`,
    [input.ownerSignature || null, input.contractFileUrl || null, input.depositAmount ?? null, input.slipUrl || null, contractId]
  );
  await client.query("UPDATE rooms SET status = 'Occupied' WHERE id = ?", [contract.room_id]);
  if (contract.tenant_id) {
    await client.query("UPDATE tenants SET status = 'active', room_id = ? WHERE id = ?", [contract.room_id, contract.tenant_id]);
  }
  // Only a guest account becomes tenant (staff accounts are never changed)
  await client.query(
    `UPDATE users SET role = 'tenant', primary_role = 'tenant'
     WHERE (id = ? OR LOWER(email) = LOWER(?)) AND (role IS NULL OR role IN ('guest', 'tenant'))`,
    [contract.user_id || 0, contract.email || '']
  );
  return { contractId, tenantId: contract.tenant_id as number, userId: (contract.user_id as number) || null, roomId: contract.room_id as number };
}

export interface RenewContractInput {
  newEndDate: string;
  contractFileUrl?: string | null;
}

/** Close a contract as Renewed and open the next one (Active) from its end date, in one transaction. */
export function renewContract(contractId: number, input: RenewContractInput) {
  return run(async (client) => {
    const old = (await client.query('SELECT * FROM contracts WHERE id = ? FOR UPDATE', [contractId])).rows[0];
    if (!old) refuse('not_found');
    await client.query("UPDATE contracts SET status = 'Renewed', renewal_requested = 0 WHERE id = ?", [contractId]);
    const created = await createContractTx(client, {
      tenantId: old.tenant_id,
      roomId: old.room_id,
      startDate: old.end_date ? bangkokDate(old.end_date) : bangkokDate(new Date()),
      endDate: input.newEndDate,
      depositAmount: Number(old.deposit_amount || 0),
      status: 'Active',
      contractFileUrl: input.contractFileUrl || old.contract_file_url || null,
      // The ID number / card image of the old contract are not copied (PDPA, commit 16)
      tenantAddress: old.tenant_address,
      parentContractId: contractId,
      occupants: old.occupants,
    });
    // The same deposit is held, so where it was received (inside or outside the system) carries over too
    await client.query(
      'UPDATE contracts SET deposit_outside_system = ?, deposit_note = ? WHERE id = ?',
      [old.deposit_outside_system ? 1 : 0, old.deposit_note || null, created.contractId]
    );
    return { contractId: created.contractId, tenantId: old.tenant_id as number, roomId: old.room_id as number };
  });
}
