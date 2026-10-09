const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

async function check() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kesorn_db',
  });

  const [cols] = await pool.query("DESCRIBE bills");
  console.log('Bills cols:', cols.map(c => c.Field));

  const [bills] = await pool.query("SELECT * FROM bills WHERE room_number = '20' OR tenant_id = 4 ORDER BY id DESC LIMIT 5");
  console.log('Room 20 / Tenant 4 Bills:', bills);

  const [contracts] = await pool.query("SELECT * FROM contracts WHERE room_id = 20 OR tenant_id = 4");
  console.log('Contracts for Room 20:', contracts);

  const [tenants] = await pool.query("SELECT * FROM tenants WHERE id = 4 OR room_id = 20");
  console.log('Tenants:', tenants);

  const [meters] = await pool.query("SELECT * FROM meter_readings WHERE room_id = 20 ORDER BY id DESC LIMIT 5");
  console.log('Meter readings for Room 20:', meters);

  const [allPendingBills] = await pool.query("SELECT id, room_number, tenant_id, amount, status, due_date, bill_cycle, billing_month, created_at, slip_url FROM bills WHERE status IN ('Pending', 'Overdue', 'PendingReview', 'Unpaid') ORDER BY id DESC LIMIT 10");
  console.log('Pending/Overdue bills across all rooms:', allPendingBills);

  await pool.end();
}

check().catch(console.error);
