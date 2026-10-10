import { NextRequest, NextResponse } from 'next/server';
import qrcode from 'qrcode';
import {
  createThaIdOAuthSession,
  THAID_SANDBOX_PROFILES,
  verifyAndCreateThaIdClaims,
} from '@/lib/features/thaid-digital-id';

export async function GET(req: NextRequest) {
  try {
    const origin = req.nextUrl.origin || 'http://localhost:3000';
    const session = createThaIdOAuthSession(origin);

    const qrDataUrl = await qrcode.toDataURL(session.qr_payload, {
      type: 'image/png',
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 280,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return NextResponse.json({
      success: true,
      session,
      qrDataUrl,
      profiles: THAID_SANDBOX_PROFILES,
    });
  } catch (error: any) {
    console.error('[ThaID OAuth GET Error]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถสร้างเซสชัน ThaID Digital ID ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, state, profileId, customName, customAddress } = body;

    const verifiedClaims = verifyAndCreateThaIdClaims({
      sessionId,
      state,
      profileId,
      customName,
      customAddress,
    });

    return NextResponse.json({
      success: true,
      data: verifiedClaims,
      message: `ยืนยันตัวตนผ่านระบบ ThaID (D.DOPA IAL 2.3) สำเร็จ: ${verifiedClaims.full_name_th}`,
    });
  } catch (error: any) {
    console.error('[ThaID OAuth POST Error]', error);
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดในการตรวจสอบข้อมูล ThaID' },
      { status: 500 }
    );
  }
}
