import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { cancelJob, createRequest, listJobs, refusalStatus } from '@/lib/maintenance';
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/maintenance-files';
import { notifyUser, ownerUserId } from '@/lib/move-out-notify';

const BODY_MAX_CHARS = Math.ceil(PHOTOS_TOTAL_MAX_BYTES / 3) * 4 + 1024 * 1024;

// GET — the tenant's own repair / cleaning jobs (lib/maintenance.ts).
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    if (user.role !== 'tenant' && user.role !== 'guest') return NextResponse.json({ success: true, data: [] });
    return NextResponse.json({ success: true, data: await listJobs(user) });
  } catch (error: any) {
    console.error('[GET /api/tenant/maintenance]', error);
    return NextResponse.json({ success: false, message: 'โหลดรายการแจ้งซ่อมไม่สำเร็จ' }, { status: 500 });
  }
}

// POST { kind: 'repair' | 'cleaning', issueType?, description, photos?: dataUrl[] } — report for the room of the
// tenant's Active contract.
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const raw = await req.text();
    if (raw.length > BODY_MAX_CHARS) return NextResponse.json({ success: false, message: 'รูปรวมกันต้องไม่เกิน 20MB ต่อการส่งหนึ่งครั้ง' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }
    const now = new Date();
    const result = await createRequest(user, body, now);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    await notifyUser(await ownerUserId(), 'มีการแจ้งซ่อม/ทำความสะอาดใหม่', `ห้อง ${result.roomNumber}: ${String(body.description || '').slice(0, 60)}`, '/owner/maintenance', now, 'maintenance');
    return NextResponse.json({ success: true, message: 'ส่งเรื่องแล้ว รอเจ้าของหอมอบงาน', data: { id: result.id } });
  } catch (error: any) {
    console.error('[POST /api/tenant/maintenance]', error);
    return NextResponse.json({ success: false, message: 'ส่งเรื่องไม่สำเร็จ' }, { status: 500 });
  }
}

// DELETE { id } — withdraw a request nobody has been assigned to yet.
export async function DELETE(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const result = await cancelJob(Number(body.id), user, new Date());
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    return NextResponse.json({ success: true, message: 'ยกเลิกคำขอแล้ว' });
  } catch (error: any) {
    console.error('[DELETE /api/tenant/maintenance]', error);
    return NextResponse.json({ success: false, message: 'ยกเลิกไม่สำเร็จ' }, { status: 500 });
  }
}
