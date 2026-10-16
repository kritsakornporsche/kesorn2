import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { sendBills } from '@/lib/bill-status';

// POST { billIds: number[] } — send draft bills to tenants
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;

  try {
    const { billIds } = await req.json();
    const ids = (Array.isArray(billIds) ? billIds : [billIds]).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่ได้เลือกบิล' }, { status: 400 });
    }

    const result = await sendBills(ids, guard.user.id);
    return NextResponse.json({
      success: result.sent.length > 0,
      message: result.sent.length > 0 ? `ส่งบิลแล้ว ${result.sent.length} ใบ` : 'ไม่มีบิลร่างที่ส่งได้',
      data: result,
    }, { status: result.sent.length > 0 ? 200 : 400 });
  } catch (error: any) {
    console.error('[Billing send Error]', error);
    return NextResponse.json({ success: false, message: 'ส่งบิลไม่สำเร็จ' }, { status: 500 });
  }
}
