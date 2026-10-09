const mysql = require('mysql2/promise');

async function clearMeterReadings() {
  const pool = mysql.createPool('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  try {
    const [delRes] = await pool.query("DELETE FROM meter_readings");
    console.log('Deleted meter readings:', delRes.affectedRows);

    const [count] = await pool.query("SELECT COUNT(*) as total FROM meter_readings");
    console.log('Remaining meter readings:', count[0].total);
  } catch (err) {
    console.error('Error clearing meter readings:', err);
  } finally {
    await pool.end();
  }
}

clearMeterReadings();
