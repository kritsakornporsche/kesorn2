import { NextResponse } from 'next/server';
import { performIdCardOcr } from '@/lib/id-card-ocr';

/**
 * POST /api/booking/ocr-id
 * Real-world production OCR for guests booking rooms & creating contracts.
 * Uses the exact multi-model Google Gemini Vision AI from researcher's test.
 */
export async function POST(req: Request) {
  try {
    const contentType = req.headers.get('content-type') || '';
    let imageBase64 = '';
    let apiKey = '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      apiKey = (formData.get('apiKey') as string) || '';

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
      apiKey = body.apiKey || '';
    }

    if (!imageBase64) {
      return NextResponse.json(
        { success: false, message: 'กรุณาอัปโหลดหรือถ่ายรูปภาพบัตรประชาชน' },
        { status: 400 }
      );
    }

    const result = await performIdCardOcr({
      imageBase64,
      apiKey: apiKey || undefined,
    });

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          requireApiKey: result.requireApiKey,
          message: result.message,
        },
        { status: result.requireApiKey ? 400 : 422 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: result.message,
      elapsed_ms: result.elapsed_ms,
    });
  } catch (error: any) {
    console.error('[Booking OCR API Error]:', error);
    return NextResponse.json(
      {
        success: false,
        message: error.message || 'เกิดข้อผิดพลาดในการประมวลผลบัตรประชาชนด้วย AI',
      },
      { status: 500 }
    );
  }
}
