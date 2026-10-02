const mysql = require('mysql2/promise');

async function fix() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });
  await conn.query("UPDATE users SET role = 'guest' WHERE email = 'guest@kesorn.com'");
  console.log('Successfully set guest@kesorn.com role to guest');
  await conn.end();
}

fix();
