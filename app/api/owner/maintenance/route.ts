import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { keepersFor, legacyCleaningJobs, listJobs, refusalStatus, staffCreate } from '@/lib/maintenance';
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/maintenance-files';

const BODY_MAX_CHARS = Math.ceil(PHOTOS_TOTAL_MAX_BYTES / 3) * 4 + 1024 * 1024;

// GET — the board: every job (older ones marked legacy), keepers to assign per kind, older cleaning_jobs rows, rooms.
export async function GET() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    return NextResponse.json({
      success: true,
      data: await listJobs(guard.user),
      keepers: { repair: await keepersFor('repair'), cleaning: await keepersFor('cleaning') },
      legacyCleaning: await legacyCleaningJobs(),
      rooms: await getDb()`SELECT id, room_number FROM rooms ORDER BY CAST(room_number AS UNSIGNED), room_number`,
    });
  } catch (error: any) {
    console.error('[GET /api/owner/maintenance]', error);
    return NextResponse.json({ success: false, message: 'โหลดบอร์ดงานไม่สำเร็จ' }, { status: 500 });
  }
}

// POST { kind, description, issueType?, roomId? | settlementId?, photos? } — owner/manager opens a job.
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const raw = await req.text();
    if (raw.length > BODY_MAX_CHARS) return NextResponse.json({ success: false, message: 'รูปรวมกันต้องไม่เกิน 20MB ต่อการส่งหนึ่งครั้ง' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }
    const result = await staffCreate(guard.user, body, new Date());
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    return NextResponse.json({ success: true, message: 'สร้างงานแล้ว', data: { id: result.id } });
  } catch (error: any) {
    console.error('[POST /api/owner/maintenance]', error);
    return NextResponse.json({ success: false, message: 'สร้างงานไม่สำเร็จ' }, { status: 500 });
  }
}

// The earlier free-form status update is replaced by /api/owner/maintenance/[id] actions
export async function PUT() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  return NextResponse.json({ success: false, message: 'ขั้นตอนงานซ่อมเปลี่ยนแล้ว — ใช้บอร์ดงานใหม่' }, { status: 410 });
}
