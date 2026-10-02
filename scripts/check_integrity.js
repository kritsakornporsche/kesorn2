const mysql = require('mysql2/promise');

async function checkDataIntegrity() {
  const conn = await mysql.createConnection({host: 'localhost', user: 'root', password: '', database: 'kesorn_db'});
  
  console.log('=== DATA INTEGRITY & ORPHAN RECORD CHECK ===\n');

  // 1. Check contracts with invalid room_id
  const [badContractRooms] = await conn.query('SELECT c.id, c.room_id FROM contracts c LEFT JOIN rooms r ON c.room_id = r.id WHERE c.room_id IS NOT NULL AND r.id IS NULL');
  console.log('Contracts with non-existent room_id:', badContractRooms.length);

  // 2. Check contracts with invalid tenant_id
  const [badContractTenants] = await conn.query('SELECT c.id, c.tenant_id FROM contracts c LEFT JOIN tenants t ON c.tenant_id = t.id WHERE c.tenant_id IS NOT NULL AND t.id IS NULL');
  console.log('Contracts with non-existent tenant_id:', badContractTenants.length);

  // 3. Check bills with invalid tenant_id
  const [badBillsTenants] = await conn.query('SELECT b.id, b.tenant_id FROM bills b LEFT JOIN tenants t ON b.tenant_id = t.id WHERE b.tenant_id IS NOT NULL AND t.id IS NULL');
  console.log('Bills with non-existent tenant_id:', badBillsTenants.length);

  // 4. Check maintenance_requests with invalid room_id or tenant_id
  const [badMaintTenants] = await conn.query('SELECT m.id, m.tenant_id FROM maintenance_requests m LEFT JOIN tenants t ON m.tenant_id = t.id WHERE m.tenant_id IS NOT NULL AND t.id IS NULL');
  console.log('Maintenance requests with non-existent tenant_id:', badMaintTenants.length);

  // 5. Check cleaning_jobs with invalid room_id
  const [badCleaningRooms] = await conn.query('SELECT c.id, c.room_id FROM cleaning_jobs c LEFT JOIN rooms r ON c.room_id = r.id WHERE c.room_id IS NOT NULL AND r.id IS NULL');
  console.log('Cleaning jobs with non-existent room_id:', badCleaningRooms.length);

  // 6. Check move_out_requests with invalid tenant_id
  const [badMoveOutTenants] = await conn.query('SELECT m.id, m.tenant_id FROM move_out_requests m LEFT JOIN tenants t ON m.tenant_id = t.id WHERE m.tenant_id IS NOT NULL AND t.id IS NULL');
  console.log('Move-out requests with non-existent tenant_id:', badMoveOutTenants.length);

  // 7. Check rooms with multiple active contracts
  const [duplicateContracts] = await conn.query(`
    SELECT room_id, COUNT(*) as cnt 
    FROM contracts 
    WHERE status IN ('Active', 'Approved') 
    GROUP BY room_id 
    HAVING cnt > 1
  `);
  console.log('Rooms with multiple active contracts (double-booking risk):', duplicateContracts);

  // 8. Check users without primary_role or role
  const [inconsistentUsers] = await conn.query(`
    SELECT id, email, role, primary_role 
    FROM users 
    WHERE role != primary_role OR role IS NULL OR primary_role IS NULL
  `);
  console.log('Users with inconsistent role vs primary_role:', inconsistentUsers);

  // 9. Check rooms status consistency vs contracts
  const [inconsistentRooms] = await conn.query(`
    SELECT r.id, r.room_number, r.status, c.id as active_contract_id, c.status as contract_status
    FROM rooms r
    LEFT JOIN contracts c ON r.id = c.room_id AND c.status IN ('Active', 'Approved')
    WHERE (r.status = 'Occupied' AND c.id IS NULL)
       OR (r.status = 'Available' AND c.id IS NOT NULL)
  `);
  console.log('Rooms with mismatched status vs contracts:', inconsistentRooms);

  // 10. Check bills without tenant_id or room_number
  const [badBills] = await conn.query(`
    SELECT id, title, amount, tenant_id, room_number 
    FROM bills 
    WHERE tenant_id IS NULL OR tenant_id = 0
  `);
  console.log('Bills without tenant_id:', badBills.length);

  // 11. Check notifications without user_id
  const [badNotifications] = await conn.query(`
    SELECT id, title, user_id FROM notifications WHERE user_id IS NULL OR user_id = 0
  `);
  console.log('Notifications without user_id:', badNotifications.length);

  await conn.end();
}

checkDataIntegrity().catch(console.error);
