import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';

export type Role = 'owner' | 'manager' | 'keeper' | 'tenant' | 'guest' | 'researcher' | 'platform_admin' | 'admin';

export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: Role;
  sub_role: string | null;
}

// Role and active status come from the DB on every call, so role changes and
// deactivated accounts take effect immediately instead of when the JWT expires.
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await auth();
  const id = Number((session?.user as any)?.id);
  if (!session?.user || !id) return null;

  const sql = getDb();
  if ((session.user as any).role === 'platform_admin') {
    const rows = await sql`SELECT id, email, name, is_active FROM platform_admins WHERE id = ${id} LIMIT 1`;
    if (rows.length === 0 || !rows[0].is_active) return null;
    return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: 'platform_admin', sub_role: null };
  }

  const rows = await sql`SELECT id, email, name, role, sub_role, is_active FROM users WHERE id = ${id} LIMIT 1`;
  if (rows.length === 0 || !rows[0].is_active) return null;
  return { id: rows[0].id, email: rows[0].email, name: rows[0].name, role: rows[0].role, sub_role: rows[0].sub_role || null };
}

export async function requireRole(
  roles: Role[]
): Promise<{ user: CurrentUser } | { response: NextResponse }> {
  const user = await getCurrentUser();
  if (!user) {
    return { response: NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  }
  if (!roles.includes(user.role)) {
    return { response: NextResponse.json({ success: false, message: 'ไม่มีสิทธิ์ใช้งานส่วนนี้' }, { status: 403 }) };
  }
  return { user };
}
