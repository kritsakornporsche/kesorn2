#!/usr/bin/env node
// Test 12a: move-out notice, room return, final bill, deposit settlement and refund (lib/moveOut.ts), called through
// jiti with `now` given by the test. Needs migrations 001–012 and DATABASE_URL (a development database, never
// production). Creates zz-test-* accounts, test rooms (room_number ZZ…), contracts and bills of its own, and removes
// them (with their accounting rows and files) at the end.
//
// Run: DATABASE_URL=mysql://user:pass@localhost:3306/kesorn_db node scripts/tests/test_c12.js

const path = require('path');
const fs = require('fs');
const mysql = require('mysql2/promise');
const { createJiti } = require('jiti');

const ROOT = path.resolve(__dirname, '..', '..');
const jiti = createJiti(__filename, { alias: { '@': ROOT } });
const STORAGE = path.join(ROOT, 'storage', 'move-out');
const TAG = `zz-test-c12-${Date.now()}`;
const ROOM_TAG = `ZZ${String(Date.now()).slice(-5)}`;

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
const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
// Thai noon of a date: the `now` passed to the lib
const at = (ymd) => new Date(`${ymd}T12:00:00+07:00`);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF');
const pdfUrl = `data:application/pdf;base64,${PDF.toString('base64')}`;

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).map((f) => path.join(dir, f));
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is not set');
    process.exit(2);
  }
  const db = await mysql.createConnection({ uri: process.env.DATABASE_URL, timezone: '+07:00' });
  const q = async (text, params = []) => (await db.query(text, params))[0];

  const mo = await jiti.import(path.join(ROOT, 'lib', 'moveOut.ts'));
  const { recordPayment } = await jiti.import(path.join(ROOT, 'lib', 'payments.ts'));
  const { unpayBill } = await jiti.import(path.join(ROOT, 'lib', 'bill-status.ts'));
  const billing = await jiti.import(path.join(ROOT, 'lib', 'billing.ts'));
  const { ROOM_HOLDING_STATUSES } = await jiti.import(path.join(ROOT, 'lib', 'contracts.ts'));
  const { getDb } = await jiti.import(path.join(ROOT, 'lib', 'db.ts'));
  const rates = await billing.getRates(getDb());

  const storageBefore = new Set(listFiles(STORAGE));
  const created = { users: [], tenants: [], rooms: [], contracts: [], bills: [], settlements: [], requests: [] };

  // ── Helpers to build data ──────────────────────────────────────────────────────
  const user = async (key, role) => {
    const email = `${TAG}-${key}@example.com`;
    const r = await q('INSERT INTO users (name, email, password, phone, role, primary_role) VALUES (?, ?, ?, ?, ?, ?)',
      [`${TAG} ${key}`, email, 'x', '0000000000', role, role]);
    created.users.push(r.insertId);
    return { id: r.insertId, email, role, name: `${TAG} ${key}` };
  };
  let roomSeq = 0;
  const room = async (price) => {
    roomSeq++;
    const r = await q("INSERT INTO rooms (room_number, floor, room_type, price, status, dorm_id, deposit_amount) VALUES (?, 9, 'test', ?, 'Occupied', 1, 3000)",
      [`${ROOM_TAG}${roomSeq}`, price]);
    created.rooms.push(r.insertId);
    return { id: r.insertId, number: `${ROOM_TAG}${roomSeq}`, price };
  };
  const bill = async (tenantId, roomNumber, fields) => {
    const f = { amount: 0, room_amount: 0, bill_type: 'monthly', is_first_bill: 0, billing_cycle: '2026-01', due_date: '2026-01-05', status: 'Unpaid', ...fields };
    const r = await q(
      `INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, room_amount, water_amount, electric_amount, water_units, electric_units,
         billing_cycle, due_date, status, is_first_bill, bill_type, slip_verified)
       VALUES (?, 1, ?, ?, ?, ?, 0, 0, 0, 0, ?, ?, ?, ?, ?, 0)`,
      [tenantId, roomNumber, `${TAG} ${f.bill_type} ${f.billing_cycle}`, f.amount, f.room_amount, f.billing_cycle, f.due_date, f.status, f.is_first_bill, f.bill_type]
    );
    created.bills.push(r.insertId);
    return r.insertId;
  };
  const pay = async (billId, amount, ymd) => {
    const r = await recordPayment(billId, { amount, method: 'cash', paidAt: at(ymd), recordedBy: null });
    if (!r.ok) throw new Error(`setup payment failed for bill ${billId}: ${JSON.stringify(r)}`);
  };

  /**
   * A tenant with an Active contract. deposit: 'system' (booking 1,000 + move-in 2,000 paid through recordPayment),
   * 'outside' (deposit_outside_system) or 'legacy' (no linked bills).
   */
  const tenancy = async (key, { price = 1000, start, end, deposit = 'system', renewed = false }) => {
    const u = await user(key, 'tenant');
    const rm = await room(price);
    const t = await q("INSERT INTO tenants (name, email, user_id, room_id, status, dorm_id) VALUES (?, ?, ?, ?, 'active', 1)", [u.name, u.email, u.id, rm.id]);
    created.tenants.push(t.insertId);
    const newContract = async (status, s, e, parent) => {
      const c = await q(
        `INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, occupants, start_meter_reading,
           deposit_outside_system, parent_contract_id) VALUES (?, ?, ?, ?, 3000, ?, 1, 100, ?, ?)`,
        [t.insertId, rm.id, s, e, status, deposit === 'outside' ? 1 : 0, parent || null]
      );
      created.contracts.push(c.insertId);
      return c.insertId;
    };
    const first = await newContract(renewed ? 'Renewed' : 'Active', start, end);
    if (deposit === 'system') {
      const booking = await bill(t.insertId, rm.number, { amount: 1000, bill_type: 'booking', billing_cycle: 'จอง', due_date: start });
      await pay(booking, 1000, start);
      const moveIn = await bill(t.insertId, rm.number, { amount: price + 2000, room_amount: price, bill_type: 'booking', is_first_bill: 1, billing_cycle: 'ค่าแรกเข้า', due_date: start });
      await pay(moveIn, price + 2000, start);
      await q('UPDATE contracts SET booking_bill_id = ?, move_in_bill_id = ? WHERE id = ?', [booking, moveIn, first]);
    }
    let contractId = first;
    if (renewed) contractId = await newContract('Active', end, '2027-12-31', first);
    return { user: u, room: rm, tenantId: t.insertId, contractId, firstContractId: first };
  };

  /** Liability of a contract as the lib counts it (deposit bills of the chain + its settlement rows). */
  const liability = async (contractIds, settlementId) => {
    const rows = await q('SELECT booking_bill_id, move_in_bill_id FROM contracts WHERE id IN (?)', [contractIds]);
    const billIds = rows.flatMap((r) => [r.booking_bill_id, r.move_in_bill_id]).filter(Boolean);
    const ids = billIds.length ? billIds : [0];
    const r = await q(
      `SELECT COALESCE(SUM(amount), 0) AS held FROM accounting_transactions WHERE type = 'Liability' AND (
         (reference_type IN ('bill_payment','bill_payment_reversal') AND reference_id IN (SELECT id FROM bill_payments WHERE bill_id IN (?)))
         OR (reference_type = 'booking_forfeit' AND reference_id IN (?))
         OR (reference_type LIKE 'settlement\\_%' AND reference_id = ?))`,
      [ids, ids, settlementId]
    );
    return Number(r[0].held);
  };
  const settlementRow = async (id) => (await q('SELECT * FROM move_out_settlements WHERE id = ?', [id]))[0];
  const notice = async (u, returnDate, noticeYmd) => {
    const r = await mo.requestMoveOut(u, { returnDate, reason: 'test', promptpayTarget: '0800000000' }, at(noticeYmd));
    if (r.ok) { created.settlements.push(r.settlementId); created.requests.push(r.requestId); }
    return r;
  };

  try {
    const owner = await user('owner', 'owner');
    const manager = await user('manager', 'manager');
    const fullRent = (price, units) => billing.calcMonthlyBill({ roomPrice: price, unitsUsed: units, occupants: 1, rates }).total;
    const elec = (units) => Math.round(units * billing.ratesForRoom(rates, 'x').electricityPerUnit * 100) / 100;

    // ── A: full term, nothing deducted (return month already billed, no units) → refund 3,000 within 7 days ──
    console.log('A. Full term, no deduction');
    const A = await tenancy('a', { start: '2025-11-01', end: '2026-10-31' });
    const aMonthly = await bill(A.tenantId, A.room.number, { amount: 1500, room_amount: 1000, billing_cycle: '2026-10', due_date: '2026-10-05' });
    await pay(aMonthly, 1500, '2026-10-03');
    const aNotice = await notice(A.user, '2026-10-31', '2026-09-20');
    check('notice accepted, no warning for 41 days', aNotice.ok && aNotice.warnings.length === 0, aNotice);
    check('contract still Active while notified', (await q('SELECT status FROM contracts WHERE id = ?', [A.contractId]))[0].status === 'Active');
    const aAgain = await notice(A.user, '2026-10-31', '2026-09-21');
    check('second notice refused', !aAgain.ok && aAgain.reason === 'already_requested', aAgain);
    const aRet = await mo.recordReturn(aNotice.settlementId, { returnDate: '2026-10-31', finalMeter: 100 }, manager, at('2026-10-31'));
    check('manager records the return', aRet.ok, aRet);
    check('no final bill when nothing is unbilled', aRet.ok && aRet.finalBillId === null && aRet.monthBilled);
    check('contract Ended and not holding the room', (await q('SELECT status FROM contracts WHERE id = ?', [A.contractId]))[0].status === 'Ended' && !ROOM_HOLDING_STATUSES.includes('Ended'));
    check('room Available', (await q('SELECT status FROM rooms WHERE id = ?', [A.room.id]))[0].status === 'Available');
    const aPriced = await billing.priceMonthlyBill(getDb(), A.room.number, '2026-10');
    check('no more monthly bill for the room (no Active contract)', String(aPriced.error || '').includes('ไม่มีสัญญา'), aPriced);
    const aMgrSettle = await mo.settleMoveOut(aNotice.settlementId, manager, at('2026-11-01'));
    check('manager cannot settle', !aMgrSettle.ok && aMgrSettle.reason === 'forbidden');
    const aMgrView = await mo.getSettlement(aNotice.settlementId, manager, at('2026-11-01'));
    check('manager does not see deposit / refund', aMgrView && aMgrView.money === null);
    const aSettle = await mo.settleMoveOut(aNotice.settlementId, owner, at('2026-11-01'));
    check('refund 3,000, due in 7 days', aSettle.ok && near(aSettle.refund, 3000) && aSettle.refundDueDate === '2026-11-07', aSettle);
    const aView = await mo.getSettlement(aNotice.settlementId, owner, at('2026-11-06'));
    check('due date warning: soon', aView.money.refund_due_status === 'soon', aView.money);
    check('due date warning: overdue', (await mo.getSettlement(aNotice.settlementId, owner, at('2026-11-08'))).money.refund_due_status === 'overdue');
    const aMgrRefund = await mo.recordRefund(aNotice.settlementId, { file: pdfUrl }, manager, at('2026-11-02'));
    check('manager cannot refund', !aMgrRefund.ok && aMgrRefund.reason === 'forbidden');
    const aBadFile = await mo.recordRefund(aNotice.settlementId, { file: `data:image/png;base64,${Buffer.from('nope').toString('base64')}` }, owner, at('2026-11-02'));
    check('fake slip refused', !aBadFile.ok && aBadFile.reason === 'bad_file');
    const aRefund = await mo.recordRefund(aNotice.settlementId, { file: pdfUrl }, owner, at('2026-11-02'));
    check('owner records the refund, closed', aRefund.ok && (await settlementRow(aNotice.settlementId)).state === 'Closed', aRefund);
    check('A: Liability 0 after close', (await liability([A.contractId], aNotice.settlementId)) === 0);
    check('A: tenant back to guest', (await q('SELECT role FROM users WHERE id = ?', [A.user.id]))[0].role === 'guest');
    check('refund slip stored outside public/', fs.existsSync(path.join(STORAGE, (await settlementRow(aNotice.settlementId)).refund_file)));

    // ── B: full term with deductions (overdue bill + final bill with rent + damage) → rest within 14 days ──
    console.log('B. Full term with deductions');
    const B = await tenancy('b', { price: 1000, start: '2025-10-01', end: '2026-09-30' });
    // Overdue setup bills are 'service' bills: no late fee, so the expected amounts stay exact
    const bOverdue = await bill(B.tenantId, B.room.number, { amount: 500, bill_type: 'service', billing_cycle: '2026-08', due_date: '2026-08-05' });
    const bNotice = await notice(B.user, '2026-09-30', '2026-08-20');
    const bRet = await mo.recordReturn(bNotice.settlementId, { returnDate: '2026-09-30', finalMeter: 110 }, owner, at('2026-09-30'));
    const bFinal = fullRent(1000, 10);
    check('final bill = rent + electricity + water + common (month not billed)', bRet.ok && near(bRet.finalAmount, bFinal) && !bRet.monthBilled, bRet);
    const bPriced = await billing.priceMonthlyBill(getDb(), B.room.number, '2026-09');
    check('returning before the 28th: no monthly bill afterwards', String(bPriced.error || '').includes('ไม่มีสัญญา'), bPriced);
    const bMgrDamage = await mo.setDamages(bNotice.settlementId, [{ amount: 300, reason: 'ผ้าม่านขาด' }], manager, at('2026-09-30'));
    check('manager cannot set damages', !bMgrDamage.ok && bMgrDamage.reason === 'forbidden');
    const bBadDamage = await mo.setDamages(bNotice.settlementId, [{ amount: 300, reason: '' }], owner, at('2026-09-30'));
    check('damage without a reason refused', !bBadDamage.ok && bBadDamage.reason === 'bad_damage');
    const bDamage = await mo.setDamages(bNotice.settlementId, [{ amount: 300, reason: 'ผ้าม่านขาด' }], owner, at('2026-09-30'));
    check('owner sets damages', bDamage.ok && near(bDamage.damageTotal, 300), bDamage);
    const bSettle = await mo.settleMoveOut(bNotice.settlementId, owner, at('2026-10-01'));
    const bDeducted = 500 + bFinal + 300;
    check('deductions offset, rest refunded within 14 days', bSettle.ok && near(bSettle.offsetTotal, bDeducted) && near(bSettle.refund, 3000 - bDeducted) && bSettle.refundDueDate === '2026-10-14', bSettle);
    const offsets = await q("SELECT method, amount FROM bill_payments WHERE bill_id IN (?) AND voided_at IS NULL AND method = 'deposit_offset'", [[bOverdue, bRet.finalBillId, bDamage.damageBillId]]);
    check('every deducted bill paid through recordPayment (deposit_offset)', offsets.length === 3);
    const damageIncome = await q("SELECT SUM(amount) AS s FROM accounting_transactions WHERE type = 'Income' AND category = 'Damage' AND reference_type = 'bill_payment' AND reference_id IN (SELECT id FROM bill_payments WHERE bill_id = ?)", [bDamage.damageBillId]);
    check('damage is Income', near(damageIncome[0].s, 300));
    const unpay = await unpayBill(bOverdue, 'test', owner.id);
    check('unpay of a deposit_offset payment refused', !unpay.ok && unpay.reason === 'deposit_offset', unpay);
    await mo.recordRefund(bNotice.settlementId, { file: pdfUrl }, owner, at('2026-10-05'));
    check('B: Liability 0 after close', (await liability([B.contractId], bNotice.settlementId)) === 0);

    // ── K: late fee of an overdue monthly bill stops at the return date, however late the owner settles ──
    console.log('K. Late fee up to the return date');
    const lateCase = async (key, settleYmd) => {
      const T = await tenancy(key, { price: 1000, start: '2025-10-01', end: '2026-09-30' });
      const monthly = await bill(T.tenantId, T.room.number, { amount: 500, room_amount: 500, billing_cycle: '2026-09', due_date: '2026-09-25' });
      const n = await notice(T.user, '2026-09-30', '2026-08-20');
      const r = await mo.recordReturn(n.settlementId, { returnDate: '2026-09-30', finalMeter: 100 }, owner, at('2026-09-30'));
      const preview = await mo.getSettlement(n.settlementId, owner, at(settleYmd));
      const st = await mo.settleMoveOut(n.settlementId, owner, at(settleYmd));
      const penalty = Number((await q('SELECT penalty_amount FROM bills WHERE id = ?', [monthly]))[0].penalty_amount);
      const paidAt = billing.bangkokDate((await q("SELECT paid_at FROM bill_payments WHERE bill_id = ? AND method = 'deposit_offset'", [monthly]))[0].paid_at);
      if (st.ok && st.refund > 0) await mo.recordRefund(n.settlementId, { file: pdfUrl }, owner, at(settleYmd));
      return { preview, st, penalty, paidAt, final: r.finalAmount, contractId: T.contractId, settlementId: n.settlementId };
    };
    const kSame = await lateCase('k1', '2026-09-30');
    const kLate = await lateCase('k2', '2026-10-10');
    const fiveDays = 5 * rates.lateFeePerDay;
    check('late fee counted to the return date (5 days)', near(kSame.penalty, fiveDays) && near(kLate.penalty, fiveDays), [kSame.penalty, kLate.penalty]);
    check('settling 10 days later deducts the same', kSame.st.ok && kLate.st.ok && near(kSame.st.offsetTotal, kLate.st.offsetTotal) && near(kLate.st.offsetTotal, 500 + fiveDays + kLate.final), [kSame.st, kLate.st]);
    check('preview shows the same amount as the settlement', near(kLate.preview.money.offset, kLate.st.offsetTotal) && near(kLate.preview.outstanding_total, kLate.st.offsetTotal), kLate.preview && kLate.preview.money);
    check('payment time is the settle date', kLate.paidAt === '2026-10-10', kLate.paidAt);
    check('K: Liability 0 after close', (await liability([kLate.contractId], kLate.settlementId)) === 0);

    // ── C: early, clause 13 met → refund; return month already billed → only the electricity difference ──
    console.log('C. Early move-out meeting clause 13');
    const C = await tenancy('c', { start: '2026-01-01', end: '2026-12-31' });
    const cMonthly = await bill(C.tenantId, C.room.number, { amount: 1500, room_amount: 1000, billing_cycle: '2026-10', due_date: '2026-10-05' });
    await pay(cMonthly, 1500, '2026-10-02');
    const cNotice = await notice(C.user, '2026-10-15', '2026-09-01');
    check('early notice warns about the deposit', cNotice.ok && cNotice.warnings.some((w) => w.includes('ก่อนครบสัญญา')), cNotice);
    const cRet = await mo.recordReturn(cNotice.settlementId, { returnDate: '2026-10-15', finalMeter: 120 }, owner, at('2026-10-15'));
    const cBill = (await q('SELECT room_amount, water_amount, common_fee, electric_amount FROM bills WHERE id = ?', [cRet.finalBillId]))[0];
    check('already billed month: no rent / water / common again', cRet.ok && cRet.monthBilled && Number(cBill.room_amount) === 0 && Number(cBill.water_amount) === 0 && Number(cBill.common_fee) === 0 && near(cBill.electric_amount, elec(20)), cBill);
    check('clause 13: all three met', cRet.clause13.early && cRet.clause13.half && cRet.clause13.notice && cRet.clause13.noArrears && cRet.clause13.refundable, cRet.clause13);
    const cSettle = await mo.settleMoveOut(cNotice.settlementId, owner, at('2026-10-16'));
    check('refund = deposit − electricity', cSettle.ok && near(cSettle.refund, 3000 - elec(20)) && near(cSettle.forfeit, 0), cSettle);
    await mo.recordRefund(cNotice.settlementId, { file: pdfUrl }, owner, at('2026-10-20'));
    check('C: Liability 0 after close', (await liability([C.contractId], cNotice.settlementId)) === 0);

    // ── D: early, each clause 13 condition missing → forfeit after deductions ──
    const forfeitCase = async (label, key, opts, expect) => {
      console.log(`D. Early move-out, ${label}`);
      const T = await tenancy(key, { start: opts.start, end: opts.end });
      if (opts.arrears) await bill(T.tenantId, T.room.number, { amount: 400, bill_type: 'service', billing_cycle: '2026-08', due_date: '2026-08-05' });
      if (opts.billedMonth) await pay(await bill(T.tenantId, T.room.number, { amount: 1500, room_amount: 1000, billing_cycle: '2026-10', due_date: '2026-10-05' }), 1500, '2026-10-02');
      const n = await notice(T.user, '2026-10-15', opts.notice);
      const r = await mo.recordReturn(n.settlementId, { returnDate: '2026-10-15', finalMeter: 100, paperNoticeDate: opts.paper }, owner, at('2026-10-15'));
      check(`${label}: clause 13 result`, r.ok && r.clause13[expect.flag] === expect.value && r.clause13.refundable === expect.refundable, r.clause13 || r);
      const st = await mo.settleMoveOut(n.settlementId, owner, at('2026-10-16'));
      if (expect.refundable) {
        check(`${label}: refunded`, st.ok && st.refund > 0 && st.forfeit === 0, st);
        await mo.recordRefund(n.settlementId, { file: pdfUrl }, owner, at('2026-10-17'));
      } else {
        check(`${label}: rest forfeited, closed`, st.ok && st.refund === 0 && near(st.forfeit + st.offsetTotal, 3000) && st.closed, st);
        const inc = await q("SELECT SUM(amount) AS s FROM accounting_transactions WHERE type = 'Income' AND category = 'ริบเงินประกัน' AND reference_type = 'settlement_forfeit' AND reference_id = ?", [n.settlementId]);
        check(`${label}: forfeit is Income`, near(inc[0].s, st.forfeit));
      }
      check(`${label}: Liability 0 after close`, (await liability([T.contractId], n.settlementId)) === 0);
    };
    await forfeitCase('(ก) stayed less than half', 'd1', { start: '2026-08-01', end: '2027-07-31', notice: '2026-09-01' }, { flag: 'half', value: false, refundable: false });
    await forfeitCase('(ข) notice under 30 days', 'd2', { start: '2026-01-01', end: '2026-12-31', notice: '2026-10-01', billedMonth: true }, { flag: 'notice', value: false, refundable: false });
    await forfeitCase('(ข) paper notice received earlier', 'd2b', { start: '2026-01-01', end: '2026-12-31', notice: '2026-10-01', paper: '2026-09-10', billedMonth: true }, { flag: 'notice', value: true, refundable: true });
    await forfeitCase('(ค) overdue bill at notice', 'd3', { start: '2026-01-01', end: '2026-12-31', notice: '2026-09-01', arrears: true, billedMonth: true }, { flag: 'noArrears', value: false, refundable: false });

    // ── E: deductions larger than the deposit → deposit used up, bill left Partial, Liability 0 ──
    console.log('E. Deductions over the deposit');
    const E = await tenancy('e', { price: 5000, start: '2025-10-01', end: '2026-09-30' });
    await bill(E.tenantId, E.room.number, { amount: 2000, bill_type: 'service', billing_cycle: '2026-08', due_date: '2026-08-05' });
    const eNotice = await notice(E.user, '2026-09-30', '2026-08-20');
    const eRet = await mo.recordReturn(eNotice.settlementId, { returnDate: '2026-09-30', finalMeter: 100 }, owner, at('2026-09-30'));
    const eSettle = await mo.settleMoveOut(eNotice.settlementId, owner, at('2026-10-01'));
    check('deposit fully offset, nothing refunded, closed', eSettle.ok && near(eSettle.offsetTotal, 3000) && eSettle.refund === 0 && eSettle.closed, eSettle);
    check('tenant still owes the rest', eSettle.ok && near(eSettle.tenantStillOwes, 2000 + eRet.finalAmount - 3000), eSettle);
    check('final bill left Partial', String((await q('SELECT status FROM bills WHERE id = ?', [eRet.finalBillId]))[0].status).toLowerCase() === 'partial');
    check('E: Liability 0 after close', (await liability([E.contractId], eNotice.settlementId)) === 0);

    // ── F: deposit received outside the system; another contract still holds the room ──
    console.log('F. Deposit outside the system, room held by another contract');
    const F = await tenancy('f', { start: '2025-10-01', end: '2026-09-30', deposit: 'outside' });
    const holder = await q("INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status) VALUES (?, ?, '2026-10-01', '2027-09-30', 0, 'PendingContract')", [F.tenantId, F.room.id]);
    created.contracts.push(holder.insertId);
    const fNotice = await notice(F.user, '2026-09-30', '2026-08-20');
    await mo.recordReturn(fNotice.settlementId, { returnDate: '2026-09-30', finalMeter: 100 }, owner, at('2026-09-30'));
    check('room not released while another contract holds it', (await q('SELECT status FROM rooms WHERE id = ?', [F.room.id]))[0].status === 'Occupied');
    await q("UPDATE contracts SET status = 'Cancelled' WHERE id = ?", [holder.insertId]);
    const fSettle = await mo.settleMoveOut(fNotice.settlementId, owner, at('2026-10-01'));
    check('outside deposit uses the contract amount', fSettle.ok && near(fSettle.deposit, 3000) && near(fSettle.refund, 3000 - (fSettle.offsetTotal || 0)), fSettle);
    await mo.recordRefund(fNotice.settlementId, { file: pdfUrl }, owner, at('2026-10-02'));
    check('F: Liability 0 after close', (await liability([F.contractId], fNotice.settlementId)) === 0);

    // ── G: older contract (no Liability) → owner must confirm; booked as income → deposit_reclass ──
    console.log('G. Older contract, deposit confirmed by hand');
    const G = await tenancy('g', { start: '2025-10-01', end: '2026-09-30', deposit: 'legacy' });
    const gNotice = await notice(G.user, '2026-09-30', '2026-08-20');
    await mo.recordReturn(gNotice.settlementId, { returnDate: '2026-09-30', finalMeter: 100 }, owner, at('2026-09-30'));
    const gEarly = await mo.settleMoveOut(gNotice.settlementId, owner, at('2026-10-01'));
    check('settle refused before the owner confirms', !gEarly.ok && gEarly.reason === 'deposit_unconfirmed', gEarly);
    const gMgr = await mo.confirmLegacyDeposit(gNotice.settlementId, { amount: 3000, recordedAs: 'income', note: 'ใบเสร็จ 123' }, manager, at('2026-10-01'));
    check('manager cannot confirm the deposit', !gMgr.ok && gMgr.reason === 'forbidden');
    const gNoNote = await mo.confirmLegacyDeposit(gNotice.settlementId, { amount: 3000, recordedAs: 'income', note: '' }, owner, at('2026-10-01'));
    check('confirmation needs a note', !gNoNote.ok);
    const gConfirm = await mo.confirmLegacyDeposit(gNotice.settlementId, { amount: 3000, recordedAs: 'income', note: 'ใบเสร็จ 123' }, owner, at('2026-10-01'));
    check('owner confirms 3,000', gConfirm.ok);
    const gSettle = await mo.settleMoveOut(gNotice.settlementId, owner, at('2026-10-01'));
    check('settled from the confirmed amount', gSettle.ok && near(gSettle.deposit, 3000), gSettle);
    const reclass = await q("SELECT type, SUM(amount) AS s FROM accounting_transactions WHERE reference_type = 'settlement_opening' AND reference_id = ? GROUP BY type", [gNotice.settlementId]);
    check('reclass: Income −3,000 (deposit_reclass) and Liability +3,000',
      reclass.some((r) => r.type === 'Income' && near(r.s, -3000)) && reclass.some((r) => r.type === 'Liability' && near(r.s, 3000)), reclass);
    const reclassCat = await q("SELECT DISTINCT category FROM accounting_transactions WHERE reference_type = 'settlement_opening' AND type = 'Income' AND reference_id = ?", [gNotice.settlementId]);
    check('reclass row uses category deposit_reclass', reclassCat.length === 1 && reclassCat[0].category === 'deposit_reclass');
    if (gSettle.ok && gSettle.refund > 0) await mo.recordRefund(gNotice.settlementId, { file: pdfUrl }, owner, at('2026-10-02'));
    check('G: Liability 0 after close', (await liability([G.contractId], gNotice.settlementId)) === 0);

    // ── H: renewed contract → deposit found through parent_contract_id ──
    console.log('H. Renewed contract');
    const H = await tenancy('h', { start: '2024-12-31', end: '2025-12-31', renewed: true });
    const hNotice = await notice(H.user, '2026-11-30', '2026-10-01');
    const hView = await mo.getSettlement(hNotice.settlementId, owner, at('2026-10-01'));
    check('deposit of the renewed contract is 3,000', hView && near(hView.money.deposit, 3000) && hView.money.deposit_source === 'system', hView && hView.money);
    // other tenant cannot see or cancel; the tenant can withdraw before the return
    check('another tenant cannot see it', (await mo.getSettlement(hNotice.settlementId, A.user, at('2026-10-02'))) === null);
    const hOther = await mo.cancelMoveOut(hNotice.settlementId, B.user, at('2026-10-02'));
    check('another tenant cannot cancel it', !hOther.ok && hOther.reason === 'not_found');
    const hCancel = await mo.cancelMoveOut(hNotice.settlementId, H.user, at('2026-10-02'));
    check('tenant withdraws the notice; contract stays Active', hCancel.ok && (await q('SELECT status FROM contracts WHERE id = ?', [H.contractId]))[0].status === 'Active');
    check('H: Liability unchanged (3,000 held)', (await liability([H.contractId, H.firstContractId], hNotice.settlementId)) === 3000);

    // ── I: short notice warning ──
    console.log('I. Short notice');
    const I = await tenancy('i', { start: '2025-10-01', end: '2026-10-31' });
    const iNotice = await notice(I.user, '2026-10-31', '2026-10-21');
    check('less than 30 days allowed with a warning', iNotice.ok && iNotice.warnings.some((w) => w.includes('30')), iNotice);

    // ── J: request from before commit 12 (no settlement) on a MoveOutPending contract ──
    console.log('J. Older move-out request');
    const J = await tenancy('j', { start: '2025-10-01', end: '2026-09-30' });
    await q("UPDATE contracts SET status = 'MoveOutPending' WHERE id = ?", [J.contractId]);
    const jReq = await q("INSERT INTO move_out_requests (tenant_id, room_id, move_out_date, desired_date, status, contract_id, settlement_status) VALUES (?, ?, '2026-09-30', '2026-09-30', 'Pending', ?, 'PendingMeter')", [J.tenantId, J.room.id, J.contractId]);
    created.requests.push(jReq.insertId);
    check('MoveOutPending still holds the room', ROOM_HOLDING_STATUSES.includes('MoveOutPending'));
    const jNotice = await notice(J.user, '2026-09-30', '2026-09-01');
    check('new notice refused: handled by hand', !jNotice.ok && jNotice.reason === 'legacy_request', jNotice);
    const jList = await mo.listMoveOuts(owner, at('2026-09-01'));
    check('listed as legacy', jList.some((r) => r.request_id === jReq.insertId && r.legacy && r.legacy_open));
    check('manager cannot close it', !(await mo.closeLegacyRequest(jReq.insertId, { note: 'x' }, manager, at('2026-10-01'))).ok);
    check('owner must give a note', (await mo.closeLegacyRequest(jReq.insertId, { note: '' }, owner, at('2026-10-01'))).reason === 'note_required');
    const accBefore = (await q('SELECT COUNT(*) AS n FROM accounting_transactions'))[0].n;
    const jClose = await mo.closeLegacyRequest(jReq.insertId, { note: 'คืนเงินประกันด้วยมือแล้ว' }, owner, at('2026-10-01'));
    check('owner closes it by hand', jClose.ok && (await q('SELECT status FROM contracts WHERE id = ?', [J.contractId]))[0].status === 'Ended', jClose);
    check('no money moved', (await q('SELECT COUNT(*) AS n FROM accounting_transactions'))[0].n === accBefore);
  } finally {
    // ── Cleanup: only what this test created ─────────────────────────────────────
    const ids = (a) => (a.length ? a : [0]);
    const bills = (await q('SELECT id FROM bills WHERE tenant_id IN (?)', [ids(created.tenants)])).map((r) => r.id);
    const payments = (await q('SELECT id FROM bill_payments WHERE bill_id IN (?)', [ids(bills)])).map((r) => r.id);
    const settlements = (await q('SELECT id, refund_file FROM move_out_settlements WHERE tenant_id IN (?)', [ids(created.tenants)]));
    await q("DELETE FROM accounting_transactions WHERE reference_type IN ('bill_payment','bill_payment_reversal') AND reference_id IN (?)", [ids(payments)]);
    await q("DELETE FROM accounting_transactions WHERE reference_type LIKE 'settlement\\_%' AND reference_id IN (?)", [ids(settlements.map((s) => s.id))]);
    await q("DELETE FROM accounting_transactions WHERE reference_type = 'booking_forfeit' AND reference_id IN (?)", [ids(bills)]);
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
    await q('DELETE FROM user_dorm_roles WHERE user_id IN (?)', [ids(created.users)]).catch(() => {});
    await q('DELETE FROM users WHERE id IN (?)', [ids(created.users)]);
    for (const s of settlements) if (s.refund_file) fs.rmSync(path.join(STORAGE, s.refund_file), { force: true });
    listFiles(STORAGE).filter((f) => !storageBefore.has(f)).forEach((f) => fs.rmSync(f, { force: true }));
    await db.end();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
