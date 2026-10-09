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

  const [cols] = await pool.query("DESCRIBE move_out_requests");
  console.log('move_out_requests columns:', cols.map(c => c.Field));
  await pool.end();
}

main().catch(console.error);
