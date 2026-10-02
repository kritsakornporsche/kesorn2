import { ReactNode } from 'react';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { redirect } from 'next/navigation';

export default async function KeeperLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // SEC-01: Must be authenticated
  if (!session || !session.user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/keeper'));
  }

  // Must have keeper or owner role
  let role = (session.user as any)?.role;
  if (role !== 'keeper' && role !== 'owner') {
    if (session.user.email) {
      try {
        const sql = getDb();
        const u = await sql`SELECT COALESCE(role, primary_role) as role FROM users WHERE LOWER(email) = ${session.user.email.toLowerCase()} LIMIT 1`;
        if (u.length > 0 && (u[0].role === 'keeper' || u[0].role === 'owner')) {
          role = u[0].role;
        }
      } catch (e) {
        // ignore
      }
    }
  }

  if (role !== 'keeper' && role !== 'owner') {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลหอพัก)'));
  }

  return <>{children}</>;
}
