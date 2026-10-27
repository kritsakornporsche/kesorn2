'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { formatBaht } from '@/lib/format';
import { getRecentFeatures, recordRecentFeature, type OwnerFeature } from '@/lib/recent-features';

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
  paidBillsAmount: number | null;
  expiringContracts: number;
  overdueBills?: { id: number; title: string; room_number: string; tenant_name: string; days_overdue: number; outstanding: number }[];
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
  // Standard booking fee from the server (lib/billing bookingFeeFor via /api/rates)
  const [bookingFee, setBookingFee] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/rates')
      .then((res) => res.json())
      .then((data) => { if (data.success && typeof data.bookingFee === 'number') setBookingFee(data.bookingFee); })
      .catch(() => {});
  }, []);
  const [activeTab, setActiveTab] = useState<'bookings' | 'slips' | 'unpaid' | 'maintenance'>('bookings');
  const [mobileChip, setMobileChip] = useState<'all' | 'bookings' | 'slips' | 'maintenance'>('all');
  const [recentFeatures, setRecentFeatures] = useState<OwnerFeature[]>([]);

  useEffect(() => {
    setRecentFeatures(getRecentFeatures(5));
    const handleUpdate = () => setRecentFeatures(getRecentFeatures(5));
    window.addEventListener('owner-recent-features-updated', handleUpdate);
    return () => window.removeEventListener('owner-recent-features-updated', handleUpdate);
  }, []);

  const getBadgeCount = (featId: string) => {
    if (featId === 'bookings') return stats.pendingBookings;
    if (featId === 'billing') return stats.pendingSlips;
    if (featId === 'maintenance') return stats.pendingMaintenance;
    if (featId === 'contracts') return stats.expiringContracts;
    return 0;
  };

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
    <div className="h-full flex flex-col bg-slate-50 text-slate-900 overflow-y-auto lg:overflow-hidden select-none p-4 sm:p-6 lg:p-8">
      {/* 1. Header & Critical Action Required / To-Do Bar */}
      <div className="shrink-0 space-y-4 pb-4 border-b border-slate-200">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-primary">
              <span>หอพักเกษร 2</span>
              <span>•</span>
              <span>สวัสดี, {session?.user?.name || 'คุณเจ้าของหอ'} 👋</span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-0.5">ภาพรวมการบริหารหอพัก (Command Center)</h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={fetchStats}
              className="px-3.5 py-2 rounded-xl bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold border border-slate-200 shadow-xs transition-all flex items-center gap-1.5"
            >
              <span>🔄</span>
              <span>รีเฟรชข้อมูล</span>
            </button>
          </div>
        </div>

        {/* Bills unpaid more than 15 days after the due date */}
        {(stats.overdueBills?.length ?? 0) > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl space-y-2.5 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-black text-rose-700">🚨 บิลค้างชำระเกิน 15 วัน ({stats.overdueBills!.length})</p>
              <Link href="/owner/billing" className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg shrink-0 shadow-xs">
                ไปหน้าบิล ➔
              </Link>
            </div>
            <div className="space-y-1.5">
              {stats.overdueBills!.map((b) => (
                <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 text-xs bg-white rounded-xl px-3 py-2 border border-slate-200 shadow-xs">
                  <span className="text-slate-900 font-bold">ห้อง {b.room_number || '-'} · {b.tenant_name}</span>
                  <span className="text-slate-500 truncate">{b.title}</span>
                  <span className="text-rose-700 font-black">ค้าง {b.days_overdue} วัน · ฿{formatBaht(b.outstanding)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ⚡ ส่วนที่ 1: ปุ่มของฟีเจอร์ที่ใช้ล่าสุด (Recently Used Features) */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 flex items-center gap-1.5">
                <span>⚡</span>
                <span>ฟีเจอร์ที่ใช้ล่าสุด</span>
              </span>
              <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                ทางลัดใช้งานบ่อย
              </span>
            </div>

            {/* Quick Action Alerts if any pending items exist */}
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none">
              {stats.pendingBookings > 0 && (
                <Link
                  href="/owner/bookings"
                  onClick={() => recordRecentFeature('bookings')}
                  className="px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-bold flex items-center gap-1 hover:bg-amber-100 transition-colors shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  <span>จองใหม่ {stats.pendingBookings}</span>
                </Link>
              )}
              {stats.pendingSlips > 0 && (
                <Link
                  href="/owner/billing"
                  onClick={() => recordRecentFeature('billing')}
                  className="px-2.5 py-0.5 rounded-full bg-blue-50 border border-blue-200 text-blue-800 text-[10px] font-bold flex items-center gap-1 hover:bg-blue-100 transition-colors shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                  <span>ตรวจสลิป {stats.pendingSlips}</span>
                </Link>
              )}
              {stats.pendingMaintenance > 0 && (
                <Link
                  href="/owner/maintenance"
                  onClick={() => recordRecentFeature('maintenance')}
                  className="px-2.5 py-0.5 rounded-full bg-rose-50 border border-rose-200 text-rose-800 text-[10px] font-bold flex items-center gap-1 hover:bg-rose-100 transition-colors shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                  <span>งานซ่อม {stats.pendingMaintenance}</span>
                </Link>
              )}
              {stats.expiringContracts > 0 && (
                <Link
                  href="/owner/contracts"
                  onClick={() => recordRecentFeature('contracts')}
                  className="px-2.5 py-0.5 rounded-full bg-purple-50 border border-purple-200 text-purple-800 text-[10px] font-bold flex items-center gap-1 hover:bg-purple-100 transition-colors shrink-0"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse" />
                  <span>สัญญาใกล้หมด {stats.expiringContracts}</span>
                </Link>
              )}
            </div>
          </div>

          {/* Recently Used Feature Buttons */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {recentFeatures.map((feat) => {
              const pendingCount = getBadgeCount(feat.id);
              return (
                <Link
                  key={feat.id}
                  href={feat.href}
                  onClick={() => recordRecentFeature(feat.id)}
                  className="p-3 bg-white hover:bg-slate-50 border border-slate-200 hover:border-primary/40 rounded-2xl flex items-center justify-between transition-all group shadow-xs hover:shadow-sm"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center text-lg group-hover:scale-110 transition-transform shrink-0">
                      {feat.icon}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-900 truncate group-hover:text-primary transition-colors">
                        {feat.name}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium truncate">
                        {feat.category}
                      </p>
                    </div>
                  </div>

                  {pendingCount > 0 ? (
                    <span className="min-w-[22px] h-[22px] px-1.5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center shadow-xs shrink-0 animate-pulse ml-2">
                      {pendingCount}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs font-bold group-hover:translate-x-0.5 group-hover:text-primary transition-all shrink-0 ml-1">
                      ➔
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* Mobile Sticky Action Chips (สำหรับมือถือ) */}
      <div className="lg:hidden flex items-center gap-2 py-3 overflow-x-auto scrollbar-none shrink-0">
        <button
          onClick={() => setMobileChip('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'all' ? 'bg-primary text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          ทั้งหมด
        </button>
        <button
          onClick={() => setMobileChip('bookings')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'bookings' ? 'bg-amber-500 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          🔔 จองห้อง ({stats.pendingBookings})
        </button>
        <button
          onClick={() => setMobileChip('slips')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'slips' ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          💸 ตรวจสลิป ({stats.pendingSlips})
        </button>
        <button
          onClick={() => setMobileChip('maintenance')}
          className={`px-3 py-1.5 rounded-full text-xs font-black whitespace-nowrap transition-all ${
            mobileChip === 'maintenance' ? 'bg-rose-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">สถานะห้องพัก</span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[10px] font-black">
                {stats.occupancyRate}% เต็ม
              </span>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">ห้องพักทั้งหมด:</span>
                <span className="font-bold text-slate-900 font-mono">{stats.totalRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-emerald-700 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span> พักอยู่แล้ว:
                </span>
                <span className="font-bold text-emerald-700 font-mono">{stats.occupiedRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-amber-800 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span> ติดจอง/ทำสัญญา:
                </span>
                <span className="font-bold text-amber-800 font-mono">{stats.bookedRooms} ห้อง</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-blue-700 font-bold flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-500"></span> ห้องว่างพร้อมอยู่:
                </span>
                <span className="font-bold text-blue-700 font-mono">{stats.availableRooms} ห้อง</span>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden flex">
              <div style={{ width: `${(stats.occupiedRooms / stats.totalRooms) * 100}%` }} className="bg-emerald-500 h-full" />
              <div style={{ width: `${(stats.bookedRooms / stats.totalRooms) * 100}%` }} className="bg-amber-500 h-full" />
            </div>
          </div>

          {/* สรุปการเงินรอบเดือน */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-500">การเก็บเงินรอบเดือน</span>
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-black">
                {stats.collectionRate}%
              </span>
            </div>

            <div className="space-y-2">
              {stats.paidBillsAmount !== null && (
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">ชำระแล้ว:</span>
                <span className="font-bold text-emerald-700 font-mono">฿{stats.paidBillsAmount.toLocaleString()}</span>
              </div>
              )}
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">ค้างชำระ <span className="text-[10px]">(รวมค่าปรับถึงวันนี้)</span>:</span>
                <span className="font-bold text-rose-700 font-mono">฿{stats.unpaidBillsAmount.toLocaleString()} ({stats.unpaidBillsCount} ห้อง)</span>
              </div>
            </div>
          </div>
        </div>

        {/* คอลัมน์กลาง (50% - Col 6): Workstream & Action Workspace (Internal Scroll) */}
        <div className="lg:col-span-6 bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col min-h-[350px]">
          {/* Tab Capsules */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-100 rounded-xl border border-slate-200 shrink-0 mb-4 overflow-x-auto">
            <button
              onClick={() => setActiveTab('bookings')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'bookings' ? 'bg-amber-500 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🔔</span>
              <span>จองใหม่ ({stats.pendingBookings})</span>
            </button>

            <button
              onClick={() => setActiveTab('slips')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'slips' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>💸</span>
              <span>สลิปรอตรวจ ({stats.pendingSlips})</span>
            </button>

            <button
              onClick={() => setActiveTab('maintenance')}
              className={`flex-1 py-2 px-3 rounded-lg text-xs font-black transition-all flex items-center justify-center gap-1.5 whitespace-nowrap ${
                activeTab === 'maintenance' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <span>🔧</span>
              <span>งานซ่อม ({stats.pendingMaintenance})</span>
            </button>
          </div>

          {/* Action List with Internal Scroll */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
            {activeTab === 'bookings' && (
              <div className="space-y-2.5">
                {stats.pendingBookings === 0 ? (
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200">
                    ✨ ไม่มีรายการจองที่รอทำสัญญาในขณะนี้
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-amber-200 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 border border-amber-200 flex items-center justify-center text-lg">🚪</span>
                      <div>
                        <p className="text-xs font-black text-slate-900">มีรายการจองใหม่รอทำสัญญา ({stats.pendingBookings} รายการ)</p>
                        <p className="text-[10px] text-slate-500">ตรวจสอบสลิปค่าจอง{bookingFee !== null ? ` ${formatBaht(bookingFee)} บาท` : ''} และอัปโหลดสัญญา</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/bookings"
                      className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-black rounded-lg shadow-xs transition-all shrink-0"
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
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200">
                    ✨ ตรวจสอบสลิปค่าเช่าครบถ้วนแล้ว ไม่มีสลิปตกค้าง
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-blue-200 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 flex items-center justify-center text-lg">🧾</span>
                      <div>
                        <p className="text-xs font-black text-slate-900">มีสลิปค่าเช่ารอตรวจสอบ ({stats.pendingSlips} ใบ)</p>
                        <p className="text-[10px] text-slate-500">ตรวจสอบและอนุมัติผ่านระบบ SlipOK</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/billing"
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-black rounded-lg shadow-xs transition-all shrink-0"
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
                  <div className="p-8 text-center text-slate-500 text-xs font-bold bg-slate-50 rounded-xl border border-slate-200">
                    ✨ ไม่มีรายการแจ้งซ่อมที่ค้างอยู่
                  </div>
                ) : (
                  <div className="p-4 bg-slate-50 rounded-xl border border-rose-200 flex items-center justify-between gap-3 shadow-xs">
                    <div className="flex items-center gap-3">
                      <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-700 border border-rose-200 flex items-center justify-center text-lg">🛠️</span>
                      <div>
                        <p className="text-xs font-black text-slate-900">งานแจ้งซ่อม/แม่บ้าน ({stats.pendingMaintenance} รายการ)</p>
                        <p className="text-[10px] text-slate-500">มอบหมายช่างหรือติดตามการปิดงาน</p>
                      </div>
                    </div>
                    <Link
                      href="/owner/maintenance"
                      className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg shadow-xs transition-all shrink-0"
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
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-3 shrink-0">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500">ทางลัดด่วน (Quick Actions)</span>
            <div className="grid grid-cols-2 gap-2">
              <Link
                href="/owner/meters"
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center transition-all group shadow-xs"
              >
                <span className="text-xl block mb-1">⚡</span>
                <span className="text-[11px] font-black text-slate-800 block">จดมิเตอร์ด่วน</span>
              </Link>

              <Link
                href="/owner/billing"
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center transition-all group shadow-xs"
              >
                <span className="text-xl block mb-1">💰</span>
                <span className="text-[11px] font-black text-slate-800 block">ออกบิลรอบเดือน</span>
              </Link>

              <Link
                href="/owner/bookings"
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center transition-all group shadow-xs"
              >
                <span className="text-xl block mb-1">🔔</span>
                <span className="text-[11px] font-black text-slate-800 block">ตรวจการจอง</span>
              </Link>

              <Link
                href="/owner/chat"
                className="p-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-center transition-all group shadow-xs"
              >
                <span className="text-xl block mb-1">📢</span>
                <span className="text-[11px] font-black text-slate-800 block">ประกาศหอพัก</span>
              </Link>
            </div>
          </div>

          {/* 🕒 ส่วนที่ 4: ฟีดความเคลื่อนไหวล่าสุด (Recent Activity Feed) */}
          <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex-1 flex flex-col min-h-[220px]">
            <span className="text-xs font-black uppercase tracking-wider text-slate-500 mb-3">ความเคลื่อนไหวล่าสุด</span>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-200">
              {stats.recentActivities.length === 0 ? (
                <div className="text-center py-6 text-slate-500 text-[11px]">ไม่มีกิจกรรมล่าสุด</div>
              ) : (
                stats.recentActivities.map((act, i) => (
                  <div key={i} className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="font-bold text-slate-700">{act.badge}</span>
                      <span className="text-slate-500">{act.time ? new Date(act.time).toLocaleDateString('th-TH') : 'วันนี้'}</span>
                    </div>
                    <p className="text-xs text-slate-900 font-medium line-clamp-2">{act.title}</p>
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
