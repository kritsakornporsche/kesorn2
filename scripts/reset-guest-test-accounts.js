const mysql = require('mysql2/promise');
require('dotenv').config();
const bcrypt = require('bcryptjs');

async function main() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || 'localhost',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'kesorn_db',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10
  });

  const emails = ['guest@kesorn.com', 'khaek@kesorn.com', 'guest2@kesorn.com', 'testguest@kesorn.com'];
  
  console.log('Resetting guests:', emails);

  for (const email of emails) {
    const [tenants] = await pool.execute('SELECT id, room_id FROM tenants WHERE email = ?', [email]);
    for (const t of tenants) {
      await pool.execute('DELETE FROM meter_readings WHERE tenant_id = ?', [t.id]).catch(() => {});
      await pool.execute('DELETE FROM bills WHERE tenant_id = ?', [t.id]).catch(() => {});
      await pool.execute('DELETE FROM contracts WHERE tenant_id = ?', [t.id]).catch(() => {});
      await pool.execute('DELETE FROM tenants WHERE id = ?', [t.id]).catch(() => {});
      if (t.room_id) {
        await pool.execute('UPDATE rooms SET status = "Available" WHERE id = ?', [t.room_id]).catch(() => {});
      }
    }
    await pool.execute('DELETE FROM booking_progress WHERE user_email = ?', [email]).catch(() => {});
  }

  const hashedPw = await bcrypt.hash('password123', 10);

  // Update or insert guest@kesorn.com
  await pool.execute(`
    INSERT INTO users (email, password, name, role, primary_role, phone, created_at)
    VALUES ('guest@kesorn.com', ?, 'คุณผู้มาเยือน (Guest ทดสอบจอง)', 'guest', 'guest', '0899999999', NOW())
    ON DUPLICATE KEY UPDATE role='guest', primary_role='guest', password=?
  `, [hashedPw, hashedPw]);

  // Make room 1 available
  await pool.execute('UPDATE rooms SET status = "Available" WHERE id = 1');

  console.log('Reset completed successfully!');
  await pool.end();
}

main().catch(console.error);
