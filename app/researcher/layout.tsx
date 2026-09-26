'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import ResearcherNavbar from './components/ResearcherNavbar';
import ResearcherSidebar from './components/ResearcherSidebar';

export default function ResearcherLayout({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    const localRole = typeof window !== 'undefined' ? localStorage.getItem('userRole') : null;
    const userRole = (session?.user as any)?.role || localRole;
    
    // Redirect unauthenticated users to signin with return URL
    if (!session && !localRole) {
      const currentPath = typeof window !== 'undefined' ? (window.location.pathname + window.location.search) : '/researcher';
      router.push(`/signin?callbackUrl=${encodeURIComponent(currentPath)}`);
      return;
    }

    // Role guard: if logged in as other specific roles, send them to their proper home dashboard
    if (userRole && userRole !== 'researcher' && userRole !== 'guest') {
      if (userRole === 'owner') { router.replace('/owner'); return; }
      if (userRole === 'tenant') { router.replace('/tenant'); return; }
      if (userRole === 'platform_admin' || userRole === 'admin') { router.replace('/platform'); return; }
      if (userRole === 'keeper') {
        const subRole = (session?.user as any)?.sub_role || (typeof window !== 'undefined' ? localStorage.getItem('userSubRole') : null);
        if (subRole === 'maid') router.replace('/keeper/maid');
        else if (subRole === 'technician') router.replace('/keeper/technician');
        else router.replace('/keeper');
        return;
      }
    }
  }, [session, status, router]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-950 text-slate-100 font-sans selection:bg-cyan-500 selection:text-black overflow-hidden">
      {/* 1. Full-width Top Navbar */}
      <ResearcherNavbar onToggleMobileMenu={() => setMobileMenuOpen(prev => !prev)} />

      {/* 2. Below Navbar: Left Sidebar (w-64) + Right Main Content (flex-1) */}
      <div className="flex flex-1 overflow-hidden relative">
        <ResearcherSidebar
          isOpen={mobileMenuOpen}
          onClose={() => setMobileMenuOpen(false)}
        />
        <main className="flex-1 overflow-y-auto bg-slate-950/95 relative">
          {children}
        </main>
      </div>
    </div>
  );
}
