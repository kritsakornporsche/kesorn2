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
          m.cost,
          m.bill_id,
          m.created_at,
          m.notes,
          m.photo_url,
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
          m.cost,
          m.bill_id,
          m.created_at,
          m.notes,
          m.photo_url,
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
    const cost = Math.max(0, parseFloat(body.cost !== undefined ? body.cost : 0) || 0);

    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing ID or Status' }, { status: 400 });
    }

    const sql = getDb();
    let createdBillId: number | null = null;

    if (status === 'Completed' || status === 'completed') {
      // If cost > 0, generate an unpaid bill for tenant
      if (cost > 0) {
        const maintRows = await sql`
          SELECT m.id, m.dorm_id, m.room_number, m.issue_type, m.tenant_id, m.bill_id
          FROM maintenance_requests m
          WHERE m.id = ${id}
          LIMIT 1
        `;
        if (maintRows.length > 0) {
          const m = maintRows[0];
          let tenantId = m.tenant_id;
          
          if (!tenantId && m.room_number) {
            const tRows = await sql`
              SELECT t.id 
              FROM tenants t
              JOIN rooms r ON t.room_id = r.id
              WHERE r.room_number = ${String(m.room_number)}
              LIMIT 1
            `;
            if (tRows.length > 0) tenantId = tRows[0].id;
          }

          if (tenantId) {
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            const dueDateStr = dueDate.toISOString().slice(0, 10);
            const title = `ค่าซ่อมแซม (${m.issue_type || 'ทั่วไป'}) ห้อง ${m.room_number || '-'}`;
            const billingCycle = `ค่าซ่อมแซม ${new Date().toLocaleDateString('th-TH')}`;

            if (m.bill_id) {
              await sql`
                UPDATE bills 
                SET amount = ${cost}, title = ${title}
                WHERE id = ${m.bill_id}
              `;
              createdBillId = m.bill_id;
            } else {
              const billInsert: any = await sql`
                INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, billing_cycle, due_date, status)
                VALUES (${tenantId}, ${m.dorm_id || 1}, ${m.room_number || ''}, ${title}, ${cost}, ${billingCycle}, ${dueDateStr}, 'Unpaid')
              `;
              createdBillId = billInsert.insertId || null;
            }
          }
        }
      }

      await sql`
        UPDATE maintenance_requests 
        SET 
          status = 'Completed',
          cost = ${cost},
          bill_id = ${createdBillId},
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

    return NextResponse.json({ success: true, message: 'Job status updated', cost, bill_id: createdBillId });
  } catch (error: any) {
    console.error('[Technician PATCH Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export const PUT = PATCH;
