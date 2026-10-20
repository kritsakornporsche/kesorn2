#!/usr/bin/env node
// Development only (commit 24b): creates the demo manager account behind the "ผู้จัดการ" quick sign-in button
// (manager@kesorn.com / password "manager", same pattern as the other demo accounts). Does nothing if it already exists.
// Refuses to run when NODE_ENV is production or the database is not on localhost.
// Usage: (load .env.local) node scripts/seed-demo-manager.js
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

const EMAIL = 'manager@kesorn.com';

(async () => {
  const uri = process.env.DATABASE_URL;
  if (!uri) throw new Error('DATABASE_URL is not set');
  if (process.env.NODE_ENV === 'production') throw new Error('development only: NODE_ENV is production');
  const host = new URL(uri).hostname;
  if (!['localhost', '127.0.0.1', '::1'].includes(host)) throw new Error(`development only: database host is ${host}`);

  const db = await mysql.createConnection({ uri, timezone: '+07:00' });
  try {
    const [found] = await db.query('SELECT id FROM users WHERE email = ?', [EMAIL]);
    if (found.length) { console.log(`${EMAIL} already exists (id ${found[0].id})`); return; }
    const hash = await bcrypt.hash('manager', 10);
    const [r] = await db.query(
      "INSERT INTO users (name, email, password, role, primary_role, is_active) VALUES ('ผู้จัดการ (เดโม)', ?, ?, 'manager', 'manager', 1)",
      [EMAIL, hash],
    );
    console.log(`created ${EMAIL} (id ${r.insertId})`);
  } finally {
    await db.end();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
