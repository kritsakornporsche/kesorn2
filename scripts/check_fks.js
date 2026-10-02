const mysql = require('mysql2/promise');

async function checkFks() {
  const conn = await mysql.createConnection({host: 'localhost', user: 'root', password: '', database: 'kesorn_db'});
  const [fks] = await conn.query(`
    SELECT TABLE_NAME, COLUMN_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
    FROM information_schema.KEY_COLUMN_USAGE
    WHERE TABLE_SCHEMA = 'kesorn_db' AND REFERENCED_TABLE_NAME IS NOT NULL
  `);
  console.log('Foreign keys count:', fks.length);
  for (const fk of fks) {
    console.log(`${fk.TABLE_NAME}.${fk.COLUMN_NAME} -> ${fk.REFERENCED_TABLE_NAME}.${fk.REFERENCED_COLUMN_NAME} (${fk.CONSTRAINT_NAME})`);
  }
  await conn.end();
}

checkFks().catch(console.error);
