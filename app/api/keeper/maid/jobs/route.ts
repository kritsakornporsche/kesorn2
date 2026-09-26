import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const email = session?.user?.email || searchParams.get('email') || req.headers.get('x-user-email') || 'keeper@kaset2.com';
    const dormIdParam = searchParams.get('dormId');
    const sql = getDb();

    // Stats & Jobs query
    let statsResult;
    let jobsResult;

    if (dormIdParam && dormIdParam !== 'all') {
      const dormId = parseInt(dormIdParam, 10);
      statsResult = await sql`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM cleaning_jobs
        WHERE dorm_id = ${dormId}
      `;

      jobsResult = await sql`
        SELECT 
          c.id, 
          c.dorm_id,
          c.status, 
          COALESCE(c.job_type, c.task, 'ทำความสะอาดทั่วไป') as job_type, 
          c.created_at,
          c.completed_at,
          c.notes,
          c.photo_url,
          r.room_number,
          d.dorm_name
        FROM cleaning_jobs c
        LEFT JOIN rooms r ON c.room_id = r.id
        LEFT JOIN dormitory_registry d ON c.dorm_id = d.id
        WHERE c.dorm_id = ${dormId}
        ORDER BY 
          CASE 
            WHEN c.status = 'pending' THEN 1
            WHEN c.status = 'in_progress' THEN 2
            ELSE 3
          END,
          c.created_at DESC
      `;
    } else {
      // All dorms assigned to keeper
      statsResult = await sql`
        SELECT 
          COUNT(*) as total_jobs,
          SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
        FROM cleaning_jobs
      `;

      jobsResult = await sql`
        SELECT 
          c.id, 
          c.dorm_id,
          c.status, 
          COALESCE(c.job_type, c.task, 'ทำความสะอาดทั่วไป') as job_type, 
          c.created_at,
          c.completed_at,
          c.notes,
          c.photo_url,
          r.room_number,
          d.dorm_name
        FROM cleaning_jobs c
        LEFT JOIN rooms r ON c.room_id = r.id
        LEFT JOIN dormitory_registry d ON c.dorm_id = d.id
        ORDER BY 
          CASE 
            WHEN c.status = 'pending' THEN 1
            WHEN c.status = 'in_progress' THEN 2
            ELSE 3
          END,
          c.created_at DESC
      `;
    }

    return NextResponse.json({
      success: true,
      data: {
        stats: {
          total: statsResult[0]?.total_jobs || 0,
          inProgress: statsResult[0]?.in_progress || 0,
          completed: statsResult[0]?.completed || 0
        },
        jobs: jobsResult
      }
    });
  } catch (error: any) {
    console.error('[Maid Jobs API Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const id = body.id || body.job_id;
    const { status, notes, photo_url } = body;

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing ID or Status' }, { status: 400 });
    }

    const sql = getDb();
    
    // Update status
    if (status === 'completed') {
      await sql`
        UPDATE cleaning_jobs 
        SET 
          status = ${status}, 
          completed_at = CURRENT_TIMESTAMP,
          notes = ${notes || null},
          photo_url = ${photo_url || null}
        WHERE id = ${id}
      `;
    } else {
      await sql`
        UPDATE cleaning_jobs 
        SET status = ${status}
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ success: true, message: 'Job status updated' });
  } catch (error: any) {
    console.error('[Maid Jobs PATCH Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export const PUT = PATCH;
