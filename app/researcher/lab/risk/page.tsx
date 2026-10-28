'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import { subscribeDeviceToWebPush } from '@/lib/features/web-push-client';

interface AssessedRoom {
  roomId: number;
  roomNumber: string;
  floor: number;
  tenantName: string;
  roomStatus: string;
  relayStatus: 'ON' | 'OFF';
  activeWatt: number;
  financialScore: number;
  energyScore: number;
  contractScore: number;
  totalScore: number;
  riskLevel: 'LOW' | 'MEDIUM' | 'CRITICAL';
  primaryFactor: string;
  totalOverdue: number;
}

interface RiskSummary {
  overallRiskIndex: number;
  overallStatus: 'LOW' | 'WARNING' | 'CRITICAL';
  criticalRoomsCount: number;
  warningRoomsCount: number;
  normalRoomsCount: number;
  totalExposureAmount: number;
  electricalAnomaliesCount: number;
  pushSubscribersCount: number;
}

export default function RiskAnalysisDashboardPage() {
  const [rooms, setRooms] = useState<AssessedRoom[]>([]);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'CRITICAL' | 'MEDIUM' | 'LOW'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [simulating, setSimulating] = useState<string | null>(null);
  const [pushStatus, setPushStatus] = useState<string | null>(null);
  const [subscribing, setSubscribing] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  const fetchRiskData = async () => {
    try {
      const res = await fetch('/api/researcher/risk-analysis', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setRooms(data.rooms || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Fetch risk data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setIsSubscribed(Notification.permission === 'granted');
    }
  }, []);

  const handleSubscribePush = async () => {
    setSubscribing(true);
    try {
      const res = await subscribeDeviceToWebPush({
        role: 'researcher',
        subRole: 'researcher2',
        userName: 'kritsakorn',
        userEmail: 'kritsakorn@kesorn.com',
        sendConfirmationPush: true,
      });
      if (res.success) {
        setIsSubscribed(true);
        setPushStatus('🔔 เปิดรับการแจ้งเตือน Web Push บนอุปกรณ์นี้เรียบร้อยแล้ว');
        fetchRiskData();
      } else {
        setPushStatus(`⚠️ ${res.message}`);
      }
    } catch (err: any) {
      setPushStatus(`⚠️ ไม่สามารถลงทะเบียนได้: ${err?.message}`);
    } finally {
      setSubscribing(false);
      setTimeout(() => setPushStatus(null), 6000);
    }
  };

  const handleSimulatePush = async (scenario: 'financial' | 'phantom' | 'overload' | 'contract', roomNumber?: string) => {
    setSimulating(scenario);
    try {
      const res = await fetch('/api/researcher/risk-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger_simulation', scenario, roomNumber }),
      });
      const data = await res.json();
      if (data.success) {
        setPushStatus(`✅ ${data.message}`);
      } else {
        setPushStatus(`⚠️ ${data.message}`);
      }
    } catch (err: any) {
      setPushStatus(`⚠️ ส่งแจ้งเตือนไม่สำเร็จ: ${err?.message}`);
    } finally {
      setSimulating(null);
      setTimeout(() => setPushStatus(null), 6000);
    }
  };

  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      const matchFilter =
        filterLevel === 'ALL' || r.riskLevel === filterLevel;
      const q = searchQuery.trim().toLowerCase();
      const matchSearch =
        !q ||
        r.roomNumber.toLowerCase().includes(q) ||
        r.tenantName.toLowerCase().includes(q) ||
        r.primaryFactor.toLowerCase().includes(q);
      return matchFilter && matchSearch;
    });
  }, [rooms, filterLevel, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4">
        {/* 1. Global Navigation Bar */}
        <ResearcherLabNavBar />

        {/* 2. Executive Page Header */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-rose-50 border border-rose-200 text-rose-600 flex items-center justify-center text-xl shadow-xs shrink-0">
              🛡️
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  ศูนย์วิเคราะห์ความเสี่ยง (Risk Intelligence & Web Push)
                </h1>
                <span className="px-2 py-0.5 rounded-md bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-black uppercase">
                  Real-Time
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                ประเมินความเสี่ยง 3 มิติ (การเงิน พลังงานไฟฟ้า สัญญา) พร้อมยิงแจ้งเตือน Web Push อัตโนมัติ
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <button
              onClick={handleSubscribePush}
              disabled={subscribing}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                isSubscribed
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-blue-600 hover:bg-blue-700 text-white border-blue-600 shadow-xs'
              }`}
            >
              <span>{isSubscribed ? '🟢' : '🔔'}</span>
              <span>{subscribing ? 'กำลังเชื่อมต่อ...' : isSubscribed ? 'เครื่องนี้เปิดรับ Push แล้ว' : 'เปิดรับ Push บนเครื่องนี้'}</span>
            </button>

            <button
              onClick={fetchRiskData}
              disabled={loading}
              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold text-xs border border-slate-200 transition-all cursor-pointer"
              title="รีเฟรชข้อมูล"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Status Toast */}
        {pushStatus && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs font-bold flex items-center justify-between shadow-xs animate-in fade-in">
            <span>{pushStatus}</span>
            <button onClick={() => setPushStatus(null)} className="text-blue-500 hover:text-blue-700">✕</button>
          </div>
        )}

        {/* 3. Core KPI Bento Cards (5 Metrics) */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Card 1: Overall Risk */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-bold">ดัชนีความเสี่ยงรวม</span>
              <span>🛡️</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-slate-900 font-mono">
                {summary ? `${summary.overallRiskIndex}%` : '14%'}
              </span>
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                {summary?.overallStatus === 'CRITICAL' ? 'วิกฤต' : summary?.overallStatus === 'WARNING' ? 'เฝ้าระวัง' : 'ปลอดภัย'}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">20 ห้องพักในระบบ</div>
          </div>

          {/* Card 2: High Risk Rooms */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-bold">ห้องเสี่ยงสูง (≥70)</span>
              <span>🚨</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600 font-mono">
                {summary ? summary.criticalRoomsCount : 2}
              </span>
              <span className="text-xs text-slate-500 font-bold">ห้อง</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">ห้อง 204, 104</div>
          </div>

          {/* Card 3: Financial Exposure */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-bold">ยอดหนี้เสี่ยงทิ้งมัดจำ</span>
              <span>💰</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-rose-600 font-mono">
                ฿{summary ? summary.totalExposureAmount.toLocaleString() : '18,176'}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-rose-600 font-bold">เกินเกณฑ์เงินประกัน</div>
          </div>

          {/* Card 4: Electrical Anomalies */}
          <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-bold">จุดตรวจจับไฟฟ้าผิดปกติ</span>
              <span>⚡</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-amber-600 font-mono">
                {summary ? summary.electricalAnomaliesCount : 2}
              </span>
              <span className="text-xs text-slate-500 font-bold">จุด</span>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">ห้อง 110 (45W), ห้อง 210</div>
          </div>

          {/* Card 5: Push Subscribers */}
          <div className="col-span-2 lg:col-span-1 p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs flex flex-col justify-between">
            <div className="flex items-center justify-between text-slate-500 text-xs">
              <span className="font-bold">อุปกรณ์รับ Web Push</span>
              <span>📲</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-2xl font-black text-blue-600 font-mono">
                {summary ? summary.pushSubscribersCount : 4}
              </span>
              <span className="text-xs text-slate-500 font-bold">เครื่อง</span>
            </div>
            <div className="mt-2 text-[11px] text-emerald-600 font-bold">พร้อมรับแจ้งเตือนสด</div>
          </div>
        </div>

        {/* 4. Live Web Push Simulator & Triggers Strip */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-base">🚀</span>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                ศูนย์ทดสอบยิง Web Push เรียลไทม์ (Simulation Triggers)
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">กดปุ่มเพื่อทดสอบเด้งแจ้งเตือนบนเบราว์เซอร์</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <button
              onClick={() => handleSimulatePush('financial', '104')}
              disabled={Boolean(simulating)}
              className="p-3 rounded-xl border border-rose-200 bg-rose-50/70 hover:bg-rose-100 text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-rose-900">🚨 หนี้ค้างเกินเงินประกัน</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-200 text-rose-800 font-bold">ห้อง 104</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                {simulating === 'financial' ? 'กำลังส่ง Push...' : '฿5,775 + ค่าปรับ (ชนมัดจำ) →'}
              </div>
            </button>

            <button
              onClick={() => handleSimulatePush('phantom', '110')}
              disabled={Boolean(simulating)}
              className="p-3 rounded-xl border border-purple-200 bg-purple-50/70 hover:bg-purple-100 text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-purple-900">⚡ Phantom Load ห้องว่าง</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-200 text-purple-800 font-bold">ห้อง 110</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                {simulating === 'phantom' ? 'กำลังส่ง Push...' : 'โหลด 45W ขณะว่าง →'}
              </div>
            </button>

            <button
              onClick={() => handleSimulatePush('overload', '101')}
              disabled={Boolean(simulating)}
              className="p-3 rounded-xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-amber-900">🔥 โหลดเกินพิกัด 3,200W</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-bold">ห้อง 101</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                {simulating === 'overload' ? 'กำลังส่ง Push...' : 'ตัดไฟรีเลย์ฉุกเฉิน →'}
              </div>
            </button>

            <button
              onClick={() => handleSimulatePush('contract', '108')}
              disabled={Boolean(simulating)}
              className="p-3 rounded-xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-left transition-all cursor-pointer disabled:opacity-50"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-black text-blue-900">📋 สัญญาหมดใน 12 วัน</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-200 text-blue-800 font-bold">ห้อง 108</span>
              </div>
              <div className="text-[11px] text-slate-600 mt-1 font-mono">
                {simulating === 'contract' ? 'กำลังส่ง Push...' : 'ยังไม่ส่งคำขอต่อสัญญา →'}
              </div>
            </button>
          </div>
        </div>

        {/* 5. 20-Room Risk Ranking Matrix Table */}
        <div className="p-4 rounded-2xl bg-white border border-slate-200/90 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
              {(
                [
                  { key: 'ALL', label: 'ทั้งหมด (20)' },
                  { key: 'CRITICAL', label: 'วิกฤต (≥70)' },
                  { key: 'MEDIUM', label: 'เฝ้าระวัง (40-69)' },
                  { key: 'LOW', label: 'ปกติ (<40)' },
                ] as const
              ).map((tab) => {
                const active = filterLevel === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setFilterLevel(tab.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-blue-600 text-white font-black shadow-xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="ค้นหาเลขห้อง หรือชื่อ..."
                className="w-full sm:w-56 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-bold">
                    <th className="py-2.5 px-3">ห้อง</th>
                    <th className="py-2.5 px-3">ผู้เช่า</th>
                    <th className="py-2.5 px-3 text-center">คะแนนความเสี่ยง</th>
                    <th className="py-2.5 px-3">ปัจจัยเสี่ยงหลัก</th>
                    <th className="py-2.5 px-3 text-center">รีเลย์</th>
                    <th className="py-2.5 px-3 text-right">ดำเนินการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-400 font-bold text-xs">
                        กำลังประเมินดัชนีความเสี่ยงทั้ง 20 ห้องพัก...
                      </td>
                    </tr>
                  ) : filteredRooms.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                        ไม่พบข้อมูลที่ตรงกับเงื่อนไข
                      </td>
                    </tr>
                  ) : (
                    filteredRooms.map((r, idx) => (
                      <tr key={r.roomNumber} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="font-mono font-black text-slate-900 text-sm">
                            {r.roomNumber}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap font-bold text-slate-800">
                          {r.tenantName}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md font-mono text-xs font-black border ${
                              r.riskLevel === 'CRITICAL'
                                ? 'bg-rose-50 text-rose-700 border-rose-200'
                                : r.riskLevel === 'MEDIUM'
                                ? 'bg-amber-50 text-amber-700 border-amber-200'
                                : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            }`}
                          >
                            <span>{r.totalScore}</span>
                            <span className="text-[10px] font-sans">
                              {r.riskLevel === 'CRITICAL' ? 'วิกฤต' : r.riskLevel === 'MEDIUM' ? 'เตือน' : 'ปกติ'}
                            </span>
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 text-xs font-mono max-w-[320px] truncate">
                          {r.primaryFactor}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-black ${
                              r.relayStatus === 'ON'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border border-rose-200'
                            }`}
                          >
                            {r.relayStatus}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() =>
                              handleSimulatePush(
                                r.totalOverdue > 0 ? 'financial' : r.roomNumber === '110' ? 'phantom' : 'overload',
                                r.roomNumber
                              )
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 hover:text-slate-900 font-bold text-[11px] border border-slate-200 transition-all cursor-pointer"
                          >
                            ยิง Push เตือน
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
