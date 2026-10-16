import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';

// GET — the dorm the keeper works for. Single dorm (id 1); login required (the email is never taken from the request).
export async function GET() {
  const guard = await requireRole(['keeper', 'owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const sql = getDb();
    const dorms = await sql`SELECT id, dorm_name, address, phone FROM dormitory_registry WHERE id = 1`;
    return NextResponse.json({ success: true, dorms, totalAssigned: dorms.length, activeDorm: dorms[0] || null });
  } catch (error: any) {
    console.error('[Keeper Dorms API Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลหอไม่สำเร็จ' }, { status: 500 });
  }
}
