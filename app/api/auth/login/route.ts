import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { findLoginAccount } from '@/lib/login-lookup';
import {
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  resetLoginRateLimit,
} from '@/lib/rate-limiter';

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'กรุณากรอกอีเมล/ชื่อผู้ใช้ และรหัสผ่าน' }, { status: 400 });
    }

    const inputNorm = email.toLowerCase().trim();
    const clientIp = getClientIp(request);
    const rateKey = `${clientIp}:${inputNorm}`;

    // 1. Check Rate Limit (Anti-Brute Force)
    const limitCheck = checkLoginRateLimit(rateKey);
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          success: false,
          message: `คุณพยายามเข้าสู่ระบบผิดพลาดบ่อยเกินไป กรุณารอ ${limitCheck.retryAfterSeconds} วินาที ก่อนลองใหม่อีกครั้ง`,
        },
        { status: 429 }
      );
    }

    const sql = getDb();

    const lookup = await findLoginAccount(sql, inputNorm);
    if ('ambiguous' in lookup) {
      return NextResponse.json({ success: false, message: 'ชื่อนี้ซ้ำกับหลายบัญชี กรุณาเข้าสู่ระบบด้วยอีเมล' }, { status: 409 });
    }

    if ('found' in lookup) {
      const { table, row: user } = lookup.found;
      const isMatch = (await verifyPassword(password, user.password)).ok;
      if (isMatch && !user.is_active) {
        return NextResponse.json({ success: false, message: 'บัญชีนี้ถูกปิดใช้งาน' }, { status: 403 });
      }

      if (isMatch && table === 'platform_admins') {
        resetLoginRateLimit(rateKey);
        return NextResponse.json({
          success: true,
          message: 'เข้าสู่ระบบสำเร็จ (Platform Admin)',
          redirectUrl: '/explore',
          user: { id: user.id, name: user.name, email: user.email, role: 'platform_admin', dormDbName: null },
        });
      }

      if (isMatch) {
        // Reset counter upon successful login
        resetLoginRateLimit(rateKey);

        const effectiveRole = user.role || 'guest';
        let redirectUrl = '/explore';

        if (effectiveRole === 'owner' || effectiveRole === 'manager') redirectUrl = '/owner';
        else if (effectiveRole === 'tenant') redirectUrl = '/tenant';
        else if (effectiveRole === 'keeper') {
          if (user.sub_role === 'maid') redirectUrl = '/keeper/maid';
          else if (user.sub_role === 'technician') redirectUrl = '/keeper/technician';
          else redirectUrl = '/keeper';
        } else if (effectiveRole === 'researcher' || user.sub_role === 'researcher2') {
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
        // Password mismatch: record failure attempt
        const fail = recordLoginFailure(rateKey);
        if (fail.blocked) {
          return NextResponse.json(
            {
              success: false,
              message: 'รหัสผ่านไม่ถูกต้องเกิน 5 ครั้ง ระบบระงับการลองชั่วคราว กรุณารอ 5 นาที',
            },
            { status: 429 }
          );
        }
        return NextResponse.json(
          {
            success: false,
            message: `รหัสผ่านไม่ถูกต้อง (เหลือโอกาสลองอีก ${fail.remainingAttempts} ครั้ง)`,
          },
          { status: 401 }
        );
      }
    }

    // User not found
    recordLoginFailure(rateKey);
    return NextResponse.json({ success: false, message: 'ไม่พบชื่อผู้ใช้งานหรืออีเมลนี้ในระบบ' }, { status: 404 });
  } catch (error: any) {
    console.error('[API Login Error]', error);
    return NextResponse.json({ success: false, message: 'เกิดข้อผิดพลาดภายในเซิร์ฟเวอร์: ' + error.message }, { status: 500 });
  }
}
