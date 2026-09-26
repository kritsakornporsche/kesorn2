const mysql = require('mysql2/promise');

async function check() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  try {
    const [maintCols] = await conn.execute('DESCRIBE maintenance_requests');
    console.log('maintenance_requests columns:', maintCols.map(c => c.Field + ' (' + c.Type + ')'));
  } catch (e) {
    console.error('maint error:', e.message);
  }

  try {
    const [cleanCols] = await conn.execute('DESCRIBE cleaning_jobs');
    console.log('cleaning_jobs columns:', cleanCols.map(c => c.Field + ' (' + c.Type + ')'));
  } catch (e) {
    console.error('clean error:', e.message);
  }

  try {
    const [billsCols] = await conn.execute('DESCRIBE bills');
    console.log('bills columns:', billsCols.map(c => c.Field + ' (' + c.Type + ')'));
  } catch (e) {
    console.error('bills error:', e.message);
  }

  try {
    const [bills] = await conn.execute('SELECT * FROM bills LIMIT 3');
    console.log('sample bills:', bills);
  } catch (e) {
    console.error('sample bills error:', e.message);
  }

  await conn.end();
  process.exit(0);
}

check().catch(e => {
  console.error(e);
  process.exit(1);
});
