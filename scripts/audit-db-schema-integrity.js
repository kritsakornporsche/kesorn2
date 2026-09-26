const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('1. Checking and fixing notifications table...');
  const [cols] = await conn.query("DESCRIBE notifications");
  const colNames = cols.map(c => c.Field);

  if (!colNames.includes('type')) {
    console.log('Adding type column to notifications...');
    await conn.query("ALTER TABLE notifications ADD COLUMN type VARCHAR(50) DEFAULT 'info' AFTER message");
  }

  if (!colNames.includes('link')) {
    console.log('Adding link column to notifications...');
    await conn.query("ALTER TABLE notifications ADD COLUMN link VARCHAR(255) NULL AFTER is_read");
  }

  // Sync link and link_url if both exist
  if (colNames.includes('link_url')) {
    await conn.query("UPDATE notifications SET link = link_url WHERE link IS NULL AND link_url IS NOT NULL");
  }

  console.log('notifications table updated successfully.');

  // Let's also check contract renewal column on contracts table
  console.log('\n2. Checking contracts table columns...');
  const [cCols] = await conn.query("DESCRIBE contracts");
  const cColNames = cCols.map(c => c.Field);
  console.log('Contract columns:', cColNames);
  
  if (!cColNames.includes('renewal_requested')) {
    console.log('Adding renewal_requested to contracts...');
    await conn.query("ALTER TABLE contracts ADD COLUMN renewal_requested TINYINT(1) DEFAULT 0");
  }
  if (!cColNames.includes('renewal_note')) {
    console.log('Adding renewal_note to contracts...');
    await conn.query("ALTER TABLE contracts ADD COLUMN renewal_note TEXT NULL");
  }

  // Check dormitory_registry columns
  console.log('\n3. Checking dormitory_registry columns...');
  const [dCols] = await conn.query("DESCRIBE dormitory_registry");
  const dColNames = dCols.map(c => c.Field);
  console.log('Dormitory registry columns:', dColNames);
  if (!dColNames.includes('name')) {
    console.log('Adding name column to dormitory_registry (as copy of dorm_name)...');
    await conn.query("ALTER TABLE dormitory_registry ADD COLUMN name VARCHAR(255) NULL AFTER dorm_name");
    await conn.query("UPDATE dormitory_registry SET name = dorm_name WHERE name IS NULL");
  }

  // Check conversations columns
  console.log('\n4. Checking conversations columns...');
  const [convCols] = await conn.query("DESCRIBE conversations");
  console.log('Conversations columns:', convCols.map(c => c.Field));

  console.log('\nAll schema integrity fixes applied!');
  await conn.end();
}

main().catch(console.error);
