import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const emailParam = searchParams.get('email');
    const role = (session.user as any)?.role;
    const isStaff = role === 'owner' || role === 'keeper' || role === 'platform_admin';

    if (emailParam && emailParam.toLowerCase() !== session.user.email.toLowerCase() && !isStaff) {
      return NextResponse.json({ success: false, message: 'Forbidden: คุณไม่มีสิทธิ์เข้าถึงข้อมูลของผู้ใช้อื่น' }, { status: 403 });
    }

    const userEmail = (isStaff && emailParam) ? emailParam : session.user.email;

    const sql = getDb();

    // 1. Get user and tenant details
    const result = await sql`
      SELECT 
        u.id as user_id, 
        u.name, 
        u.email,
        u.phone,
        u.primary_role as role,
        t.id as tenant_id,
        r.id as room_id,
        r.room_number,
        r.dorm_id,
        dr.dorm_name,
        dr.owner_id
      FROM users u
      LEFT JOIN tenants t ON u.id = t.user_id OR u.email = t.email
      LEFT JOIN rooms r ON t.room_id = r.id
      LEFT JOIN dormitory_registry dr ON r.dorm_id = dr.id
      WHERE u.email = ${userEmail}
      LIMIT 1
    `;

    if (result.length === 0) {
      return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    }

    const tenantInfo = result[0];
    let contracts: any[] = [];

    // 2. Fetch all contracts for this tenant
    if (tenantInfo.tenant_id || tenantInfo.user_id) {
      contracts = await sql`
        SELECT 
          c.id,
          c.start_date,
          c.end_date,
          c.deposit_amount,
          c.status,
          c.contract_file_url,
          c.renewal_requested,
          c.renewal_note,
          c.parent_contract_id,
          c.created_at,
          COALESCE(c.id_card_number, t.id_card_number, '') as id_card_number,
          COALESCE(c.tenant_address, t.address, '') as tenant_address,
          COALESCE(c.id_card_image, t.id_card_image, '') as id_card_image,
          COALESCE(t.name, 'ผู้เช่า') as tenant_name,
          COALESCE(t.phone, '') as tenant_phone,
          COALESCE(t.email, '') as tenant_email,
          r.room_number,
          r.room_type,
          r.price as monthly_rent
        FROM contracts c
        JOIN rooms r ON c.room_id = r.id
        LEFT JOIN tenants t ON c.tenant_id = t.id
        WHERE t.id = ${tenantInfo.tenant_id || 0} OR t.user_id = ${tenantInfo.user_id} OR t.email = ${userEmail}
        ORDER BY c.id DESC
      `;
    }

    return NextResponse.json({
      success: true,
      data: tenantInfo,
      contracts
    });
  } catch (error: any) {
    console.error('[GET /api/tenant/me] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
