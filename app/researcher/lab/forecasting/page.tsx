'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import {
  SEASON_MULTIPLIERS,
  type SeasonScenario,
  type MonthlyForecastPoint,
  type RoomForecastSummary,
} from '@/lib/features/utility-forecasting';

export default function Module5ForecastingLabPage() {
  const [scenario, setScenario] = useState<SeasonScenario>('NORMAL');
  const [ratePerKwh, setRatePerKwh] = useState<number>(7);
  const [selectedRoomNo, setSelectedRoomNo] = useState<string>('ALL');

  const [buildingSeries, setBuildingSeries] = useState<MonthlyForecastPoint[]>([]);
  const [roomForecasts, setRoomForecasts] = useState<RoomForecastSummary[]>([]);
  const [summary, setSummary] = useState<{
    currentTotalKwh: number;
    nextMonthTotalKwh: number;
    nextMonthTotalElectricThb: number;
    nextMonthTotalRevenueThb: number;
    anomalyRiskCount: number;
    anomalyRiskRooms: string[];
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [pushBanner, setPushBanner] = useState<string | null>(null);

  const loadForecast = useCallback(async (scen: SeasonScenario, rate: number) => {
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        scenario: scen,
        rate: String(rate),
      });
      const res = await fetch(`/api/features/forecasting?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setBuildingSeries(json.buildingSeries || []);
        setRoomForecasts(json.roomForecasts || []);
        setSummary(json.summary || null);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadForecast(scenario, ratePerKwh);
  }, [scenario, ratePerKwh, loadForecast]);

  const activeRoom =
    selectedRoomNo === 'ALL'
      ? null
      : roomForecasts.find((r) => r.roomNumber === selectedRoomNo) || null;

  const activeSeries: MonthlyForecastPoint[] = activeRoom ? activeRoom.series : buildingSeries;
  const maxKwhInSeries = Math.max(100, ...activeSeries.map((p) => p.upperKwh));

  const sendPreBillingWarningPush = async () => {
    const riskRooms = roomForecasts.filter((r) => r.isAnomalyRisk);
    const targetLabel =
      activeRoom
        ? `ห้อง ${activeRoom.roomNumber} (คาดการณ์เดือนหน้า ${activeRoom.nextMonthKwh} kWh • ฿${activeRoom.nextMonthCostThb.toLocaleString()})`
        : `ห้องเสี่ยงไฟเกินเกณฑ์: ${riskRooms.map((r) => r.roomNumber).join(', ') || '104, 108, 205'}`;

    const title = `📈 แจ้งเตือนพยากรณ์ค่าไฟล่วงหน้า (${SEASON_MULTIPLIERS[scenario].label})`;
    const message = `${targetLabel} แนะนำตรวจสอบเครื่องปรับอากาศเพื่อประหยัดค่าไฟก่อนตัดรอบบิล`;

    setPushBanner(`${title} — ${message}`);
    setTimeout(() => setPushBanner(null), 6000);

    try {
      await fetch('/api/features/forecasting', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber: activeRoom?.roomNumber || 'ALL',
          title,
          message,
        }),
      });
    } catch {
      // ignore
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <ResearcherLabNavBar />

      <div>
        <Link href="/researcher/lab" className="text-xs font-bold text-cyan-400 hover:underline">
          ← กลับสู่ศูนย์ปฏิบัติการฟีเจอร์ใหม่ (6 MIS Modules)
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
          📈 โมดูล 5: Time-Series Revenue & Utility Forecasting (พยากรณ์ค่าไฟล่วงหน้า)
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          5.1.1 ระบบพยากรณ์หน่วยการใช้ไฟฟ้าและค่าไฟล่วงหน้า 1–3 เดือน (WMA + Holt Linear Trend + Seasonal Index) สำหรับทั้ง 20 ห้อง
        </p>
      </div>

      {pushBanner && (
        <div className="rounded-2xl bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 border border-cyan-400/50 p-4 text-xs sm:text-sm font-bold text-cyan-200 shadow-xl">
          🔔 ส่งแจ้งเตือนพยากรณ์ล่วงหน้าแล้ว: <span className="text-white">{pushBanner}</span>
        </div>
      )}

      {/* Top KPI Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4">
            <span className="text-[11px] font-bold text-slate-400">หน่วยไฟรวมเดือนปัจจุบัน (20 ห้อง)</span>
            <div className="text-2xl font-black text-white mt-0.5">
              {summary.currentTotalKwh.toLocaleString()} <span className="text-xs text-slate-400">kWh</span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/30 p-4">
            <span className="text-[11px] font-bold text-cyan-300">พยากรณ์หน่วยไฟเดือนหน้า (+1 ด.)</span>
            <div className="text-2xl font-black text-cyan-400 mt-0.5">
              {summary.nextMonthTotalKwh.toLocaleString()} <span className="text-xs text-cyan-200">kWh</span>
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 border border-amber-500/30 p-4">
            <span className="text-[11px] font-bold text-amber-300">
              พยากรณ์ค่าไฟรวมเดือนหน้า (฿{ratePerKwh}/หน่วย)
            </span>
            <div className="text-2xl font-black text-amber-400 mt-0.5">
              ฿{summary.nextMonthTotalElectricThb.toLocaleString()}
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900/80 border border-emerald-500/30 p-4">
            <span className="text-[11px] font-bold text-emerald-300">พยากรณ์รายรับรวมหอพักเดือนหน้า</span>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">
              ฿{summary.nextMonthTotalRevenueThb.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {/* Main Content Grid: Left 8 Cols = Chart & 20-Room Table, Right 4 Cols = Unified Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns */}
        <div className="lg:col-span-8 space-y-5">
          {/* Time-Series Bar & Confidence Interval Chart */}
          <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-4 shadow-xl">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                  TIME-SERIES FORECASTING (6 เดือนย้อนหลัง + พยากรณ์ล่วงหน้า 3 เดือน)
                </span>
                <h2 className="text-lg font-black text-white">
                  {activeRoom
                    ? `กราฟพยากรณ์ค่าไฟ ห้อง ${activeRoom.roomNumber} (${activeRoom.tenantName || 'ห้องว่าง'})`
                    : 'กราฟพยากรณ์การใช้ไฟฟ้าและค่าไฟรวมทั้งอาคาร (20 ห้อง)'}
                </h2>
              </div>

              <div className="flex items-center gap-3 text-[11px] font-bold">
                <span className="flex items-center gap-1.5 text-sky-300">
                  <span className="w-3 h-3 rounded bg-sky-500 inline-block" /> ข้อมูลจริงย้อนหลัง
                </span>
                <span className="flex items-center gap-1.5 text-amber-300">
                  <span className="w-3 h-3 rounded bg-amber-400 inline-block" /> พยากรณ์ล่วงหน้า (+1 ถึง +3 เดือน)
                </span>
              </div>
            </div>

            {loading ? (
              <div className="h-56 flex items-center justify-center text-sm text-slate-400">
                กำลังคำนวณอนุกรมเวลา...
              </div>
            ) : (
              <div className="pt-4">
                <div className="grid grid-cols-9 gap-2 items-end h-56 pt-6 px-2 border-b border-white/10">
                  {activeSeries.map((pt, idx) => {
                    const heightPct = Math.max(8, Math.round((pt.kwh / maxKwhInSeries) * 100));
                    const isHigh = activeRoom ? pt.kwh >= 250 : false;
                    return (
                      <div key={idx} className="flex flex-col items-center justify-end h-full group">
                        <div className="text-[10px] font-black text-white mb-1 text-center">
                          {pt.kwh.toLocaleString()}
                          <span className="block text-[9px] text-amber-300 font-normal">
                            ฿{pt.electricCostThb.toLocaleString()}
                          </span>
                        </div>
                        <div
                          style={{ height: `${heightPct}%` }}
                          className={`w-full max-w-[42px] rounded-t-xl transition-all ${
                            pt.isForecast
                              ? isHigh
                                ? 'bg-gradient-to-t from-rose-600 to-amber-400 border border-rose-300'
                                : 'bg-gradient-to-t from-amber-500 to-yellow-300 border border-amber-200'
                              : 'bg-gradient-to-t from-sky-600 to-cyan-400'
                          }`}
                        />
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-9 gap-2 pt-2 text-center">
                  {activeSeries.map((pt, idx) => (
                    <div
                      key={idx}
                      className={`text-[10px] font-bold leading-tight ${
                        pt.isForecast ? 'text-amber-300' : 'text-slate-400'
                      }`}
                    >
                      {pt.monthLabel}
                      {pt.isForecast && (
                        <span className="block text-[9px] text-slate-500">
                          ({pt.lowerKwh}–{pt.upperKwh})
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 20-Room Next-Month Forecast Table */}
          <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-5 space-y-3 shadow-xl">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h3 className="text-sm sm:text-base font-black text-white">
                📋 ตารางพยากรณ์ค่าไฟล่วงหน้ารายห้อง (ครบทั้ง 20 ห้อง • คลิกเพื่อดูกราฟรายห้อง)
              </h3>
              {selectedRoomNo !== 'ALL' && (
                <button
                  type="button"
                  onClick={() => setSelectedRoomNo('ALL')}
                  className="px-3 py-1 rounded-lg bg-cyan-500/20 text-cyan-300 text-xs font-bold hover:bg-cyan-500/30"
                >
                  ดูภาพรวมทั้งตึก (20 ห้อง)
                </button>
              )}
            </div>

            <div className="max-h-80 overflow-y-auto pr-1">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-white/10 text-slate-400">
                    <th className="py-2 px-2">ห้อง</th>
                    <th className="py-2 px-2">ผู้เช่า</th>
                    <th className="py-2 px-2 text-right">เดือนนี้ (kWh)</th>
                    <th className="py-2 px-2 text-right">พยากรณ์เดือนหน้า</th>
                    <th className="py-2 px-2 text-right">ค่าไฟคาดการณ์</th>
                    <th className="py-2 px-2 text-center">แนวโน้ม</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {roomForecasts.map((rf) => {
                    const isSel = selectedRoomNo === rf.roomNumber;
                    return (
                      <tr
                        key={rf.roomNumber}
                        onClick={() => setSelectedRoomNo(rf.roomNumber)}
                        className={`cursor-pointer transition-colors ${
                          isSel ? 'bg-cyan-500/20' : 'hover:bg-white/5'
                        }`}
                      >
                        <td className="py-2.5 px-2 font-mono font-black text-white">
                          ห้อง {rf.roomNumber} <span className="text-[10px] text-slate-400">(ชั้น {rf.floor})</span>
                        </td>
                        <td className="py-2.5 px-2 text-slate-300 truncate max-w-[140px]">
                          {rf.tenantName || 'ห้องว่าง'}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono text-slate-300">
                          {rf.currentMonthKwh} kWh
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-black text-amber-300">
                          {rf.nextMonthKwh} kWh
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono font-black text-emerald-300">
                          ฿{rf.nextMonthCostThb.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-2 text-center">
                          {rf.isAnomalyRisk ? (
                            <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-500/40 text-rose-300 text-[10px] font-black">
                              🚨 เสี่ยงไฟสูง ({rf.trendPercent > 0 ? `+${rf.trendPercent}%` : `${rf.trendPercent}%`})
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400">
                              {rf.trendPercent > 0 ? `+${rf.trendPercent}%` : `${rf.trendPercent}%`}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right 4 Columns: Single Unified Control Panel */}
        <div className="lg:col-span-4 rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-5 space-y-5 shadow-2xl">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
              FORECASTING CONTROL PANEL
            </span>
            <h2 className="text-base font-black text-white mt-0.5">
              แผงควบคุมปัจจัยพยากรณ์ค่าไฟล่วงหน้า
            </h2>
          </div>

          {/* 1. Season / Scenario Selector */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-300 block">
              1. เลือกสถานการณ์/ฤดูกาล (Seasonal Factor):
            </label>
            <div className="space-y-2">
              {(Object.keys(SEASON_MULTIPLIERS) as SeasonScenario[]).map((key) => {
                const item = SEASON_MULTIPLIERS[key];
                const active = scenario === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setScenario(key)}
                    className={`w-full text-left p-3 rounded-2xl border transition-all ${
                      active
                        ? 'bg-cyan-500/20 border-cyan-400 text-white'
                        : 'bg-slate-950/80 border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <div className="text-xs font-black">{item.label}</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{item.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Electricity Rate per Unit */}
          <div className="space-y-2 pt-2 border-t border-white/10">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-slate-300">2. อัตราค่าไฟฟ้าต่อหน่วย:</span>
              <span className="font-black text-amber-300">฿{ratePerKwh} / kWh</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[6, 7, 8].map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRatePerKwh(r)}
                  className={`py-2 rounded-xl text-xs font-black border transition-all ${
                    ratePerKwh === r
                      ? 'bg-amber-500 text-slate-950 border-amber-400'
                      : 'bg-slate-950 text-slate-300 border-white/10'
                  }`}
                >
                  ฿{r} / หน่วย
                </button>
              ))}
            </div>
          </div>

          {/* 3. Room Selector & Anomaly Alert Push */}
          <div className="space-y-3 pt-2 border-t border-white/10">
            <label className="text-xs font-bold text-slate-300 block">
              3. เลือกขอบเขตการแสดงผลกราฟ:
            </label>
            <select
              value={selectedRoomNo}
              onChange={(e) => setSelectedRoomNo(e.target.value)}
              className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs font-bold text-white"
            >
              <option value="ALL">🏢 ภาพรวมทั้งอาคาร (20 ห้อง • ชั้น 1 และ ชั้น 2)</option>
              {roomForecasts.map((rf) => (
                <option key={rf.roomNumber} value={rf.roomNumber}>
                  ห้อง {rf.roomNumber} ({rf.tenantName || 'ห้องว่าง'}) — คาดการณ์ {rf.nextMonthKwh} kWh
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={sendPreBillingWarningPush}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all"
            >
              🔔 ส่ง Web Push เตือนล่วงหน้าห้องเสี่ยงค่าไฟพุ่ง ({summary?.anomalyRiskCount || 0} ห้อง)
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
