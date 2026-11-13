import { NextRequest, NextResponse } from 'next/server';
import qrcode from 'qrcode';
import { getDb } from '@/lib/db';
import { requireRole, type CurrentUser } from '@/lib/authz';
import { recordPayment, outstandingFor, getPaymentSummaries } from '@/lib/payments';
import { getPaymentInfo, getRates } from '@/lib/billing';
import { saveBase64Image } from '@/lib/file-storage';
import { getAutoPaymentConfig } from '@/lib/features/line-window-manager';
import {
  createDynamicPaymentSession,
  dynamicQrSessions,
  dynamicQrHistory,
  approveDynamicPaymentSession,
  checkGmailImapForAmount,
  readLineChatWindowOcr,
  parseThaiBankEmailContent,
  buildSimulatedKrungthaiEmail,
  messageMatchesSession,
  type DormPromptPay,
  type DynamicPaymentSession,
} from '@/lib/features/dynamic-bill-qr';

// Dynamic Bill QR (commit 29 security):
// - every action needs a signed-in user; a tenant / guest may open a QR only for their own unpaid bill, and the amount
//   is the bill's outstanding amount from the database (never the amount sent by the page)
// - the PromptPay number / name come from the settings table (dormitory_profile), not from the code
// - automatic confirmation (LINE screen / webhook) works only while the owner has "auto-payment" switched on, and a
//   message pays a QR only with the exact full amount (with satang) received after the QR was made
// - "simulate_bank_email" is for owner / manager on a non-production server only

const STAFF = ['owner', 'manager'];
const isStaff = (u: CurrentUser) => STAFF.includes(u.role);
const ROLES = ['owner', 'manager', 'researcher', 'tenant', 'guest'] as const;

async function dormPromptPay(): Promise<DormPromptPay | null> {
  const info = await getPaymentInfo(getDb());
  if (!info.promptpayNumber) return null;
  return { number: info.promptpayNumber, name: info.promptpayName || '', bank: info.bankName || 'พร้อมเพย์' };
}

const noPromptPay = () => NextResponse.json(
  { success: false, message: 'ยังไม่ได้ตั้งค่าเลขพร้อมเพย์ของหอพัก (หน้าตั้งค่า → ช่องทางชำระเงิน)' },
  { status: 409 }
);

/** The session, if this user may see it: staff, or the user who opened it */
function sessionFor(user: CurrentUser, sessionId: string): DynamicPaymentSession | null {
  const s = sessionId ? dynamicQrSessions.get(sessionId) : undefined;
  if (!s) return null;
  if (isStaff(user) || (s.ownerUserId && s.ownerUserId === user.id)) return s;
  return null;
}

const autoPaymentOff = () => !getAutoPaymentConfig().enabled;
const AUTO_OFF_MESSAGE = 'ปิดการยืนยันเงินเข้าอัตโนมัติอยู่ (หน้าตั้งค่า) — ให้ผู้เช่าแนบสลิป หรือเจ้าของหอยืนยันการรับเงินเอง';

/** The bill a user may pay by QR: staff any unpaid bill; tenant / guest only their own */
async function payableBill(user: CurrentUser, billId: number) {
  const sql = getDb();
  const rows = await sql`
    SELECT b.id, b.amount, b.status, b.bill_type, b.due_date, b.late_fee_rate, b.room_number, b.title,
           t.name AS tenant_name, t.user_id AS tenant_user_id, t.email AS tenant_email
    FROM bills b LEFT JOIN tenants t ON t.id = b.tenant_id
    WHERE b.id = ${billId} LIMIT 1
  `;
  const bill = rows[0];
  if (!bill) return { error: 'ไม่พบบิล', status: 404 } as const;
  const mine = Number(bill.tenant_user_id) === user.id
    || (Boolean(bill.tenant_email) && String(bill.tenant_email).toLowerCase() === String(user.email || '').toLowerCase());
  if (!isStaff(user) && !mine) return { error: 'ไม่มีสิทธิ์ชำระบิลนี้', status: 403 } as const;
  const st = String(bill.status || '').toLowerCase();
  if (st === 'paid') return { error: 'บิลนี้ชำระแล้ว', status: 409 } as const;
  if (st === 'cancelled' || st === 'canceled') return { error: 'บิลนี้ถูกยกเลิกแล้ว', status: 409 } as const;
  if (st === 'draft') return { error: 'บิลนี้ยังไม่ได้ส่งให้ผู้เช่า', status: 409 } as const;
  const paid = (await getPaymentSummaries(sql, [billId])).get(billId)?.paid_total || 0;
  const { outstanding } = outstandingFor(bill, paid, new Date(), await getRates(sql));
  if (outstanding <= 0) return { error: 'บิลนี้ไม่มียอดค้างชำระ', status: 409 } as const;
  return { bill, outstanding } as const;
}

async function syncApprovedBillToDatabase(session: DynamicPaymentSession) {
  if (!session.billId) return;
  try {
    const sql = getDb();
    const bills = await sql`SELECT id, amount, status FROM bills WHERE id = ${session.billId} LIMIT 1`;
    const bill = bills[0];
    if (!bill) return;

    const transRef = session.matchedEmail?.transRef || session.receiptNo || `DQR-${Date.now()}`;
    const rawMeta = JSON.stringify({
      verifiedBy: session.verifiedBy,
      sessionId: session.sessionId,
      receiptNo: session.receiptNo,
      receiptHash: session.receiptHash,
      expectedAmount: session.expectedAmount,
      matchedEmail: session.matchedEmail,
    });

    // Save screenshot / receipt slip as image evidence
    const slipDataUrl = session.screenshotDataUrl || session.matchedEmail?.screenshotDataUrl;
    let storedSlipUrl: string | null = null;
    if (slipDataUrl) {
      storedSlipUrl = saveBase64Image(slipDataUrl, 'slips', `dqr_auto_${session.roomNumber}_${session.sessionId}`);
    }

    // 1. Record payment through central ACID transaction runner.
    // commit 29: the amount owed when the QR was made (the satang added to tell QRs apart is not revenue); the late fee
    // is counted as of that time too, so a payment made just after midnight is not short.
    const recordAmount = Math.min(session.expectedAmount, session.baseAmount);

    const paymentResult = await recordPayment(session.billId, {
      amount: recordAmount,
      method: 'transfer',
      paidAt: new Date(session.paidAt || Date.now()),
      lateFeeAsOf: new Date(session.createdAt),
      slipRef: transRef,
      slipUrl: storedSlipUrl || undefined,
      slipData: rawMeta,
      note: `Dynamic QR [${session.verifiedBy || 'LINE_SERVER_LISTENER'}] Total: ฿${session.expectedAmount.toFixed(2)} Ref: ${transRef}`,
      allowPartial: false,
    });
    console.log('[Dynamic QR recordPayment result]:', paymentResult);
    if (!paymentResult.ok) return;

    // 2. Also ensure bills table metadata is recorded
    if (storedSlipUrl) {
      await sql`
        UPDATE bills
        SET slip_url = ${storedSlipUrl},
            slip_verified = 1,
            slip_verified_at = NOW(),
            slipok_trans_ref = ${transRef},
            slip_data = ${rawMeta}
        WHERE id = ${session.billId}
      `;
    } else {
      await sql`
        UPDATE bills
        SET slip_verified = 1,
            slip_verified_at = NOW(),
            slipok_trans_ref = ${transRef},
            slip_data = ${rawMeta}
        WHERE id = ${session.billId}
      `;
    }

    // 3. Advance contract lifecycle if this bill belongs to a booking or first bill
    const bookingContracts = await sql`
      SELECT id FROM contracts WHERE booking_bill_id = ${session.billId} AND status IN ('BookingApproved', 'PendingPayment') LIMIT 1
    `;
    if (bookingContracts.length > 0) {
      if (storedSlipUrl) {
        await sql`
          UPDATE contracts
          SET status = 'PendingOwnerSignature',
              signed_at = NOW(),
              slip_url = ${storedSlipUrl}
          WHERE id = ${bookingContracts[0].id}
        `;
      } else {
        await sql`
          UPDATE contracts
          SET status = 'PendingOwnerSignature',
              signed_at = NOW()
          WHERE id = ${bookingContracts[0].id}
        `;
      }
    }

    // 4. Move-in bill: associate slip if present, then run afterMoveInPayment to activate contract
    const moveInContracts = await sql`
      SELECT id FROM contracts WHERE move_in_bill_id = ${session.billId} LIMIT 1
    `;
    if (moveInContracts.length > 0 && storedSlipUrl) {
      await sql`
        UPDATE contracts
        SET slip_url = COALESCE(slip_url, ${storedSlipUrl})
        WHERE id = ${moveInContracts[0].id}
      `;
    }

    const { afterMoveInPayment } = await import('@/lib/moveIn');
    const activation = await afterMoveInPayment(sql, session.billId);
    console.log('[Dynamic QR afterMoveInPayment result]:', activation);
  } catch (err) {
    console.warn('[Dynamic QR DB Sync Warning]:', err);
  }
}

/** Sessions shown back: staff see the history, others only their own */
const historyFor = (user: CurrentUser) =>
  isStaff(user) ? dynamicQrHistory : dynamicQrHistory.filter((h) => h.ownerUserId === user.id);

/** Check the LINE screen for this session's amount (only while auto-payment is switched on) */
async function checkLineScreen(session: DynamicPaymentSession) {
  if (autoPaymentOff()) return { connected: false, matched: false, message: AUTO_OFF_MESSAGE, autoPaymentEnabled: false };
  const res = await checkGmailImapForAmount({
    expectedAmount: session.expectedAmount,
    sessionCreatedAt: session.createdAt,
    sessionId: session.sessionId,
    baselineCount: session.baselineToastCount,
    promptpayNumber: session.promptpayNumber,
  });
  if (res.matched && res.parsedEmail && session.status === 'PENDING') {
    approveDynamicPaymentSession(session, res.parsedEmail, 'LINE_SERVER_LISTENER');
    await syncApprovedBillToDatabase(session);
  }
  return { ...res, autoPaymentEnabled: true };
}

export async function GET(req: NextRequest) {
  const guard = await requireRole([...ROLES]);
  if ('response' in guard) return guard.response;
  const user = guard.user;
  try {
    const { searchParams } = new URL(req.url);
    const action = searchParams.get('action');

    // 1. Check session status & real-time LINE screen check
    if (action === 'status') {
      const session = sessionFor(user, searchParams.get('sessionId') || '');
      if (!session) {
        return NextResponse.json({ success: false, message: 'ไม่พบเซสชันการชำระเงิน กรุณาสร้าง QR ใหม่' }, { status: 404 });
      }
      let imapResult = null;
      if (session.status === 'PENDING' && searchParams.get('checkImap') === 'true') {
        imapResult = await checkLineScreen(session);
      }
      return NextResponse.json({ success: true, session, imapResult, history: historyFor(user) });
    }

    // 2. Create a new Dynamic PromptPay QR session
    const promptpay = await dormPromptPay();
    if (!promptpay) return noPromptPay();
    const billIdParam = Number(searchParams.get('billId'));
    const enableSatang = searchParams.get('enableSatang') !== 'false';
    let params: { billId: number | null; roomNumber: string; tenantName: string; billTitle: string; baseAmount: number };

    if (Number.isInteger(billIdParam) && billIdParam > 0) {
      // A real bill: amount, room and name from the database
      const found = await payableBill(user, billIdParam);
      if ('error' in found) return NextResponse.json({ success: false, message: found.error }, { status: found.status });
      params = {
        billId: billIdParam,
        roomNumber: String(found.bill.room_number || '-'),
        tenantName: String(found.bill.tenant_name || 'ผู้เช่า'),
        billTitle: String(found.bill.title || `ค่าเช่าห้อง ${found.bill.room_number || ''}`),
        baseAmount: found.outstanding,
      };
    } else {
      // A QR without a bill (researcher lab / demo): staff or researcher only, never linked to a bill
      if (!['owner', 'manager', 'researcher'].includes(user.role)) {
        return NextResponse.json({ success: false, message: 'กรุณาเลือกบิลที่ต้องการชำระ' }, { status: 400 });
      }
      const amountParam = parseFloat(searchParams.get('amount') || '1.00');
      const roomNumber = searchParams.get('roomNumber') || '-';
      params = {
        billId: null,
        roomNumber,
        tenantName: searchParams.get('tenantName') || 'ผู้เช่าทดลอง',
        billTitle: searchParams.get('billTitle') || `QR ทดลอง ห้อง ${roomNumber}`,
        baseAmount: isNaN(amountParam) || amountParam <= 0 ? 1.0 : amountParam,
      };
    }

    // Reads the LINE screen first, so the satang chosen is not one already shown there
    await readLineChatWindowOcr();

    const session = createDynamicPaymentSession({ ...params, ownerUserId: user.id, enableSatang, promptpay });

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
      history: historyFor(user),
      autoPaymentEnabled: !autoPaymentOff(),
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
  const guard = await requireRole([...ROLES]);
  if ('response' in guard) return guard.response;
  const user = guard.user;
  try {
    const body = await req.json();
    const { action, sessionId, simulatedAmount, text } = body;

    // LINE / iOS Shortcuts notification forwarded by the dorm's own device: staff accounts only
    if (action === 'ios_webhook' || text) {
      if (!isStaff(user)) {
        return NextResponse.json({ success: false, message: 'ส่งแจ้งเตือนเงินเข้าได้เฉพาะเจ้าของหอ/ผู้จัดการ' }, { status: 403 });
      }
      if (autoPaymentOff()) {
        return NextResponse.json({ success: false, matched: false, autoPaymentEnabled: false, message: AUTO_OFF_MESSAGE });
      }
      const receivedAt = body.receivedAt || body.date;
      const parsed = parseThaiBankEmailContent(String(text || ''), {
        subject: 'LINE / iOS Notification Webhook',
        from: 'LINE Krungthai Connext',
        date: receivedAt && !Number.isNaN(new Date(receivedAt).getTime()) ? new Date(receivedAt).toISOString() : new Date().toISOString(),
      });

      const now = Date.now();
      const candidates = sessionId
        ? ([dynamicQrSessions.get(sessionId)].filter(Boolean) as DynamicPaymentSession[])
        : Array.from(dynamicQrSessions.values()).filter((s) => s.status === 'PENDING' && new Date(s.expiresAt).getTime() > now);
      const matching = candidates.filter((s) => s.status === 'PENDING' && messageMatchesSession(parsed, s).ok);

      // Two open QRs with the same amount: do not guess which one was paid
      if (matching.length === 1) {
        const target = matching[0];
        approveDynamicPaymentSession(target, parsed, 'LINE_SERVER_LISTENER');
        await syncApprovedBillToDatabase(target);
        return NextResponse.json({
          success: true,
          matched: true,
          session: target,
          message: `✅ อนุมัติยอด ฿${target.expectedAmount.toFixed(2)} จากแจ้งเตือน LINE สำเร็จ!`,
        });
      }

      const why = candidates.length === 1 ? messageMatchesSession(parsed, candidates[0]).reason : '';
      return NextResponse.json({
        success: false,
        matched: false,
        parsed,
        message: matching.length > 1
          ? 'พบ QR ที่รอชำระยอดเดียวกันมากกว่า 1 รายการ — ให้เจ้าของหอยืนยันเอง'
          : `รับข้อมูลแจ้งเตือนแล้ว แต่ยังไม่พบเซสชันที่มียอดตรงกัน${why ? ` (${why})` : ''}`,
      });
    }

    const session = sessionFor(user, String(sessionId || ''));
    if (!session) {
      return NextResponse.json(
        { success: false, message: 'ไม่พบเซสชัน QR กรุณากดสร้าง QR ใหม่' },
        { status: 404 }
      );
    }

    // Action 1: Check the LINE notification screen
    if (action === 'check_imap') {
      const imapRes = await checkLineScreen(session);
      return NextResponse.json({
        success: true,
        matched: imapRes.matched,
        connected: imapRes.connected,
        message: imapRes.message,
        imapResult: imapRes,
        session,
        history: historyFor(user),
      });
    }

    // Action 2: Simulate an incoming transfer — owner / manager on a non-production server only
    if (action === 'simulate_bank_email') {
      if (process.env.NODE_ENV === 'production') {
        return NextResponse.json({ success: false, message: 'ปิดการจำลองเงินเข้าบนเซิร์ฟเวอร์จริง' }, { status: 403 });
      }
      if (!isStaff(user)) {
        return NextResponse.json({ success: false, message: 'จำลองเงินเข้าได้เฉพาะเจ้าของหอ/ผู้จัดการ' }, { status: 403 });
      }
      if (session.status !== 'PENDING') {
        return NextResponse.json({ success: false, matched: false, session, message: 'QR นี้ไม่ได้รอชำระแล้ว' }, { status: 409 });
      }
      const transferAmt =
        simulatedAmount !== undefined && simulatedAmount !== null && simulatedAmount !== ''
          ? Number(simulatedAmount)
          : session.expectedAmount;

      const simMail = buildSimulatedKrungthaiEmail({
        amount: transferAmt,
        roomNumber: session.roomNumber,
        tenantName: session.tenantName,
        promptpayNumber: session.promptpayNumber,
        promptpayName: session.promptpayName,
      });

      const parsed = parseThaiBankEmailContent(simMail.body, {
        subject: simMail.subject,
        from: simMail.from,
        date: new Date().toISOString(),
      });

      const check = messageMatchesSession(parsed, session);
      if (!check.ok) {
        return NextResponse.json({
          success: false,
          matched: false,
          session,
          message: `❌ ปฏิเสธการอนุมัติอัตโนมัติ: ${check.reason}`,
        });
      }

      approveDynamicPaymentSession(session, parsed, 'EMAIL_SIMULATOR');
      await syncApprovedBillToDatabase(session);

      return NextResponse.json({
        success: true,
        matched: true,
        session,
        history: historyFor(user),
        message: `✅ (จำลอง) ยืนยันยอดเงินเข้า ฿${session.expectedAmount.toFixed(2)} เข้าพร้อมเพย์ ${session.promptpayNumber} — อนุมัติบิลห้อง ${session.roomNumber}`,
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
