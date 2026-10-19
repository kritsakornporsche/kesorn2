import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';

/**
 * Thai ID card OCR (components/IdCardOcr: walk-in and the move-in bill step).
 * SEC-08 / SEC-10: owner or manager only. PDPA (commit 16): reads the name and address only — the ID number is never
 * returned (lib/id-card-ocr drops it) and neither the photo nor the result is stored or logged.
 * If it cannot read the card, the form is filled in by hand (no made-up data).
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized: กรุณาเข้าสู่ระบบก่อนใช้งาน' },
        { status: 401 }
      );
    }

    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { image, apiKey } = body;

    if (!image) {
      return NextResponse.json(
        { success: false, message: 'กรุณาอัปโหลดรูปถ่ายบัตรประชาชน' },
        { status: 400 }
      );
    }

    const { performIdCardOcr } = await import('@/lib/id-card-ocr');
    const result = await performIdCardOcr({
      imageBase64: image,
      apiKey: apiKey || undefined,
    });

    if (!result.success || !result.data) {
      // SEC-10: If unable to read or no key, DO NOT inject dummy data (นายสมชาย ใจดี). Return helpful error.
      return NextResponse.json({
        success: false,
        message: 'ไม่สามารถอ่านข้อมูลบัตรได้ กรุณากรอกด้วยตนเอง'
      }, { status: 422 });
    }

    return NextResponse.json({
      success: true,
      data: result.data,
      message: 'อ่านข้อมูลบัตรประชาชนสำเร็จเรียบร้อยแล้ว'
    });

  } catch (error: any) {
    console.error('OCR ID API Error:', error);
    return NextResponse.json(
      { success: false, message: 'เกิดข้อผิดพลาดในการประมวลผล OCR บัตรประชาชน' },
      { status: 500 }
    );
  }
}
