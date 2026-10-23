'use client';

import React from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import { DormDigitalTwinHeatmap } from '@/components/features/DormDigitalTwinHeatmap';

export default function Module3DigitalTwinLabPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <ResearcherLabNavBar />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/researcher/lab" className="text-xs font-bold text-cyan-400 hover:underline">
            ← กลับสู่ศูนย์ปฏิบัติการฟีเจอร์ใหม่ (6 MIS Modules)
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
            🏢 โมดูล 3: Interactive 2D Digital Twin & Multi-Layer Heatmap + Web Push
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
            แผนผังจำลองอาคาร 2 มิติ (20 ห้อง • 2 ชั้น ชั้นละ 10 ห้อง) พร้อมระบบแจ้งเตือน Web Push เฉพาะฝั่ง Researcher
          </p>
        </div>
      </div>

      <DormDigitalTwinHeatmap />
    </div>
  );
}
