'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import versionData from '@/lib/version.json';

interface SubAction {
  href: string;
  label: string;
  sublabel: string;
  icon: string;
  badge?: string | number;
}

export default function TenantBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);

  // Poll for unread chat messages
  useEffect(() => {
    if (!session) return;

    const fetchChatCount = () => {
      fetch('/api/chat/conversations')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) {
            const count = data.data.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);
            setUnreadChatCount(count);
          }
        })
        .catch(() => {});
    };

    fetchChatCount();
    const interval = setInterval(fetchChatCount, 12000);

    const handleChatUpdate = (e: any) => {
      if (typeof e.detail?.count === 'number') {
        setUnreadChatCount(e.detail.count);
      } else {
        fetchChatCount();
      }
    };
    window.addEventListener('chat-unread-updated', handleChatUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('chat-unread-updated', handleChatUpdate);
    };
  }, [session]);

  // Close sheet on route change
  useEffect(() => {
    setIsMoreOpen(false);
  }, [pathname]);

  // Lock body scroll when more sheet is open
  useEffect(() => {
    if (isMoreOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMoreOpen]);

  const moreSubActions: SubAction[] = [
    {
      href: '/tenant/contract',
      label: 'สัญญาเช่าของฉัน',
      sublabel: 'ดูรายละเอียดสัญญา เงื่อนไขการเช่า และวันหมดอายุ',
      icon: '📝',
    },
    {
      href: '/tenant/move-out',
      label: 'แจ้งย้ายออก',
      sublabel: 'ส่งคำขอย้ายออกล่วงหน้า และตรวจรับเงินประกัน',
      icon: '🚪',
    },
    {
      href: '/tenant/announcements',
      label: 'ประกาศจากหอพัก',
      sublabel: 'ข่าวสาร กฎระเบียบ และการแจ้งเตือนจากผู้ดูแล',
      icon: '📢',
    },
    {
      href: '/explore',
      label: 'สำรวจหอพักทั่วไป',
      sublabel: 'ดูหน้าค้นหาหอพักและห้องว่างของบุคคลทั่วไป',
      icon: '🌐',
    },
  ];

  const tabs = [
    {
      id: 'home',
      href: '/tenant',
      label: 'หน้าหลัก',
      icon: '🏠',
      activeIcon: '🏡',
      isActive: pathname === '/tenant',
    },
    {
      id: 'billing',
      href: '/tenant/billing',
      label: 'บิลค่าเช่า',
      icon: '🧾',
      activeIcon: '💳',
      isActive: pathname.startsWith('/tenant/billing'),
    },
    {
      id: 'maintenance',
      href: '/tenant/maintenance',
      label: 'ซ่อม/ทำความสะอาด',
      icon: '🔧',
      activeIcon: '🛠️',
      isActive: pathname.startsWith('/tenant/maintenance'),
    },
    {
      id: 'chat',
      href: '/tenant/chat',
      label: 'แชทหอพัก',
      icon: '💬',
      activeIcon: '💭',
      isActive: pathname.startsWith('/tenant/chat'),
      badge: unreadChatCount > 0 ? unreadChatCount : undefined,
    },
    {
      id: 'more',
      label: 'เพิ่มเติม',
      icon: '⚙️',
      activeIcon: '✨',
      isMore: true,
      isActive: isMoreOpen || ['/tenant/contract', '/tenant/move-out', '/tenant/announcements'].some(p => pathname.startsWith(p)),
    },
  ];

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. INTERACTIVE ACTION SHEET (More menu / Sub-system hub)                   */}
      {/* ========================================================================= */}
      {isMoreOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop Blur Overlay */}
          <div
            onClick={() => setIsMoreOpen(false)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          />

          {/* Action Sheet Panel */}
          <div className="relative z-10 w-full bg-card text-foreground rounded-t-[2rem] border-t border-border shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-250">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mt-3 mb-1 shrink-0" />

            {/* Header */}
            <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-card/80 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-lg shadow-inner">
                  ✨
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground tracking-tight leading-none">
                    บริการเพิ่มเติม
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                    สัญญาเช่า การแจ้งย้ายออก และข่าวสาร
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsMoreOpen(false)}
                className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                aria-label="ปิดเมนู"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body Cards */}
            <div className="p-4 overflow-y-auto space-y-2.5">
              <div className="grid grid-cols-1 gap-2.5">
                {moreSubActions.map((sub) => {
                  const isCurrent = pathname.startsWith(sub.href);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setIsMoreOpen(false)}
                      className={`group p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 active:scale-[0.98] ${
                        isCurrent
                          ? 'bg-emerald-500/10 border-emerald-500/40 shadow-sm'
                          : 'bg-card hover:bg-secondary/60 border-border/80'
                      }`}
                    >
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-transform group-hover:scale-105 shadow-sm ${
                        isCurrent
                          ? 'bg-gradient-to-tr from-emerald-600 to-teal-600 text-white shadow-emerald-600/25'
                          : 'bg-secondary text-foreground'
                      }`}>
                        {sub.icon}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <h4 className={`text-sm tracking-tight ${
                            isCurrent ? 'font-black text-emerald-600 dark:text-emerald-400' : 'font-bold text-foreground'
                          }`}>
                            {sub.label}
                          </h4>
                          {sub.badge && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-emerald-600 text-white animate-pulse shrink-0">
                              {sub.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 font-medium">
                          {sub.sublabel}
                        </p>
                      </div>

                      <div className="text-muted-foreground/60 group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Sign Out Button & Version */}
              <div className="space-y-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('userRole');
                      localStorage.removeItem('userEmail');
                      localStorage.removeItem('userName');
                    }
                    signOut({ callbackUrl: '/' });
                  }}
                  className="w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                >
                  <span>🚪</span>
                  <span>ออกจากระบบ (Sign Out)</span>
                </button>

                <div className="pt-2.5 pb-1 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground font-medium px-2">
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="font-bold text-foreground">{versionData.shortDisplay || `v2.6.1-b${versionData.buildNumber}`}</span>
                    <span className="text-[10px] text-muted-foreground/70">({versionData.gitHash})</span>
                  </div>
                  <Link
                    href="/updates"
                    onClick={() => setIsMoreOpen(false)}
                    className="text-emerald-600 dark:text-emerald-400 hover:underline font-bold text-[10px]"
                  >
                    Changelog →
                  </Link>
                </div>
              </div>
            </div>

            {/* Bottom Safe Area Spacer */}
            <div className="h-6 shrink-0" />
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. FIXED MOBILE BOTTOM NAVIGATION BAR (md:hidden)                         */}
      {/* ========================================================================= */}
      <nav
        role="navigation"
        aria-label="แถบเมนูหลักผู้เช่าด้านล่าง"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 text-foreground backdrop-blur-xl border-t border-border/80 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {tabs.map((tab) => {
            const isActive = tab.isActive;

            return tab.isMore ? (
              <button
                key={tab.id}
                type="button"
                onClick={() => setIsMoreOpen(!isMoreOpen)}
                className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[58px] ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm" />
                )}

                <span className={`text-xl transition-transform block ${isActive ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
                  {isActive ? tab.activeIcon : tab.icon}
                </span>

                <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[64px] text-center leading-tight ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-muted-foreground font-medium'
                }`}>
                  {tab.label}
                </span>
              </button>
            ) : (
              <Link
                key={tab.id}
                href={tab.href!}
                className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[58px] ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
                }`}
              >
                {isActive && (
                  <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-emerald-500 to-teal-600 shadow-sm" />
                )}

                <div className="relative">
                  <span className={`text-xl transition-transform block ${isActive ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
                    {isActive ? tab.activeIcon : tab.icon}
                  </span>

                  {tab.badge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 bg-emerald-600 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-card shadow-sm animate-pulse">
                      {tab.badge > 9 ? '9+' : tab.badge}
                    </span>
                  )}
                </div>

                <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[64px] text-center leading-tight ${
                  isActive ? 'text-emerald-600 dark:text-emerald-400 font-black' : 'text-muted-foreground font-medium'
                }`}>
                  {tab.label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
