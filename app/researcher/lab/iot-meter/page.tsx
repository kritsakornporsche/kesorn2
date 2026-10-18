'use client';

import React from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import { IotSmartMeterLab } from '@/components/features/IotSmartMeterLab';

export default function Module4IotMeterLabPage() {
  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto space-y-6">
      <ResearcherLabNavBar />
      <div>
        <Link href="/researcher/lab" className="text-xs font-bold text-cyan-400 hover:underline">
          ← กลับสู่ศูนย์ปฏิบัติการฟีเจอร์ใหม่ (6 MIS Modules)
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
          ⚡ โมดูล 4: IoT Smart Meter Simulator + One-Click Auto Billing Pipeline (พร้อมเชื่อมต่อ ESP32 จริง)
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          4.1.1 ระบบอ่านค่ามิเตอร์ไฟฟ้าแบบ Hybrid (ห้อง 101 พร้อมรับค่าจากบอร์ด ESP32 + PZEM-004T จริง และห้อง 102–210 จำลองโหลดอัจฉริยะ) พร้อมระบบสั่งเปิด-ปิดเบรกเกอร์ระยะไกล และออกบิลอัตโนมัติทั้งตึกในคลิกเดียว
        </p>
      </div>

      <IotSmartMeterLab />
    </div>
  );
}
