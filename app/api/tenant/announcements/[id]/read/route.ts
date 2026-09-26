import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.email) return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });

  try {
    const announcementId = parseInt(id);
    if (isNaN(announcementId)) return NextResponse.json({ success: false, message: 'Invalid ID' }, { status: 400 });

    const sql = getDormDbFromSession(session);
    
    // Find tenant and user ID
    const tenantRes = await sql`
      SELECT t.id, COALESCE(t.user_id, u.id) as user_id 
      FROM tenants t 
      LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
      WHERE LOWER(t.email) = LOWER(${session.user.email}) 
      LIMIT 1
    `;
    if (tenantRes.length === 0) return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    const tenantId = tenantRes[0].id;
    let userId = tenantRes[0].user_id;

    if (!userId) {
      const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${session.user.email}) LIMIT 1`;
      if (uRes.length > 0) userId = uRes[0].id;
    }

    if (!userId) {
      return NextResponse.json({ success: false, message: 'User identity could not be resolved' }, { status: 400 });
    }

    // Insert acknowledgment if not already read
    const existing = await sql`
      SELECT id FROM announcement_reads 
      WHERE (user_id = ${userId} OR tenant_id = ${tenantId}) AND announcement_id = ${announcementId} 
      LIMIT 1
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO announcement_reads (user_id, tenant_id, announcement_id)
        VALUES (${userId}, ${tenantId}, ${announcementId})
      `;
    }

    return NextResponse.json({ success: true, message: 'Acknowledged successfully' });
  } catch (error: any) {
    console.error('[POST /api/tenant/announcements/[id]/read]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
