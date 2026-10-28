'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { subscribeDeviceToWebPush } from '@/lib/features/web-push-client';

interface RoomRiskItem {
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

export default function OwnerRiskDashboardPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<RiskSummary | null>(null);
  const [rooms, setRooms] = useState<RoomRiskItem[]>([]);
  const [filterLevel, setFilterLevel] = useState<'ALL' | 'CRITICAL' | 'MEDIUM' | 'LOW'>('ALL');
  const [filterFloor, setFilterFloor] = useState<'ALL' | '1' | '2'>('ALL');
  const [pushStatus, setPushStatus] = useState<string>('');
  const [isSubscribing, setIsSubscribing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const fetchRiskData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/risk');
      const data = await res.json();
      if (data.success) {
        setSummary(data.summary);
        setRooms(data.rooms);
      }
    } catch (err) {
      console.error('Fetch risk data error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiskData();
  }, []);

  const handleSubscribePush = async () => {
    try {
      setIsSubscribing(true);
      setPushStatus('กำลังลงทะเบียนอุปกรณ์...');
      const success = await subscribeDeviceToWebPush({
        role: 'owner',
        userId: (session?.user as any)?.id || 'owner-admin',
      });
      if (success) {
        setPushStatus('✅ เปิดรับการแจ้งเตือนสำเร็จ');
        fetchRiskData();
      } else {
        setPushStatus('❌ ไม่สามารถลงทะเบียนได้ (กรุณาอนุญาต Notification)');
      }
    } catch (error: any) {
      setPushStatus('❌ เกิดข้อผิดพลาด: ' + error.message);
    } finally {
      setIsSubscribing(false);
      setTimeout(() => setPushStatus(''), 5000);
    }
  };

  const handleTriggerSimulation = async (scenario: string, roomNumber?: string) => {
    try {
      setActionMessage('กำลังส่งแจ้งเตือน Web Push...');
      const res = await fetch('/api/owner/risk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_simulation',
          scenario,
          roomNumber,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setActionMessage(`🔔 ${data.message}`);
      } else {
        setActionMessage(`⚠️ ${data.message}`);
      }
    } catch (err: any) {
      setActionMessage(`❌ ส่งไม่สำเร็จ: ${err.message}`);
    } finally {
      setTimeout(() => setActionMessage(null), 4000);
    }
  };

  const filteredRooms = rooms.filter((r) => {
    if (filterLevel !== 'ALL' && r.riskLevel !== filterLevel) return false;
    if (filterFloor !== 'ALL' && String(r.floor) !== filterFloor) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-slate-500 mb-1">
            <Link href="/owner" className="hover:text-primary transition-colors">
              ภาพรวมหอพัก
            </Link>
            <span>/</span>
            <span className="text-primary">วิเคราะห์ความเสี่ยง</span>
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2.5">
            <span>🛡️</span>
            <span>ศูนย์วิเคราะห์ความเสี่ยง (Risk Intelligence)</span>
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSubscribePush}
            disabled={isSubscribing}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-black shadow-xs transition-all flex items-center gap-2"
          >
            <span>🔔</span>
            <span>{isSubscribing ? 'กำลังเชื่อมต่อ...' : 'เปิดรับ Web Push'}</span>
          </button>

          <button
            onClick={fetchRiskData}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
          >
            <span className={loading ? 'animate-spin' : ''}>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Status Alerts */}
      {pushStatus && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-bold bg-slate-900 text-white shadow-xs">
          {pushStatus}
        </div>
      )}
      {actionMessage && (
        <div className="px-4 py-2.5 rounded-xl text-xs font-bold bg-primary text-white shadow-xs animate-fadeIn">
          {actionMessage}
        </div>
      )}

      {/* 2. 5 Bento KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* KPI 1 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold">
            <span>ดัชนีความเสี่ยงรวม</span>
            <span>📊</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900">
              {summary ? summary.overallRiskIndex : 13}%
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              ปกติ
            </span>
          </div>
          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all"
              style={{ width: `${summary?.overallRiskIndex || 13}%` }}
            />
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold">
            <span>ห้องเฝ้าระวัง</span>
            <span>⚠️</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-amber-600">
              {summary ? summary.warningRoomsCount : 2}
            </span>
            <span className="text-xs text-slate-400 font-bold">จาก 20 ห้อง</span>
          </div>
          <p className="text-[11px] text-amber-700 font-bold truncate">ห้อง 104, 204 (หนี้ค้างชำระ)</p>
        </div>

        {/* KPI 3 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold">
            <span>มูลหนี้เสี่ยงสะสม</span>
            <span>💰</span>
          </div>
          <div className="text-2xl font-black font-mono text-rose-600 truncate">
            ฿{summary ? summary.totalExposureAmount.toLocaleString() : '19,376'}
          </div>
          <p className="text-[11px] text-slate-500 font-bold truncate">2 ห้องใกล้ชนเงินประกัน</p>
        </div>

        {/* KPI 4 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold">
            <span>ตรวจพบผิดปกติ</span>
            <span>⚡</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-blue-600">
              {summary ? summary.electricalAnomaliesCount : 2}
            </span>
            <span className="text-xs text-slate-400 font-bold">จุด</span>
          </div>
          <p className="text-[11px] text-slate-500 font-bold truncate">ห้อง 110, 210</p>
        </div>

        {/* KPI 5 */}
        <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-2 col-span-2 lg:col-span-1">
          <div className="flex justify-between items-center text-slate-500 text-xs font-bold">
            <span>ผู้รับ Web Push</span>
            <span>🔔</span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-slate-900">
              {summary ? summary.pushSubscribersCount : 1}
            </span>
            <span className="text-xs text-slate-400 font-bold">อุปกรณ์</span>
          </div>
          <p className="text-[11px] text-emerald-600 font-bold truncate">● ระบบพร้อมส่งเตือน</p>
        </div>
      </div>

      {/* 3. Quick Push Notification Dispatcher */}
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <span>⚡</span>
            <span>ส่งแจ้งเตือนภัยเร่งด่วน (Web Push Broadcast)</span>
          </span>
          <span className="text-[10px] text-slate-400 font-bold">ส่งตรงเข้ามือถือและบราวเซอร์</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button
            onClick={() => handleTriggerSimulation('financial', '104')}
            className="p-3 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl text-left transition-all group"
          >
            <span className="text-base block mb-1">🚨</span>
            <span className="text-xs font-black text-rose-800 block">เตือนหนี้เกินมัดจำ</span>
            <span className="text-[10px] text-rose-600 block mt-0.5">ห้อง 104 (฿6,075)</span>
          </button>

          <button
            onClick={() => handleTriggerSimulation('phantom', '110')}
            className="p-3 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-xl text-left transition-all group"
          >
            <span className="text-base block mb-1">⚡</span>
            <span className="text-xs font-black text-amber-800 block">เตือน Phantom Load</span>
            <span className="text-[10px] text-amber-600 block mt-0.5">ห้อง 110 (ใช้ไฟขณะว่าง)</span>
          </button>

          <button
            onClick={() => handleTriggerSimulation('overload', '101')}
            className="p-3 bg-purple-50 hover:bg-purple-100 border border-purple-200 rounded-xl text-left transition-all group"
          >
            <span className="text-base block mb-1">🔥</span>
            <span className="text-xs font-black text-purple-800 block">เตือนโหลดเกินพิกัด</span>
            <span className="text-[10px] text-purple-600 block mt-0.5">ห้อง 101 (ตัดไฟฉุกเฉิน)</span>
          </button>

          <button
            onClick={() => handleTriggerSimulation('contract', '108')}
            className="p-3 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl text-left transition-all group"
          >
            <span className="text-base block mb-1">📋</span>
            <span className="text-xs font-black text-blue-800 block">เตือนสัญญาใกล้หมด</span>
            <span className="text-[10px] text-blue-600 block mt-0.5">ห้อง 108 (เหลือ 12 วัน)</span>
          </button>
        </div>
      </div>

      {/* 4. 20-Room Risk Matrix Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {/* Table Filters Header */}
        <div className="p-4 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700">
              ผังการประเมินความเสี่ยงรายห้อง (20 ห้อง)
            </span>
            <span className="px-2 py-0.5 bg-slate-200 text-slate-700 rounded-full text-[10px] font-bold">
              {filteredRooms.length} ห้อง
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Level Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                onClick={() => setFilterLevel('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterLevel === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setFilterLevel('MEDIUM')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterLevel === 'MEDIUM' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                เฝ้าระวัง
              </button>
              <button
                onClick={() => setFilterLevel('LOW')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterLevel === 'LOW' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600'
                }`}
              >
                ปกติ
              </button>
            </div>

            {/* Floor Filter */}
            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                onClick={() => setFilterFloor('ALL')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterFloor === 'ALL' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                ทุกชั้น
              </button>
              <button
                onClick={() => setFilterFloor('1')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterFloor === '1' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                ชั้น 1
              </button>
              <button
                onClick={() => setFilterFloor('2')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  filterFloor === '2' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600'
                }`}
              >
                ชั้น 2
              </button>
            </div>
          </div>
        </div>

        {/* Table Content */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold">
              <tr>
                <th className="py-3 px-4">ห้อง</th>
                <th className="py-3 px-4">ผู้เช่า</th>
                <th className="py-3 px-4 text-center">คะแนน</th>
                <th className="py-3 px-4">ระดับ</th>
                <th className="py-3 px-4">สาเหตุหลัก</th>
                <th className="py-3 px-4 text-center">กำลังไฟ / รีเลย์</th>
                <th className="py-3 px-4 text-right">การจัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 font-bold">
                    กำลังประมวลผลข้อมูลความเสี่ยง...
                  </td>
                </tr>
              ) : filteredRooms.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-400 font-bold">
                    ไม่พบห้องตามเงื่อนไขที่เลือก
                  </td>
                </tr>
              ) : (
                filteredRooms.map((r) => {
                  const isWarning = r.riskLevel === 'MEDIUM';
                  const isNormal = r.riskLevel === 'LOW';

                  return (
                    <tr
                      key={r.roomNumber}
                      className={`hover:bg-slate-50 transition-colors ${
                        isWarning ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Room */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-900 font-mono text-sm">
                            {r.roomNumber}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              r.roomStatus === 'Occupied'
                                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                : r.roomStatus === 'Maintenance'
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {r.roomStatus === 'Occupied'
                              ? 'พักอยู่'
                              : r.roomStatus === 'Maintenance'
                              ? 'ซ่อมบำรุง'
                              : 'ว่าง'}
                          </span>
                        </div>
                      </td>

                      {/* Tenant */}
                      <td className="py-3 px-4">
                        <span className="font-bold text-slate-800">{r.tenantName}</span>
                      </td>

                      {/* Score */}
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`font-black font-mono text-sm ${
                            isWarning ? 'text-amber-700' : 'text-slate-700'
                          }`}
                        >
                          {r.totalScore}
                        </span>
                      </td>

                      {/* Level */}
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                            isWarning
                              ? 'bg-amber-100 text-amber-800 border border-amber-300'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}
                        >
                          {isWarning ? 'เฝ้าระวัง' : 'ปกติ'}
                        </span>
                      </td>

                      {/* Primary Factor */}
                      <td className="py-3 px-4">
                        <span
                          className={`font-medium ${
                            isWarning ? 'text-amber-900 font-bold' : 'text-slate-600'
                          }`}
                        >
                          {r.primaryFactor}
                        </span>
                      </td>

                      {/* Electrical Watt & Relay */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <span className="font-mono text-xs text-slate-700 font-bold">
                            {r.activeWatt}W
                          </span>
                          <span
                            className={`px-1.5 py-0.2 rounded text-[9px] font-black ${
                              r.relayStatus === 'ON'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-rose-100 text-rose-800'
                            }`}
                          >
                            {r.relayStatus}
                          </span>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {r.financialScore > 0 ? (
                            <Link
                              href="/owner/billing"
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-[11px] transition-colors"
                            >
                              ตรวจบิล
                            </Link>
                          ) : r.energyScore >= 25 ? (
                            <Link
                              href="/owner/meters"
                              className="px-2.5 py-1 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-bold text-[11px] transition-colors"
                            >
                              ตรวจมิเตอร์
                            </Link>
                          ) : r.contractScore > 0 ? (
                            <Link
                              href="/owner/contracts"
                              className="px-2.5 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-[11px] transition-colors"
                            >
                              ตรวจสัญญา
                            </Link>
                          ) : (
                            <Link
                              href="/owner/rooms"
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[11px] transition-colors"
                            >
                              ดูผังห้อง
                            </Link>
                          )}

                          <button
                            onClick={() =>
                              handleTriggerSimulation(
                                r.financialScore > 0
                                  ? 'financial'
                                  : r.energyScore >= 25
                                  ? 'phantom'
                                  : 'contract',
                                r.roomNumber
                              )
                            }
                            title="ส่งแจ้งเตือนด่วนสำหรับห้องนี้"
                            className="p-1 rounded-lg hover:bg-slate-100 text-slate-600 transition-colors"
                          >
                            🔔
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
