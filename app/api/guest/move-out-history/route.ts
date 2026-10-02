import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const sql = getDb();

    // Fetch historical completed move-outs for this user
    const history = await sql`
      SELECT 
        mor.*,
        t.name as tenant_name,
        r.room_number,
        r.floor,
        r.price as room_price
      FROM move_out_requests mor
      JOIN tenants t ON mor.tenant_id = t.id
      JOIN rooms r ON mor.room_id = r.id
      WHERE (t.email = ${session.user.email} OR t.user_id = ${(session.user as any)?.id || 0})
        AND mor.status = 'Completed'
      ORDER BY mor.id DESC
    `;

    return NextResponse.json({ success: true, data: history });
  } catch (error: any) {
    console.error('[GET /api/guest/move-out-history]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
