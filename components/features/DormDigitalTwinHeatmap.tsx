'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { DynamicBillQrPaymentButton } from '@/components/features/DynamicBillQrModal';
import { subscribeDeviceToWebPush } from '@/lib/features/web-push-client';
import type {
  DigitalTwinRoom,
  ResearcherPushLogItem,
  OccupancyStatus,
  BillingStatus,
  MaintenanceStatus,
} from '@/app/api/features/digital-twin/route';

type HeatmapLayer = 'OCCUPANCY' | 'ELECTRIC' | 'BILLING' | 'MAINTENANCE';
type FloorFilter = 'ALL' | 1 | 2;

export function DormDigitalTwinHeatmap() {
  const [rooms, setRooms] = useState<DigitalTwinRoom[]>([]);
  const [pushLogs, setPushLogs] = useState<ResearcherPushLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const [activeLayer, setActiveLayer] = useState<HeatmapLayer>('ELECTRIC');
  const [floorFilter, setFloorFilter] = useState<FloorFilter>('ALL');
  const [selectedRoomNo, setSelectedRoomNo] = useState<string>('104');

  // Web Push Notification states (Isolated to Researcher Lab)
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>('default');
  const [swReady, setSwReady] = useState<boolean>(false);
  const [autoAlertAnomaly, setAutoAlertAnomaly] = useState<boolean>(true);
  const [liveToast, setLiveToast] = useState<{ title: string; body: string; category: string } | null>(null);

  const fetchTwinData = useCallback(async () => {
    try {
      const res = await fetch('/api/features/digital-twin');
      const json = await res.json();
      if (json.success) {
        setRooms(json.rooms || []);
        setPushLogs(json.pushLogs || []);
      }
    } catch {
      // ignore network error
    } finally {
      setLoading(false);
    }
  }, []);

  // Register Service Worker & Check Notification Permission
  useEffect(() => {
    fetchTwinData();
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushPermission(Notification.permission);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker
          .register('/sw.js')
          .then(() => {
            setSwReady(true);
            if (Notification.permission === 'granted') {
              subscribeDeviceToWebPush({ role: 'researcher' }).catch(() => {});
            }
          })
          .catch(() => setSwReady(false));
      }
    } else {
      setPushPermission('unsupported');
    }

    const timer = setInterval(fetchTwinData, 6000);
    return () => clearInterval(timer);
  }, [fetchTwinData]);

  // Helper: Trigger real Browser / OS Web Push Notification + Researcher Lab Log
  const triggerResearcherWebPush = useCallback(
    async (params: {
      category: ResearcherPushLogItem['category'];
      roomNumber: string;
      title: string;
      body: string;
      url?: string;
    }) => {
      // 1. Show in-page Toast immediately
      setLiveToast({
        title: params.title,
        body: params.body,
        category: params.category,
      });
      setTimeout(() => {
        setLiveToast((prev) => (prev?.title === params.title ? null : prev));
      }, 6000);

      // 2. Request permission if still default
      let currentPerm =
        typeof window !== 'undefined' && 'Notification' in window
          ? Notification.permission
          : 'unsupported';

      if (currentPerm === 'default' && typeof window !== 'undefined' && 'Notification' in window) {
        try {
          currentPerm = await Notification.requestPermission();
          setPushPermission(currentPerm);
        } catch {
          // ignore
        }
      }

      // 3. Fire Native Browser / Mobile OS Notification via Service Worker Registration
      if (currentPerm === 'granted' && typeof window !== 'undefined') {
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.getRegistration('/sw.js');
            if (reg) {
              await reg.showNotification(params.title, {
                body: params.body,
                icon: '/favicon.ico',
                badge: '/favicon.ico',
                tag: `researcher-${params.roomNumber}-${Date.now()}`,
                data: { url: params.url || `/researcher/lab/digital-twin?room=${params.roomNumber}` },
              } as NotificationOptions);
            } else {
              new Notification(params.title, {
                body: params.body,
                icon: '/favicon.ico',
              });
            }
          } else {
            new Notification(params.title, {
              body: params.body,
              icon: '/favicon.ico',
            });
          }
        } catch {
          // fallback if browser blocks
        }
      }

      // 4. Save to Researcher Sandbox Push Log
      try {
        const res = await fetch('/api/features/digital-twin', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'log_push',
            category: params.category,
            roomNumber: params.roomNumber,
            title: params.title,
            body: params.body,
            url: params.url || `/researcher/lab/digital-twin?room=${params.roomNumber}`,
          }),
        });
        const json = await res.json();
        if (json.success && json.pushLogs) {
          setPushLogs(json.pushLogs);
        }
      } catch {
        // ignore
      }
    },
    []
  );

  const requestBrowserPushPermission = async () => {
    const res = await subscribeDeviceToWebPush({ role: 'researcher' });
    setPushPermission(res.permission);
    if (res.success) {
      setSwReady(true);
      setLiveToast({
        title: `✅ ลงทะเบียนแจ้งเตือนนอกแอปสำเร็จ (รวม ${res.subscriberCount || 1} เครื่อง)`,
        body: 'นี้คือการทดสอบการแจ้งเดือน (พร้อมแจ้งเตือนนอกแอปบน iOS / Android แล้ว)',
        category: 'SYSTEM_SCAN',
      });
    } else {
      setLiveToast({
        title: '📲 คำแนะนำการเปิดแจ้งเตือนนอกแอปสำหรับ iOS / Mobile',
        body: res.message,
        category: 'SYSTEM_SCAN',
      });
    }
  };

  // Send Mobile Permission Request to ALL Roles + Trigger Mobile Permission Dialog
  const requestMobilePushAcrossRoles = async () => {
    const reqTitle = '📲 คำขอเปิดการแจ้งเตือนสำหรับ Mobile';
    const reqBody = 'กดอนุญาตเปิดการแจ้งเตือนสำหรับ mobile เพื่อรับแจ้งเตือนจากระบบหอพักเกษร 2';

    try {
      const res = await fetch('/api/features/digital-twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'broadcast_all_roles',
          title: reqTitle,
          message: reqBody,
        }),
      });
      const json = await res.json();
      if (json.success && json.pushLogs) {
        setPushLogs(json.pushLogs);
      }

      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('smartdorm_web_push');
          bc.postMessage({
            type: 'REQUEST_MOBILE_PERMISSION',
            title: reqTitle,
            message: reqBody,
          });
          bc.close();
        } catch {
          // ignore
        }
      }

      // Also request permission directly on the current device
      await requestBrowserPushPermission();

      setLiveToast({
        title: '📲 ส่งคำขอเปิดการแจ้งเตือนสำหรับ Mobile ไปยังทุกบทบาทแล้ว',
        body: 'หน้าจอมือถือของทุกบทบาทจะแสดงปุ่มกดอนุญาตเปิดรับการแจ้งเตือนทันที',
        category: 'SYSTEM_SCAN',
      });
    } catch {
      // ignore
    }
  };

  // Scan all 20 rooms for anomalies and send Web Push
  const scanBuildingAndPush = async () => {
    const highElecRooms = rooms.filter((r) => r.electricKwh >= 250);
    const overdueRooms = rooms.filter((r) => r.billingStatus === 'OVERDUE');
    const urgentMaintRooms = rooms.filter((r) => r.maintenanceStatus === 'URGENT');

    const title = `🚨 สแกนตึก 20 ห้อง: พบจุดผิดปกติ ${highElecRooms.length + overdueRooms.length + urgentMaintRooms.length} รายการ`;
    const body = `⚡ ไฟเกินเกณฑ์ ${highElecRooms.map((r) => r.roomNumber).join(', ') || '-'} | 💳 ค้างชำระ ${overdueRooms.map((r) => r.roomNumber).join(', ') || '-'} | 🔧 ซ่อมด่วน ${urgentMaintRooms.map((r) => r.roomNumber).join(', ') || '-'}`;

    await triggerResearcherWebPush({
      category: 'SYSTEM_SCAN',
      roomNumber: highElecRooms[0]?.roomNumber || '104',
      title,
      body,
    });
  };

  // Send Test Notification from Researcher to ALL Authenticated Member Roles ("นี้คือการทดสอบการแจ้งเดือน")
  const broadcastTestToAllRoles = async () => {
    const senderLabel = 'Researcher (ผู้วิจัยระบบ)';
    const recipientLabel = 'ทุกบทบาท (Owner เจ้าของหอ, Tenant ผู้เช่า, Keeper แม่บ้าน/ช่าง, Researcher)';
    const testMessage = 'นี้คือการทดสอบการแจ้งเดือน';
    const testTitle = `🔔 จาก: ${senderLabel} ➔ ถึง: ${recipientLabel}`;

    try {
      const res = await fetch('/api/features/digital-twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'broadcast_all_roles',
          senderLabel,
          title: testTitle,
          message: testMessage,
        }),
      });
      const json = await res.json();
      if (json.success && json.pushLogs) {
        setPushLogs(json.pushLogs);
      }

      // Broadcast to any open tabs of Owner / Tenant / Keeper / Researcher immediately
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        try {
          const bc = new BroadcastChannel('smartdorm_web_push');
          bc.postMessage({
            type: 'BROADCAST_ALL_ROLES',
            title: testTitle,
            message: `${testMessage} (จาก: ${senderLabel} ➔ ถึง: ${recipientLabel})`,
          });
          bc.close();
        } catch {
          // ignore
        }
      }

      await triggerResearcherWebPush({
        category: 'SYSTEM_SCAN',
        roomNumber: 'ALL',
        title: `🔔 จาก: ${senderLabel} ➔ ถึง: ทุกบทบาท (${json.notifiedCount || 'ครบทุก'} บัญชี)`,
        body: `${testMessage} [ผู้รับ: Owner, Tenant, Keeper, Researcher]`,
      });
    } catch {
      // ignore
    }
  };

  // Update room state in Researcher Sandbox
  const updateRoomState = async (
    roomNumber: string,
    patch: Partial<{
      occupancyStatus: OccupancyStatus;
      billingStatus: BillingStatus;
      electricKwh: number;
      maintenanceStatus: MaintenanceStatus;
      maintenanceIssue: string | null;
    }>,
    pushAlert?: {
      category: ResearcherPushLogItem['category'];
      title: string;
      body: string;
    }
  ) => {
    try {
      const res = await fetch('/api/features/digital-twin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_room',
          roomNumber,
          ...patch,
        }),
      });
      const json = await res.json();
      if (json.success && json.room) {
        setRooms((prev) => prev.map((r) => (r.roomNumber === roomNumber ? json.room : r)));
        if (pushAlert && autoAlertAnomaly) {
          await triggerResearcherWebPush({
            category: pushAlert.category,
            roomNumber,
            title: pushAlert.title,
            body: pushAlert.body,
          });
        }
      }
    } catch {
      // ignore
    }
  };

  const resetAllRooms = async () => {
    const res = await fetch('/api/features/digital-twin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset_seed' }),
    });
    const json = await res.json();
    if (json.success && json.rooms) {
      setRooms(json.rooms);
    }
  };

  const selectedRoom = rooms.find((r) => r.roomNumber === selectedRoomNo) || rooms[0] || null;

  // Compute color styling for each room based on active Heatmap Layer
  const getRoomVisuals = (room: DigitalTwinRoom) => {
    if (activeLayer === 'OCCUPANCY') {
      switch (room.occupancyStatus) {
        case 'AVAILABLE':
          return {
            bg: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50',
            badge: 'ว่างพร้อมเช่า',
            badgeColor: 'bg-emerald-500/30 text-emerald-200',
            metric: `฿${room.rentPrice.toLocaleString()}/ด.`,
            alert: false,
          };
        case 'OCCUPIED':
          return {
            bg: 'bg-sky-500/20 hover:bg-sky-500/30 border-sky-400/50',
            badge: 'มีผู้เช่า',
            badgeColor: 'bg-sky-500/30 text-sky-200',
            metric: room.tenantName?.split(' ')[0] || 'มีผู้เช่า',
            alert: false,
          };
        case 'RESERVED':
          return {
            bg: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/50',
            badge: 'จองแล้ว',
            badgeColor: 'bg-amber-500/30 text-amber-200',
            metric: 'รอเข้าพัก',
            alert: false,
          };
        case 'MAINTENANCE':
          return {
            bg: 'bg-rose-500/25 hover:bg-rose-500/35 border-rose-400/60',
            badge: 'ปิดซ่อม',
            badgeColor: 'bg-rose-500/30 text-rose-200',
            metric: 'งดรับผู้เช่า',
            alert: true,
          };
      }
    }

    if (activeLayer === 'ELECTRIC') {
      if (room.electricKwh >= 250) {
        return {
          bg: 'bg-rose-600/30 hover:bg-rose-600/40 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]',
          badge: 'ไฟสูงผิดปกติ!',
          badgeColor: 'bg-rose-500 text-white animate-pulse',
          metric: `${room.electricKwh} kWh`,
          alert: true,
        };
      }
      if (room.electricKwh >= 120) {
        return {
          bg: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/50',
          badge: 'ปานกลาง',
          badgeColor: 'bg-amber-500/30 text-amber-200',
          metric: `${room.electricKwh} kWh`,
          alert: false,
        };
      }
      return {
        bg: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50',
        badge: 'ประหยัด/ปกติ',
        badgeColor: 'bg-emerald-500/30 text-emerald-200',
        metric: `${room.electricKwh} kWh`,
        alert: false,
      };
    }

    if (activeLayer === 'BILLING') {
      switch (room.billingStatus) {
        case 'OVERDUE':
          return {
            bg: 'bg-rose-600/30 hover:bg-rose-600/40 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]',
            badge: `ค้าง ${room.overdueDays} วัน`,
            badgeColor: 'bg-rose-500 text-white animate-pulse',
            metric: `฿${room.billAmount.toLocaleString()}`,
            alert: true,
          };
        case 'PENDING':
          return {
            bg: 'bg-amber-500/20 hover:bg-amber-500/30 border-amber-400/50',
            badge: 'รอชำระ',
            badgeColor: 'bg-amber-500/30 text-amber-200',
            metric: `฿${room.billAmount.toLocaleString()}`,
            alert: false,
          };
        case 'PAID':
          return {
            bg: 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/50',
            badge: 'ชำระแล้ว',
            badgeColor: 'bg-emerald-500/30 text-emerald-200',
            metric: `฿${room.billAmount.toLocaleString()}`,
            alert: false,
          };
        default:
          return {
            bg: 'bg-slate-800/60 hover:bg-slate-800 border-slate-700',
            badge: 'ไม่มีบิล',
            badgeColor: 'bg-slate-700 text-slate-300',
            metric: 'ห้องว่าง',
            alert: false,
          };
      }
    }

    // MAINTENANCE LAYER
    switch (room.maintenanceStatus) {
      case 'URGENT':
        return {
          bg: 'bg-rose-600/30 hover:bg-rose-600/40 border-rose-400 shadow-[0_0_20px_rgba(244,63,94,0.35)]',
          badge: 'ซ่อมด่วน!',
          badgeColor: 'bg-rose-500 text-white animate-pulse',
          metric: 'ต้องแก้ไขทันที',
          alert: true,
        };
      case 'IN_PROGRESS':
        return {
          bg: 'bg-amber-500/25 hover:bg-amber-500/35 border-amber-400/60',
          badge: 'กำลังซ่อม',
          badgeColor: 'bg-amber-500/30 text-amber-200',
          metric: 'ช่างกำลังดูแล',
          alert: false,
        };
      default:
        return {
          bg: 'bg-emerald-500/15 hover:bg-emerald-500/25 border-emerald-500/40',
          badge: 'ปกติ',
          badgeColor: 'bg-emerald-500/20 text-emerald-300',
          metric: 'พร้อมใช้งาน',
          alert: false,
        };
    }
  };

  const renderFloorPlan = (floorNum: 1 | 2) => {
    const floorRooms = rooms.filter((r) => r.floor === floorNum);
    const northWing = floorRooms
      .filter((r) => r.wing === 'NORTH')
      .sort((a, b) => a.positionIndex - b.positionIndex);
    const southWing = floorRooms
      .filter((r) => r.wing === 'SOUTH')
      .sort((a, b) => a.positionIndex - b.positionIndex);

    return (
      <div
        key={floorNum}
        className="rounded-3xl bg-slate-950/90 border border-white/10 p-5 space-y-4 shadow-xl"
      >
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2.5">
            <span className="px-3 py-1 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-xs font-black">
              ชั้นที่ {floorNum} (FLOOR {floorNum})
            </span>
            <span className="text-xs font-bold text-slate-300">
              ห้อง {floorNum}01 – {floorNum}10 (จำนวน 10 ห้อง)
            </span>
          </div>
          <span className="text-[11px] text-slate-400">
            ทิศเหนือ ({floorNum}01–{floorNum}05) • โถงทางเดินกลาง • ทิศใต้ ({floorNum}06–{floorNum}10)
          </span>
        </div>

        {/* ฝั่งทิศเหนือ (5 ห้อง) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {northWing.map((room) => {
            const vis = getRoomVisuals(room);
            const isSelected = selectedRoom?.roomNumber === room.roomNumber;
            return (
              <button
                key={room.roomNumber}
                type="button"
                onClick={() => setSelectedRoomNo(room.roomNumber)}
                className={`relative text-left p-3 rounded-2xl border transition-all ${vis.bg} ${
                  isSelected ? 'ring-2 ring-cyan-400 scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-base font-black text-white font-mono">
                    {room.roomNumber}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${vis.badgeColor}`}>
                    {vis.badge}
                  </span>
                </div>
                <div className="mt-2 text-xs font-black text-white truncate">{vis.metric}</div>
                <div className="mt-0.5 text-[10px] text-slate-300 truncate">
                  {room.tenantName || 'ห้องว่าง'}
                </div>
              </button>
            );
          })}
        </div>

        {/* โถงทางเดินกลาง (Central Corridor + Stairs + MDB) */}
        <div className="rounded-xl bg-slate-900/90 border border-dashed border-slate-700 px-4 py-2 flex items-center justify-between text-[11px] text-slate-400 font-bold">
          <span>🪜 บันไดฝั่งซ้าย</span>
          <span className="text-cyan-400/90 tracking-wider uppercase">
            ═══ โถงทางเดินกลาง ชั้น {floorNum} • 📡 Wi-Fi AP • 🎥 CCTV ═══
          </span>
          <span>⚡ ตู้ไฟ MDB-{floorNum}</span>
        </div>

        {/* ฝั่งทิศใต้ (5 ห้อง) */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {southWing.map((room) => {
            const vis = getRoomVisuals(room);
            const isSelected = selectedRoom?.roomNumber === room.roomNumber;
            return (
              <button
                key={room.roomNumber}
                type="button"
                onClick={() => setSelectedRoomNo(room.roomNumber)}
                className={`relative text-left p-3 rounded-2xl border transition-all ${vis.bg} ${
                  isSelected ? 'ring-2 ring-cyan-400 scale-[1.02]' : ''
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span className="text-base font-black text-white font-mono">
                    {room.roomNumber}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-black ${vis.badgeColor}`}>
                    {vis.badge}
                  </span>
                </div>
                <div className="mt-2 text-xs font-black text-white truncate">{vis.metric}</div>
                <div className="mt-0.5 text-[10px] text-slate-300 truncate">
                  {room.tenantName || 'ห้องว่าง'}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const occupiedCount = rooms.filter((r) => r.occupancyStatus === 'OCCUPIED').length;
  const anomalyCount = rooms.filter((r) => r.electricKwh >= 250).length;
  const overdueCount = rooms.filter((r) => r.billingStatus === 'OVERDUE').length;
  const urgentMaintCount = rooms.filter((r) => r.maintenanceStatus === 'URGENT').length;

  return (
    <div className="space-y-6">
      {/* Live Web Push Toast Banner */}
      {liveToast && (
        <div className="rounded-2xl bg-gradient-to-r from-cyan-950 via-slate-900 to-indigo-950 border border-cyan-400/60 p-4 shadow-2xl flex items-center justify-between gap-4 animate-pulse">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🔔</span>
            <div>
              <div className="text-xs font-black text-cyan-300 uppercase tracking-wider">
                RESEARCHER WEB PUSH NOTIFICATION SENT
              </div>
              <div className="text-sm font-black text-white">{liveToast.title}</div>
              <div className="text-xs text-slate-300">{liveToast.body}</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="px-3 py-1 rounded-lg bg-white/10 text-xs font-bold text-slate-300 hover:text-white"
          >
            ปิด
          </button>
        </div>
      )}

      {/* Top KPI Summary Bar (20 Rooms, 2 Floors) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-2xl bg-slate-900/80 border border-white/10 p-4">
          <span className="text-[11px] font-bold text-slate-400">จำนวนห้องพักทั้งหมด (2 ชั้น)</span>
          <div className="text-2xl font-black text-white mt-0.5">
            20 ห้อง <span className="text-xs font-bold text-emerald-400">({occupiedCount} มีผู้เช่า)</span>
          </div>
        </div>
        <div className="rounded-2xl bg-slate-900/80 border border-rose-500/30 p-4">
          <span className="text-[11px] font-bold text-rose-300">⚡ ค่าไฟสูงผิดปกติ (≥ 250 kWh)</span>
          <div className="text-2xl font-black text-rose-400 mt-0.5">{anomalyCount} ห้อง</div>
        </div>
        <div className="rounded-2xl bg-slate-900/80 border border-amber-500/30 p-4">
          <span className="text-[11px] font-bold text-amber-300">💳 บิลค้างชำระเกินกำหนด</span>
          <div className="text-2xl font-black text-amber-400 mt-0.5">{overdueCount} ห้อง</div>
        </div>
        <div className="rounded-2xl bg-slate-900/80 border border-cyan-500/30 p-4">
          <span className="text-[11px] font-bold text-cyan-300">🔧 แจ้งซ่อมด่วน</span>
          <div className="text-2xl font-black text-cyan-400 mt-0.5">{urgentMaintCount} ห้อง</div>
        </div>
      </div>

      {/* Main Grid: Left = 2D Building Heatmap (2 Floors x 10 Rooms), Right = Unified Control Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 8 Columns: Interactive 2D Digital Twin */}
        <div className="lg:col-span-8 space-y-4">
          {/* Layer & Floor Toolbar */}
          <div className="rounded-3xl bg-slate-900/80 border border-white/10 p-4 flex flex-wrap items-center justify-between gap-3">
            {/* 4 Heatmap Layers */}
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ELECTRIC', label: '⚡ พลังงานไฟฟ้า (kWh)' },
                  { id: 'BILLING', label: '💳 สถานะบิล' },
                  { id: 'OCCUPANCY', label: '🏠 สถานะห้องพัก' },
                  { id: 'MAINTENANCE', label: '🔧 แจ้งซ่อม' },
                ] as { id: HeatmapLayer; label: string }[]
              ).map((layer) => (
                <button
                  key={layer.id}
                  type="button"
                  onClick={() => setActiveLayer(layer.id)}
                  className={`px-3 py-2 rounded-xl text-xs font-black transition-all ${
                    activeLayer === layer.id
                      ? 'bg-cyan-500 text-slate-950 shadow-lg'
                      : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                  }`}
                >
                  {layer.label}
                </button>
              ))}
            </div>

            {/* Floor Switcher */}
            <div className="flex items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'ทั้ง 2 ชั้น (20 ห้อง)' },
                  { id: 1, label: 'ชั้น 1 (10 ห้อง)' },
                  { id: 2, label: 'ชั้น 2 (10 ห้อง)' },
                ] as { id: FloorFilter; label: string }[]
              ).map((fl) => (
                <button
                  key={String(fl.id)}
                  type="button"
                  onClick={() => setFloorFilter(fl.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                    floorFilter === fl.id
                      ? 'bg-indigo-500/30 border-indigo-400 text-white'
                      : 'bg-slate-950 border-white/10 text-slate-400 hover:text-white'
                  }`}
                >
                  {fl.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2D Floor Plan Render (Floor 2 on top, Floor 1 below like a real building elevation, or filtered) */}
          {loading ? (
            <div className="rounded-3xl bg-slate-900/70 border border-white/10 p-12 text-center text-sm text-slate-400">
              กำลังโหลดแผนผัง Digital Twin 20 ห้อง...
            </div>
          ) : (
            <div className="space-y-4">
              {(floorFilter === 'ALL' || floorFilter === 2) && renderFloorPlan(2)}
              {(floorFilter === 'ALL' || floorFilter === 1) && renderFloorPlan(1)}
            </div>
          )}
        </div>

        {/* Right 4 Columns: Single Unified Control Panel (Room Inspector + Researcher Web Push) */}
        <div className="lg:col-span-4 rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-5 space-y-5 shadow-2xl">
          {/* Section 1: Researcher Web Push Notification Center */}
          <div className="space-y-3 pb-4 border-b border-white/10">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
                  WEB PUSH NOTIFICATION (RESEARCHER LAB)
                </span>
                <h2 className="text-base font-black text-white">ระบบแจ้งเตือนอัจฉริยะ</h2>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-[10px] font-black border ${
                  pushPermission === 'granted'
                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                }`}
              >
                {pushPermission === 'granted'
                  ? `พร้อมแจ้งเตือน${swReady ? ' (SW)' : ''}`
                  : 'รอเปิดสิทธิ์แจ้งเตือน'}
              </span>
            </div>

            <button
              type="button"
              onClick={requestMobilePushAcrossRoles}
              className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all"
            >
              📲 ส่งคำขอเปิดการแจ้งเตือนสำหรับ Mobile (ทุกบทบาท)
            </button>

            <button
              type="button"
              onClick={scanBuildingAndPush}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 hover:from-rose-400 hover:to-amber-400 text-slate-950 font-black text-xs shadow-lg transition-all"
            >
              🚨 สแกนทั้ง 20 ห้อง & ยิงแจ้งเตือน Web Push ทันที
            </button>

            <button
              type="button"
              onClick={broadcastTestToAllRoles}
              className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-indigo-500 hover:from-cyan-400 hover:to-indigo-400 text-white font-black text-xs shadow-lg transition-all text-left space-y-0.5"
            >
              <div className="flex items-center justify-between">
                <span>📢 ทดสอบการแจ้งเตือน ("นี้คือการทดสอบการแจ้งเดือน")</span>
                <span className="px-1.5 py-0.5 rounded bg-black/30 text-[10px]">กดส่งทันที</span>
              </div>
              <div className="text-[10px] font-bold text-cyan-100">
                จาก: Researcher (ผู้วิจัย) ➔ ถึง: ทุกบทบาท (Owner, Tenant, Keeper, Researcher)
              </div>
            </button>

            <label className="flex items-center justify-between text-xs text-slate-300 cursor-pointer pt-1">
              <span>แจ้งเตือน Web Push อัตโนมัติเมื่อค่าไฟ/สถานะผิดปกติ</span>
              <input
                type="checkbox"
                checked={autoAlertAnomaly}
                onChange={(e) => setAutoAlertAnomaly(e.target.checked)}
                className="w-4 h-4 accent-cyan-400 rounded"
              />
            </label>
          </div>

          {/* Section 2: Selected Room Inspector & Live Controls */}
          {selectedRoom && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-300">
                    ห้องที่เลือกในผัง 2D (ชั้น {selectedRoom.floor})
                  </span>
                  <h3 className="text-xl font-black text-white">
                    ห้อง {selectedRoom.roomNumber} • {selectedRoom.roomType}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={resetAllRooms}
                  className="text-[11px] text-slate-400 hover:text-cyan-300 underline"
                >
                  รีเซ็ตค่าเริ่มต้น
                </button>
              </div>

              <div className="rounded-2xl bg-slate-950/90 border border-white/10 p-3.5 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">ผู้เช่า:</span>
                  <span className="font-bold text-white">
                    {selectedRoom.tenantName || 'ว่าง (ไม่มีผู้เช่า)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">หน่วยไฟฟ้าเดือนนี้:</span>
                  <span
                    className={`font-black ${
                      selectedRoom.electricKwh >= 250 ? 'text-rose-400' : 'text-emerald-400'
                    }`}
                  >
                    {selectedRoom.electricKwh} kWh{' '}
                    {selectedRoom.electricKwh >= 250 ? '(สูงผิดปกติ!)' : '(ปกติ)'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">ยอดบิล / สถานะ:</span>
                  <span className="font-black text-white">
                    ฿{selectedRoom.billAmount.toLocaleString()} ({selectedRoom.billingStatus})
                  </span>
                </div>
                {selectedRoom.maintenanceIssue && (
                  <div className="pt-1 border-t border-white/10 text-amber-300 font-bold">
                    🔧 {selectedRoom.maintenanceIssue}
                  </div>
                )}
              </div>

              {/* Quick Simulation & Push Actions for Selected Room */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-400 block">
                  จำลองเหตุการณ์และยิงแจ้งเตือน Web Push เฉพาะห้อง {selectedRoom.roomNumber}:
                </span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      updateRoomState(
                        selectedRoom.roomNumber,
                        { electricKwh: 325 },
                        {
                          category: 'ELECTRIC_ANOMALY',
                          title: `⚡ เตือนค่าไฟพุ่งผิดปกติ ห้อง ${selectedRoom.roomNumber} (325 kWh)`,
                          body: `ชั้น ${selectedRoom.floor} ห้อง ${selectedRoom.roomNumber} ใช้ไฟแตะ 325 kWh กรุณาตรวจสอบแอร์หรือไฟรั่ว`,
                        }
                      )
                    }
                    className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-black transition-all"
                  >
                    ⚡ จำลองไฟพีค + Push
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateRoomState(
                        selectedRoom.roomNumber,
                        { electricKwh: 95 },
                        {
                          category: 'SYSTEM_SCAN',
                          title: `✅ หน่วยไฟห้อง ${selectedRoom.roomNumber} กลับสู่เกณฑ์ปกติ (95 kWh)`,
                          body: `ชั้น ${selectedRoom.floor} ห้อง ${selectedRoom.roomNumber} ปรับลดการใช้ไฟลงสู่ระดับปกติแล้ว`,
                        }
                      )
                    }
                    className="p-2.5 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-black transition-all"
                  >
                    🌿 ปรับไฟปกติ (95 kWh)
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateRoomState(
                        selectedRoom.roomNumber,
                        { billingStatus: 'OVERDUE' },
                        {
                          category: 'OVERDUE_BILL',
                          title: `💳 แจ้งเตือนบิลค้างชำระ ห้อง ${selectedRoom.roomNumber}`,
                          body: `ยอดค้างชำระ ฿${(selectedRoom.billAmount || 3500).toLocaleString()} คลิกเพื่อสแกนจ่ายพร้อมเพย์`,
                        }
                      )
                    }
                    className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-black transition-all"
                  >
                    💳 เตือนค้างชำระ + Push
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      updateRoomState(
                        selectedRoom.roomNumber,
                        {
                          maintenanceStatus:
                            selectedRoom.maintenanceStatus === 'URGENT' ? 'NONE' : 'URGENT',
                          maintenanceIssue:
                            selectedRoom.maintenanceStatus === 'URGENT'
                              ? null
                              : 'แจ้งซ่อมด่วน: ท่อน้ำรั่ว / เบรกเกอร์ตัด',
                        },
                        {
                          category: 'URGENT_MAINTENANCE',
                          title:
                            selectedRoom.maintenanceStatus === 'URGENT'
                              ? `✅ ปิดงานซ่อมห้อง ${selectedRoom.roomNumber} เรียบร้อย`
                              : `🔧 แจ้งซ่อมด่วน! ห้อง ${selectedRoom.roomNumber} (ชั้น ${selectedRoom.floor})`,
                          body:
                            selectedRoom.maintenanceStatus === 'URGENT'
                              ? `ช่างดำเนินการซ่อมแซมห้อง ${selectedRoom.roomNumber} เสร็จสมบูรณ์`
                              : `พบเหตุแจ้งซ่อมด่วนในห้อง ${selectedRoom.roomNumber} กรุณาส่งช่างเข้าตรวจสอบ`,
                        }
                      )
                    }
                    className="p-2.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-black transition-all"
                  >
                    🔧 สลับสถานะซ่อม + Push
                  </button>
                </div>
              </div>

              {/* Direct Integration with Module 2: Pay Bill with Dynamic QR */}
              <div className="pt-2">
                <DynamicBillQrPaymentButton
                  billId={Number(selectedRoom.roomNumber)}
                  roomNumber={selectedRoom.roomNumber}
                  tenantName={selectedRoom.tenantName || `ผู้เช่าห้อง ${selectedRoom.roomNumber}`}
                  billTitle={`บิลค่าเช่าและน้ำไฟ ห้อง ${selectedRoom.roomNumber}`}
                  baseAmount={1.0}
                  onPaidSuccess={() => {
                    updateRoomState(
                      selectedRoom.roomNumber,
                      { billingStatus: 'PAID' },
                      {
                        category: 'PAYMENT_APPROVED',
                        title: `✅ ชำระบิลห้อง ${selectedRoom.roomNumber} สำเร็จ!`,
                        body: `ระบบอนุมัติยอดโอนเข้าพร้อมเพย์อัตโนมัติและปรับสถานะห้อง ${selectedRoom.roomNumber} เป็นชำระแล้ว`,
                      }
                    );
                  }}
                />
              </div>
            </div>
          )}

          {/* Section 3: Recent Researcher Web Push Log */}
          <div className="pt-3 border-t border-white/10 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
              ประวัติการส่ง Web Push ล่าสุด (เฉพาะ Researcher Lab)
            </span>
            <div className="space-y-1.5 max-h-44 overflow-y-auto pr-1">
              {pushLogs.slice(0, 5).map((item) => (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl bg-slate-950/80 border border-white/5 text-[11px]"
                >
                  <div className="font-black text-cyan-300">{item.title}</div>
                  <div className="text-slate-400 truncate">{item.body}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
