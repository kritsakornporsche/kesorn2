'use client';

import Link from 'next/link';
import { useCaseGroups, diagrams } from '@/lib/diagramsData';
import { SYSTEM_UPDATES } from '@/lib/updatesData';

export default function ResearcherDashboardPage() {
  const totalUseCases = useCaseGroups.reduce((acc, g) => acc + g.useCases.length, 0);
  const totalDiagrams = diagrams.length;
  const totalUpdateEntries = SYSTEM_UPDATES.reduce((acc, u) => acc + u.tasks.length, 0);

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* Hero Section */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-cyan-950/40 to-slate-900 border border-cyan-500/20 p-8 shadow-2xl">
        <div className="absolute -right-10 -top-10 w-72 h-72 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1 rounded-full text-xs font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
              🎓 THESIS RESEARCH & SYSTEM ARCHITECTURE
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
              UNIVERSITY OF PHAYAO
            </span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-black text-white tracking-tight">
            แดชบอร์ดงานวิจัยและสถาปัตยกรรมระบบ
          </h1>
          <p className="text-slate-300 text-sm sm:text-base max-w-3xl leading-relaxed">
            ศูนย์รวมเอกสารและการวิเคราะห์สถาปัตยกรรม แพลตฟอร์มหอพักหน้ามหาวิทยาลัยพะเยา (SmartDom SaaS) สำหรับผู้วิจัยและอาจารย์ที่ปรึกษา ครอบคลุมการวิเคราะห์กรณีการใช้งาน (Use Cases), แผนภาพลำดับการทำงาน (Sequence Diagrams), และบันทึกประวัติการพัฒนาระบบ
          </p>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-3xl">📑</span>
            <span className="text-xs font-bold text-cyan-400 bg-cyan-950/80 px-2.5 py-1 rounded-lg border border-cyan-800/50">
              4 Actor Groups
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white">{totalUseCases}</div>
            <p className="text-xs text-slate-400 mt-1 font-semibold">กรณีการใช้งานทั้งหมด (Use Cases)</p>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-3xl">📐</span>
            <span className="text-xs font-bold text-blue-400 bg-blue-950/80 px-2.5 py-1 rounded-lg border border-blue-800/50">
              Workflows
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white">{totalDiagrams}</div>
            <p className="text-xs text-slate-400 mt-1 font-semibold">Sequence Diagrams (แผนภาพลำดับ)</p>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-3xl">🚀</span>
            <span className="text-xs font-bold text-emerald-400 bg-emerald-950/80 px-2.5 py-1 rounded-lg border border-emerald-800/50">
              {SYSTEM_UPDATES[0]?.version || 'v2.6.1'}
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white">{totalUpdateEntries}+</div>
            <p className="text-xs text-slate-400 mt-1 font-semibold">ฟีเจอร์และรายการปรับปรุงระบบ</p>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-slate-900/80 border border-white/10 hover:border-cyan-500/40 transition-all shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-3xl">🗄️</span>
            <span className="text-xs font-bold text-amber-400 bg-amber-950/80 px-2.5 py-1 rounded-lg border border-amber-800/50">
              Unified DB
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-white">SaaS</div>
            <p className="text-xs text-slate-400 mt-1 font-semibold">สถาปัตยกรรมฐานข้อมูลเดี่ยว (Row-Level)</p>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6">
        <Link
          href="/researcher/dfd"
          className="group p-6 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-cyan-400/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              🔄
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
              Data Flow Diagrams (DFD)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              แผนภาพกระแสข้อมูลระบบครบ 3 ระดับ (Context Diagram Level 0, DFD Level 1 และ Level 2 ย่อย) พร้อมคำอธิบาย Process และ Data Store
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าดู DFD Diagrams</span>
            <span>→</span>
          </div>
        </Link>

        <Link
          href="/researcher/er-diagram"
          className="group p-6 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-cyan-400/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              🗄️
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
              ER Diagram (24 ตาราง)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              แผนภาพความสัมพันธ์ฐานข้อมูลฉบับสมบูรณ์ 24 ตาราง พร้อม Data Dictionary ค้นหาฟิลด์ คีย์หลัก และความสัมพันธ์แบบ Multi-tenant
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าดู ER Diagram</span>
            <span>→</span>
          </div>
        </Link>

        <Link
          href="/researcher/diagrams"
          className="group p-6 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-cyan-400/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              📐
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-cyan-300 transition-colors">
              Sequence Diagrams
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ศึกษาผังลำดับขั้นตอนการโต้ตอบของระบบทั้ง 7 แผนภาพ พร้อมตารางแยก Actor, Action, Target และโค้ด Mermaid ที่สามารถคัดลอกไปทำรายงานได้ทันที
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-cyan-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าดูแผนภาพระบบ</span>
            <span>→</span>
          </div>
        </Link>

        <Link
          href="/researcher/use-cases"
          className="group p-6 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-blue-400/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              📑
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-blue-300 transition-colors">
              Use Case Analysis
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              ตารางวิเคราะห์ Use Case แบ่งตาม 4 กลุ่มผู้ใช้งาน (Guest, Tenant, Owner, Keeper) พร้อมขอบเขตฟังก์ชันการทำงาน และ Use Case Diagram ฉบับรวม
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-blue-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าดูการวิเคราะห์ Use Cases</span>
            <span>→</span>
          </div>
        </Link>

        <Link
          href="/researcher/updates"
          className="group p-6 rounded-2xl bg-slate-900/60 border border-white/10 hover:border-purple-400/50 hover:bg-slate-900 transition-all flex flex-col justify-between shadow-lg"
        >
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">
              🚀
            </div>
            <h3 className="text-lg font-bold text-white group-hover:text-purple-300 transition-colors">
              Release Notes & Updates
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              บันทึกประวัติการปรับปรุงระบบและการพัฒนาฟีเจอร์เวอร์ชันล่าสุด ({SYSTEM_UPDATES[0]?.version || 'v2.6.1'}) รายละเอียดการแก้ไขบั๊ก และการเพิ่มประสิทธิภาพของระบบ
            </p>
          </div>
          <div className="mt-6 flex items-center gap-2 text-xs font-bold text-purple-400 group-hover:translate-x-1 transition-transform">
            <span>เข้าดูบันทึกการพัฒนา</span>
            <span>→</span>
          </div>
        </Link>
      </div>

      {/* Architectural Overview & Research Scope */}
      <div className="rounded-3xl bg-slate-900/50 border border-white/10 p-8 space-y-6">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🏛️</span>
          <div>
            <h2 className="text-xl font-bold text-white">ขอบเขตทางวิชาการและสถาปัตยกรรมระบบ</h2>
            <p className="text-xs text-slate-400">สรุปข้อมูลเชิงสถาปัตยกรรมสำหรับประกอบรายงานวิทยานิพนธ์</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
          <div className="p-5 rounded-2xl bg-black/30 border border-white/5 space-y-3">
            <h4 className="font-bold text-cyan-300 flex items-center gap-2">
              <span>📌</span> 1. สถาปัตยกรรมฐานข้อมูลแบบรวมศูนย์ (Unified Multi-tenant Database)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              ระบบเปลี่ยนผ่านจาก Multi-database per dorm สู่ <strong>Single Unified Database Approach</strong> โดยใช้ <code className="text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded">dorm_id</code> ในการแยกแยะข้อมูลระดับ Row-Level เพื่อลด Overhead การสร้างฐานข้อมูลใหม่ รองรับการเชื่อมต่อผ่าน Connection Pool ได้อย่างมีประสิทธิภาพสูงสุด
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-black/30 border border-white/5 space-y-3">
            <h4 className="font-bold text-blue-300 flex items-center gap-2">
              <span>🛡️</span> 2. ระบบควบคุมสิทธิ์การเข้าถึง (Role-Based Access Control)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              ระบบจัดแบ่งบทบาทผู้ใช้งานออกเป็น 6 สิทธิ์ที่ชัดเจน ได้แก่ <strong>Platform Admin</strong>, <strong>Owner</strong>, <strong>Tenant</strong>, <strong>Keeper (Maid/Tech)</strong>, <strong>Researcher</strong> และ <strong>Guest</strong> โดยใช้ NextAuth v5 JWT ควบคู่กับ HTTP-only session cookies
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-black/30 border border-white/5 space-y-3">
            <h4 className="font-bold text-emerald-300 flex items-center gap-2">
              <span>⚡</span> 3. การทำงานร่วมกันระหว่างโหมด Dev และ Production
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              รองรับการพัฒนาทั้งใน <strong>Development Mode (Next.js Turbopack)</strong> และ <strong>Production Mode (Next.js Webpack Build)</strong> พร้อมระบบ Trust Host ไดนามิก รองรับการเข้าถึงผ่าน Localhost, LAN IP และ Dynamic DNS (DDNS) โดยไม่มีปัญหา Session หรือ URL หลุด
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-black/30 border border-white/5 space-y-3">
            <h4 className="font-bold text-purple-300 flex items-center gap-2">
              <span>📝</span> 4. การจัดการสัญญาแบบไฮบริด (Hybrid Contract System)
            </h4>
            <p className="text-xs text-slate-300 leading-relaxed">
              รองรับกระบวนการเซ็นสัญญากระดาษฉบับจริง (Physical Signed Paper) เพื่อผลทางกฎหมาย พร้อมฟังก์ชันการถ่ายภาพ/สแกนบันทึกเข้าระบบเพื่อเปิดสิทธิ์การใช้งานลูกหอแบบอัตโนมัติ โดยไม่จำเป็นต้องใช้ Digital Signature ที่ซับซ้อนเกินจำเป็นสำหรับหอพัก
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
