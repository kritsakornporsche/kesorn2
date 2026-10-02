import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || (session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { apiKey } = await req.json();
    const keyToTest = (apiKey || '').trim();

    if (!keyToTest) {
      return NextResponse.json({ success: false, message: 'กรุณาระบุ API Key ที่ต้องการทดสอบ' }, { status: 400 });
    }

    // Ping Google Gemini models endpoint or generateContent with lightweight test
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const testRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent?key=${keyToTest}`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'ping' }] }],
          generationConfig: { maxOutputTokens: 5 }
        }),
      }
    );
    clearTimeout(timeoutId);

    if (testRes.ok) {
      return NextResponse.json({
        success: true,
        message: '✅ เชื่อมต่อ Gemini Vision สำเร็จ! API Key นี้พร้อมใช้งานสำหรับอ่านมิเตอร์น้ำ-ไฟ',
      });
    }

    const errData = await testRes.json().catch(() => ({}));
    const errMsg = errData.error?.message || `HTTP ${testRes.status} ${testRes.statusText}`;
    
    return NextResponse.json({
      success: false,
      message: `❌ การทดสอบล้มเหลว: ${errMsg}`,
    }, { status: 400 });

  } catch (err: any) {
    if (err?.name === 'AbortError') {
      return NextResponse.json({ success: false, message: '❌ การเชื่อมต่อหมดเวลา (Timeout)' }, { status: 408 });
    }
    return NextResponse.json({ success: false, message: `❌ เกิดข้อผิดพลาด: ${err.message}` }, { status: 500 });
  }
}
