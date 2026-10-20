import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getDb } from '@/lib/db';
import { Pool } from '@/lib/mysql-adapter';
import { requireRole } from '@/lib/authz';
import { parsePhone } from '@/lib/phone';

const DORM_ID = 1;
const SUB_ROLES = ['maid', 'technician'];

// GET: managers + keepers that belong to this dorm (keepers table)
export async function GET() {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;

  try {
    const sql = getDb();
    const staff = await sql`
      SELECT id, name, email, phone, role, sub_role, is_active
      FROM users
      WHERE role = 'manager'
         OR (role = 'keeper' AND id IN (SELECT user_id FROM keepers WHERE dorm_id = ${DORM_ID} AND user_id IS NOT NULL))
      ORDER BY role, name
    `;
    return NextResponse.json({ success: true, data: staff });
  } catch (error: any) {
    console.error('[Staff GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดรายชื่อพนักงานไม่สำเร็จ' }, { status: 500 });
  }
}

// POST: create a manager or keeper login account
export async function POST(req: Request) {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;

  const { name, email, phone, password, role, sub_role } = await req.json();
  const cleanEmail = String(email || '').toLowerCase().trim();

  if (!name?.trim() || !cleanEmail || !password) {
    return NextResponse.json({ success: false, message: 'กรุณากรอกชื่อ อีเมล และรหัสผ่าน' }, { status: 400 });
  }
  if (String(password).length < 6) {
    return NextResponse.json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
  }
  const ph = parsePhone(phone); // commit 28a
  if (!ph.ok) return NextResponse.json({ success: false, message: ph.message }, { status: 400 });
  if (role !== 'manager' && !(role === 'keeper' && SUB_ROLES.includes(sub_role))) {
    return NextResponse.json({ success: false, message: 'ตำแหน่งไม่ถูกต้อง' }, { status: 400 });
  }

  const sql = getDb();
  const existing = await sql`SELECT id FROM users WHERE LOWER(email) = ${cleanEmail} LIMIT 1`;
  if (existing.length > 0) {
    return NextResponse.json({ success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว' }, { status: 409 });
  }

  const hashed = await bcrypt.hash(String(password), 10);
  const subRole = role === 'keeper' ? sub_role : null;

  // users + keepers rows must be created together
  const client = await new Pool({ connectionString: process.env.DATABASE_URL }).connect();
  try {
    await client.query('START TRANSACTION', []);
    const userRes: any = await client.query(
      'INSERT INTO users (name, email, password, phone, role, primary_role, sub_role, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, 1)',
      [name.trim(), cleanEmail, hashed, ph.value, role, role, subRole]
    );
    const userId = userRes.rows.insertId;
    if (role === 'keeper') {
      await client.query(
        'INSERT INTO keepers (user_id, name, email, phone, position, dorm_id) VALUES (?, ?, ?, ?, ?, ?)',
        [userId, name.trim(), cleanEmail, ph.value, subRole === 'maid' ? 'Maid' : 'Technician', DORM_ID]
      );
    }
    await client.query('COMMIT', []);
    return NextResponse.json({ success: true, message: 'สร้างบัญชีพนักงานแล้ว', data: { id: userId } }, { status: 201 });
  } catch (error: any) {
    await client.query('ROLLBACK', []).catch(() => {});
    console.error('[Staff POST Error]', error);
    return NextResponse.json({ success: false, message: 'สร้างบัญชีไม่สำเร็จ' }, { status: 500 });
  } finally {
    client.release();
  }
}

// PATCH: update name/phone, reset password, or open/close the account
export async function PATCH(req: Request) {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;

  const { id, name, phone, password, is_active } = await req.json();
  const sql = getDb();

  const rows = await sql`SELECT id, role FROM users WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0 || !['manager', 'keeper'].includes(rows[0].role)) {
    return NextResponse.json({ success: false, message: 'แก้ไขได้เฉพาะบัญชีพนักงาน' }, { status: 403 });
  }

  if (password !== undefined && password !== '') {
    if (String(password).length < 6) {
      return NextResponse.json({ success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' }, { status: 400 });
    }
    const hashed = await bcrypt.hash(String(password), 10);
    await sql`UPDATE users SET password = ${hashed} WHERE id = ${id}`;
  }
  if (name !== undefined && String(name).trim()) {
    await sql`UPDATE users SET name = ${String(name).trim()} WHERE id = ${id}`;
  }
  if (phone !== undefined) {
    const ph = parsePhone(phone); // commit 28a
    if (!ph.ok) return NextResponse.json({ success: false, message: ph.message }, { status: 400 });
    await sql`UPDATE users SET phone = ${ph.value} WHERE id = ${id}`;
  }
  if (is_active !== undefined) {
    await sql`UPDATE users SET is_active = ${is_active ? 1 : 0} WHERE id = ${id}`;
  }

  return NextResponse.json({ success: true, message: 'บันทึกแล้ว' });
}
