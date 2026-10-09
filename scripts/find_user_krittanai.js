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

  const [users] = await pool.query("SELECT id, email, name, role FROM users WHERE email LIKE '%krittanai%' OR email LIKE '%1234%'");
  console.log('Users found:', users);

  const [tenants] = await pool.query("SELECT id, user_id, name, email, phone, room_id, status FROM tenants WHERE email = 'krittanaith1234@gmail.com' OR user_id IN (?)", [users.map(u => u.id).concat(0)]);
  console.log('Tenants found:', tenants);

  const [rooms] = await pool.query("SELECT id, room_number, price, status FROM rooms LIMIT 10");
  console.log('Sample rooms:', rooms);

  await pool.end();
}

main().catch(console.error);
