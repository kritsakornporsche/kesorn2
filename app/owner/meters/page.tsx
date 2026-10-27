'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { useRates } from '@/lib/use-rates';
import { statusText } from '@/lib/status-text';
import { isTestRoom } from '@/lib/test-rooms';
import TestRoomBadge from '@/components/TestRoomBadge';

interface RoomMeterSummary {
  room_id: number;
  room_number: string;
  floor: number;
  room_type: string;
  room_status: string;
  latest_cycle: string;
  latest_reading: number | null;
  previous_reading: number | null;
  units_used: number | null;
  photo_url: string | null;
  created_at: string | null;
  needs_reading: boolean;
  tenant_name?: string | null;
  // Merged IoT Data
  iotNodeMode?: string;
  iotOnline?: boolean;
  activePowerWatt?: number;
  voltage?: number;
  currentAmp?: number;
  relayState?: 'ON' | 'OFF';
  currentMeterKwh?: number;
  isHighLoad?: boolean;
  isVacantWithLoad?: boolean;
}

export default function MetersOverviewPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const rates = useRates();

  const [rooms, setRooms] = useState<RoomMeterSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingIot, setSyncingIot] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Search, Filter, Pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [togglingRelayRoom, setTogglingRelayRoom] = useState<string | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const [sumRes, iotRes] = await Promise.all([
        fetch('/api/owner/meters/summary'),
        fetch('/api/features/iot-meter').catch(() => null),
      ]);

      const sumData = await sumRes.json();
      let iotRoomsMap = new Map<string, any>();

      if (iotRes && iotRes.ok) {
        try {
          const iotData = await iotRes.json();
          if (iotData.success && Array.isArray(iotData.rooms)) {
            iotData.rooms.forEach((r: any) => {
              iotRoomsMap.set(String(r.roomNumber).toUpperCase(), r);
            });
          }
        } catch (err) {
          console.warn('Parse IoT data failed:', err);
        }
      }

      if (sumData.success) {
        const rawRooms = sumData.data || [];
        const merged: RoomMeterSummary[] = rawRooms.map((r: any) => {
          const roomKey = String(r.room_number).toUpperCase();
          const iot = iotRoomsMap.get(roomKey);

          const isOnline = iot ? (iot.esp32Meta?.espStatus === 'ONLINE' || iot.esp32Meta?.isHardwareConnected === true) : false;
          const powerWatt = iot ? Number(iot.activePowerWatt || 0) : 0;
          const volt = iot ? Number(iot.voltage || 220) : 220;
          const amp = iot ? Number(iot.current || 0) : 0;
          const relay = (iot?.relayState === 'OFF' ? 'OFF' : 'ON') as 'ON' | 'OFF';
          const kwh = iot ? Number(iot.currentMeterKwh ?? r.latest_reading ?? 0) : (r.latest_reading !== null ? Number(r.latest_reading) : null);

          const isVacant = r.room_status === 'Available' || r.room_status === 'ว่าง';
          const isVacantWithLoad = isVacant && powerWatt > 15;
          const isHighLoad = powerWatt >= 2500;

          return {
            ...r,
            iotNodeMode: iot?.nodeMode || 'SMART_SIMULATOR',
            iotOnline: isOnline,
            activePowerWatt: powerWatt,
            voltage: volt,
            currentAmp: amp,
            relayState: relay,
            currentMeterKwh: kwh !== null ? kwh : undefined,
            isHighLoad,
            isVacantWithLoad,
          };
        });

        setRooms(merged);
      }
    } catch (e) {
      console.error('Fetch meters error:', e);
      showToast('ไม่สามารถโหลดข้อมูลมิเตอร์ได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/meters');
      return;
    }
    fetchSummary();
  }, [authStatus, router]);

  // Handle Relay Switch
  const handleToggleRelay = async (roomNumber: string, currentState: 'ON' | 'OFF') => {
    const nextState = currentState === 'ON' ? 'OFF' : 'ON';
    setTogglingRelayRoom(roomNumber);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_relay',
          roomNumber,
          targetState: nextState,
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`⚡ ห้อง ${roomNumber}: สั่ง${nextState === 'ON' ? 'จ่ายไฟ' : 'ตัดไฟ'} เรียบร้อยแล้ว`, 'success');
        setRooms((prev) =>
          prev.map((r) =>
            r.room_number === roomNumber ? { ...r, relayState: nextState } : r
          )
        );
      } else {
        showToast(d.message || 'สั่งสวิตช์ไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setTogglingRelayRoom(null);
    }
  };

  // Sync All ESP32 Smart Meters
  const handleSyncSmartMeter = async () => {
    setSyncingIot(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_auto_billing',
          syncToDb: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✓ ดึงค่ามิเตอร์ล่าสุดจากเซนเซอร์ IoT และ ESP32 ครบทุกห้องแล้ว', 'success');
        await fetchSummary();
      } else {
        showToast('ซิงก์ไม่สำเร็จ: ' + (data.message || 'เกิดข้อผิดพลาด'), 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSyncingIot(false);
    }
  };

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      // MIS Exception Filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Occupied' && r.room_status !== 'Occupied') return false;
        if (statusFilter === 'Available' && r.room_status !== 'Available' && r.room_status !== 'ว่าง') return false;
        if (statusFilter === 'Online' && !r.iotOnline) return false;
        if (statusFilter === 'Offline' && r.iotOnline) return false;
        if (statusFilter === 'VacantLoad' && !r.isVacantWithLoad) return false;
        if (statusFilter === 'HighLoad' && !r.isHighLoad) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = (r.room_number || '').toLowerCase().includes(q);
        const tenantMatch = (r.tenant_name || '').toLowerCase().includes(q);
        const readingMatch = r.latest_reading !== null && String(r.latest_reading).includes(q);
        if (!numMatch && !tenantMatch && !readingMatch) return false;
      }

      return true;
    });
  }, [rooms, searchQuery, statusFilter]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Pagination calculation
  const totalItems = filteredRooms.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedRooms = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRooms.slice(startIndex, startIndex + pageSize);
  }, [filteredRooms, currentPage, pageSize]);

  // Stats for Energy MIS
  const totalRoomsCount = rooms.length;
  const onlineCount = rooms.filter((r) => r.iotOnline).length;
  const offlineCount = totalRoomsCount - onlineCount;
  const relayOnCount = rooms.filter((r) => r.relayState === 'ON').length;
  const totalBuildingWatt = rooms.reduce((sum, r) => sum + (r.activePowerWatt || 0), 0);
  const totalBuildingKw = (totalBuildingWatt / 1000).toFixed(2);
  const vacantLoadCount = rooms.filter((r) => r.isVacantWithLoad).length;
  const highLoadCount = rooms.filter((r) => r.isHighLoad).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 lg:p-10 space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 transition-all animate-in fade-in slide-in-from-top-4 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' :
          toast.type === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-800' :
          'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <span>{toast.type === 'success' ? '✅' : toast.type === 'warning' ? '⚠️' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚡</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">ระบบมิเตอร์ไฟฟ้าและพลังงาน (Smart Meter MIS)</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                มอนิเตอร์กำลังไฟฟ้า Real-time • ตรวจจับสิ่งผิดปกติ • ควบคุม Relay ตัด-จ่ายไฟรายห้อง
              </p>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleSyncSmartMeter}
            disabled={syncingIot}
            className="px-5 py-3 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xs transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="ดึงข้อมูลแรงดัน กำลังไฟ และหน่วยสะสมล่าสุดจากโหนด ESP32 ทั้งหมด"
          >
            <span>🔄</span>
            <span>{syncingIot ? 'กำลังซิงค์ค่า...' : 'ดึงค่า ESP32 ทันที'}</span>
          </button>
          <Link
            href="/researcher/lab/digital-twin"
            className="px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 font-bold text-xs sm:text-sm rounded-2xl transition-all flex items-center gap-2 shadow-xs"
          >
            <span>🏢</span>
            <span>ผังความร้อน (Digital Twin)</span>
          </Link>
        </div>
      </div>

      {/* Control Panel: Energy MIS KPI Stat Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">ห้องทั้งหมด</span>
          <span className="text-2xl font-black text-slate-900">{totalRoomsCount} ห้อง</span>
          <span className="text-[11px] text-slate-400 block">หอพักเกษร 2</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan-600 block">สถานะเครือข่าย IoT</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600">🟢 {onlineCount}</span>
            <span className="text-xs font-bold text-slate-400">/ 🔴 {offlineCount} ห้อง</span>
          </div>
          <span className="text-[11px] text-slate-400 block">ESP32 + PZEM-004T</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 block">กำลังไฟรวมทั้งหอ</span>
          <span className="text-2xl font-black text-amber-700">{totalBuildingKw} kW</span>
          <span className="text-[11px] text-slate-400 block">{totalBuildingWatt.toLocaleString()} Watts ขณะนี้</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-primary block">สถานะ Relay จ่ายไฟ</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-primary">{relayOnCount}</span>
            <span className="text-xs font-bold text-slate-400">/ {totalRoomsCount} จ่ายไฟ</span>
          </div>
          <span className="text-[11px] text-slate-400 block">ตัดไฟ {totalRoomsCount - relayOnCount} ห้อง</span>
        </div>
      </div>

      {/* Exception Alert Banner (If Any Anomalies Detected) */}
      {(vacantLoadCount > 0 || highLoadCount > 0) && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <p className="text-xs font-black text-amber-900">ตรวจพบรายการผิดปกติที่ควรตรวจสอบ (MIS Exception Alert)</p>
              <p className="text-[11px] text-amber-700">
                {vacantLoadCount > 0 && `• ห้องว่างแต่มีไฟวิ่ง ${vacantLoadCount} ห้อง (เสี่ยงไฟรั่วหรือลืมปิดสวิตช์) `}
                {highLoadCount > 0 && `• ห้องโหลดไฟสูงเกิน 2,500W ${highLoadCount} ห้อง`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {vacantLoadCount > 0 && (
              <button
                onClick={() => setStatusFilter('VacantLoad')}
                className="px-3 py-1.5 rounded-xl bg-amber-200 hover:bg-amber-300 text-amber-900 text-xs font-bold transition-all cursor-pointer"
              >
                ดูห้องว่างมีไฟวิ่ง
              </button>
            )}
            {highLoadCount > 0 && (
              <button
                onClick={() => setStatusFilter('HighLoad')}
                className="px-3 py-1.5 rounded-xl bg-rose-200 hover:bg-rose-300 text-rose-900 text-xs font-bold transition-all cursor-pointer"
              >
                ดูห้องโหลดไฟสูง
              </button>
            )}
          </div>
        </div>
      )}

      {/* Control Panel: Filters & Search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shadow-xs">
        {/* Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'ทั้งหมด', count: rooms.length },
            { id: 'Occupied', label: 'มีคนอยู่', count: rooms.filter((r) => r.room_status === 'Occupied').length },
            { id: 'Available', label: 'ห้องว่าง', count: rooms.filter((r) => r.room_status === 'Available' || r.room_status === 'ว่าง').length },
            { id: 'Online', label: '🟢 Online', count: onlineCount },
            { id: 'Offline', label: '🔴 Offline', count: offlineCount },
            ...(vacantLoadCount > 0 ? [{ id: 'VacantLoad', label: '🚨 ว่างแต่มีไฟ', count: vacantLoadCount }] : []),
            ...(highLoadCount > 0 ? [{ id: 'HighLoad', label: '⚠️ โหลดสูง', count: highLoadCount }] : []),
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-primary text-white shadow-xs'
                  : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <span>{tab.label}</span>
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-mono ${statusFilter === tab.id ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Page Size */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-60">
            <span className="absolute left-3 top-2.5 text-xs text-slate-400">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเลขห้อง, ผู้เช่า..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-8 pr-8 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="bg-white border border-slate-200 text-slate-900 font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary cursor-pointer shadow-xs"
          >
            <option value={5}>5 ห้อง / หน้า</option>
            <option value={10}>10 ห้อง / หน้า</option>
            <option value={15}>15 ห้อง / หน้า</option>
            <option value={20}>20 ห้อง / หน้า</option>
          </select>
        </div>
      </div>

      {/* Meter Table */}
      <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xs">
        {loading ? (
          <div className="p-16 text-center text-slate-500 font-bold animate-pulse">กำลังโหลดข้อมูลมิเตอร์และ IoT...</div>
        ) : filteredRooms.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-bold space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-base text-slate-900 font-black">ไม่พบรายการห้องตามเงื่อนไขที่เลือก</p>
            <p className="text-xs text-slate-500">ลองล้างคำค้นหาหรือเปลี่ยนตัวกรอง</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[650px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">ห้อง / ชั้น</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">สถานะห้อง / ผู้เช่า</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">สถานะ ESP32 & ไฟปัจจุบัน</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">Relay (จ่ายไฟ)</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500">เลขสะสม (kWh)</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-500 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedRooms.map((room) => {
                  const isToggling = togglingRelayRoom === room.room_number;
                  return (
                    <tr key={room.room_id} className="hover:bg-slate-50/80 transition-colors">
                      {/* Room & Floor */}
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-900 text-base font-mono">
                          ห้อง {room.room_number}<TestRoomBadge roomNumber={room.room_number} />
                        </div>
                        <span className="text-[11px] text-slate-400 font-medium">ชั้น {room.floor || 1} • {room.room_type}</span>
                      </td>

                      {/* Room Status & Tenant */}
                      <td className="px-6 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                          room.room_status === 'Occupied' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          room.room_status === 'Reserved' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                          'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {room.room_status === 'Occupied' ? '🟢 มีคนอยู่' :
                           room.room_status === 'Reserved' ? '🟡 ติดจอง' : '⚪ ห้องว่าง'}
                        </span>
                        {room.tenant_name && (
                          <span className="block text-xs text-slate-700 font-bold mt-1 truncate max-w-[150px]">
                            {room.tenant_name}
                          </span>
                        )}
                      </td>

                      {/* ESP32 Status & Instant Power */}
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${room.iotOnline ? 'bg-emerald-500 shadow-xs' : 'bg-rose-500'}`} />
                          <span className={`text-xs font-bold ${room.iotOnline ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {room.iotOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                        <div className="text-xs font-mono font-bold text-slate-700 mt-0.5">
                          {room.activePowerWatt !== undefined ? `${room.activePowerWatt} W` : '-'}
                          <span className="text-slate-400 font-normal ml-1.5">({room.voltage || 220}V)</span>
                        </div>
                        {room.isVacantWithLoad && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200">
                            🚨 ห้องว่างมีโหลดไฟ
                          </span>
                        )}
                        {room.isHighLoad && (
                          <span className="inline-block mt-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                            ⚠️ โหลดสูง
                          </span>
                        )}
                      </td>

                      {/* Relay Control */}
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleToggleRelay(room.room_number, room.relayState || 'ON')}
                          disabled={isToggling}
                          className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                            room.relayState === 'ON'
                              ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300'
                              : 'bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300'
                          }`}
                          title="กดเพื่อสลับสถานะเปิด-ตัดไฟห้องพัก"
                        >
                          <span>{room.relayState === 'ON' ? '⚡' : '🔌'}</span>
                          <span>{isToggling ? 'กำลังสลับ...' : room.relayState === 'ON' ? 'จ่ายไฟอยู่ (ON)' : 'ตัดไฟแล้ว (OFF)'}</span>
                        </button>
                      </td>

                      {/* Current Cumulative kWh */}
                      <td className="px-6 py-4 font-mono font-black text-sm text-primary">
                        {room.currentMeterKwh !== undefined && room.currentMeterKwh !== null ? (
                          <div>
                            <span>{Number(room.currentMeterKwh).toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</span>
                            <span className="text-xs font-normal text-slate-400 ml-1">kWh</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic font-normal text-xs">-</span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="px-6 py-4 text-right">
                        <Link
                          href={`/owner/meters/${room.room_id}`}
                          className="px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors inline-flex items-center gap-1.5 hover:scale-105 active:scale-95 shadow-xs"
                        >
                          <span>📈</span>
                          <span>กราฟ & ควบคุม</span>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && filteredRooms.length > 0 && (
          <div className="bg-slate-50 border-t border-slate-200 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              แสดง <strong>{((currentPage - 1) * pageSize) + 1}</strong> – <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> จากทั้งหมด <strong>{totalItems}</strong> ห้อง
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer"
              >
                ← ก่อนหน้า
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                    currentPage === p
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 shadow-xs'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-white hover:bg-slate-100 disabled:opacity-40 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all shadow-xs cursor-pointer"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
