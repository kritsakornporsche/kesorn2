import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { getInspection, tenantContract } from '@/lib/inspections';

// GET ?contractId=&kind=move_in|move_out — an inspection of the tenant's own contract (latest open one when not given).
// For move_out the move-in result comes too, to compare.
// Someone else's contract reads the same as "no inspection".
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const search = new URL(req.url).searchParams;
    const kind = search.get('kind') === 'move_out' ? 'move_out' : 'move_in';
    const param = search.get('contractId');
    const contractId = param ? Number(param) : null;
    if (param && (!Number.isInteger(contractId) || (contractId as number) <= 0)) {
      return NextResponse.json({ success: true, contract: null, inspection: null });
    }
    const contract = await tenantContract(user, contractId);
    if (!contract) return NextResponse.json({ success: true, contract: null, inspection: null });
    return NextResponse.json({
      success: true, contract, kind,
      inspection: await getInspection(contract.id, kind),
      move_in: kind === 'move_out' ? await getInspection(contract.id, 'move_in') : null,
    });
  } catch (error: any) {
    console.error('[Tenant inspection GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดผลตรวจห้องไม่สำเร็จ' }, { status: 500 });
  }
}
