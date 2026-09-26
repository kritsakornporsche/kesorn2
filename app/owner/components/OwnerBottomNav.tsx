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
  highlight?: boolean;
}

interface NavCategory {
  id: string;
  label: string;
  icon: string;
  activeIcon: string;
  directHref?: string;
  matchPaths: string[];
  subActions?: SubAction[];
}

export default function OwnerBottomNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [activeSheet, setActiveSheet] = useState<string | null>(null);
  const [unreadChatCount, setUnreadChatCount] = useState<number>(0);
  const [dorms, setDorms] = useState<any[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [canAddDorm, setCanAddDorm] = useState(false);

  // 1. Fetch unread chat count & dorms info for badge indicators
  useEffect(() => {
    if (!session) return;

    const fetchBadges = () => {
      // Unread chat messages
      fetch('/api/chat/conversations')
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.data)) {
            const count = data.data.reduce((sum: number, c: any) => sum + (Number(c.unread_count) || 0), 0);
            setUnreadChatCount(count);
          }
        })
        .catch(() => {});

      // Dorms info
      const email = session.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null);
      if (email) {
        const savedDb = typeof window !== 'undefined' ? localStorage.getItem('selectedDormDbName') : null;
        fetch(`/api/owner/onboarding?email=${encodeURIComponent(email)}${savedDb ? `&dormDbName=${savedDb}` : ''}`)
          .then(res => res.json())
          .then(data => {
            if (data.success) {
              setDorms(data.dorms || []);
              setCanAddDorm(data.canAddDorm);
              setSelectedDb(data.dormDbName);
            }
          })
          .catch(() => {});
      }
    };

    fetchBadges();
    const interval = setInterval(fetchBadges, 12000);

    const handleChatUpdate = (e: any) => {
      if (typeof e.detail?.count === 'number') {
        setUnreadChatCount(e.detail.count);
      } else {
        fetchBadges();
      }
    };
    window.addEventListener('chat-unread-updated', handleChatUpdate);

    return () => {
      clearInterval(interval);
      window.removeEventListener('chat-unread-updated', handleChatUpdate);
    };
  }, [session]);

  const handleDormChange = (newDb: string) => {
    localStorage.setItem('selectedDormDbName', newDb);
    setSelectedDb(newDb);
    setActiveSheet(null);
    window.location.reload();
  };

  // Close sheet on route change
  useEffect(() => {
    setActiveSheet(null);
  }, [pathname]);

  // Lock body scroll when bottom sheet is open
  useEffect(() => {
    if (activeSheet) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [activeSheet]);

  // Define the 5 Primary Navigation Pillars
  const categories: NavCategory[] = [
    {
      id: 'overview',
      label: 'ภาพรวม',
      icon: '📊',
      activeIcon: '📈',
      directHref: '/owner',
      matchPaths: ['/owner'],
    },
    {
      id: 'rooms_tenants',
      label: 'ห้อง & ผู้เช่า',
      icon: '🚪',
      activeIcon: '🏢',
      matchPaths: ['/owner/rooms', '/owner/tenants', '/owner/bookings'],
      subActions: [
        {
          href: '/owner/rooms',
          label: 'ผังห้องพัก',
          sublabel: 'ดูสถานะห้องว่าง จอง เข้าพัก และปรับปรุงผังห้อง',
          icon: '🚪',
        },
        {
          href: '/owner/tenants',
          label: 'ทะเบียนผู้เช่า',
          sublabel: 'ข้อมูลผู้พัก เบอร์ติดต่อ และประวัติการอยู่อาศัย',
          icon: '👥',
        },
        {
          href: '/owner/bookings',
          label: 'รายการจองห้อง',
          sublabel: 'ตรวจสอบคำขอจองห้องพักใหม่และสลิปมัดจำ',
          icon: '🛎️',
        },
      ],
    },
    {
      id: 'finance_contracts',
      label: 'การเงิน & สัญญา',
      icon: '💰',
      activeIcon: '💳',
      matchPaths: ['/owner/meters', '/owner/billing', '/owner/contracts', '/owner/accounting'],
      subActions: [
        {
          href: '/owner/meters',
          label: 'จดมิเตอร์น้ำ-ไฟ',
          sublabel: 'ถ่ายรูปอ่านมิเตอร์ AI หรือบันทึกเลขหน่วยรายเดือน',
          icon: '⚡',
          highlight: true,
        },
        {
          href: '/owner/billing',
          label: 'ออกบิล & ตรวจสลิป',
          sublabel: 'คำนวณบิลรายเดือน ตรวจสอบสลิปโอนเงิน',
          icon: '🧾',
        },
        {
          href: '/owner/contracts',
          label: 'สัญญาเช่า',
          sublabel: 'จัดทำสัญญา รออนุมัติ และต่ออายุสัญญา',
          icon: '📝',
        },
        {
          href: '/owner/accounting',
          label: 'บัญชีรายรับ-จ่าย',
          sublabel: 'บันทึกกระแสเงินสด สรุปผลประกอบการหอพัก',
          icon: '📈',
        },
      ],
    },
    {
      id: 'services',
      label: 'บริการ & ซ่อม',
      icon: '🔧',
      activeIcon: '🛠️',
      matchPaths: ['/owner/maintenance', '/owner/chat', '/owner/keepers'],
      subActions: [
        {
          href: '/owner/maintenance',
          label: 'แจ้งซ่อมบำรุง',
          sublabel: 'ติดตามงานแจ้งซ่อม มอบหมายงานให้ช่าง',
          icon: '🔧',
        },
        {
          href: '/owner/chat',
          label: 'แชทติดต่อลูกหอ',
          sublabel: 'สนทนาสอบถามกับผู้เช่าและผู้ดูแลแบบเรียลไทม์',
          icon: '💬',
          badge: unreadChatCount > 0 ? `${unreadChatCount} ข้อความใหม่` : undefined,
          highlight: unreadChatCount > 0,
        },
        {
          href: '/owner/keepers',
          label: 'ทีมผู้ดูแลหอพัก',
          sublabel: 'จัดการแม่บ้าน ช่างซ่อม และมอบหมายงาน',
          icon: '🧹',
        },
      ],
    },
    {
      id: 'more',
      label: 'จัดการ',
      icon: '⚙️',
      activeIcon: '✨',
      matchPaths: ['/owner/rules', '/owner/settings'],
      subActions: [
        {
          href: '/owner/rules',
          label: 'กฎและระเบียบหอพัก',
          sublabel: 'กำหนดข้อบังคับ อัตราค่าปรับ และคัดลอกระเบียบ',
          icon: '⚖️',
        },
        {
          href: '/owner/settings',
          label: 'ตั้งค่าหอพัก',
          sublabel: 'กำหนดค่าน้ำ ค่าไฟ บัญชีธนาคาร และข้อมูลหอ',
          icon: '⚙️',
        },
        {
          href: '/',
          label: 'แนะนำหอเกษร 2',
          sublabel: 'ดูข้อมูล แผนที่ ห้องพักว่าง และสิ่งอำนวยความสะดวก',
          icon: '🏢',
        },
      ],
    },
  ];

  // Helper to check if a category is active based on current pathname
  const isCategoryActive = (category: NavCategory) => {
    if (category.directHref && pathname === category.directHref) return true;
    return category.matchPaths.some(p => pathname.startsWith(p));
  };

  const handleTabClick = (category: NavCategory) => {
    if (category.directHref) {
      setActiveSheet(null);
      router.push(category.directHref);
    } else {
      // Toggle or switch active bottom sheet
      setActiveSheet(prev => (prev === category.id ? null : category.id));
    }
  };

  const currentSheetCategory = categories.find(c => c.id === activeSheet);

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. INTERACTIVE ACTION SHEET MODAL (Modern Bottom Sheet / Selection Hub)   */}
      {/* ========================================================================= */}
      {currentSheetCategory && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop Blur Overlay */}
          <div
            onClick={() => setActiveSheet(null)}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          />

          {/* Action Sheet Panel */}
          <div className="relative z-10 w-full bg-card text-foreground rounded-t-[2rem] border-t border-border shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-250">
            {/* Grab Handle */}
            <div className="w-12 h-1.5 bg-muted-foreground/30 rounded-full mx-auto mt-3 mb-1 shrink-0" />

            {/* Sheet Header */}
            <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-card/80 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center text-lg shadow-inner">
                  {currentSheetCategory.icon}
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground tracking-tight leading-none">
                    {currentSheetCategory.label}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                    เลือกระบบย่อยที่ต้องการดำเนินการ
                  </p>
                </div>
              </div>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors active:scale-95 cursor-pointer"
                aria-label="ปิดเมนู"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Sheet Body (Sub-actions Card Grid) */}
            <div className="p-4 overflow-y-auto space-y-2.5">
              {/* If Category is "จัดการ", show Dorm Switcher inside sheet */}
              {currentSheetCategory.id === 'more' && (
                <div className="p-3.5 bg-secondary/50 rounded-2xl border border-border space-y-2 mb-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>🏢</span> หอพักที่กำลังดูแล
                    </span>
                    {canAddDorm && (
                      <Link
                        href="/owner/onboarding?force=true"
                        onClick={() => setActiveSheet(null)}
                        className="text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-md hover:bg-amber-500/20"
                      >
                        + เพิ่มหอพัก
                      </Link>
                    )}
                  </div>
                  {dorms.length > 0 && (
                    <select
                      value={selectedDb || ''}
                      onChange={(e) => handleDormChange(e.target.value)}
                      className="w-full bg-card text-foreground border border-border rounded-xl px-3 py-2 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-primary shadow-sm cursor-pointer"
                    >
                      {dorms.map((d: any) => (
                        <option key={d.db_name} value={d.db_name}>
                          {d.dorm_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Sub-Actions Cards (AIO Insurance Style) */}
              <div className="grid grid-cols-1 gap-2.5">
                {currentSheetCategory.subActions?.map((sub) => {
                  const isCurrent = pathname.startsWith(sub.href);
                  return (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      onClick={() => setActiveSheet(null)}
                      className={`group p-3.5 rounded-2xl border transition-all flex items-center gap-3.5 active:scale-[0.98] ${
                        isCurrent
                          ? 'bg-primary/10 border-primary/40 shadow-sm'
                          : 'bg-card hover:bg-secondary/60 border-border/80'
                      }`}
                    >
                      {/* Icon Box */}
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center text-2xl shrink-0 transition-transform group-hover:scale-105 shadow-sm ${
                        isCurrent
                          ? 'bg-gradient-to-tr from-purple-700 to-indigo-600 text-white shadow-purple-600/25'
                          : sub.highlight
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                          : 'bg-secondary text-foreground'
                      }`}>
                        {sub.icon}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1.5 mb-0.5">
                          <h4 className={`text-sm tracking-tight ${
                            isCurrent ? 'font-black text-primary' : 'font-bold text-foreground'
                          }`}>
                            {sub.label}
                          </h4>
                          {sub.badge && (
                            <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-purple-600 text-white animate-pulse shrink-0">
                              {sub.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground line-clamp-1 font-medium">
                          {sub.sublabel}
                        </p>
                      </div>

                      {/* Chevron Arrow */}
                      <div className="text-muted-foreground/60 group-hover:text-foreground shrink-0 transition-transform group-hover:translate-x-0.5">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Extra sign out button & version in Management category */}
              {currentSheetCategory.id === 'more' && (
                <div className="space-y-2 mt-2">
                  <button
                    type="button"
                    onClick={() => signOut({ callbackUrl: '/signin' })}
                    className="w-full p-3.5 rounded-2xl bg-rose-500/10 hover:bg-rose-500/15 border border-rose-500/25 text-rose-600 dark:text-rose-400 font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-[0.98] cursor-pointer"
                  >
                    <span>🚪</span>
                    <span>ออกจากระบบ (Sign Out)</span>
                  </button>

                  <div className="pt-2.5 pb-1 border-t border-border/50 flex items-center justify-between text-[11px] text-muted-foreground font-medium px-2">
                    <Link
                      href="/updates"
                      onClick={() => setActiveSheet(null)}
                      className="flex items-center gap-1.5 hover:text-primary transition-colors font-mono"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span className="font-bold text-foreground">{versionData.shortDisplay || `v2.6.1-b${versionData.buildNumber}`}</span>
                      <span className="text-[10px] text-muted-foreground/70">({versionData.gitHash})</span>
                    </Link>
                    <Link
                      href="/updates"
                      onClick={() => setActiveSheet(null)}
                      className="text-primary hover:underline font-bold text-[10px]"
                    >
                      Changelog →
                    </Link>
                  </div>
                </div>
              )}
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
        aria-label="แถบเมนูหลักด้านล่าง"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 text-foreground backdrop-blur-xl border-t border-border/80 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {categories.map((cat) => {
            const isActive = isCategoryActive(cat);
            const isSheetOpen = activeSheet === cat.id;

            // Badges
            const hasChatBadge = cat.id === 'services' && unreadChatCount > 0;

            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => handleTabClick(cat)}
                className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[58px] ${
                  isActive || isSheetOpen
                    ? 'text-primary font-black'
                    : 'text-muted-foreground/80 hover:text-foreground font-semibold'
                }`}
              >
                {/* Active Pill Indicator on Top */}
                {(isActive || isSheetOpen) && (
                  <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 shadow-sm" />
                )}

                {/* Icon with subtle scale & glow when active */}
                <div className="relative">
                  <span className={`text-xl transition-transform block ${
                    isActive || isSheetOpen ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'
                  }`}>
                    {isActive || isSheetOpen ? cat.activeIcon : cat.icon}
                  </span>

                  {/* Red / Purple Unread Dot or Badge */}
                  {hasChatBadge && (
                    <span className="absolute -top-1 -right-2 min-w-[16px] h-4 px-1 bg-purple-600 text-white text-[9px] font-black rounded-full flex items-center justify-center ring-2 ring-card shadow-sm animate-pulse">
                      {unreadChatCount > 9 ? '9+' : unreadChatCount}
                    </span>
                  )}
                </div>

                {/* Text Label */}
                <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[64px] text-center leading-tight ${
                  isActive || isSheetOpen ? 'text-primary font-black' : 'text-muted-foreground font-medium'
                }`}>
                  {cat.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
