const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  const [roles] = await conn.execute(`
    SELECT DISTINCT role, COUNT(*) as count 
    FROM users 
    GROUP BY role
  `);
  console.log('Roles breakdown:', roles);

  const [samples] = await conn.execute(`
    SELECT id, name, email, role 
    FROM users 
    WHERE role IN ('owner', 'admin', 'keeper', 'superadmin', 'manager') 
    LIMIT 10
  `);
  console.log('Privileged users:', samples);

  const [keepers] = await conn.execute(`
    SELECT k.id, k.user_id, k.specialty, u.name, u.email 
    FROM keepers k
    JOIN users u ON k.user_id = u.id
    LIMIT 10
  `);
  console.log('Keepers with specialties:', keepers);

  const [tenants] = await conn.execute(`
    SELECT t.id, t.user_id, t.room_id, t.status, u.name, u.email, r.room_number 
    FROM tenants t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN rooms r ON t.room_id = r.id
    LIMIT 5
  `);
  console.log('Active tenants sample:', tenants);

  await conn.end();
}

main().catch(console.error);
