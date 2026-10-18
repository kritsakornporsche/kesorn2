'use client';

import React from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';

const RESEARCH_MODULES = [
  {
    id: 1,
    code: 'MOD-01',
    title: 'Digital ID (ThaID OAuth 2.0 / D.DOPA OpenID Simulation)',
    subtitle: 'ยืนยันตัวตนผ่านแอป ThaID คำนวณอายุอัตโนมัติ และแดชบอร์ดสนับสนุนการตัดสินใจ (DSS)',
    href: '/researcher/lab/digital-id',
    icon: '🇹🇭',
    status: 'พร้อมใช้งาน & พัฒนาต่อยอด',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '1.1.1 เปิดแอป ThaID รับข้อมูล ชื่อ-นามสกุล, ที่อยู่ตามทะเบียนราษฎร์ และวันเกิดเพื่อคำนวณอายุอัตโนมัติ (PDPA Zero-ID)',
      '1.1.2 นำข้อมูลอายุและภูมิลำเนาของผู้เช่าไปสร้างแดชบอร์ดสนับสนุนการตัดสินใจ (Demographic DSS Dashboard)',
    ],
    plugInTarget: 'หน้าจองห้องพัก (/explore/room/[id]), หน้า Walk-in, และหน้า MIS ผู้บริหาร (/owner)',
  },
  {
    id: 2,
    code: 'MOD-02',
    title: 'Dynamic Bill Payment QR & ระบบอนุมัติอัตโนมัติผ่านอีเมลธนาคาร (Zero-Slip)',
    subtitle: 'สร้าง EMVCo Dynamic PromptPay QR (063-604-0550) และดักจับยอดเงินเข้าจากอีเมลธนาคารกรุงไทยอนุมัติทันที',
    href: '/researcher/lab/dynamic-qr',
    icon: '📲',
    status: 'พร้อมใช้งาน & ทดสอบได้ทันที',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '2.1.1 สร้าง QR Code ฝังยอดเงินรายบิล (ตั้งยอดทดสอบ 1 บาทได้) และดักจับยอดเงินเข้าจากอีเมลธนาคารกรุงไทย (kritsakorn801@gmail.com) อนุมัติอัตโนมัติโดยไม่ต้องอัปโหลดสลิป',
    ],
    plugInTarget: 'หน้าชำระบิลลูกหอ (/tenant/billing) และหน้าตรวจสอบการเงิน (/owner/billing)',
  },
  {
    id: 3,
    code: 'MOD-03',
    title: 'Interactive 2D Digital Twin & Multi-Layer Heatmap + Web Push',
    subtitle: 'แผนผังจำลองอาคาร 2 มิติ (20 ห้อง 2 ชั้น ชั้นละ 10 ห้อง) แสดงสถานะห้องพัก Heatmap 4 มิติ และแจ้งเตือน Web Push',
    href: '/researcher/lab/digital-twin',
    icon: '🏢',
    status: 'พร้อมใช้งาน & ทดสอบได้ทันที',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '3.1.1 แผนผังห้องพัก 2 มิติ (ชั้น 1: 101–110, ชั้น 2: 201–210) สลับเลเยอร์สีตามหน่วยไฟ, สถานะบิล, สถานะห้องพัก และงานซ่อม พร้อมระบบแจ้งเตือน Web Push เฉพาะ Researcher',
    ],
    plugInTarget: 'หน้าจัดการห้องพัก (/owner/rooms) และหน้าแดชบอร์ดผู้บริหาร (/owner)',
  },
  {
    id: 4,
    code: 'MOD-04',
    title: 'IoT Smart Meter Simulator + One-Click Auto Billing Pipeline',
    subtitle: 'ระบบอ่านค่ามิเตอร์ไฟฟ้าแบบ Hybrid (ห้อง 101 เชื่อมต่อ ESP32 จริง + ห้อง 102–210 จำลองอัจฉริยะ) สั่งตัด/ต่อไฟระยะไกล และออกบิลอัตโนมัติ',
    href: '/researcher/lab/iot-meter',
    icon: '⚡',
    status: 'พร้อมใช้งาน & ทดสอบได้ทันที',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '4.1.1 ระบบ IoT อ่านค่ามิเตอร์ไฟฟ้า Hybrid + ศูนย์สั่งการ ESP32 ระยะไกล + โค้ดสคริปต์ .ino พร้อมแฟลช และปุ่มออกบิลทั้งตึกในคลิกเดียว',
    ],
    plugInTarget: 'หน้าจดมิเตอร์และออกบิลรายเดือน (/owner/meters & /owner/billing)',
  },
  {
    id: 5,
    code: 'MOD-05',
    title: 'Time-Series Revenue & Utility Forecasting',
    subtitle: 'ระบบพยากรณ์หน่วยการใช้ไฟฟ้าและค่าไฟล่วงหน้าด้วยสถิติอนุกรมเวลา (WMA + Holt Linear Trend + Seasonal Index)',
    href: '/researcher/lab/forecasting',
    icon: '📈',
    status: 'พร้อมใช้งาน & ทดสอบได้ทันที',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '5.1.1 ระบบพยากรณ์ค่าไฟล่วงหน้า 1–3 เดือน (รายห้องและภาพรวมทั้ง 20 ห้อง) พร้อมแจ้งเตือน Web Push ห้องที่เสี่ยงค่าไฟพุ่งเกินเกณฑ์',
    ],
    plugInTarget: 'หน้ารายงานวิเคราะห์ผู้บริหาร (/owner/reports) และหน้าแดชบอร์ดลูกหอ (/tenant)',
  },
  {
    id: 6,
    code: 'MOD-06',
    title: 'Cryptographic E-Contract & Receipt Verification (SHA-256)',
    subtitle: 'ระบบสร้างรหัสรับรองดิจิทัล SHA-256 และสแกน QR ยืนยันความถูกต้องของสัญญาเช่า/ใบเสร็จ',
    href: '/researcher/lab/econtract-verify',
    icon: '🔐',
    status: 'พร้อมใช้งาน & ทดสอบได้ทันที',
    statusColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    subItems: [
      '6.1.1 ระบบสร้างลายเซ็นดิจิทัล SHA-256 & HMAC-SHA256 ลงในสัญญาเช่าและใบเสร็จ พร้อมเครื่องสแกนตรวจสอบการปลอมแปลงเอกสารแบบเรียลไทม์',
    ],
    plugInTarget: 'ระบบพิมพ์สัญญา PDF (/api/contracts/export-pdf) และหน้าตรวจสอบเอกสารสาธารณะ',
  },
];

export default function ResearcherInnovationLabHubPage() {
  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <ResearcherLabNavBar />
      {/* Header Banner */}
      <div className="rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950/60 to-cyan-950/50 border border-cyan-500/30 p-8 shadow-2xl space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
            🧪 ISOLATED RESEARCH SANDBOX (ZERO-CONFLICT ARCHITECTURE)
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
            6 MIS & HIGH-TECH MODULES
          </span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-black text-white">
          ศูนย์ปฏิบัติการพัฒนาระบบฟีเจอร์ใหม่และระบบสนับสนุนการตัดสินใจ (MIS Lab)
        </h1>
        <p className="text-xs sm:text-sm text-slate-300 max-w-4xl leading-relaxed">
          พื้นที่พัฒนาและทดสอบระบบใหม่ทั้ง 6 โมดูลในฝั่ง <strong>Researcher</strong> โดยแยกไฟล์ออกจากระบบหลักอย่างอิสระ (Zero Merge Conflict) เพื่อให้สามารถพัฒนาคู่ขนานกับฝั่งปรับปรุงแผนธุรกิจและความละเอียดของระบบหลัก แล้วนำแต่ละโมดูลไปเสียบใช้งานในระบบหลักได้ทันทีเมื่อพร้อม
        </p>
      </div>

      {/* 6 Modules Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {RESEARCH_MODULES.map((m) => (
          <div
            key={m.id}
            className="rounded-3xl bg-slate-900/70 border border-white/10 hover:border-cyan-400/40 p-6 flex flex-col justify-between gap-5 shadow-xl transition-all"
          >
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-2xl shrink-0">
                    {m.icon}
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-cyan-400">
                      MODULE #{m.id} ({m.code})
                    </span>
                    <h2 className="text-base sm:text-lg font-black text-white leading-snug">
                      {m.title}
                    </h2>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-black border shrink-0 ${m.statusColor}`}>
                  {m.status}
                </span>
              </div>

              <p className="text-xs text-slate-300 leading-relaxed">{m.subtitle}</p>

              <div className="p-4 rounded-2xl bg-slate-950/80 border border-white/5 space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                  ขอบเขตฟังก์ชันย่อยที่พัฒนา:
                </span>
                <ul className="space-y-1.5 text-xs text-slate-200">
                  {m.subItems.map((sub, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-cyan-400 font-bold">•</span>
                      <span>{sub}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between gap-3 flex-wrap">
              <div className="text-[11px] text-slate-400">
                <strong className="text-slate-200">จุดนำไปเสียบระบบหลัก:</strong> {m.plugInTarget}
              </div>
              <Link
                href={m.href}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs shadow-lg flex items-center gap-1.5 transition-all"
              >
                <span>เปิดพื้นที่ทำงาน โมดูล {m.id}</span>
                <span>→</span>
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
