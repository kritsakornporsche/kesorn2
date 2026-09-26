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
    
    const tenantRes = await sql`
      SELECT t.id, COALESCE(t.room_id, c.room_id) as room_id, r.room_number, COALESCE(t.dorm_id, r.dorm_id, 1) as dorm_id
      FROM tenants t
      LEFT JOIN contracts c ON t.id = c.tenant_id AND c.status = 'Active'
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, c.room_id)
      WHERE LOWER(t.email) = LOWER(${session.user.email})
      LIMIT 1
    `;

    if (tenantRes.length === 0) {
      return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    }

    const tenantId = tenantRes[0].id;
    const roomNumber = tenantRes[0].room_number;
    const dormId = tenantRes[0].dorm_id || 1;

    const insertResult: any = await sql`
      INSERT INTO maintenance_requests (tenant_id, room_number, issue_type, description, status, photo_url, image_url, dorm_id)
      VALUES (${tenantId}, ${roomNumber}, ${issue_type}, ${description}, 'Pending', ${photo_url || null}, ${photo_url || null}, ${dormId})
    `;

    const newId = insertResult.insertId;

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

    // Notify owner and keepers
    try {
      const staff = await sql`
        SELECT DISTINCT u.id as user_id, u.role
        FROM users u
        WHERE (
          u.id IN (SELECT owner_id FROM dormitory_registry WHERE id = 1 AND owner_id IS NOT NULL)
          OR LOWER(u.email) IN (SELECT LOWER(owner_email) FROM dormitory_registry WHERE id = 1 AND owner_email IS NOT NULL)
          OR u.role IN ('owner', 'keeper')
        )
      `;

      for (const p of staff as any[]) {
        const isOwner = p.role === 'owner';
        const link = isOwner ? '/owner/maintenance' : (issue_type.includes('ทำความสะอาด') ? '/keeper/maid' : '/keeper/technician');
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${p.user_id},
            'มีการแจ้งซ่อม/บริการใหม่',
            ${'ห้อง ' + (roomNumber || '-') + ' แจ้งเรื่อง: ' + issue_type + ' - ' + (description.length > 50 ? description.slice(0, 47) + '...' : description)},
            'maintenance',
            0,
            ${link},
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Maintenance notify warn:', ne);
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        id: newId, 
        tenant_id: tenantId, 
        room_number: roomNumber, 
        issue_type, 
        description, 
        status: 'Pending' 
      } 
    });
  } catch (error: any) {
    console.error('[POST /api/tenant/maintenance] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
