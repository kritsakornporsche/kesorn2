'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import versionData from '@/lib/version.json';

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
    ],
  },
  {
    group: '3. บริการและระบบ (Services & Settings)',
    items: [
      { href: '/owner/chat', label: 'แชทลูกหอ', icon: '💬' },
      { href: '/owner/maintenance', label: 'แจ้งซ่อม / แม่บ้าน', icon: '🔧' },
      { href: '/owner/rules', label: 'กฎและระเบียบหอ', icon: '⚖️' },
      { href: '/owner/keepers', label: 'ทีมผู้ดูแล', icon: '🧹' },
      { href: '/owner/settings', label: 'ตั้งค่าหอพัก', icon: '⚙️' },
    ],
  },
];

export default function OwnerSidebar({ isOpen, onClose }: OwnerSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [isCollapsed, setIsCollapsed] = useState(false);

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
    <div className="flex flex-col h-full bg-slate-900 text-slate-100 border-r border-white/10 transition-all duration-300 select-none">
      {/* Brand Header */}
      <div className="p-3.5 border-b border-white/10 flex items-center justify-between shrink-0">
        {!isCollapsed ? (
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-sm shrink-0">
              🏢
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-black text-white truncate">หอพักเกษร 2</h3>
              <p className="text-[10px] text-slate-400 truncate">ระบบจัดการหอพักเดี่ยว</p>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-xl bg-primary/20 text-primary border border-primary/40 flex items-center justify-center font-bold text-sm mx-auto">
            🏢
          </div>
        )}

        {/* Desktop Collapse Toggle Button */}
        <button
          onClick={toggleCollapse}
          className="hidden lg:flex w-7 h-7 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white items-center justify-center text-xs transition-colors cursor-pointer"
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
              ? 'bg-primary text-white shadow-lg shadow-primary/20'
              : 'text-slate-300 hover:bg-white/5 hover:text-white'
          }`}
        >
          <span className="text-base shrink-0">📊</span>
          {!isCollapsed && <span>ภาพรวม (Dashboard)</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-950 text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              ภาพรวม (Dashboard)
            </div>
          )}
        </Link>
      </div>

      {/* Nav Menu Groups */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-4 scrollbar-thin scrollbar-thumb-white/10">
        {navSections.map((section, idx) => (
          <div key={idx} className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 text-[10px] font-black uppercase tracking-wider text-slate-400">
                {section.group}
              </p>
            )}
            {isCollapsed && <div className="h-px bg-white/5 my-2" />}

            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`relative group flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-primary/20 text-primary border border-primary/40 shadow-sm'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-base shrink-0">{item.icon}</span>
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {isCollapsed && (
                      <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-950 text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
                        {item.label}
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
      <div className="p-3 border-t border-white/10 shrink-0 space-y-2">
        <button
          onClick={() => handleSignOut()}
          className={`relative group w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 text-rose-400 hover:text-white text-xs font-black border border-rose-500/20 transition-all ${
            isCollapsed ? 'px-2' : 'px-4'
          }`}
        >
          <span>🚪</span>
          {!isCollapsed && <span>ออกจากระบบ</span>}
          {isCollapsed && (
            <div className="absolute left-full ml-3 px-2.5 py-1 bg-slate-950 text-white text-[11px] font-bold rounded-lg whitespace-nowrap shadow-xl border border-white/10 opacity-0 group-hover:opacity-100 pointer-events-none z-50 transition-opacity">
              ออกจากระบบ
            </div>
          )}
        </button>

        {!isCollapsed && (
          <div className="flex items-center justify-between text-[9px] text-slate-400 font-mono px-1">
            <span>v{versionData.version}</span>
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
