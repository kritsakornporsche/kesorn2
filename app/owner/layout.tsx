import { ReactNode } from 'react';
import { getCurrentUser } from '@/lib/authz';
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
  const user = await getCurrentUser();

  // SEC-01: Must be authenticated (role and active status are read from the DB)
  if (!user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/owner'));
  }

  // SEC-02: Owner or manager only
  if (user.role !== 'owner' && user.role !== 'manager' && user.role !== 'researcher') {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะเจ้าของหอพักและผู้จัดการ)'));
  }

  return (
    <div className="flex flex-col h-screen w-screen bg-background text-foreground font-sans overflow-hidden">
      {/* 1. Full-width Top Navbar */}
      <OwnerNavbar role={user.role} />

      {/* 2. Below Navbar: Persistent Desktop Sidebar (hidden on mobile) + Main Content Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <OwnerSidebar />
        <main className="flex-1 flex flex-col overflow-y-auto overflow-x-hidden relative bg-background text-foreground pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          {children}
        </main>
      </div>

      {/* 3. Mobile Bottom Navigation Bar (md:hidden) */}
      <OwnerBottomNav />

      {/* 4. Floating Owner Chat Messenger */}
      <OwnerChatMessenger />
    </div>
  );
}
