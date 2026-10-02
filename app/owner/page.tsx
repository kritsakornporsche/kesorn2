'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface DashboardStats {
  totalRooms: number;
  occupiedRooms: number;
  bookedRooms: number;
  availableRooms: number;
  totalTenants: number;
  pendingBookings: number;
  pendingSlips: number;
  pendingMaintenance: number;
  unpaidBillsCount: number;
  unpaidBillsAmount: number;
  paidBillsCount: number;
  paidBillsAmount: number;
  expiringContracts: number;
  occupancyRate: number;
  collectionRate: number;
  recentActivities: {
    type: string;
    title: string;
    time: string;
    badge: string;
  }[];
}

export default function OwnerDashboardPage() {
  const { data: session } = useSession();
  const router = useRouter();

  const [stats, setStats] = useState<DashboardStats>({
    totalRooms: 20,
    occupiedRooms: 18,
    bookedRooms: 1,
    availableRooms: 1,
    totalTenants: 18,
    pendingBookings: 0,
    pendingSlips: 0,
    pendingMaintenance: 0,
    unpaidBillsCount: 0,
    unpaidBillsAmount: 0,
    paidBillsCount: 0,
    paidBillsAmount: 0,
    expiringContracts: 0,
    occupancyRate: 90,
    collectionRate: 85,
    recentActivities: [],
  });

  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'bookings' | 'slips' | 'unpaid' | 'maintenance'>('bookings');
  const [mobileChip, setMobileChip] = useState<'all' | 'bookings' | 'slips' | 'maintenance'>('all');

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/stats');
      const data = await res.json();
      if (data.success) {
        setStats(data.data);
      }
    } catch (err) {
      console.error('Fetch owner stats error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100 overflow-y-auto lg:overflow-hidden select-none p-4 sm:p-6 lg:p-8">
      {/* 1. Header & Critical Action Required / To-Do Bar (วางไว้บนสุด) */}
      <div className="shrink-0 space-y-4 pb-4 border-b border-white/10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <span>หอพักเกษร 2</span>
              <span>•</span>
              <span>สวัสดี, {session?.user?.name || 'คุณเจ้าของหอ'} 👋</span>
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-0.5">ภาพรวมการบริหารหอพัก (Command Center)</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>
        </div>

        {/* 🔔 ส่วนที่ 1: แถบงานเร่งด่วนประจำวัน (Action Required / To-Do Bar) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Link
            href="/owner/bookings"
            className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-2xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔔</span>
              <div>
                <p className="text-[11px] font-black text-amber-400">จองใหม่รอทำสัญญา</p>
                <p className="text-[10px] text-slate-400">มัดจำ 1,000 บาท</p>
              </div>
            </div>
            <span className="w-7 h-7 rounded-full bg-amber-500 text-white font-black text-xs flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              {stats.pendingBookings}
            </span>
          </Link>

          <Link
            href="/owner/billing"
            className="p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-2xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">💸</span>
              <div>
                <p className="text-[11px] font-black text-blue-400">สลิปรอตรวจสอบ</p>
                <p className="text-[10px] text-slate-400">ค่าเช่ารอบเดือน</p>
              </div>
            </div>
            <span className="w-7 h-7 rounded-full bg-blue-500 text-white font-black text-xs flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              {stats.pendingSlips}
            </span>
          </Link>

          <Link
            href="/owner/maintenance"
            className="p-3 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded-2xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">🔧</span>
              <div>
                <p className="text-[11px] font-black text-rose-400">แจ้งซ่อมรอดำเนินการ</p>
                <p className="text-[10px] text-slate-400">งานช่าง / แม่บ้าน</p>
              </div>
            </div>
            <span className="w-7 h-7 rounded-full bg-rose-500 text-white font-black text-xs flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              {stats.pendingMaintenance}
            </span>
          </Link>

          <Link
            href="/owner/contracts"
            className="p-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-2xl flex items-center justify-between transition-all group"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-xl">⏳</span>
              <div>
                <p className="text-[11px] font-black text-purple-400">สัญญาใกล้หมดอายุ</p>
                <p className="text-[10px] text-slate-400">ภายใน 30 วัน</p>
              </div>
            </div>
            <span className="w-7 h-7 rounded-full bg-purple-500 text-white font-black text-xs flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform">
              {stats.expiringContracts}
            </span>
          </Link>
        </div>
      </div>

      {/* Mobile Sticky Action Chips (สำหรับมือถือ) */}
      <div className="lg:hidden flex items-center gap-2 py-3 overflow-x-auto scrollbar-none shrink-0">
        <button
          onClick={() => setMobileChip('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'all' ? 'bg-primary text-white' : 'bg-slate-900 border border-white/10 text-slate-400'
          }`}
        >
          ทั้งหมด
        </button>
        <button
          onClick={() => setMobileChip('bookings')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'bookings' ? 'bg-amber-500 text-white' : 'bg-slate-900 border border-white/10 text-slate-400'
          }`}
        >
          🔔 จองห้อง ({stats.pendingBookings})
        </button>
        <button
          onClick={() => setMobileChip('slips')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'slips' ? 'bg-blue-500 text-white' : 'bg-slate-900 border border-white/10 text-slate-400'
          }`}
        >
          💸 ตรวจสลิป ({stats.pendingSlips})
        </button>
        <button
          onClick={() => setMobileChip('maintenance')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'maintenance' ? 'bg-rose-500 text-white' : 'bg-slate-900 border border-white/10 text-slate-400'
          }`}
        >
          🔧 แจ้งซ่อม ({stats.pendingMaintenance})
        </button>
      </div>

      {/* 2. Desktop 3-Column Layout (100vh One-Screen Fit) */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-5 pt-4 min-h-0">
        {/* คอลัมน์ซ้าย (25% - Col 3): สรุปสถานะหลัก KPI */}
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* 🟢 ส่วนที่ 2: สรุปสถานะห้องพัก */}
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">สถานะห้องพัก</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-black">
                {stats.occupancyRate}% เต็ม
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">ห้องพักทั้งหมด:</span>
                <span className="font-bold text-white font-mono">{stats.totalRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400"></span> พักอยู่แล้ว:
                </span>
                <span className="font-bold text-emerald-400 font-mono">{stats.occupiedRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-400"></span> ติดจอง/ทำสัญญา:
                </span>
                <span className="font-bold text-amber-400 font-mono">{stats.bookedRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-blue-400 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400"></span> ห้องว่างพร้อมอยู่:
                </span>
                <span className="font-bold text-blue-400 font-mono">{stats.availableRooms} ห้อง</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden flex">
              <div style={{ width: `${(stats.occupiedRooms / stats.totalRooms) * 100}%` }} className="bg-emerald-500 h-full" />
              <div style={{ width: `${(stats.bookedRooms / stats.totalRooms) * 100}%` }} className="bg-amber-500 h-full" />
            </div>
          </div>

          {/* สรุปการเงินรอบเดือน */}
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">การเก็บเงินรอบเดือน</span>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-[10px] font-black">
                {stats.collectionRate}%
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">ชำระแล้ว:</span>
                <span className="font-bold text-emerald-400 font-mono">฿{stats.paidBillsAmount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-400">ค้างชำระ:</span>
                <span className="font-bold text-rose-400 font-mono">฿{stats.unpaidBillsAmount.toLocaleString()} ({stats.unpaidBillsCount} ห้อง)</span>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์กลาง (50% - Col 6): Workstream & Action Workspace (Internal Scroll) */}
        <div className="lg:col-span-6 bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-xl flex flex-col min-h-[350px]">
          {/* Tab Capsules */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-950 rounded-xl border border-white/5 shrink-0 mb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'bookings' ? 'bg-amber-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🔔</span>
              <span>จองใหม่ ({stats.pendingBookings})</span>
            </button>

            <button
              onClick={() => setActiveTab('slips')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'slips' ? 'bg-blue-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>💸</span>
              <span>สลิปรอตรวจ ({stats.pendingSlips})</span>
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'maintenance' ? 'bg-rose-500 text-white shadow-md' : 'text-slate-400 hover:text-white'
              }`}
            >
              <span>🔧</span>
              <span>งานซ่อม ({stats.pendingMaintenance})</span>
            </button>
          </div>

          {/* Action List with Internal Scroll */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-white/10">
            {activeTab === 'bookings' && (
              <div className="space-y-2.5">
                {stats.pendingBookings === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-950/40 rounded-xl border border-white/5">
                    ✨ ไม่มีรายการจองที่รอทำสัญญาในขณะนี้
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-amber-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">🚪</span>
                      <div>
                        <p className="text-xs font-black text-white">มีรายการจองใหม่รอทำสัญญา ({stats.pendingBookings} รายการ)</p>
                        <p className="text-[10px] text-slate-400">ตรวจสอบสลิปมัดจำ 1,000 บาท และอัปโหลดสัญญา</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/bookings"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white text-xs font-black rounded-lg shadow-md transition-all shrink-0"
                    >
                      จัดการ ➔
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'slips' && (
              <div className="space-y-2.5">
                {stats.pendingSlips === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-950/40 rounded-xl border border-white/5">
                    ✨ ตรวจสอบสลิปค่าเช่าครบถ้วนแล้ว ไม่มีสลิปตกค้าง
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-blue-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center text-lg">🧾</span>
                      <div>
                        <p className="text-xs font-black text-white">มีสลิปค่าเช่ารอตรวจสอบ ({stats.pendingSlips} ใบ)</p>
                        <p className="text-[10px] text-slate-400">ตรวจสอบและอนุมัติผ่านระบบ SlipOK</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/billing"
                      className="px-4 py-2 bg-blue-500 hover:bg-blue-400 text-white text-xs font-black rounded-lg shadow-md transition-all shrink-0"
                    >
                      ตรวจสลิป ➔
                    </Link>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'maintenance' && (
              <div className="space-y-2.5">
                {stats.pendingMaintenance === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-950/40 rounded-xl border border-white/5">
                    ✨ ไม่มีรายการแจ้งซ่อมที่ค้างอยู่
                  </div>
                ) : (
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-rose-500/20 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-rose-500/20 text-rose-400 flex items-center justify-center text-lg">🛠️</span>
                      <div>
                        <p className="text-xs font-black text-white">งานแจ้งซ่อม/แม่บ้าน ({stats.pendingMaintenance} รายการ)</p>
                        <p className="text-[10px] text-slate-400">มอบหมายช่างหรือติดตามการปิดงาน</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/maintenance"
                      className="px-4 py-2 bg-rose-500 hover:bg-rose-400 text-white text-xs font-black rounded-lg shadow-md transition-all shrink-0"
                    >
                      ดูงานซ่อม ➔
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* คอลัมน์ขวา (25% - Col 3): Quick Actions & Real-Time Feed */}
        <div className="lg:col-span-3 flex flex-col gap-4 overflow-y-auto pr-1">
          {/* ⚡ ส่วนที่ 3: ทางลัดงานประจำ (Quick Actions) */}
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-xl space-y-3 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400">ทางลัดด่วน (Quick Actions)</span>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/owner/meters"
                className="p-3 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded-xl text-center transition-all group"
              >
                <span className="text-xl block mb-1">⚡</span>
                <span className="text-[11px] font-black text-amber-400 block">จดมิเตอร์ด่วน</span>
              </Link>

              <Link
                href="/owner/billing"
                className="p-3 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded-xl text-center transition-all group"
              >
                <span className="text-xl block mb-1">💰</span>
                <span className="text-[11px] font-black text-emerald-400 block">ออกบิลรอบเดือน</span>
              </Link>

              <Link
                href="/owner/bookings"
                className="p-3 bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 rounded-xl text-center transition-all group"
              >
                <span className="text-xl block mb-1">🔔</span>
                <span className="text-[11px] font-black text-blue-400 block">ตรวจการจอง</span>
              </Link>

              <Link
                href="/owner/chat"
                className="p-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 rounded-xl text-center transition-all group"
              >
                <span className="text-xl block mb-1">📢</span>
                <span className="text-[11px] font-black text-purple-400 block">ประกาศหอพัก</span>
              </Link>
            </div>
          </div>

          {/* 🕒 ส่วนที่ 4: ฟีดความเคลื่อนไหวล่าสุด (Recent Activity Feed) */}
          <div className="bg-slate-900/80 border border-white/10 rounded-2xl p-5 shadow-xl flex-1 flex flex-col min-h-[220px]">
            <span className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3">ความเคลื่อนไหวล่าสุด</span>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-white/10">
              {stats.recentActivities.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-[11px]">ไม่มีกิจกรรมล่าสุด</div>
              ) : (
                stats.recentActivities.map((act, i) => (
                  <div key={i} className="p-2.5 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-slate-300">{act.badge}</span>
                      <span className="text-slate-400">{act.time ? new Date(act.time).toLocaleDateString('th-TH') : 'วันนี้'}</span>
                    </div>
                    <p className="text-xs text-white font-medium line-clamp-2">{act.title}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
