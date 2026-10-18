import { NextRequest, NextResponse } from 'next/server';
import qrcode from 'qrcode';
import { getDb } from '@/lib/db';
import {
  createDynamicPaymentSession,
  dynamicQrSessions,
  dynamicQrHistory,
  approveDynamicPaymentSession,
  checkGmailImapForAmount,
  readLineChatWindowOcr,
  parseThaiBankEmailContent,
  buildSimulatedKrungthaiEmail,
  type DynamicPaymentSession,
} from '@/lib/features/dynamic-bill-qr';

async function syncApprovedBillToDatabase(session: DynamicPaymentSession) {
  if (!session.billId) return;
  try {
    const sql = getDb();
    const transRef = session.matchedEmail?.transRef || session.receiptNo || `KTB-${Date.now()}`;
    const rawMeta = JSON.stringify({
      verifiedBy: session.verifiedBy,
      sessionId: session.sessionId,
      receiptNo: session.receiptNo,
      receiptHash: session.receiptHash,
      expectedAmount: session.expectedAmount,
      matchedEmail: session.matchedEmail,
    });

    await sql`
      UPDATE bills
      SET status = 'Paid',
          slip_verified = 1,
          slip_verified_at = NOW(),
          slipok_trans_ref = ${transRef},
          slip_data = ${rawMeta}
      WHERE id = ${session.billId}
    `;

    const existingTx = await sql`
      SELECT id FROM accounting_transactions
      WHERE reference_id = ${session.billId} AND reference_type = 'bill'
      LIMIT 1
    `;
    if (existingTx.length === 0) {
      await sql`
        INSERT INTO accounting_transactions (
          dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date
        ) VALUES (
          1,
          'Income',
          'Rent',
          ${session.expectedAmount},
          ${`ชำระบิลห้อง ${session.roomNumber} (${session.billTitle}) [พร้อมเพย์กรุงไทย 063-604-0550 • Ref: ${transRef}]`},
          ${session.billId},
          'bill',
          ${new Date().toISOString().slice(0, 10)}
        )
      `;
    }
  } catch (err) {
    console.warn('[Dynamic QR DB Sync Warning]:', err);
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // 1. Check Session Status & Real-time Gmail IMAP Poll
    if (action === 'status') {
      const sessionId = searchParams.get('sessionId') || '';
      const checkImap = searchParams.get('checkImap') === 'true';
      const fallbackAmount = parseFloat(searchParams.get('amount') || '1.00');
      const fallbackRoom = searchParams.get('roomNumber') || '104';

      let session = dynamicQrSessions.get(sessionId);
      if (!session && sessionId) {
        session = createDynamicPaymentSession({
          sessionId,
          roomNumber: fallbackRoom,
          baseAmount: isNaN(fallbackAmount) || fallbackAmount <= 0 ? 1.0 : fallbackAmount,
          enableSatang: false,
        });
      }

      if (!session) {
        return NextResponse.json(
          { success: false, message: 'ไม่พบเซสชันการชำระเงิน' },
          { status: 404 }
        );
      }

      let imapResult = null;
      if (session.status === 'PENDING' && checkImap) {
        imapResult = await checkGmailImapForAmount({
          expectedAmount: session.expectedAmount,
          sessionCreatedAt: session.createdAt,
          sessionId: session.sessionId,
        });

        if (imapResult.matched && imapResult.parsedEmail) {
          approveDynamicPaymentSession(session, imapResult.parsedEmail, 'LINE_SERVER_LISTENER');
          await syncApprovedBillToDatabase(session);
        }
      }

      return NextResponse.json({
        success: true,
        session,
        imapResult,
        history: dynamicQrHistory,
      });
    }

    // 2. Create New Direct Krungthai PromptPay (063-604-0550) QR Session
    const amountParam = parseFloat(searchParams.get('amount') || '1.00');
    const roomNumber = searchParams.get('roomNumber') || '104';
    const tenantName = searchParams.get('tenantName') || 'นายกฤษกร บัวอินทร์';
    const billTitle = searchParams.get('billTitle') || `ค่าเช่าห้อง ${roomNumber}`;
    const billIdParam = searchParams.get('billId');
    const enableSatang = searchParams.get('enableSatang') !== 'false';

    await readLineChatWindowOcr();

    const session = createDynamicPaymentSession({
      billId: billIdParam ? parseInt(billIdParam, 10) : null,
      roomNumber,
      tenantName,
      billTitle,
      baseAmount: isNaN(amountParam) || amountParam <= 0 ? 1.0 : amountParam,
      enableSatang,
    });

    const qrDataUrl = await qrcode.toDataURL(session.emvcoPayload, {
      type: 'image/png',
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 320,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    });

    return NextResponse.json({
      success: true,
      session,
      qrDataUrl,
      history: dynamicQrHistory,
    });
  } catch (error: any) {
    console.error('[Dynamic QR GET Error]:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'ไม่สามารถสร้าง Dynamic Bill QR ได้' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sessionId, simulatedAmount, text, fallbackAmount, fallbackRoom } = body;

    // Support iOS Shortcuts / LINE Webhook
    if (action === 'ios_webhook' || text) {
      const parsed = parseThaiBankEmailContent(String(text || ''), {
        subject: 'LINE / iOS Notification Webhook',
        from: 'LINE Krungthai Connext',
        date: new Date().toISOString(),
      });

      const targetSession = sessionId
        ? dynamicQrSessions.get(sessionId)
        : Array.from(dynamicQrSessions.values()).find(
            (s) =>
              s.status === 'PENDING' &&
              parsed.amount !== null &&
              Math.abs(s.expectedAmount - parsed.amount) <= 0.005
          );

      if (targetSession && parsed.amount !== null) {
        approveDynamicPaymentSession(targetSession, parsed, 'LINE_SERVER_LISTENER');
        await syncApprovedBillToDatabase(targetSession);
        return NextResponse.json({
          success: true,
          matched: true,
          session: targetSession,
          message: `✅ อนุมัติยอด ฿${parsed.amount.toFixed(2)} จากแจ้งเตือน LINE สำเร็จ!`,
        });
      }

      return NextResponse.json({
        success: false,
        matched: false,
        parsed,
        message: 'รับข้อมูลแจ้งเตือนแล้ว แต่ยังไม่พบเซสชันที่มียอดตรงกัน',
      });
    }

    let session = sessionId ? dynamicQrSessions.get(sessionId) : undefined;
    if (!session && sessionId) {
      session = createDynamicPaymentSession({
        sessionId,
        roomNumber: fallbackRoom || '104',
        baseAmount: Number(fallbackAmount) || 1.0,
        enableSatang: false,
      });
    }

    if (!session) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบเซสชัน QR กรุณากดสร้าง QR ใหม่' },
        { status: 404 }
      );
    }

    // Action 1: Check Server LINE Notification + Gmail
    if (action === 'check_imap') {
      const imapRes = await checkGmailImapForAmount({
        expectedAmount: session.expectedAmount,
        sessionCreatedAt: session.createdAt,
        sessionId: session.sessionId,
      });

      if (imapRes.matched && imapRes.parsedEmail) {
        approveDynamicPaymentSession(session, imapRes.parsedEmail, 'LINE_SERVER_LISTENER');
        await syncApprovedBillToDatabase(session);
      }

      return NextResponse.json({
        success: true,
        matched: imapRes.matched,
        connected: imapRes.connected,
        message: imapRes.message,
        imapResult: imapRes,
        session,
        history: dynamicQrHistory,
      });
    }

    // Action 2: Simulate / Approve Incoming Krungthai Transfer
    if (action === 'simulate_bank_email') {
      const transferAmt =
        simulatedAmount !== undefined && simulatedAmount !== null && simulatedAmount !== ''
          ? Number(simulatedAmount)
          : session.expectedAmount;

      const simMail = buildSimulatedKrungthaiEmail({
        amount: transferAmt,
        roomNumber: session.roomNumber,
        tenantName: session.tenantName,
      });

      const parsed = parseThaiBankEmailContent(simMail.body, {
        subject: simMail.subject,
        from: simMail.from,
        date: new Date().toISOString(),
      });

      const isAmountMatch =
        parsed.amount !== null && Math.abs(parsed.amount - session.expectedAmount) <= 0.005;

      if (!isAmountMatch) {
        return NextResponse.json({
          success: false,
          matched: false,
          session,
          message: `❌ ปฏิเสธการอนุมัติอัตโนมัติ: ยอดเงินเข้า ฿${(parsed.amount ?? 0).toFixed(2)} ไม่ตรงกับยอดใน QR (฿${session.expectedAmount.toFixed(2)})`,
        });
      }

      approveDynamicPaymentSession(session, parsed, 'EMAIL_SIMULATOR');
      await syncApprovedBillToDatabase(session);

      return NextResponse.json({
        success: true,
        matched: true,
        session,
        history: dynamicQrHistory,
        message: `✅ ยืนยันยอดเงินเข้า ฿${session.expectedAmount.toFixed(2)} เข้าพร้อมเพย์ 063-604-0550 สำเร็จ! อนุมัติบิลห้อง ${session.roomNumber} ทันที`,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action' }, { status: 400 });
  } catch (error: any) {
    console.error('[Dynamic QR POST Error]:', error);
    return NextResponse.json(
      { success: false, message: error.message || 'เกิดข้อผิดพลาดในการตรวจสอบยอดเงินโอนเข้า' },
      { status: 500 }
    );
  }
}
