'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import NotificationsPopover from '@/components/NotificationsPopover';
import ThemeToggle from '@/app/components/ThemeToggle';

interface OwnerNavbarProps {
  onToggleMobileMenu?: () => void;
}

export default function OwnerNavbar({ onToggleMobileMenu }: OwnerNavbarProps) {
  const { data: session } = useSession();
  const [dormName, setDormName] = useState<string | null>(null);
  const [dorms, setDorms] = useState<any[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [canAddDorm, setCanAddDorm] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [chatCount, setChatCount] = useState<number>(0);

  useEffect(() => {
    setMounted(true);
    const email = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null);
    if (email) {
      const savedDb = typeof window !== 'undefined' ? localStorage.getItem('selectedDormDbName') : null;
      fetch(`/api/owner/onboarding?email=${encodeURIComponent(email)}${savedDb ? `&dormDbName=${savedDb}` : ''}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setDorms(data.dorms || []);
            setCanAddDorm(data.canAddDorm);
            const activeDb = data.dormDbName;
            setSelectedDb(activeDb);
            setDormName(data.dorm?.name || null);
            if (activeDb && typeof window !== 'undefined') {
              localStorage.setItem('selectedDormDbName', activeDb);
            }
          }
        })
        .catch(console.error);

      // Fetch chat badge count (ONLY UNREAD MESSAGES!)
      const fetchChatCount = () => {
        fetch('/api/chat/conversations')
          .then(res => res.json())
          .then(data => {
            if (data.success && Array.isArray(data.data)) {
              const unreadTotal = data.data.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);
              setChatCount(unreadTotal);
            }
          })
          .catch(() => {});
      };
      fetchChatCount();
      const interval = setInterval(fetchChatCount, 10000);

      const handleUnreadUpdate = (e: any) => {
        if (typeof e.detail?.count === 'number') {
          setChatCount(e.detail.count);
        } else {
          fetchChatCount();
        }
      };
      window.addEventListener('chat-unread-updated', handleUnreadUpdate);

      return () => {
        clearInterval(interval);
        window.removeEventListener('chat-unread-updated', handleUnreadUpdate);
      };
    }
  }, [session]);

  const handleDormChange = (newDb: string) => {
    localStorage.setItem('selectedDormDbName', newDb);
    setSelectedDb(newDb);
    window.location.reload();
  };

  if (!mounted) {
    return <header className="h-16 bg-card border-b border-border shrink-0" />;
  }

  return (
    <header className="h-16 bg-card text-card-foreground border-b border-border flex items-center justify-between px-3 sm:px-6 shrink-0 z-40 sticky top-0 shadow-sm backdrop-blur-md">
      {/* 1. Left side: Brand Logo & Title (Mobile & Desktop) */}
      <div className="flex items-center gap-2 shrink-0">
        <Link
          href="/owner"
          className="flex items-center gap-2 sm:gap-3 hover:opacity-90 transition-opacity cursor-pointer group"
          title="แดชบอร์ดเจ้าของหอพัก"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shrink-0 group-hover:scale-105 transition-transform text-lg">
            🏢
          </div>
          <div className="hidden md:block">
            <h2 className="font-black text-foreground tracking-tight text-sm sm:text-base group-hover:text-primary transition-colors leading-none">
              เกษร 2
            </h2>
            <div className="flex items-center gap-1.5 leading-none mt-1">
              <span className="text-[9px] font-black text-primary uppercase tracking-[0.15em]">
                Owner Portal
              </span>
              <span className="hidden sm:inline text-muted-foreground text-[9px]">•</span>
              <span className="hidden sm:inline text-[9px] text-muted-foreground">ระบบจัดการหอพัก</span>
            </div>
          </div>
        </Link>
      </div>

      {/* 2. Center: Dormitory Badge (Single Dorm: Kesorn 2) */}
      <div className="flex-1 flex items-center justify-center min-w-0 px-1">
        <div className="flex items-center gap-2 bg-secondary/80 border border-border px-3.5 py-1.5 rounded-2xl shadow-inner max-w-[240px]">
          <span className="text-xs sm:text-sm shrink-0">🏢</span>
          <span className="text-xs font-black text-foreground truncate">
            หอพักเกษร 2
          </span>
          <span className="text-[10px] bg-primary/10 text-primary font-bold px-1.5 py-0.5 rounded-md">
            เดี่ยว
          </span>
        </div>
      </div>

      {/* 3. Right side: Notifications, Theme Toggle, (Desktop: Explore, User Info, Sign Out) */}
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        {/* Public View Button */}
        <Link
          href="/"
          className="hidden md:flex px-3 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-all items-center gap-1.5 border border-border shadow-sm cursor-pointer hover:scale-105 active:scale-95"
          title="หน้าแนะนำหอเกษร 2 สำหรับผู้เช่าและบุคคลทั่วไป"
        >
          <span>🏢</span>
          <span>แนะนำหอเกษร 2</span>
        </Link>

        {/* Chat / Direct Message Button (Top Navbar on Mobile & Desktop) */}
        <button
          type="button"
          onClick={() => window.dispatchEvent(new CustomEvent('open-owner-chat'))}
          className="relative p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all cursor-pointer active:scale-95 flex items-center justify-center border border-border shadow-sm group"
          title="แชทและข้อความ"
          aria-label="แชทและข้อความ"
        >
          {/* Instagram / Messenger style Paper Plane or Chat icon */}
          <svg className="w-5 h-5 text-foreground group-hover:text-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
          </svg>
          {chatCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-card shadow-sm animate-pulse">
              {chatCount > 9 ? '9+' : chatCount}
            </span>
          )}
        </button>

        {/* Notifications Popover */}
        <NotificationsPopover />

        {/* Theme Toggle Button */}
        <ThemeToggle />

        {/* User Info (Desktop only, shown in Mobile Drawer) */}
        <div className="hidden md:block text-right pl-2 border-l border-border">
          <p className="text-xs font-bold text-foreground truncate max-w-[130px]">
            {session?.user?.name || 'Owner'}
          </p>
          <p className="text-[10px] text-muted-foreground font-medium truncate max-w-[130px]">
            {dormName || 'SmartDom'}
          </p>
        </div>

        {/* Sign Out Button (Visible on both Mobile and Desktop) */}
        <button
          type="button"
          onClick={() => handleSignOut('/')}
          className="flex h-9 px-2.5 sm:px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-100 border border-rose-500/30 transition-all items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer active:scale-95 shrink-0"
          title="ออกจากระบบ"
        >
          <span>🚪</span>
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>
      </div>
    </header>
  );
}
