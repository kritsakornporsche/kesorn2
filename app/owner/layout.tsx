import { ReactNode } from 'react';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import OwnerNavbar from './components/OwnerNavbar';
import OwnerSidebar from './components/OwnerSidebar';
import OwnerBottomNav from './components/OwnerBottomNav';
import OwnerChatMessenger from './components/OwnerChatMessenger';

export default async function OwnerLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await auth();

  // SEC-01: Must be authenticated
  if (!session || !session.user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/owner'));
  }

  // SEC-02: Must have owner role
  const role = (session.user as any)?.role;
  if (role !== 'owner') {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะเจ้าของหอพัก)'));
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans overflow-hidden">
      {/* 1. Full-width Top Navbar */}
      <OwnerNavbar />

      {/* 2. Below Navbar: Persistent Desktop Sidebar (hidden on mobile) + Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <OwnerSidebar />
        <div className="flex-1 flex flex-col overflow-hidden relative bg-background text-foreground pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
      </div>

      {/* 3. Mobile Bottom Navigation Bar (md:hidden) */}
      <OwnerBottomNav />

      {/* 4. Floating Owner Chat Messenger */}
      <OwnerChatMessenger />
    </div>
  );
}
