const mysql = require('mysql2/promise');

async function resetGuest() {
  const conn = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
  
  // 1. Reset guest role
  await conn.query("UPDATE users SET role = 'guest', primary_role = 'guest' WHERE email = 'guest@kesorn.com'");
  
  // 2. Clear booking progress
  await conn.query("DELETE FROM booking_progress WHERE user_email = 'guest@kesorn.com'");
  
  // 3. Mark previous test contracts as Cancelled
  await conn.query("UPDATE contracts SET status = 'Cancelled' WHERE id IN (56, 57, 58, 59)");
  
  // 4. Reset rooms 1, 2, 3, 6 back to Available
  await conn.query("UPDATE rooms SET status = 'Available' WHERE id IN (1, 2, 3, 6)");
  
  // 5. Delete any move_out_requests for guest/rooms if any
  try {
    await conn.query("DELETE FROM move_out_requests WHERE room_id IN (1, 2, 3, 6)");
  } catch (e) {
    // Ignore if table doesn't have those records
  }

  console.log('RESET GUEST & ROOMS COMPLETED SUCCESSFULLY!');
  await conn.end();
}

resetGuest().catch(console.error);
