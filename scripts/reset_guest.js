const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env.local' });

async function resetGuest() {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kesorn_db',
  });

  console.log('--- Resetting Guest & krittanaith1234@gmail.com back to clean Guest state ---');

  // 1. Update user 172 to role 'guest'
  await pool.query("UPDATE users SET role = 'guest' WHERE email = 'krittanaith1234@gmail.com'");
  console.log('1. User krittanaith1234@gmail.com role set to guest');

  // 2. Terminate all contracts for guest accounts so booking status returns empty
  const [resContracts] = await pool.query("UPDATE contracts SET status = 'Terminated' WHERE tenant_id IN (16, 17) OR id_card_number LIKE '%00413%'");
  console.log('2. Contracts terminated:', resContracts.affectedRows);

  // 3. Mark bills cancelled for booking / first bill
  const [resBills] = await pool.query("UPDATE bills SET status = 'Cancelled' WHERE tenant_id IN (16, 17) AND (is_first_bill = 1 OR bill_type = 'booking')");
  console.log('3. Booking/First bills cancelled:', resBills.affectedRows);

  // 4. Update tenant status to inactive
  await pool.query("UPDATE tenants SET status = 'inactive' WHERE id IN (16, 17)");
  console.log('4. Tenants 16 & 17 marked inactive');

  // 5. Release room 21 (T01) to Available
  await pool.query("UPDATE rooms SET status = 'Available', tenant_id = NULL WHERE id = 21");
  console.log('5. Room 21 (T01) status set to Available');

  // 6. Verification
  const [guestBookings] = await pool.query(`
    SELECT c.id, c.status, t.email 
    FROM contracts c 
    LEFT JOIN tenants t ON c.tenant_id = t.id 
    WHERE (t.email IN ('krittanaith1234@gmail.com', 'guest@kesorn.com') OR c.tenant_id IN (16, 17))
      AND c.status IN ('PendingContract', 'PendingFirstBill', 'PendingOwnerSignature', 'Active', 'Cancelled', 'Rejected')
  `);
  console.log('Remaining active/pending guest bookings (should be 0):', guestBookings.length);

  console.log('Done reset guest successfully.');
  await pool.end();
}

resetGuest().catch(console.error);
