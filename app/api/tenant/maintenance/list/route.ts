import { NextResponse } from 'next/server';
import { getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  try {
    const sql = getDormDbFromSession(session);
    
    // Find tenant ID
    const userEmail = session.user.email.toLowerCase();
    const userId = (session.user as any)?.id || 0;
    const tenantRes = await sql`
      SELECT id FROM tenants 
      WHERE LOWER(email) = ${userEmail} OR user_id = ${userId}
      LIMIT 1
    `;
    if (tenantRes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const tenantId = tenantRes[0].id;

    const result = await sql`
      SELECT * FROM maintenance_requests 
      WHERE tenant_id = ${tenantId} 
      ORDER BY created_at DESC
    `;

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    console.error('[GET /api/tenant/maintenance/list] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
