import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { changeOccupants, occupantInfo, occupantRefusalStatus } from '@/lib/occupant-changes';

// Occupants of a contract during the lease (commit 27, lib/occupant-changes). Owner / manager only — tenants get 403.

// GET — current number, the change history and whether draft bills would keep the old number
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const info = await occupantInfo(Number(id));
    if (!info) return NextResponse.json({ success: false, message: 'ไม่พบสัญญา' }, { status: 404 });
    return NextResponse.json({ success: true, data: info });
  } catch (error: any) {
    console.error('[occupants GET]', error?.message || error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลจำนวนผู้พักไม่สำเร็จ' }, { status: 500 });
  }
}

// PATCH { occupants: 1–MAX_OCCUPANTS, reason? } — change it; bills already issued keep their amounts
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const result = await changeOccupants(Number(id), { occupants: body?.occupants, reason: body?.reason }, guard.user, new Date());
    if (!result.ok) return NextResponse.json({ success: false, reason: result.reason, message: result.message }, { status: occupantRefusalStatus(result.reason) });
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[occupants PATCH]', error?.message || error);
    return NextResponse.json({ success: false, message: 'บันทึกจำนวนผู้พักไม่สำเร็จ' }, { status: 500 });
  }
}
