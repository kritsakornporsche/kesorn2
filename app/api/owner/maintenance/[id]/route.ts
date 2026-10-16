import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { formatBaht } from '@/lib/format';
import { KIND_TEXT, assignJob, closeLegacy, decideCharge, refusalStatus, rejectJob } from '@/lib/maintenance';
import { notifyUser } from '@/lib/move-out-notify';

// POST { action, ... }
//   assign       (owner/manager) { keeperUserId }
//   reject       (owner/manager) { reason }
//   charge       (owner) { amount, reason: 'tenant_damage' | 'wear_and_tear' | 'service', note? }
//   close_legacy (owner) { note, table?: 'cleaning_jobs' } — older jobs, by hand
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const jobId = Number(id);
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const fail = (r: { reason: any; message: string }) => NextResponse.json({ success: false, message: r.message }, { status: refusalStatus(r.reason) });

    switch (body.action) {
      case 'assign': {
        const r = await assignJob(jobId, Number(body.keeperUserId), guard.user, now);
        if (!r.ok) return fail(r);
        await notifyUser(r.keeperUserId, 'มีงานมอบหมายใหม่', `ห้อง ${r.roomNumber || '-'} · งาน #${jobId}`, '/keeper', now, 'maintenance');
        await notifyUser(r.tenantUserId, 'มอบงานให้พนักงานแล้ว', `งาน #${jobId} มอบให้ ${r.keeperName} แล้ว`, '/tenant/maintenance', now, 'maintenance');
        return NextResponse.json({ success: true, message: `มอบงานให้ ${r.keeperName} แล้ว` });
      }
      case 'reject': {
        const r = await rejectJob(jobId, body.reason, guard.user, now);
        if (!r.ok) return fail(r);
        await notifyUser(r.tenantUserId, 'คำขอไม่ได้รับการดำเนินการ', `งาน #${jobId}: ${String(body.reason || '').slice(0, 100)}`, '/tenant/maintenance', now, 'maintenance');
        return NextResponse.json({ success: true, message: 'ปฏิเสธงานแล้ว' });
      }
      case 'charge': {
        const r = await decideCharge(jobId, body, guard.user, now);
        if (!r.ok) return fail(r);
        if (r.billed && !r.toSettlement) {
          await notifyUser(r.tenantUserId, 'มีบิลค่าใช้จ่ายงานซ่อม/บริการ', `งาน #${jobId} ฿${formatBaht(r.amount)}`, '/tenant/billing', now, 'maintenance');
        }
        return NextResponse.json({
          success: true,
          message: !r.billed ? 'บันทึกแล้ว — ไม่เก็บเงิน' : r.toSettlement ? 'เพิ่มเป็นค่าเสียหายของการย้ายออกแล้ว (หักจากเงินประกัน)' : 'ออกบิลให้ผู้เช่าแล้ว',
          data: r,
        });
      }
      case 'close_legacy': {
        const r = await closeLegacy(jobId, body, guard.user, now);
        if (!r.ok) return fail(r);
        return NextResponse.json({ success: true, message: 'ปิดงานแบบเดิมแล้ว' });
      }
      default:
        return NextResponse.json({ success: false, message: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[POST /api/owner/maintenance/[id]]', error);
    return NextResponse.json({ success: false, message: 'ทำรายการไม่สำเร็จ' }, { status: 500 });
  }
}

export async function PUT() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  return NextResponse.json({ success: false, message: `ขั้นตอน${KIND_TEXT.repair}เปลี่ยนแล้ว — ใช้บอร์ดงานใหม่` }, { status: 410 });
}
