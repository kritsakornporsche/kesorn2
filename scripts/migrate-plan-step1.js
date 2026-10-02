const mysql = require('mysql2/promise');
require('dotenv').config();

async function runMigration() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'kesorn_db',
    multipleStatements: true,
  };

  const conn = await mysql.createConnection(dbConfig);
  console.log(`🚀 Connected to database ${dbConfig.database}. Starting Step 1 Migration...`);

  try {
    // 1. Update dormitory_profile
    console.log('📦 1. Updating dormitory_profile table...');
    const [dormProfileCols] = await conn.query('DESCRIBE dormitory_profile');
    const dormProfileColNames = dormProfileCols.map(c => c.Field);
    
    if (!dormProfileColNames.includes('common_fee')) {
      await conn.query('ALTER TABLE dormitory_profile ADD COLUMN common_fee DECIMAL(10,2) DEFAULT 150.00;');
      console.log('  ✅ Added common_fee to dormitory_profile');
    }

    await conn.query(`
      UPDATE dormitory_profile 
      SET electricity_rate = 4.88, water_rate = 100.00, common_fee = 150.00 
      WHERE id = 1 OR dorm_id = 1;
    `);
    console.log('  ✅ Updated rates in dormitory_profile: Elec=4.88, Water=100.00, Common=150.00');

    // 2. Update contracts table
    console.log('📦 2. Updating contracts table schema...');
    await conn.query(`
      ALTER TABLE contracts 
      MODIFY COLUMN status VARCHAR(50) DEFAULT 'PendingContract';
    `);
    console.log('  ✅ Updated contracts.status');

    // 3. Update bills table
    console.log('📦 3. Updating bills table schema...');
    const [billCols] = await conn.query('DESCRIBE bills');
    const billColNames = billCols.map(c => c.Field);

    if (!billColNames.includes('common_fee')) {
      await conn.query('ALTER TABLE bills ADD COLUMN common_fee DECIMAL(10,2) DEFAULT 150.00;');
      console.log('  ✅ Added common_fee to bills');
    }
    if (!billColNames.includes('penalty_amount')) {
      await conn.query('ALTER TABLE bills ADD COLUMN penalty_amount DECIMAL(10,2) DEFAULT 0.00;');
      console.log('  ✅ Added penalty_amount to bills');
    }
    if (!billColNames.includes('days_overdue')) {
      await conn.query('ALTER TABLE bills ADD COLUMN days_overdue INT DEFAULT 0;');
      console.log('  ✅ Added days_overdue to bills');
    }
    if (!billColNames.includes('is_first_bill')) {
      await conn.query('ALTER TABLE bills ADD COLUMN is_first_bill TINYINT(1) DEFAULT 0;');
      console.log('  ✅ Added is_first_bill to bills');
    }

    await conn.query(`
      ALTER TABLE bills 
      MODIFY COLUMN status VARCHAR(50) DEFAULT 'Unpaid';
    `);
    console.log('  ✅ Updated bills.status');

    // 4. Create bill_corrections table
    console.log('📦 4. Creating bill_corrections table...');
    await conn.query(`
      CREATE TABLE IF NOT EXISTS bill_corrections (
        id INT AUTO_INCREMENT PRIMARY KEY,
        bill_id INT NOT NULL,
        requested_by ENUM('owner', 'tenant') NOT NULL,
        requester_id INT NOT NULL,
        old_electric_reading DECIMAL(10,2) NOT NULL,
        new_electric_reading DECIMAL(10,2) NOT NULL,
        old_total_amount DECIMAL(10,2) NOT NULL,
        new_total_amount DECIMAL(10,2) NOT NULL,
        evidence_photo_url TEXT,
        reason TEXT,
        status ENUM('Pending', 'Approved', 'Rejected') DEFAULT 'Pending',
        reviewed_at DATETIME NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (bill_id) REFERENCES bills(id) ON DELETE CASCADE
      );
    `);
    console.log('  ✅ bill_corrections table created');

    console.log('\n🎉 Step 1: Database Migration Completed 100%!');
    await conn.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration Error:', err);
    await conn.end();
    process.exit(1);
  }
}

runMigration();
