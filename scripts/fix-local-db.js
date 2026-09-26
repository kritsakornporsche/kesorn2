const mysql = require('mysql2/promise');

async function fixLocalDb() {
  try {
    const db = await mysql.createConnection('mysql://smartdom:smartdom@localhost:3306/kesorn_db');
    console.log('Connected to local kesorn_db');

    const [cols] = await db.query("SHOW COLUMNS FROM contracts LIKE 'slip_url'");
    if (cols.length === 0) {
      console.log('Adding slip_url column to contracts table in local kesorn_db...');
      await db.query("ALTER TABLE contracts ADD COLUMN slip_url LONGTEXT NULL");
      console.log('✅ Added slip_url column to local kesorn_db successfully!');
    } else {
      console.log('ℹ️ slip_url column already exists in local kesorn_db');
    }

    await db.end();
  } catch (e) {
    console.error('Local DB Error:', e.message);
  }
}

fixLocalDb();
