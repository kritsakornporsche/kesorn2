import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dormId = parseInt(searchParams.get('dormId') || (session.user as any)?.dormId || '1', 10);
    const sql = getDb();
    
    const requests = await sql`
      SELECT 
        m.id,
        m.tenant_id,
        m.room_number,
        m.issue_type,
        m.description,
        m.status,
        m.created_at,
        COALESCE(t.name, u.name, 'ผู้เช่า') as tenant_name,
        COALESCE(t.phone, u.phone, '081-234-5678') as tenant_phone
      FROM maintenance_requests m
      LEFT JOIN tenants t ON m.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id
      WHERE m.dorm_id = ${dormId} OR t.dorm_id = ${dormId}
      ORDER BY 
        CASE 
          WHEN m.status = 'Pending' THEN 1
          WHEN m.status = 'InProgress' THEN 2
          ELSE 3
        END,
        m.created_at DESC
    `;
    return NextResponse.json({ success: true, data: requests });
  } catch (err: any) {
    console.error('[Maintenance API]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const { id, status } = await req.json();
    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing id or status' }, { status: 400 });
    }

    const sql = getDb();
    await sql`
      UPDATE maintenance_requests 
      SET status = ${status} 
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true, message: 'Status updated' });
  } catch (err: any) {
    console.error('[Maintenance PUT Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
