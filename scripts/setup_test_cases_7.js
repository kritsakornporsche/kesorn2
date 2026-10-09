const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'kesorn_db',
  });

  const hashedPw = await bcrypt.hash('12345678', 10);

  // Helper to ensure user, tenant, contract, room, and move-out request
  async function setupCase({
    email,
    name,
    phone,
    roomNumber,
    isContractCompleted, // true for 7.2.2 & 7.2.3, false for 7.1.1
    desiredDateOffsetDays,
    contractEndOffsetDays,
    settlementType, // 'TenantPay' or 'ZeroBalance'
    electricPrev,
    electricNew,
    extraDamage,
    roomPrice,
    unpaidAmount,
    tcName
  }) {
    console.log(`\n================ Setting up ${tcName} (${email}) ================`);

    // 1. Upsert user
    const [existingUsers] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
    let userId;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await pool.query("UPDATE users SET password = ?, role = 'tenant', primary_role = 'tenant', name = ? WHERE id = ?", [hashedPw, name, userId]);
    } else {
      const [uRes] = await pool.query("INSERT INTO users (email, password, name, role, primary_role, created_at) VALUES (?, ?, ?, 'tenant', 'tenant', NOW())", [email, hashedPw, name]);
      userId = uRes.insertId;
    }

    // 2. Find or create Room
    const [existingRooms] = await pool.query("SELECT id FROM rooms WHERE room_number = ?", [roomNumber]);
    let roomId;
    if (existingRooms.length > 0) {
      roomId = existingRooms[0].id;
      await pool.query("UPDATE rooms SET price = ?, status = 'Occupied' WHERE id = ?", [roomPrice, roomId]);
    } else {
      const [rRes] = await pool.query("INSERT INTO rooms (dorm_id, room_number, room_type, price, floor, status) VALUES (1, ?, 'ห้องแอร์มาตรฐาน', ?, 2, 'Occupied')", [roomNumber, roomPrice]);
      roomId = rRes.insertId;
    }

    // 3. Upsert Tenant
    const [existingTenants] = await pool.query("SELECT id FROM tenants WHERE email = ?", [email]);
    let tenantId;
    if (existingTenants.length > 0) {
      tenantId = existingTenants[0].id;
      await pool.query("UPDATE tenants SET user_id = ?, room_id = ?, name = ?, phone = ?, status = 'active' WHERE id = ?", [userId, roomId, name, phone, tenantId]);
    } else {
      const [tRes] = await pool.query(`
        INSERT INTO tenants (user_id, dorm_id, room_id, name, email, phone, status, created_at)
        VALUES (?, 1, ?, ?, ?, ?, 'active', NOW())
      `, [userId, roomId, name, email, phone]);
      tenantId = tRes.insertId;
    }

    // 4. Upsert Contract
    const startDate = new Date();
    startDate.setFullYear(startDate.getFullYear() - 1);
    const startDateStr = startDate.toISOString().split('T')[0];

    const endDate = new Date();
    endDate.setDate(endDate.getDate() + contractEndOffsetDays);
    const endDateStr = endDate.toISOString().split('T')[0];

    // Clean old contracts & move out requests for this tenant
    await pool.query("DELETE FROM move_out_requests WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM bills WHERE tenant_id = ?", [tenantId]);
    await pool.query("DELETE FROM contracts WHERE tenant_id = ?", [tenantId]);

    const [cRes] = await pool.query(`
      INSERT INTO contracts (
        tenant_id, room_id, start_date, end_date,
        deposit_amount, status, created_at
      ) VALUES (?, ?, ?, ?, 3000.00, 'MoveOutPending', NOW())
    `, [tenantId, roomId, startDateStr, endDateStr]);
    const contractId = cRes.insertId;

    // 5. Calculations
    const desiredDate = new Date();
    desiredDate.setDate(desiredDate.getDate() + desiredDateOffsetDays);
    const desiredDateStr = desiredDate.toISOString().split('T')[0];

    const moveOutType = isContractCompleted ? 'Normal' : 'Early';
    const unitsUsed = Math.max(0, electricNew - electricPrev);
    const elecAmount = Number((unitsUsed * 4.88).toFixed(2));
    const waterAmount = 100.00;
    const commonFee = 150.00;
    const roomRentAmount = Number(roomPrice);
    const totalExpenses = Number((roomRentAmount + elecAmount + waterAmount + commonFee + extraDamage + unpaidAmount).toFixed(2));

    let netRefund = 0;
    if (moveOutType === 'Normal') {
      netRefund = Math.max(0, 3000.00 - totalExpenses);
    }

    // Insert Move Out Request in 'Pending' (Tab 16.1 in Owner Move-out page so owner can click "จดมิเตอร์ & ตรวจห้อง")
    const [mRes] = await pool.query(`
      INSERT INTO move_out_requests (
        tenant_id, room_id, contract_id, desired_date, move_out_date,
        reason, status, promptpay_target, promptpay_name, deposit_amount,
        is_contract_completed, move_out_type, electric_prev_unit, electric_new_unit,
        electric_units_used, electric_amount, water_amount, common_fee,
        room_rent_amount, extra_damage_amount, extra_damage_note, total_expenses,
        unpaid_bills_total, net_refund_amount, settlement_type, settlement_status,
        ready_to_occupy_date, created_at
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, 'Pending', ?, ?, 3000.00,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, 'ค่าทำความสะอาด/ความเสียหาย', ?,
        ?, ?, ?, 'PendingMeter',
        DATE_ADD(CURDATE(), INTERVAL 3 DAY), NOW()
      )
    `, [
      tenantId, roomId, contractId, desiredDateStr, desiredDateStr,
      `ขอแจ้งย้ายออก (${tcName})`, phone, name,
      isContractCompleted ? 1 : 0, moveOutType, electricPrev, electricNew,
      unitsUsed, elecAmount, waterAmount, commonFee,
      roomRentAmount, extraDamage, totalExpenses,
      unpaidAmount, netRefund, settlementType
    ]);

    // Also insert meter readings
    await pool.query(`
      INSERT INTO meter_readings (dorm_id, room_id, type, billing_cycle, previous_reading, current_reading, units_used, created_at)
      VALUES (1, ?, 'Electricity', '2026-10', ?, ?, ?, NOW())
    `, [roomId, electricPrev, electricNew, unitsUsed]);

    console.log(`✅ Successfully configured ${tcName}! (Move-out Request ID: ${mRes.insertId})`);
  }

  // TC-7.1.1: แจ้งย้ายออกก่อนกำหนด -> เจ้าของหอส่งบิลให้ผู้เช่า -> ผู้เช่าชำระบิลสำเร็จ สถานะเปลี่ยนเป็นแขก
  await setupCase({
    email: 'tenant_tc711@kesorn.com',
    name: 'นายสมชาย ย้ายก่อนกำหนด (TC-7.1.1)',
    phone: '0811117111',
    roomNumber: '501',
    isContractCompleted: false,
    desiredDateOffsetDays: 0,
    contractEndOffsetDays: 180, // Contract ends in 6 months (Early move-out)
    settlementType: 'TenantPay',
    electricPrev: 100,
    electricNew: 150,
    extraDamage: 300,
    roomPrice: 2800,
    unpaidAmount: 0,
    tcName: 'TC-7.1.1 ย้ายออกก่อนกำหนด'
  });

  // TC-7.2.2: แจ้งออกตามกำหนด แต่ประกันไม่พอ (ค่าใช้จ่ายเกิน 3,000) -> เจ้าของหอส่งบิลให้ผู้เช่า -> ลูกหอชำระสำเร็จ สถานะเปลี่ยนเป็นแขก
  await setupCase({
    email: 'tenant_tc722@kesorn.com',
    name: 'นายสมศักดิ์ ประกันไม่พอ (TC-7.2.2)',
    phone: '0822227222',
    roomNumber: '502',
    isContractCompleted: true,
    desiredDateOffsetDays: 0,
    contractEndOffsetDays: -2, // Contract already completed
    settlementType: 'TenantPay',
    electricPrev: 200,
    electricNew: 300,
    extraDamage: 1200, // ค่าเสียหาย 1200 ทำให้รวมค่าใช้จ่าย > 3000
    roomPrice: 2800,
    unpaidAmount: 0,
    tcName: 'TC-7.2.2 ประกันไม่พอ (ส่งบิลส่วนต่าง)'
  });

  // TC-7.2.3: แจ้งออกตามกำหนด ประกันเหลือ 0 พอดี (ค่าใช้จ่าย = ประกัน 3,000) -> สถานะเปลี่ยนเป็นแขกทันที
  await setupCase({
    email: 'tenant_tc723@kesorn.com',
    name: 'นายสมหมาย ประกันพอดีศูนย์ (TC-7.2.3)',
    phone: '0833337233',
    roomNumber: '503',
    isContractCompleted: true,
    desiredDateOffsetDays: 0,
    contractEndOffsetDays: -2, // Contract completed
    settlementType: 'ZeroBalance',
    electricPrev: 100,
    electricNew: 100, // 0 units used
    extraDamage: 0,
    roomPrice: 2750, // 2750 + water 100 + common 150 = 3,000 พอดี!
    unpaidAmount: 0,
    tcName: 'TC-7.2.3 ประกันเหลือ 0 พอดี'
  });

  await pool.end();
}

main().catch(console.error);
