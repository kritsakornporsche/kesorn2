'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const LAB_FUNCTION_BUTTONS = [
  {
    id: 1,
    shortLabel: '1. ThaID & อายุ (DSS)',
    title: '1. Digital ID (ThaID OAuth 2.0) & แดชบอร์ดอายุผู้เช่า',
    desc: '1.1.1 รับข้อมูลชื่อ-ที่อยู่-วันเกิดคำนวณอายุ • 1.1.2 แดชบอร์ดสนับสนุนการตัดสินใจ',
    href: '/researcher/lab/digital-id',
    icon: '🇹🇭',
    badge: 'MIS / PDPA',
  },
  {
    id: 2,
    shortLabel: '2. Dynamic QR (Zero-Slip)',
    title: '2. Dynamic Bill Payment QR & อนุมัติอัตโนมัติผ่านอีเมลธนาคาร',
    desc: '2.1.1 สร้าง QR ฝังยอดเงิน (ตั้งยอดทดสอบ 1 บ. ได้) ดักจับอีเมลกรุงไทยอนุมัติทันทีไม่ต้องใช้สลิป',
    href: '/researcher/lab/dynamic-qr',
    icon: '📲',
    badge: 'Zero-Slip FinTech',
  },
  {
    id: 3,
    shortLabel: '3. 2D Digital Twin',
    title: '3. Interactive 2D Digital Twin & Multi-Layer Heatmap',
    desc: '3.1.1 แผนผังห้องพัก 20 ห้อง แสดงสถานะห้องและการใช้ไฟแบบ Heatmap',
    href: '/researcher/lab/digital-twin',
    icon: '🏢',
    badge: 'Visual MIS',
  },
  {
    id: 4,
    shortLabel: '4. IoT Smart Meter',
    title: '4. IoT Smart Meter (ห้อง 1 จริง + 2-20 จำลอง) & Auto Billing',
    desc: '4.1.1 อ่านมิเตอร์แบบ Hybrid IoT ห้อง 1 และจำลองห้อง 2-20 พร้อมออกบิลคลิกเดียว',
    href: '/researcher/lab/iot-meter',
    icon: '⚡',
    badge: 'IoT + Automation',
  },
  {
    id: 5,
    shortLabel: '5. พยากรณ์ค่าไฟล่วงหน้า',
    title: '5. Time-Series Revenue & Utility Forecasting',
    desc: '5.1.1 ระบบพยากรณ์หน่วยไฟและค่าไฟล่วงหน้าด้วยสถิติอนุกรมเวลา',
    href: '/researcher/lab/forecasting',
    icon: '📈',
    badge: 'Predictive MIS',
  },
  {
    id: 6,
    shortLabel: '6. สแกนยืนยันสัญญา SHA-256',
    title: '6. Cryptographic E-Contract & Receipt Verification',
    desc: '6.1.1 ระบบสร้างรหัส SHA-256 และสแกน QR ยืนยันความถูกต้องของสัญญาเช่า',
    href: '/researcher/lab/econtract-verify',
    icon: '🔐',
    badge: 'CyberSecurity',
  },
];

export const ResearcherLabNavBar: React.FC = () => {
  const pathname = usePathname();

  return (
    <div className="p-3 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-2">
      <div className="flex items-center justify-between px-1 flex-wrap gap-2">
        <span className="text-[11px] font-black uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
          <span>🎛️</span>
          <span>แถบปุ่มสลับแดชบอร์ดทั้ง 6 ฟังก์ชันวิจัย (Quick Function Switcher)</span>
        </span>
        <Link
          href="/researcher/lab"
          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
            pathname === '/researcher/lab'
              ? 'bg-amber-400 text-slate-950 font-black'
              : 'bg-white/5 hover:bg-white/10 text-slate-300'
          }`}
        >
          🧪 หน้าภาพรวมทั้ง 6 โมดูล
        </Link>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {LAB_FUNCTION_BUTTONS.map((btn) => {
          const active = pathname === btn.href;
          return (
            <Link
              key={btn.id}
              href={btn.href}
              className={`px-3 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all border ${
                active
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 text-white border-cyan-300/50 shadow-md shadow-cyan-500/20 font-black'
                  : 'bg-slate-950/70 hover:bg-slate-800/80 text-slate-300 border-white/10 hover:border-cyan-500/40'
              }`}
            >
              <span className="text-base shrink-0">{btn.icon}</span>
              <span className="truncate">{btn.shortLabel}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
