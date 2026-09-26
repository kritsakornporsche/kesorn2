const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function patchSchema() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306/kesorn_db';
  const conn = await mysql.createConnection(dbUrl);
  console.log('Connected to kesorn_db for schema patching...');

  // 1. Patch meter_readings table
  try {
    const [cols] = await conn.query('DESCRIBE meter_readings');
    const colNames = cols.map(c => c.Field);
    
    if (!colNames.includes('dorm_id')) {
      console.log('Adding dorm_id to meter_readings...');
      await conn.query('ALTER TABLE meter_readings ADD COLUMN dorm_id INT NOT NULL DEFAULT 1 AFTER id');
    }
    if (!colNames.includes('photo_url')) {
      console.log('Adding photo_url to meter_readings...');
      await conn.query('ALTER TABLE meter_readings ADD COLUMN photo_url LONGTEXT NULL AFTER current_reading');
    }
    // Check type column
    console.log('Updating type in meter_readings to VARCHAR(50)...');
    await conn.query('ALTER TABLE meter_readings MODIFY COLUMN type VARCHAR(50) NOT NULL');
    console.log('✅ meter_readings schema patched.');
  } catch (e) {
    console.error('Error patching meter_readings:', e.message);
  }

  // 2. Patch contracts table
  try {
    const [cols] = await conn.query('DESCRIBE contracts');
    const colNames = cols.map(c => c.Field);

    if (!colNames.includes('contract_file_url')) {
      console.log('Adding contract_file_url to contracts...');
      await conn.query('ALTER TABLE contracts ADD COLUMN contract_file_url LONGTEXT NULL AFTER status');
    }
    if (!colNames.includes('renewal_requested')) {
      console.log('Adding renewal_requested to contracts...');
      await conn.query('ALTER TABLE contracts ADD COLUMN renewal_requested TINYINT(1) DEFAULT 0 AFTER contract_file_url');
    }
    if (!colNames.includes('renewal_note')) {
      console.log('Adding renewal_note to contracts...');
      await conn.query('ALTER TABLE contracts ADD COLUMN renewal_note TEXT NULL AFTER renewal_requested');
    }
    if (!colNames.includes('parent_contract_id')) {
      console.log('Adding parent_contract_id to contracts...');
      await conn.query('ALTER TABLE contracts ADD COLUMN parent_contract_id INT NULL AFTER renewal_note');
    }
    console.log('✅ contracts schema patched.');
  } catch (e) {
    console.error('Error patching contracts:', e.message);
  }

  // 2.3 Patch maintenance_requests table
  try {
    const [cols] = await conn.query('DESCRIBE maintenance_requests');
    const colNames = cols.map(c => c.Field);
    console.log('Modifying status in maintenance_requests to VARCHAR(50)...');
    await conn.query('ALTER TABLE maintenance_requests MODIFY COLUMN status VARCHAR(50) DEFAULT "Pending"');
    if (!colNames.includes('notes')) {
      console.log('Adding notes to maintenance_requests...');
      await conn.query('ALTER TABLE maintenance_requests ADD COLUMN notes TEXT NULL AFTER description');
    }
    if (!colNames.includes('photo_url')) {
      console.log('Adding photo_url to maintenance_requests...');
      await conn.query('ALTER TABLE maintenance_requests ADD COLUMN photo_url LONGTEXT NULL AFTER image_url');
    }
    console.log('✅ maintenance_requests schema patched.');
  } catch (e) {
    console.error('Error patching maintenance_requests:', e.message);
  }

  // 2.4 Patch bills table
  try {
    const [cols] = await conn.query('DESCRIBE bills');
    const colNames = cols.map(c => c.Field);
    console.log('Modifying status in bills to VARCHAR(50)...');
    await conn.query('ALTER TABLE bills MODIFY COLUMN status VARCHAR(50) DEFAULT "Unpaid"');
    if (!colNames.includes('dorm_id')) {
      console.log('Adding dorm_id to bills...');
      await conn.query('ALTER TABLE bills ADD COLUMN dorm_id INT NOT NULL DEFAULT 1 AFTER tenant_id');
    }
    console.log('✅ bills schema patched.');
  } catch (e) {
    console.error('Error patching bills:', e.message);
  }

  // 2.5 Patch move_out_requests table (add desired_date if missing and relax status)
  try {
    const [cols] = await conn.query('DESCRIBE move_out_requests');
    const colNames = cols.map(c => c.Field);
    console.log('Modifying status in move_out_requests to VARCHAR(50)...');
    await conn.query('ALTER TABLE move_out_requests MODIFY COLUMN status VARCHAR(50) DEFAULT "Pending"');
    if (!colNames.includes('desired_date')) {
      console.log('Adding desired_date to move_out_requests...');
      await conn.query('ALTER TABLE move_out_requests ADD COLUMN desired_date DATE NULL AFTER move_out_date');
    }
    console.log('✅ move_out_requests schema patched.');
  } catch (e) {
    console.error('Error patching move_out_requests:', e.message);
  }

  // 2.1 Patch dormitory_profile table (add dorm_id, ocr_api_key, ocr_provider if missing)
  try {
    const [cols] = await conn.query('DESCRIBE dormitory_profile');
    const colNames = cols.map(c => c.Field);
    if (!colNames.includes('dorm_id')) {
      console.log('Adding dorm_id to dormitory_profile...');
      await conn.query('ALTER TABLE dormitory_profile ADD COLUMN dorm_id INT NOT NULL DEFAULT 1 AFTER id');
    }
    if (!colNames.includes('ocr_api_key')) {
      console.log('Adding ocr_api_key to dormitory_profile...');
      await conn.query('ALTER TABLE dormitory_profile ADD COLUMN ocr_api_key VARCHAR(255) NULL AFTER promptpay_name');
    }
    if (!colNames.includes('ocr_provider')) {
      console.log('Adding ocr_provider to dormitory_profile...');
      await conn.query('ALTER TABLE dormitory_profile ADD COLUMN ocr_provider VARCHAR(50) DEFAULT "gemini" AFTER ocr_api_key');
    }
    console.log('✅ dormitory_profile patched with ocr_api_key and ocr_provider.');
  } catch (e) {
    console.error('Error patching dormitory_profile:', e.message);
  }

  // 2.2 Create dormitory_packages table if missing
  try {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS dormitory_packages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
        duration_days INT NOT NULL DEFAULT 30,
        features LONGTEXT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const [pkgCount] = await conn.query('SELECT COUNT(*) as cnt FROM dormitory_packages');
    if (pkgCount[0].cnt === 0) {
      await conn.query(`
        INSERT INTO dormitory_packages (name, price, duration_days, features) VALUES
        ('Starter', 499.00, 30, '["ระบบจดมิเตอร์น้ำ-ไฟ", "จัดการห้องพัก 20 ห้อง", "แจ้งหนี้ผ่าน QR Code"]'),
        ('Professional', 990.00, 30, '["ครบทุกฟังก์ชัน Starter", "ระบบสัญญาเช่าออนไลน์", "ระบบแจ้งซ่อมและจัดการช่าง/แม่บ้าน", "สรุปรายรับรายจ่าย"]'),
        ('Enterprise', 1890.00, 30, '["ครบทุกฟังก์ชัน", "ไม่จำกัดจำนวนห้อง", "Support 24/7", "OCR ตรวจสลิปอัตโนมัติ"]')
      `);
      console.log('Seeded dormitory_packages.');
    }
    console.log('✅ dormitory_packages ready.');
  } catch (e) {
    console.error('Error setting up dormitory_packages:', e.message);
  }

  // 3. Patch users table
  try {
    const [cols] = await conn.query('DESCRIBE users');
    const colNames = cols.map(c => c.Field);

    // Sync primary_role with role if null
    console.log('Syncing users primary_role...');
    await conn.query('UPDATE users SET primary_role = role WHERE primary_role IS NULL OR primary_role = ""');
    console.log('✅ users primary_role synced.');
  } catch (e) {
    console.error('Error updating users:', e.message);
  }

  // 4. Seed initial meter readings for 20 rooms if empty
  const [meterCount] = await conn.query('SELECT COUNT(*) as cnt FROM meter_readings');
  if (meterCount[0].cnt === 0) {
    console.log('Seeding initial meter readings for 20 rooms (cycles: 2026-08, 2026-09)...');
    const [rooms] = await conn.query('SELECT id, room_number, dorm_id FROM rooms ORDER BY id ASC');
    const cycles = ['2026-08', '2026-09'];
    for (const r of rooms) {
      let prevWater = 100 + (r.id * 5);
      let currWater = prevWater + 6;
      let prevElec = 300 + (r.id * 12);
      let currElec = prevElec + 45;

      for (const cycle of cycles) {
        await conn.query(
          'INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, billing_cycle, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [r.dorm_id || 1, r.id, 'Water', prevWater, currWater, cycle]
        );
        await conn.query(
          'INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, billing_cycle, created_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
          [r.dorm_id || 1, r.id, 'Electric', prevElec, currElec, cycle]
        );
        prevWater = currWater;
        currWater += 5;
        prevElec = currElec;
        currElec += 50;
      }
    }
    console.log('✅ Seeded meter readings for all rooms.');
  }

  // 5. Ensure a sample contract exists for tenant@kesorn.com in room 5
  try {
    const [tenant] = await conn.query('SELECT t.id as tenant_id, t.room_id FROM tenants t WHERE t.email = "tenant@kesorn.com"');
    if (tenant.length > 0) {
      const [existingContract] = await conn.query('SELECT id FROM contracts WHERE tenant_id = ?', [tenant[0].tenant_id]);
      if (existingContract.length === 0) {
        console.log('Creating sample contract for tenant@kesorn.com...');
        await conn.query(`
          INSERT INTO contracts 
          (tenant_id, room_id, start_date, end_date, deposit_amount, status, contract_file_url, created_at)
          VALUES (?, ?, '2026-06-01 00:00:00', '2027-05-31 23:59:59', 2000.00, 'Active', '/images/kesorn/building-front.jpg', NOW())
        `, [tenant[0].tenant_id, tenant[0].room_id || 5]);
        console.log('✅ Sample contract created.');
      }
    }
  } catch (e) {
    console.error('Error creating sample contract:', e.message);
  }

  await conn.end();
  console.log('🎉 Schema patching completed successfully!');
}

patchSchema().catch(console.error);
