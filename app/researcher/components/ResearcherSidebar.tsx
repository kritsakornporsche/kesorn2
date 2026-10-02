'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface ResearcherSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const navItems = [
  {
    group: 'สถาปัตยกรรม & งานวิจัย',
    items: [
      { href: '/researcher', label: 'ภาพรวมงานวิจัย (Overview)', icon: '📊', exact: true },
      { href: '/researcher/dfd', label: 'DFD (แผนภาพกระแสข้อมูล)', icon: '🔄' },
      { href: '/researcher/er-diagram', label: 'ER Diagram (แผนภาพฐานข้อมูล)', icon: '🗄️' },
      { href: '/researcher/diagrams', label: 'Sequence Diagrams (7 แผนภาพ)', icon: '📐' },
      { href: '/researcher/use-cases', label: 'Use Case Analysis (26 เคส)', icon: '📑' },
    ],
  },
  {
    group: 'ระบบและบันทึกการพัฒนา',
    items: [
      { href: '/researcher/slip-test', label: 'ทดสอบ SlipOK (Bank Slip Sandbox)', icon: '🧾' },
      { href: '/researcher/id-scan-test', label: 'ทดสอบสแกนบัตร ปชช. & สัญญา PDF', icon: '🪪' },
      { href: '/researcher/updates', label: 'บันทึกการอัปเดต (Release Notes)', icon: '🚀' },
      { href: '/explore', label: 'หน้าสำรวจหอพัก (Public Portal)', icon: '🌐' },
    ],
  },
];

export default function ResearcherSidebar({ isOpen, onClose }: ResearcherSidebarProps) {
  const pathname = usePathname();
  const { data: session } = useSession();

  const isActive = (href: string, exact?: boolean) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const NavContent = (
    <div className="flex flex-col h-full">
      {/* User Card */}
      <div className="p-4 mx-4 mt-4 rounded-2xl bg-gradient-to-br from-cyan-950/60 to-slate-900 border border-cyan-500/20 shadow-inner">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-lg shadow-sm shrink-0">
            🔬
          </div>
          <div className="overflow-hidden">
            <h3 className="text-xs font-bold text-white truncate">
              {session?.user?.name || 'Researcher'}
            </h3>
            <p className="text-[10px] text-cyan-300 font-semibold tracking-wider uppercase truncate">
              ผู้วิจัยและวิเคราะห์ระบบ
            </p>
          </div>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 overflow-y-auto px-4 py-5 space-y-6">
        {navItems.map((section, idx) => (
          <div key={idx} className="space-y-1.5">
            <p className="px-3 text-[10px] font-black text-white/40 uppercase tracking-widest">
              {section.group}
            </p>
            <div className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all ${
                      active
                        ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-lg shadow-cyan-500/20 font-extrabold'
                        : 'text-white/70 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <span className="text-base">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* System Version Footer */}
      <div className="p-4 border-t border-white/10 bg-black/20 text-center shrink-0">
        <p className="text-[10px] font-bold text-white/40">SmartDom Thesis Framework</p>
        <p className="text-[9px] text-cyan-400/80 font-mono mt-0.5">Version 2.6.1 • Multi-Role RBAC</p>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside className="hidden md:flex flex-col w-64 bg-slate-950 border-r border-white/10 shrink-0 h-full">
        {NavContent}
      </aside>

      {/* Mobile Drawer Overlay */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 md:hidden transition-opacity"
        />
      )}

      {/* Mobile Drawer Sidebar */}
      <div
        className={`fixed inset-y-0 left-0 z-50 w-72 bg-slate-950 border-r border-white/10 flex flex-col md:hidden transition-transform duration-300 ease-in-out shadow-2xl ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="h-16 flex items-center justify-between px-6 border-b border-white/10 shrink-0">
          <span className="text-sm font-black text-white uppercase tracking-wider">เมนูงานวิจัย</span>
          <button
            onClick={onClose}
            className="p-2 text-white/60 hover:text-white rounded-lg text-lg"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-hidden">
          {NavContent}
        </div>
      </div>
    </>
  );
}
