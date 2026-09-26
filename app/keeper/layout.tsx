import { ReactNode } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function KeeperLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // SEC-01: Must be authenticated
  if (!session || !session.user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/keeper'));
  }

  // Must have keeper or owner role
  const role = (session.user as any)?.role;
  if (role !== 'keeper' && role !== 'owner') {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะผู้ดูแลหอพัก)'));
  }

  return <>{children}</>;
}
