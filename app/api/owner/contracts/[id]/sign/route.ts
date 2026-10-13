import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { signContract, CONTRACT_MESSAGES } from '@/lib/contracts';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  const sql = getDb();

  try {
    const { id } = await params;
    let ownerSignatureData = 'APPROVED_DIGITALLY';
    try {
      const body = await req.json();
      if (body?.ownerSignatureData) {
        ownerSignatureData = body.ownerSignatureData;
      }
    } catch (e) {}

    // 1. Activate through the single contract service (contract Active, room Occupied, tenant active, guest -> tenant)
    const signed = await signContract(Number(id), { ownerSignature: ownerSignatureData });
    if (!signed.ok) {
      return NextResponse.json({ success: false, message: CONTRACT_MESSAGES[signed.reason] }, { status: signed.reason === 'not_found' ? 404 : 400 });
    }
    const tenantRows = await sql`SELECT email FROM tenants WHERE id = ${signed.tenantId} LIMIT 1`;
    const tenant_email = tenantRows[0]?.email || '';

    // 6. Notify tenant
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id 
        FROM tenants t 
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE LOWER(t.email) = LOWER(${tenant_email})
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'สัญญาเช่าได้รับการอนุมัติแล้ว',
            'เจ้าของหอพักได้ลงนามอนุมัติสัญญาเช่าเรียบร้อยแล้ว ยินดีต้อนรับสู่หอพักเกษร 2',
            'contract_approved',
            0,
            '/tenant/contract',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Sign contract notify warn:', ne);
    }

    const updatedContracts = await sql`SELECT * FROM contracts WHERE id = ${id} LIMIT 1`;

    return NextResponse.json({ 
      success: true, 
      message: 'Contract approved successfully',
      data: updatedContracts[0] || null
    });
  } catch (error: any) {
    console.error('Error approving contract:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
