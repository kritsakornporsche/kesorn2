import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { rateHistory } from '@/lib/settings';
import { serverErrorMessage } from '@/lib/db-errors';

// GET /api/owner/settings/history — latest rate / payment changes (owner and manager)
export async function GET() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    return NextResponse.json({ success: true, data: await rateHistory() });
  } catch (err: any) {
    console.error('[GET /api/owner/settings/history]', err);
    return NextResponse.json({ success: false, message: serverErrorMessage(err, 'โหลดประวัติไม่สำเร็จ') }, { status: 500 });
  }
}
