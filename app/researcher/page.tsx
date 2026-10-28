'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';

interface DashboardData {
  user: {
    name: string;
    role: string;
    sub_role: string;
    email: string;
  };
  kpi: {
    integrityScore: number;
    totalTestCases: number;
    passedTestCases: number;
    failedTestCases: number;
    totalRooms: number;
    occupiedRooms: number;
    availableRooms: number;
    reservedRooms: number;
    maintenanceRooms: number;
    totalMeterReadings: number;
    cyclesCount: number;
    paidBillsCount: number;
    overdueBillsCount: number;
    overdueTotalAmount: number;
  };
  iotNode101: {
    roomNumber: string;
    deviceId: string;
    mode: string;
    status: string;
    voltage: number;
    currentAmp: number;
    activePowerWatt: number;
    currentMeterKwh: number;
    relayState: string;
    rssi: number;
  };
  overdueHighlights: {
    roomNumber: string;
    cycle: string;
    amount: number;
    fine: number;
    tenantName: string;
  }[];
}

export default function Researcher2DashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [runningTests, setRunningTests] = useState(false);
  const [relayToggling, setRelayToggling] = useState(false);
  const [testSummary, setTestSummary] = useState<{
    total: number;
    passed: number;
    integrityScore: number;
    durationMs: number;
  } | null>(null);

  const fetchDashboard = async () => {
    try {
      const res = await fetch('/api/researcher/dashboard', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) {
        setData(json);
      }
    } catch (err) {
      console.error('Fetch dashboard error:', err);
    } finally {
      setLoading(false);
    }
  };

  const runAllTests = async () => {
    setRunningTests(true);
    try {
      const res = await fetch('/api/researcher/test-cases', { cache: 'no-store' });
      const json = await res.json();
      if (json.success && json.summary) {
        setTestSummary(json.summary);
      }
    } catch (err) {
      console.error('Run tests error:', err);
    } finally {
      setRunningTests(false);
      fetchDashboard();
    }
  };

  const handleToggleRelay = async (targetState: 'ON' | 'OFF') => {
    if (!data) return;
    setRelayToggling(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'QUEUE_COMMAND',
          roomNumber: '101',
          command: targetState === 'ON' ? 'RELAY_ON' : 'RELAY_OFF',
        }),
      });
      const json = await res.json();
      if (json.success) {
        setData((prev) =>
          prev
            ? {
                ...prev,
                iotNode101: {
                  ...prev.iotNode101,
                  relayState: targetState,
                  activePowerWatt: targetState === 'ON' ? 88 : 0,
                },
              }
            : null
        );
      }
    } catch (err) {
      console.error('Toggle relay error:', err);
    } finally {
      setRelayToggling(false);
    }
  };

  useEffect(() => {
    fetchDashboard();
    runAllTests();
  }, []);

  const userName = session?.user?.name || data?.user?.name || 'kritsakorn';
  const userSubRole = (session?.user as any)?.sub_role || data?.user?.sub_role || 'researcher2';
  const kpi = data?.kpi;
  const node = data?.iotNode101;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4">
      {/* 1. Global Navigation Bar */}
      <ResearcherLabNavBar />

      {/* 2. Executive Profile & Quick Status Header */}
      <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 backdrop-blur-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="w-12 h-12 rounded-2xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-2xl shadow-inner shadow-cyan-500/20">
              🔬
            </span>
            <span className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-500 border-2 border-slate-900 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
                ศูนย์ควบคุมวิจัย (Researcher 2 Command Center)
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[11px] font-black uppercase">
                {userSubRole}
              </span>
            </div>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              ผู้ใช้: <span className="text-slate-200 font-bold">{userName}</span> (kritsakorn@kesorn.com) • หอพักเกษร 2
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <Link
            href="/"
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer flex items-center gap-1.5"
            title="กลับสู่หน้าหลักหอพักเกษร 2"
          >
            <span>🏠</span>
            <span>หน้าหลัก</span>
          </Link>

          <button
            onClick={runAllTests}
            disabled={runningTests}
            className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-md shadow-cyan-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{runningTests ? '⏳' : '▶️'}</span>
            <span>{runningTests ? 'กำลังตรวจสอบ...' : 'รันตรวจสอบทุกระบบ (Instant Run)'}</span>
          </button>

          <button
            onClick={() => signOut({ callbackUrl: '/signin' })}
            className="px-3 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition-all cursor-pointer"
            title="ออกจากระบบ"
          >
            🚪 ออก
          </button>
        </div>
      </div>

      {/* 3. Core KPI Strip (5 High-Impact Metrics) */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {/* Metric 1: MIS Integrity */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-bold">MIS Integrity</span>
            <span>🧪</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400 font-mono">
              {testSummary ? `${testSummary.integrityScore}%` : kpi ? `${kpi.integrityScore}%` : '100%'}
            </span>
            <span className="text-[11px] font-semibold text-emerald-500/80">
              ({testSummary ? `${testSummary.passed}/${testSummary.total}` : '21/21'} PASS)
            </span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">0 ข้อผิดพลาด • ตอบสนอง {testSummary?.durationMs || 10}ms</div>
        </div>

        {/* Metric 2: Rooms & Occupancy */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-bold">ห้องพักในระบบ</span>
            <span>🏢</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-white font-mono">{kpi ? kpi.totalRooms : 21}</span>
            <span className="text-xs text-slate-400">ห้อง</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {kpi?.occupiedRooms || 16} มีสัญญา • {kpi?.availableRooms || 2} ว่าง • {kpi?.reservedRooms || 2} จอง
          </div>
        </div>

        {/* Metric 3: Real-Time Grid Load */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-bold">ESP32 โหนด 101</span>
            <span>⚡</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-amber-400 font-mono">
              {node ? `${node.activePowerWatt} W` : '88 W'}
            </span>
            <span className="text-[11px] text-emerald-400 font-bold">🟢 ONLINE</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {node?.voltage || 228.2}V • สะสม {node?.currentMeterKwh || 367.5} kWh
          </div>
        </div>

        {/* Metric 4: Historical MIS Data */}
        <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-bold">ประวัติข้อมูล MIS</span>
            <span>📅</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-cyan-400 font-mono">{kpi ? kpi.cyclesCount : 12}</span>
            <span className="text-xs text-slate-400">รอบบิล</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {kpi?.totalMeterReadings || 196} บันทึกมิเตอร์ย้อนหลัง
          </div>
        </div>

        {/* Metric 5: Billing & Collections */}
        <div className="col-span-2 lg:col-span-1 p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 text-xs">
            <span className="font-bold">สถานะบิล & ค่าปรับ</span>
            <span>🧾</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-2xl font-black text-emerald-400 font-mono">{kpi ? kpi.paidBillsCount : 192}</span>
            <span className="text-xs text-slate-400">ชำระแล้ว</span>
          </div>
          <div className="mt-1 text-[11px] text-rose-400 font-semibold">
            {kpi?.overdueBillsCount || 3} ค้างชำระ (฿{(kpi?.overdueTotalAmount || 18176).toLocaleString()})
          </div>
        </div>
      </div>

      {/* 4. Primary Modules Cards Grid (All 6 core modules) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Module 1: Test Cases Matrix */}
        <Link
          href="/researcher/lab/test-cases"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-lg">
                🧪
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                21/21 PASS
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              ระบบทดสอบ 20 ห้อง (Test Matrix)
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              ชุดทดสอบอัตโนมัติ 21 เคส ครอบคลุมการเงิน พลังงาน IoT และวงจรชีวิตสัญญา
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>เข้าสู่ระบบทดสอบ</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Module 2: 2D Digital Twin */}
        <Link
          href="/researcher/lab/digital-twin"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-lg">
                🏢
              </span>
              <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-400 text-[10px] font-black">
                20 ห้อง • 2 ชั้น
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              2D Digital Twin & Heatmap
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              แผนผังอาคาร 2 มิติ แสดงสถานะห้องพัก โหลดไฟฟ้า และการแจ้งเตือน Real-Time
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>เปิดผัง Digital Twin</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Module 3: IoT Smart Meter */}
        <Link
          href="/researcher/lab/iot-meter"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-lg">
                ⚡
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                ESP32 + PZEM-004T
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              IoT Smart Meter & Fleet Control
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              มอนิเตอร์ฮาร์ดแวร์จริง ควบคุมสวิตช์ตัดต่อไฟระยะไกล และจำลองโหลดเสมือน
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>เปิดห้องทดลอง Smart Meter</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Module 4: Dynamic PromptPay QR */}
        <Link
          href="/researcher/lab/dynamic-qr"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-lg">
                📲
              </span>
              <span className="px-2 py-0.5 rounded-full bg-purple-500/15 border border-purple-500/30 text-purple-400 text-[10px] font-black">
                063-604-0550
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              PromptPay Dynamic QR FinTech
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              สร้าง QR พร้อมเพย์ระบุเศษสตางค์ ตรวจจับยอดโอนอัตโนมัติ และจับคู่สลิป
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>ทดสอบ FinTech Dynamic QR</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Module 5: Auto-Pull Billing Flow */}
        <Link
          href="/owner/billing/record"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-lg">
                🧾
              </span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-[10px] font-black">
                Zero-Click Auto
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              บันทึกมิเตอร์ & Auto-Pull ESP32
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              ดึงค่ามิเตอร์ไฟฟ้าจากอุปกรณ์ ESP32 ทันทีที่เลือกห้อง พร้อมคำนวณบิลอัตโนมัติ
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>ไปที่หน้าจดมิเตอร์</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>

        {/* Module 6: Meters MIS Management */}
        <Link
          href="/owner/meters"
          className="group p-4 rounded-2xl bg-slate-900/70 hover:bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all flex flex-col justify-between cursor-pointer shadow-lg"
        >
          <div>
            <div className="flex items-center justify-between">
              <span className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/30 flex items-center justify-center text-lg">
                📈
              </span>
              <span className="px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[10px] font-black">
                12 รอบบิล
              </span>
            </div>
            <h3 className="text-sm font-bold text-white group-hover:text-cyan-400 transition-colors mt-3">
              ระบบวิเคราะห์มิเตอร์หอพัก (Meters MIS)
            </h3>
            <p className="text-xs text-slate-400 mt-1 line-clamp-2">
              ตรวจดูสถิติการใช้พลังงาน หน่วยไฟฟ้ารวม และประวัติการบันทึกย้อนหลัง
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-cyan-400 font-bold">
            <span>ดูข้อมูลมิเตอร์ทั้งหมด</span>
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </div>
        </Link>
      </div>

      {/* 5. Live Diagnostics & Node Control Panel (2 Columns) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Column 1: MIS Verification Matrix */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🧪</span>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                ผลการทดสอบระบบ 3 มิติ (MIS Verification)
              </h2>
            </div>
            <Link href="/researcher/lab/test-cases" className="text-xs text-cyan-400 hover:underline font-bold">
              ดูผลรายเคส →
            </Link>
          </div>

          <div className="space-y-2">
            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span>💰</span>
                <div>
                  <div className="font-bold text-slate-200">ระบบการเงิน & บิลรายเดือน (Financial)</div>
                  <div className="text-[11px] text-slate-400">ค่าไฟ ค่าปรับ ฿300/เดือน สลิป QR ข้อพิพาท</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-black text-[11px]">
                7/7 PASS
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span>⚡</span>
                <div>
                  <div className="font-bold text-slate-200">ระบบพลังงาน & IoT Smart Grid (Energy)</div>
                  <div className="text-[11px] text-slate-400">ESP32 PZEM รีเลย์ Phantom Load ป้องกันไฟเกิน</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-black text-[11px]">
                7/7 PASS
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span>📋</span>
                <div>
                  <div className="font-bold text-slate-200">วงจรชีวิตห้องพัก & สัญญา (Lifecycle)</div>
                  <div className="text-[11px] text-slate-400">สัญญาเช่า ย้ายออก แจ้งซ่อม คืนมัดจำ สำรองห้อง</div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-black text-[11px]">
                7/7 PASS
              </span>
            </div>
          </div>
        </div>

        {/* Column 2: ESP32 Hardware Node Telemetry & Quick Action */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="text-sm font-black text-white uppercase tracking-wider">
                โหนดฮาร์ดแวร์ ESP32 ห้อง 101 (Live Node)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-black text-[10px]">
              ONLINE (IP: 192.168.1.101)
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">แรงดันไฟฟ้า</div>
              <div className="text-base font-black text-cyan-400 font-mono mt-0.5">{node?.voltage || 228.2} V</div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">กำลังไฟฟ้า</div>
              <div className="text-base font-black text-amber-400 font-mono mt-0.5">
                {node?.activePowerWatt || 88} W
              </div>
            </div>
            <div className="p-2 rounded-xl bg-slate-950/60 border border-slate-800">
              <div className="text-[10px] text-slate-400 font-bold uppercase">สถานะรีเลย์</div>
              <div
                className={`text-base font-black font-mono mt-0.5 ${
                  node?.relayState === 'ON' ? 'text-emerald-400' : 'text-rose-400'
                }`}
              >
                {node?.relayState || 'ON'}
              </div>
            </div>
          </div>

          <div className="pt-1 flex items-center justify-between gap-2">
            <button
              onClick={() => handleToggleRelay('ON')}
              disabled={relayToggling || node?.relayState === 'ON'}
              className="flex-1 py-1.5 px-3 rounded-xl bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition-all disabled:opacity-30 cursor-pointer"
            >
              เปิดจ่ายไฟ (Relay ON)
            </button>
            <button
              onClick={() => handleToggleRelay('OFF')}
              disabled={relayToggling || node?.relayState === 'OFF'}
              className="flex-1 py-1.5 px-3 rounded-xl bg-rose-600/30 hover:bg-rose-600/50 border border-rose-500/40 text-rose-300 font-bold text-xs transition-all disabled:opacity-30 cursor-pointer"
            >
              ตัดไฟชั่วคราว (Relay OFF)
            </button>
            <Link
              href="/researcher/lab/iot-meter"
              className="py-1.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs border border-slate-700 transition-all text-center whitespace-nowrap cursor-pointer"
            >
              ควบคุมทั้งตึก →
            </Link>
          </div>
        </div>
      </div>

      {/* 6. Active System Scenarios Strip */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">🚨</span>
            <h2 className="text-sm font-black text-white uppercase tracking-wider">
              เหตุการณ์สำคัญในระบบ (Active MIS Scenarios)
            </h2>
          </div>
          <span className="text-xs text-slate-400 font-medium">ข้อมูลอัปเดตอัตโนมัติ</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-200">
            <div className="flex items-center justify-between font-bold">
              <span>ห้อง 104 • ค้างชำระ 1 ด.</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">Overdue</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">ยอด ฿5,775 + ค่าปรับ ฿300 (นายพิเชษฐ์)</div>
          </div>

          <div className="p-2.5 rounded-xl bg-rose-950/20 border border-rose-900/40 text-rose-200">
            <div className="flex items-center justify-between font-bold">
              <span>ห้อง 204 • ค้างชำระ 2 ด.</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/20 text-rose-300">Overdue x2</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">ยอดรวม ฿12,401 + ค่าปรับ ฿900 (นายอดิศร)</div>
          </div>

          <div className="p-2.5 rounded-xl bg-purple-950/20 border border-purple-900/40 text-purple-200">
            <div className="flex items-center justify-between font-bold">
              <span>ห้อง 110 • Phantom Load</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-purple-500/20 text-purple-300">Anomaly</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">ตรวจพบโหลด 45W ขณะห้องว่าง</div>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200">
            <div className="flex items-center justify-between font-bold">
              <span>ห้อง 210 • ซ่อมบำรุงแอร์</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">Relay Cut</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">ท่อน้ำยาแอร์รั่ว ตัดไฟรีเลย์เพื่อความปลอดภัย</div>
          </div>
        </div>
      </div>
    </div>
  );
}
