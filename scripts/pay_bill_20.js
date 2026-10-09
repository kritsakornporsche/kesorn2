const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

async function payBill20() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kesorn_db',
  });

  console.log('--- Step 1: Update Bill 203 to Paid with verified mock slip ---');
  const mockSlipData = JSON.stringify({
    success: true,
    data: {
      transRef: 'MOCK_SLIP_KESORN_203_' + Date.now(),
      amount: 15454.72,
      sender: { displayName: 'นายกิตติพงษ์ สุขสันต์' },
      receiver: { displayName: 'หอพักเกษร 2' },
      transDate: new Date().toISOString().slice(0, 10),
      transTime: new Date().toTimeString().slice(0, 8),
    }
  });

  const [updateResult] = await pool.query(`
    UPDATE bills 
    SET status = 'Paid',
        slip_url = '/uploads/slips/mock_bill_203_paid.jpg',
        slip_verified = 1,
        slip_verified_at = NOW(),
        slip_data = ?,
        slipok_trans_ref = ?
    WHERE id = 203
  `, [mockSlipData, 'MOCK_SLIP_KESORN_203']);

  console.log('Bill 203 updated:', updateResult.affectedRows, 'row(s) modified.');

  console.log('\n--- Step 2: Verify Bill Status ---');
  const [bill] = await pool.query("SELECT id, room_number, billing_cycle, amount, status, slip_verified, slip_verified_at, slipok_trans_ref FROM bills WHERE id = 203");
  console.log('Bill 203 Status:', bill[0]);

  console.log('\n--- Step 3: Check Room 20 latest meter reading for next cycle (2026-11) ---');
  const [lastMeter] = await pool.query("SELECT * FROM meter_readings WHERE room_id = 20 ORDER BY id DESC LIMIT 1");
  console.log('Last Meter Reading for Room 20:', lastMeter[0]);

  if (lastMeter.length > 0) {
    console.log(`\nReady! Next cycle meter reading for Room 20 will take previous_reading = ${lastMeter[0].current_reading}`);
  }

  await pool.end();
}

payBill20().catch(console.error);
