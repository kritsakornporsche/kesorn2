import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getSettings, updateSettings } from '@/lib/settings';
import { serverErrorMessage } from '@/lib/db-errors';

// GET /api/owner/settings — owner and manager (managers read only, without the OCR key).
// No settings row yet → data: null (the page shows "ยังไม่ตั้งค่า"), never made-up values.
export async function GET() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    return NextResponse.json({ success: true, data: await getSettings(guard.user.role), canEdit: guard.user.role === 'owner' });
  } catch (err: any) {
    console.error('[GET /api/owner/settings]', err);
    return NextResponse.json({ success: false, message: serverErrorMessage(err, 'โหลดการตั้งค่าไม่สำเร็จ') }, { status: 500 });
  }
}

// POST /api/owner/settings — owner only. Writes only the fields in the body (lib/settings.ts checks every value).
export async function POST(req: Request) {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }
    const r = await updateSettings(body, guard.user.id, new Date());
    if (!r.ok) return NextResponse.json({ success: false, message: r.errors.join(' · '), errors: r.errors }, { status: 400 });
    const drafts = r.draftsRepriced > 0 ? ` · คิดร่างบิลใหม่ ${r.draftsRepriced} ใบ` : '';
    return NextResponse.json({ success: true, message: `บันทึกข้อมูลสำเร็จ${drafts}`, ...r });
  } catch (err: any) {
    console.error('[POST /api/owner/settings]', err);
    return NextResponse.json({ success: false, message: serverErrorMessage(err, 'บันทึกการตั้งค่าไม่สำเร็จ') }, { status: 500 });
  }
}
