import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

/**
 * GET /api/researcher/id-scan-test
 * Check whether a Gemini API Key is configured in DB or ENV
 */
export async function GET() {
  try {
    let savedKey = process.env.GEMINI_API_KEY || '';
    let source = savedKey ? 'env' : 'none';

    if (!savedKey) {
      try {
        const sql = getDb();
        const profile = await sql`SELECT ocr_api_key FROM dormitory_profile LIMIT 1`;
        if (profile.length > 0 && profile[0].ocr_api_key) {
          savedKey = String(profile[0].ocr_api_key).trim();
          source = 'db';
        }
      } catch (e) {
        // ignore
      }
    }

    return NextResponse.json({
      success: true,
      hasKey: Boolean(savedKey),
      source,
      maskedKey: savedKey ? `${savedKey.slice(0, 6)}...${savedKey.slice(-4)}` : '',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/researcher/id-scan-test
 * 100% Cloud-based Google Gemini Vision AI OCR (No Local Tesseract)
 */
export async function POST(req: Request) {
  const startTime = Date.now();
  try {
    const contentType = req.headers.get('content-type') || '';
    let imageBase64 = '';
    let apiKeyInput = '';
    let saveKey = false;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      apiKeyInput = (formData.get('apiKey') as string) || '';
      saveKey = formData.get('saveKey') === 'true';

      if (file) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mime = file.type || 'image/jpeg';
        imageBase64 = `data:${mime};base64,${base64}`;
      } else {
        imageBase64 = (formData.get('image') as string) || '';
      }
    } else {
      const body = await req.json();
      imageBase64 = body.image || body.imageBase64 || '';
      apiKeyInput = body.apiKey || '';
      saveKey = Boolean(body.saveKey);
    }

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, message: 'กรุณาอัปโหลดหรือถ่ายรูปภาพบัตรประชาชน' },
        { status: 400 }
      );
    }

    const { performIdCardOcr } = await import('@/lib/id-card-ocr');
    const result = await performIdCardOcr({
      imageBase64,
      apiKey: apiKeyInput || undefined,
      saveKey,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          requireApiKey: result.requireApiKey,
          message: result.message,
          elapsed_ms: result.elapsed_ms,
        },
        { status: result.requireApiKey ? 400 : 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      elapsed_ms: result.elapsed_ms,
      message: result.message,
    });
  } catch (error: any) {
    console.error('[Researcher ID OCR API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการประมวลผลบัตรประชาชนด้วย Gemini AI',
        elapsed_ms: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
