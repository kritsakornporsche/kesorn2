'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/auth-client';
import { useState } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';

const navItems = [
  {
    group: 'ภาพรวม',
    items: [
      { href: '/platform', label: 'Dashboard', icon: '📊', exact: true },
    ],
  },
  {
    group: 'จัดการหอพัก',
    items: [
      { href: '/platform/dormitories', label: 'หอพักทั้งหมด', icon: '🏢' },
      { href: '/platform/tenants', label: 'ทะเบียนผู้เช่าทั้งหมด', icon: '👥' },
    ],
  },
  {
    group: 'ระบบ',
    items: [
      { href: '/platform/status', label: 'สถานะระบบ', icon: '🔌' },
      { href: '/updates', label: 'บันทึกการอัปเดต (Release Notes)', icon: '🚀' },
      { href: '/platform/settings', label: 'ตั้งค่าระบบ', icon: '⚙️' },
    ],
  },
];

export default function PlatformSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Top Navbar */}
      <header className="h-16 bg-card text-card-foreground border-b border-border flex items-center justify-between px-6 shrink-0 z-40 sticky top-0 shadow-sm">
        
        {/* Brand / Logo */}
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsOpen(true)}
            className="p-2 -ml-2 text-foreground/70 hover:bg-secondary hover:text-foreground rounded-xl transition-colors focus:outline-none cursor-pointer"
            title="เปิดเมนู"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          
          <Link 
            href="/explore" 
            className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group"
            title="กลับไปหน้าสำรวจหอพัก"
          >
            <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg flex-shrink-0 group-hover:scale-105 transition-transform text-lg">
              🏢
            </div>
            <div className="hidden sm:block">
              <h2 className="font-black text-foreground tracking-tight text-sm sm:text-base group-hover:text-primary transition-colors">ระบบบริหารจัดการหอพักเกษร 2</h2>
              <p className="text-[9px] font-bold text-primary uppercase tracking-[0.15em] leading-none">Platform Admin</p>
            </div>
          </Link>
        </div>

        {/* Right side - Profile & Explore Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/explore"
            className="px-3.5 py-1.5 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold transition-all flex items-center gap-1.5 border border-border shadow-sm cursor-pointer hover:scale-105 active:scale-95"
            title="กลับไปหน้าสำรวจหอพัก"
          >
            <span>🏠</span>
            <span className="hidden md:inline">สำรวจหอพัก</span>
          </Link>

          <ThemeToggle />

          <div className="text-right hidden sm:block pl-2 border-l border-border">
            <p className="text-sm font-bold text-foreground">{session?.user?.name || 'Platform Admin'}</p>
            <p className="text-xs text-muted-foreground">Super User</p>
          </div>

          {/* Sign Out Button */}
          <button
            type="button"
            onClick={() => handleSignOut('/')}
            className="h-9 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-100 border border-rose-500/30 transition-all flex items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer active:scale-95 shrink-0"
            title="ออกจากระบบ"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </header>

      {/* Off-canvas Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 transition-opacity" 
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Hamburger Drawer */}
      <aside 
        className={`fixed top-0 left-0 h-full w-72 bg-card text-card-foreground border-r border-border flex flex-col shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-6 border-b border-border flex items-center justify-between">
          <Link href="/explore" onClick={() => setIsOpen(false)} className="flex items-center gap-3 hover:opacity-90 transition-opacity cursor-pointer group">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center font-black text-white text-lg shadow-lg flex-shrink-0 group-hover:scale-105 transition-transform">
              S
            </div>
            <div>
              <h2 className="font-black text-foreground tracking-tight text-sm group-hover:text-violet-500 transition-colors">SmartDom</h2>
              <p className="text-[10px] font-bold text-violet-500 uppercase tracking-widest leading-none mt-1">Platform Admin</p>
            </div>
          </Link>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-foreground/70 hover:bg-secondary hover:text-foreground rounded-full transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Admin Info */}
        <div className="px-4 py-3 mx-4 mt-4 rounded-xl bg-secondary border border-border flex items-center justify-between">
          <div className="truncate mr-2">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">ล็อกอินเป็น</p>
            <p className="text-sm font-bold text-foreground truncate">{session?.user?.name || 'Platform Admin'}</p>
          </div>
          <Link
            href="/explore"
            onClick={() => setIsOpen(false)}
            className="px-3 py-1.5 rounded-lg bg-violet-600/20 hover:bg-violet-600 text-violet-600 hover:text-white dark:text-violet-300 text-xs font-bold transition-all flex items-center gap-1 border border-violet-500/30 shrink-0 cursor-pointer"
          >
            <span>🏠</span>
            <span>หน้าสำรวจ</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 overflow-y-auto space-y-6">
          {navItems.map((group) => (
            <div key={group.group}>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-muted-foreground px-3 mb-2">
                {group.group}
              </p>
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive = (item as any).exact ? pathname === item.href : pathname.startsWith(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl font-semibold text-sm transition-all ${
                        isActive
                          ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/30'
                          : 'text-foreground/70 hover:bg-secondary hover:text-foreground'
                      }`}
                    >
                      <span className="text-base flex-shrink-0">{item.icon}</span>
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-border bg-secondary/30">
          <button
            onClick={() => handleSignOut('/')}
            className="w-full flex items-center justify-center gap-3 py-2.5 px-4 bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-100 border border-rose-500/30 rounded-xl font-bold text-sm transition-all cursor-pointer shadow-sm active:scale-95"
          >
            <span className="text-base">🚪</span>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </aside>
    </>
  );
}
