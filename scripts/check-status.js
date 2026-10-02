const path = require('path');
const mysql = require(path.join(__dirname, '..', 'node_modules', 'mysql2', 'promise'));

async function check() {
  const conn = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  
  const [users] = await conn.query('SELECT id, name, email, role, primary_role FROM users ORDER BY id DESC LIMIT 10');
  console.log('--- USERS ---');
  console.table(users);

  const [bookings] = await conn.query(`
    SELECT bp.id, bp.user_email, bp.room_id, bp.status, bp.created_at, r.room_number
    FROM booking_progress bp
    LEFT JOIN rooms r ON bp.room_id = r.id
    ORDER BY bp.id DESC LIMIT 10
  `);
  console.log('--- RECENT BOOKING PROGRESS ---');
  console.table(bookings);

  const [contracts] = await conn.query(`
    SELECT c.id, c.room_id, c.tenant_id, c.status, c.deposit_amount, c.start_date, c.contract_file_url, t.name as tenant_name, t.email as tenant_email
    FROM contracts c
    LEFT JOIN tenants t ON c.tenant_id = t.id
    ORDER BY c.id DESC LIMIT 10
  `);
  console.log('--- RECENT CONTRACTS ---');
  console.table(contracts);

  const [bills] = await conn.query(`
    SELECT id, room_number, bill_type, amount, status, due_date
    FROM bills
    ORDER BY id DESC LIMIT 10
  `);
  console.log('--- RECENT BILLS ---');
  console.table(bills);

  await conn.end();
}

check().catch(console.error);
