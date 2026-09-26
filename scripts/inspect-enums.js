const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function main() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306/kesorn_db';
  const conn = await mysql.createConnection(dbUrl);

  const [cols] = await conn.query(`
    SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE 
    FROM INFORMATION_SCHEMA.COLUMNS 
    WHERE TABLE_SCHEMA = 'kesorn_db' AND DATA_TYPE = 'enum'
  `);
  console.log('--- ALL ENUM COLUMNS IN KESORN_DB ---');
  for (const c of cols) {
    console.log(`${c.TABLE_NAME}.${c.COLUMN_NAME}: ${c.COLUMN_TYPE}`);
  }
  await conn.end();
}

main().catch(console.error);
