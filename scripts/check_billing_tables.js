const mysql = require('mysql2/promise');

async function checkAllBillingRelated() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  try {
    const [bills] = await pool.query("SELECT COUNT(*) as count FROM bills");
    const [corrections] = await pool.query("SELECT COUNT(*) as count FROM bill_corrections");
    const [accounting] = await pool.query("SELECT COUNT(*) as count FROM accounting_transactions");
    const [moveOuts] = await pool.query("SELECT COUNT(*) as count FROM move_out_requests");
    
    console.log('--- Status Summary ---');
    console.log('Bills remaining:', bills[0].count);
    console.log('Bill corrections remaining:', corrections[0].count);
    console.log('Accounting transactions:', accounting[0].count);
    console.log('Move out requests:', moveOuts[0].count);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

checkAllBillingRelated();
