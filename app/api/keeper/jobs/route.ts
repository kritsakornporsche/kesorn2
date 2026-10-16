import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { claimJob, finishJob, listJobs, refusalStatus, startJob } from '@/lib/maintenance';
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/maintenance-files';
import { notifyUser, ownerUserId } from '@/lib/move-out-notify';

const BODY_MAX_CHARS = Math.ceil(PHOTOS_TOTAL_MAX_BYTES / 3) * 4 + 1024 * 1024;

// GET — the keeper's jobs and the unassigned ones of their kind (repairs for technicians, cleaning for maids).
export async function GET() {
  const guard = await requireRole(['keeper']);
  if ('response' in guard) return guard.response;
  try {
    return NextResponse.json({ success: true, data: await listJobs(guard.user), subRole: guard.user.sub_role });
  } catch (error: any) {
    console.error('[GET /api/keeper/jobs]', error);
    return NextResponse.json({ success: false, message: 'โหลดงานไม่สำเร็จ' }, { status: 500 });
  }
}

// POST { action: 'claim' | 'start' | 'finish', id, note?, photos?, chargeProposed?, chargeNote? }
// claim: a keeper of this dorm takes a Requested job of their kind (started at once); start / finish: the assigned keeper.
export async function POST(req: Request) {
  const guard = await requireRole(['keeper']);
  if ('response' in guard) return guard.response;
  try {
    const raw = await req.text();
    if (raw.length > BODY_MAX_CHARS) return NextResponse.json({ success: false, message: 'รูปรวมกันต้องไม่เกิน 20MB ต่อการส่งหนึ่งครั้ง' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }
    const now = new Date();
    const id = Number(body.id);
    if (body.action === 'claim') {
      const r = await claimJob(id, guard.user, now);
      if (!r.ok) return NextResponse.json({ success: false, message: r.message }, { status: refusalStatus(r.reason) });
      await notifyUser(r.tenantUserId, 'พนักงานรับงานแล้ว', `งาน #${id} ห้อง ${r.roomNumber || '-'} · ${r.keeperName} กำลังดำเนินการ`, '/tenant/maintenance', now, 'maintenance');
      return NextResponse.json({ success: true, message: 'รับงานแล้ว — กำลังดำเนินการ' });
    }
    if (body.action === 'start') {
      const r = await startJob(id, guard.user, now);
      if (!r.ok) return NextResponse.json({ success: false, message: r.message }, { status: refusalStatus(r.reason) });
      await notifyUser(r.tenantUserId, 'พนักงานเริ่มงานแล้ว', `งาน #${id} ห้อง ${r.roomNumber || '-'}`, '/tenant/maintenance', now, 'maintenance');
      return NextResponse.json({ success: true, message: 'เริ่มงานแล้ว' });
    }
    if (body.action === 'finish') {
      const r = await finishJob(id, guard.user, body, now);
      if (!r.ok) return NextResponse.json({ success: false, message: r.message }, { status: refusalStatus(r.reason) });
      await notifyUser(r.tenantUserId, 'งานเสร็จแล้ว', `งาน #${id} ห้อง ${r.roomNumber || '-'}`, '/tenant/maintenance', now, 'maintenance');
      await notifyUser(await ownerUserId(), r.closed ? 'พนักงานปิดงานแล้ว' : 'งานรอตรวจสอบค่าใช้จ่าย',
        `งาน #${id} ห้อง ${r.roomNumber || '-'}${r.chargeProposed > 0 ? ` · เสนอค่าใช้จ่าย ฿${r.chargeProposed}` : ''}`, '/owner/maintenance', now, 'maintenance');
      return NextResponse.json({ success: true, message: r.closed ? 'ปิดงานแล้ว (เสร็จสิ้น)' : 'ทำเสร็จแล้ว รอเจ้าของหอตรวจสอบค่าใช้จ่าย' });
    }
    return NextResponse.json({ success: false, message: 'ไม่รู้จักคำสั่งนี้' }, { status: 400 });
  } catch (error: any) {
    console.error('[POST /api/keeper/jobs]', error);
    return NextResponse.json({ success: false, message: 'ทำรายการไม่สำเร็จ' }, { status: 500 });
  }
}
