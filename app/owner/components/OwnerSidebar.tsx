'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import versionData from '@/lib/version.json';
import { isMenuItemVisible } from '@/lib/owner-only-paths';
import { recordRecentFeature } from '@/lib/recent-features';

interface OwnerSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

// New IA Sections as requested in Rule 9
const navSections = [
  {
    group: '1. การจัดการ (Management)',
    items: [
      { href: '/owner/bookings', label: 'รายการจองห้องพัก', icon: '🔔' },
      { href: '/owner/rooms', label: 'ผังห้องพัก', icon: '🚪' },
      { href: '/owner/tenants', label: 'ทะเบียนผู้เช่า', icon: '👥' },
      { href: '/owner/move-out', label: 'คำร้องขอย้ายออก', icon: '📦' },
    ],
  },
  {
    group: '2. การเงินและสัญญา (Finance & Contract)',
    items: [
      { href: '/owner/contracts', label: 'สัญญาเช่า', icon: '📝' },
      { href: '/owner/meters', label: 'จดมิเตอร์น้ำ-ไฟ', icon: '⚡' },
      { href: '/owner/billing', label: 'บิลค่าเช่ารายเดือน', icon: '💰' },
      { href: '/owner/accounting', label: 'บัญชีรายรับ-จ่าย', icon: '📈' },
      { href: '/owner/reports', label: 'รายงานหอพัก', icon: '📊' },
      { href: '/owner/risk', label: 'วิเคราะห์ความเสี่ยง', icon: '🛡️' },
    ],
  },
  {
    group: '3. บริการและระบบ (Services & Settings)',
    items: [
      { href: '/owner/chat', label: 'แชทลูกหอ', icon: '💬' },
      { href: '/owner/maintenance', label: 'แจ้งซ่อม / แม่บ้าน', icon: '🔧' },
      { href: '/owner/rules', label: 'กฎและระเบียบหอ', icon: '⚖️' },
      { href: '/owner/keepers', label: 'พนักงาน', icon: '🧹' },
      { href: '/owner/settings', label: 'ตั้งค่าหอพัก', icon: '⚙️' },
    ],
  },
];

export default function OwnerSidebar({ isOpen, onClose }: OwnerSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [badgeCounts, setBadgeCounts] = useState<{ [key: string]: number }>({});

  useEffect(() => {
    const fetchBadges = () => {
      fetch('/api/owner/stats')
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.data) {
            setBadgeCounts({
              '/owner/bookings': data.data.pendingBookings || 0,
              '/owner/billing': data.data.pendingSlips || 0,
              '/owner/maintenance': data.data.pendingMaintenance || 0,
              '/owner/contracts': data.data.expiringContracts || 0,
            });
          }
        })
        .catch(() => {});
    };
    fetchBadges();
    const interval = setInterval(fetchBadges, 12000);
    return () => clearInterval(interval);
  }, []);

  // Auto-record visited feature for "recently used"
  useEffect(() => {
    if (pathname && pathname.startsWith('/owner/') && pathname !== '/owner') {
      recordRecentFeature(pathname);
    }
  }, [pathname]);

  // Remember collapsed state in localStorage (UX Polish in Rule 11)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('owner_sidebar_collapsed');
      if (saved !== null) {
        setIsCollapsed(saved === 'true');
      }
    }
  }, []);

  const toggleCollapse = () => {
    const nextState = !isCollapsed;
    setIsCollapsed(nextState);
    if (typeof window !== 'undefined') {
      localStorage.setItem('owner_sidebar_collapsed', String(nextState));
    }
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname === href || (href !== '/owner' && pathname.startsWith(href));
  };

  const NavContent = (
    <div className="flex flex-col h-full bg-white text-slate-800 border-r border-slate-200 transition-all duration-300 select-none shadow-xs">
      {/* Clean Sidebar Top & Collapse Toggle */}
      <div className={`p-3 border-b border-slate-100 flex items-center shrink-0 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && (
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 px-1">
            เมนูหลัก
          </span>
        )}

        {/* Desktop Collapse Toggle Button */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 items-center justify-center text-xs transition-colors cursor-pointer"
          title={isCollapsed ? 'ขยายแถบเมนู (Expand)' : 'พับเก็บแถบเมนู (Collapse)'}
        >
          {isCollapsed ? '▶' : '◀'}
        </button>
      </div>

      {/* Standalone Dashboard Link (Top of sidebar) */}
      <div className="p-2 shrink-0">
        <Link
          href="/owner"
          onClick={onClose}
          className={`relative group flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-black transition-all ${
            isActive('/owner', true)
              ? 'bg-primary text-white shadow-md shadow-primary/20'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
          }`}
        >
          <span className="text-base shrink-0">📊</span>
          {!isCollapsed && <span>ภาพรวม (Dashboard)</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-white text-slate-800 text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              ภาพรวม (Dashboard)
            </div>
          )}
        </Link>
      </div>

      {/* Nav Menu Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 scrollbar-thin scrollbar-thumb-slate-200">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-500">
                {section.group}
              </p>
            )}
            {isCollapsed && <div className="h-px bg-slate-100 my-2" />}

            <div className="space-y-0.5">
              {section.items.filter((item) => isMenuItemVisible(item.href, (session?.user as any)?.role)).map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      recordRecentFeature(item.href);
                      onClose?.();
                    }}
                    className={`relative group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-primary/10 text-primary font-black shadow-xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="relative shrink-0">
                      <span className="text-base">{item.icon}</span>
                      {isCollapsed && (badgeCounts[item.href] || 0) > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-rose-600 ring-2 ring-white animate-pulse" />
                      )}
                    </div>
                    {!isCollapsed && <span className="truncate flex-1">{item.label}</span>}
                    {!isCollapsed && (badgeCounts[item.href] || 0) > 0 && (
                      <span className="min-w-[20px] h-[20px] px-1.5 rounded-full bg-rose-600 text-white font-black text-[10px] font-mono flex items-center justify-center shadow-xs animate-pulse shrink-0 ml-auto">
                        {badgeCounts[item.href]}
                      </span>
                    )}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1 bg-white text-slate-800 text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity flex items-center gap-2">
                        <span>{item.label}</span>
                        {(badgeCounts[item.href] || 0) > 0 && (
                          <span className="px-1.5 py-0.2 rounded-full bg-rose-600 text-white text-[10px] font-black">
                            {badgeCounts[item.href]}
                          </span>
                        )}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Footer & Logout */}
      <div className="p-3 border-t border-slate-100 shrink-0 space-y-2">
        <button
          onClick={() => handleSignOut()}
          className={`relative group w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-600 hover:text-white text-xs font-black border border-rose-200 transition-all ${
            isCollapsed ? 'px-2' : 'px-4'
          }`}
        >
          <span>🚪</span>
          {!isCollapsed && <span>ออกจากระบบ</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-white text-slate-800 text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-slate-200 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              ออกจากระบบ
            </div>
          )}
        </button>

        {!isCollapsed && (
          <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono px-1">
            <span>{versionData.shortDisplay || 'v2.7.0'}</span>
            <span>หอพักเกษร 2</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Sidebar (Collapsible: ~260px or ~68px) */}
      <aside
        className={`hidden lg:block h-screen sticky top-0 transition-all duration-300 z-40 ${
          isCollapsed ? 'w-[68px]' : 'w-64'
        }`}
      >
        {NavContent}
      </aside>

      {/* Mobile Drawer (Always Full on open) */}
      {isOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl z-50">
            {NavContent}
          </div>
        </div>
      )}
    </>
  );
}
