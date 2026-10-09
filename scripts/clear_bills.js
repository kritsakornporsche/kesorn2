const mysql = require('mysql2/promise');

async function clearBills() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  try {
    const [correctionsRes] = await pool.query("DELETE FROM bill_corrections");
    console.log('Deleted bill corrections:', correctionsRes.affectedRows);

    const [billsRes] = await pool.query("DELETE FROM bills");
    console.log('Deleted bills:', billsRes.affectedRows);

    const [count] = await pool.query("SELECT COUNT(*) as total FROM bills");
    console.log('Remaining bills count:', count[0].total);
  } catch (err) {
    console.error('Error clearing bills:', err);
  } finally {
    await pool.end();
  }
}

clearBills();
