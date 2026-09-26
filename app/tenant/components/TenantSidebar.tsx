'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';
import NotificationsPopover from '@/components/NotificationsPopover';
import ThemeToggle from '@/app/components/ThemeToggle';

const navItems = [
  { href: '/tenant', label: 'หน้าหลัก', icon: '🏠', sublabel: 'ข้อมูลห้องพักและสถานะ', exact: true },
  { href: '/tenant/billing', label: 'บิลค่าเช่า', icon: '🧾', sublabel: 'ค่าเช่า ค่าน้ำ ค่าไฟ' },
  { href: '/tenant/maintenance', label: 'แจ้งซ่อม', icon: '🔧', sublabel: 'แจ้งปัญหาภายในห้องพัก' },
  { href: '/tenant/chat', label: 'แชทหอพัก', icon: '💬', sublabel: 'สนทนากับเจ้าของหอพัก' },
  { href: '/tenant/contract', label: 'สัญญาเช่า', icon: '📝', sublabel: 'เงื่อนไขและวันหมดอายุ' },
  { href: '/tenant/announcements', label: 'ประกาศข่าวสาร', icon: '📢', sublabel: 'ข่าวสารจากหอพัก' },
  { href: '/tenant/refund-request', label: 'ขอคืนเงินมัดจำ', icon: '💰', sublabel: 'คำร้องคืนเงินประกัน' },
  { href: '/tenant/move-out', label: 'แจ้งย้ายออก', icon: '🚪', sublabel: 'คำขอย้ายออกล่วงหน้า' },
  { href: '/', label: 'แนะนำหอเกษร 2', icon: '🏢', sublabel: 'ข้อมูลหอพักและสิ่งอำนวยความสะดวก' },
];


export default function TenantSidebar({
  roomInfo = 'ไม่ระบุ',
  userName = 'ผู้เช่า',
}: {
  roomInfo?: string;
  userName?: string;
}) {
  const pathname = usePathname();
  const [isOpen, setIsOpen] = useState(false);

  // Close on route change
  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Lock body scroll when sidebar is open (desktop only)
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* ================================================================ */}
      {/* DESKTOP SIDEBAR DRAWER (md+ only, invisible on mobile)           */}
      {/* ================================================================ */}
      {isOpen && (
        <div className="hidden md:block fixed inset-0 z-50">
          {/* Backdrop */}
          <div
            onClick={() => setIsOpen(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
          />

          {/* Sidebar Panel */}
          <div className="absolute left-0 top-0 h-full w-72 bg-card border-r border-border shadow-2xl flex flex-col animate-in slide-in-from-left duration-250">
            {/* Sidebar Header */}
            <div className="h-16 flex items-center justify-between px-5 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md shrink-0 text-base">
                  🏢
                </div>
                <div>
                  <p className="text-sm font-black text-foreground leading-none">เกษร 2</p>
                  <p className="text-[9px] font-bold text-primary uppercase tracking-[0.15em] mt-0.5">
                    Tenant Portal
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                aria-label="ปิดเมนู"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* User Info Card */}
            <div className="px-4 py-3 border-b border-border/60 shrink-0">
              <div className="flex items-center gap-3 p-3 rounded-2xl bg-emerald-500/8 border border-emerald-500/20">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-black text-base shadow-sm shrink-0">
                  {userName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-foreground truncate">{userName}</p>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold truncate flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block shrink-0" />
                    {roomInfo}
                  </p>
                </div>
              </div>
            </div>

            {/* Nav Items */}
            <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
              {navItems.map((item) => {
                const isActive = item.exact
                  ? pathname === item.href
                  : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`group flex items-center gap-3 px-3.5 py-3 rounded-2xl transition-all ${
                      isActive
                        ? 'bg-emerald-500/10 border border-emerald-500/30 shadow-sm'
                        : 'hover:bg-secondary/70 border border-transparent'
                    }`}
                  >
                    <span
                      className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 transition-transform group-hover:scale-105 shadow-sm ${
                        isActive
                          ? 'bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-emerald-500/30'
                          : 'bg-secondary text-foreground'
                      }`}
                    >
                      {item.icon}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p
                        className={`text-sm font-bold leading-tight truncate ${
                          isActive
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-foreground group-hover:text-foreground'
                        }`}
                      >
                        {item.label}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate font-medium mt-0.5">
                        {item.sublabel}
                      </p>
                    </div>
                    {isActive && (
                      <span className="w-1.5 h-5 rounded-full bg-emerald-500 shrink-0" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Sign Out Footer */}
            <div className="px-3 pb-4 pt-2 border-t border-border/60 shrink-0">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/signin' })}
                className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/20 text-rose-600 dark:text-rose-400 font-bold text-sm transition-all active:scale-[0.98] cursor-pointer"
              >
                <span className="w-10 h-10 rounded-xl bg-rose-500/15 flex items-center justify-center text-lg shrink-0">
                  🚪
                </span>
                <span>ออกจากระบบ</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================ */}
      {/* TOP HEADER BAR                                                   */}
      {/* ================================================================ */}
      <header className="h-16 bg-card text-card-foreground border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0 z-40 sticky top-0 shadow-sm w-full backdrop-blur-md">
        {/* Left: Hamburger (desktop only) + Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hamburger Button — Desktop only */}
          <button
            type="button"
            onClick={() => setIsOpen(true)}
            className="hidden md:flex w-10 h-10 items-center justify-center rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground hover:text-emerald-600 transition-all active:scale-95 cursor-pointer shadow-sm group"
            aria-label="เปิดเมนูหลัก"
          >
            <svg
              className="w-5 h-5 transition-transform group-hover:scale-110"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>

          {/* Brand Logo + Name */}
          <Link
            href="/tenant"
            className="flex items-center gap-2.5 hover:opacity-90 transition-opacity cursor-pointer group"
            title="หน้าหลักผู้เช่า"
          >
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md group-hover:scale-105 transition-transform shrink-0 text-base sm:text-lg">
              🏢
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-tight text-foreground group-hover:text-primary transition-colors leading-none">
                เกษร 2
              </h2>
              <div className="hidden sm:flex items-center gap-1.5 leading-none mt-1">
                <p className="text-[9px] font-black text-primary uppercase tracking-[0.15em]">Tenant Portal</p>
                <span className="text-muted-foreground text-[9px]">•</span>
                <span className="text-[9px] text-muted-foreground">{roomInfo}</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Chat icon */}
          <Link
            href="/tenant/chat"
            className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 text-foreground transition-all flex items-center justify-center border border-border shadow-sm active:scale-95 group"
            title="แชทติดต่อหอพัก"
          >
            <svg
              className="w-5 h-5 text-foreground group-hover:text-emerald-500 transition-colors"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
              />
            </svg>
          </Link>

          {/* Notifications */}
          <NotificationsPopover />

          {/* Theme Toggle */}
          <ThemeToggle />

          {/* User Info (desktop) */}
          <div className="text-right pl-3 border-l border-border hidden sm:block">
            <p className="text-sm font-bold text-foreground">{userName}</p>
            <p className="text-xs text-muted-foreground truncate max-w-[150px]">ลูกหอ / ผู้เช่า</p>
          </div>

          {/* Sign Out (Visible on both Mobile and Desktop) */}
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: '/signin' })}
            className="flex h-9 px-2.5 sm:px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-100 border border-rose-500/30 transition-all items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer active:scale-95 shrink-0"
            title="ออกจากระบบ"
          >
            <span>🚪</span>
            <span className="hidden sm:inline">ออกจากระบบ</span>
          </button>
        </div>
      </header>
    </>
  );
}
