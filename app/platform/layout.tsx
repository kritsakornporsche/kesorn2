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
  const role = (session.user as any)?.role;
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
