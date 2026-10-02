import { auth } from '@/auth';
import { NextResponse } from 'next/server';
import { verifySlipWithSlipOK } from '@/lib/slipok';

export async function POST(req: Request) {
  try {
    const session = await auth();
    // Allow any authenticated user or researcher/admin, or allow dev/thesis testing
    // Check Content-Type to support both JSON and FormData
    const contentType = req.headers.get('content-type') || '';
    let slipData = '';
    let expectedAmount: number | undefined = undefined;
    let expectedReceiver: { name?: string; promptpay?: string; dormName?: string } | undefined = undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const amountStr = formData.get('expectedAmount') as string | null;
      const receiverName = formData.get('expectedReceiverName') as string | null;
      const receiverPromptPay = formData.get('expectedReceiverPromptPay') as string | null;

      if (amountStr && !isNaN(Number(amountStr))) {
        expectedAmount = Number(amountStr);
      }
      if (receiverName || receiverPromptPay) {
        expectedReceiver = {
          name: receiverName || undefined,
          promptpay: receiverPromptPay || undefined,
          dormName: receiverName || undefined,
        };
      }

      if (file) {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString('base64');
        const mime = file.type || 'image/jpeg';
        slipData = `data:${mime};base64,${base64}`;
      } else {
        const dataField = formData.get('slipData') as string | null;
        if (dataField) slipData = dataField;
      }
    } else {
      const body = await req.json();
      slipData = body.slipData;
      if (body.expectedAmount !== undefined && body.expectedAmount !== null && body.expectedAmount !== '') {
        expectedAmount = Number(body.expectedAmount);
      }
      if (body.expectedReceiver) {
        expectedReceiver = body.expectedReceiver;
      }
    }

    if (!slipData) {
      return NextResponse.json(
        { success: false, message: 'กรุณาอัปโหลดรูปภาพสลิปที่ต้องการทดสอบ' },
        { status: 400 }
      );
    }

    // Call SlipOK verification service with log: false (sandbox testing mode)
    const startTime = Date.now();
    const result = await verifySlipWithSlipOK(slipData, {
      expectedAmount,
      expectedReceiver,
      log: false,
    });
    const durationMs = Date.now() - startTime;

    return NextResponse.json({
      success: result.success,
      data: {
        ...result,
        durationMs,
        testedAt: new Date().toISOString(),
      },
      message: result.message,
    });

  } catch (error: any) {
    console.error('[Researcher SlipOK Test Error]:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดในการประมวลผลสลิป' },
      { status: 500 }
    );
  }
}
