import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { formatBaht } from '@/lib/format';
import {
  closeLegacyRequest, confirmLegacyDeposit, getSettlement, recordRefund, recordReturn, refusalStatus, setDamages, settleMoveOut,
} from '@/lib/moveOut';
import { notifyUser } from '@/lib/move-out-notify';

// GET — one move-out settlement (managers see bills, not the deposit / forfeit / refund).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const view = await getSettlement(Number(id), guard.user, new Date());
    if (!view) return NextResponse.json({ success: false, message: 'ไม่พบคำขอย้ายออก' }, { status: 404 });
    return NextResponse.json({ success: true, data: view });
  } catch (error: any) {
    console.error('[GET /api/owner/move-out/[id]]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}

// POST { action, ... } — [id] is the settlement id, except close_legacy where it is the move_out_requests id.
//   return          (owner/manager) { returnDate, finalMeter, prevMeter?, paperNoticeDate? }
//   damages         (owner) { items: [{ amount, reason }] }
//   confirm_deposit (owner) { amount, recordedAs: 'income' | 'outside', note }
//   settle          (owner)
//   refund          (owner) { file: dataUrl }
//   close_legacy    (owner) { note, returnDate? }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const targetId = Number(id);
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const user = guard.user;
    const fail = (r: { reason: any; message: string }) =>
      NextResponse.json({ success: false, message: r.message }, { status: refusalStatus(r.reason) });

    switch (body.action) {
      case 'return': {
        const r = await recordReturn(targetId, body, user, now);
        if (!r.ok) return fail(r);
        await notifyUser(r.tenantUserId, 'บันทึกการคืนห้องแล้ว',
          r.finalBillId ? `บิลสุดท้ายก่อนย้ายออก ฿${formatBaht(r.finalAmount)} — จะหักจากเงินประกันตอนสรุปยอด` : 'บันทึกการคืนห้องแล้ว รอสรุปยอดเงินประกัน',
          '/tenant/move-out', now);
        return NextResponse.json({ success: true, message: 'บันทึกการคืนห้องแล้ว สัญญาสิ้นสุด', data: r });
      }
      case 'damages': {
        const r = await setDamages(targetId, body.items, user, now);
        if (!r.ok) return fail(r);
        return NextResponse.json({ success: true, message: 'บันทึกค่าเสียหายแล้ว', data: r });
      }
      case 'confirm_deposit': {
        const r = await confirmLegacyDeposit(targetId, body, user, now);
        if (!r.ok) return fail(r);
        return NextResponse.json({ success: true, message: 'ยืนยันยอดเงินประกันแล้ว', data: r });
      }
      case 'settle': {
        const r = await settleMoveOut(targetId, user, now);
        if (!r.ok) return fail(r);
        await notifyUser(r.tenantUserId, 'สรุปยอดเงินประกันแล้ว',
          r.refund > 0
            ? `ได้รับเงินประกันคืน ฿${formatBaht(r.refund)} ภายในวันที่ ${new Date(`${r.refundDueDate}T00:00:00+07:00`).toLocaleDateString('th-TH')}`
            : r.tenantStillOwes > 0 ? `ยังมียอดค้างชำระ ฿${formatBaht(r.tenantStillOwes)} หลังหักเงินประกัน` : 'ปิดเรื่องย้ายออกแล้ว',
          '/tenant/move-out', now);
        return NextResponse.json({ success: true, message: r.closed ? 'หักเงินประกันและปิดเรื่องแล้ว' : 'หักเงินประกันแล้ว รอบันทึกการคืนเงิน', data: r });
      }
      case 'refund': {
        const r = await recordRefund(targetId, { file: body.file }, user, now);
        if (!r.ok) return fail(r);
        await notifyUser(r.tenantUserId, 'คืนเงินประกันแล้ว', `เจ้าของหอโอนคืนเงินประกัน ฿${formatBaht(r.refund)} แล้ว`, '/tenant/move-out', now);
        return NextResponse.json({ success: true, message: 'บันทึกการคืนเงินประกันและปิดเรื่องแล้ว', data: r });
      }
      case 'close_legacy': {
        const r = await closeLegacyRequest(targetId, body, user, now);
        if (!r.ok) return fail(r);
        return NextResponse.json({ success: true, message: 'ปิดคำขอแบบเดิมแล้ว (ไม่มีการเคลื่อนไหวเงินในระบบ)', data: r });
      }
      default:
        return NextResponse.json({ success: false, message: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[POST /api/owner/move-out/[id]]', error);
    return NextResponse.json({ success: false, message: 'ทำรายการย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}
