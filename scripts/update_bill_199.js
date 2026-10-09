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

  const [bills] = await pool.query("SELECT * FROM bills WHERE id = 199");
  console.log('Bill 199 before update:', bills);

  // Set due_date to today or tomorrow so late fee is 0 (or adjust base amount so total <= 20)
  // Base amount: 15.00 บาท (ค่าห้อง 10 + ค่าไฟ 5 + น้ำ 0 + ส่วนกลาง 0)
  // Due date = today so late fee = 0
  const todayStr = new Date().toISOString().split('T')[0];

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
      due_date = ?
    WHERE id = 199
  `, [todayStr]);

  const [updated] = await pool.query("SELECT * FROM bills WHERE id = 199");
  console.log('Bill 199 after update:', updated);

  await pool.end();
}

main().catch(console.error);
