import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน' }, { status: 400 });
    }

    const inputNorm = email.toLowerCase().trim();
    const sql = getDb();

    const verifyPassword = async (storedHash: string): Promise<boolean> => {
      if (!storedHash) return false;
      if (storedHash.startsWith('$2')) {
        const directMatch = await bcrypt.compare(password, storedHash);
        if (directMatch) return true;
        // Fallback: try lower-cased password in case user typed uppercase or capitalized
        return await bcrypt.compare(password.toLowerCase(), storedHash);
      }
      if (storedHash.length === 64) {
        const crypto = require('crypto');
        const hash = crypto.createHash('sha256').update(password).digest('hex');
        if (hash === storedHash) return true;
        return crypto.createHash('sha256').update(password.toLowerCase()).digest('hex') === storedHash;
      }
      return password === storedHash || password.toLowerCase() === storedHash.toLowerCase();
    };

    // ── 1. Check platform_admins ────────────────────────────────────────────
    try {
      const admins = await sql`
        SELECT id, name, email, password, role FROM platform_admins
        WHERE (LOWER(email) = ${inputNorm} OR LOWER(name) = ${inputNorm}) AND is_active = TRUE LIMIT 1
      `;
      if (admins.length > 0) {
        if (await verifyPassword(admins[0].password)) {
          return NextResponse.json({
            success: true,
            message: 'เข้าสู่ระบบสำเร็จ (Platform Admin)',
            redirectUrl: '/platform',
            user: { ...admins[0], role: 'platform_admin', dormDbName: null },
          });
        } else {
          return NextResponse.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
        }
      }
    } catch (e) { /* ignore */ }

    // ── 2. Search users table (by email OR name/username) ─────────────────────
    const users = await sql`
      SELECT id, name, email, password, role, sub_role, is_active 
      FROM users
      WHERE LOWER(email) = ${inputNorm} OR LOWER(name) = ${inputNorm}
      LIMIT 1
    `;

    if (users.length > 0) {
      const user = users[0];
      const isMatch = await verifyPassword(user.password);
      if (isMatch) {
        const effectiveRole = user.role || 'guest';
        let redirectUrl = '/explore';
        
        if (effectiveRole === 'owner') redirectUrl = '/owner';
        else if (effectiveRole === 'tenant') redirectUrl = '/tenant';
        else if (effectiveRole === 'keeper') {
          if (user.sub_role === 'maid') redirectUrl = '/keeper/maid';
          else if (user.sub_role === 'technician') redirectUrl = '/keeper/technician';
          else redirectUrl = '/keeper';
        } else if (effectiveRole === 'researcher') {
          redirectUrl = '/researcher';
        }

        return NextResponse.json({
          success: true,
          message: 'เข้าสู่ระบบสำเร็จ',
          redirectUrl,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: effectiveRole,
            sub_role: user.sub_role,
          },
        });
      } else {
        return NextResponse.json({ success: false, message: 'รหัสผ่านไม่ถูกต้อง' }, { status: 401 });
      }
    }

    return NextResponse.json({ success: false, message: 'ไม่พบชื่อผู้ใช้งานหรืออีเมลนี้ในระบบ' }, { status: 404 });
  } catch (error: any) {
    console.error('[API Login Error]', error);
    return NextResponse.json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: ' + error.message }, { status: 500 });
  }
}
