'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ThaIdDigitalIdButton } from '@/components/features/ThaIdDigitalIdModal';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import type { ThaIdVerifiedPayload } from '@/lib/features/thaid-digital-id';

interface DemographicRecord {
  id: string;
  fullName: string;
  birthDate: string;
  age: number;
  ageGroup: string;
  province: string;
  district: string;
  subdistrict: string;
  verifiedAt: string;
  ppidHash: string;
}

const INITIAL_DEMOGRAPHIC_DATA: DemographicRecord[] = [
  {
    id: 'REC-01',
    fullName: 'นายกิตติพงศ์ เจริญรัตน์',
    birthDate: '14 พ.ค. 2549',
    age: 20,
    ageGroup: '18-20 ปี (นักศึกษาชั้นปีต้น)',
    province: 'พะเยา',
    district: 'เมืองพะเยา',
    subdistrict: 'แม่กา',
    verifiedAt: '10 ต.ค. 2569',
    ppidHash: 'PPID-8A41F9C201B7E312',
  },
  {
    id: 'REC-02',
    fullName: 'นางสาวพิมพ์ชนก วงศ์สวัสดิ์',
    birthDate: '22 ต.ค. 2547',
    age: 22,
    ageGroup: '21-23 ปี (นักศึกษาชั้นปีปลาย)',
    province: 'เชียงราย',
    district: 'เมืองเชียงราย',
    subdistrict: 'รอบเวียง',
    verifiedAt: '10 ต.ค. 2569',
    ppidHash: 'PPID-3F92D81B64A09C44',
  },
  {
    id: 'REC-03',
    fullName: 'นายธนภัทร อัครเดชโชติ',
    birthDate: '09 ม.ค. 2543',
    age: 26,
    ageGroup: '24-30 ปี (วัยเริ่มทำงาน/บัณฑิต)',
    province: 'กรุงเทพมหานคร',
    district: 'จตุจักร',
    subdistrict: 'ลาดยาว',
    verifiedAt: '10 ต.ค. 2569',
    ppidHash: 'PPID-7C15E309FA281D90',
  },
  {
    id: 'REC-04',
    fullName: 'นางสาวกมลชนก ศรีวิชัย',
    birthDate: '03 ส.ค. 2549',
    age: 20,
    ageGroup: '18-20 ปี (นักศึกษาชั้นปีต้น)',
    province: 'เชียงใหม่',
    district: 'เมืองเชียงใหม่',
    subdistrict: 'สุเทพ',
    verifiedAt: '10 ต.ค. 2569',
    ppidHash: 'PPID-5B20A194CD883E71',
  },
  {
    id: 'REC-05',
    fullName: 'นายภูวดล อินทร์แก้ว',
    birthDate: '19 พ.ย. 2548',
    age: 21,
    ageGroup: '21-23 ปี (นักศึกษาชั้นปีปลาย)',
    province: 'เชียงราย',
    district: 'พาน',
    subdistrict: 'เมืองพาน',
    verifiedAt: '10 ต.ค. 2569',
    ppidHash: 'PPID-9D44C712EB035A18',
  },
];

export default function Module1DigitalIdLabPage() {
  const [records, setRecords] = useState<DemographicRecord[]>(INITIAL_DEMOGRAPHIC_DATA);
  const [latestVerified, setLatestVerified] = useState<ThaIdVerifiedPayload | null>(null);

  const handleThaIdVerified = (data: ThaIdVerifiedPayload) => {
    setLatestVerified(data);
    const newRec: DemographicRecord = {
      id: `REC-0${records.length + 1}`,
      fullName: data.full_name_th,
      birthDate: data.birth_date,
      age: data.age,
      ageGroup: data.age_group,
      province: data.address_parts?.province || 'พะเยา',
      district: data.address_parts?.district || 'เมืองพะเยา',
      subdistrict: data.address_parts?.subdistrict || 'แม่กา',
      verifiedAt: 'เมื่อสักครู่',
      ppidHash: data.sub_pid_hash,
    };
    setRecords((prev) => [newRec, ...prev]);
  };

  // คำนวณสถิติสำหรับแดชบอร์ดสนับสนุนการตัดสินใจ (1.1.2 Demographic DSS)
  const avgAge = (records.reduce((s, r) => s + r.age, 0) / (records.length || 1)).toFixed(1);
  const provinceCounts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.province] = (acc[r.province] || 0) + 1;
    return acc;
  }, {});
  const ageGroupCounts = records.reduce<Record<string, number>>((acc, r) => {
    acc[r.ageGroup] = (acc[r.ageGroup] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <ResearcherLabNavBar />
      {/* Breadcrumb & Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link href="/researcher/lab" className="text-xs font-bold text-cyan-400 hover:underline">
            ← กลับสู่ศูนย์ปฏิบัติการฟีเจอร์ใหม่ (6 MIS Modules)
          </Link>
          <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
            🇹🇭 โมดูล 1: Digital ID (ThaID OAuth 2.0) & แดชบอร์ดสนับสนุนการตัดสินใจ (DSS)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            1.1.1 รับข้อมูล ชื่อ, ที่อยู่, และวันเกิดเพื่อคำนวณอายุอัตโนมัติ • 1.1.2 วิเคราะห์ข้อมูลประชากรศาสตร์ผู้เช่าเพื่อสนับสนุนการตัดสินใจของผู้บริหารหอพัก
          </p>
        </div>
      </div>

      {/* Section 1.1.1: ThaID OAuth 2.0 & Age Calculation Testbed */}
      <div className="rounded-3xl bg-slate-900/70 border border-white/10 p-6 space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
              PART 1.1.1 • D.DOPA THAID OAUTH 2.0 + AGE CALCULATION
            </span>
            <h2 className="text-lg font-black text-white">
              ทดสอบดึงข้อมูลผู้เช่าจากแอป ThaID และคำนวณอายุจากวันเกิดอัตโนมัติ
            </h2>
          </div>
        </div>

        <ThaIdDigitalIdButton onVerified={handleThaIdVerified} />

        {latestVerified && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-4 rounded-2xl bg-slate-950/90 border border-emerald-500/30">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">ชื่อ-นามสกุลที่ดึงได้</span>
              <span className="text-sm font-black text-white">{latestVerified.full_name_th}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">วันเกิด & อายุที่คำนวณได้</span>
              <span className="text-sm font-black text-amber-300">
                {latestVerified.birth_date} (อายุ {latestVerified.age} ปี)
              </span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">กลุ่มผู้เช่า (Segment)</span>
              <span className="text-xs font-bold text-cyan-300">{latestVerified.age_group}</span>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block">ภูมิลำเนา (จังหวัด/อำเภอ)</span>
              <span className="text-xs font-bold text-emerald-300">
                จ.{latestVerified.address_parts.province || '-'} (อ.{latestVerified.address_parts.district || '-'})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Section 1.1.2: Demographic Decision Support Dashboard (DSS) */}
      <div className="rounded-3xl bg-slate-900/70 border border-white/10 p-6 space-y-6">
        <div>
          <span className="text-[10px] font-black uppercase tracking-widest text-cyan-400">
            PART 1.1.2 • MANAGEMENT INFORMATION SYSTEM (DEMOGRAPHIC DSS DASHBOARD)
          </span>
          <h2 className="text-lg font-black text-white">
            แดชบอร์ดสนับสนุนการตัดสินใจจากข้อมูลประชากรศาสตร์ผู้เช่า (อายุ & ภูมิลำเนาจาก ThaID)
          </h2>
          <p className="text-xs text-slate-400">
            เมื่อผู้เช่ายืนยันตัวตนผ่าน ThaID ระบบจะนำเฉพาะค่าสถิติ (อายุ, กลุ่มชั้นปี, และจังหวัดภูมิลำเนา) มาประมวลผลเป็นสารสนเทศเพื่อการตัดสินใจของผู้บริหารโดยไม่เก็บเลขบัตร 13 หลัก
          </p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-white/10">
            <span className="text-xs text-slate-400 font-bold">อายุเฉลี่ยผู้เช่าในหอพัก</span>
            <div className="text-3xl font-black text-amber-300 mt-1">{avgAge} ปี</div>
            <p className="text-[11px] text-slate-400 mt-1">
              กลุ่มหลัก: นักศึกษาปริญญาตรี (18–23 ปี)
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-white/10">
            <span className="text-xs text-slate-400 font-bold">จำนวนผู้เช่าที่ผ่านการยืนยัน ThaID</span>
            <div className="text-3xl font-black text-emerald-400 mt-1">{records.length} ราย</div>
            <p className="text-[11px] text-slate-400 mt-1">
              ระดับความน่าเชื่อถือ IAL 2.3 (Zero 13-Digit ID)
            </p>
          </div>
          <div className="p-5 rounded-2xl bg-slate-950/80 border border-white/10">
            <span className="text-xs text-slate-400 font-bold">ข้อเสนอแนะเชิงกลยุทธ์ (DSS Insight)</span>
            <div className="text-sm font-black text-cyan-300 mt-2">
              เน้นสัญญาเช่ารายปีตามปีการศึกษา ม.พะเยา
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              ผู้เช่ากว่า 80% มีอายุ 18–23 ปี และมาจากภาคเหนือตอนบน
            </p>
          </div>
        </div>

        {/* Breakdown Grids */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              📊 สัดส่วนช่วงอายุผู้เช่า (Age Distribution)
            </h3>
            <div className="space-y-2.5">
              {Object.entries(ageGroupCounts).map(([group, count]) => {
                const pct = Math.round((count / records.length) * 100);
                return (
                  <div key={group} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-200">{group}</span>
                      <span className="font-mono text-amber-300 font-bold">
                        {count} คน ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-amber-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="p-5 rounded-2xl bg-slate-950/70 border border-white/10 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-wider text-white">
              🗺️ ภูมิลำเนาของผู้เช่าแยกตามจังหวัด (Origin Province)
            </h3>
            <div className="space-y-2.5">
              {Object.entries(provinceCounts).map(([prov, count]) => {
                const pct = Math.round((count / records.length) * 100);
                return (
                  <div key={prov} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="font-bold text-slate-200">จังหวัด{prov}</span>
                      <span className="font-mono text-cyan-300 font-bold">
                        {count} คน ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                      <div className="h-full bg-cyan-400 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
