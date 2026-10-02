const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function resetGuest() {
  const pool = mysql.createPool({
    host: process.env.DATABASE_HOST || '127.0.0.1',
    user: process.env.DATABASE_USER || 'root',
    password: process.env.DATABASE_PASSWORD || '',
    database: process.env.DATABASE_NAME || 'kesorn_db',
    port: parseInt(process.env.DATABASE_PORT || '3306'),
    waitForConnections: true,
    connectionLimit: 10
  });

  const guestEmail = 'guest@kesorn.com';
  console.log('--- Starting complete clean reset for:', guestEmail, '---');

  // 1. Get user & tenants
  const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [guestEmail]);
  const user = users[0];
  const userId = user?.id;

  const [tenants] = await pool.query('SELECT * FROM tenants WHERE email = ? OR user_id = ?', [guestEmail, userId || 0]);
  const tenantIds = tenants.map(t => t.id);
  const roomIds = tenants.map(t => t.room_id).filter(Boolean);

  console.log('Found user ID:', userId, 'Tenant IDs:', tenantIds, 'Room IDs:', roomIds);

  // 2. Delete bills
  if (tenantIds.length > 0 || userId) {
    const [delBills] = await pool.query('DELETE FROM bills WHERE tenant_id IN (?) OR tenant_id = ?', [tenantIds.length > 0 ? tenantIds : [0], userId || 0]);
    console.log('Deleted bills:', delBills.affectedRows);
  }

  // 3. Delete contracts
  if (tenantIds.length > 0 || userId) {
    const [delContracts] = await pool.query('DELETE FROM contracts WHERE tenant_id IN (?) OR tenant_id = ?', [tenantIds.length > 0 ? tenantIds : [0], userId || 0]);
    console.log('Deleted contracts:', delContracts.affectedRows);
  }

  // 4. Delete meter readings related to room
  if (roomIds.length > 0) {
    const [delMeters] = await pool.query('DELETE FROM meter_readings WHERE room_id IN (?)', [roomIds]);
    console.log('Deleted room meter readings:', delMeters.affectedRows);
  }

  // 5. Delete booking_progress
  const [delProgress] = await pool.query('DELETE FROM booking_progress WHERE user_email = ?', [guestEmail]);
  console.log('Deleted booking progress:', delProgress.affectedRows);

  // 6. Delete chat messages & conversations & notifications
  if (userId) {
    const [delMsgs] = await pool.query('DELETE FROM chat_messages WHERE sender_id = ? OR conversation_id IN (SELECT id FROM conversations WHERE guest_id = ?)', [userId, userId]);
    console.log('Deleted chat messages:', delMsgs.affectedRows);
    
    const [delConvs] = await pool.query('DELETE FROM conversations WHERE guest_id = ? OR owner_id = ?', [userId, userId]);
    console.log('Deleted conversations:', delConvs.affectedRows);

    const [delNotifs] = await pool.query('DELETE FROM notifications WHERE user_id = ?', [userId]);
    console.log('Deleted notifications:', delNotifs.affectedRows);
  }

  // 7. Delete maintenance requests
  if (tenantIds.length > 0 || userId) {
    const [delMaint] = await pool.query('DELETE FROM maintenance_requests WHERE tenant_id IN (?) OR tenant_id = ?', [tenantIds.length > 0 ? tenantIds : [0], userId || 0]);
    console.log('Deleted maintenance requests:', delMaint.affectedRows);
  }

  // 8. Delete move out requests
  if (tenantIds.length > 0 || userId) {
    const [delMoveOut] = await pool.query('DELETE FROM move_out_requests WHERE tenant_id IN (?) OR tenant_id = ?', [tenantIds.length > 0 ? tenantIds : [0], userId || 0]);
    console.log('Deleted move out requests:', delMoveOut.affectedRows);
  }

  // 9. Delete tenants record
  if (tenantIds.length > 0) {
    const [delTenants] = await pool.query('DELETE FROM tenants WHERE id IN (?)', [tenantIds]);
    console.log('Deleted tenants:', delTenants.affectedRows);
  }

  // 10. Free up room (Room 1 and any other room booked by guest)
  const targetRooms = roomIds.length > 0 ? roomIds : [1];
  for (const rId of targetRooms) {
    await pool.query('UPDATE rooms SET status = "Available" WHERE id = ?', [rId]);
    console.log('Room', rId, 'status set to Available');
  }

  // 11. Reset User role & clean user state
  const hashedPw = await bcrypt.hash('password123', 10);
  await pool.query(
    'UPDATE users SET role = ?, primary_role = ?, password = ?, name = ?, phone = ? WHERE email = ?',
    ['guest', 'guest', hashedPw, 'คุณผู้มาเยือน (Guest ทดสอบจอง)', '0899999999', guestEmail]
  );
  console.log('Reset user role to guest');

  console.log('=== All guest data cleared and reset successfully ===');
  await pool.end();
}

resetGuest().catch(console.error);
