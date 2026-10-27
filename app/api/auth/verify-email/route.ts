import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import crypto from 'crypto';
import { verifyTurnstileToken } from '@/lib/turnstile';

// ── Ensure Table Exists ──────────────────────────────────────────────────────
async function ensureVerificationTable(sql: any) {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) NOT NULL,
        otp_code VARCHAR(10) NOT NULL,
        turnstile_verified TINYINT(1) DEFAULT 0,
        is_verified TINYINT(1) DEFAULT 0,
        expires_at DATETIME NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_email (email),
        INDEX idx_otp (email, otp_code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `;
  } catch (err: any) {
    console.warn('[email_verifications ensureTable warning]:', err?.message);
  }
}

// Cloudflare Turnstile: lib/turnstile.ts (commit 26d — secret from the environment only; test keys / mock token in development only)

// ── Mock or Real Mail Sender ──────────────────────────────────────────────────
async function sendOtpEmail(email: string, otp: string) {
  // If user configured Cloudflare Worker or external mail webhook
  const mailWorkerUrl = process.env.CLOUDFLARE_MAIL_WORKER_URL;
  const mailWorkerApiKey = process.env.CLOUDFLARE_MAIL_API_KEY;

  if (mailWorkerUrl) {
    try {
      await fetch(mailWorkerUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(mailWorkerApiKey ? { 'Authorization': `Bearer ${mailWorkerApiKey}` } : {})
        },
        body: JSON.stringify({
          to: email,
          subject: `รหัสยืนยันอีเมล SmartDom: ${otp}`,
          text: `รหัสยืนยัน OTP สำหรับสมัครสมาชิก SmartDom ของคุณคือ: ${otp} (มีอายุการใช้งาน 10 นาที)`,
          html: `
            <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 24px; border-radius: 16px; background-color: #0f172a; color: #f8fafc;">
              <h2 style="color: #38bdf8; margin-top: 0;">SmartDom ยืนยันอีเมล</h2>
              <p style="color: #94a3b8; font-size: 14px;">รหัสยืนยันสำหรับการสมัครสมาชิกของคุณคือ:</p>
              <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 16px; border-radius: 12px; text-align: center; margin: 24px 0;">
                ${otp}
              </div>
              <p style="color: #94a3b8; font-size: 12px; margin-bottom: 0;">รหัสนี้มีอายุ 10 นาที หากคุณไม่ได้ทำรายการนี้ โปรดละเลยข้อความนี้</p>
            </div>
          `
        })
      });
      return;
    } catch (err) {
      console.warn('[MailWorker send failed, falling back to simulated mail]:', err);
    }
  }

  // Fallback log for local development & demonstration
  console.log(`\n======================================================`);
  console.log(`📧 [SmartDom Cloudflare Mail Service]`);
  console.log(`To: ${email}`);
  console.log(`OTP Code: [ ${otp} ] (Expires in 10 mins)`);
  console.log(`======================================================\n`);
}

// ─── POST /api/auth/verify-email ──────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const sql = getDb();
    await ensureVerificationTable(sql);

    const body = await request.json();
    const { action, email, turnstileToken, otp } = body;

    const cleanEmail = String(email || '').toLowerCase().trim();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return NextResponse.json(
        { success: false, message: 'กรุณาระบุที่อยู่อีเมลที่ถูกต้อง' },
        { status: 400 }
      );
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION: SEND OTP
    // ──────────────────────────────────────────────────────────────────────────
    if (action === 'send_otp') {
      // 1. Verify Turnstile Token
      if (!turnstileToken) {
        return NextResponse.json(
          { success: false, message: 'กรุณายืนยันระบบความปลอดภัย Cloudflare Turnstile' },
          { status: 400 }
        );
      }

      const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
      const turnstileCheck = await verifyTurnstileToken(turnstileToken, clientIp);
      if (!turnstileCheck.success) {
        return NextResponse.json(
          { success: false, message: turnstileCheck.message || 'การตรวจสอบ Turnstile ล้มเหลว' },
          { status: 403 }
        );
      }

      // 2. Check if email is already registered
      const existingUser = await sql`
        SELECT id FROM users WHERE LOWER(email) = ${cleanEmail} LIMIT 1
      `;
      if (existingUser && existingUser.length > 0) {
        return NextResponse.json(
          { success: false, message: 'อีเมลนี้ถูกใช้งานแล้วในระบบ กรุณาใช้อีเมลอื่น' },
          { status: 409 }
        );
      }

      // 3. Rate limiting check: check if an OTP was sent in the last 60 seconds
      const recentOtp = await sql`
        SELECT created_at FROM email_verifications 
        WHERE email = ${cleanEmail} AND created_at >= NOW() - INTERVAL 60 SECOND
        ORDER BY id DESC LIMIT 1
      `;
      if (recentOtp && recentOtp.length > 0) {
        return NextResponse.json(
          { success: false, message: 'กรุณารอ 60 วินาทีก่อนขอรหัสใหม่อีกครั้ง' },
          { status: 429 }
        );
      }

      // 4. Generate 6-digit OTP
      const otpCode = crypto.randomInt(100000, 999999).toString();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Format expires_at for MySQL datetime
      const expiresAtStr = expiresAt.toISOString().slice(0, 19).replace('T', ' ');

      // Invalidate previous unverified OTPs
      await sql`
        DELETE FROM email_verifications 
        WHERE email = ${cleanEmail} AND is_verified = 0
      `;

      // Save new OTP
      await sql`
        INSERT INTO email_verifications (email, otp_code, turnstile_verified, is_verified, expires_at)
        VALUES (${cleanEmail}, ${otpCode}, 1, 0, ${expiresAtStr})
      `;

      // 5. Send Email
      await sendOtpEmail(cleanEmail, otpCode);

      return NextResponse.json({
        success: true,
        message: `รหัส OTP ถูกส่งไปยัง ${cleanEmail} แล้ว (มีอายุ 10 นาที)`,
        // In local development, also supply otp for effortless testing
        devOtp: process.env.NODE_ENV !== 'production' ? otpCode : undefined,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION: VERIFY OTP
    // ──────────────────────────────────────────────────────────────────────────
    if (action === 'verify_otp') {
      const cleanOtp = String(otp || '').trim();
      if (!cleanOtp || cleanOtp.length !== 6) {
        return NextResponse.json(
          { success: false, message: 'กรุณากรอกรหัส OTP 6 หลักให้ครบถ้วน' },
          { status: 400 }
        );
      }

      // Check OTP in DB
      const records = await sql`
        SELECT id, otp_code, expires_at, is_verified 
        FROM email_verifications
        WHERE email = ${cleanEmail} AND is_verified = 0
        ORDER BY id DESC LIMIT 1
      `;

      if (!records || records.length === 0) {
        return NextResponse.json(
          { success: false, message: 'ไม่พบคำขอยืนยันรหัส หรือรหัสนี้ถูกใช้งานแล้ว' },
          { status: 400 }
        );
      }

      const record = records[0];

      // Check expiry
      if (new Date(record.expires_at).getTime() < Date.now()) {
        return NextResponse.json(
          { success: false, message: 'รหัส OTP นี้หมดอายุแล้ว กรุณากดขอรหัสใหม่อีกครั้ง' },
          { status: 400 }
        );
      }

      // Match code
      if (record.otp_code !== cleanOtp) {
        return NextResponse.json(
          { success: false, message: 'รหัส OTP ไม่ถูกต้อง กรุณาตรวจสอบใหม่อีกครั้ง' },
          { status: 400 }
        );
      }

      // Mark verified
      await sql`
        UPDATE email_verifications 
        SET is_verified = 1 
        WHERE id = ${record.id}
      `;

      return NextResponse.json({
        success: true,
        message: 'ยืนยันอีเมลสำเร็จเรียบร้อยแล้ว',
        verified: true,
      });
    }

    // ──────────────────────────────────────────────────────────────────────────
    // ACTION: CHECK STATUS
    // ──────────────────────────────────────────────────────────────────────────
    if (action === 'check_status') {
      const verifiedRecord = await sql`
        SELECT id, is_verified FROM email_verifications 
        WHERE email = ${cleanEmail} AND is_verified = 1 
        ORDER BY id DESC LIMIT 1
      `;

      return NextResponse.json({
        success: true,
        isVerified: verifiedRecord && verifiedRecord.length > 0,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[POST /api/auth/verify-email error]:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมล: ' + (error?.message || '') },
      { status: 500 }
    );
  }
}
