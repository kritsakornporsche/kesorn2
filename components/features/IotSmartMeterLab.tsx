'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DynamicBillQrPaymentButton } from '@/components/features/DynamicBillQrModal';
import {
  generateEsp32ArduinoSketch,
  IOT_DEFAULT_API_KEY,
  type SmartMeterRoomNode,
  type Esp32CommandItem,
  type Esp32CommandType,
  type Esp32TelemetryLog,
  type AutoBillingPipelineResult,
} from '@/lib/features/iot-smart-meter';

type ActiveTab = 'METER_GRID' | 'AUTO_BILLING' | 'ESP32_COMMAND' | 'ESP32_SCRIPT';
type FloorFilter = 'ALL' | 1 | 2;

export function IotSmartMeterLab() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('METER_GRID');
  const [floorFilter, setFloorFilter] = useState<FloorFilter>('ALL');
  const [rooms, setRooms] = useState<SmartMeterRoomNode[]>([]);
  const [selectedRoomNo, setSelectedRoomNo] = useState<string>('101');
  const [summary, setSummary] = useState<{
    totalRooms: number;
    occupiedRoomsCount: number;
    totalLoadWatt: number;
    totalLoadKw: number;
    totalMonthlyKwh: number;
    estimatedElectricRevenue: number;
    hardwareConnectedCount: number;
    activeRelaysCount: number;
    highLoadRooms: string[];
  } | null>(null);

  const [commandQueue, setCommandQueue] = useState<Esp32CommandItem[]>([]);
  const [telemetryLogs, setTelemetryLogs] = useState<Esp32TelemetryLog[]>([]);
  const [pipelineResult, setPipelineResult] = useState<AutoBillingPipelineResult | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [liveSimRunning, setLiveSimRunning] = useState<boolean>(true);
  const [pipelineRunning, setPipelineRunning] = useState<boolean>(false);
  const [pipelineStep, setPipelineStep] = useState<number>(0);
  const [billingCycle, setBillingCycle] = useState<string>('2026-10');
  const [syncToDb, setSyncToDb] = useState<boolean>(true);
  const [triggerPushOnBill, setTriggerPushOnBill] = useState<boolean>(true);
  const [toast, setToast] = useState<{ title: string; body: string; tone?: 'emerald' | 'cyan' | 'amber' | 'rose' } | null>(null);

  // Simulated ESP32 Hardware Packet Tester Inputs
  const [simHwRoom, setSimHwRoom] = useState<string>('101');
  const [simHwVoltage, setSimHwVoltage] = useState<number>(229.4);
  const [simHwCurrent, setSimHwCurrent] = useState<number>(7.85);
  const [simHwPower, setSimHwPower] = useState<number>(1710);
  const [simHwEnergy, setSimHwEnergy] = useState<number>(1574.5);

  // ESP32 Firmware Generator Config
  const [wifiSsid, setWifiSsid] = useState<string>('KesornDorm_WiFi_2.4G');
  const [wifiPass, setWifiPass] = useState<string>('12345678');
  const [serverUrl, setServerUrl] = useState<string>('http://192.168.1.50:3001');
  const [scriptRoom, setScriptRoom] = useState<string>('101');
  const [pzemRxPin, setPzemRxPin] = useState<number>(16);
  const [pzemTxPin, setPzemTxPin] = useState<number>(17);
  const [relayPin, setRelayPin] = useState<number>(26);
  const [intervalMs, setIntervalMs] = useState<number>(3000);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  const showToast = useCallback(
    (title: string, body: string, tone: 'emerald' | 'cyan' | 'amber' | 'rose' = 'cyan') => {
      setToast({ title, body, tone });
      setTimeout(() => {
        setToast((prev) => (prev?.title === title ? null : prev));
      }, 5000);
    },
    []
  );

  const fetchFleetState = useCallback(async () => {
    try {
      const res = await fetch('/api/features/iot-meter');
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setSummary(json.summary || null);
        setCommandQueue(json.commandQueue || []);
        setTelemetryLogs(json.telemetryLogs || []);
        if (json.latestPipelineResult && !pipelineResult) {
          setPipelineResult(json.latestPipelineResult);
        }
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, [pipelineResult]);

  useEffect(() => {
    fetchFleetState();
    if (typeof window !== 'undefined') {
      setServerUrl(window.location.origin);
    }
  }, [fetchFleetState]);

  // Live 3-second tick when liveSimRunning is true
  useEffect(() => {
    if (!liveSimRunning) return;
    const timer = setInterval(async () => {
      try {
        const res = await fetch('/api/features/iot-meter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'simulate_tick', fastForwardHours: 0 }),
        });
        const json = await res.json();
        if (json.success) {
          setRooms(json.rooms || []);
          setSummary(json.summary || null);
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [liveSimRunning]);

  const selectedRoom = rooms.find((r) => r.roomNumber === selectedRoomNo) || rooms[0] || null;

  // Fast-forward simulation (+1 day, +7 days, +30 days)
  const handleFastForward = async (hours: number, label: string) => {
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'simulate_tick', fastForwardHours: hours }),
      });
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setSummary(json.summary || null);
        showToast(
          `⏩ เร่งเวลาจำลองมิเตอร์ +${label} สำเร็จ`,
          `คำนวณหน่วยไฟฟ้าและค่าน้ำสะสมของทั้ง 20 ห้องตามพฤติกรรมการใช้โหลดเรียบร้อยแล้ว`,
          'emerald'
        );
      }
    } catch {
      // ignore
    }
  };

  // Toggle appliance load or manual kWh adjustment
  const handleUpdateRoomLoad = async (
    roomNumber: string,
    patch: {
      appliances?: Partial<SmartMeterRoomNode['appliances']>;
      relayState?: 'ON' | 'OFF';
      nodeMode?: 'REAL_IOT_HYBRID' | 'SMART_SIMULATOR';
      addKwh?: number;
    }
  ) => {
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'toggle_room_load',
          roomNumber,
          ...patch,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setSummary(json.summary || null);
      }
    } catch {
      // ignore
    }
  };

  // Send Downlink Command to ESP32
  const handleSendEsp32Command = async (roomNumber: string, command: Esp32CommandType) => {
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'esp32_command',
          roomNumber,
          command,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setSummary(json.summary || null);
        setCommandQueue(json.commandQueue || []);
        showToast(
          `📡 ส่งคำสั่ง [${command}] ไปยัง ESP32 ห้อง ${roomNumber} แล้ว`,
          json.commandItem?.note || 'บอร์ด ESP32 จะรับคำสั่งทันทีในรอบ HTTP Telemetry ถัดไป',
          command === 'RELAY_OFF' ? 'rose' : 'cyan'
        );
      }
    } catch {
      // ignore
    }
  };

  // Simulate Real ESP32 Hardware HTTP POST Packet
  const handleSimulateEsp32Packet = async () => {
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-iot-api-key': IOT_DEFAULT_API_KEY,
        },
        body: JSON.stringify({
          action: 'esp32_telemetry',
          apiKey: IOT_DEFAULT_API_KEY,
          roomNumber: simHwRoom,
          deviceId: `ESP32-PZEM-${simHwRoom}`,
          voltage: simHwVoltage,
          current: simHwCurrent,
          power: simHwPower,
          energyKwh: simHwEnergy,
          pf: 0.95,
          frequency: 50.0,
          relayState: 'ON',
          rssi: -48,
          ip: `192.168.1.${simHwRoom}`,
        }),
      });
      const json = await res.json();
      if (json.success) {
        if (json.room) {
          setRooms((prev) => prev.map((r) => (r.roomNumber === simHwRoom ? json.room : r)));
        }
        if (json.summary) setSummary(json.summary);
        if (json.telemetryLogs) setTelemetryLogs(json.telemetryLogs);
        if (json.commandQueue) setCommandQueue(json.commandQueue);
        setSimHwEnergy((prev) => Number((prev + 0.35).toFixed(2)));

        showToast(
          `✅ รับแพ็กเกจจากบอร์ด ESP32 ห้อง ${simHwRoom} สำเร็จ!`,
          json.command
            ? `ส่งคำสั่งตอบกลับ (Downlink) ให้บอร์ด ESP32 ทันที: [${json.command}]`
            : `V: ${simHwVoltage}V | I: ${simHwCurrent}A | P: ${simHwPower}W | E: ${simHwEnergy} kWh`,
          'emerald'
        );
      }
    } catch {
      // ignore
    }
  };

  // Run One-Click Auto Billing Pipeline
  const handleRunAutoBillingPipeline = async () => {
    setPipelineRunning(true);
    setActiveTab('AUTO_BILLING');
    setPipelineStep(1);

    await new Promise((r) => setTimeout(r, 450));
    setPipelineStep(2);
    await new Promise((r) => setTimeout(r, 450));
    setPipelineStep(3);

    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'run_auto_billing_pipeline',
          billingCycle,
          syncToDb,
          triggerPush: triggerPushOnBill,
        }),
      });
      const json = await res.json();
      setPipelineStep(4);
      if (json.success && json.pipelineResult) {
        setPipelineResult(json.pipelineResult);
        if (json.summary) setSummary(json.summary);
        showToast(
          `🚀 ออกบิลอัตโนมัติสำเร็จ ${json.pipelineResult.totalBillsGenerated} ห้อง!`,
          `ยอดรวมทั้งตึก ฿${json.pipelineResult.grandTotalRevenue.toLocaleString()} (หน่วยไฟรวม ${json.pipelineResult.totalElectricUnitsKwh.toLocaleString()} kWh) พร้อมสร้าง QR & SHA-256 ครบทุกบิล`,
          'emerald'
        );
      }
    } catch {
      showToast('❌ เกิดข้อผิดพลาดในการรัน Auto Billing Pipeline', 'กรุณาลองใหม่อีกครั้ง', 'rose');
    } finally {
      setTimeout(() => setPipelineRunning(false), 400);
    }
  };

  const handleResetFleet = async () => {
    const res = await fetch('/api/features/iot-meter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_fleet' }),
    });
    const json = await res.json();
    if (json.success) {
      setRooms(json.rooms || []);
      setSummary(json.summary || null);
      setPipelineResult(null);
      showToast('🔄 รีเซ็ตค่ามิเตอร์ทั้ง 20 ห้องกลับสู่ค่าเริ่มต้นแล้ว', 'พร้อมสำหรับการทดสอบรอบใหม่', 'amber');
    }
  };

  const arduinoCode = generateEsp32ArduinoSketch({
    wifiSsid,
    wifiPassword: wifiPass,
    serverBaseUrl: serverUrl,
    roomNumber: scriptRoom,
    apiKey: IOT_DEFAULT_API_KEY,
    pzemRxPin,
    pzemTxPin,
    relayGpioPin: relayPin,
    intervalMs,
  });

  const handleCopySketch = async () => {
    try {
      await navigator.clipboard.writeText(arduinoCode);
      setCopiedScript(true);
      showToast('📋 คัดลอกโค้ด ESP32 (.ino) แล้ว', 'สามารถนำไปวางในโปรแกรม Arduino IDE หรือ PlatformIO ได้ทันที', 'emerald');
      setTimeout(() => setCopiedScript(false), 3000);
    } catch {
      // ignore
    }
  };

  const handleDownloadSketch = () => {
    const blob = new Blob([arduinoCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esp32_smartdorm_room_${scriptRoom}.ino`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredRooms = rooms.filter((r) => (floorFilter === 'ALL' ? true : r.floor === floorFilter));

  return (
    <div className="space-y-6">
      {/* Live Toast Notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded-2xl p-4 border shadow-2xl backdrop-blur-xl transition-all ${
            toast.tone === 'emerald'
              ? 'bg-emerald-950/95 border-emerald-400 text-emerald-100'
              : toast.tone === 'rose'
              ? 'bg-rose-950/95 border-rose-400 text-rose-100'
              : toast.tone === 'amber'
              ? 'bg-amber-950/95 border-amber-400 text-amber-100'
              : 'bg-slate-900/95 border-cyan-400 text-cyan-100'
          }`}
        >
          <div className="text-xs font-black">{toast.title}</div>
          <div className="text-[11px] opacity-90 mt-1">{toast.body}</div>
        </div>
      )}

      {/* Top Executive KPI & One-Click Action Bar */}
      <div className="rounded-3xl bg-gradient-to-br from-slate-900 via-indigo-950/50 to-cyan-950/40 border border-cyan-500/30 p-6 shadow-2xl space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-3 py-1 rounded-full text-[11px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ⚡ HYBRID IoT ARCHITECTURE (ROOM 101 REAL ESP32 + ROOMS 102–210 SIMULATOR)
              </span>
              <span
                className={`px-3 py-1 rounded-full text-[11px] font-black border ${
                  liveSimRunning
                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 animate-pulse'
                    : 'bg-slate-800 text-slate-400 border-white/10'
                }`}
              >
                {liveSimRunning ? '🟢 LIVE TELEMETRY STREAMING (ทุก 3 วินาที)' : '⏸️ หยุดจำลองชั่วคราว'}
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-white">
              ศูนย์ควบคุมมิเตอร์ไฟฟ้าอัจฉริยะ 20 ห้อง & ระบบออกบิลอัตโนมัติในคลิกเดียว
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setLiveSimRunning((v) => !v)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-black border transition-all ${
                liveSimRunning
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200 hover:bg-amber-500/30'
                  : 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200 hover:bg-emerald-500/30'
              }`}
            >
              {liveSimRunning ? '⏸️ หยุดเดินมิเตอร์ชั่วคราว' : '▶️ เดินมิเตอร์เรียลไทม์'}
            </button>

            <button
              type="button"
              onClick={() => handleFastForward(24, '1 วัน')}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-slate-200 transition-all"
            >
              ⏩ +1 วัน
            </button>
            <button
              type="button"
              onClick={() => handleFastForward(168, '7 วัน')}
              className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-slate-200 transition-all"
            >
              ⏩ +7 วัน
            </button>
            <button
              type="button"
              onClick={() => handleFastForward(720, '30 วัน (ครบรอบบิล)')}
              className="px-3 py-2.5 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-400/40 text-xs font-black text-indigo-200 transition-all"
            >
              🗓️ +30 วัน (จำลองปลายเดือน)
            </button>

            <button
              type="button"
              onClick={handleRunAutoBillingPipeline}
              disabled={pipelineRunning}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 hover:from-emerald-300 hover:to-blue-400 text-slate-950 font-black text-xs shadow-[0_0_25px_rgba(16,185,129,0.4)] transition-all"
            >
              🚀 One-Click Auto Billing (ออกบิลทั้งตึกทันที)
            </button>
          </div>
        </div>

        {/* 5 Real-time Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4">
            <div className="text-[11px] font-bold text-slate-400">กำลังไฟฟ้ารวมทั้งตึกขณะนี้</div>
            <div className="text-2xl font-black text-cyan-300 mt-1">
              {summary ? `${summary.totalLoadKw.toFixed(2)} kW` : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              ({summary ? summary.totalLoadWatt.toLocaleString() : 0} Watts • 20 ห้อง)
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4">
            <div className="text-[11px] font-bold text-slate-400">หน่วยไฟสะสมเดือนนี้ (20 ห้อง)</div>
            <div className="text-2xl font-black text-amber-300 mt-1">
              {summary ? `${summary.totalMonthlyKwh.toLocaleString()} kWh` : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">อัตราค่าไฟ ฿8.00 / หน่วย</div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4">
            <div className="text-[11px] font-bold text-slate-400">ประมาณการรายได้ค่าไฟเดือนนี้</div>
            <div className="text-2xl font-black text-emerald-300 mt-1">
              ฿{summary ? summary.estimatedElectricRevenue.toLocaleString() : '0'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              ห้องมีผู้เช่า {summary?.occupiedRoomsCount || 16}/20 ห้อง
            </div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-white/10 p-4">
            <div className="text-[11px] font-bold text-slate-400">สถานะเบรกเกอร์ (Smart Relay)</div>
            <div className="text-2xl font-black text-sky-300 mt-1">
              {summary ? `${summary.activeRelaysCount}/20 ON` : '...'}
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">สั่งตัด/ต่อไฟระยะไกลผ่าน ESP32</div>
          </div>

          <div className="rounded-2xl bg-slate-950/80 border border-emerald-500/30 p-4 col-span-2 sm:col-span-1">
            <div className="text-[11px] font-bold text-emerald-300">โหนดฮาร์ดแวร์ ESP32 (Real IoT)</div>
            <div className="text-lg font-black text-white mt-1 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>ห้อง 101 พร้อมเชื่อมต่อ</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-0.5">
              รับค่าจริงแล้ว {summary?.hardwareConnectedCount || 0} โหนด • API พร้อมรับค่า
            </div>
          </div>
        </div>

        {/* 4 Navigation Tabs */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
          {[
            {
              id: 'METER_GRID' as ActiveTab,
              label: '⚡ 1. แผงมิเตอร์ดิจิทัล 20 ห้อง & จำลองโหลดเครื่องใช้ไฟฟ้า',
            },
            {
              id: 'AUTO_BILLING' as ActiveTab,
              label: `🚀 2. One-Click Auto Billing Pipeline (${pipelineResult ? `${pipelineResult.totalBillsGenerated} บิล` : 'พร้อมรัน'})`,
            },
            {
              id: 'ESP32_COMMAND' as ActiveTab,
              label: '📡 3. ศูนย์สั่งการ ESP32 & ทดสอบยิงข้อมูลฮาร์ดแวร์ (Webhook)',
            },
            {
              id: 'ESP32_SCRIPT' as ActiveTab,
              label: '💻 4. สคริปต์โค้ด ESP32 (.ino) & ผังการต่อวงจร PZEM-004T',
            },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2.5 rounded-xl text-xs font-black border transition-all ${
                activeTab === tab.id
                  ? 'bg-cyan-500 text-slate-950 border-cyan-300 shadow-lg'
                  : 'bg-slate-900/90 text-slate-300 border-white/10 hover:border-cyan-400/40 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* =====================================================================
          TAB 1: 20-ROOM SMART METER GRID & INTERACTIVE LOAD INSPECTOR
      ===================================================================== */}
      {activeTab === 'METER_GRID' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 Cols: 20-Room LCD Smart Meter Grid */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2">
                {(['ALL', 1, 2] as FloorFilter[]).map((fl) => (
                  <button
                    key={String(fl)}
                    type="button"
                    onClick={() => setFloorFilter(fl)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black border transition-all ${
                      floorFilter === fl
                        ? 'bg-cyan-500/25 border-cyan-400 text-white'
                        : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    {fl === 'ALL' ? 'ทั้งหมด 20 ห้อง' : `ชั้น ${fl} (${fl}01–${fl}10)`}
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={handleResetFleet}
                className="px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-white/10 text-xs font-bold text-slate-300"
              >
                🔄 รีเซ็ตค่ามิเตอร์เริ่มต้น
              </button>
            </div>

            {loading ? (
              <div className="rounded-3xl bg-slate-900/70 border border-white/10 p-12 text-center text-sm text-slate-400">
                กำลังโหลดข้อมูล Smart Meter ทั้ง 20 ห้อง...
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                {filteredRooms.map((room) => {
                  const isSelected = room.roomNumber === selectedRoomNo;
                  const isRealNode = room.nodeMode === 'REAL_IOT_HYBRID';
                  const isHighLoad = room.activePowerWatt >= 3000 || room.monthlyUnitsKwh >= 250;

                  return (
                    <div
                      key={room.roomNumber}
                      onClick={() => setSelectedRoomNo(room.roomNumber)}
                      className={`cursor-pointer rounded-2xl p-4 border transition-all relative overflow-hidden ${
                        isSelected
                          ? 'bg-slate-900 border-cyan-400 ring-2 ring-cyan-400/40 shadow-xl'
                          : isRealNode
                          ? 'bg-slate-900/90 border-emerald-500/40 hover:border-emerald-400'
                          : 'bg-slate-900/70 border-white/10 hover:border-white/30'
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-base font-black text-white">ห้อง {room.roomNumber}</span>
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${
                                isRealNode
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                  : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/30'
                              }`}
                            >
                              {isRealNode ? '📡 ESP32 IoT' : '🤖 SIM'}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px]">
                            {room.tenantName || 'ห้องว่าง (Standby)'}
                          </div>
                        </div>

                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                            room.relayState === 'ON'
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                              : 'bg-rose-500/30 text-rose-200 border-rose-400/50'
                          }`}
                        >
                          {room.relayState === 'ON' ? '⚡ RELAY ON' : '🛑 CUT OFF'}
                        </span>
                      </div>

                      {/* Digital LCD Meter Screen */}
                      <div className="mt-3 rounded-xl bg-slate-950 border border-cyan-500/20 p-3 font-mono">
                        <div className="flex items-baseline justify-between">
                          <span className="text-[10px] text-slate-400">MITER READING</span>
                          <span className="text-[10px] text-cyan-400 font-bold">
                            +{room.monthlyUnitsKwh.toFixed(2)} kWh เดือนนี้
                          </span>
                        </div>
                        <div className="text-xl font-black tracking-wider text-emerald-300 mt-0.5">
                          {room.currentMeterKwh.toFixed(2)} <span className="text-xs text-slate-400">kWh</span>
                        </div>

                        <div className="grid grid-cols-3 gap-1.5 mt-2 pt-2 border-t border-white/10 text-[11px]">
                          <div>
                            <span className="text-slate-500 block text-[9px]">VOLTAGE</span>
                            <span className="text-slate-200 font-bold">{room.voltage.toFixed(1)}V</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px]">CURRENT</span>
                            <span className="text-slate-200 font-bold">{room.current.toFixed(2)}A</span>
                          </div>
                          <div>
                            <span className="text-slate-500 block text-[9px]">POWER</span>
                            <span
                              className={`font-black ${
                                isHighLoad ? 'text-rose-400 animate-pulse' : 'text-amber-300'
                              }`}
                            >
                              {room.activePowerWatt}W
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Appliance Active Pills & Est Cost */}
                      <div className="mt-2.5 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1">
                          {room.appliances.acOn && (
                            <span title="เปิดแอร์" className="px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300">
                              ❄️ แอร์
                            </span>
                          )}
                          {room.appliances.waterHeaterOn && (
                            <span title="เครื่องทำน้ำอุ่น" className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                              🚿 น้ำอุ่น
                            </span>
                          )}
                          {room.appliances.pcLoadOn && (
                            <span title="คอมพิวเตอร์" className="px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                              🖥️ PC
                            </span>
                          )}
                          {room.appliances.faultOverload && (
                            <span className="px-1.5 py-0.5 rounded bg-rose-500 text-white font-black animate-bounce">
                              ⚠️ โหลดเกิน!
                            </span>
                          )}
                        </div>
                        <span className="font-black text-emerald-300">
                          ≈ ฿{Math.round(room.monthlyUnitsKwh * 8).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right 4 Cols: Selected Room Smart Meter Inspector & Remote Load / Relay Controller */}
          {selectedRoom && (
            <div className="lg:col-span-4 rounded-3xl bg-slate-900/95 border border-cyan-500/40 p-5 space-y-5 shadow-2xl sticky top-6">
              <div className="flex items-start justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] font-mono font-black uppercase tracking-wider text-cyan-400">
                    SMART METER INSPECTOR • {selectedRoom.deviceId}
                  </span>
                  <h3 className="text-xl font-black text-white mt-0.5">
                    ห้อง {selectedRoom.roomNumber} ({selectedRoom.roomType})
                  </h3>
                  <p className="text-xs text-slate-400">
                    ผู้เช่า: <strong className="text-slate-200">{selectedRoom.tenantName || 'ห้องว่าง'}</strong>
                  </p>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                    selectedRoom.nodeMode === 'REAL_IOT_HYBRID'
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                  }`}
                >
                  {selectedRoom.nodeMode === 'REAL_IOT_HYBRID' ? '📡 REAL IoT NODE' : '🤖 SIMULATOR NODE'}
                </span>
              </div>

              {/* Mode Switcher */}
              <div className="rounded-2xl bg-slate-950/90 border border-white/10 p-3.5 space-y-2">
                <div className="text-[11px] font-bold text-slate-300">โหมดการทำงานของโหนดมิเตอร์ห้องนี้</div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateRoomLoad(selectedRoom.roomNumber, { nodeMode: 'REAL_IOT_HYBRID' })
                    }
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                      selectedRoom.nodeMode === 'REAL_IOT_HYBRID'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                        : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    📡 เชื่อมต่อ ESP32 จริง
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      handleUpdateRoomLoad(selectedRoom.roomNumber, { nodeMode: 'SMART_SIMULATOR' })
                    }
                    className={`py-2 px-3 rounded-xl text-xs font-black border transition-all ${
                      selectedRoom.nodeMode === 'SMART_SIMULATOR'
                        ? 'bg-indigo-500 text-white border-indigo-300'
                        : 'bg-slate-900 text-slate-400 border-white/10'
                    }`}
                  >
                    🤖 โหมดจำลองอัจฉริยะ
                  </button>
                </div>
              </div>

              {/* Remote Breaker Relay Control (Sends command to ESP32 + updates simulator) */}
              <div className="rounded-2xl bg-slate-950/90 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black text-white">เบรกเกอร์ตัด-ต่อไฟระยะไกล (Smart Relay)</span>
                  <span
                    className={`text-xs font-black ${
                      selectedRoom.relayState === 'ON' ? 'text-emerald-400' : 'text-rose-400'
                    }`}
                  >
                    {selectedRoom.relayState === 'ON' ? '🟢 จ่ายไฟปกติ (ON)' : '🔴 ตัดกระแสไฟ (OFF)'}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleSendEsp32Command(selectedRoom.roomNumber, 'RELAY_ON')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                      selectedRoom.relayState === 'ON'
                        ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-lg'
                        : 'bg-slate-900 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                    }`}
                  >
                    🟢 สั่งจ่ายไฟ (RELAY ON)
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendEsp32Command(selectedRoom.roomNumber, 'RELAY_OFF')}
                    className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                      selectedRoom.relayState === 'OFF'
                        ? 'bg-rose-500 text-white border-rose-300 shadow-lg'
                        : 'bg-slate-900 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                    }`}
                  >
                    🔴 สั่งตัดไฟ (RELAY OFF)
                  </button>
                </div>
              </div>

              {/* Interactive Appliance Load Switches */}
              <div className="rounded-2xl bg-slate-950/90 border border-white/10 p-4 space-y-2.5">
                <div className="text-xs font-black text-white">
                  จำลองเปิด-ปิดเครื่องใช้ไฟฟ้าในห้อง (กระทบค่า A, W, kWh ทันที)
                </div>

                {[
                  {
                    key: 'acOn' as const,
                    label: '❄️ เครื่องปรับอากาศ (Inverter AC)',
                    watt: '+1,150 W',
                    active: selectedRoom.appliances.acOn,
                  },
                  {
                    key: 'waterHeaterOn' as const,
                    label: '🚿 เครื่องทำน้ำอุ่น (Water Heater)',
                    watt: '+3,300 W',
                    active: selectedRoom.appliances.waterHeaterOn,
                  },
                  {
                    key: 'pcLoadOn' as const,
                    label: '🖥️ คอมพิวเตอร์ / ทีวี / ตู้เย็น',
                    watt: '+420 W',
                    active: selectedRoom.appliances.pcLoadOn,
                  },
                  {
                    key: 'faultOverload' as const,
                    label: '⚠️ จำลองไฟรั่ว / โหลดเกินพิกัด (Overload)',
                    watt: '+4,800 W',
                    active: selectedRoom.appliances.faultOverload,
                  },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      handleUpdateRoomLoad(selectedRoom.roomNumber, {
                        appliances: { [item.key]: !item.active },
                      })
                    }
                    className={`w-full flex items-center justify-between p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      item.active
                        ? item.key === 'faultOverload'
                          ? 'bg-rose-500/30 border-rose-400 text-white'
                          : 'bg-cyan-500/20 border-cyan-400/60 text-white'
                        : 'bg-slate-900 border-white/10 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span className="font-mono text-[11px]">
                      {item.watt} • {item.active ? 'ON' : 'OFF'}
                    </span>
                  </button>
                ))}
              </div>

              {/* Quick Meter Adjustment & Bill Preview */}
              <div className="rounded-2xl bg-slate-950/90 border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">เลขมิเตอร์ต้นเดือน:</span>
                  <span className="font-mono font-bold text-slate-200">
                    {selectedRoom.previousMonthKwh.toFixed(2)} kWh
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">เลขมิเตอร์ปัจจุบัน:</span>
                  <span className="font-mono font-black text-emerald-300">
                    {selectedRoom.currentMeterKwh.toFixed(2)} kWh
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs border-t border-white/10 pt-2">
                  <span className="text-slate-300 font-bold">หน่วยไฟที่ใช้เดือนนี้ (×฿8):</span>
                  <span className="font-mono font-black text-amber-300">
                    {selectedRoom.monthlyUnitsKwh.toFixed(2)} kWh = ฿
                    {(selectedRoom.monthlyUnitsKwh * 8).toLocaleString('th-TH', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleUpdateRoomLoad(selectedRoom.roomNumber, { addKwh: 10 })}
                    className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-bold text-cyan-300"
                  >
                    +10 kWh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleUpdateRoomLoad(selectedRoom.roomNumber, { addKwh: 50 })}
                    className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-bold text-amber-300"
                  >
                    +50 kWh
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendEsp32Command(selectedRoom.roomNumber, 'RESET_KWH_COUNTER')}
                    className="py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-white/10 text-[11px] font-bold text-rose-300"
                  >
                    รีเซ็ต 0 kWh
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 2: ONE-CLICK AUTO BILLING PIPELINE
      ===================================================================== */}
      {activeTab === 'AUTO_BILLING' && (
        <div className="space-y-6">
          {/* Pipeline Control Card */}
          <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-6 space-y-5 shadow-xl">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-emerald-400">
                  ONE-CLICK AUTOMATED BILLING PIPELINE
                </span>
                <h3 className="text-xl font-black text-white mt-0.5">
                  ระบบดึงค่ามิเตอร์ IoT 20 ห้อง คำนวณค่าน้ำ-ค่าไฟ และออกใบแจ้งหนี้อัตโนมัติในคลิกเดียว
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  ไม่ต้องเดินจดมิเตอร์ด้วยมือ: ระบบดึงเลขมิเตอร์ต้นงวด–ปลายงวด คำนวณค่าไฟ (฿8/หน่วย) + ค่าน้ำ (฿100) + ค่าส่วนกลาง (฿150) + ค่าเช่าห้อง พร้อมฝัง PromptPay QR และรหัสรับรอง SHA-256
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-950 border border-white/10 rounded-xl px-3 py-2">
                  <span className="text-xs text-slate-400 font-bold">รอบบิล:</span>
                  <input
                    type="month"
                    value={billingCycle}
                    onChange={(e) => setBillingCycle(e.target.value)}
                    className="bg-transparent text-xs font-black text-white focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleRunAutoBillingPipeline}
                  disabled={pipelineRunning}
                  className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-slate-950 font-black text-xs shadow-xl transition-all"
                >
                  {pipelineRunning ? '⏳ กำลังประมวลผลบิลทั้งตึก...' : '🚀 กดรัน Auto Billing ทั้งตึกทันที'}
                </button>
              </div>
            </div>

            {/* Options */}
            <div className="flex flex-wrap gap-6 pt-2 border-t border-white/10 text-xs text-slate-300">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={syncToDb}
                  onChange={(e) => setSyncToDb(e.target.checked)}
                  className="w-4 h-4 accent-emerald-400 rounded"
                />
                <span>ซิงก์เลขมิเตอร์และใบแจ้งหนี้ลงฐานข้อมูล MySQL (`meter_readings` & `bills`)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={triggerPushOnBill}
                  onChange={(e) => setTriggerPushOnBill(e.target.checked)}
                  className="w-4 h-4 accent-cyan-400 rounded"
                />
                <span>ส่งแจ้งเตือน Web Push แจ้งสรุปผลการออกบิลอัตโนมัติ</span>
              </label>
            </div>

            {/* 4-Stage Visual Pipeline Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2">
              {[
                {
                  step: 1,
                  title: '1. Snapshot เลขมิเตอร์ IoT',
                  desc: 'อ่านค่า kWh และน้ำประปาทั้ง 20 ห้อง (ESP32 + Simulator)',
                },
                {
                  step: 2,
                  title: '2. คำนวณส่วนต่าง & ตรวจจับไฟรั่ว',
                  desc: 'คำนวณหน่วยที่ใช้จริง (×฿8.00) และคัดกรองห้องที่ใช้ไฟสูงผิดปกติ',
                },
                {
                  step: 3,
                  title: '3. สร้างบิล + Dynamic QR + SHA-256',
                  desc: 'สร้างรหัสรับรองใบแจ้งหนี้ SHA-256 และฝังยอดโอนลง PromptPay QR',
                },
                {
                  step: 4,
                  title: '4. ซิงก์ฐานข้อมูล & แจ้งเตือน',
                  desc: 'บันทึกลงระบบบิลหอพักและส่งแจ้งเตือนไปยังบทบาทที่เกี่ยวข้อง',
                },
              ].map((s) => {
                const isDone = pipelineResult !== null && !pipelineRunning;
                const isActive = pipelineRunning && pipelineStep >= s.step;
                return (
                  <div
                    key={s.step}
                    className={`rounded-2xl p-3.5 border transition-all ${
                      isActive
                        ? 'bg-cyan-500/20 border-cyan-400 text-white animate-pulse'
                        : isDone
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                        : 'bg-slate-950/80 border-white/10 text-slate-400'
                    }`}
                  >
                    <div className="text-xs font-black">{s.title}</div>
                    <div className="text-[11px] opacity-80 mt-1">{s.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Generated Bills Result Table */}
          {pipelineResult ? (
            <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-4 shadow-xl">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h4 className="text-lg font-black text-white">
                    📋 รายการใบแจ้งหนี้ที่ออกอัตโนมัติสำเร็จ ({pipelineResult.totalBillsGenerated} ห้องที่มีผู้เช่า)
                  </h4>
                  <p className="text-xs text-slate-400">
                    รหัสรอบประมวลผล: <span className="font-mono text-cyan-300">{pipelineResult.pipelineRunId}</span> •
                    รายได้รวมทั้งตึก:{' '}
                    <strong className="text-emerald-300">
                      ฿{pipelineResult.grandTotalRevenue.toLocaleString()}
                    </strong>{' '}
                    (ค่าไฟรวม ฿{pipelineResult.totalElectricRevenue.toLocaleString()} จาก{' '}
                    {pipelineResult.totalElectricUnitsKwh.toLocaleString()} kWh)
                  </p>
                </div>

                {pipelineResult.highUsageRooms.length > 0 && (
                  <div className="px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-400/40 text-xs font-bold text-rose-200">
                    ⚠️ พบห้องใช้ไฟสูงเกินเกณฑ์ (≥250 kWh): ห้อง {pipelineResult.highUsageRooms.join(', ')}
                  </div>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 text-[11px]">
                      <th className="py-3 px-3">ห้อง / โหนด</th>
                      <th className="py-3 px-3">ผู้เช่า</th>
                      <th className="py-3 px-3">เลขมิเตอร์ไฟ (ก่อน ➔ หลัง)</th>
                      <th className="py-3 px-3">หน่วยไฟ (×฿8)</th>
                      <th className="py-3 px-3">ค่าเช่า + น้ำ + ส่วนกลาง</th>
                      <th className="py-3 px-3">ยอดสุทธิ</th>
                      <th className="py-3 px-3">รหัสรับรอง SHA-256</th>
                      <th className="py-3 px-3 text-right">ชำระเงินด้วย Dynamic QR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {pipelineResult.bills.map((bill) => (
                      <tr key={bill.billRef} className="hover:bg-white/5">
                        <td className="py-3 px-3 font-black text-white">
                          <div>ห้อง {bill.roomNumber}</div>
                          <span
                            className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-black ${
                              bill.nodeMode === 'REAL_IOT_HYBRID'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : 'bg-indigo-500/20 text-indigo-300'
                            }`}
                          >
                            {bill.nodeMode === 'REAL_IOT_HYBRID' ? '📡 ESP32 IoT' : '🤖 SIM'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-slate-200 font-bold">{bill.tenantName}</td>
                        <td className="py-3 px-3 font-mono text-slate-300">
                          {bill.previousKwh.toFixed(1)} ➔{' '}
                          <strong className="text-emerald-300">{bill.currentKwh.toFixed(1)}</strong>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-mono font-black text-amber-300">
                            {bill.electricUnits.toFixed(2)} kWh
                          </div>
                          <div className="text-[11px] text-slate-400">
                            ฿{bill.electricAmount.toLocaleString()}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-300">
                          ฿{bill.roomRent.toLocaleString()} + ฿{bill.waterAmount} + ฿{bill.commonFee}
                        </td>
                        <td className="py-3 px-3 font-mono text-sm font-black text-emerald-300">
                          ฿{bill.totalAmount.toLocaleString()}
                        </td>
                        <td className="py-3 px-3 font-mono text-[10px] text-cyan-300">
                          <span
                            title={bill.sha256ReceiptHash}
                            className="px-2 py-1 rounded bg-cyan-500/10 border border-cyan-500/30"
                          >
                            🔐 {bill.sha256ReceiptHash.slice(0, 12)}...
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <DynamicBillQrPaymentButton
                            billId={bill.billRef}
                            roomNumber={bill.roomNumber}
                            tenantName={bill.tenantName}
                            billingCycle={bill.billingCycle}
                            amount={bill.totalAmount}
                            buttonLabel="📲 สแกน QR ชำระบิล"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-slate-900/60 border border-dashed border-white/15 p-12 text-center space-y-3">
              <div className="text-3xl">⚡🧾</div>
              <h4 className="text-base font-black text-white">
                พร้อมประมวลผลออกบิลอัตโนมัติทั้ง 20 ห้อง
              </h4>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                กดปุ่ม <strong>&ldquo;🚀 กดรัน Auto Billing ทั้งตึกทันที&rdquo;</strong> ด้านบน ระบบจะอ่านค่ามิเตอร์ล่าสุดจากทุกห้อง คำนวณยอดเงิน และสร้างใบแจ้งหนี้พร้อม QR Code ให้ทันที
              </p>
            </div>
          )}
        </div>
      )}

      {/* =====================================================================
          TAB 3: ESP32 COMMAND CENTER & HARDWARE WEBHOOK TESTER
      ===================================================================== */}
      {activeTab === 'ESP32_COMMAND' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 6 Cols: Downlink Command Sender & Hardware Packet Simulator */}
          <div className="lg:col-span-6 space-y-6">
            {/* 1. Downlink Command Console */}
            <div className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-4 shadow-xl">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                    BIDIRECTIONAL ESP32 DOWNLINK CONTROL
                  </span>
                  <h3 className="text-lg font-black text-white">
                    ส่งคำสั่งควบคุมบอร์ด ESP32 ระยะไกล (Command Queue)
                  </h3>
                </div>
                <select
                  value={simHwRoom}
                  onChange={(e) => setSimHwRoom(e.target.value)}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-cyan-500/40 text-xs font-black text-white"
                >
                  {rooms.map((r) => (
                    <option key={r.roomNumber} value={r.roomNumber}>
                      ห้อง {r.roomNumber} ({r.deviceId})
                    </option>
                  ))}
                </select>
              </div>

              <p className="text-xs text-slate-400">
                เมื่อกดปุ่มคำสั่งด้านล่าง ระบบจะบรรจุคำสั่งลงคิว (`commandQueue`) และส่งกลับไปใน JSON Response ทันทีที่บอร์ด ESP32 ยิงค่ามิเตอร์เข้ามา หรือเมื่อ ESP32 เรียก Polling
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'RELAY_ON')}
                  className="p-3 rounded-2xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/50 text-left transition-all"
                >
                  <div className="text-xs font-black text-emerald-300">🟢 RELAY_ON (สั่งต่อไฟ)</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">สั่งขา GPIO {relayPin} = HIGH เพื่อจ่ายกระแสไฟเข้าห้อง</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'RELAY_OFF')}
                  className="p-3 rounded-2xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/50 text-left transition-all"
                >
                  <div className="text-xs font-black text-rose-300">🔴 RELAY_OFF (สั่งตัดไฟ)</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">สั่งขา GPIO {relayPin} = LOW เพื่อตัดไฟกรณีค้างชำระ/ฉุกเฉิน</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'FORCE_READ_NOW')}
                  className="p-3 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/50 text-left transition-all"
                >
                  <div className="text-xs font-black text-cyan-300">⚡ FORCE_READ_NOW</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">สั่งบอร์ดอ่านค่า PZEM-004T และส่งกลับทันที</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'RESET_KWH_COUNTER')}
                  className="p-3 rounded-2xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/50 text-left transition-all"
                >
                  <div className="text-xs font-black text-amber-300">🔄 RESET_KWH_COUNTER</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">สั่ง `pzem.resetEnergy()` รีเซ็ตหน่วยสะสมในโมดูล</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'SET_INTERVAL_2S')}
                  className="p-3 rounded-2xl bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-400/50 text-left transition-all"
                >
                  <div className="text-xs font-black text-indigo-300">⏱️ SET_INTERVAL_2S</div>
                  <div className="text-[11px] text-slate-300 mt-0.5">ตั้งความถี่การส่งข้อมูลจาก ESP32 เป็นทุก 2 วินาที</div>
                </button>

                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(simHwRoom, 'REBOOT_ESP32')}
                  className="p-3 rounded-2xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-left transition-all"
                >
                  <div className="text-xs font-black text-slate-200">♻️ REBOOT_ESP32</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">สั่งรีสตาร์ทไมโครคอนโทรลเลอร์ (`ESP.restart()`)</div>
                </button>
              </div>
            </div>

            {/* 2. Simulate Incoming ESP32 Hardware HTTP POST Packet */}
            <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-6 space-y-4 shadow-xl">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  ESP32 HTTP TELEMETRY WEBHOOK TESTER
                </span>
                <h3 className="text-lg font-black text-white">
                  จำลองบอร์ด ESP32 ยิงแพ็กเกจ JSON เข้าเซิร์ฟเวอร์ (`/api/features/iot-meter`)
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ใช้ทดสอบการทำงานของ API รับค่าฮาร์ดแวร์ได้ทันทีแม้ยังไม่ได้เสียบปลั๊กบอร์ด ESP32 จริง
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">แรงดัน (Voltage V)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simHwVoltage}
                    onChange={(e) => setSimHwVoltage(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono font-bold text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">กระแส (Current A)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={simHwCurrent}
                    onChange={(e) => setSimHwCurrent(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono font-bold text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">กำลังไฟ (Power W)</label>
                  <input
                    type="number"
                    value={simHwPower}
                    onChange={(e) => setSimHwPower(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono font-bold text-white"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 block mb-1">เลขมิเตอร์สะสม (kWh)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={simHwEnergy}
                    onChange={(e) => setSimHwEnergy(Number(e.target.value))}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-mono font-bold text-emerald-300"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleSimulateEsp32Packet}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-slate-950 font-black text-xs shadow-lg transition-all"
              >
                📡 ยิงแพ็กเกจ HTTP POST เสมือนบอร์ด ESP32 จริง (ห้อง {simHwRoom})
              </button>
            </div>
          </div>

          {/* Right 6 Cols: Command Queue & Live Telemetry Packet Logs */}
          <div className="lg:col-span-6 space-y-6">
            {/* Command Queue Status */}
            <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-3 shadow-xl">
              <h4 className="text-sm font-black text-white">
                📥 ประวัติคิวคำสั่งควบคุมบอร์ด ESP32 (Downlink Command Queue)
              </h4>
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {commandQueue.map((cmd) => (
                  <div
                    key={cmd.id}
                    className="rounded-xl bg-slate-950 border border-white/10 p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-cyan-300">[{cmd.command}]</span>
                        <span className="text-slate-300 font-bold">ห้อง {cmd.roomNumber}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{cmd.note}</div>
                    </div>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-black border shrink-0 ${
                        cmd.status === 'QUEUED'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-400/40 animate-pulse'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                      }`}
                    >
                      {cmd.status === 'QUEUED' ? '⏳ รอบอร์ดรับคำสั่ง' : '✅ ส่งถึงบอร์ดแล้ว'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Live Hardware Telemetry Log */}
            <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-3 shadow-xl">
              <h4 className="text-sm font-black text-white">
                📡 ล็อกแพ็กเกจข้อมูลที่รับเข้าจากบอร์ด ESP32 (Incoming Telemetry Packets)
              </h4>
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1 font-mono text-[11px]">
                {telemetryLogs.map((log) => (
                  <div
                    key={log.id}
                    className="rounded-xl bg-slate-950 border border-emerald-500/20 p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between text-emerald-300 font-bold">
                      <span>
                        [{log.deviceId}] ห้อง {log.roomNumber} • IP {log.ipAddress} ({log.wifiRssi} dBm)
                      </span>
                      <span className="text-slate-400 text-[10px]">
                        {new Date(log.timestamp).toLocaleTimeString('th-TH')}
                      </span>
                    </div>
                    <div className="text-slate-200">
                      V: {log.voltage}V | I: {log.current}A | P: {log.powerWatt}W | E:{' '}
                      <strong className="text-amber-300">{log.energyKwh} kWh</strong> | PF: {log.powerFactor} |
                      Relay: {log.relayState}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 4: ESP32 ARDUINO (.INO) SCRIPT GENERATOR & HARDWARE WIRING GUIDE
      ===================================================================== */}
      {activeTab === 'ESP32_SCRIPT' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 5 Cols: Firmware Configurator & Wiring Guide */}
          <div className="lg:col-span-5 space-y-6">
            <div className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-4 shadow-xl">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                  ESP32 FIRMWARE CONFIGURATOR
                </span>
                <h3 className="text-lg font-black text-white">
                  ตั้งค่าพารามิเตอร์ก่อนคัดลอกโค้ดลงบอร์ด ESP32
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ไฟล์ต้นฉบับถูกบันทึกไว้ให้แล้วที่{' '}
                  <code className="text-cyan-300">iot/esp32_smartdorm_meter/esp32_smartdorm_meter.ino</code>
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">ชื่อ Wi-Fi หอพัก (WIFI_SSID)</label>
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">รหัสผ่าน Wi-Fi (WIFI_PASSWORD)</label>
                  <input
                    type="text"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">
                    URL / IP ของเซิร์ฟเวอร์ระบบหอพักเกษร 2
                  </label>
                  <input
                    type="text"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-cyan-300"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">หมายเลขห้อง (ROOM_NUMBER)</label>
                    <select
                      value={scriptRoom}
                      onChange={(e) => setScriptRoom(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                    >
                      {rooms.map((r) => (
                        <option key={r.roomNumber} value={r.roomNumber}>
                          ห้อง {r.roomNumber}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">ความถี่ส่งข้อมูล (ms)</label>
                    <input
                      type="number"
                      step="500"
                      value={intervalMs}
                      onChange={(e) => setIntervalMs(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">PZEM RX (GPIO)</label>
                    <input
                      type="number"
                      value={pzemRxPin}
                      onChange={(e) => setPzemRxPin(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">PZEM TX (GPIO)</label>
                    <input
                      type="number"
                      value={pzemTxPin}
                      onChange={(e) => setPzemTxPin(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                    />
                  </div>
                  <div>
                    <label className="text-slate-400 font-bold block mb-1">Relay IN (GPIO)</label>
                    <input
                      type="number"
                      value={relayPin}
                      onChange={(e) => setRelayPin(Number(e.target.value))}
                      className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 font-mono text-white"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCopySketch}
                  className="py-3 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-lg transition-all"
                >
                  {copiedScript ? '✅ คัดลอกโค้ดแล้ว!' : '📋 คัดลอกโค้ด ESP32 (.ino)'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadSketch}
                  className="py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition-all"
                >
                  💾 ดาวน์โหลดไฟล์ .ino
                </button>
              </div>
            </div>

            {/* Hardware Wiring Table */}
            <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-3 shadow-xl">
              <h4 className="text-sm font-black text-white">
                🔌 ผังการต่อสายวงจรฮาร์ดแวร์ (ESP32 + PZEM-004T v3.0 + Relay 30A)
              </h4>
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400">
                      <th className="py-2">อุปกรณ์โมดูล</th>
                      <th className="py-2">ขาพินโมดูล</th>
                      <th className="py-2">ขาพินบอร์ด ESP32</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 font-mono text-[11px]">
                    <tr>
                      <td className="py-2 text-cyan-300 font-bold">PZEM-004T v3.0</td>
                      <td className="py-2 text-slate-200">5V / GND</td>
                      <td className="py-2 text-emerald-300">VIN (5V) / GND</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-cyan-300 font-bold">PZEM-004T v3.0</td>
                      <td className="py-2 text-slate-200">TX (ส่งข้อมูล)</td>
                      <td className="py-2 text-emerald-300">GPIO {pzemRxPin} (RX2)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-cyan-300 font-bold">PZEM-004T v3.0</td>
                      <td className="py-2 text-slate-200">RX (รับข้อมูล)</td>
                      <td className="py-2 text-emerald-300">GPIO {pzemTxPin} (TX2)</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-amber-300 font-bold">Relay Module 30A</td>
                      <td className="py-2 text-slate-200">IN (สั่งตัด/ต่อไฟ)</td>
                      <td className="py-2 text-emerald-300">GPIO {relayPin}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-indigo-300 font-bold">Onboard Status LED</td>
                      <td className="py-2 text-slate-200">LED_BUILTIN</td>
                      <td className="py-2 text-emerald-300">GPIO 2</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                💡 <strong>รองรับการทดสอบด้วยบอร์ด ESP32 เปล่า:</strong> โค้ดนี้มีระบบตรวจสอบอัตโนมัติ หากยังไม่ได้ต่อสายเซนเซอร์ PZEM-004T บอร์ด ESP32 จะสร้างสัญญาณจำลองส่งเข้าเว็บให้ทันที พร้อมรับคำสั่งเปิด-ปิดไฟ LED บนขา GPIO 2 และ GPIO {relayPin} ได้จริง
              </p>
            </div>
          </div>

          {/* Right 7 Cols: Live Generated Arduino C++ Code Viewer */}
          <div className="lg:col-span-7 rounded-3xl bg-slate-950 border border-cyan-500/30 p-5 shadow-2xl space-y-3">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <span className="text-xs font-mono font-black text-emerald-400">
                  iot/esp32_smartdorm_meter/esp32_smartdorm_meter.ino
                </span>
                <p className="text-[11px] text-slate-400">
                  รองรับ Arduino IDE และ VS Code PlatformIO (ESP32 Dev Module)
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySketch}
                className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-xs font-black text-cyan-200"
              >
                {copiedScript ? '✅ คัดลอกแล้ว' : '📋 Copy C++ Code'}
              </button>
            </div>

            <pre className="text-[11px] leading-relaxed font-mono text-cyan-100 overflow-x-auto max-h-[680px] overflow-y-auto p-3 rounded-2xl bg-black/60 border border-white/5">
              <code>{arduinoCode}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
