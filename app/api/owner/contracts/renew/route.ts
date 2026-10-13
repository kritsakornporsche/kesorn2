import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { renewContract, CONTRACT_MESSAGES } from '@/lib/contracts';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const body = await req.json();
    const { contract_id, new_end_date, deposit_amount, contract_file_url } = body;

    if (!contract_id || !new_end_date) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณาระบุรหัสสัญญาและกำหนดวันสิ้นสุดสัญญาฉบับต่ออายุใหม่' 
      }, { status: 400 });
    }

    const sql = getDb();

    // 1. Old contract -> Renewed and the next one opened (Active, from the old end date) in one transaction
    const renewed = await renewContract(Number(contract_id), {
      newEndDate: new_end_date,
      depositAmount: deposit_amount !== undefined ? Number(deposit_amount) : null,
      contractFileUrl: contract_file_url || null,
    });
    if (!renewed.ok) {
      return NextResponse.json({ success: false, message: CONTRACT_MESSAGES[renewed.reason] }, { status: renewed.reason === 'not_found' ? 404 : 400 });
    }
    const newContractId = renewed.contractId;
    const oldContract = { tenant_id: renewed.tenantId };

    // 5. Notify tenant
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id 
        FROM tenants t 
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE t.id = ${oldContract.tenant_id} 
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'การต่ออายุสัญญาเช่าสำเร็จแล้ว',
            ${'สัญญาเช่าฉบับใหม่ได้รับการอนุมัติแล้ว ขยายระยะเวลาถึงวันที่ ' + new Date(new_end_date).toLocaleDateString('th-TH')},
            'contract_renewal_approved',
            0,
            '/tenant/contract',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Renewal tenant notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'ต่ออายุสัญญาเช่าและบันทึกเอกสารสัญญาฉบับใหม่สำเร็จเรียบร้อยแล้ว',
      newContractId
    });
  } catch (err: any) {
    console.error('[Contract Renewal API Error]:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
