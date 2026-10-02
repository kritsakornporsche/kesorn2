const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('--- Migrating Database for Move-Out Rule 16 ---');

  // 1. Add ready_to_occupy_date to rooms
  try {
    await conn.query(`
      ALTER TABLE rooms 
      ADD COLUMN ready_to_occupy_date DATE NULL
    `);
    console.log('✓ Added ready_to_occupy_date column to rooms');
  } catch (err) {
    if (err.code === 'ER_DUP_FIELDNAME') {
      console.log('ℹ ready_to_occupy_date already exists in rooms');
    } else {
      console.error('Error adding ready_to_occupy_date:', err.message);
    }
  }

  // 2. Add move-out metering & settlement fields to move_out_requests
  const morColumns = [
    { name: 'electric_prev_unit', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'electric_new_unit', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'electric_units_used', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'electric_amount', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'water_amount', type: 'DECIMAL(10,2) DEFAULT 100' },
    { name: 'common_fee', type: 'DECIMAL(10,2) DEFAULT 150' },
    { name: 'room_rent_amount', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'extra_damage_amount', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'extra_damage_note', type: 'TEXT NULL' },
    { name: 'total_expenses', type: 'DECIMAL(10,2) DEFAULT 0' },
    { name: 'ready_to_occupy_date', type: 'DATE NULL' },
    { name: 'move_out_type', type: "ENUM('Early', 'Normal') DEFAULT 'Normal'" },
    { name: 'settlement_type', type: "ENUM('OwnerRefund', 'TenantPay', 'ZeroBalance') DEFAULT 'ZeroBalance'" },
    { name: 'settlement_status', type: "ENUM('PendingMeter', 'PendingPayment', 'Completed') DEFAULT 'PendingMeter'" },
    { name: 'tenant_paid_slip_url', type: 'TEXT NULL' },
    { name: 'tenant_paid_at', type: 'DATETIME NULL' }
  ];

  for (const col of morColumns) {
    try {
      await conn.query(`ALTER TABLE move_out_requests ADD COLUMN ${col.name} ${col.type}`);
      console.log(`✓ Added ${col.name} to move_out_requests`);
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME') {
        // already exists
      } else {
        console.error(`Error adding ${col.name}:`, err.message);
      }
    }
  }

  console.log('--- Migration Completed Successfully ---');
  await conn.end();
}

migrate();
