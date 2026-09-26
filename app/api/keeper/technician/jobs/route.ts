import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const email = session?.user?.email || searchParams.get('email') || req.headers.get('x-user-email') || 'tech@kaset2.com';
    const dormIdParam = searchParams.get('dormId');
    const sql = getDb();

    let statsResult;
    let jobsResult;

    if (dormIdParam && dormIdParam !== 'all') {
      const dormId = parseInt(dormIdParam, 10);
      statsResult = await sql`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN m.status = 'Pending' THEN 1 ELSE 0 END) as pending_jobs,
          SUM(CASE WHEN m.status = 'InProgress' THEN 1 ELSE 0 END) as in_progress_jobs,
          SUM(CASE WHEN m.status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs
        FROM maintenance_requests m
        WHERE m.dorm_id = ${dormId}
      `;

      jobsResult = await sql`
        SELECT 
          m.id,
          m.dorm_id,
          m.room_number,
          m.issue_type,
          m.description,
          m.status,
          m.created_at,
          COALESCE(t.name, u.name, 'ผู้เช่า') as tenant_name,
          COALESCE(t.phone, u.phone, '08X-XXX-XXXX') as tenant_phone,
          d.dorm_name
        FROM maintenance_requests m
        LEFT JOIN tenants t ON m.tenant_id = t.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN dormitory_registry d ON m.dorm_id = d.id
        WHERE m.dorm_id = ${dormId}
        ORDER BY 
          CASE 
            WHEN m.status = 'Pending' THEN 1
            WHEN m.status = 'InProgress' THEN 2
            ELSE 3
          END,
          m.created_at DESC
      `;
    } else {
      statsResult = await sql`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN m.status = 'Pending' THEN 1 ELSE 0 END) as pending_jobs,
          SUM(CASE WHEN m.status = 'InProgress' THEN 1 ELSE 0 END) as in_progress_jobs,
          SUM(CASE WHEN m.status = 'Completed' THEN 1 ELSE 0 END) as completed_jobs
        FROM maintenance_requests m
      `;

      jobsResult = await sql`
        SELECT 
          m.id,
          m.dorm_id,
          m.room_number,
          m.issue_type,
          m.description,
          m.status,
          m.created_at,
          COALESCE(t.name, u.name, 'ผู้เช่า') as tenant_name,
          COALESCE(t.phone, u.phone, '08X-XXX-XXXX') as tenant_phone,
          d.dorm_name
        FROM maintenance_requests m
        LEFT JOIN tenants t ON m.tenant_id = t.id
        LEFT JOIN users u ON t.user_id = u.id
        LEFT JOIN dormitory_registry d ON m.dorm_id = d.id
        ORDER BY 
          CASE 
            WHEN m.status = 'Pending' THEN 1
            WHEN m.status = 'InProgress' THEN 2
            ELSE 3
          END,
          m.created_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          total: statsResult[0]?.total_jobs || 0,
          pending: statsResult[0]?.pending_jobs || 0,
          inProgress: statsResult[0]?.in_progress_jobs || 0,
          completed: statsResult[0]?.completed_jobs || 0,
        },
        jobs: jobsResult,
      },
    });
  } catch (error: any) {
    console.error('[Technician Jobs API Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== 'keeper' && role !== 'owner' && role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Forbidden: Insufficient permissions' }, { status: 403 });
    }

    const body = await request.json();
    const id = body.id || body.job_id;
    const { status, notes, photo_url } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing ID or Status' }, { status: 400 });
    }

    const sql = getDb();
    if (status === 'Completed' || status === 'completed') {
      await sql`
        UPDATE maintenance_requests 
        SET 
          status = 'Completed',
          notes = ${notes || null},
          photo_url = ${photo_url || null}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE maintenance_requests 
        SET status = ${status}
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ success: true, message: 'Job status updated' });
  } catch (error: any) {
    console.error('[Technician PATCH Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export const PUT = PATCH;
