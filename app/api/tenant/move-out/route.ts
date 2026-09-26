import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const desiredDate = body.desiredDate || body.desired_date || body.move_out_date || body.date;
    const reason = body.reason;
    if (!desiredDate) return NextResponse.json({ success: false, message: 'Missing desired date' }, { status: 400 });

    const sql = getDormDbFromSession(session);
    
    // Find tenant by email
    const tenantRes = await sql`SELECT id, room_id FROM tenants WHERE email = ${session.user.email} LIMIT 1`;
    if (tenantRes.length === 0) return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    const tenantId = tenantRes[0].id;
    const roomId = tenantRes[0].room_id || null;

    // Check if there is already a pending request
    const existingReq = await sql`SELECT id FROM move_out_requests WHERE tenant_id = ${tenantId} AND status IN ('Pending', 'Approved')`;
    if (existingReq.length > 0) {
      return NextResponse.json({ success: false, message: 'You already have an active move-out request.' }, { status: 400 });
    }

    // Insert new request
    await sql`
      INSERT INTO move_out_requests (tenant_id, room_id, move_out_date, desired_date, reason, status)
      VALUES (${tenantId}, ${roomId}, ${desiredDate}, ${desiredDate}, ${reason || null}, 'Pending')
    `;

    return NextResponse.json({ success: true, message: 'Move-out request submitted successfully.' });
  } catch (error: any) {
    console.error('[POST /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const { requestId } = await req.json();
    if (!requestId) return NextResponse.json({ success: false, message: 'Missing requestId' }, { status: 400 });

    const sql = getDormDbFromSession(session);
    
    // Find tenant by email
    const tenantRes = await sql`SELECT id FROM tenants WHERE email = ${session.user.email} LIMIT 1`;
    if (tenantRes.length === 0) return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    const tenantId = tenantRes[0].id;

    // Delete request if it belongs to tenant and is Pending
    const delRes = await sql`
      DELETE FROM move_out_requests 
      WHERE id = ${requestId} AND tenant_id = ${tenantId} AND status = 'Pending'
    `;

    if (delRes.length === 0) {
      return NextResponse.json({ success: false, message: 'Cannot cancel this request. It might be approved already or not found.' }, { status: 400 });
    }

    return NextResponse.json({ success: true, message: 'Request cancelled successfully.' });
  } catch (error: any) {
    console.error('[DELETE /api/tenant/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
