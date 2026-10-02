import { ReactNode } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import PlatformSidebar from './components/PlatformSidebar';

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // SEC-01: Must be authenticated
  if (!session || !session.user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/platform'));
  }

  // Must have platform_admin role
  let role = (session.user as any)?.role;
  if (role !== 'platform_admin' && role !== 'admin' && session.user.email) {
    try {
      const { getDb } = await import('@/lib/db');
      const sql = getDb();
      const u = await sql`SELECT COALESCE(role, primary_role) as role FROM users WHERE LOWER(email) = ${session.user.email.toLowerCase()} LIMIT 1`;
      if (u.length > 0 && (u[0].role === 'platform_admin' || u[0].role === 'admin')) {
        role = u[0].role;
      }
    } catch (e) {
      // ignore
    }
  }
  if (role !== 'platform_admin' && role !== 'admin') {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลระบบ)'));
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <PlatformSidebar />
      <div className="flex-1 flex flex-col overflow-hidden relative">
        {children}
      </div>
    </div>
  );
}
