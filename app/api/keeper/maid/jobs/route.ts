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
          c.cost,
          c.bill_id,
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
          c.cost,
          c.bill_id,
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
    
    // Update status
    if (status === 'completed') {
      // If cost > 0, generate an unpaid bill for tenant
      if (cost > 0) {
        const jobRows = await sql`
          SELECT c.id, c.room_id, c.dorm_id, c.job_type, c.task, c.bill_id, r.room_number
          FROM cleaning_jobs c
          LEFT JOIN rooms r ON c.room_id = r.id
          WHERE c.id = ${id}
          LIMIT 1
        `;

        if (jobRows.length > 0) {
          const j = jobRows[0];
          // Find active tenant in this room
          const tenantRows = await sql`
            SELECT t.id, t.name, t.dorm_id
            FROM tenants t
            LEFT JOIN rooms r ON t.room_id = r.id
            WHERE (t.room_id = ${j.room_id} OR r.room_number = ${String(j.room_number || '')})
              AND (t.dorm_id = ${j.dorm_id || 1})
              AND t.status IN ('active', 'Active')
            ORDER BY t.id DESC
            LIMIT 1
          `;

          if (tenantRows.length > 0) {
            const tenantId = tenantRows[0].id;
            const dueDate = new Date();
            dueDate.setDate(dueDate.getDate() + 7);
            const dueDateStr = dueDate.toISOString().slice(0, 10);
            const cleanType = j.job_type === 'move_out' ? 'ย้ายออก' : j.job_type === 'weekly' ? 'รายสัปดาห์' : (j.task || 'ทั่วไป');
            const title = `ค่าบริการทำความสะอาด (${cleanType}) ห้อง ${j.room_number || '-'}`;
            const billingCycle = `บริการทำความสะอาด ${new Date().toLocaleDateString('th-TH')}`;

            if (j.bill_id) {
              await sql`
                UPDATE bills 
                SET amount = ${cost}, title = ${title}
                WHERE id = ${j.bill_id}
              `;
              createdBillId = j.bill_id;
            } else {
              const billInsert: any = await sql`
                INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, billing_cycle, due_date, status)
                VALUES (${tenantId}, ${j.dorm_id || 1}, ${j.room_number || ''}, ${title}, ${cost}, ${billingCycle}, ${dueDateStr}, 'Unpaid')
              `;
              createdBillId = billInsert.insertId || null;
            }
          }
        }
      }

      await sql`
        UPDATE cleaning_jobs 
        SET 
          status = ${status}, 
          cost = ${cost},
          bill_id = ${createdBillId},
          completed_at = CURRENT_TIMESTAMP,
          notes = ${notes || null},
          photo_url = ${photo_url || null}
        WHERE id = ${id}
      `;

      // Notify tenant and owner about job completion
      try {
        const cleanObj = await sql`
          SELECT c.id, c.task, c.job_type, r.room_number, t.user_id, t.email
          FROM cleaning_jobs c
          LEFT JOIN rooms r ON c.room_id = r.id
          LEFT JOIN tenants t ON t.room_id = c.room_id AND t.status IN ('active', 'Active')
          WHERE c.id = ${id}
          LIMIT 1
        `;
        if (cleanObj.length > 0) {
          const row = cleanObj[0];
          let tenantUserId = row.user_id;
          if (!tenantUserId && row.email) {
            const u = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${row.email}) LIMIT 1`;
            if (u.length > 0) tenantUserId = u[0].id;
          }

          if (tenantUserId) {
            const billNote = cost > 0 ? ` (มีค่าบริการ ฿${cost.toFixed(2)})` : '';
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${tenantUserId},
                'บริการทำความสะอาดเสร็จสิ้นแล้ว',
                ${'แม่บ้านได้เข้าทำความสะอาดห้อง ' + (row.room_number || '-') + ' เรียบร้อยแล้ว' + billNote},
                'maintenance',
                0,
                '/tenant',
                NOW()
              )
            `;
          }

          // Notify owner
          const dormOwners = await sql`
            SELECT u.id FROM users u
            JOIN dormitory_registry dr ON dr.owner_id = u.id OR LOWER(dr.owner_email) = LOWER(u.email)
            WHERE dr.id = 1
            LIMIT 1
          `;
          if (dormOwners.length > 0) {
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${dormOwners[0].id},
                'แม่บ้านทำความสะอาดเรียบร้อยแล้ว',
                ${'งานทำความสะอาดห้อง ' + (row.room_number || '-') + ' เสร็จสิ้น ค่าใช้จ่าย: ฿' + cost.toFixed(2)},
                'maintenance',
                0,
                '/owner/maintenance',
                NOW()
              )
            `;
          }
        }
      } catch (ne) {
        console.warn('Maid job notify warn:', ne);
      }
    } else {
      await sql`
        UPDATE cleaning_jobs 
        SET status = ${status}
        WHERE id = ${id}
      `;
    }

    return NextResponse.json({ success: true, message: 'Job status updated', cost, bill_id: createdBillId });
  } catch (error: any) {
    console.error('[Maid Jobs PATCH Error]', error);
    return NextResponse.json({ success: false, message: 'Internal Server Error' }, { status: 500 });
  }
}

export const PUT = PATCH;

export async function POST(request: Request) {
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
    const { room_id, room_number, dorm_id, task, job_type, notes } = body;
    const cost = Math.max(0, parseFloat(body.cost !== undefined ? body.cost : 0) || 0);

    const sql = getDb();
    let targetRoomId = room_id;
    if (!targetRoomId && room_number) {
      const r = await sql`SELECT id FROM rooms WHERE room_number = ${String(room_number)} LIMIT 1`;
      if (r.length > 0) targetRoomId = r[0].id;
    }

    if (!targetRoomId) {
      return NextResponse.json({ success: false, message: 'กรุณาระบุห้องพัก' }, { status: 400 });
    }

    const taskTitle = task || (
      job_type === 'move_out' ? 'ทำความสะอาดห้องหลังย้ายออก' :
      job_type === 'weekly' ? 'ทำความสะอาดประจำสัปดาห์' :
      'ทำความสะอาดทั่วไปตามคำขอ'
    );

    const result = await sql`
      INSERT INTO cleaning_jobs (room_id, dorm_id, task, job_type, notes, cost, status)
      VALUES (${targetRoomId}, ${dorm_id || 1}, ${taskTitle}, ${job_type || 'requested'}, ${notes || null}, ${cost}, 'pending')
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'สร้างงานทำความสะอาดเรียบร้อยแล้ว',
      data: { id: (result as any).insertId } 
    });
  } catch (error: any) {
    console.error('[Create Cleaning Job Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
