import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
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

    // 1. Get contract and tenant details
    const contracts = await sql`
      SELECT c.room_id, t.email as tenant_email 
      FROM contracts c
      JOIN tenants t ON c.tenant_id = t.id
      WHERE c.id = ${id}
    `;

    if (contracts.length === 0) {
      return NextResponse.json({ success: false, message: 'Contract not found' }, { status: 404 });
    }

    const { room_id, tenant_email } = contracts[0];

    // 2. Update contract status to Active and save owner approval
    await sql`
      UPDATE contracts 
      SET 
        status = 'Active',
        owner_signature_data = ${ownerSignatureData}
      WHERE id = ${id}
    `;

    // 3. Update room status to Occupied
    await sql`
      UPDATE rooms 
      SET status = 'Occupied' 
      WHERE id = ${room_id}
    `;

    // 4. Update user role from 'guest' to 'tenant'
    if (tenant_email) {
      await sql`
        UPDATE users 
        SET role = 'tenant', primary_role = 'tenant' 
        WHERE email = ${tenant_email} AND (role = 'guest' OR primary_role = 'guest' OR role IS NULL)
      `;
    }

    // 5. Update room_id for the tenant record
    await sql`
      UPDATE tenants
      SET room_id = ${room_id}
      WHERE email = ${tenant_email}
    `;

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
