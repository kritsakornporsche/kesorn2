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

  // Set due date to 5 days ago to have days_overdue = 5
  // Overdue calculation: 5 days * 50 baht/day = 250 baht (or system calculates days_overdue * 50)
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 5);
  const pastDateStr = pastDate.toISOString().split('T')[0];

  // Base expenses: total 15.00 baht (room 10 + electric 5)
  await pool.query(`
    UPDATE bills 
    SET 
      amount = 15.00,
      room_amount = 10.00,
      electric_units = 1.00,
      electric_amount = 5.00,
      water_units = 0.00,
      water_amount = 0.00,
      common_fee = 0.00,
      due_date = ?,
      status = 'Unpaid'
    WHERE id = 199
  `, [pastDateStr]);

  const [bills] = await pool.query("SELECT id, title, amount, room_amount, electric_amount, water_amount, common_fee, due_date, status FROM bills WHERE id = 199");
  console.log('Bill 199 configured with expenses <= 20 and overdue system late fee:', bills);

  await pool.end();
}

main().catch(console.error);
