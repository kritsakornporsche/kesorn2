#!/usr/bin/env node
// Test 13a: repair / cleaning board (lib/maintenance.ts) called through jiti with `now` given by the test.
// Needs migrations 001–013 and DATABASE_URL (a development database, never production). Creates zz-test-* accounts,
// test rooms (room_number ZZ…), contracts, jobs and bills of its own and removes them (with accounting rows and photo
// files) at the end. With BASE_URL set (a running dev server) it also checks that the old keeper routes answer 401
// without a login.
//
// Run: DATABASE_URL=mysql://user:pass@localhost:3306/kesorn_db [BASE_URL=http://localhost:3000] node scripts/tests/test_c13.js

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { createJiti } = require('jiti');

const ROOT = path.resolve(__dirname, '..', '..');
const jiti = createJiti(__filename, { alias: { '@': ROOT } });
const STORAGE = path.join(ROOT, 'storage', 'maintenance');
const TAG = `zz-test-c13-${Date.now()}`;
const ROOM_TAG = `ZZ${String(Date.now()).slice(-5)}`;

let passed = 0;
let failed = 0;
function check(name, condition, detail) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✕ ${name}${detail !== undefined ? ` — ${typeof detail === 'string' ? detail : JSON.stringify(detail)}` : ''}`); }
}
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
const at = (ymd) => new Date(`${ymd}T12:00:00+07:00`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const png = `data:image/png;base64,${PNG.toString('base64')}`;
const fakePng = `data:image/png;base64,${Buffer.from('<svg onload=alert(1)>').toString('base64')}`;
const bigJpg = (() => { const b = Buffer.alloc(10 * 1024 * 1024 + 1, 0x20); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return `data:image/jpeg;base64,${b.toString('base64')}`; })();
const listFiles = (dir) => {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(full)); else out.push(full);
  }
  return out;
};

async function main() {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is not set'); process.exit(2); }
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: '+07:00' });
  const q = async (text, params = []) => (await db.query(text, params))[0];

  const mt = await jiti.import(path.join(ROOT, 'lib', 'maintenance.ts'));
  const mo = await jiti.import(path.join(ROOT, 'lib', 'moveOut.ts'));
  const { recordPayment } = await jiti.import(path.join(ROOT, 'lib', 'payments.ts'));

  const publicBefore = new Set(listFiles(path.join(ROOT, 'public')));
  const storageBefore = new Set(listFiles(STORAGE));
  const created = { users: [], tenants: [], rooms: [], contracts: [] };

  const user = async (key, role, subRole = null, active = 1) => {
    const email = `${TAG}-${key}@example.com`;
    const r = await q('INSERT INTO users (name, email, password, phone, role, primary_role, sub_role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [`${TAG} ${key}`, email, 'x', '0000000000', role, role, subRole, active]);
    created.users.push(r.insertId);
    return { id: r.insertId, email, role, sub_role: subRole, name: `${TAG} ${key}` };
  };
  /** A keeper of a dorm: the keepers row that makes them staff of that dorm (same rule as /api/owner/staff) */
  const keeperOf = async (u, dormId) => {
    await q('INSERT INTO keepers (user_id, name, email, phone, position, dorm_id) VALUES (?, ?, ?, ?, ?, ?)', [u.id, u.name, u.email, '0000000000', u.sub_role, dormId]);
    return u;
  };
  let roomSeq = 0;
  const room = async () => {
    roomSeq++;
    const r = await q("INSERT INTO rooms (room_number, floor, room_type, price, status, dorm_id, deposit_amount) VALUES (?, 9, 'test', 1000, 'Occupied', 1, 3000)", [`${ROOM_TAG}${roomSeq}`]);
    created.rooms.push(r.insertId);
    return { id: r.insertId, number: `${ROOM_TAG}${roomSeq}` };
  };
  const bill = async (tenantId, roomNumber, f) => {
    const r = await q(
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified) VALUES (?, 1, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, 'Unpaid', ?, ?, 0)`,
      [tenantId, roomNumber, `${TAG} ${f.bill_type}`, f.amount, f.room_amount || 0, f.billing_cycle || '2026-01', f.due_date, f.is_first_bill || 0, f.bill_type]
    );
    return r.insertId;
  };
  const pay = async (billId, amount, ymd) => {
    const r = await recordPayment(billId, { amount, method: 'cash', paidAt: at(ymd), recordedBy: null });
    if (!r.ok) throw new Error(`setup payment failed for bill ${billId}: ${JSON.stringify(r)}`);
  };
  /** A tenant with a contract (status) on a new room; deposit 3,000 paid through recordPayment. */
  const tenancy = async (key, status = 'Active', start = '2025-10-01', end = '2026-09-30') => {
    const u = await user(key, 'tenant');
    const rm = await room();
    const t = await q("INSERT INTO tenants (name, email, user_id, room_id, status, dorm_id) VALUES (?, ?, ?, ?, 'active', 1)", [u.name, u.email, u.id, rm.id]);
    created.tenants.push(t.insertId);
    const c = await q(
      `INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, occupants, start_meter_reading)
       VALUES (?, ?, ?, ?, 3000, ?, 1, 100)`, [t.insertId, rm.id, start, end, status]
    );
    created.contracts.push(c.insertId);
    const booking = await bill(t.insertId, rm.number, { amount: 1000, bill_type: 'booking', due_date: start, billing_cycle: 'จอง' });
    await pay(booking, 1000, start);
    const moveIn = await bill(t.insertId, rm.number, { amount: 3000, room_amount: 1000, bill_type: 'booking', is_first_bill: 1, due_date: start, billing_cycle: 'ค่าแรกเข้า' });
    await pay(moveIn, 3000, start);
    await q('UPDATE contracts SET booking_bill_id = ?, move_in_bill_id = ? WHERE id = ?', [booking, moveIn, c.insertId]);
    return { user: u, room: rm, tenantId: t.insertId, contractId: c.insertId };
  };
  const job = async (id) => (await q('SELECT * FROM maintenance_requests WHERE id = ?', [id]))[0];
  const incomeOfBill = async (billId, category) => Number((await q(
    "SELECT COALESCE(SUM(amount), 0) AS s FROM accounting_transactions WHERE type = 'Income' AND category = ? AND reference_type = 'bill_payment' AND reference_id IN (SELECT id FROM bill_payments WHERE bill_id = ?)",
    [category, billId]
  ))[0].s);

  try {
    const owner = await user('owner', 'owner');
    const manager = await user('manager', 'manager');
    const maid = await keeperOf(await user('maid', 'keeper', 'maid'), 1);
    const tech = await keeperOf(await user('tech', 'keeper', 'technician'), 1);
    const tech2 = await keeperOf(await user('tech2', 'keeper', 'technician'), 1);
    const techOff = await keeperOf(await user('techoff', 'keeper', 'technician', 0), 1);
    // Technicians that are not staff of this dorm: one of another dorm (older multi-dorm data), one with no keepers row
    const techOther = await keeperOf(await user('techother', 'keeper', 'technician'), 2);
    const techNone = await user('technone', 'keeper', 'technician');
    const A = await tenancy('a');
    const B = await tenancy('b');
    const E = await tenancy('e', 'Ended');

    // ── Reporting ───────────────────────────────────────────────────────────────
    console.log('Reporting');
    const j1 = await mt.createRequest(A.user, { kind: 'repair', issueType: 'ไฟฟ้า', description: 'ไฟห้องน้ำไม่ติด', photos: [png] }, at('2026-05-01'));
    check('tenant reports a repair with a photo', j1.ok, j1);
    const row1 = await job(j1.id);
    check('room and contract from the Active contract, state Requested', row1.state === 'Requested' && Number(row1.contract_id) === A.contractId && row1.room_number === A.room.number, row1);
    const ended = await mt.createRequest(E.user, { kind: 'repair', description: 'x' }, at('2026-05-01'));
    check('tenant whose contract has Ended cannot report', !ended.ok && ended.reason === 'no_contract', ended);
    const fake = await mt.createRequest(A.user, { kind: 'repair', description: 'x', photos: [fakePng] }, at('2026-05-01'));
    check('fake image refused', !fake.ok && fake.reason === 'bad_photo', fake);
    const big = await mt.createRequest(A.user, { kind: 'repair', description: 'x', photos: [bigJpg] }, at('2026-05-01'));
    check('photo over 10MB refused', !big.ok && big.reason === 'bad_photo', big.ok ? big : big.message);
    const aList = await mt.listJobs(A.user);
    const bList = await mt.listJobs(B.user);
    check('tenant sees own job', aList.some((j) => j.id === j1.id));
    check('other tenant does not see it', !bList.some((j) => j.id === j1.id));
    const photo = (await q("SELECT file FROM maintenance_photos WHERE request_id = ? AND stage = 'report'", [j1.id]))[0];
    check('photo stored outside public/', !!photo && fs.existsSync(path.join(STORAGE, photo.file)));
    check('photo: tenant and staff may open it', (await mt.canViewJobPhoto(A.user, j1.id, photo.file)) && (await mt.canViewJobPhoto(manager, j1.id, photo.file)));
    check('photo: other tenant and a maid may not', !(await mt.canViewJobPhoto(B.user, j1.id, photo.file)) && !(await mt.canViewJobPhoto(maid, j1.id, photo.file)));
    const maidList = await mt.listJobs(maid);
    const techList = await mt.listJobs(tech);
    check('maid does not see repairs; technician sees the open repair without tenant name',
      !maidList.some((j) => j.id === j1.id) && techList.some((j) => j.id === j1.id && j.tenant_name === null && j.tenant_phone === null));

    // ── Assigning ───────────────────────────────────────────────────────────────
    console.log('Assigning');
    const toMaid = await mt.assignJob(j1.id, maid.id, owner, at('2026-05-01'));
    check('repair cannot go to a maid', !toMaid.ok && toMaid.reason === 'wrong_keeper', toMaid);
    const toOff = await mt.assignJob(j1.id, techOff.id, owner, at('2026-05-01'));
    check('deactivated keeper cannot be assigned', !toOff.ok && toOff.reason === 'wrong_keeper', toOff);
    const toOther = await mt.assignJob(j1.id, techOther.id, owner, at('2026-05-01'));
    check('technician of another dorm cannot be assigned', !toOther.ok && toOther.reason === 'wrong_keeper', toOther);
    const toNone = await mt.assignJob(j1.id, techNone.id, owner, at('2026-05-01'));
    check('technician with no dorm cannot be assigned', !toNone.ok && toNone.reason === 'wrong_keeper', toNone);
    const repairList = (await mt.keepersFor('repair')).map((k) => Number(k.id));
    check('assign list: only active technicians of this dorm',
      repairList.includes(tech.id) && repairList.includes(tech2.id) && !repairList.includes(techOther.id) && !repairList.includes(techNone.id) && !repairList.includes(techOff.id), repairList);
    const byTenant = await mt.assignJob(j1.id, tech.id, A.user, at('2026-05-01'));
    check('tenant cannot assign', !byTenant.ok && byTenant.reason === 'forbidden');
    const assigned = await mt.assignJob(j1.id, tech.id, manager, at('2026-05-01'));
    check('manager assigns a technician', assigned.ok && (await job(j1.id)).state === 'Assigned', assigned);
    const cancelAssigned = await mt.cancelJob(j1.id, A.user, at('2026-05-01'));
    check('tenant cannot cancel once assigned', !cancelAssigned.ok && cancelAssigned.reason === 'invalid_state');
    check('assigned technician now sees the tenant name', (await mt.listJobs(tech)).some((j) => j.id === j1.id && j.tenant_name));

    // ── Working ─────────────────────────────────────────────────────────────────
    console.log('Working');
    const finishEarly = await mt.finishJob(j1.id, tech, { note: 'x' }, at('2026-05-02'));
    check('cannot finish before starting (Assigned -> Done refused)', !finishEarly.ok && finishEarly.reason === 'invalid_state', finishEarly);
    const otherStart = await mt.startJob(j1.id, tech2, at('2026-05-02'));
    check('another technician cannot start it', !otherStart.ok && otherStart.reason === 'not_assignee', otherStart);
    const started = await mt.startJob(j1.id, tech, at('2026-05-02'));
    check('assigned technician starts', started.ok && (await job(j1.id)).state === 'InProgress', started);
    const finished = await mt.finishJob(j1.id, tech, { note: 'เปลี่ยนหลอดไฟ', photos: [png], chargeProposed: 500, chargeNote: 'หลอดแตก' }, at('2026-05-02'));
    check('assigned technician finishes with a proposed charge', finished.ok && (await job(j1.id)).state === 'Done', finished);
    check('tenant does not see the proposed charge', (await mt.listJobs(A.user)).find((j) => j.id === j1.id).charge.proposed === null);

    // ── Cancel / reject ─────────────────────────────────────────────────────────
    console.log('Cancel / reject');
    const j2 = await mt.createRequest(A.user, { kind: 'cleaning', description: 'ขอทำความสะอาด' }, at('2026-05-03'));
    const otherCancel = await mt.cancelJob(j2.id, B.user, at('2026-05-03'));
    check('other tenant cannot cancel it', !otherCancel.ok && otherCancel.reason === 'not_found');
    check('tenant cancels while Requested', (await mt.cancelJob(j2.id, A.user, at('2026-05-03'))).ok && (await job(j2.id)).state === 'Cancelled');
    const j3 = await mt.createRequest(B.user, { kind: 'repair', description: 'แอร์มีเสียง' }, at('2026-05-03'));
    const noReason = await mt.rejectJob(j3.id, '', manager, at('2026-05-03'));
    check('reject needs a reason', !noReason.ok && noReason.reason === 'reason_required');
    check('reject with a reason', (await mt.rejectJob(j3.id, 'เป็นเสียงปกติของเครื่อง', manager, at('2026-05-03'))).ok && (await job(j3.id)).state === 'Rejected');
    const startRejected = await mt.assignJob(j3.id, tech.id, owner, at('2026-05-03'));
    check('rejected job cannot be assigned', !startRejected.ok && startRejected.reason === 'invalid_state');

    // ── Charges ─────────────────────────────────────────────────────────────────
    console.log('Charges');
    const mgrCharge = await mt.decideCharge(j1.id, { amount: 400, reason: 'tenant_damage' }, manager, at('2026-05-04'));
    check('manager cannot decide the charge', !mgrCharge.ok && mgrCharge.reason === 'forbidden');
    const charged = await mt.decideCharge(j1.id, { amount: 400, reason: 'tenant_damage', note: 'ลดจาก 500' }, owner, at('2026-05-04'));
    const chargeBill = charged.ok ? (await q('SELECT * FROM bills WHERE id = ?', [charged.billId]))[0] : null;
    check('owner edits the amount: damage bill to the tenant of the contract', charged.ok && chargeBill && chargeBill.bill_type === 'damage' && Number(chargeBill.tenant_id) === A.tenantId && near(chargeBill.amount, 400), chargeBill || charged);
    await pay(charged.billId, 400, '2026-05-05');
    check('paid through recordPayment: Income Damage', near(await incomeOfBill(charged.billId, 'Damage'), 400));
    check('second decision refused', (await mt.decideCharge(j1.id, { amount: 1, reason: 'tenant_damage' }, owner, at('2026-05-04'))).reason === 'already_decided');

    const doneJob = async (u, kind, keeper, ymd, proposed) => {
      const r = await mt.createRequest(u, { kind, description: `${TAG} ${kind}` }, at(ymd));
      await mt.assignJob(r.id, keeper.id, owner, at(ymd));
      await mt.startJob(r.id, keeper, at(ymd));
      await mt.finishJob(r.id, keeper, { note: 'เสร็จ', chargeProposed: proposed }, at(ymd));
      return r.id;
    };
    const billsBefore = (await q('SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ?', [B.tenantId]))[0].n;
    const jZero = await doneJob(B.user, 'repair', tech, '2026-05-06', 300);
    const zero = await mt.decideCharge(jZero, { amount: 0, reason: 'tenant_damage' }, owner, at('2026-05-06'));
    const jWear = await doneJob(B.user, 'repair', tech, '2026-05-06', 300);
    const wear = await mt.decideCharge(jWear, { amount: 300, reason: 'wear_and_tear' }, owner, at('2026-05-06'));
    check('approved as 0 and wear_and_tear: no bill', zero.ok && !zero.billed && wear.ok && !wear.billed
      && (await q('SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ?', [B.tenantId]))[0].n === billsBefore, [zero, wear]);
    const jClean = await doneJob(B.user, 'cleaning', maid, '2026-05-07', 200);
    const service = await mt.decideCharge(jClean, { amount: 200, reason: 'service' }, owner, at('2026-05-07'));
    check('cleaning fee: service bill', service.ok && (await q('SELECT bill_type FROM bills WHERE id = ?', [service.billId]))[0].bill_type === 'service', service);
    await pay(service.billId, 200, '2026-05-08');
    check('paid: Income Service', near(await incomeOfBill(service.billId, 'Service'), 200));

    // ── Move-out: no double charge ───────────────────────────────────────────────
    console.log('Move-out job');
    const M = await tenancy('m', 'Active', '2025-10-01', '2026-09-30');
    const notice = await mo.requestMoveOut(M.user, { returnDate: '2026-09-30', promptpayTarget: '0800000000' }, at('2026-08-20'));
    const sid = notice.settlementId;
    const mj = await mt.staffCreate(owner, { kind: 'cleaning', description: 'ทำความสะอาดตอนย้ายออก', settlementId: sid }, at('2026-08-21'));
    check('owner opens a cleaning job of the move-out', mj.ok && Number((await job(mj.id)).move_out_settlement_id) === sid, mj);
    await mt.assignJob(mj.id, maid.id, owner, at('2026-08-21'));
    await mt.startJob(mj.id, maid, at('2026-08-21'));
    await mt.finishJob(mj.id, maid, { note: 'คราบหนัก', chargeProposed: 300 }, at('2026-08-21'));
    const tooEarly = await mt.decideCharge(mj.id, { amount: 300, reason: 'tenant_damage' }, owner, at('2026-08-22'));
    check('charge refused before the room is returned', !tooEarly.ok && tooEarly.reason === 'move_out_not_returned', tooEarly);
    await mo.recordReturn(sid, { returnDate: '2026-09-30', finalMeter: 100 }, owner, at('2026-09-30'));
    const damageBillsBefore = (await q("SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ? AND bill_type = 'damage'", [M.tenantId]))[0].n;
    const intoSettlement = await mt.decideCharge(mj.id, { amount: 300, reason: 'tenant_damage' }, owner, at('2026-09-30'));
    check('charge becomes a damage item of the settlement, no separate bill', intoSettlement.ok && intoSettlement.toSettlement
      && (await q("SELECT COUNT(*) AS n FROM bills WHERE tenant_id = ? AND bill_type = 'damage'", [M.tenantId]))[0].n === damageBillsBefore, intoSettlement);
    const view = await mo.getSettlement(sid, owner, at('2026-09-30'));
    check('settlement shows the job with its proposed charge', view.jobs.some((j) => j.id === mj.id && near(j.charge_proposed, 300) && j.charge_decided), view.jobs);
    const manual = await mo.setDamages(sid, [{ amount: 100, reason: 'กุญแจหาย' }], owner, at('2026-09-30'));
    check('owner damage items keep the job item (300 + 100)', manual.ok && near(manual.damageTotal, 400), manual);
    const settled = await mo.settleMoveOut(sid, owner, at('2026-10-01'));
    const finalAmount = Number((await q('SELECT COALESCE(SUM(amount), 0) AS s FROM bills WHERE tenant_id = ? AND bill_type = ?', [M.tenantId, 'move_out']))[0].s);
    check('deposit pays the job once (offset = final bill + 400)', settled.ok && near(settled.offsetTotal, finalAmount + 400), settled);
    const mj2 = await mt.staffCreate(owner, { kind: 'repair', description: 'ซ่อมหลังย้ายออก', roomId: M.room.id }, at('2026-10-02'));
    // linked to the same contract by hand: a job of this move-out finished after settling
    await q('UPDATE maintenance_requests SET contract_id = ?, tenant_id = ?, move_out_settlement_id = ? WHERE id = ?', [M.contractId, M.tenantId, sid, mj2.id]);
    await mt.assignJob(mj2.id, tech.id, owner, at('2026-10-02'));
    await mt.startJob(mj2.id, tech, at('2026-10-02'));
    await mt.finishJob(mj2.id, tech, { chargeProposed: 150 }, at('2026-10-02'));
    const after = await mt.decideCharge(mj2.id, { amount: 150, reason: 'tenant_damage' }, owner, at('2026-10-03'));
    const afterBill = after.ok && after.billId ? (await q('SELECT tenant_id, bill_type, status FROM bills WHERE id = ?', [after.billId]))[0] : null;
    check('after settling: a damage bill to the same contract tenant', after.ok && !after.toSettlement && afterBill && Number(afterBill.tenant_id) === M.tenantId && afterBill.bill_type === 'damage', afterBill || after);

    // ── Older jobs ──────────────────────────────────────────────────────────────
    console.log('Older jobs');
    const old = await q("INSERT INTO maintenance_requests (tenant_id, room_number, issue_type, description, status, dorm_id) VALUES (?, ?, 'ไฟฟ้า', ?, 'Pending', 1)", [A.tenantId, A.room.number, TAG]);
    check('older job is legacy and has no flow', (await mt.assignJob(old.insertId, tech.id, owner, at('2026-05-09'))).reason === 'legacy');
    check('manager cannot close it by hand', !(await mt.closeLegacy(old.insertId, { note: 'x' }, manager, at('2026-05-09'))).ok);
    check('owner closes it by hand with a note', (await mt.closeLegacy(old.insertId, { note: 'ซ่อมแล้วนอกระบบ' }, owner, at('2026-05-09'))).ok
      && String((await job(old.insertId)).status) === 'Completed');

    // ── Old keeper routes without a login ─────────────────────────────────────────
    if (process.env.BASE_URL) {
      console.log('Old keeper routes');
      for (const p of ['/api/keeper/maid/jobs', '/api/keeper/technician/jobs', '/api/keeper/dorms', '/api/keeper/jobs']) {
        const res = await fetch(`${process.env.BASE_URL}${p}`);
        check(`GET ${p} without a session -> 401`, res.status === 401, res.status);
      }
    } else {
      console.log('  - BASE_URL not set: 401 checks of the keeper routes skipped');
    }

    const added = listFiles(path.join(ROOT, 'public')).filter((f) => !publicBefore.has(f));
    check('no new files in public/', added.length === 0, added);
  } finally {
    const ids = (a) => (a.length ? a : [0]);
    const jobs = (await q('SELECT id FROM maintenance_requests WHERE tenant_id IN (?) OR room_number LIKE ?', [ids(created.tenants), `${ROOM_TAG}%`])).map((r) => r.id);
    const photos = (await q('SELECT file FROM maintenance_photos WHERE request_id IN (?)', [ids(jobs)])).map((r) => r.file);
    const bills = (await q('SELECT id FROM bills WHERE tenant_id IN (?)', [ids(created.tenants)])).map((r) => r.id);
    const payments = (await q('SELECT id FROM bill_payments WHERE bill_id IN (?)', [ids(bills)])).map((r) => r.id);
    const settlements = (await q('SELECT id FROM move_out_settlements WHERE tenant_id IN (?)', [ids(created.tenants)])).map((r) => r.id);
    await q("DELETE FROM accounting_transactions WHERE reference_type IN ('bill_payment','bill_payment_reversal') AND reference_id IN (?)", [ids(payments)]);
    await q("DELETE FROM accounting_transactions WHERE reference_type LIKE 'settlement\\_%' AND reference_id IN (?)", [ids(settlements)]);
    await q('DELETE FROM maintenance_photos WHERE request_id IN (?)', [ids(jobs)]);
    await q('DELETE FROM maintenance_requests WHERE id IN (?)', [ids(jobs)]);
    await q('DELETE FROM bill_status_history WHERE bill_id IN (?)', [ids(bills)]);
    await q('DELETE FROM bill_payments WHERE bill_id IN (?)', [ids(bills)]);
    await q('DELETE FROM bills WHERE id IN (?)', [ids(bills)]);
    await q('DELETE FROM meter_readings WHERE room_id IN (?)', [ids(created.rooms)]);
    await q('DELETE FROM move_out_settlements WHERE tenant_id IN (?)', [ids(created.tenants)]);
    await q('DELETE FROM move_out_requests WHERE tenant_id IN (?)', [ids(created.tenants)]);
    await q('DELETE FROM contracts WHERE tenant_id IN (?)', [ids(created.tenants)]);
    await q('DELETE FROM tenants WHERE id IN (?)', [ids(created.tenants)]);
    await q('DELETE FROM rooms WHERE id IN (?)', [ids(created.rooms)]);
    await q('DELETE FROM notifications WHERE user_id IN (?)', [ids(created.users)]).catch(() => {});
    await q('DELETE FROM keepers WHERE user_id IN (?)', [ids(created.users)]);
    await q('DELETE FROM users WHERE id IN (?)', [ids(created.users)]);
    for (const f of photos) fs.rmSync(path.join(STORAGE, f), { force: true });
    listFiles(STORAGE).filter((f) => !storageBefore.has(f)).forEach((f) => fs.rmSync(f, { force: true }));
    await db.end();
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => { console.error(error); process.exit(1); });
