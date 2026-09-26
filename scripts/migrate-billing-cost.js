const mysql = require('mysql2/promise');

async function migrate() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('--- Migrating Database for Maintenance & Cleaning Billing ---');

  // Check columns in maintenance_requests
  const [maintCols] = await conn.execute('DESCRIBE maintenance_requests');
  const maintColNames = maintCols.map(c => c.Field);
  
  if (!maintColNames.includes('cost')) {
    console.log('Adding cost to maintenance_requests...');
    await conn.execute('ALTER TABLE maintenance_requests ADD COLUMN cost DECIMAL(10,2) DEFAULT 0.00 AFTER description');
  } else {
    console.log('cost already exists in maintenance_requests');
  }

  if (!maintColNames.includes('bill_id')) {
    console.log('Adding bill_id to maintenance_requests...');
    await conn.execute('ALTER TABLE maintenance_requests ADD COLUMN bill_id INT(11) NULL AFTER cost');
  } else {
    console.log('bill_id already exists in maintenance_requests');
  }

  // Check columns in cleaning_jobs
  const [cleanCols] = await conn.execute('DESCRIBE cleaning_jobs');
  const cleanColNames = cleanCols.map(c => c.Field);

  if (!cleanColNames.includes('cost')) {
    console.log('Adding cost to cleaning_jobs...');
    await conn.execute('ALTER TABLE cleaning_jobs ADD COLUMN cost DECIMAL(10,2) DEFAULT 0.00 AFTER task');
  } else {
    console.log('cost already exists in cleaning_jobs');
  }

  if (!cleanColNames.includes('bill_id')) {
    console.log('Adding bill_id to cleaning_jobs...');
    await conn.execute('ALTER TABLE cleaning_jobs ADD COLUMN bill_id INT(11) NULL AFTER cost');
  } else {
    console.log('bill_id already exists in cleaning_jobs');
  }

  console.log('Migration completed successfully!');
  await conn.end();
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
