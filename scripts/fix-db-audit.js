const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function run() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('🚀 Starting Kesorn 2 Site Audit DB Fixes...');

  // 1. Item 10: Delete empty keeper (id = 3)
  const [delKeeper] = await conn.execute("DELETE FROM keepers WHERE id = 3 OR name = '' OR name IS NULL");
  console.log('✅ Item 10: Deleted empty keeper rows:', delKeeper.affectedRows);

  // 2. Item 4: Clean old test bills and test maintenance requests
  const [delBills] = await conn.execute("DELETE FROM bills");
  console.log('✅ Item 4: Cleared old test bills:', delBills.affectedRows);

  const [delMaint] = await conn.execute("DELETE FROM maintenance_requests");
  console.log('✅ Item 4: Cleared old test maintenance requests:', delMaint.affectedRows);

  // 3. Item 8: Clean mock meter readings
  // - Delete water meter readings (flat rate, no water meters)
  const [delWaterMeters] = await conn.execute("DELETE FROM meter_readings WHERE type = 'Water'");
  console.log('✅ Item 8: Deleted water meter readings:', delWaterMeters.affectedRows);

  // - Delete mock meter readings for case study rooms 5, 9, 11, 20
  const [delCaseStudyMeters] = await conn.execute("DELETE FROM meter_readings WHERE room_id IN (5, 9, 11, 20)");
  console.log('✅ Item 8: Cleared mock meter readings for rooms 5, 9, 11, 20:', delCaseStudyMeters.affectedRows);

  // - Standardize all remaining 'Electric' to 'Electricity'
  const [updateType] = await conn.execute("UPDATE meter_readings SET type = 'Electricity' WHERE type = 'Electric'");
  console.log('✅ Item 8: Standardized Electric to Electricity:', updateType.affectedRows);

  // 4. Item 9: Add active tenants for rooms 9, 11, 20
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash('tenant', salt);

  const newTenants = [
    {
      roomId: 9,
      roomNumber: '9',
      email: 'tenant9@kesorn.com',
      name: 'นรินทร์ ชัยชนะ (ผู้เช่าห้อง 9)',
      phone: '089-911-9909',
    },
    {
      roomId: 11,
      roomNumber: '11',
      email: 'tenant11@kesorn.com',
      name: 'วิภาดา บุญมี (ผู้เช่าห้อง 11)',
      phone: '089-911-9911',
    },
    {
      roomId: 20,
      roomNumber: '20',
      email: 'tenant20@kesorn.com',
      name: 'กิตติพงษ์ สุขสันต์ (ผู้เช่าห้อง 20)',
      phone: '089-911-9920',
    }
  ];

  for (const t of newTenants) {
    // Check if user already exists
    let userId;
    const [existingUsers] = await conn.execute("SELECT id FROM users WHERE email = ?", [t.email]);
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await conn.execute("UPDATE users SET name = ?, role = 'tenant' WHERE id = ?", [t.name, userId]);
    } else {
      const [userRes] = await conn.execute(
        "INSERT INTO users (name, email, password, role, is_active) VALUES (?, ?, ?, 'tenant', 1)",
        [t.name, t.email, passwordHash]
      );
      userId = userRes.insertId;
    }

    // Check if tenant record exists
    const [existingTenants] = await conn.execute("SELECT id FROM tenants WHERE room_id = ? OR email = ?", [t.roomId, t.email]);
    if (existingTenants.length > 0) {
      await conn.execute(
        "UPDATE tenants SET name = ?, email = ?, phone = ?, room_id = ?, user_id = ?, status = 'active', dorm_id = 1 WHERE id = ?",
        [t.name, t.email, t.phone, t.roomId, userId, existingTenants[0].id]
      );
    } else {
      await conn.execute(
        "INSERT INTO tenants (name, email, phone, room_id, user_id, status, move_in_date, dorm_id) VALUES (?, ?, ?, ?, ?, 'active', '2026-06-01', 1)",
        [t.name, t.email, t.phone, t.roomId, userId]
      );
    }

    // Update room status to Occupied
    await conn.execute("UPDATE rooms SET status = 'Occupied' WHERE id = ?", [t.roomId]);
  }
  console.log('✅ Item 9: Created/updated active tenants for rooms 9, 11, 20');

  // Verify dormitory_profile
  await conn.execute("UPDATE dormitory_profile SET water_rate = 100.00, electricity_rate = 7.00 WHERE id = 1");
  console.log('✅ Item 5: Confirmed dormitory_profile water_rate = 100.00, electricity_rate = 7.00');

  // Verification report
  const [tenantsCount] = await conn.execute("SELECT t.id, t.room_id, r.room_number, r.price, t.name, t.email FROM tenants t JOIN rooms r ON t.room_id = r.id WHERE t.status = 'active'");
  console.log('📋 Active Tenants in DB:', tenantsCount);

  const [keepersList] = await conn.execute("SELECT id, name, position, email FROM keepers");
  console.log('📋 Keepers in DB:', keepersList);

  await conn.end();
  console.log('🎉 DB Fixes completed successfully!');
}

run().catch(console.error);
