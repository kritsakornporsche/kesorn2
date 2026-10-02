import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

/**
 * Thai National ID Card OCR API
 * SEC-10: Restricted to dormitory owners only.
 * Extracts Citizen ID (13 digits), Full Name, Birth Date, and Address.
 * If unable to extract, returns an error message prompting manual entry.
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

    const role = (session.user as any)?.role;
    if (role !== 'owner') {
      return NextResponse.json(
        { success: false, message: 'Forbidden: เฉพาะเจ้าของหอพักเท่านั้นที่สามารถเข้าถึงระบบ OCR บัตรประชาชนได้' },
        { status: 403 }
      );
    }

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
