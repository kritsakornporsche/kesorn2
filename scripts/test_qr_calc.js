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

  const [res] = await pool.query("SELECT id, amount, due_date, status FROM bills WHERE id = 199");
  const bill = res[0];
  console.log('Bill 199 from DB:', bill);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(bill.due_date);
  due.setHours(0, 0, 0, 0);
  const diffTime = today.getTime() - due.getTime();
  const daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const lateFee = daysOverdue > 0 ? daysOverdue * 50 : 0;
  const totalAmount = Number(bill.amount) + lateFee;

  console.log(`Calculated: daysOverdue=${daysOverdue}, lateFee=${lateFee}, totalAmount=${totalAmount}`);

  await pool.end();
}

main().catch(console.error);
