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
    
    // Find tenant by email
    const tenantRes = await sql`SELECT id FROM tenants WHERE email = ${session.user.email} LIMIT 1`;
    if (tenantRes.length === 0) return NextResponse.json({ success: false, message: 'Tenant not found' }, { status: 404 });
    const tenantId = tenantRes[0].id;

    // Insert acknowledgment if not already read
    const existing = await sql`
      SELECT id FROM announcement_reads 
      WHERE tenant_id = ${tenantId} AND announcement_id = ${announcementId} 
      LIMIT 1
    `;
    if (existing.length === 0) {
      await sql`
        INSERT INTO announcement_reads (tenant_id, announcement_id)
        VALUES (${tenantId}, ${announcementId})
      `;
    }

    return NextResponse.json({ success: true, message: 'Acknowledged successfully' });
  } catch (error: any) {
    console.error('[POST /api/tenant/announcements/[id]/read]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
