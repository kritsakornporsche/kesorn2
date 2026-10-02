import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { newRole } = await request.json();
    if (!['tenant', 'guest', 'researcher', 'owner'].includes(newRole)) {
      return NextResponse.json({ success: false, message: 'Invalid role' }, { status: 400 });
    }

    // SEC-01: Prevent unauthorized privilege escalation to owner or platform_admin
    if (newRole === 'owner' || newRole === 'platform_admin') {
      const userRow = await sql`SELECT role, primary_role FROM users WHERE email = ${session.user.email} LIMIT 1`;
      const currentPrimary = userRow[0]?.primary_role;
      const currentRole = userRow[0]?.role;
      if (currentPrimary !== newRole && currentRole !== newRole) {
        return NextResponse.json({ success: false, message: 'ไม่อนุญาตให้เปลี่ยนสิทธิ์เป็นเจ้าของหอพักหรือผู้ดูแลระบบ' }, { status: 403 });
      }
    }

    await sql`
      UPDATE users 
      SET role = ${newRole} 
      WHERE email = ${session.user.email}
    `;

    return NextResponse.json({ success: true, message: 'Role updated successfully' });
  } catch (error: any) {
    console.error('[Update Role Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
