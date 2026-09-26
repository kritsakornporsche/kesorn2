const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('1. Setting database default collation to utf8mb4_unicode_ci...');
  await conn.query("ALTER DATABASE kesorn_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");

  const [tables] = await conn.query("SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'kesorn_db'");

  console.log(`2. Converting ${tables.length} tables to utf8mb4_unicode_ci...`);
  for (const t of tables) {
    const tableName = t.TABLE_NAME;
    console.log(`Converting table: ${tableName}`);
    await conn.query(`ALTER TABLE \`${tableName}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }

  console.log('\n3. Verifying all table collations...');
  const [updatedTables] = await conn.query("SELECT TABLE_NAME, TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = 'kesorn_db'");
  console.log(updatedTables);

  console.log('\nCollations standardized successfully!');
  await conn.end();
}

main().catch(console.error);
