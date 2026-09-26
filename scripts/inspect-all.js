const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('--- USERS ---');
  const [users] = await conn.execute("SELECT id, name, email, role, sub_role FROM users WHERE email LIKE '%kesorn%' OR role = 'keeper'");
  console.log(users);

  console.log('--- KEEPERS ---');
  const [keepers] = await conn.execute("SELECT * FROM keepers");
  console.log(keepers);

  console.log('--- BILLS FOR TENANTS ---');
  const [bills] = await conn.execute("SELECT id, tenant_id, room_id, billing_month, rent_amount, water_amount, electricity_amount, total_amount, status, created_at FROM bills ORDER BY id DESC LIMIT 10");
  console.log(bills);

  console.log('--- MAINTENANCE REQUESTS ---');
  const [maint] = await conn.execute("SELECT id, room_id, title, status FROM maintenance_requests");
  console.log(maint);

  console.log('--- METERS SAMPLE ---');
  const [meters] = await conn.execute("SELECT id, room_id, meter_type, meter_month, previous_reading, current_reading, units_used FROM meter_readings ORDER BY id DESC LIMIT 10");
  console.log(meters);

  console.log('--- ROOMS 1-20 ---');
  const [rooms] = await conn.execute("SELECT id, room_number, price, status FROM rooms ORDER BY id ASC LIMIT 25");
  console.log(rooms);

  console.log('--- TENANTS ---');
  const [tenants] = await conn.execute("SELECT t.id, t.room_id, t.user_id, u.name, u.email, r.room_number FROM tenants t JOIN users u ON t.user_id = u.id JOIN rooms r ON t.room_id = r.id");
  console.log(tenants);

  await conn.end();
}

check().catch(console.error);
