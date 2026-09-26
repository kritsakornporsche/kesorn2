'use client';

import Link from 'next/link';
import { signOut, useSession } from 'next-auth/react';
import ThemeToggle from '@/app/components/ThemeToggle';

interface ResearcherNavbarProps {
  onToggleMobileMenu: () => void;
}

export default function ResearcherNavbar({ onToggleMobileMenu }: ResearcherNavbarProps) {
  const { data: session } = useSession();

  return (
    <header className="h-16 w-full bg-[#130924] border-b border-purple-500/20 flex items-center justify-between px-4 sm:px-8 shrink-0 z-40 shadow-md">
      {/* Brand / Logo */}
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMobileMenu}
          className="md:hidden p-2 -ml-2 text-white/60 hover:bg-white/10 hover:text-white rounded-xl transition-colors focus:outline-none cursor-pointer"
          title="เปิดเมนูนำทาง"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>

        <Link
          href="/researcher"
          className="flex items-center gap-3 hover:opacity-95 transition-opacity cursor-pointer group"
          title="แดชบอร์ดงานวิจัย SmartDom"
        >
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-105 transition-transform text-lg">
            🏢
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-black text-white tracking-tight text-sm sm:text-base group-hover:text-primary-foreground transition-colors">
                Kesorn 2 Research Hub
              </h2>
              <span className="hidden sm:inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30 tracking-wider">
                THESIS / RESEARCH
              </span>
            </div>
            <p className="text-[10px] font-bold text-amber-400 uppercase tracking-[0.15em] leading-none mt-0.5">
              University Dormitory Information System
            </p>
          </div>
        </Link>
      </div>

      {/* Top Right Actions */}
      <div className="flex items-center gap-2 sm:gap-4">
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/5 border border-white/10">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-xs text-white/80 font-medium">
            สถานะ: {session?.user?.name || 'Researcher'} (ผู้วิจัยระบบ)
          </span>
        </div>

        <ThemeToggle />

        <Link
          href="/explore"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white text-xs font-semibold transition-colors border border-white/10"
        >
          <span>🌐</span>
          <span>หน้าสำรวจหอพัก</span>
        </Link>

        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('userRole');
              localStorage.removeItem('userEmail');
              localStorage.removeItem('userName');
            }
            signOut({ callbackUrl: '/' });
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 text-xs font-semibold transition-colors border border-rose-500/20 cursor-pointer"
          title="ออกจากระบบ"
        >
          <span>🚪</span>
          <span className="hidden sm:inline">ออกจากระบบ</span>
        </button>
      </div>
    </header>
  );
}
