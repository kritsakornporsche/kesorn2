'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { handleSignOut } from '@/lib/auth-client';
import { useState, useEffect } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';
import KeeperBottomNav from './KeeperBottomNav';

const navItems = [
  {
    href: '/keeper/maid',
    label: 'งานแม่บ้าน / ทำความสะอาด',
    roles: ['maid', 'keeper', 'technician'],
    icon: '🧹',
  },
  {
    href: '/keeper/technician',
    label: 'งานซ่อมบำรุง / ช่าง',
    roles: ['technician', 'keeper'],
    icon: '🔧',
  },
];

export default function KeeperSidebar({ onDormChange }: { onDormChange?: (dormId: string) => void }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [mounted, setMounted] = useState(false);
  const [dorms, setDorms] = useState<any[]>([]);
  const [selectedDormId, setSelectedDormId] = useState<string>('all');

  const userSubRole = (session?.user as any)?.sub_role;

  useEffect(() => {
    setMounted(true);
    // Fetch assigned dormitories
    fetch('/api/keeper/dorms')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.dorms) {
          setDorms(data.dorms);
          const savedDorm = typeof window !== 'undefined' ? localStorage.getItem('selectedKeeperDormId') : null;
          if (savedDorm) {
            setSelectedDormId(savedDorm);
          } else if (data.dorms.length > 1) {
            const firstId = String(data.dorms[0].id);
            setSelectedDormId(firstId);
            localStorage.setItem('selectedKeeperDormId', firstId);
          }
        }
      })
      .catch(console.error);
  }, []);

  const handleSelectDorm = (dormId: string) => {
    setSelectedDormId(dormId);
    if (typeof window !== 'undefined') {
      localStorage.setItem('selectedKeeperDormId', dormId);
      window.dispatchEvent(new CustomEvent('keeperDormChanged', { detail: { dormId } }));
    }
    if (onDormChange) onDormChange(dormId);
  };

  if (!mounted) return <header className="h-16 bg-card border-b border-border shrink-0" />;

  const allowedNav = navItems.filter(item => {
    if (!userSubRole) return true;
    return item.roles.includes(userSubRole);
  });

  return (
    <>
      <header className="h-16 bg-card text-card-foreground border-b border-border flex items-center justify-between px-3 sm:px-6 shrink-0 z-40 sticky top-0 shadow-sm w-full backdrop-blur-md">
        {/* 1. Left: Brand */}
        <div className="flex items-center gap-2 sm:gap-3">
          <Link 
            href="/explore" 
            className="flex items-center gap-2.5 sm:gap-3 hover:opacity-90 transition-opacity cursor-pointer group"
            title="กลับไปหน้าสำรวจหอพัก"
          >
            <div className="h-9 w-9 sm:h-10 sm:w-10 rounded-2xl bg-gradient-to-br from-orange-500 to-red-600 flex items-center justify-center font-black text-white text-lg shadow-md border border-border group-hover:scale-105 transition-transform shrink-0">
              K
            </div>
            <div>
              <h2 className="font-bold text-sm sm:text-base tracking-tight text-foreground group-hover:text-orange-500 transition-colors leading-none">
                SmartDom
              </h2>
              <div className="hidden sm:flex items-center gap-1.5 leading-none mt-1">
                <p className="text-[9px] font-black text-orange-500 uppercase tracking-[0.15em]">Keeper Portal</p>
                <span className="text-muted-foreground text-[9px]">•</span>
                <span className="text-[9px] text-muted-foreground">
                  {userSubRole === 'maid' ? 'แม่บ้าน' : userSubRole === 'technician' ? 'ช่างซ่อม' : 'ผู้ดูแล'}
                </span>
              </div>
            </div>
          </Link>
        </div>

        {/* 2. Center: Multi-Dormitory Switcher Dropdown */}
        <div className="flex items-center gap-2 sm:gap-3">
          {dorms.length > 0 && (
            <div className="relative flex items-center bg-secondary/80 border border-border rounded-xl px-2.5 sm:px-3 py-1.5 hover:border-orange-500/50 transition-colors">
              <span className="text-xs sm:text-sm mr-1 sm:mr-2">🏢</span>
              <select
                id="keeper-dorm-switcher"
                value={selectedDormId}
                onChange={(e) => handleSelectDorm(e.target.value)}
                className="bg-transparent text-xs font-bold text-foreground focus:outline-none cursor-pointer appearance-none pr-5 max-w-[120px] sm:max-w-[180px] truncate"
              >
                <option value="all" className="bg-card text-foreground">ทุกหอพัก ({dorms.length})</option>
                {dorms.map(d => (
                  <option key={d.id} value={String(d.id)} className="bg-card text-foreground">
                    {d.dorm_name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-[8px]">
                ▼
              </div>
            </div>
          )}

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-2">
            {allowedNav.map((item) => {
              const isActive = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 border shadow-sm ${
                    isActive
                      ? 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
                      : 'bg-secondary hover:bg-secondary/80 text-foreground border-border'
                  }`}
                >
                  <span>{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </div>

          <ThemeToggle />

          {/* User Info (Desktop) */}
          <div className="text-right hidden sm:block pl-2 border-l border-border">
            <p className="text-sm font-bold text-foreground">{session?.user?.name || 'Keeper'}</p>
            <p className="text-xs text-orange-500 font-medium">
              {userSubRole === 'maid' ? 'แม่บ้าน' : userSubRole === 'technician' ? 'ช่างซ่อม' : 'ผู้ดูแล'}
            </p>
          </div>

          {/* Desktop Sign Out */}
          <button
            type="button"
            onClick={() => handleSignOut('/')}
            className="hidden md:flex h-9 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-600 dark:text-rose-300 hover:text-rose-700 dark:hover:text-rose-100 border border-rose-500/30 transition-all items-center gap-1.5 text-xs font-bold shadow-sm cursor-pointer active:scale-95 shrink-0"
            title="ออกจากระบบ"
          >
            <span>🚪</span>
            <span>ออกจากระบบ</span>
          </button>
        </div>
      </header>

      {/* Mobile Bottom Navigation */}
      <KeeperBottomNav
        dorms={dorms}
        selectedDormId={selectedDormId}
        onSelectDorm={handleSelectDorm}
      />
    </>
  );
}
