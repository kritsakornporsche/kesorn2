import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import bcrypt from 'bcryptjs';

// ─── POST /api/auth/signup ─────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { username, email, password } = body;

    // ── Validate required fields ──────────────────────────────────────────────
    if (!username || !username.trim() || !email || !password) {
      return NextResponse.json(
        { success: false, message: 'กรุณากรอกข้อมูลให้ครบถ้วน (ชื่อผู้ใช้งาน, อีเมล, รหัสผ่าน)' },
        { status: 400 }
      );
    }

    if (username.trim().length < 3) {
      return NextResponse.json(
        { success: false, message: 'ชื่อผู้ใช้งานต้องมีความยาวอย่างน้อย 3 ตัวอักษร' },
        { status: 400 }
      );
    }

    // ── Validate email format ─────────────────────────────────────────────────
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const cleanEmail = email.toLowerCase().trim();
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json(
        { success: false, message: 'รูปแบบอีเมลไม่ถูกต้อง' },
        { status: 400 }
      );
    }

    // ── Validate password strength ────────────────────────────────────────────
    if (password.length < 6) {
      return NextResponse.json(
        { success: false, message: 'รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร' },
        { status: 400 }
      );
    }

    // ── Role: self-signup is always guest (tenants come from contracts, staff from the owner) ──
    const chosenRole = 'guest';

    const sql = getDb();
    const usernameClean = username.trim();
    const usernameNorm = usernameClean.toLowerCase();

    // ── Check duplicate email ─────────────────────────────────────────────────
    const existingEmail = await sql`
      SELECT id FROM users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
    `;
    if (existingEmail.length > 0) {
      return NextResponse.json(
        { success: false, message: 'อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น' },
        { status: 409 }
      );
    }

    // ── Check duplicate username ──────────────────────────────────────────────
    const existingUsername = await sql`
      SELECT id FROM users WHERE LOWER(name) = ${usernameNorm} LIMIT 1
    `;
    if (existingUsername.length > 0) {
      return NextResponse.json(
        { success: false, message: 'ชื่อผู้ใช้งานนี้ถูกใช้งานแล้วในระบบ กรุณาใช้ชื่อผู้ใช้งานอื่น' },
        { status: 409 }
      );
    }

    // ── Check if email has been verified via OTP (Bypassed) ───────────────────
    // Email verification check bypassed temporarily
    /* verification check bypassed */

    // ── Hash password with BCrypt ─────────────────────────────────────────────
    const hashedPassword = await bcrypt.hash(password, 10);

    // ── Insert user with role, primary_role, sub_role, is_active ──────────────
    const result = await sql`
      INSERT INTO users (name, email, password, role, primary_role, sub_role, is_active)
      VALUES (
        ${usernameClean},
        ${cleanEmail},
        ${hashedPassword},
        ${chosenRole},
        ${chosenRole},
        ${null},
        1
      )
    `;
    
    const insertId = (result as any).insertId || (result as any)[0]?.id;

    return NextResponse.json(
      {
        success: true,
        message: 'สมัครสมาชิกสำเร็จ! ยินดีต้อนรับสู่ SmartDom',
        data: {
          id: insertId,
          username: usernameClean,
          name: usernameClean,
          email: cleanEmail,
          role: chosenRole,
          sub_role: null,
        },
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error('[POST /api/auth/signup] Error:', error);

    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { success: false, message: 'อีเมลหรือชื่อผู้ใช้งานนี้ถูกใช้งานแล้วในระบบ' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง: ' + error.message },
      { status: 500 }
    );
  }
}

// ─── GET /api/auth/signup?email=xxx&username=yyy — check availability ─────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get('email');
    const username = searchParams.get('username') || searchParams.get('name');

    if (!email && !username) {
      return NextResponse.json(
        { success: false, message: 'กรุณาระบุอีเมลหรือชื่อผู้ใช้งานเพื่อตรวจสอบ' },
        { status: 400 }
      );
    }

    const sql = getDb();
    let emailAvailable = true;
    let usernameAvailable = true;

    if (email) {
      const existingEmail = await sql`
        SELECT id FROM users WHERE LOWER(email) = ${email.toLowerCase().trim()} LIMIT 1
      `;
      emailAvailable = existingEmail.length === 0;
    }

    if (username && username.trim()) {
      const existingUser = await sql`
        SELECT id FROM users WHERE LOWER(name) = ${username.toLowerCase().trim()} LIMIT 1
      `;
      usernameAvailable = existingUser.length === 0;
    }

    const available = emailAvailable && usernameAvailable;

    return NextResponse.json({
      success: true,
      available,
      emailAvailable,
      usernameAvailable,
      message: (!emailAvailable && !usernameAvailable) ? 'อีเมลและชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว' :
               !emailAvailable ? 'อีเมลนี้ถูกใช้งานแล้ว' :
               !usernameAvailable ? 'ชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว' : 'ข้อมูลนี้พร้อมใช้งาน',
    });
  } catch (error: any) {
    console.error('[GET /api/auth/signup] Error:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบ', error: error.message },
      { status: 500 }
    );
  }
}
