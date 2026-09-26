import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { issue_type, description, photo_url } = await request.json();
    if (!description) {
      return NextResponse.json({ success: false, message: 'Description is required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    
    // Find tenant ID and room_number using COALESCE to handle data migration gaps
    const tenantRes = await sql`
      SELECT t.id, COALESCE(t.room_id, c.room_id) as room_id, r.room_number
      FROM tenants t
      LEFT JOIN contracts c ON t.id = c.tenant_id AND c.status = 'Active'
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, c.room_id)
      WHERE t.email = ${session.user.email}
      LIMIT 1
    `;

    if (tenantRes.length === 0) {
      return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenantRes[0].id;
    const roomNumber = tenantRes[0].room_number;

    const result = await sql`
      INSERT INTO maintenance_requests (tenant_id, room_number, issue_type, description, status)
      VALUES (${tenantId}, ${roomNumber}, ${issue_type}, ${description}, 'Pending')
      RETURNING *
    `;

    // If request is for cleaning, also create a job in cleaning_jobs for Maid portal
    if (issue_type.includes('ทำความสะอาด') && tenantRes[0].room_id) {
      try {
        await sql`
          INSERT INTO cleaning_jobs (room_id, dorm_id, task, job_type, notes, status)
          VALUES (${tenantRes[0].room_id}, 1, ${'คำขอทำความสะอาด: ' + description}, 'requested', ${description}, 'pending')
        `;
      } catch (ce) {
        console.warn('Auto cleaning job notice:', ce);
      }
    }

    return NextResponse.json({ success: true, data: result[0] });
  } catch (error: any) {
    console.error('[POST /api/tenant/maintenance] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
