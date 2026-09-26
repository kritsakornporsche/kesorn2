const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config({ path: '.env' });

const TARGET_DB = 'kesorn_db';
const BASE_URL = (process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306').replace(/\/[^\/]+$/, '');

const roleAccounts = [
  {
    name: 'admin',
    email: 'admin@smartdom.com',
    role: 'platform_admin',
    sub_role: null,
    desc: 'Platform / Dorm Admin'
  },
  {
    name: 'owner',
    email: 'owner@kesorn.com',
    role: 'owner',
    sub_role: null,
    desc: 'Dorm Owner (เจ้าของหอพัก)'
  },
  {
    name: 'tenant',
    email: 'tenant@kesorn.com',
    role: 'tenant',
    sub_role: null,
    desc: 'Tenant (ผู้เช่าห้องพัก)'
  },
  {
    name: 'maid',
    email: 'maid@kesorn.com',
    role: 'keeper',
    sub_role: 'maid',
    desc: 'Keeper - Maid (แม่บ้าน)'
  },
  {
    name: 'technician',
    email: 'technician@kesorn.com',
    role: 'keeper',
    sub_role: 'technician',
    desc: 'Keeper - Technician (ช่างซ่อมบำรุง)'
  },
  {
    name: 'keeper',
    email: 'keeper@kesorn.com',
    role: 'keeper',
    sub_role: 'technician',
    desc: 'Keeper (ผู้ดูแลทั่วไป)'
  },
  {
    name: 'researcher',
    email: 'researcher@kesorn.com',
    role: 'researcher',
    sub_role: null,
    desc: 'Researcher (ผู้วิจัยและวิเคราะห์ระบบ)'
  },
  {
    name: 'reseacher',
    email: 'reseacher@kesorn.com',
    role: 'researcher',
    sub_role: null,
    desc: 'Researcher Alias (ผู้วิจัย)'
  },
  {
    name: 'guest',
    email: 'guest@kesorn.com',
    role: 'guest',
    sub_role: null,
    desc: 'Guest (ผู้เยี่ยมชมทั่วไป)'
  }
];

async function seedRoleAccounts() {
  const conn = await mysql.createConnection(`${BASE_URL}/${TARGET_DB}`);
  console.log('Connected to kesorn_db for seeding role accounts...');

  for (const acc of roleAccounts) {
    // Generate bcrypt hash for the role name as password
    // Capitalize first letter as alternative or accept plain lower case
    const hash = await bcrypt.hash(acc.name, 10);
    
    // Check if user already exists by name or email
    const [existing] = await conn.query('SELECT id, name, email FROM users WHERE name = ? OR email = ?', [acc.name, acc.email]);
    
    if (existing.length > 0) {
      console.log(`Updating user: ${acc.name} (${acc.role})...`);
      await conn.query(
        'UPDATE users SET name = ?, email = ?, password = ?, role = ?, sub_role = ?, is_active = 1 WHERE id = ?',
        [acc.name, acc.email, hash, acc.role, acc.sub_role, existing[0].id]
      );
    } else {
      console.log(`Inserting new user: ${acc.name} (${acc.role})...`);
      await conn.query(
        'INSERT INTO users (name, email, password, role, sub_role, is_active) VALUES (?, ?, ?, ?, ?, 1)',
        [acc.name, acc.email, hash, acc.role, acc.sub_role]
      );
    }
  }

  // Also check platform_admins table if exists
  try {
    const [tables] = await conn.query("SHOW TABLES LIKE 'platform_admins'");
    if (tables.length > 0) {
      const adminHash = await bcrypt.hash('admin', 10);
      const [existingAdmin] = await conn.query('SELECT id FROM platform_admins WHERE name = "admin" OR email = "admin@smartdom.com"');
      if (existingAdmin.length > 0) {
        await conn.query('UPDATE platform_admins SET name = "admin", email = "admin@smartdom.com", password = ?, role = "platform_admin", is_active = 1 WHERE id = ?', [adminHash, existingAdmin[0].id]);
      } else {
        await conn.query('INSERT INTO platform_admins (name, email, password, role, is_active) VALUES ("admin", "admin@smartdom.com", ?, "platform_admin", 1)', [adminHash]);
      }
      console.log('Platform admin table updated.');
    }
  } catch (e) {
    console.log('platform_admins check skipped:', e.message);
  }

  console.log('All role accounts successfully seeded!');
  await conn.end();
}

seedRoleAccounts().catch(console.error);
