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
                AND t.status IN ('active', 'Active')
              ORDER BY t.id DESC
              LIMIT 1
            `;
            if (tRows.length > 0) tenantId = tRows[0].id;
          }

            if (tenantId) {
              const dueDate = new Date();
              dueDate.setDate(dueDate.getDate() + 7);
              const dueDateStr = dueDate.toISOString().slice(0, 10);
              const title = `ค่าซ่อมแซม (${m.issue_type || 'ทั่วไป'}) ห้อง ${m.room_number || '-'}`;
              const billingCycle = new Date().toISOString().slice(0, 7);

              if (m.bill_id) {
                await sql`
                  UPDATE bills 
                  SET amount = ${cost}, title = ${title}, bill_type = 'service', billing_cycle = ${billingCycle}
                  WHERE id = ${m.bill_id}
                `;
                createdBillId = m.bill_id;
              } else {
                const billInsert: any = await sql`
                  INSERT INTO bills (tenant_id, dorm_id, room_number, title, amount, billing_cycle, due_date, status, bill_type)
                  VALUES (${tenantId}, ${m.dorm_id || 1}, ${m.room_number || ''}, ${title}, ${cost}, ${billingCycle}, ${dueDateStr}, 'Unpaid', 'service')
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

      // Notify tenant and owner about job completion
      try {
        const maintObj = await sql`
          SELECT m.id, m.room_number, m.tenant_id, m.issue_type, t.user_id, t.email
          FROM maintenance_requests m
          LEFT JOIN tenants t ON m.tenant_id = t.id
          WHERE m.id = ${id}
          LIMIT 1
        `;
        if (maintObj.length > 0) {
          const row = maintObj[0];
          let tenantUserId = row.user_id;
          if (!tenantUserId && row.email) {
            const u = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${row.email}) LIMIT 1`;
            if (u.length > 0) tenantUserId = u[0].id;
          }

          if (tenantUserId) {
            const billNote = cost > 0 ? ` (มีค่าใช้จ่าย ฿${cost.toFixed(2)})` : '';
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${tenantUserId},
                'งานซ่อมแซมเสร็จสิ้นแล้ว',
                ${'ช่างเทคนิคได้ทำการซ่อมแซมห้อง ' + (row.room_number || '-') + ' (' + (row.issue_type || 'ทั่วไป') + ') เรียบร้อยแล้ว' + billNote},
                'maintenance',
                0,
                '/tenant/maintenance',
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
                'ช่างซ่อมปิดงานแล้ว',
                ${'งานซ่อมห้อง ' + (row.room_number || '-') + ' (' + (row.issue_type || '') + ') ปิดงานแล้ว ค่าใช้จ่าย: ฿' + cost.toFixed(2)},
                'maintenance',
                0,
                '/owner/maintenance',
                NOW()
              )
            `;
          }
        }
      } catch (ne) {
        console.warn('Tech job notify warn:', ne);
      }
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
