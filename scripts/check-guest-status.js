const path = require('path');
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

async function inspect() {
  const conn = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  
  const [users] = await conn.query("SELECT id, name, email, role, primary_role FROM users WHERE email LIKE '%guest%' OR email LIKE '%khaek%'");
  console.log('=== GUEST/KHAEK USERS ===');
  console.table(users);

  const [contracts] = await conn.query(`
    SELECT c.id, c.room_id, c.tenant_id, c.status, c.deposit_amount, c.created_at,
           t.name as tenant_name, t.email as tenant_email, r.room_number
    FROM contracts c
    LEFT JOIN tenants t ON c.tenant_id = t.id
    LEFT JOIN rooms r ON c.room_id = r.id
    ORDER BY c.id DESC LIMIT 10
  `);
  console.log('=== RECENT CONTRACTS ===');
  console.table(contracts);

  const [tenants] = await conn.query(`
    SELECT id, user_id, room_id, name, email, phone, created_at
    FROM tenants
    ORDER BY id DESC LIMIT 10
  `);
  console.log('=== RECENT TENANTS ===');
  console.table(tenants);

  await conn.end();
}

inspect().catch(console.error);
