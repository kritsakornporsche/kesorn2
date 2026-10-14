import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { getMoveInInspection, tenantContract } from '@/lib/inspections';

// GET ?contractId= — the move-in inspection of the tenant's own contract (latest open one when not given).
// Someone else's contract reads the same as "no inspection".
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const param = new URL(req.url).searchParams.get('contractId');
    const contractId = param ? Number(param) : null;
    if (param && (!Number.isInteger(contractId) || (contractId as number) <= 0)) {
      return NextResponse.json({ success: true, contract: null, inspection: null });
    }
    const contract = await tenantContract(user, contractId);
    if (!contract) return NextResponse.json({ success: true, contract: null, inspection: null });
    return NextResponse.json({ success: true, contract, inspection: await getMoveInInspection(contract.id) });
  } catch (error: any) {
    console.error('[Tenant inspection GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดผลตรวจห้องไม่สำเร็จ' }, { status: 500 });
  }
}
