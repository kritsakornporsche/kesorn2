const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  await conn.execute("UPDATE rooms SET status = 'Available', tenant_id = NULL");
  console.log('Set all 20 rooms to Available');

  const [rows] = await conn.execute('SELECT room_number, status, price FROM rooms');
  console.log('Rooms:', rows);

  await conn.end();
}

main().catch(console.error);
