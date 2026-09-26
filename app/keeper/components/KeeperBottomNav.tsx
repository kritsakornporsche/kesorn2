'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import versionData from '@/lib/version.json';

interface KeeperBottomNavProps {
  dorms?: any[];
  selectedDormId?: string;
  onSelectDorm?: (dormId: string) => void;
}

export default function KeeperBottomNav({ dorms = [], selectedDormId = 'all', onSelectDorm }: KeeperBottomNavProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const [activeSheet, setActiveSheet] = useState<'dorm' | 'more' | null>(null);

  // Close sheet on route change
  useEffect(() => {
    setActiveSheet(null);
  }, [pathname]);

  // Lock body scroll when sheet is open
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

  const userSubRole = (session?.user as any)?.sub_role;

  const handleDormPick = (dormId: string) => {
    if (onSelectDorm) {
      onSelectDorm(dormId);
    }
    setActiveSheet(null);
  };

  const isMaidActive = pathname.startsWith('/keeper/maid');
  const isTechActive = pathname.startsWith('/keeper/technician');

  return (
    <>
      {/* ========================================================================= */}
      {/* 1. INTERACTIVE ACTION SHEET (Dorm Switcher or More Menu)                   */}
      {/* ========================================================================= */}
      {activeSheet && (
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

            {/* Header */}
            <div className="px-5 py-3 border-b border-border/60 flex items-center justify-between shrink-0 bg-card/80 backdrop-blur-md">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-400 flex items-center justify-center text-lg shadow-inner">
                  {activeSheet === 'dorm' ? '🏢' : '⚙️'}
                </div>
                <div>
                  <h3 className="text-base font-black text-foreground tracking-tight leading-none">
                    {activeSheet === 'dorm' ? 'เลือกหอพักที่ต้องการดูแล' : 'จัดการ & ข้อมูลผู้ดูแล'}
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5 font-medium">
                    {activeSheet === 'dorm' ? 'กรองงานทำความสะอาดและงานซ่อมตามหอพัก' : 'ข้อมูลส่วนตัวและออกจากระบบ'}
                  </p>
                </div>
              </div>

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

            {/* Body */}
            <div className="p-4 overflow-y-auto space-y-2.5">
              {activeSheet === 'dorm' ? (
                /* Dorm Switcher Cards */
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => handleDormPick('all')}
                    className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                      selectedDormId === 'all'
                        ? 'bg-orange-500/10 border-orange-500/40 shadow-sm'
                        : 'bg-card hover:bg-secondary/60 border-border/80'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl">
                        🌐
                      </div>
                      <div>
                        <h4 className={`text-sm tracking-tight ${selectedDormId === 'all' ? 'font-black text-orange-600 dark:text-orange-400' : 'font-bold text-foreground'}`}>
                          ทุกหอพักที่ดูแล
                        </h4>
                        <p className="text-[11px] text-muted-foreground">แสดงงานจากทั้งหมด {dorms.length} หอพัก</p>
                      </div>
                    </div>
                    {selectedDormId === 'all' && <span className="text-orange-500 font-black text-sm">✓</span>}
                  </button>

                  {dorms.map(d => {
                    const isSelected = String(d.id) === selectedDormId;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => handleDormPick(String(d.id))}
                        className={`w-full p-3.5 rounded-2xl border text-left flex items-center justify-between transition-all active:scale-[0.98] ${
                          isSelected
                            ? 'bg-orange-500/10 border-orange-500/40 shadow-sm'
                            : 'bg-card hover:bg-secondary/60 border-border/80'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center text-xl">
                            🏢
                          </div>
                          <div>
                            <h4 className={`text-sm tracking-tight ${isSelected ? 'font-black text-orange-600 dark:text-orange-400' : 'font-bold text-foreground'}`}>
                              {d.dorm_name}
                            </h4>
                            <p className="text-[11px] text-muted-foreground">หอพักเครือข่าย SmartDom</p>
                          </div>
                        </div>
                        {isSelected && <span className="text-orange-500 font-black text-sm">✓</span>}
                      </button>
                    );
                  })}
                </div>
              ) : (
                /* More Menu Content */
                <div className="space-y-3">
                  <div className="p-4 bg-secondary/40 rounded-2xl border border-border flex items-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-orange-500/15 text-orange-600 dark:text-orange-400 font-black text-xl flex items-center justify-center">
                      {(session?.user?.name || 'K').charAt(0)}
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-foreground">{session?.user?.name || 'ผู้ดูแลหอพัก'}</h4>
                      <p className="text-[11px] text-muted-foreground font-medium">
                        {userSubRole === 'maid' ? '🧹 แม่บ้านประจำหอพัก' : userSubRole === 'technician' ? '🔧 ช่างซ่อมบำรุง' : '🛠️ ผู้ดูแล'}
                      </p>
                    </div>
                  </div>

                  <Link
                    href="/explore"
                    onClick={() => setActiveSheet(null)}
                    className="p-3.5 bg-card hover:bg-secondary/60 rounded-2xl border border-border flex items-center justify-between active:scale-[0.98] transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-xl">🌐</span>
                      <div>
                        <h4 className="text-sm font-bold text-foreground">หน้าสำรวจหอพักทั่วไป</h4>
                        <p className="text-[11px] text-muted-foreground">ดูมุมมองหน้าเว็บภายนอก</p>
                      </div>
                    </div>
                    <span className="text-muted-foreground text-sm">→</span>
                  </Link>

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
                      onClick={() => setActiveSheet(null)}
                      className="text-orange-600 dark:text-orange-400 hover:underline font-bold text-[10px]"
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
        aria-label="แถบเมนูหลักผู้ดูแลด้านล่าง"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card/95 text-foreground backdrop-blur-xl border-t border-border/80 shadow-[0_-8px_30px_rgba(0,0,0,0.12)] px-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-1.5"
      >
        <div className="flex items-center justify-around max-w-lg mx-auto">
          {/* 1. งานแม่บ้าน */}
          <Link
            href="/keeper/maid"
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[62px] ${
              isMaidActive ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
            }`}
          >
            {isMaidActive && (
              <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm" />
            )}
            <span className={`text-xl transition-transform block ${isMaidActive ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
              🧹
            </span>
            <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[68px] text-center leading-tight ${
              isMaidActive ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground font-medium'
            }`}>
              งานแม่บ้าน
            </span>
          </Link>

          {/* 2. งานซ่อมบำรุง */}
          <Link
            href="/keeper/technician"
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[62px] ${
              isTechActive ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
            }`}
          >
            {isTechActive && (
              <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm" />
            )}
            <span className={`text-xl transition-transform block ${isTechActive ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
              🔧
            </span>
            <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[68px] text-center leading-tight ${
              isTechActive ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground font-medium'
            }`}>
              งานซ่อม
            </span>
          </Link>

          {/* 3. สลับหอพัก */}
          <button
            type="button"
            onClick={() => setActiveSheet(activeSheet === 'dorm' ? null : 'dorm')}
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[62px] ${
              activeSheet === 'dorm' ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
            }`}
          >
            {activeSheet === 'dorm' && (
              <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm" />
            )}
            <span className={`text-xl transition-transform block ${activeSheet === 'dorm' ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
              🏢
            </span>
            <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[68px] text-center leading-tight ${
              activeSheet === 'dorm' ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground font-medium'
            }`}>
              สลับหอพัก
            </span>
          </button>

          {/* 4. จัดการ */}
          <button
            type="button"
            onClick={() => setActiveSheet(activeSheet === 'more' ? null : 'more')}
            className={`relative flex flex-col items-center justify-center py-1 px-2 rounded-2xl transition-all select-none active:scale-90 cursor-pointer min-w-[62px] ${
              activeSheet === 'more' ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground/80 hover:text-foreground font-semibold'
            }`}
          >
            {activeSheet === 'more' && (
              <span className="absolute -top-1.5 w-6 h-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 shadow-sm" />
            )}
            <span className={`text-xl transition-transform block ${activeSheet === 'more' ? 'scale-115 -translate-y-0.5' : 'grayscale-25 opacity-85'}`}>
              ⚙️
            </span>
            <span className={`text-[10px] tracking-tight mt-0.5 truncate max-w-[68px] text-center leading-tight ${
              activeSheet === 'more' ? 'text-orange-600 dark:text-orange-400 font-black' : 'text-muted-foreground font-medium'
            }`}>
              จัดการ
            </span>
          </button>
        </div>
      </nav>
    </>
  );
}
