'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import versionData from '@/lib/version.json';

interface OwnerSidebarProps {
  isOpen?: boolean;
  onClose?: () => void;
}

const navSections = [
  {
    group: 'หลัก',
    items: [
      { href: '/owner', label: 'ภาพรวม', icon: '📊', exact: true },
      { href: '/owner/bookings', label: 'รายการจองห้อง', icon: '🛎️' },
      { href: '/owner/rooms', label: 'ผังห้องพัก', icon: '🚪' },
      { href: '/owner/tenants', label: 'ทะเบียนผู้เช่า', icon: '👥' },
    ],
  },
  {
    group: 'การเงิน & สัญญา',
    items: [
      { href: '/owner/meters', label: 'จดมิเตอร์น้ำ-ไฟ', icon: '⚡' },
      { href: '/owner/billing', label: 'ออกบิล & ตรวจสลิป', icon: '💰' },
      { href: '/owner/contracts', label: 'สัญญาเช่า', icon: '📝' },
      { href: '/owner/accounting', label: 'บัญชีรายรับ-จ่าย', icon: '📈' },
    ],
  },
  {
    group: 'บริการ & อื่นๆ',
    items: [
      { href: '/owner/rules', label: 'กฎและระเบียบหอ', icon: '⚖️' },
      { href: '/owner/maintenance', label: 'แจ้งซ่อม / ทำความสะอาด', icon: '🔧' },
      { href: '/owner/chat', label: 'แชทลูกหอ', icon: '💬' },
      { href: '/owner/keepers', label: 'ทีมผู้ดูแล', icon: '🧹' },
      { href: '/owner/settings', label: 'ตั้งค่าหอพัก', icon: '⚙️' },
      { href: '/', label: 'หน้าแนะนำหอเกษร 2', icon: '🏢' },
    ],
  },
];

export default function OwnerSidebar({ isOpen, onClose }: OwnerSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [dorms, setDorms] = useState<any[]>([]);
  const [selectedDb, setSelectedDb] = useState<string | null>(null);
  const [dormName, setDormName] = useState<string | null>(null);
  const [canAddDorm, setCanAddDorm] = useState(false);

  useEffect(() => {
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
    }
  }, [session]);

  const handleDormChange = (newDb: string) => {
    localStorage.setItem('selectedDormDbName', newDb);
    setSelectedDb(newDb);
    window.location.reload();
  };

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const NavContent = (
    <div className="flex flex-col h-full bg-card text-card-foreground">
      {/* Dormitory Brand Card (Single Dorm: Kesorn 2) */}
      <div className="p-3.5 border-b border-border bg-secondary/40 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0">
            🏢
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xs font-black text-foreground truncate">
              หอพักเกษร 2
            </h3>
            <p className="text-[10px] text-muted-foreground truncate">
              ระบบจัดการหอพักเดี่ยว
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Sections */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5 scrollbar-thin">
        {navSections.map((section, sIdx) => (
          <div key={sIdx} className="space-y-0.5">
            <p className="px-2.5 text-[9px] font-bold text-muted-foreground/70 uppercase tracking-wider mb-1">
              {section.group}
            </p>
            {section.items.map((item) => {
              const active = isActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    active
                      ? 'bg-primary/15 text-primary font-bold border border-primary/30 shadow-sm'
                      : 'text-foreground/70 hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  <span className="text-sm shrink-0">{item.icon}</span>
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom Logout Button & Version */}
      <div className="p-3 border-t border-border bg-secondary/30 shrink-0 space-y-2">
        <button
          onClick={() => {
            if (typeof window !== 'undefined') {
              localStorage.removeItem('userRole');
              localStorage.removeItem('userEmail');
              localStorage.removeItem('userName');
            }
            signOut({ callbackUrl: '/' });
          }}
          className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 hover:text-rose-600 dark:text-rose-300 dark:hover:text-rose-100 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer active:scale-95 shadow-sm"
        >
          <span className="text-sm">🚪</span>
          <span>ออกจากระบบ</span>
        </button>
        <div className="pt-1.5 border-t border-border/40 flex items-center justify-between text-[10px] text-muted-foreground px-1">
          <Link href="/updates" className="hover:text-primary transition-colors flex items-center gap-1.5 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span>{versionData.shortDisplay || `v2.6.1-b${versionData.buildNumber}`}</span>
          </Link>
          <span className="text-[9px] font-mono text-muted-foreground/60">{versionData.gitHash}</span>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-card border-r border-border shrink-0 h-full overflow-hidden z-20">
        {NavContent}
      </aside>

      {/* 2. Mobile Drawer Backdrop Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 md:hidden transition-opacity"
        />
      )}

      {/* 3. Mobile Slide-out Drawer */}
      {isOpen && (
        <div
          className="fixed inset-y-0 left-0 z-50 w-72 bg-card border-r border-border flex flex-col md:hidden transition-transform duration-300 ease-in-out shadow-2xl translate-x-0"
        >
        <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0 bg-card text-card-foreground">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
              👤
            </div>
            <div className="min-w-0">
              <p className="text-xs font-bold text-foreground truncate max-w-[170px]">
                {session?.user?.name || 'Owner'}
              </p>
              <p className="text-[10px] text-muted-foreground truncate max-w-[170px]">
                {dormName || 'เจ้าของหอพัก'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-xl transition-colors text-sm cursor-pointer"
            title="ปิดเมนู"
            aria-label="ปิดเมนู"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {NavContent}
        </div>
      </div>
      )}
    </>
  );
}
