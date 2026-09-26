const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function migrateAndSeed() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kesorn_db',
    multipleStatements: true,
  });

  console.log('Connected to kesorn_db. Starting migration...');

  // 1. Modify users table enum and columns
  console.log('1. Updating users schema and accounts...');
  await conn.query(`
    ALTER TABLE users 
    MODIFY COLUMN role ENUM('owner','tenant','keeper','researcher','guest','platform_admin','admin') NOT NULL DEFAULT 'guest';
  `);

  const [userCols] = await conn.query('DESCRIBE users');
  const userColNames = userCols.map(c => c.Field);
  if (!userColNames.includes('primary_role')) {
    await conn.query('ALTER TABLE users ADD COLUMN primary_role VARCHAR(50) DEFAULT NULL;');
  }
  if (!userColNames.includes('image_url')) {
    await conn.query('ALTER TABLE users ADD COLUMN image_url VARCHAR(255) DEFAULT NULL;');
  }
  if (!userColNames.includes('bio')) {
    await conn.query('ALTER TABLE users ADD COLUMN bio TEXT DEFAULT NULL;');
  }

  // Update admin user to role 'platform_admin'
  await conn.query(`
    UPDATE users 
    SET role = 'platform_admin', primary_role = 'platform_admin'
    WHERE name = 'admin' OR email = 'admin@smartdom.com';
  `);

  // Ensure owner user has role 'owner'
  await conn.query(`
    UPDATE users 
    SET role = 'owner', primary_role = 'owner'
    WHERE name = 'owner' OR email = 'owner@kesorn.com';
  `);

  // 2. Create dormitory_registry table
  console.log('2. Creating dormitory_registry table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS dormitory_registry (
      id INT(11) NOT NULL AUTO_INCREMENT,
      owner_email VARCHAR(255) NOT NULL DEFAULT 'owner@kesorn.com',
      owner_name VARCHAR(255) NOT NULL DEFAULT 'เจ้าของหอพักเกษร 2',
      dorm_name VARCHAR(255) NOT NULL DEFAULT 'หอพักเกษร 2',
      db_name VARCHAR(100) NOT NULL DEFAULT 'kesorn_db',
      phone VARCHAR(50) DEFAULT '081-234-5678',
      address TEXT DEFAULT '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000 (หน้า ม.พะเยา)',
      status ENUM('Active','Suspended','Cancelled') DEFAULT 'Active',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at TIMESTAMP NULL DEFAULT NULL,
      owner_id INT(11) DEFAULT 156,
      PRIMARY KEY (id),
      UNIQUE KEY db_name (db_name),
      KEY idx_owner_email (owner_email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // Ensure dorm 1 exists in dormitory_registry
  const [dorms] = await conn.query('SELECT id FROM dormitory_registry WHERE id = 1');
  const [ownerRows] = await conn.query("SELECT id FROM users WHERE email = 'owner@kesorn.com' LIMIT 1");
  const ownerId = ownerRows.length > 0 ? ownerRows[0].id : 156;

  if (dorms.length === 0) {
    await conn.query(`
      INSERT INTO dormitory_registry (id, owner_email, owner_name, dorm_name, db_name, phone, address, status, owner_id)
      VALUES (1, 'owner@kesorn.com', 'เจ้าของหอพักเกษร 2', 'หอพักเกษร 2', 'kesorn_db', '081-234-5678', '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000 (หน้า ม.พะเยา)', 'Active', ?)
    `, [ownerId]);
  } else {
    await conn.query(`
      UPDATE dormitory_registry 
      SET dorm_name = 'หอพักเกษร 2', owner_email = 'owner@kesorn.com', phone = '081-234-5678', owner_id = ?, status = 'Active'
      WHERE id = 1
    `, [ownerId]);
  }

  // 3. Create keeper_dormitories table
  console.log('3. Creating keeper_dormitories table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS keeper_dormitories (
      id INT(11) NOT NULL AUTO_INCREMENT,
      user_id INT(11) NOT NULL,
      keeper_id INT(11) DEFAULT NULL,
      dorm_id INT(11) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY unique_user_dorm (user_id, dorm_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // 4. Create platform_admins table
  console.log('4. Creating platform_admins table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id INT(11) NOT NULL AUTO_INCREMENT,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(50) DEFAULT 'platform_admin',
      is_active TINYINT(1) DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  const hashedAdminPass = await bcrypt.hash('admin', 10);
  const [pAdmins] = await conn.query("SELECT id FROM platform_admins WHERE email = 'admin@smartdom.com' OR name = 'admin'");
  if (pAdmins.length === 0) {
    await conn.query(`
      INSERT INTO platform_admins (name, email, password, role, is_active)
      VALUES ('admin', 'admin@smartdom.com', ?, 'platform_admin', 1)
    `, [hashedAdminPass]);
  } else {
    await conn.query(`
      UPDATE platform_admins 
      SET password = ?, role = 'platform_admin', is_active = 1
      WHERE id = ?
    `, [hashedAdminPass, pAdmins[0].id]);
  }

  // 5. Create platform_accounting table
  console.log('5. Creating platform_accounting table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS platform_accounting (
      id INT(11) NOT NULL AUTO_INCREMENT,
      type ENUM('Income','Expense','Refund') NOT NULL,
      category VARCHAR(100) NOT NULL DEFAULT 'Service',
      amount DECIMAL(12,2) NOT NULL,
      description TEXT DEFAULT NULL,
      dormitory_id INT(11) DEFAULT NULL,
      transaction_date DATE NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
  `);

  // 6. Create user_dorm_roles table
  console.log('6. Creating user_dorm_roles table...');
  await conn.query(`
    CREATE TABLE IF NOT EXISTS user_dorm_roles (
      id INT(11) NOT NULL AUTO_INCREMENT,
      user_id INT(11) NOT NULL,
      dorm_id INT(11) NOT NULL DEFAULT 1,
      role VARCHAR(50) NOT NULL DEFAULT 'guest',
      sub_role VARCHAR(50) DEFAULT NULL,
      is_active TINYINT(1) NOT NULL DEFAULT 1,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      KEY idx_user_id (user_id),
      KEY idx_dorm_id (dorm_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
  `);

  // 7. Update dormitory_profile table (water = 100 flat, electricity = 7)
  console.log('7. Updating dormitory_profile rates and real data...');
  await conn.query(`
    UPDATE dormitory_profile 
    SET 
      name = 'หอพักเกษร 2',
      address = '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000',
      phone = '081-234-5678',
      water_rate = 100.00,
      electricity_rate = 7.00,
      promptpay_number = '0812345678',
      promptpay_name = 'หอพักเกษร 2 (ม.พะเยา)',
      pet_friendly = 1
    WHERE id = 1;
  `);

  // 8. Update rooms table
  console.log('8. Updating rooms table and room numbers (1-20)...');
  const [roomCols] = await conn.query('DESCRIBE rooms');
  if (!roomCols.map(c => c.Field).includes('dorm_id')) {
    await conn.query('ALTER TABLE rooms ADD COLUMN dorm_id INT(11) NOT NULL DEFAULT 1;');
  }

  // Set room numbers 1 to 20
  const [existingRooms] = await conn.query('SELECT id FROM rooms ORDER BY id ASC LIMIT 20');
  for (let i = 0; i < existingRooms.length; i++) {
    const roomNum = String(i + 1);
    const floor = i < 10 ? 1 : 2;
    await conn.query('UPDATE rooms SET room_number = ?, floor = ?, dorm_id = 1 WHERE id = ?', [
      roomNum,
      floor,
      existingRooms[i].id,
    ]);
  }

  // 9. Update keepers table
  console.log('9. Updating keepers schema and team...');
  const [keeperCols] = await conn.query('DESCRIBE keepers');
  const keeperColNames = keeperCols.map(c => c.Field);
  if (!keeperColNames.includes('name')) {
    await conn.query('ALTER TABLE keepers ADD COLUMN name VARCHAR(255) NOT NULL DEFAULT "";');
  }
  if (!keeperColNames.includes('email')) {
    await conn.query('ALTER TABLE keepers ADD COLUMN email VARCHAR(255) DEFAULT NULL;');
  }
  if (!keeperColNames.includes('phone')) {
    await conn.query('ALTER TABLE keepers ADD COLUMN phone VARCHAR(50) DEFAULT NULL;');
  }
  if (!keeperColNames.includes('dorm_id')) {
    await conn.query('ALTER TABLE keepers ADD COLUMN dorm_id INT(11) NOT NULL DEFAULT 1;');
  }

  // Find maid and technician user IDs
  const [maidUser] = await conn.query("SELECT id FROM users WHERE email = 'maid@kesorn.com' LIMIT 1");
  const [techUser] = await conn.query("SELECT id FROM users WHERE email = 'technician@kesorn.com' LIMIT 1");
  const maidUserId = maidUser.length > 0 ? maidUser[0].id : 158;
  const techUserId = techUser.length > 0 ? techUser[0].id : 159;

  // Insert or update keepers
  await conn.query(`
    INSERT INTO keepers (id, name, email, phone, position, user_id, dorm_id)
    VALUES (1, 'สมศรี แม่บ้านประจำหอ', 'maid@kesorn.com', '089-111-2222', 'Maid', ?, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), phone = VALUES(phone), position = VALUES(position), user_id = VALUES(user_id), dorm_id = 1
  `, [maidUserId]);

  await conn.query(`
    INSERT INTO keepers (id, name, email, phone, position, user_id, dorm_id)
    VALUES (2, 'สมศักดิ์ ช่างซ่อมบำรุง', 'technician@kesorn.com', '089-333-4444', 'Technician', ?, 1)
    ON DUPLICATE KEY UPDATE name = VALUES(name), email = VALUES(email), phone = VALUES(phone), position = VALUES(position), user_id = VALUES(user_id), dorm_id = 1
  `, [techUserId]);

  // Insert into keeper_dormitories
  await conn.query(`
    INSERT IGNORE INTO keeper_dormitories (user_id, keeper_id, dorm_id)
    VALUES (?, 1, 1), (?, 2, 1)
  `, [maidUserId, techUserId]);

  // 10. Update dormitory_rules table
  console.log('10. Updating dormitory_rules schema and data...');
  const [ruleCols] = await conn.query('DESCRIBE dormitory_rules');
  const ruleColNames = ruleCols.map(c => c.Field);
  if (!ruleColNames.includes('dorm_id')) {
    await conn.query('ALTER TABLE dormitory_rules ADD COLUMN dorm_id INT(11) NOT NULL DEFAULT 1;');
  }
  if (!ruleColNames.includes('description')) {
    await conn.query('ALTER TABLE dormitory_rules ADD COLUMN description TEXT;');
    await conn.query('UPDATE dormitory_rules SET description = content WHERE description IS NULL;');
  }
  if (!ruleColNames.includes('category')) {
    await conn.query("ALTER TABLE dormitory_rules ADD COLUMN category VARCHAR(50) DEFAULT 'ทั่วไป';");
  }
  if (!ruleColNames.includes('fine_amount')) {
    await conn.query('ALTER TABLE dormitory_rules ADD COLUMN fine_amount DECIMAL(10,2) DEFAULT 0;');
  }
  if (!ruleColNames.includes('sort_order')) {
    await conn.query('ALTER TABLE dormitory_rules ADD COLUMN sort_order INT(11) DEFAULT 0;');
  }
  if (!ruleColNames.includes('updated_at')) {
    await conn.query('ALTER TABLE dormitory_rules ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP;');
  }

  await conn.query('ALTER TABLE dormitory_rules MODIFY COLUMN content TEXT NULL;');
  await conn.query('DELETE FROM dormitory_rules WHERE dorm_id = 1');
  const rules = [
    { title: 'การเข้า-ออกอาคาร', category: 'การเข้า-ออก', description: 'ประตูทางเข้าหลักปิดเวลา 23:00 น. หลังจากนั้นต้องใช้คีย์การ์ดสแกนเพื่อเข้าอาคาร', fine: 0, sort: 1 },
    { title: 'การรักษาความสะอาดและสัตว์เลี้ยง', category: 'สัตว์เลี้ยง', description: 'อนุญาตให้เลี้ยงสัตว์เลี้ยงขนาดเล็กได้ (Pet-Friendly) โดยเจ้าของต้องดูแลรักษาความสะอาด ไม่ส่งเสียงรบกวนผู้อื่น และทิ้งขยะในจุดที่กำหนด', fine: 0, sort: 2 },
    { title: 'การใช้เสียง', category: 'การใช้เสียง', description: 'งดใช้เสียงดังหลังเวลา 22:00 น. เพื่อความสงบเรียบร้อยของผู้พักอาศัยท่านอื่น', fine: 500, sort: 3 },
    { title: 'ความปลอดภัยและอัคคีภัย', category: 'ความปลอดภัย', description: 'ห้ามสูบบุหรี่ กัญชา หรือสารเสพติดทุกชนิดภายในอาคารและระเบียงห้องพัก ฝ่าฝืนปรับ 2,000 บาท', fine: 2000, sort: 4 },
    { title: 'การชำระค่าเช่า', category: 'ทั่วไป', description: 'กำหนดชำระค่าเช่าภายในวันที่ 1-5 ของทุกเดือน หากเกินกำหนดมีค่าปรับวันละ 50 บาท', fine: 50, sort: 5 },
  ];

  for (const r of rules) {
    await conn.query(`
      INSERT INTO dormitory_rules (dorm_id, title, content, description, category, fine_amount, is_active, sort_order)
      VALUES (1, ?, ?, ?, ?, ?, 1, ?)
    `, [r.title, r.description, r.description, r.category, r.fine, r.sort]);
  }

  // 11. Update announcements & announcement_reads
  console.log('11. Updating announcements schema and data...');
  const [annCols] = await conn.query('DESCRIBE announcements');
  const annColNames = annCols.map(c => c.Field);
  if (!annColNames.includes('dorm_id')) {
    await conn.query('ALTER TABLE announcements ADD COLUMN dorm_id INT(11) DEFAULT 1;');
  }
  if (!annColNames.includes('category')) {
    await conn.query("ALTER TABLE announcements ADD COLUMN category VARCHAR(50) DEFAULT 'general';");
  }
  if (!annColNames.includes('is_active')) {
    await conn.query('ALTER TABLE announcements ADD COLUMN is_active TINYINT(1) DEFAULT 1;');
  }

  const [arCols] = await conn.query('DESCRIBE announcement_reads');
  const arColNames = arCols.map(c => c.Field);
  if (!arColNames.includes('tenant_id')) {
    await conn.query('ALTER TABLE announcement_reads ADD COLUMN tenant_id INT(11) DEFAULT NULL;');
  }

  // Seed announcements
  await conn.query('DELETE FROM announcements WHERE dorm_id = 1');
  await conn.query(`
    INSERT INTO announcements (dorm_id, title, content, category, is_important, is_active)
    VALUES 
    (1, '📢 ยินดีต้อนรับสู่ระบบ SmartDom หอพักเกษร 2', 'ลูกหอสามารถตรวจสอบบิลค่าเช่า จดมิเตอร์ แจ้งซ่อม และติดต่อผู้ดูแลได้ตลอด 24 ชม. ผ่านระบบ', 'announcement', 1, 1),
    (1, '⚡ แจ้งอัตราค่าน้ำ-ค่าไฟ หอพักเกษร 2', 'อัตราค่าไฟฟ้า 7 บาท/หน่วย และค่าน้ำประปาเหมาจ่าย 100 บาท/ห้อง/เดือน เริ่มรอบบิลปัจจุบันครับ', 'billing', 1, 1);
  `);

  // 12. Add dorm_id to tables where needed
  console.log('12. Ensuring dorm_id across related tables...');
  const tablesWithDormId = [
    'maintenance_requests',
    'cleaning_jobs',
    'accounting_transactions',
    'tenants'
  ];

  for (const tbl of tablesWithDormId) {
    const [cols] = await conn.query(`DESCRIBE ${tbl}`);
    if (!cols.map(c => c.Field).includes('dorm_id')) {
      await conn.query(`ALTER TABLE ${tbl} ADD COLUMN dorm_id INT(11) NOT NULL DEFAULT 1;`);
      console.log(`Added dorm_id to ${tbl}`);
    }
  }

  // Ensure cleaning_jobs has job_type
  const [cjCols] = await conn.query('DESCRIBE cleaning_jobs');
  if (!cjCols.map(c => c.Field).includes('job_type')) {
    await conn.query("ALTER TABLE cleaning_jobs ADD COLUMN job_type VARCHAR(100) DEFAULT 'ทำความสะอาดทั่วไป';");
  }

  // 13. Update conversations schema
  console.log('13. Updating conversations schema...');
  const [convCols] = await conn.query('DESCRIBE conversations');
  const convColNames = convCols.map(c => c.Field);
  if (!convColNames.includes('guest_id')) {
    await conn.query('ALTER TABLE conversations ADD COLUMN guest_id INT(11) DEFAULT NULL;');
    if (convColNames.includes('tenant_user_id')) {
      await conn.query('UPDATE conversations SET guest_id = tenant_user_id WHERE guest_id IS NULL;');
    }
  }
  if (!convColNames.includes('dorm_id')) {
    await conn.query('ALTER TABLE conversations ADD COLUMN dorm_id INT(11) NOT NULL DEFAULT 1;');
  }

  // 14. Link test tenant to room 5
  console.log('14. Linking test tenant to room 5...');
  const [tenantUserRows] = await conn.query("SELECT id, name, email, phone FROM users WHERE email = 'tenant@kesorn.com' LIMIT 1");
  if (tenantUserRows.length > 0) {
    const tu = tenantUserRows[0];
    const [room5] = await conn.query("SELECT id FROM rooms WHERE room_number = '5' LIMIT 1");
    const room5Id = room5.length > 0 ? room5[0].id : 5;

    // Insert or update tenant
    const [existingT] = await conn.query('SELECT id FROM tenants WHERE user_id = ? OR email = ?', [tu.id, tu.email]);
    let tenantId;
    if (existingT.length === 0) {
      const [insRes] = await conn.query(`
        INSERT INTO tenants (user_id, name, email, phone, room_id, status, move_in_date, dorm_id)
        VALUES (?, 'สมชาย ใจดี (ลูกหอทดสอบ)', ?, '081-987-6543', ?, 'Active', '2026-06-01', 1)
      `, [tu.id, tu.email, room5Id]);
      tenantId = insRes.insertId;
    } else {
      tenantId = existingT[0].id;
      await conn.query(`
        UPDATE tenants 
        SET room_id = ?, status = 'Active', dorm_id = 1, name = 'สมชาย ใจดี (ลูกหอทดสอบ)'
        WHERE id = ?
      `, [room5Id, tenantId]);
    }

    // Update room 5 status to Occupied
    await conn.query("UPDATE rooms SET status = 'Occupied', tenant_id = ? WHERE id = ?", [tenantId, room5Id]);

    // Ensure active contract for room 5
    const [existingContract] = await conn.query('SELECT id FROM contracts WHERE room_id = ? AND status = "Active"', [room5Id]);
    if (existingContract.length === 0) {
      await conn.query(`
        INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, status)
        VALUES (?, ?, '2026-06-01', '2027-05-31', 7000.00, 'Active')
      `, [tenantId, room5Id]);
    }

    // Add sample bill for tenant
    const [bills] = await conn.query('SELECT id FROM bills WHERE tenant_id = ? LIMIT 1', [tenantId]);
    if (bills.length === 0) {
      await conn.query(`
        INSERT INTO bills (tenant_id, room_number, title, amount, billing_cycle, due_date, status, water_units, electric_units, water_amount, electric_amount, room_amount)
        VALUES (?, '5', 'บิลค่าเช่าห้องพักประจำเดือน 9/2026', 3950.00, '2026-09', '2026-09-30', 'Unpaid', 0, 50, 100.00, 350.00, 3500.00)
      `, [tenantId]);
    }
  }

  console.log('✅ Database migration and seeding successfully completed!');
  await conn.end();
}

migrateAndSeed().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
