const mysql = require('mysql2/promise');
require('dotenv').config();

async function test() {
  const conn = await mysql.createConnection({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'smartdom',
    password: process.env.DATABASE_PASSWORD || 'smartdom',
    database: process.env.DATABASE_NAME || 'kesorn_db',
  });

  const [rooms] = await conn.query('SELECT id, room_number, status, price FROM rooms WHERE room_number = "5" OR room_number = "05" OR id = 5');
  console.log('=== Room 5 Info ===', rooms);

  if (rooms.length > 0) {
    const roomId = rooms[0].id;
    const roomNumber = rooms[0].room_number;

    const [meters] = await conn.query('SELECT * FROM meter_readings WHERE room_id = ? ORDER BY id DESC', [roomId]);
    console.log('=== Meter Readings for Room 5 ===', meters);

    const [contracts] = await conn.query('SELECT * FROM contracts WHERE room_id = ? ORDER BY id DESC', [roomId]);
    console.log('=== Contracts for Room 5 ===', contracts);

    const [tenants] = await conn.query('SELECT * FROM tenants WHERE room_id = ? ORDER BY id DESC', [roomId]);
    console.log('=== Tenants for Room 5 ===', tenants);

    const [bills] = await conn.query('SELECT * FROM bills WHERE room_number = ? ORDER BY id DESC', [roomNumber]);
    console.log('=== Bills for Room 5 ===', bills);
  }

  await conn.end();
}

test().catch(console.error);
