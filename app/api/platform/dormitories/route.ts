import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session || ((session.user as any)?.role !== 'platform_admin' && (session.user as any)?.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const platformSql = getDb();
    const dorms = await platformSql`
      SELECT d.*, 
             COALESCE(u.name, 'ไม่ระบุ') as owner_name,
             u.email as owner_email
      FROM dormitory_registry d
      LEFT JOIN users u ON d.owner_id = u.id
      ORDER BY d.created_at DESC
    `;
    return NextResponse.json({ success: true, data: dorms });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await auth();
    if (!session || ((session.user as any)?.role !== 'platform_admin' && (session.user as any)?.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { id, status } = await request.json();
    if (!id || !status) {
      return NextResponse.json({ success: false, message: 'Missing id or status' }, { status: 400 });
    }
    const platformSql = getDb();
    await platformSql`UPDATE dormitory_registry SET status = ${status} WHERE id = ${id}`;
    return NextResponse.json({ success: true, message: 'อัปเดตสถานะสำเร็จ' });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
