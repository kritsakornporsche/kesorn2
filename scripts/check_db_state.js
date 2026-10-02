const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');

  const [rooms] = await pool.query("SELECT id, dorm_id, room_number, floor, room_type, price, status FROM rooms WHERE room_number IN ('101', '5', '8', '20')");
  console.log('--- ROOMS ---');
  console.log(rooms);

  const [bills] = await pool.query("SELECT id, tenant_id, room_number, type, amount, status, title FROM bills WHERE id = 11 OR room_number IN ('5', '20') OR amount = 150");
  console.log('--- BILLS ---');
  console.log(bills);

  const [users] = await pool.query("SELECT id, email, role, full_name, phone FROM users WHERE email IN ('guest@kesorn.com', 'tenant@kesorn.com', 'owner@kesorn.com')");
  console.log('--- USERS ---');
  console.log(users);

  const [tenants] = await pool.query("SELECT id, user_id, room_id, status FROM tenants WHERE user_id IN (SELECT id FROM users WHERE email IN ('guest@kesorn.com', 'tenant@kesorn.com'))");
  console.log('--- TENANTS ---');
  console.log(tenants);

  await pool.end();
}
check().catch(console.error);
