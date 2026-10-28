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
  const [inspectingRoomNo, setInspectingRoomNo] = useState<string | null>(null);
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
  const [simHwRoom, setSimHwRoom] = useState<string>('102');
  const [simHwVoltage, setSimHwVoltage] = useState<number>(229.4);
  const [simHwCurrent, setSimHwCurrent] = useState<number>(7.85);
  const [simHwPower, setSimHwPower] = useState<number>(1710);
  const [simHwEnergy, setSimHwEnergy] = useState<number>(1574.5);

  // ESP32 Firmware Generator Config
  const [wifiSsid, setWifiSsid] = useState<string>('KesornDorm_WiFi_2.4G');
  const [wifiPass, setWifiPass] = useState<string>('12345678');
  const [serverUrl, setServerUrl] = useState<string>('https://kesorn.phannext.com');
  const [scriptRoom, setScriptRoom] = useState<string>('101');
  const [pzemRxPin, setPzemRxPin] = useState<number>(16);
  const [pzemTxPin, setPzemTxPin] = useState<number>(17);
  const [relayPin, setRelayPin] = useState<number>(26);
  const [intervalMs, setIntervalMs] = useState<number>(3000);
  const [copiedScript, setCopiedScript] = useState<boolean>(false);

  // Edit Meter Modal State
  const [editingMeterRoom, setEditingMeterRoom] = useState<SmartMeterRoomNode | null>(null);
  const [editCurrentKwh, setEditCurrentKwh] = useState<string>('');
  const [editPrevKwh, setEditPrevKwh] = useState<string>('');
  const [editWaterCurrent, setEditWaterCurrent] = useState<string>('');
  const [editWaterPrev, setEditWaterPrev] = useState<string>('');
  const [isSavingMeter, setIsSavingMeter] = useState<boolean>(false);

  const openEditMeterModal = (room: SmartMeterRoomNode) => {
    setEditingMeterRoom(room);
    setEditCurrentKwh(room.currentMeterKwh.toFixed(2));
    setEditPrevKwh(room.previousMonthKwh.toFixed(2));
    setEditWaterCurrent(room.waterCurrentM3.toString());
    setEditWaterPrev(room.waterPreviousM3.toString());
  };

  const handleSaveMeterReading = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingMeterRoom) return;
    setIsSavingMeter(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'set_meter_reading',
          roomNumber: editingMeterRoom.roomNumber,
          currentMeterKwh: parseFloat(editCurrentKwh),
          previousMonthKwh: parseFloat(editPrevKwh),
          waterCurrentM3: parseFloat(editWaterCurrent),
          waterPreviousM3: parseFloat(editWaterPrev),
        }),
      });
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setSummary(json.summary || null);
        showToast(
          `⚙️ อัปเดตเลขมิเตอร์ห้อง ${editingMeterRoom.roomNumber} สำเร็จ`,
          `ตั้งค่าเลขปัจจุบันเป็น ${parseFloat(editCurrentKwh).toFixed(2)} kWh เรียบร้อยแล้ว`,
          'emerald'
        );
        setEditingMeterRoom(null);
      } else {
        showToast('เกิดข้อผิดพลาด', json.message || 'ไม่สามารถบันทึกได้', 'rose');
      }
    } catch {
      showToast('เกิดข้อผิดพลาด', 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'rose');
    } finally {
      setIsSavingMeter(false);
    }
  };

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
    const livePollTimer = setInterval(() => {
      fetchFleetState();
    }, 2500);
    return () => clearInterval(livePollTimer);
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
  const inspectingRoom = inspectingRoomNo ? rooms.find((r) => r.roomNumber === inspectingRoomNo) || null : null;
  const esp32Node = rooms.find((r) => r.nodeMode === 'REAL_IOT_HYBRID') || rooms.find((r) => r.roomNumber === '101') || rooms[0] || null;

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

          {(() => {
            const r101 = rooms.find((r) => r.roomNumber === '101');
            const isEspOnline = r101?.esp32Meta?.espStatus === 'ONLINE';
            const pzemStatus = r101?.esp32Meta?.pzemStatus;

            return (
              <div
                className={`rounded-2xl p-4 col-span-2 sm:col-span-1 border transition-all ${
                  isEspOnline
                    ? 'bg-slate-950/90 border-emerald-400/60 shadow-[0_0_15px_rgba(16,185,129,0.2)]'
                    : 'bg-slate-950/80 border-rose-500/30'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-300">ฮาร์ดแวร์ห้อง 101</span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1.5 ${
                      isEspOnline
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                        : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        isEspOnline ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'
                      }`}
                    />
                    {isEspOnline ? 'ESP32 ONLINE' : 'ESP32 OFFLINE'}
                  </span>
                </div>

                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-white">
                    {isEspOnline ? (r101?.esp32Meta?.ipAddress || 'Connected') : 'ไม่มีสัญญาณ'}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-black border ${
                      pzemStatus === 'CONNECTED'
                        ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                        : isEspOnline
                        ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                        : 'bg-slate-800 text-slate-500 border-white/10'
                    }`}
                  >
                    {pzemStatus === 'CONNECTED'
                      ? '⚡ PZEM 220V READY'
                      : isEspOnline
                      ? '⚠️ PZEM รอไฟ AC'
                      : 'PZEM OFFLINE'}
                  </span>
                </div>

                <div className="text-[10px] text-slate-400 mt-1 truncate">
                  {isEspOnline
                    ? `WiFi: ${r101?.esp32Meta?.wifiRssi || -50} dBm • ${
                        pzemStatus === 'CONNECTED'
                          ? `วัดไฟจริง: ${r101?.voltage.toFixed(1)}V (${r101?.activePowerWatt}W)`
                          : 'เซนเซอร์รอจ่ายไฟ AC 220V'
                      }`
                    : 'รอ ESP32 ส่งแพ็กเก็ตแรกเข้า Server'}
                </div>
              </div>
            );
          })()}
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
        inspectingRoomNo ? (
          /* =====================================================================
             DEDICATED FULL-PAGE ROOM INSPECTOR (เมื่อคลิกดูรายละเอียดที่ห้องใดห้องหนึ่ง)
          ===================================================================== */
          <div className="space-y-6">
            {/* Top Navigation & Breadcrumb Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/90 border border-cyan-500/30 rounded-3xl p-5 shadow-2xl">
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => setInspectingRoomNo(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-white/10 hover:border-cyan-400/50 text-xs font-black text-cyan-300 hover:text-white transition-all flex items-center gap-2 group shadow-sm"
                >
                  <span className="transition-transform group-hover:-translate-x-1">←</span>
                  <span>กลับหน้ารวมมิเตอร์ 20 ห้อง & Log ESP32</span>
                </button>
                <div className="h-6 w-[1px] bg-white/10 hidden sm:block" />
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-xl font-black text-white">
                      ห้อง {inspectingRoom?.roomNumber || inspectingRoomNo}
                    </h2>
                    <span className="text-xs text-slate-400">({inspectingRoom?.roomType || 'Standard'})</span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        inspectingRoom?.nodeMode === 'REAL_IOT_HYBRID'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                          : 'bg-indigo-500/20 text-indigo-300 border-indigo-400/40'
                      }`}
                    >
                      {inspectingRoom?.nodeMode === 'REAL_IOT_HYBRID' ? '📡 REAL IoT NODE' : '🤖 SIMULATOR NODE'}
                    </span>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        inspectingRoom?.relayState === 'ON'
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                          : 'bg-rose-500/30 text-rose-200 border-rose-400/50'
                      }`}
                    >
                      {inspectingRoom?.relayState === 'ON' ? '⚡ จ่ายไฟปกติ' : '🛑 ตัดกระแสไฟ'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    ผู้เช่า: <strong className="text-slate-200">{inspectingRoom?.tenantName || 'ห้องว่าง (Standby)'}</strong> • Device ID: <code className="text-cyan-300 font-mono">{inspectingRoom?.deviceId || '-'}</code>
                  </p>
                </div>
              </div>

              {/* Quick Room Switcher */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-bold hidden md:inline">สลับดูห้องอื่น:</span>
                <select
                  value={inspectingRoomNo}
                  onChange={(e) => {
                    setInspectingRoomNo(e.target.value);
                    setSelectedRoomNo(e.target.value);
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-xs font-black text-cyan-300 focus:outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {rooms.map((r) => (
                    <option key={r.roomNumber} value={r.roomNumber}>
                      ห้อง {r.roomNumber} {r.nodeMode === 'REAL_IOT_HYBRID' ? '(📡 ESP32)' : ''} - {r.tenantName || 'ห้องว่าง'}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {inspectingRoom && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left 7 Cols: Digital LCD Meter & Quick Adjustments & Appliance Switches */}
                <div className="lg:col-span-7 space-y-6">
                  {/* Digital LCD Meter Screen */}
                  <div className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-4 shadow-xl">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <span className="text-[10px] font-mono font-black uppercase tracking-wider text-cyan-400">
                          DIGITAL SMART METER SCREEN • {inspectingRoom.deviceId}
                        </span>
                        <h3 className="text-lg font-black text-white">
                          หน้าจอดิจิทัลอ่านค่ามิเตอร์ไฟฟ้า (Real-Time Reading)
                        </h3>
                      </div>
                      <button
                        type="button"
                        onClick={() => openEditMeterModal(inspectingRoom)}
                        className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 text-xs font-black transition-all flex items-center gap-1.5 shadow-sm"
                      >
                        ✏️ ปรับแก้เลขมิเตอร์ (Calibrate)
                      </button>
                    </div>

                    <div className="rounded-2xl bg-slate-950 border border-cyan-500/20 p-5 font-mono">
                      <div className="flex items-baseline justify-between">
                        <span className="text-xs text-slate-400">CURRENT METER COUNTER</span>
                        <span className="text-xs text-cyan-400 font-bold">
                          +{inspectingRoom.monthlyUnitsKwh.toFixed(2)} kWh ในรอบบิลนี้
                        </span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black tracking-wider text-emerald-300 mt-1">
                        {inspectingRoom.currentMeterKwh.toFixed(2)} <span className="text-sm text-slate-400 font-normal">kWh</span>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-white/10 text-xs">
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
                          <span className="text-slate-400 block text-[10px]">VOLTAGE (แรงดัน)</span>
                          <span className="text-white font-black text-base">{inspectingRoom.voltage.toFixed(1)} V</span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
                          <span className="text-slate-400 block text-[10px]">CURRENT (กระแส)</span>
                          <span className="text-white font-black text-base">{inspectingRoom.current.toFixed(2)} A</span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
                          <span className="text-slate-400 block text-[10px]">POWER (กำลังไฟ)</span>
                          <span
                            className={`font-black text-base ${
                              inspectingRoom.activePowerWatt >= 3000 ? 'text-rose-400 animate-pulse' : 'text-amber-300'
                            }`}
                          >
                            {inspectingRoom.activePowerWatt} W
                          </span>
                        </div>
                        <div className="bg-slate-900/60 p-2.5 rounded-xl border border-white/5">
                          <span className="text-slate-400 block text-[10px]">POWER FACTOR / FREQ</span>
                          <span className="text-cyan-300 font-black text-base">
                            {(inspectingRoom.esp32Meta as any)?.powerFactor || 0.95} / 50Hz
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Meter Adjustment & Bill Preview */}
                    <div className="rounded-2xl bg-slate-950/70 border border-white/10 p-4 space-y-3">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">เลขมิเตอร์ยกยอดมาจากเดือนก่อน:</span>
                        <span className="font-mono font-bold text-slate-200">
                          {inspectingRoom.previousMonthKwh.toFixed(2)} kWh
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-slate-400">เลขมิเตอร์ปัจจุบัน (อ่านสด):</span>
                        <span className="font-mono font-black text-emerald-300">
                          {inspectingRoom.currentMeterKwh.toFixed(2)} kWh
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs border-t border-white/10 pt-2">
                        <span className="text-slate-200 font-bold">หน่วยไฟที่ใช้เดือนนี้ (× ฿8):</span>
                        <span className="font-mono font-black text-amber-300 text-sm">
                          {inspectingRoom.monthlyUnitsKwh.toFixed(2)} kWh = ฿
                          {(inspectingRoom.monthlyUnitsKwh * 8).toLocaleString('th-TH', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                      </div>

                      {inspectingRoom.roomNumber === '101' || inspectingRoom.nodeMode === 'REAL_IOT_HYBRID' ? (
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => handleSendEsp32Command(inspectingRoom.roomNumber, 'RESET_KWH_COUNTER')}
                            className="w-full py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-rose-300 transition-all text-center"
                          >
                            รีเซ็ต 0 kWh (ส่งคำสั่ง RESET_KWH_COUNTER ไปยัง PZEM)
                          </button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleUpdateRoomLoad(inspectingRoom.roomNumber, { addKwh: 10 })}
                            className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-cyan-300 transition-all"
                          >
                            +10 kWh
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateRoomLoad(inspectingRoom.roomNumber, { addKwh: 50 })}
                            className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-amber-300 transition-all"
                          >
                            +50 kWh
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSendEsp32Command(inspectingRoom.roomNumber, 'RESET_KWH_COUNTER')}
                            className="py-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-white/10 text-xs font-bold text-rose-300 transition-all"
                          >
                            รีเซ็ต 0 kWh
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Interactive Appliance Load Switches (เฉพาะห้องจำลอง 102–210 เท่านั้น / ห้อง 101 ใช้ฮาร์ดแวร์จริง) */}
                  {inspectingRoom.roomNumber === '101' || inspectingRoom.nodeMode === 'REAL_IOT_HYBRID' ? (
                    <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-5 space-y-2 shadow-xl">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <h4 className="text-sm font-bold text-white">
                          โหนดฮาร์ดแวร์จริง ESP32 + PZEM-004T
                        </h4>
                      </div>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        ห้อง {inspectingRoom.roomNumber} รับส่งข้อมูลกับเซ็นเซอร์วัดไฟจริงแบบ Real-Time ไม่มีตัวควบคุมจำลองโหลดเครื่องใช้ไฟฟ้า
                      </p>
                    </div>
                  ) : (
                    <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-6 space-y-4 shadow-xl">
                      <div>
                        <h4 className="text-sm font-black text-white">
                          จำลองเปิด-ปิดเครื่องใช้ไฟฟ้าในห้อง (กระทบค่า A, W, kWh แบบ Real-Time)
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          คลิกเพื่อสลับสถานะเปิด/ปิดเครื่องใช้ไฟฟ้า ระบบจะคำนวณกำลังวัตต์และกระแสแอมป์ใหม่ทันที
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {[
                          {
                            key: 'acOn' as const,
                            label: '❄️ เครื่องปรับอากาศ (Inverter AC)',
                            watt: '+1,150 W',
                            desc: 'แอร์ห้องนอน เบอร์ 5',
                            active: inspectingRoom.appliances.acOn,
                          },
                          {
                            key: 'waterHeaterOn' as const,
                            label: '🚿 เครื่องทำน้ำอุ่น (Water Heater)',
                            watt: '+3,300 W',
                            desc: 'เครื่องทำน้ำอุ่นในห้องน้ำ',
                            active: inspectingRoom.appliances.waterHeaterOn,
                          },
                          {
                            key: 'pcLoadOn' as const,
                            label: '🖥️ คอมพิวเตอร์ / ทีวี / ตู้เย็น',
                            watt: '+420 W',
                            desc: 'โหลดพื้นฐานประจำห้อง',
                            active: inspectingRoom.appliances.pcLoadOn,
                          },
                          {
                            key: 'faultOverload' as const,
                            label: '⚠️ จำลองไฟรั่ว / โหลดเกินพิกัด',
                            watt: '+4,800 W',
                            desc: 'ทดสอบระบบเตือน Overload',
                            active: inspectingRoom.appliances.faultOverload,
                          },
                        ].map((item) => (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() =>
                              handleUpdateRoomLoad(inspectingRoom.roomNumber, {
                                appliances: { [item.key]: !item.active },
                              })
                            }
                            className={`flex flex-col justify-between p-3.5 rounded-2xl border text-left transition-all ${
                              item.active
                                ? item.key === 'faultOverload'
                                  ? 'bg-rose-500/25 border-rose-400 text-white ring-2 ring-rose-400/30'
                                  : 'bg-cyan-500/20 border-cyan-400/60 text-white ring-2 ring-cyan-400/30'
                                : 'bg-slate-950/80 border-white/10 text-slate-400 hover:text-white hover:border-white/20'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs">{item.label}</span>
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-black font-mono ${
                                  item.active ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-400'
                                }`}
                              >
                                {item.active ? 'ON (ทำงาน)' : 'OFF (ปิด)'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[11px]">
                              <span className="text-slate-400 text-[10px]">{item.desc}</span>
                              <span className="font-mono font-bold text-amber-300">{item.watt}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right 5 Cols: Mode Switcher, Hardware Diagnostics, Relay Breaker, Tenant Info */}
                <div className="lg:col-span-5 space-y-6">
                  {/* Mode Switcher */}
                  {inspectingRoom.roomNumber === '101' ? (
                    <div className="rounded-3xl bg-slate-900/90 border border-emerald-500/30 p-4 space-y-2 shadow-xl">
                      <div className="text-xs font-bold text-white">โหมดฮาร์ดแวร์ประจำห้อง 101</div>
                      <div className="py-2.5 px-3 rounded-xl text-xs font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 text-center">
                        📡 โหมดฮาร์ดแวร์ ESP32 ถาวร (ไม่มีโหมดจำลอง)
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-5 space-y-3 shadow-xl">
                      <div className="text-xs font-black text-white">โหมดการทำงานของโหนดมิเตอร์ห้อง {inspectingRoom.roomNumber}</div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoomLoad(inspectingRoom.roomNumber, { nodeMode: 'REAL_IOT_HYBRID' })
                          }
                          className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                            inspectingRoom.nodeMode === 'REAL_IOT_HYBRID'
                              ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-md'
                              : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                          }`}
                        >
                          📡 เชื่อมต่อ ESP32 จริง
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateRoomLoad(inspectingRoom.roomNumber, { nodeMode: 'SMART_SIMULATOR' })
                          }
                          className={`py-2.5 px-3 rounded-xl text-xs font-black border transition-all ${
                            inspectingRoom.nodeMode === 'SMART_SIMULATOR'
                              ? 'bg-indigo-500 text-white border-indigo-300 shadow-md'
                              : 'bg-slate-950 text-slate-400 border-white/10 hover:text-white'
                          }`}
                        >
                          🤖 โหมดจำลองอัจฉริยะ
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Real IoT Hardware Node Diagnostic Panel */}
                  {inspectingRoom.nodeMode === 'REAL_IOT_HYBRID' && (
                    <div
                      className={`rounded-3xl p-5 space-y-4 border transition-all shadow-xl ${
                        inspectingRoom.esp32Meta?.isHardwareConnected
                          ? 'bg-slate-900/95 border-emerald-500/40 shadow-[0_0_20px_rgba(16,185,129,0.15)]'
                          : 'bg-slate-900/95 border-rose-500/40'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-white/10 pb-3">
                        <span className="text-xs font-black text-white flex items-center gap-2">
                          <span
                            className={`w-2.5 h-2.5 rounded-full ${
                              inspectingRoom.esp32Meta?.isHardwareConnected
                                ? 'bg-emerald-400 animate-ping'
                                : 'bg-rose-500'
                            }`}
                          />
                          ฮาร์ดแวร์จริง: {inspectingRoom.deviceId}
                        </span>
                        <span
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                            inspectingRoom.esp32Meta?.isHardwareConnected
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                              : 'bg-rose-500/20 text-rose-300 border-rose-400/40'
                          }`}
                        >
                          {inspectingRoom.esp32Meta?.isHardwareConnected ? 'ESP32 ONLINE' : 'ESP32 OFFLINE'}
                        </span>
                      </div>

                      {/* ESP32 Details Grid */}
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono bg-slate-950 p-3 rounded-2xl border border-white/5">
                        <div>
                          <span className="text-slate-500 block text-[9px]">IP ADDRESS</span>
                          <span className="text-slate-200 font-bold">{inspectingRoom.esp32Meta?.ipAddress || '-'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">WIFI RSSI</span>
                          <span className="text-emerald-300 font-bold">
                            {inspectingRoom.esp32Meta?.wifiRssi ? `${inspectingRoom.esp32Meta.wifiRssi} dBm` : '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">MAC ADDRESS</span>
                          <span className="text-slate-400 text-[10px] truncate block">
                            {inspectingRoom.esp32Meta?.macAddress || '-'}
                          </span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[9px]">LAST PACKET</span>
                          <span className="text-cyan-300 text-[10px]">
                            {inspectingRoom.esp32Meta?.lastHardwarePacketAt
                              ? new Date(inspectingRoom.esp32Meta.lastHardwarePacketAt).toLocaleTimeString('th-TH')
                              : 'ยังไม่เคยรับ'}
                          </span>
                        </div>
                      </div>

                      {/* PZEM-004T Status Banner */}
                      <div
                        className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-2 ${
                          inspectingRoom.esp32Meta?.pzemStatus === 'CONNECTED'
                            ? 'bg-cyan-950/40 border-cyan-400/40 text-cyan-200'
                            : inspectingRoom.esp32Meta?.isHardwareConnected
                            ? 'bg-amber-950/40 border-amber-400/40 text-amber-200'
                            : 'bg-slate-950 border-white/10 text-slate-400'
                        }`}
                      >
                        <div>
                          <div className="font-black flex items-center gap-1.5">
                            <span>⚡ PZEM-004T:</span>
                            <span>
                              {inspectingRoom.esp32Meta?.pzemStatus === 'CONNECTED'
                                ? '🟢 CONNECTED (วัดไฟ 220V สำเร็จ)'
                                : inspectingRoom.esp32Meta?.isHardwareConnected
                                ? '🟠 WAITING AC (รอไฟบ้าน 220V)'
                                : '🔴 OFFLINE'}
                            </span>
                          </div>
                          <div className="text-[10px] opacity-80 mt-0.5">
                            {inspectingRoom.esp32Meta?.pzemStatus === 'CONNECTED'
                              ? `วัดจริง: ${inspectingRoom.voltage.toFixed(1)}V • ${inspectingRoom.current.toFixed(2)}A • ${inspectingRoom.activePowerWatt}W`
                              : inspectingRoom.esp32Meta?.isHardwareConnected
                              ? 'ESP32 ส่งสัญญาณได้แล้ว แต่ PZEM ยังไม่อ่านค่า (โปรดต่อไฟ 220V AC เข้า L/N หรือตรวจสาย RX/TX)'
                              : 'บอร์ด ESP32 ออฟไลน์'}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSendEsp32Command(inspectingRoom.roomNumber, 'FORCE_READ_NOW')}
                          className="px-3 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/40 border border-cyan-400/40 text-[10px] font-black text-cyan-300 shrink-0 transition-all"
                        >
                          🔄 ดึงค่าสด
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Remote Breaker Relay Control */}
                  <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-5 space-y-3.5 shadow-xl">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-white">เบรกเกอร์ตัด-ต่อไฟระยะไกล (Smart Breaker Relay)</span>
                      <span
                        className={`text-xs font-black ${
                          inspectingRoom.relayState === 'ON' ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {inspectingRoom.relayState === 'ON' ? '🟢 จ่ายไฟปกติ (ON)' : '🔴 ตัดกระแสไฟ (OFF)'}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleSendEsp32Command(inspectingRoom.roomNumber, 'RELAY_ON')}
                        className={`py-3 px-3 rounded-xl text-xs font-black border transition-all ${
                          inspectingRoom.relayState === 'ON'
                            ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-lg'
                            : 'bg-slate-950 text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20'
                        }`}
                      >
                        🟢 สั่งจ่ายไฟ (RELAY ON)
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSendEsp32Command(inspectingRoom.roomNumber, 'RELAY_OFF')}
                        className={`py-3 px-3 rounded-xl text-xs font-black border transition-all ${
                          inspectingRoom.relayState === 'OFF'
                            ? 'bg-rose-500 text-white border-rose-300 shadow-lg'
                            : 'bg-slate-950 text-rose-300 border-rose-500/30 hover:bg-rose-500/20'
                        }`}
                      >
                        🔴 สั่งตัดไฟ (RELAY OFF)
                      </button>
                    </div>
                  </div>

                  {/* Tenant & Room Info */}
                  <div className="rounded-3xl bg-slate-900/90 border border-white/10 p-5 space-y-3 shadow-xl">
                    <div className="text-xs font-black text-white">ข้อมูลผู้เช่าและสัญญาห้อง {inspectingRoom.roomNumber}</div>
                    <div className="space-y-2 text-xs">
                      <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-white/5">
                        <span className="text-slate-400">ชื่อผู้เช่า:</span>
                        <span className="font-bold text-white">{inspectingRoom.tenantName || 'ห้องว่าง (Standby)'}</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-white/5">
                        <span className="text-slate-400">ประเภทห้อง:</span>
                        <span className="font-bold text-cyan-300">{inspectingRoom.roomType} (ชั้น {inspectingRoom.floor})</span>
                      </div>
                      <div className="flex items-center justify-between bg-slate-950 p-2.5 rounded-xl border border-white/5">
                        <span className="text-slate-400">มิเตอร์น้ำประปา:</span>
                        <span className="font-mono font-bold text-slate-200">
                          {inspectingRoom.waterCurrentM3} m³ (งวดก่อน: {inspectingRoom.waterPreviousM3} m³)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
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
                          <div className="flex flex-wrap items-center gap-1.5">
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
                            {isRealNode && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black flex items-center gap-1 border ${
                                  room.esp32Meta?.espStatus === 'ONLINE'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-400/30'
                                }`}
                              >
                                <span
                                  className={`w-1.5 h-1.5 rounded-full ${
                                    room.esp32Meta?.espStatus === 'ONLINE' ? 'bg-emerald-400 animate-ping' : 'bg-rose-400'
                                  }`}
                                />
                                {room.esp32Meta?.espStatus === 'ONLINE' ? 'ESP ONLINE' : 'ESP OFFLINE'}
                              </span>
                            )}
                            {isRealNode && (
                              <span
                                className={`px-1.5 py-0.5 rounded text-[9px] font-black border ${
                                  room.esp32Meta?.pzemStatus === 'CONNECTED'
                                    ? 'bg-cyan-500/20 text-cyan-300 border-cyan-400/40'
                                    : room.esp32Meta?.espStatus === 'ONLINE'
                                    ? 'bg-amber-500/20 text-amber-300 border-amber-400/40'
                                    : 'bg-slate-800 text-slate-500 border-white/10'
                                }`}
                              >
                                {room.esp32Meta?.pzemStatus === 'CONNECTED'
                                  ? '⚡ 220V READY'
                                  : room.esp32Meta?.espStatus === 'ONLINE'
                                  ? '⚠️ WAITING AC'
                                  : 'PZEM OFF'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate max-w-[160px] mt-0.5">
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
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400">METER READING</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditMeterModal(room);
                              }}
                              title={`ปรับแก้เลขมิเตอร์ห้อง ${room.roomNumber}`}
                              className="px-1.5 py-0.5 rounded bg-white/10 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 text-[10px] font-bold transition-all border border-white/5 hover:border-cyan-500/30 flex items-center gap-1"
                            >
                              ✏️ แก้ไข
                            </button>
                          </div>
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
                          {isRealNode ? (
                            <span className="text-[10px] text-emerald-400 font-mono">📡 PZEM-004T (ฮาร์ดแวร์จริง)</span>
                          ) : (
                            <>
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
                            </>
                          )}
                        </div>
                        <span className="font-black text-emerald-300">
                          ≈ ฿{Math.round(room.monthlyUnitsKwh * 8).toLocaleString()}
                        </span>
                      </div>

                      {/* View Details / Control Room Button */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedRoomNo(room.roomNumber);
                          setInspectingRoomNo(room.roomNumber);
                        }}
                        className="mt-3 w-full py-2 px-3 rounded-xl bg-slate-950 hover:bg-cyan-500/20 border border-white/10 hover:border-cyan-400/40 text-xs font-bold text-slate-300 hover:text-cyan-300 transition-all flex items-center justify-center gap-1.5 group shadow-sm"
                      >
                        <span>🔍 ดูรายละเอียด & ควบคุมห้อง {room.roomNumber}</span>
                        <span className="transition-transform group-hover:translate-x-1 font-mono">→</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Right 4 Cols: ESP32 Telemetry Log (Plain / Undecorated) */}
          <div className="lg:col-span-4 rounded-2xl bg-slate-900 border border-white/10 p-4 space-y-3 sticky top-6">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  ESP32 Log (ห้อง {esp32Node?.roomNumber || '101'})
                </h3>
                <div className="text-xs text-slate-400 font-mono">
                  IP: {esp32Node?.esp32Meta?.ipAddress || '-'} | RSSI: {esp32Node?.esp32Meta?.wifiRssi ? `${esp32Node.esp32Meta.wifiRssi} dBm` : '-'}
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold ${
                  esp32Node?.esp32Meta?.espStatus === 'ONLINE'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-rose-500/20 text-rose-300'
                }`}
              >
                {esp32Node?.esp32Meta?.espStatus === 'ONLINE' ? 'ONLINE' : 'OFFLINE'}
              </span>
            </div>

            {esp32Node && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleSendEsp32Command(esp32Node.roomNumber, 'FORCE_READ_NOW')}
                  className="flex-1 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-xs font-mono transition-all text-center"
                >
                  Force Read
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedRoomNo(esp32Node.roomNumber);
                    setInspectingRoomNo(esp32Node.roomNumber);
                  }}
                  className="flex-1 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-white/10 text-slate-300 hover:text-white text-xs font-mono transition-all text-center"
                >
                  จัดการห้อง 101 →
                </button>
              </div>
            )}

            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400 font-mono">
                <span>Logs ({telemetryLogs.length})</span>
                <span className="text-[10px]">auto-refresh 2.5s</span>
              </div>

              <div className="bg-black/90 border border-white/10 rounded-xl p-3 font-mono text-[11px] leading-relaxed max-h-[520px] overflow-y-auto space-y-1 text-slate-300">
                {telemetryLogs.length === 0 ? (
                  <div className="text-slate-500">รอรับข้อมูลจาก ESP32...</div>
                ) : (
                  telemetryLogs.map((log) => (
                    <div key={log.id} className="whitespace-pre-wrap break-all border-b border-white/5 pb-1">
                      <span className="text-slate-500">[{new Date(log.timestamp).toLocaleTimeString('th-TH')}]</span>{' '}
                      <span className="text-emerald-400">[{log.deviceId}]</span>{' '}
                      <span>{log.voltage}V</span>{' '}
                      <span>{log.current}A</span>{' '}
                      <span className="text-amber-300">{log.powerWatt}W</span>{' '}
                      <span className="text-cyan-300">{log.energyKwh.toFixed(2)}kWh</span>{' '}
                      <span className="text-slate-400">PF:{log.powerFactor}</span>{' '}
                      <span className="text-slate-400">Relay:{log.relayState}</span>{' '}
                      <span className="text-slate-600">({log.ipAddress})</span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )
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
                            billId={parseInt(bill.billRef.replace(/\D/g, '') || '0', 10) || null}
                            roomNumber={bill.roomNumber}
                            tenantName={bill.tenantName}
                            billTitle={`บิลค่าไฟ รอบ ${bill.billingCycle}`}
                            amount={bill.totalAmount}
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

      {/* =====================================================================
          MODAL: EDIT / CALIBRATE METER READING (RESEARCHER TOOL)
          Safe-Viewport Modal Pattern (Anti-Overflow, Mobile Friendly, 85dvh)
      ===================================================================== */}
      {editingMeterRoom && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-3xl bg-slate-900 border border-cyan-500/30 shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden my-auto text-white">
            {/* Sticky Modal Header */}
            <div className="shrink-0 flex items-start justify-between border-b border-white/10 p-5 sm:p-6 bg-slate-950/80">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {editingMeterRoom.nodeMode === 'REAL_IOT_HYBRID' ? '🟢 REAL IOT NODE' : '🤖 SMART SIMULATOR'}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    ID: {editingMeterRoom.deviceId}
                  </span>
                </div>
                <h3 className="text-base sm:text-lg font-black text-white mt-1 flex items-center gap-2">
                  <span>⚙️ ปรับตั้งเลขมิเตอร์ ห้อง {editingMeterRoom.roomNumber}</span>
                  <span className="text-sm font-normal text-slate-400">({editingMeterRoom.roomType})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  ผู้เช่า: {editingMeterRoom.tenantName || 'ห้องว่าง'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingMeterRoom(null)}
                className="p-1.5 px-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all text-xs shrink-0 cursor-pointer"
              >
                ✕ ปิด
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveMeterReading} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* Scrollable Body (Never overflows outside screen) */}
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 custom-scrollbar">
                {/* Electric Meter Group */}
                <div className="rounded-2xl bg-slate-950 p-4 border border-white/10 space-y-3">
                  <div className="text-xs font-black text-amber-300 flex items-center gap-1.5">
                    <span>⚡ มิเตอร์ไฟฟ้า (Electricity Meter - kWh)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">
                        เลขมิเตอร์ปัจจุบัน (Current):
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={editCurrentKwh}
                          onChange={(e) => setEditCurrentKwh(e.target.value)}
                          className="w-full rounded-xl bg-slate-900 border border-cyan-500/40 px-3 py-2 text-sm font-mono font-black text-emerald-300 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          placeholder="3675.00"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">kWh</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">
                        เลขยกมาต้นงวด (Previous):
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          required
                          value={editPrevKwh}
                          onChange={(e) => setEditPrevKwh(e.target.value)}
                          className="w-full rounded-xl bg-slate-900 border border-white/20 px-3 py-2 text-sm font-mono font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-400"
                          placeholder="3675.00"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">kWh</span>
                      </div>
                    </div>
                  </div>

                  {/* Live Preview Box */}
                  {(() => {
                    const curr = parseFloat(editCurrentKwh) || 0;
                    const prev = parseFloat(editPrevKwh) || 0;
                    const diff = Math.max(0, curr - prev);
                    const cost = diff * 8;
                    return (
                      <div className="rounded-xl bg-cyan-950/40 border border-cyan-500/20 p-2.5 flex items-center justify-between text-xs">
                        <span className="text-slate-300">
                          หน่วยไฟใช้จริงเดือนนี้: <strong className="text-amber-300 font-mono">{diff.toFixed(2)} kWh</strong>
                        </span>
                        <span className="text-slate-300">
                          ค่าไฟโดยประมาณ: <strong className="text-emerald-300 font-mono">฿{cost.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong>
                        </span>
                      </div>
                    );
                  })()}

                  {/* Quick Helper Presets */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <span className="text-[10px] text-slate-500 mr-1">ทางลัด:</span>
                    <button
                      type="button"
                      onClick={() => {
                        const prev = parseFloat(editPrevKwh) || 0;
                        setEditCurrentKwh(prev.toFixed(2));
                      }}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-slate-300 border border-white/10 cursor-pointer"
                    >
                      หน่วยใช้ = 0 (เท่ากับต้นงวด)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const curr = parseFloat(editCurrentKwh) || 0;
                        setEditCurrentKwh((curr + 10).toFixed(2));
                      }}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-cyan-300 border border-white/10 cursor-pointer"
                    >
                      +10 kWh
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const curr = parseFloat(editCurrentKwh) || 0;
                        setEditCurrentKwh((curr + 50).toFixed(2));
                      }}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-amber-300 border border-white/10 cursor-pointer"
                    >
                      +50 kWh
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const curr = parseFloat(editCurrentKwh) || 0;
                        setEditCurrentKwh((curr + 100).toFixed(2));
                      }}
                      className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[10px] text-rose-300 border border-white/10 cursor-pointer"
                    >
                      +100 kWh
                    </button>
                  </div>
                </div>

                {/* Water Meter Group */}
                <div className="rounded-2xl bg-slate-950 p-4 border border-white/10 space-y-3">
                  <div className="text-xs font-black text-sky-300 flex items-center gap-1.5">
                    <span>💧 มิเตอร์น้ำประปา (Water Meter - m³)</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">
                        เลขมิเตอร์น้ำปัจจุบัน:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          required
                          value={editWaterCurrent}
                          onChange={(e) => setEditWaterCurrent(e.target.value)}
                          className="w-full rounded-xl bg-slate-900 border border-sky-500/40 px-3 py-2 text-sm font-mono font-bold text-sky-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">m³</span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-slate-400 mb-1">
                        เลขยกมาต้นงวด:
                      </label>
                      <div className="relative">
                        <input
                          type="number"
                          step="1"
                          required
                          value={editWaterPrev}
                          onChange={(e) => setEditWaterPrev(e.target.value)}
                          className="w-full rounded-xl bg-slate-900 border border-white/20 px-3 py-2 text-sm font-mono font-bold text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-400"
                        />
                        <span className="absolute right-3 top-2.5 text-xs text-slate-500 font-mono">m³</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sticky Footer Modal Actions */}
              <div className="shrink-0 flex items-center justify-end gap-3 p-4 sm:p-5 bg-slate-950/90 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setEditingMeterRoom(null)}
                  className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSavingMeter}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-black text-xs shadow-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSavingMeter ? '⏳ กำลังบันทึก...' : '💾 บันทึกเลขมิเตอร์'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
