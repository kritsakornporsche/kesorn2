const mysql = require('mysql2/promise');

async function check() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  
  const [tenants] = await pool.query('SELECT t.id, t.name, t.email, t.phone, t.room_id, t.status, t.user_id, r.room_number FROM tenants t LEFT JOIN rooms r ON t.room_id = r.id');
  console.log('--- ALL TENANTS IN DB ---');
  console.log(tenants);
  
  const [contracts] = await pool.query('SELECT c.id, c.tenant_id, c.room_id, c.status, r.room_number, c.deposit_amount FROM contracts c LEFT JOIN rooms r ON c.room_id = r.id');
  console.log('--- ALL CONTRACTS IN DB ---');
  console.log(contracts);
  
  const [rooms] = await pool.query("SELECT id, room_number, status, tenant_id FROM rooms WHERE status != 'Available'");
  console.log('--- NON-AVAILABLE ROOMS ---');
  console.log(rooms);

  const [users] = await pool.query("SELECT id, email, role, primary_role, name FROM users");
  console.log('--- USERS ---');
  console.log(users);
  
  await pool.end();
}

check();
