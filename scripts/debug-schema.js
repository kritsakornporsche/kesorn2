const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306/kesorn_db';
  const conn = await mysql.createConnection(dbUrl);

  const [tables] = await conn.query('SHOW TABLES');
  console.log('--- TABLES ---');
  console.log(tables.map(t => Object.values(t)[0]));

  for (const tableName of ['dormitory_registry', 'dormitory_profile', 'users', 'tenants', 'rooms', 'meter_readings', 'contracts']) {
    try {
      const [cols] = await conn.query(`DESCRIBE ${tableName}`);
      console.log(`\n--- ${tableName} ---`);
      console.log(cols.map(c => `${c.Field} (${c.Type})`).join(', '));
    } catch (e) {
      console.log(`Error describing ${tableName}:`, e.message);
    }
  }

  // Also let's test the queries from the failing routes!
  console.log('\n--- TESTING /api/owner/meters QUERY ---');
  try {
    const ownerEmail = 'owner@kesorn.com';
    const [dormRes] = await conn.query(
      `SELECT d.id FROM dormitory_registry d JOIN users u ON d.owner_id = u.id WHERE u.email = ? LIMIT 1`,
      [ownerEmail]
    );
    console.log('dormRes:', dormRes);

    const dormId = dormRes.length > 0 ? dormRes[0].id : 1;
    const [readings] = await conn.query(
      `SELECT m.*, r.room_number FROM meter_readings m JOIN rooms r ON m.room_id = r.id WHERE m.dorm_id = ? ORDER BY m.billing_cycle DESC, r.room_number ASC, m.type ASC LIMIT 10`,
      [dormId]
    );
    console.log('readings count:', readings.length);
  } catch (e) {
    console.error('owner/meters query error:', e.message);
  }

  console.log('\n--- TESTING /api/tenant/me QUERY ---');
  try {
    const tenantEmail = 'tenant@kesorn.com';
    const [result] = await conn.query(`
      SELECT 
        u.id as user_id, 
        u.name, 
        u.email,
        u.phone,
        u.primary_role as role,
        t.id as tenant_id,
        r.id as room_id,
        r.room_number,
        r.dorm_id,
        dr.dorm_name,
        dr.owner_id
      FROM users u
      LEFT JOIN tenants t ON u.id = t.user_id OR u.email = t.email
      LEFT JOIN rooms r ON t.room_id = r.id
      LEFT JOIN dormitory_registry dr ON r.dorm_id = dr.id
      WHERE u.email = ?
      LIMIT 1
    `, [tenantEmail]);
    console.log('tenant result:', result);

    if (result.length > 0) {
      const tenantInfo = result[0];
      const [contracts] = await conn.query(`
        SELECT 
          c.id,
          c.start_date,
          c.end_date,
          c.deposit_amount,
          c.status,
          c.contract_file_url,
          c.renewal_requested,
          c.renewal_note,
          c.parent_contract_id,
          c.created_at,
          r.room_number,
          r.room_type,
          r.price as monthly_rent
        FROM contracts c
        JOIN rooms r ON c.room_id = r.id
        LEFT JOIN tenants t ON c.tenant_id = t.id
        WHERE t.id = ? OR t.user_id = ? OR t.email = ?
        ORDER BY c.id DESC
      `, [tenantInfo.tenant_id || 0, tenantInfo.user_id, tenantEmail]);
      console.log('contracts count:', contracts.length);
    }
  } catch (e) {
    console.error('tenant/me query error:', e.message);
  }

  await conn.end();
}

main().catch(console.error);
