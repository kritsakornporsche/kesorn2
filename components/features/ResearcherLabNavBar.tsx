'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const LAB_FUNCTION_BUTTONS = [
  { id: -1, label: 'หน้าหลัก', href: '/', icon: '🏠' },
  { id: 0, label: 'แดชบอร์ด', href: '/researcher', icon: '📊' },
  { id: 7, label: 'เทสเคส 20 ห้อง', href: '/researcher/lab/test-cases', icon: '🧪' },
  { id: 3, label: 'Digital Twin', href: '/researcher/lab/digital-twin', icon: '🏢' },
  { id: 4, label: 'Smart Meter', href: '/researcher/lab/iot-meter', icon: '⚡' },
  { id: 2, label: 'Dynamic QR', href: '/researcher/lab/dynamic-qr', icon: '📲' },
  { id: 8, label: 'จดมิเตอร์ Auto-Pull', href: '/owner/billing/record', icon: '🧾' },
  { id: 9, label: 'มิเตอร์หอพัก', href: '/owner/meters', icon: '📈' },
  { id: 10, label: 'วิเคราะห์ความเสี่ยง', href: '/researcher/lab/risk', icon: '🛡️' },
];

export const ResearcherLabNavBar: React.FC = () => {
  const pathname = usePathname();

  return (
    <nav className="p-1.5 rounded-2xl bg-white/95 border border-slate-200 shadow-xs backdrop-blur-md flex items-center justify-between gap-1 overflow-x-auto scrollbar-none">
      <div className="flex items-center gap-1 w-full justify-between">
        {LAB_FUNCTION_BUTTONS.map((btn) => {
          const active = pathname === btn.href;
          return (
            <Link
              key={btn.id}
              href={btn.href}
              className={`flex-1 min-w-[95px] py-2 px-2 sm:px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all text-center whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-blue-600 text-white font-black shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <span className="text-sm shrink-0">{btn.icon}</span>
              <span>{btn.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
};
