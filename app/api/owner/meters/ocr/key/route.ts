import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();
    const dormId = (session.user as any)?.dormId || 1;
    const profile = await sql`
      SELECT ocr_api_key, ocr_provider 
      FROM dormitory_profile 
      WHERE dorm_id = ${dormId} OR id = ${dormId}
      LIMIT 1
    `;

    const customKey = profile[0]?.ocr_api_key || '';
    const provider = profile[0]?.ocr_provider || 'gemini';

    return NextResponse.json({
      success: true,
      apiKey: customKey,
      provider,
      hasCustomKey: Boolean(customKey),
      systemFallbackAvailable: Boolean(process.env.GEMINI_API_KEY),
    });
  } catch (err: any) {
    console.error('[API OCR Key GET Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const apiKey = (body.apiKey !== undefined ? String(body.apiKey).trim() : null);
    const provider = body.provider || 'gemini';

    const sql = getDb();
    const dormId = (session.user as any)?.dormId || 1;

    // Check if profile exists
    const existing = await sql`
      SELECT id FROM dormitory_profile 
      WHERE dorm_id = ${dormId} OR id = ${dormId} 
      LIMIT 1
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE dormitory_profile 
        SET ocr_api_key = ${apiKey || null}, 
            ocr_provider = ${provider}
        WHERE id = ${existing[0].id}
      `;
    } else {
      await sql`
        INSERT INTO dormitory_profile (dorm_id, name, ocr_api_key, ocr_provider)
        VALUES (${dormId}, 'หอพักเกษร 2', ${apiKey || null}, ${provider})
      `;
    }

    return NextResponse.json({
      success: true,
      message: apiKey ? 'บันทึก Google Gemini API Key ส่วนตัวเรียบร้อยแล้ว' : 'รีเซ็ตกลับไปใช้การตั้งค่าระบบส่วนกลางเรียบร้อยแล้ว',
      hasCustomKey: Boolean(apiKey),
    });
  } catch (err: any) {
    console.error('[API OCR Key POST Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
