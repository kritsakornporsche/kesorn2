import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { acknowledgeInspection, getInspection, refusalStatus } from '@/lib/inspections';

// POST { contractId, kind? } — the contract's own tenant acknowledges an inspection (locked from then on).
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));
    const contractId = Number(body?.contractId);
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    }
    const kind = body?.kind === 'move_out' ? 'move_out' : 'move_in';
    const result = await acknowledgeInspection(contractId, user, new Date(), kind);
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    return NextResponse.json({ success: true, message: 'รับทราบผลตรวจห้องแล้ว', inspection: await getInspection(contractId, kind) });
  } catch (error: any) {
    console.error('[Tenant inspection acknowledge Error]', error);
    return NextResponse.json({ success: false, message: 'บันทึกการรับทราบไม่สำเร็จ' }, { status: 500 });
  }
}
