const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  const [users] = await conn.query("SELECT id, email, role, primary_role FROM users WHERE email IN ('owner@kesorn.com', 'tenant@kesorn.com')");
  console.log('--- Users ---');
  console.log(users);

  const [dormCols] = await conn.query("DESCRIBE dormitory_registry");
  console.log('--- dormitory_registry cols ---');
  console.log(dormCols.map(c => c.Field));

  const [dorms] = await conn.query("SELECT * FROM dormitory_registry");
  console.log('--- Dormitories ---');
  console.log(dorms);

  const [convCols] = await conn.query("DESCRIBE conversations");
  console.log('--- conversations cols ---');
  console.log(convCols.map(c => c.Field));

  const [convs] = await conn.query("SELECT * FROM conversations ORDER BY id DESC LIMIT 5");
  console.log('--- Conversations ---');
  console.log(convs);

  const [notifCols] = await conn.query("DESCRIBE notifications");
  console.log('--- notifications cols ---');
  console.log(notifCols.map(c => c.Field));

  const [notifs] = await conn.query("SELECT * FROM notifications ORDER BY id DESC LIMIT 10");
  console.log('--- Recent Notifications ---');
  console.log(notifs);

  await conn.end();
}

main().catch(console.error);
