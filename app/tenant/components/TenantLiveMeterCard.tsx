'use client';

import React, { useState, useEffect } from 'react';

interface TenantLiveMeterCardProps {
  roomNumber: string;
}

export default function TenantLiveMeterCard({ roomNumber }: TenantLiveMeterCardProps) {
  const [meterData, setMeterData] = useState<{
    voltage: number;
    current: number;
    activePowerWatt: number;
    currentMeterKwh: number;
    monthlyUnitsKwh: number;
    relayState: string;
    isHardwareConnected: boolean;
    espStatus: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMeter = async () => {
    try {
      const res = await fetch('/api/features/iot-meter');
      const data = await res.json();
      if (data.success && data.rooms) {
        const room = data.rooms.find((r: any) => String(r.roomNumber) === String(roomNumber));
        if (room) {
          setMeterData({
            voltage: room.voltage || 220,
            current: room.current || 0,
            activePowerWatt: room.activePowerWatt || 0,
            currentMeterKwh: room.currentMeterKwh || 0,
            monthlyUnitsKwh: room.monthlyUnitsKwh || 0,
            relayState: room.relayState || 'ON',
            isHardwareConnected: Boolean(room.esp32Meta?.isHardwareConnected),
            espStatus: room.esp32Meta?.espStatus || 'OFFLINE',
          });
        }
      }
    } catch (e) {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeter();
    const timer = setInterval(fetchMeter, 5000);
    return () => clearInterval(timer);
  }, [roomNumber]);

  const estimatedCost = meterData ? (meterData.monthlyUnitsKwh * 4.88).toFixed(2) : '0.00';

  return (
    <div className="bg-card rounded-3xl border border-border p-6 sm:p-8 shadow-xl relative overflow-hidden transition-all hover:border-cyan-500/40">
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/5 rounded-full -mr-24 -mt-24 blur-2xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center text-2xl font-black shrink-0">
            ⚡
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base sm:text-lg font-black text-foreground">มิเตอร์ไฟฟ้าอัจฉริยะ (Smart Meter)</h3>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                meterData?.isHardwareConnected || meterData?.espStatus === 'ONLINE'
                  ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                  : 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30'
              }`}>
                <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
                {meterData?.isHardwareConnected ? 'ESP32 Real IoT' : 'Smart IoT Node'}
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              ติดตามการใช้พลังงานไฟฟ้าแบบเรียลไทม์ห้อง {roomNumber} • อัตรา ฿4.88 / หน่วย
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right">
            <span className="text-[10px] font-bold text-muted-foreground uppercase block">สถานะไฟห้องพัก</span>
            <span className={`text-xs font-black ${meterData?.relayState === 'OFF' ? 'text-rose-500' : 'text-emerald-500'}`}>
              {meterData?.relayState === 'OFF' ? '🔴 สั่งตัดไฟ (Relay OFF)' : '🟢 จ่ายไฟปกติ (Relay ON)'}
            </span>
          </div>
        </div>
      </div>

      {/* Real-time Electrical Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-secondary/40 border border-border p-4 rounded-2xl text-center">
          <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
            กำลังไฟฟ้าขณะนี้
          </span>
          <span className="text-2xl font-black text-foreground font-mono">
            {meterData?.activePowerWatt ?? 0}
          </span>
          <span className="text-xs font-bold text-muted-foreground ml-1">W</span>
        </div>

        <div className="bg-secondary/40 border border-border p-4 rounded-2xl text-center">
          <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
            แรงดันไฟฟ้า (V)
          </span>
          <span className="text-2xl font-black text-foreground font-mono">
            {meterData ? meterData.voltage.toFixed(1) : '228.0'}
          </span>
          <span className="text-xs font-bold text-muted-foreground ml-1">V</span>
        </div>

        <div className="bg-secondary/40 border border-border p-4 rounded-2xl text-center">
          <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
            หน่วยสะสมเดือนนี้
          </span>
          <span className="text-2xl font-black text-cyan-600 dark:text-cyan-400 font-mono">
            {meterData ? meterData.monthlyUnitsKwh.toFixed(1) : '0.0'}
          </span>
          <span className="text-xs font-bold text-muted-foreground ml-1">kWh</span>
        </div>

        <div className="bg-secondary/40 border border-border p-4 rounded-2xl text-center">
          <span className="block text-[10px] font-black uppercase tracking-wider text-muted-foreground mb-1">
            ประมาณการค่าไฟ
          </span>
          <span className="text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono">
            ฿{estimatedCost}
          </span>
          <span className="text-xs font-bold text-muted-foreground ml-1">บาท</span>
        </div>
      </div>
    </div>
  );
}
