import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { getCurrentUser } from '@/lib/authz';
import { getSettlement } from '@/lib/moveOut';

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
        s.id as settlement_id,
        t.name as tenant_name,
        r.room_number,
        r.floor,
        r.price as room_price
      FROM move_out_requests mor
      JOIN tenants t ON mor.tenant_id = t.id
      JOIN rooms r ON mor.room_id = r.id
      LEFT JOIN move_out_settlements s ON s.request_id = mor.id
      WHERE (t.email = ${session.user.email} OR t.user_id = ${(session.user as any)?.id || 0})
        AND mor.status = 'Completed'
      ORDER BY mor.id DESC
    `;

    // Move-outs from commit 12 on carry their settlement (amounts from lib/moveOut.ts); older ones keep their own columns
    const user = await getCurrentUser();
    const now = new Date();
    const data = [];
    for (const row of history as any[]) {
      data.push({ ...row, settlement: row.settlement_id && user ? await getSettlement(Number(row.settlement_id), user, now) : null });
    }
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('[GET /api/guest/move-out-history]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
