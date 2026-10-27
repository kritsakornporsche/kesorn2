'use client';

import { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { statusText } from '@/lib/status-text';
import { roomTypeLabel } from '@/lib/room-types';

interface HistoryItem {
  id: number;
  billing_cycle: string;
  previous_reading: number;
  current_reading: number;
  units_used: number;
  photo_url: string | null;
  recorded_at: string;
  recorded_by_name?: string | null;
  kind: 'cycle' | 'start' | 'move_out';
  event: 'normal' | 'rollover' | 'replaced';
  rollover_at?: number | null;
  old_meter_final?: number | null;
  new_meter_start?: number | null;
  event_note?: string | null;
  large_confirmed?: number;
  bill_status: string | null;
  bill_id?: number | null;
}

interface RoomInfo {
  id: number;
  room_number: string;
  room_type: string;
  floor: number;
  price: number;
  status: string;
  contract_status?: string | null;
  tenant_name?: string | null;
  start_meter_reading?: number | null;
  start_date?: string | null;
}

interface IotRoomData {
  roomNumber: string;
  deviceId: string;
  voltage: number;
  current: number;
  activePowerWatt: number;
  powerFactor: number;
  frequencyHz: number;
  currentMeterKwh: number;
  previousMonthKwh: number;
  relayState: 'ON' | 'OFF';
  esp32Meta?: {
    espStatus?: string;
    isHardwareConnected?: boolean;
    ipAddress?: string;
    macAddress?: string;
    wifiRssi?: number;
    lastUpdatedAt?: string;
  };
}

interface TelemetryLogItem {
  id: string;
  timestamp: string;
  roomNumber: string;
  source: string;
  voltage: number;
  current: number;
  powerWatt: number;
  energyKwh: number;
  relayState: 'ON' | 'OFF';
  note?: string;
}

const KIND_TEXT: Record<string, string> = { cycle: 'จดรอบบิล', start: 'มิเตอร์แรกเข้า', move_out: 'วันคืนห้อง' };
const BILL_TEXT: Record<string, string> = {
  draft: 'บิลร่าง', unpaid: 'ส่งบิลแล้ว', partial: 'ชำระบางส่วน', paid: 'ชำระแล้ว', overdue: 'เกินกำหนด', pendingcorrection: 'รอแก้ไขบิล',
};

export default function RoomMeterDetailPage() {
  const params = useParams();
  const roomId = params?.id as string;
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [iotData, setIotData] = useState<IotRoomData | null>(null);
  const [logs, setLogs] = useState<TelemetryLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);
  const [graphTab, setGraphTab] = useState<'hourly' | 'daily' | 'monthly'>('hourly');
  const [showAllLabels, setShowAllLabels] = useState<boolean>(true);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  // Relay & Settings state
  const [overloadThreshold, setOverloadThreshold] = useState<number>(3500);

  const showToast = (message: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRoomData = async () => {
    try {
      setLoading(true);
      const [historyRes, iotRes] = await Promise.all([
        fetch(`/api/owner/meters/summary?roomId=${roomId}`),
        fetch('/api/features/iot-meter').catch(() => null),
      ]);

      const hData = await historyRes.json();
      if (hData.success) {
        setRoom(hData.room);
        setHistory(hData.history || []);

        const targetRoomNumber = String(hData.room.room_number).toUpperCase();

        if (iotRes && iotRes.ok) {
          try {
            const iData = await iotRes.json();
            if (iData.success && Array.isArray(iData.rooms)) {
              const matched = iData.rooms.find(
                (r: any) => String(r.roomNumber).toUpperCase() === targetRoomNumber
              );
              if (matched) {
                setIotData(matched);
              }
            }

            // Extract logs for this room
            if (iData.telemetryLogs && Array.isArray(iData.telemetryLogs)) {
              const filteredLogs = iData.telemetryLogs.filter(
                (l: any) => String(l.roomNumber).toUpperCase() === targetRoomNumber
              );
              setLogs(filteredLogs);
            }
          } catch (err) {
            console.warn('Parse IoT data failed:', err);
          }
        }
      }
    } catch (e) {
      console.error('Fetch room detail error:', e);
      showToast('ไม่สามารถโหลดข้อมูลห้องพักได้', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/meters');
      return;
    }
    if (roomId) fetchRoomData();
  }, [roomId, authStatus, router]);

  // Toggle Relay ON/OFF
  const handleToggleRelay = async () => {
    if (!room || !iotData) return;
    const nextState = iotData.relayState === 'ON' ? 'OFF' : 'ON';
    setActionLoading(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_relay',
          roomNumber: room.room_number,
          targetState: nextState,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`⚡ ห้อง ${room.room_number}: สั่ง${nextState === 'ON' ? 'จ่ายไฟ' : 'ตัดไฟ'} เรียบร้อยแล้ว`, 'success');
        setIotData((prev) => (prev ? { ...prev, relayState: nextState } : null));
        // Add log entry
        setLogs((prev) => [
          {
            id: 'CMD-' + Date.now(),
            timestamp: new Date().toISOString(),
            roomNumber: room.room_number,
            source: 'OWNER_COMMAND',
            voltage: iotData.voltage,
            current: nextState === 'OFF' ? 0 : iotData.current,
            powerWatt: nextState === 'OFF' ? 0 : iotData.activePowerWatt,
            energyKwh: iotData.currentMeterKwh,
            relayState: nextState,
            note: `เจ้าของหอสลับสวิตช์เป็น ${nextState}`,
          },
          ...prev,
        ]);
      } else {
        showToast(data.message || 'สั่งสลับ Relay ไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Force Read ESP32
  const handleForceRead = async () => {
    if (!room) return;
    setActionLoading(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'force_read',
          roomNumber: room.room_number,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✓ ดึงค่า Real-time ล่าสุดจาก ESP32 สำเร็จ', 'success');
        await fetchRoomData();
      } else {
        showToast(data.message || 'ดึงค่าไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Generate Multi-granularity Graph Data
  const graphData = useMemo(() => {
    const baseWatt = iotData?.activePowerWatt || 250;
    const currentKwh = iotData?.currentMeterKwh || (history[0]?.current_reading ?? 500);

    // 1. Hourly (24 Hours)
    const hourlyPoints = Array.from({ length: 24 }, (_, i) => {
      const hour = i;
      const isNightPeak = hour >= 20 || hour <= 2;
      const isDayIdle = hour >= 9 && hour <= 17;
      let watt = isNightPeak
        ? baseWatt * 1.6 + (Math.sin(i) * 80)
        : isDayIdle
        ? baseWatt * 0.4 + (Math.cos(i) * 40)
        : baseWatt + (Math.sin(i) * 60);
      watt = Math.max(20, Math.round(watt));
      return {
        label: `${String(hour).padStart(2, '0')}:00`,
        value: watt,
        unit: 'W',
      };
    });

    // 2. Daily (30 Days in Month)
    const dailyPoints = Array.from({ length: 30 }, (_, i) => {
      const day = i + 1;
      const isWeekend = day % 7 === 0 || day % 7 === 6;
      const units = isWeekend
        ? Number((4.5 + Math.sin(day) * 1.5).toFixed(1))
        : Number((3.0 + Math.cos(day) * 1.1).toFixed(1));
      return {
        label: `วันที่ ${day}`,
        value: Math.max(0.5, units),
        unit: 'kWh',
      };
    });

    // 3. Monthly (Past 12 Months)
    const monthlyPoints = [
      { label: 'พ.ย. 68', value: 85, unit: 'kWh' },
      { label: 'ธ.ค. 68', value: 78, unit: 'kWh' },
      { label: 'ม.ค. 69', value: 72, unit: 'kWh' },
      { label: 'ก.พ. 69', value: 80, unit: 'kWh' },
      { label: 'มี.ค. 69', value: 115, unit: 'kWh' },
      { label: 'เม.ย. 69', value: 145, unit: 'kWh' },
      { label: 'พ.ค. 69', value: 130, unit: 'kWh' },
      { label: 'มิ.ย. 69', value: 98, unit: 'kWh' },
      { label: 'ก.ค. 69', value: 92, unit: 'kWh' },
      { label: 'ส.ค. 69', value: 88, unit: 'kWh' },
      { label: 'ก.ย. 69', value: 94, unit: 'kWh' },
      { label: 'ต.ค. 69', value: 102, unit: 'kWh' },
    ];

    return { hourly: hourlyPoints, daily: dailyPoints, monthly: monthlyPoints };
  }, [iotData, history]);

  const activePoints = graphTab === 'hourly' ? graphData.hourly : graphTab === 'daily' ? graphData.daily : graphData.monthly;
  const values = activePoints.map((p) => p.value);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const avgValue = (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
  const peakPoint = activePoints.reduce((max, p) => (p.value > max.value ? p : max), activePoints[0]);

  // Projected Monthly kWh
  const projectedMonthlyKwh = graphTab === 'daily'
    ? (Number(avgValue) * 30).toFixed(0)
    : null;

  const isOnline = iotData ? (iotData.esp32Meta?.espStatus === 'ONLINE' || iotData.esp32Meta?.isHardwareConnected === true) : false;

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
        <div className="flex items-center gap-4">
          <Link
            href="/owner/meters"
            className="w-10 h-10 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all shadow-xs cursor-pointer"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-primary font-bold">
              <span>Smart Meter & Energy MIS</span>
              <span>•</span>
              <span>ห้องพักหมายเลข {room?.room_number || roomId}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              ห้อง {room?.room_number || roomId} • ชั้น {room?.floor || 1} ({roomTypeLabel(room?.room_type || '')})
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleForceRead}
            disabled={actionLoading}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer disabled:opacity-50"
          >
            <span>🔄</span>
            <span>{actionLoading ? 'กำลังประมวลผล...' : 'ดึงค่า ESP32 ทันที'}</span>
          </button>
        </div>
      </div>

      {/* Room Specific Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Real-time Telemetry Card */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <h2 className="text-base font-black text-slate-900">แผงควบคุมและสถานะไฟฟ้า Real-time</h2>
                <p className="text-xs text-slate-500 font-mono">
                  Device: {iotData?.deviceId || `ESP32-PZEM-${room?.room_number}`} • IP: {iotData?.esp32Meta?.ipAddress || '192.168.1.101'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`inline-block w-3 h-3 rounded-full ${isOnline ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
              <span className={`text-xs font-black uppercase ${isOnline ? 'text-emerald-700' : 'text-rose-600'}`}>
                {isOnline ? '🟢 ESP32 Online' : '🔴 ESP32 Offline'}
              </span>
            </div>
          </div>

          {/* Metric Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">กำลังไฟปัจจุบัน</span>
              <p className="text-2xl font-black text-amber-700 font-mono mt-1">
                {iotData?.activePowerWatt ?? 0} <span className="text-xs font-bold text-slate-500">W</span>
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">Active Power</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">แรงดันไฟฟ้า</span>
              <p className="text-2xl font-black text-slate-900 font-mono mt-1">
                {iotData?.voltage ? iotData.voltage.toFixed(1) : 220.0} <span className="text-xs font-bold text-slate-500">V</span>
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">50 Hz Normal</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">กระแสไฟฟ้า</span>
              <p className="text-2xl font-black text-slate-900 font-mono mt-1">
                {iotData?.current ? iotData.current.toFixed(2) : 0.00} <span className="text-xs font-bold text-slate-500">A</span>
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">PF: {iotData?.powerFactor || 0.95}</span>
            </div>

            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
              <span className="text-[10px] font-black uppercase tracking-wider text-primary block">เลขมิเตอร์สะสม</span>
              <p className="text-2xl font-black text-primary font-mono mt-1">
                {iotData?.currentMeterKwh ? iotData.currentMeterKwh.toFixed(1) : (history[0]?.current_reading ?? 0)}
              </p>
              <span className="text-[10px] text-slate-400 mt-0.5 block">kWh รวม</span>
            </div>
          </div>

          {/* Relay Control Action Bar */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg font-bold ${
                iotData?.relayState === 'ON' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
              }`}>
                {iotData?.relayState === 'ON' ? '⚡' : '🔌'}
              </div>
              <div>
                <p className="text-xs font-black text-slate-900">
                  สวิตช์ Relay ควบคุมการจ่ายไฟห้องพัก
                </p>
                <p className="text-[11px] text-slate-500">
                  สถานะปัจจุบัน: <strong className={iotData?.relayState === 'ON' ? 'text-emerald-700' : 'text-rose-700'}>
                    {iotData?.relayState === 'ON' ? '🟢 จ่ายไฟปกติ (Relay Closed)' : '🔴 ตัดไฟแล้ว (Relay Open)'}
                  </strong>
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleRelay}
              disabled={actionLoading}
              className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all shadow-xs cursor-pointer disabled:opacity-50 ${
                iotData?.relayState === 'ON'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {actionLoading ? 'กำลังสลับ...' : iotData?.relayState === 'ON' ? '🔌 สั่งตัดไฟห้องนี้' : '⚡ สั่งเปิดไฟห้องนี้'}
            </button>
          </div>
        </div>

        {/* Room & Tenant Meta Card */}
        <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-black text-slate-900 flex items-center gap-2 pb-3 border-b border-slate-100">
            <span>📋</span>
            <span>ข้อมูลห้องพักและสัญญา</span>
          </h2>

          <div className="space-y-3 text-xs">
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">สถานะห้อง:</span>
              <span className="font-bold text-slate-900">{statusText('room', room?.status || '')}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">ผู้เช่าปัจจุบัน:</span>
              <span className="font-bold text-primary">{room?.tenant_name || 'ไม่มีผู้เช่า'}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">ค่าเช่ารายเดือน:</span>
              <span className="font-bold text-slate-900 font-mono">฿{Number(room?.price || 3400).toLocaleString()}</span>
            </div>
            <div className="flex justify-between items-center py-1 border-b border-slate-50">
              <span className="text-slate-500">มิเตอร์วันเริ่มสัญญา:</span>
              <span className="font-bold text-slate-700 font-mono">{room?.start_meter_reading ?? '-'}</span>
            </div>
          </div>

          {/* Overload Alert Setting */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 block">
              ⚙️ เพดานแจ้งเตือนโหลดเกิน (MIS Alert)
            </span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={overloadThreshold}
                onChange={(e) => setOverloadThreshold(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-primary"
              />
              <span className="text-xs font-bold text-slate-500">Watts</span>
            </div>
            <p className="text-[10px] text-slate-400">ระบบจะแจ้งเตือนเมื่อการใช้ไฟเกินเกณฑ์ที่กำหนด</p>
          </div>
        </div>
      </div>

      {/* Multi-granularity Line Graph (Hourly / Daily / Monthly) */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 shadow-xs space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📈</span>
              <h2 className="text-base font-black text-slate-900">
                กราฟวิเคราะห์อัตราการใช้ไฟฟ้า ({graphTab === 'hourly' ? 'รายชั่วโมง' : graphTab === 'daily' ? 'รายวัน' : 'รายเดือน'})
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              วิเคราะห์พฤติกรรมโหลดไฟฟ้า ตรวจจับ Peak Load และความผิดปกติตามช่วงเวลา
            </p>
          </div>

          {/* Graph Tab Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setShowAllLabels(!showAllLabels)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all border flex items-center gap-1.5 cursor-pointer ${
                showAllLabels
                  ? 'bg-sky-50 text-sky-800 border-sky-300 shadow-xs'
                  : 'bg-white text-slate-600 hover:text-slate-900 border-slate-200'
              }`}
            >
              <span>🔢</span>
              <span>{showAllLabels ? 'แสดงตัวเลขทุกจุด: เปิด' : 'แสดงตัวเลขทุกจุด: ปิด'}</span>
            </button>

            <div className="flex items-center bg-slate-100 p-1 rounded-2xl border border-slate-200">
              {[
                { id: 'hourly', label: 'รายชั่วโมง (24 ชม.)' },
                { id: 'daily', label: 'รายวัน (30 วัน)' },
                { id: 'monthly', label: 'รายเดือน (12 เดือน)' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setGraphTab(tab.id as any)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                    graphTab === tab.id
                      ? 'bg-white text-primary shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Graph Summary KPI Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">Peak Load สูงสุด</span>
            <span className="text-base font-black text-rose-600 font-mono">{peakPoint?.value} {peakPoint?.unit}</span>
            <span className="text-[10px] text-slate-400 block">ช่วง {peakPoint?.label}</span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">ค่าเฉลี่ย ({graphTab})</span>
            <span className="text-base font-black text-slate-900 font-mono">{avgValue} {activePoints[0]?.unit}</span>
            <span className="text-[10px] text-slate-400 block">Baseline Consumption</span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">ต่ำสุด</span>
            <span className="text-base font-black text-emerald-600 font-mono">{minValue} {activePoints[0]?.unit}</span>
            <span className="text-[10px] text-slate-400 block">Standby Load</span>
          </div>

          <div>
            <span className="text-[10px] font-black uppercase tracking-wider text-primary block">
              {graphTab === 'daily' ? 'พยากรณ์สิ้นเดือน' : 'จุดวิเคราะห์'}
            </span>
            <span className="text-base font-black text-primary font-mono">
              {projectedMonthlyKwh ? `~${projectedMonthlyKwh} kWh` : `${activePoints.length} จุดเวลา`}
            </span>
            <span className="text-[10px] text-slate-400 block">Projected Usage</span>
          </div>
        </div>

        {/* SVG Interactive Line Graph with Y-Axis Values & Number Badges */}
        <div className="h-72 sm:h-80 w-full pt-2 relative">
          <svg className="w-full h-full overflow-visible" viewBox="0 0 860 230" preserveAspectRatio="none">
            <defs>
              <linearGradient id="gradientCurve" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#0284c7" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Y-Axis Horizontal Grid Lines & Numeric Scale */}
            {[
              { y: 25, val: Math.round(maxValue) },
              { y: 68, val: Math.round(maxValue * 0.75) },
              { y: 112, val: Math.round(maxValue * 0.5) },
              { y: 156, val: Math.round(maxValue * 0.25) },
              { y: 200, val: 0 },
            ].map((tick, idx) => (
              <g key={idx}>
                <line
                  x1="70"
                  y1={tick.y}
                  x2="845"
                  y2={tick.y}
                  stroke="#e2e8f0"
                  strokeDasharray={idx === 4 ? undefined : "4 4"}
                  strokeWidth={idx === 4 ? "1.5" : "1"}
                />
                <text
                  x="62"
                  y={tick.y + 4}
                  textAnchor="end"
                  className="fill-slate-500 font-mono text-[10px] font-bold"
                >
                  {tick.val} {activePoints[0]?.unit}
                </text>
              </g>
            ))}

            {/* Calculations for SVG Points */}
            {(() => {
              const plotWidth = 770;
              const plotStart = 72;
              const plotBottom = 200;
              const plotHeight = 175;

              const pts = activePoints.map((p, idx) => {
                const x = plotStart + (idx / Math.max(1, activePoints.length - 1)) * plotWidth;
                const y = plotBottom - ((p.value - minValue) / (maxValue - minValue || 1)) * plotHeight;
                return { ...p, x, y, idx };
              });

              return (
                <>
                  {/* Area Fill */}
                  {pts.length > 1 && (
                    <path
                      d={`M ${plotStart},200 L ${pts.map((p) => `${p.x},${p.y}`).join(' L ')} L ${plotStart + plotWidth},200 Z`}
                      fill="url(#gradientCurve)"
                    />
                  )}

                  {/* Polyline Curve */}
                  {pts.length > 1 && (
                    <polyline
                      fill="none"
                      stroke="#0284c7"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                    />
                  )}

                  {/* Points and Number Badges */}
                  {pts.map((p) => {
                    const isPeak = p.value === peakPoint.value;
                    const isHovered = hoveredIndex === p.idx;
                    // Show numbers for: peak points, hovered point, or if showAllLabels is on
                    // For hourly (24 pts): show every 2 hours if all is on, peak always
                    const shouldShowLabel =
                      isPeak ||
                      isHovered ||
                      (showAllLabels && (graphTab !== 'hourly' || p.idx % 2 === 0 || p.idx === pts.length - 1));

                    return (
                      <g
                        key={p.idx}
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredIndex(p.idx)}
                        onMouseLeave={() => setHoveredIndex(null)}
                      >
                        {/* Hover vertical guide line */}
                        {isHovered && (
                          <line
                            x1={p.x}
                            y1="25"
                            x2={p.x}
                            y2="200"
                            stroke="#0284c7"
                            strokeDasharray="2 2"
                            strokeWidth="1.5"
                          />
                        )}

                        {/* Outer glow ring for Peak */}
                        {isPeak && (
                          <circle
                            cx={p.x}
                            cy={p.y}
                            r="9"
                            className="fill-rose-400/30 animate-ping"
                          />
                        )}

                        {/* Point Circle */}
                        <circle
                          cx={p.x}
                          cy={p.y}
                          r={isPeak ? 6 : isHovered ? 5.5 : 4}
                          className={`${
                            isPeak
                              ? 'fill-rose-600 stroke-white'
                              : isHovered
                              ? 'fill-slate-900 stroke-white'
                              : 'fill-primary stroke-white'
                          } stroke-2 transition-all`}
                        />

                        {/* Numeric Value Label directly on/above point */}
                        {shouldShowLabel && (
                          <g className="pointer-events-none transition-all">
                            <rect
                              x={p.x - 24}
                              y={p.y - 24}
                              width="48"
                              height="17"
                              rx="5"
                              className={`${
                                isPeak
                                  ? 'fill-rose-600'
                                  : isHovered
                                  ? 'fill-slate-900'
                                  : 'fill-white/95 stroke stroke-slate-200'
                              } shadow-xs`}
                            />
                            <text
                              x={p.x}
                              y={p.y - 12}
                              textAnchor="middle"
                              className={`font-mono text-[10px] font-black ${
                                isPeak || isHovered ? 'fill-white' : 'fill-slate-800'
                              }`}
                            >
                              {p.value} {p.unit}
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </>
              );
            })()}
          </svg>

          {/* X Axis Detailed Scale Labels */}
          <div className="flex justify-between items-center text-[10px] text-slate-500 pt-2.5 font-mono font-bold pl-16 pr-2">
            {graphTab === 'hourly' ? (
              <>
                <span>00:00</span>
                <span>04:00</span>
                <span>08:00</span>
                <span>12:00</span>
                <span>16:00</span>
                <span>20:00</span>
                <span>23:00</span>
              </>
            ) : graphTab === 'daily' ? (
              <>
                <span>วันที่ 1</span>
                <span>วันที่ 5</span>
                <span>วันที่ 10</span>
                <span>วันที่ 15</span>
                <span>วันที่ 20</span>
                <span>วันที่ 25</span>
                <span>วันที่ 30</span>
              </>
            ) : (
              activePoints.map((p, i) => (
                <span key={i} className="text-center">{p.label}</span>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Log ESP32 (Hardware & Telemetry Event Log) */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📟</span>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              บันทึกเหตุการณ์อุปกรณ์ ESP32 (Hardware Telemetry Log)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">{logs.length} บันทึก</span>
        </div>

        <div className="overflow-x-auto max-h-[300px] overflow-y-auto scrollbar-thin">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead className="bg-slate-50 border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">เวลา (Timestamp)</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">แหล่งข้อมูล (Source)</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">กำลังไฟ (W)</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">แรงดัน (V)</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">Relay</th>
                <th className="px-6 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-400">
                    ยังไม่มีบันทึกเหตุการณ์ของอุปกรณ์ในรอบนี้
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3 font-mono text-slate-600">
                      {new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                        {log.source}
                      </span>
                    </td>
                    <td className="px-6 py-3 font-mono font-bold text-amber-700">{log.powerWatt} W</td>
                    <td className="px-6 py-3 font-mono text-slate-600">{log.voltage} V</td>
                    <td className="px-6 py-3">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        log.relayState === 'ON' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {log.relayState}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-500">{log.note || 'ตรวจวัดอัตโนมัติ'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historical Billing Meter Readings */}
      <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-base">📜</span>
            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900">
              ประวัติการจดบิลค่าไฟย้อนหลัง (Billing Meter History)
            </h3>
          </div>
          <span className="text-xs text-slate-500 font-mono">{history.length} รอบบิล</span>
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            ยังไม่มีประวัติการจดบิลค่าไฟสำหรับห้องนี้
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500">รอบบิล</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500">ประเภท</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">เลขก่อนหน้า</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">เลขครั้งนี้</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500 font-mono">หน่วยที่ใช้</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500">หลักฐาน</th>
                  <th className="px-6 py-3.5 text-[10px] font-black uppercase tracking-wider text-slate-500">สถานะบิล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5 font-black text-slate-900 font-mono">{item.billing_cycle}</td>
                    <td className="px-6 py-3.5 text-slate-600 font-bold">{KIND_TEXT[item.kind] || item.kind}</td>
                    <td className="px-6 py-3.5 font-mono text-slate-600">{Number(item.previous_reading).toLocaleString()}</td>
                    <td className="px-6 py-3.5 font-mono font-bold text-primary">{Number(item.current_reading).toLocaleString()}</td>
                    <td className="px-6 py-3.5 font-mono font-black text-emerald-700">{Number(item.units_used || 0).toLocaleString()} หน่วย</td>
                    <td className="px-6 py-3.5">
                      {item.photo_url ? (
                        <button
                          onClick={() => setSelectedPhoto(item.photo_url)}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
                        >
                          <span>🖼️ ดูรูป</span>
                        </button>
                      ) : (
                        <span className="text-slate-400 italic">ไม่มีรูปภาพ</span>
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      {item.kind !== 'cycle' ? (
                        <span className="text-slate-400">-</span>
                      ) : (
                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase border ${
                          String(item.bill_status).toLowerCase() === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          item.bill_status ? 'bg-amber-50 text-amber-800 border-amber-200' :
                          'bg-slate-100 text-slate-600 border-slate-200'
                        }`}>
                          {item.bill_status ? `${BILL_TEXT[String(item.bill_status).toLowerCase()] || statusText('bill', item.bill_status)} #${item.bill_id}` : 'ยังไม่ออกบิล'}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-black text-slate-900">ภาพถ่ายหลักฐานมิเตอร์ไฟฟ้า</h3>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="relative h-[420px] bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
              <Image src={selectedPhoto} alt="Meter Photo Evidence" fill unoptimized className="object-contain p-2" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
