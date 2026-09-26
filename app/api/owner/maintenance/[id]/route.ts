import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing maintenance ID' }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ success: false, message: 'Missing new status' }, { status: 400 });
    }

    await sql`
      UPDATE maintenance_requests
      SET status = ${status}
      WHERE id = ${id}
    `;

    const updated = await sql`SELECT * FROM maintenance_requests WHERE id = ${id} LIMIT 1`;

    // Notify tenant about status change
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id
        FROM maintenance_requests mr
        JOIN tenants t ON mr.tenant_id = t.id
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE mr.id = ${id}
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        const statusTh = status === 'Completed' ? 'เสร็จสิ้นแล้ว' : (status === 'In Progress' || status === 'InProgress' ? 'กำลังดำเนินการ' : status);
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'อัปเดตสถานะการแจ้งซ่อม',
            ${'รายการแจ้งซ่อม #' + id + ' ได้รับการเปลี่ยนสถานะเป็น: ' + statusTh},
            'maintenance',
            0,
            '/tenant/maintenance',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Maintenance status notify warn:', ne);
    }

    return NextResponse.json({ success: true, data: updated[0] || { id, status } });
  } catch (err: any) {
    console.error('[Maintenance API PUT]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
