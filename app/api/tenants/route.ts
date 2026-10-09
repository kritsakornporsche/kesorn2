import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if ((session.user as any)?.role !== 'owner') {
    return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
  }
  const sql = getDb();

  const { searchParams } = new URL(req.url);
  const dormId = searchParams.get('dormId') || '1';

  try {
    // 1. Auto sync any tenant who has an Active contract to status = 'active'
    await sql`
      UPDATE tenants t
      JOIN contracts c ON c.tenant_id = t.id
      SET t.status = 'active', t.room_id = c.room_id
      WHERE c.status = 'Active' AND (t.status != 'active' OR t.room_id IS NULL OR t.room_id != c.room_id)
    `;

    // 2. Fetch all tenants that either have status = 'active' or have an Active contract
    const tenants = await sql`
      SELECT DISTINCT
        t.id, 
        t.name, 
        t.email, 
        t.phone, 
        t.status, 
        r.room_number,
        r.id as room_id,
        COALESCE(r.price, 2800) as price,
        c.start_date,
        c.end_date,
        c.deposit_amount
      FROM tenants t
      LEFT JOIN rooms r ON r.id = t.room_id
      LEFT JOIN contracts c ON c.tenant_id = t.id AND c.status = 'Active'
      WHERE (t.status = 'active' OR t.status = 'Active' OR c.status = 'Active')
        AND (r.dorm_id = ${dormId} OR r.dorm_id IS NULL)
      ORDER BY CAST(r.room_number AS UNSIGNED) ASC, r.room_number ASC
    `;
    
    return NextResponse.json({ success: true, data: tenants });
  } catch (err: any) {
    console.error('[Tenants API] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
