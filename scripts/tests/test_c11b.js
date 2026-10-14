#!/usr/bin/env node
// Test 11b: move-in room inspection (lib/inspections.ts) called directly through jiti, with `now` given by the test.
// Needs migration 011 and DATABASE_URL (a development database, never production).
// Creates zz-test-* accounts and contracts of its own and removes them (and their photo files) at the end.
//
// Run: DATABASE_URL=mysql://user:pass@localhost:3306/kesorn_db node scripts/tests/test_c11b.js

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { createJiti } = require('jiti');

const ROOT = path.resolve(__dirname, '..', '..');
const jiti = createJiti(__filename, { alias: { '@': ROOT } });
const STORAGE = path.join(ROOT, 'storage', 'inspections');
const TAG = `zz-test-c11b-${Date.now()}`;

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.log(`  ✕ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`);
  }
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else out.push(full);
  }
  return out;
}

// A real 1x1 PNG, and a JPEG header followed by filler
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const jpegOf = (size) => { const b = Buffer.alloc(size, 0x20); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };
const dataUrl = (bytes, type = 'image/png') => `data:${type};base64,${bytes.toString('base64')}`;

// Thai local times given by the test (never MySQL NOW())
const T1 = new Date('2026-10-14T10:00:00+07:00');
const T2 = new Date('2026-10-14T11:00:00+07:00');
const T3 = new Date('2026-10-14T12:00:00+07:00');

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: '+07:00' });
  const q = async (text, params = []) => (await db.query(text, params))[0];

  const lib = await jiti.import(path.join(ROOT, 'lib', 'inspections.ts'));
  const { saveMoveInInspection, acknowledgeInspection, getMoveInInspection, defaultItems, tenantContract, inspectionStatuses, photoBelongsTo, DEFAULT_ITEMS } = lib;

  const publicBefore = new Set(listFiles(path.join(ROOT, 'public')));
  const storageBefore = new Set(listFiles(STORAGE));
  const created = { users: [], tenants: [], contracts: [] };

  try {
    // ── Setup ────────────────────────────────────────────────────────────────
    const roomWith = (await q('SELECT room_id FROM room_inventory GROUP BY room_id ORDER BY room_id LIMIT 1').catch(() => []))[0]?.room_id || null;
    const roomWithout = (await q(
      'SELECT id FROM rooms WHERE id NOT IN (SELECT room_id FROM room_inventory) ORDER BY id LIMIT 1'
    ).catch(() => q('SELECT id FROM rooms ORDER BY id LIMIT 1')))[0]?.id || null;
    const anyRoom = roomWith || roomWithout;
    if (!anyRoom) throw new Error('no rooms in the database');

    const user = async (key, role) => {
      const email = `${TAG}-${key}@example.com`;
      const r = await q('INSERT INTO users (name, email, password, phone, role, primary_role) VALUES (?, ?, ?, ?, ?, ?)',
        [`${TAG} ${key}`, email, 'x', '0000000000', role, role]);
      created.users.push(r.insertId);
      return { id: r.insertId, email, role };
    };
    const owner = await user('owner', 'owner');
    const manager = await user('manager', 'manager');
    const tenant1 = await user('tenant1', 'tenant');
    const tenant2 = await user('tenant2', 'tenant');

    const contractFor = async (u, roomId) => {
      const t = await q('INSERT INTO tenants (name, email, user_id, room_id, status, dorm_id) VALUES (?, ?, ?, ?, ?, 1)',
        [`${TAG} tenant`, u.email, u.id, roomId, 'pending']);
      created.tenants.push(t.insertId);
      const c = await q(
        "INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status) VALUES (?, ?, '2026-11-01', '2027-04-30', 0, 'PendingContract')",
        [t.insertId, roomId]
      );
      created.contracts.push(c.insertId);
      return c.insertId;
    };
    const contractA = await contractFor(tenant1, roomWith || anyRoom);
    const contractB = await contractFor(tenant2, roomWithout || anyRoom);

    // ── Starting items ───────────────────────────────────────────────────────
    console.log('Starting items');
    if (roomWith) {
      const inv = await q('SELECT item_name, notes FROM room_inventory WHERE room_id = ? ORDER BY id', [roomWith]);
      const items = await defaultItems(roomWith);
      check('room with room_inventory: items from the room', items.length === inv.length && items.every((it, i) => it.name === inv[i].item_name.trim()), items);
      check('room with room_inventory: notes as starting note', items.every((it, i) => (it.note || null) === (inv[i].notes ? String(inv[i].notes) : null)));
    } else {
      console.log('  - room_inventory has no rows (or no table): skipped');
    }
    const fallback = await defaultItems(roomWithout || 2147483000);
    check('room without room_inventory: default list', JSON.stringify(fallback.map((i) => i.name)) === JSON.stringify(DEFAULT_ITEMS));

    // ── Saving ───────────────────────────────────────────────────────────────
    console.log('Saving');
    const ownerSave = await saveMoveInInspection(contractA, {
      note: 'ตรวจโดยเจ้าของ',
      items: [
        { name: 'ฟูกที่นอน 5 ฟุต', condition: 'Good', photo: dataUrl(PNG) },
        { name: 'รีโมตเครื่องปรับอากาศ', condition: 'Damaged', note: 'ฝาหลังแตก' },
        { name: 'ของที่เพิ่มเอง', condition: 'Missing' },
      ],
    }, owner, T1);
    check('owner saves', ownerSave.ok, ownerSave);
    let view = await getMoveInInspection(contractA);
    check('3 items, status pending_ack', view && view.items.length === 3 && view.status === 'pending_ack', view);
    const firstPhoto = view?.items[0].photo_file;
    check('photo stored outside public/', !!firstPhoto && fs.existsSync(path.join(STORAGE, firstPhoto)));
    check('photo belongs to its contract only', (await photoBelongsTo(contractA, firstPhoto)) && !(await photoBelongsTo(contractB, firstPhoto)));
    const savedAt = (await q("SELECT DATE_FORMAT(inspected_at, '%Y-%m-%d %H:%i') AS t FROM contract_inspections WHERE contract_id = ?", [contractA]))[0]?.t;
    check('inspected_at is the given now in Thai time', savedAt === '2026-10-14 10:00', savedAt);

    const managerSave = await saveMoveInInspection(contractA, {
      items: [
        { name: 'ฟูกที่นอน 5 ฟุต', condition: 'Good', keepPhoto: firstPhoto },
        { name: 'รีโมตเครื่องปรับอากาศ', condition: 'Damaged', note: 'ฝาหลังแตก', photo: dataUrl(jpegOf(2000), 'image/jpeg') },
      ],
    }, manager, T2);
    check('manager saves (edit)', managerSave.ok, managerSave);
    view = await getMoveInInspection(contractA);
    check('kept photo stays, item removed', view.items.length === 2 && view.items[0].photo_file === firstPhoto && !!view.items[1].photo_file);

    const stolen = await saveMoveInInspection(contractB, { items: [{ name: 'x', condition: 'Good', keepPhoto: firstPhoto }] }, owner, T2);
    view = await getMoveInInspection(contractB);
    check('another contract cannot keep a photo it does not have', stolen.ok && view.items[0].photo_file === null);

    const tenantSave = await saveMoveInInspection(contractA, { items: [{ name: 'x', condition: 'Good' }] }, tenant1, T2);
    check('tenant cannot save', !tenantSave.ok && tenantSave.reason === 'forbidden', tenantSave);

    // ── Photos refused ───────────────────────────────────────────────────────
    console.log('Photos refused');
    const filesBefore = listFiles(STORAGE).length;
    const fake = await saveMoveInInspection(contractA, { items: [{ name: 'รูปปลอม', condition: 'Good', photo: dataUrl(Buffer.from('this is not an image')) }] }, owner, T2);
    check('fake image refused', !fake.ok && fake.reason === 'bad_photo' && fake.item === 0, fake);
    const big = await saveMoveInInspection(contractA, { items: [{ name: 'รูปใหญ่', condition: 'Good', photo: dataUrl(jpegOf(10 * 1024 * 1024 + 1), 'image/jpeg') }] }, owner, T2);
    check('photo over 10MB refused, names the item', !big.ok && big.reason === 'too_large' && big.message.includes('รูปใหญ่'), big.ok ? big : big.message);
    const many = await saveMoveInInspection(contractA, {
      items: [1, 2, 3].map((n) => ({ name: `รูป ${n}`, condition: 'Good', photo: dataUrl(jpegOf(8 * 1024 * 1024), 'image/jpeg') })),
    }, owner, T2);
    check('photos over 20MB together refused', !many.ok && many.reason === 'too_large', many.ok ? many : many.message);
    check('refused saves leave no files', listFiles(STORAGE).length === filesBefore);
    view = await getMoveInInspection(contractA);
    check('refused saves leave the inspection unchanged', view.items.length === 2);

    await q("UPDATE contracts SET status = 'Cancelled' WHERE id = ?", [contractB]);
    const cancelled = await saveMoveInInspection(contractB, { items: [{ name: 'x', condition: 'Good' }] }, owner, T2);
    check('cancelled contract cannot be inspected', !cancelled.ok && cancelled.reason === 'invalid_status', cancelled);
    await q("UPDATE contracts SET status = 'PendingContract' WHERE id = ?", [contractB]);

    // ── Other tenant ─────────────────────────────────────────────────────────
    console.log('Other tenant');
    check('other tenant cannot see the contract', (await tenantContract(tenant2, contractA)) === null);
    check('own tenant sees the contract', (await tenantContract(tenant1, contractA))?.id === contractA);
    const otherAck = await acknowledgeInspection(contractA, tenant2, T3);
    check('other tenant cannot acknowledge', !otherAck.ok && otherAck.reason === 'not_found', otherAck);
    const ownerAck = await acknowledgeInspection(contractA, owner, T3);
    check('owner cannot acknowledge for the tenant', !ownerAck.ok, ownerAck);

    // ── Acknowledge and lock ─────────────────────────────────────────────────
    console.log('Acknowledge');
    const ack = await acknowledgeInspection(contractA, tenant1, T3);
    check('tenant acknowledges', ack.ok, ack);
    view = await getMoveInInspection(contractA);
    check('status acknowledged', view.status === 'acknowledged');
    const ackAt = (await q("SELECT DATE_FORMAT(tenant_ack_at, '%Y-%m-%d %H:%i') AS t, tenant_ack_by FROM contract_inspections WHERE contract_id = ?", [contractA]))[0];
    check('tenant_ack_at/by recorded', ackAt?.t === '2026-10-14 12:00' && ackAt?.tenant_ack_by === tenant1.id, ackAt);
    const again = await acknowledgeInspection(contractA, tenant1, T3);
    check('second acknowledgement refused', !again.ok && again.reason === 'already_acknowledged');
    const afterAck = await saveMoveInInspection(contractA, { items: [{ name: 'x', condition: 'Good' }] }, owner, T3);
    check('owner cannot edit after acknowledgement', !afterAck.ok && afterAck.reason === 'locked', afterAck);
    const managerAfter = await saveMoveInInspection(contractA, { items: [{ name: 'x', condition: 'Good' }] }, manager, T3);
    check('manager cannot edit after acknowledgement', !managerAfter.ok && managerAfter.reason === 'locked');

    const statuses = await inspectionStatuses([contractA, contractB, 2147483000]);
    check('list statuses', statuses[contractA] === 'acknowledged' && statuses[contractB] === 'pending_ack' && statuses[2147483000] === 'none', statuses);

    const status = (await q('SELECT status FROM contracts WHERE id = ?', [contractA]))[0]?.status;
    check('contract status not changed by the inspection', status === 'PendingContract', status);

    // ── public/ ──────────────────────────────────────────────────────────────
    const added = listFiles(path.join(ROOT, 'public')).filter((f) => !publicBefore.has(f));
    check('no new files in public/', added.length === 0, added);
  } finally {
    // ── Cleanup: only what this test created ─────────────────────────────────
    if (created.contracts.length) {
      const photos = await q(
        `SELECT it.photo_file FROM contract_inspection_items it JOIN contract_inspections i ON i.id = it.inspection_id
         WHERE i.contract_id IN (?) AND it.photo_file IS NOT NULL`, [created.contracts]
      ).catch(() => []);
      await q('DELETE it FROM contract_inspection_items it JOIN contract_inspections i ON i.id = it.inspection_id WHERE i.contract_id IN (?)', [created.contracts]).catch(() => {});
      await q('DELETE FROM contract_inspections WHERE contract_id IN (?)', [created.contracts]).catch(() => {});
      await q('DELETE FROM contracts WHERE id IN (?)', [created.contracts]);
      for (const p of photos) {
        if (!storageBefore.has(path.join(STORAGE, p.photo_file))) fs.rmSync(path.join(STORAGE, p.photo_file), { force: true });
      }
    }
    if (created.tenants.length) await q('DELETE FROM tenants WHERE id IN (?)', [created.tenants]);
    if (created.users.length) {
      await q('DELETE FROM user_dorm_roles WHERE user_id IN (?)', [created.users]).catch(() => {});
      await q('DELETE FROM users WHERE id IN (?)', [created.users]);
    }
    // Photos written by this run that are no longer referenced (e.g. replaced) are already removed by the lib
    const leftover = listFiles(STORAGE).filter((f) => !storageBefore.has(f));
    leftover.forEach((f) => fs.rmSync(f, { force: true }));
    await db.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
