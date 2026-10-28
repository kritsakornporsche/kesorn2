#!/usr/bin/env node
/**
 * 20-Room MIS Seed Script (KESORN 2 SMARTDOM)
 * Populates 20 rooms (101-110, 201-210) + T01 with:
 * - Tenant accounts (password: password123)
 * - Full contract lifecycle across all 10 scenarios
 * - 12 months of historical meter readings (2025-11 to 2026-10) with seasonal curves
 * - Historical and current monthly bills with payments, overdue penalties, and disputes
 */

const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const path = require('path');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });
if (!process.env.DATABASE_URL) {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
}

const PASSWORD_HASH = bcrypt.hashSync('password123', 10);

const ROOMS_CONFIG = [
  // Floor 1 (101 - 110)
  { num: '101', floor: 1, type: 'Standard', rent: 3200, dep: 3000, caseType: 'NORMAL_PAID', tenant: { name: 'นายสมชาย สายเสมอ', email: 'tenant101@kesorn.com', phone: '081-111-0101' }, startKwh: 1420 },
  { num: '102', floor: 1, type: 'Standard', rent: 3200, dep: 3000, caseType: 'NORMAL_PAID', tenant: { name: 'นางสาวกานดา สดใส', email: 'tenant102@kesorn.com', phone: '081-111-0102' }, startKwh: 2150 },
  { num: '103', floor: 1, type: 'Standard', rent: 3200, dep: 3000, caseType: 'ROLLOVER', tenant: { name: 'นายธนากร มั่งมี', email: 'tenant103@kesorn.com', phone: '081-111-0103' }, startKwh: 9820 },
  { num: '104', floor: 1, type: 'Standard', rent: 3200, dep: 3000, caseType: 'OVERDUE_1M', tenant: { name: 'นายพิเชษฐ์ ลืมจ่าย', email: 'tenant104@kesorn.com', phone: '081-111-0104' }, startKwh: 1780 },
  { num: '105', floor: 1, type: 'Deluxe', rent: 3800, dep: 3500, caseType: 'NORMAL_PAID', tenant: { name: 'นายณัฐพล คนขยัน', email: 'tenant105@kesorn.com', phone: '081-111-0105' }, startKwh: 3120 },
  { num: '106', floor: 1, type: 'Deluxe', rent: 3800, dep: 3500, caseType: 'NORMAL_PAID', tenant: { name: 'นางสาวพิมพา พรทิพย์', email: 'tenant106@kesorn.com', phone: '081-111-0106' }, startKwh: 2450 },
  { num: '107', floor: 1, type: 'Deluxe', rent: 3800, dep: 3500, caseType: 'DISPUTE', tenant: { name: 'นายวีรชัย ชอบสงสัย', email: 'tenant107@kesorn.com', phone: '081-111-0107' }, startKwh: 4210 },
  { num: '108', floor: 1, type: 'Deluxe', rent: 3800, dep: 3500, caseType: 'NOTICE_MOVEOUT', tenant: { name: 'นางสาวลลิตา จะย้ายแล้ว', email: 'tenant108@kesorn.com', phone: '081-111-0108' }, startKwh: 3890 },
  { num: '109', floor: 1, type: 'Standard', rent: 3200, dep: 3000, caseType: 'ENDED_SETTLED', tenant: { name: 'นายประเสริฐ ย้ายออกแล้ว', email: 'tenant109@kesorn.com', phone: '081-111-0109' }, startKwh: 5120 },
  { num: '110', floor: 1, type: 'Standard', rent: 3000, dep: 3000, caseType: 'PHANTOM_LOAD', tenant: null, startKwh: 890 },

  // Floor 2 (201 - 210)
  { num: '201', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'NORMAL_PAID', tenant: { name: 'นายธีรศักดิ์ ใจดี', email: 'tenant201@kesorn.com', phone: '082-222-0201' }, startKwh: 2780 },
  { num: '202', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'NORMAL_PAID', tenant: { name: 'นางสาววราภรณ์ สุขุม', email: 'tenant202@kesorn.com', phone: '082-222-0202' }, startKwh: 1940 },
  { num: '203', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'METER_REPLACED', tenant: { name: 'นายอัครเดช รุ่งเรือง', email: 'tenant203@kesorn.com', phone: '082-222-0203' }, startKwh: 3450 },
  { num: '204', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'OVERDUE_2M', tenant: { name: 'นายอดิศร รอเงิน', email: 'tenant204@kesorn.com', phone: '082-222-0204' }, startKwh: 2110 },
  { num: '205', floor: 2, type: 'Suite', rent: 4800, dep: 4500, caseType: 'NORMAL_PAID', tenant: { name: 'นางสาวชลธิชา แก้วใส', email: 'tenant205@kesorn.com', phone: '082-222-0205' }, startKwh: 4560 },
  { num: '206', floor: 2, type: 'Suite', rent: 4800, dep: 4500, caseType: 'NORMAL_PAID', tenant: { name: 'นายวิรัช เก่งกล้า', email: 'tenant206@kesorn.com', phone: '082-222-0206' }, startKwh: 3820 },
  { num: '207', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'PENDING_FIRST_BILL', tenant: { name: 'นายกิตติศักดิ์ จองใหม่', email: 'tenant207@kesorn.com', phone: '082-222-0207' }, startKwh: 1200 },
  { num: '208', floor: 2, type: 'Suite', rent: 4800, dep: 4500, caseType: 'PENDING_OWNER_SIGN', tenant: { name: 'นางสาวสุภาพร รอเซ็น', email: 'tenant208@kesorn.com', phone: '082-222-0208' }, startKwh: 1550 },
  { num: '209', floor: 2, type: 'Studio', rent: 4200, dep: 4000, caseType: 'VACANT_NORMAL', tenant: null, startKwh: 640 },
  { num: '210', floor: 2, type: 'Suite', rent: 4500, dep: 4500, caseType: 'MAINTENANCE', tenant: null, startKwh: 1120 },

  // Test Room (T01)
  { num: 'T01', floor: 2, type: 'Standard (Test Room)', rent: 1, dep: 2, caseType: 'OVERLOAD_LAB', tenant: { name: 'ผู้เช่าทดสอบระบบ (Test Tenant)', email: 'tenant@kesorn.com', phone: '080-000-0000' }, startKwh: 125.4 }
];

const CYCLES = [
  '2025-11', '2025-12', '2026-01', '2026-02', '2026-03', '2026-04',
  '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'
];

// Seasonal multiplier: Apr-May highest, Nov-Jan lowest
function getMonthlyUnits(baseKwh, cycleIndex) {
  const multipliers = [0.85, 0.80, 0.82, 0.95, 1.45, 1.60, 1.25, 1.15, 1.10, 1.05, 1.00, 1.02];
  const mult = multipliers[cycleIndex] || 1.0;
  return Math.round((baseKwh || 160) * mult);
}

async function main() {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error('DATABASE_URL is not set');
  console.log('⚡ Connecting to database for 20-Room MIS Seeding...');
  const db = await mysql.createConnection({ uri, timezone: '+07:00' });

  try {
    await db.beginTransaction();

    // 1. Get Dormitory Profile ID
    const [dorms] = await db.query('SELECT id FROM dormitory_profile LIMIT 1');
    const dormId = dorms.length > 0 ? dorms[0].id : 1;

    console.log(`📦 Using Dormitory ID: ${dormId}`);

    for (const conf of ROOMS_CONFIG) {
      console.log(`\n--- Seeding Room ${conf.num} (${conf.caseType}) ---`);

      // 1. Upsert Room
      let roomStatus = 'Occupied';
      if (['VACANT_NORMAL', 'PHANTOM_LOAD'].includes(conf.caseType)) roomStatus = 'Available';
      if (conf.caseType === 'MAINTENANCE') roomStatus = 'Maintenance';
      if (['PENDING_FIRST_BILL', 'PENDING_OWNER_SIGN'].includes(conf.caseType)) roomStatus = 'Reserved';

      const [existingRooms] = await db.query('SELECT id FROM rooms WHERE room_number = ?', [conf.num]);
      let roomId;
      if (existingRooms.length > 0) {
        roomId = existingRooms[0].id;
        await db.query(
          'UPDATE rooms SET floor = ?, room_type = ?, price = ?, deposit_amount = ?, status = ?, water_rate = 18.00, common_fee = 200.00 WHERE id = ?',
          [conf.floor, conf.type, conf.rent, conf.dep, roomStatus, roomId]
        );
      } else {
        const [res] = await db.query(
          'INSERT INTO rooms (dorm_id, room_number, floor, room_type, price, deposit_amount, status, water_rate, common_fee, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 18.00, 200.00, NOW())',
          [dormId, conf.num, conf.floor, conf.type, conf.rent, conf.dep, roomStatus]
        );
        roomId = res.insertId;
      }

      // 2. Handle Tenant & User (if room has tenant)
      let userId = null;
      let tenantId = null;

      if (conf.tenant) {
        const [existingUsers] = await db.query('SELECT id FROM users WHERE email = ?', [conf.tenant.email]);
        if (existingUsers.length > 0) {
          userId = existingUsers[0].id;
          await db.query(
            "UPDATE users SET name = ?, phone = ?, role = 'tenant', primary_role = 'tenant', is_active = 1 WHERE id = ?",
            [conf.tenant.name, conf.tenant.phone, userId]
          );
        } else {
          const [uRes] = await db.query(
            "INSERT INTO users (name, email, password, phone, role, primary_role, is_active, created_at) VALUES (?, ?, ?, ?, 'tenant', 'tenant', 1, NOW())",
            [conf.tenant.name, conf.tenant.email, PASSWORD_HASH, conf.tenant.phone]
          );
          userId = uRes.insertId;
        }

        // Upsert Tenant
        const [existingTenants] = await db.query('SELECT id FROM tenants WHERE user_id = ? OR email = ?', [userId, conf.tenant.email]);
        let tenantStatus = conf.caseType === 'ENDED_SETTLED' ? 'past' : ['PENDING_FIRST_BILL', 'PENDING_OWNER_SIGN'].includes(conf.caseType) ? 'pending' : 'active';

        if (existingTenants.length > 0) {
          tenantId = existingTenants[0].id;
          await db.query(
            'UPDATE tenants SET name = ?, phone = ?, room_id = ?, status = ?, move_in_date = ? WHERE id = ?',
            [conf.tenant.name, conf.tenant.phone, roomId, tenantStatus, '2025-11-01', tenantId]
          );
        } else {
          const [tRes] = await db.query(
            "INSERT INTO tenants (dorm_id, user_id, name, email, phone, room_id, status, move_in_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())",
            [dormId, userId, conf.tenant.name, conf.tenant.email, conf.tenant.phone, roomId, tenantStatus, '2025-11-01']
          );
          tenantId = tRes.insertId;
        }

        // Update room tenant_id
        if (['Occupied', 'Reserved'].includes(roomStatus)) {
          await db.query('UPDATE rooms SET tenant_id = ? WHERE id = ?', [tenantId, roomId]);
        }

        // 3. Upsert Contract
        let contractStatus = 'Active';
        if (conf.caseType === 'ENDED_SETTLED') contractStatus = 'Ended';
        if (conf.caseType === 'PENDING_FIRST_BILL') contractStatus = 'PendingFirstBill';
        if (conf.caseType === 'PENDING_OWNER_SIGN') contractStatus = 'PendingOwnerSignature';

        const [existingContracts] = await db.query('SELECT id FROM contracts WHERE room_id = ? AND tenant_id = ?', [roomId, tenantId]);
        let contractId;
        if (existingContracts.length > 0) {
          contractId = existingContracts[0].id;
          await db.query(
            "UPDATE contracts SET status = ?, start_date = '2025-11-01 00:00:00', end_date = '2026-10-31 23:59:59', deposit_amount = ?, occupants = 1 WHERE id = ?",
            [contractStatus, conf.dep, contractId]
          );
        } else {
          const [cRes] = await db.query(
            "INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status, occupants, deposit_outside_system, created_at) VALUES (?, ?, '2025-11-01 00:00:00', '2026-10-31 23:59:59', ?, ?, 1, 0, NOW())",
            [tenantId, roomId, conf.dep, contractStatus]
          );
          contractId = cRes.insertId;
        }

        // 4. Special Scenarios
        if (conf.caseType === 'NOTICE_MOVEOUT') {
          await db.query('DELETE FROM move_out_requests WHERE contract_id = ?', [contractId]);
          await db.query(
            "INSERT INTO move_out_requests (tenant_id, room_id, contract_id, desired_date, move_out_date, status, promptpay_target, promptpay_name, bank_name, deposit_amount, move_out_type, created_at) VALUES (?, ?, ?, '2026-10-31', '2026-10-31', 'PendingInspection', '0811110108', ?, 'กสิกรไทย', ?, 'Normal', NOW())",
            [tenantId, roomId, contractId, conf.tenant.name, conf.dep]
          );
        }

        if (conf.caseType === 'ENDED_SETTLED') {
          await db.query('DELETE FROM move_out_requests WHERE contract_id = ?', [contractId]);
          await db.query(
            "INSERT INTO move_out_requests (tenant_id, room_id, contract_id, desired_date, move_out_date, status, promptpay_target, promptpay_name, deposit_amount, net_refund_amount, settlement_status, refunded_at, created_at) VALUES (?, ?, ?, '2026-09-30', '2026-09-30', 'Completed', '0811110109', ?, ?, ?, 'Completed', NOW(), NOW())",
            [tenantId, roomId, contractId, conf.tenant.name, conf.dep, conf.dep - 800]
          );
        }
      }

      // 5. Generate Historical Meter Readings & Monthly Bills (12 Cycles)
      if (!['VACANT_NORMAL', 'PHANTOM_LOAD', 'MAINTENANCE', 'PENDING_FIRST_BILL', 'PENDING_OWNER_SIGN'].includes(conf.caseType)) {
        let currentKwh = conf.startKwh;

        for (let i = 0; i < CYCLES.length; i++) {
          const cycle = CYCLES[i];
          const units = getMonthlyUnits(150 + (parseInt(conf.num, 10) % 7) * 20, i);
          const prevKwh = currentKwh;
          currentKwh = Math.round((currentKwh + units) * 10) / 10;

          const recDate = `${cycle}-25 10:00:00`;
          const dueDate = `${cycle}-05`;

          // Handle Meter Readings
          await db.query('DELETE FROM meter_readings WHERE room_id = ? AND billing_cycle = ?', [roomId, cycle]);
          await db.query(
            "INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, units_used, billing_cycle, kind, event, recorded_at, created_at) VALUES (?, ?, 'electric', ?, ?, ?, ?, 'cycle', 'normal', ?, ?)",
            [dormId, roomId, prevKwh, currentKwh, units, cycle, recDate, recDate]
          );

          // Handle Bills
          const electricAmount = units * 7.0;
          const waterAmount = 150.0;
          const commonFee = 200.0;
          const roomAmount = conf.rent;
          const totalAmount = roomAmount + electricAmount + waterAmount + commonFee;

          let billStatus = 'Paid';
          let penaltyAmount = 0;
          let daysOverdue = 0;

          // Special Cases for October 2026 / September 2026
          if (cycle === '2026-10') {
            if (conf.caseType === 'OVERDUE_1M') {
              billStatus = 'Overdue';
              penaltyAmount = 300.0;
              daysOverdue = 17;
            } else if (conf.caseType === 'OVERDUE_2M') {
              billStatus = 'Overdue';
              penaltyAmount = 300.0;
              daysOverdue = 17;
            }
          } else if (cycle === '2026-09') {
            if (conf.caseType === 'OVERDUE_2M') {
              billStatus = 'Overdue';
              penaltyAmount = 600.0;
              daysOverdue = 47;
            }
          }

          await db.query('DELETE FROM bills WHERE room_number = ? AND billing_cycle = ?', [conf.num, cycle]);
          const [bRes] = await db.query(
            `INSERT INTO bills (
              tenant_id, dorm_id, room_number, title, amount, room_amount, 
              electric_units, electric_amount, water_amount, common_fee,
              penalty_amount, days_overdue, billing_cycle, due_date, status, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              tenantId, dormId, conf.num, `บิลค่าเช่าและน้ำไฟ รอบ ${cycle}`,
              totalAmount + penaltyAmount, roomAmount,
              units, electricAmount, waterAmount, commonFee,
              penaltyAmount, daysOverdue, cycle, dueDate, billStatus, recDate
            ]
          );
          const billId = bRes.insertId;

          // If Paid, record payment
          if (billStatus === 'Paid') {
            await db.query('DELETE FROM bill_payments WHERE bill_id = ?', [billId]);
            await db.query(
              "INSERT INTO bill_payments (bill_id, amount, method, paid_at, note, created_at) VALUES (?, ?, 'transfer', ?, 'ชำระผ่าน PromptPay QR อัตโนมัติ', ?)",
              [billId, totalAmount, `${cycle}-28 14:30:00`, `${cycle}-28 14:30:00`]
            );
          }

          // Case 3: Dispute on room 107
          if (conf.caseType === 'DISPUTE' && cycle === '2026-10') {
            await db.query('DELETE FROM bill_corrections WHERE bill_id = ?', [billId]);
            await db.query(
              "INSERT INTO bill_corrections (bill_id, requested_by, requester_id, old_electric_reading, new_electric_reading, old_total_amount, new_total_amount, reason, status, created_at) VALUES (?, 'tenant', ?, ?, ?, ?, ?, 'ขอตรวจสอบเลขมิเตอร์แอร์ จดเกินไป 50 หน่วย', 'Pending', NOW())",
              [billId, tenantId, currentKwh, currentKwh - 50, totalAmount, totalAmount - (50 * 7)]
            );
          }
        }
      }

      // Special Anomaly for Room 210 (Maintenance)
      if (conf.caseType === 'MAINTENANCE') {
        await db.query('DELETE FROM maintenance_requests WHERE room_id = ?', [roomId]);
        await db.query(
          "INSERT INTO maintenance_requests (dorm_id, room_id, room_number, issue_type, description, status, created_at) VALUES (?, ?, ?, 'air_conditioner', 'แอร์ห้อง 210 มีน้ำซึม ช่างกำลังเข้าซ่อมบำรุงและทาสีผนัง', 'in_progress', NOW())",
          [dormId, roomId, conf.num]
        );
      }
    }

    await db.commit();
    console.log('\n🎉 [SUCCESS] 20 Rooms MIS Seed completed successfully with all 10 scenarios!');
  } catch (err) {
    await db.rollback();
    console.error('❌ [ERROR] Rollback triggered:', err);
    throw err;
  } finally {
    await db.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
