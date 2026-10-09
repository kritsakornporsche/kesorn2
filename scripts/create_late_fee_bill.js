const mysql = require('mysql2/promise');
require('dotenv').config();

async function main() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'kesorn_db',
  });

  // 1. Get tenant
  const [tenants] = await pool.query("SELECT * FROM tenants WHERE email = 'krittanaith1234@gmail.com'");
  if (tenants.length === 0) {
    console.error('Tenant not found');
    await pool.end();
    return;
  }
  const tenant = tenants[0];
  console.log('Tenant:', tenant);

  // 2. Get room
  const [rooms] = await pool.query("SELECT * FROM rooms WHERE id = ?", [tenant.room_id || 21]);
  const room = rooms[0] || { room_number: '21', price: 3400 };

  // Set due_date to 5 days ago to generate 5 days overdue (5 * 50 = 250 baht late fee)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 5);
  const dueDateStr = pastDate.toISOString().split('T')[0];

  const currentCycle = '2026-09';
  const billTitle = 'บิลค่าเช่าห้องพักและสาธารณูปโภค (ประจำเดือน ก.ย. 2569)';
  const roomAmount = 3400.00;
  const electricUnits = 50.00;
  const electricAmount = 244.00; // 50 * 4.88
  const waterAmount = 100.00;
  const commonFee = 150.00;
  const baseAmount = roomAmount + electricAmount + waterAmount + commonFee; // 3894.00

  // 3. Insert overdue bill
  const [res] = await pool.query(`
    INSERT INTO bills (
      dorm_id, tenant_id, room_number, title, amount, billing_cycle,
      due_date, status, bill_type, room_amount, water_units,
      electric_units, water_amount, electric_amount, common_fee, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 'Unpaid', 'monthly', ?, 1.00, ?, ?, ?, ?, NOW())
  `, [
    1, tenant.id, room.room_number, billTitle, baseAmount, currentCycle,
    dueDateStr, roomAmount, electricUnits, waterAmount, electricAmount, commonFee
  ]);

  console.log('Inserted Overdue Bill ID:', res.insertId);

  // Also add a sample meter reading for this room & cycle if not exists
  await pool.query(`
    INSERT INTO meter_readings (dorm_id, room_id, type, billing_cycle, previous_reading, current_reading, units_used, photo_url, created_at)
    VALUES (1, ?, 'Electricity', ?, 1200, 1250, 50, '/uploads/meters/sample_meter.jpg', NOW())
    ON DUPLICATE KEY UPDATE current_reading = 1250
  `, [tenant.room_id || 21, currentCycle]);

  console.log('Successfully created bill with late fee for krittanaith1234@gmail.com');
  await pool.end();
}

main().catch(console.error);
