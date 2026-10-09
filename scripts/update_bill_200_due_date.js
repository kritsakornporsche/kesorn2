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

  // Set due_date of bill 200 (and any move_out_settlement bills) to today + 3 days
  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  const futureDateStr = futureDate.toISOString().split('T')[0];

  await pool.query(`
    UPDATE bills 
    SET due_date = ? 
    WHERE id = 200 OR bill_type = 'move_out_settlement'
  `, [futureDateStr]);

  const [bills] = await pool.query("SELECT id, title, amount, due_date, bill_type FROM bills WHERE id = 200");
  console.log('Updated Bill 200:', bills);

  await pool.end();
}

main().catch(console.error);
