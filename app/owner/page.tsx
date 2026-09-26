'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface Stats {
  totalRooms: number;
  occupiedRooms: number;
  availableRooms?: number;
  totalTenants: number;
  pendingMaintenance: number;
  pendingSlips?: number;
  unpaidBills?: number;
  pendingBookings?: number;
  latestMaintenance?: {
    roomNumber?: string;
    issueType?: string;
    description?: string;
  } | null;
}

export default function OwnerDashboard() {
  const { data: session } = useSession();
  const [stats, setStats] = useState<Stats>({
    totalRooms: 0,
    occupiedRooms: 0,
    availableRooms: 0,
    totalTenants: 0,
    pendingMaintenance: 0,
    pendingSlips: 0,
    unpaidBills: 0,
    pendingBookings: 0,
  });

  const [loading, setLoading] = useState(true);
  const [dormInfo, setDormInfo] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    const checkOnboarding = async () => {
      const email = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null);
      if (!email) return;
      const savedDb = localStorage.getItem('selectedDormDbName');
      try {
        const res = await fetch(`/api/owner/onboarding?email=${encodeURIComponent(email)}${savedDb ? `&dormDbName=${savedDb}` : ''}`);
        const data = await res.json();
        
        if (data.success && !data.hasDorm) {
          router.push('/owner/onboarding');
        } else if (data.success) {
          setDormInfo(data.dorm);
          
          // Fetch Real Stats for Kesorn 2
          const statsRes = await fetch('/api/owner/stats');
          const statsData = await statsRes.json();
          if (statsData.success) {
            setStats(statsData.data);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    checkOnboarding();
  }, [router, session]);

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-muted-foreground">กำลังเปิดหอพัก...</p>
        </div>
      </div>
    );
  }

  const availableCount = stats.availableRooms ?? Math.max(0, stats.totalRooms - stats.occupiedRooms);
  const hasPendingSlips = (stats.pendingSlips || 0) > 0;
  const hasPendingMaint = stats.pendingMaintenance > 0;
  const hasPendingBookings = (stats.pendingBookings || 0) > 0;

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground p-6 sm:p-10">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* 1. Header: Clean & Personal */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 pb-2 border-b border-border">
          <div>
            <p className="text-xs text-primary font-bold tracking-wide">
              สวัสดี, {session?.user?.name || 'คุณเจ้าของหอ'} 👋
            </p>
            <h1 className="text-2xl sm:text-3xl font-black text-foreground mt-1 tracking-tight">
              {dormInfo?.name || 'SmartDom Dormitory'}
            </h1>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <Link
              href="/owner/settings"
              className="px-2.5 py-1 rounded-lg bg-card hover:bg-secondary text-foreground font-bold transition-all flex items-center gap-1 border border-border shadow-sm"
            >
              ⚙️ ตั้งค่า
            </Link>
            <Link
              href="/explore"
              className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold transition-all flex items-center gap-1 border border-primary/25 shadow-sm"
            >
              🌐 ดูหน้าเว็บหอ
            </Link>
          </div>
        </div>

        {/* 2. Smart Attention Bars (เฉพาะเวลามีงานค้างจริง) */}
        {(hasPendingSlips || hasPendingMaint || hasPendingBookings) ? (
          <div className="space-y-2.5">
            {hasPendingSlips && (
              <Link
                href={dormInfo?.id ? `/owner/billing?status=Pending&dormId=${dormInfo.id}` : '/owner/billing?status=Pending'}
                className="flex items-center justify-between p-3.5 px-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition-all text-amber-600 dark:text-amber-200 text-xs font-semibold group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">💰</span>
                  <span>มีสลิปโอนเงินรอตรวจสอบ <strong>{stats.pendingSlips} รายการ</strong></span>
                </div>
                <span className="font-bold text-amber-600 dark:text-amber-400 group-hover:translate-x-1 transition-transform">
                  ตรวจสลิป →
                </span>
              </Link>
            )}

            {hasPendingMaint && (
              <Link
                href={dormInfo?.id ? `/owner/maintenance?dormId=${dormInfo.id}` : '/owner/maintenance'}
                className="flex items-center justify-between p-3.5 px-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/15 transition-all text-rose-600 dark:text-rose-200 text-xs font-semibold group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🔧</span>
                  <span>
                    มีรายการแจ้งซ่อมใหม่ <strong>{stats.pendingMaintenance} รายการ</strong>
                    {stats.latestMaintenance?.roomNumber && ` (ห้อง ${stats.latestMaintenance.roomNumber})`}
                  </span>
                </div>
                <span className="font-bold text-rose-600 dark:text-rose-400 group-hover:translate-x-1 transition-transform">
                  ดูงานซ่อม →
                </span>
              </Link>
            )}

            {hasPendingBookings && (
              <Link
                href={dormInfo?.id ? `/owner/bookings?tab=Pending&dormId=${dormInfo.id}` : '/owner/bookings?tab=Pending'}
                className="flex items-center justify-between p-3.5 px-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 hover:bg-blue-500/15 transition-all text-blue-600 dark:text-blue-200 text-xs font-semibold group cursor-pointer"
              >
                <div className="flex items-center gap-2.5">
                  <span className="text-base">🛎️</span>
                  <span>มีรายการจองห้องพักใหม่รอตรวจสอบ <strong>{stats.pendingBookings} รายการ</strong></span>
                </div>
                <span className="font-bold text-blue-600 dark:text-blue-400 group-hover:translate-x-1 transition-transform">
                  ดูการจอง →
                </span>
              </Link>
            )}
          </div>
        ) : (
          <div className="p-3 px-4 rounded-2xl bg-card border border-border flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-emerald-500">✓</span>
            <span>สถานะปกติ ไม่มีสลิปหรือคำร้องค้างรอดำเนินการ</span>
          </div>
        )}

        {/* 3. Big Clean Numbers (3 ตัวเลขสำคัญ) */}
        <div className="grid grid-cols-3 gap-4 sm:gap-6">
          <Link
            href="/owner/rooms"
            className="p-5 rounded-2xl bg-card hover:bg-secondary/40 border border-border hover:border-primary/40 transition-all group cursor-pointer shadow-sm"
          >
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">ห้องว่าง</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-foreground group-hover:text-primary transition-colors">
                {availableCount}
              </span>
              <span className="text-xs text-muted-foreground">/ {stats.totalRooms} ห้อง</span>
            </div>
          </Link>

          <Link
            href="/owner/tenants"
            className="p-5 rounded-2xl bg-card hover:bg-secondary/40 border border-border hover:border-primary/40 transition-all group cursor-pointer shadow-sm"
          >
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">ผู้เช่าปัจจุบัน</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-foreground group-hover:text-primary transition-colors">
                {stats.totalTenants}
              </span>
              <span className="text-xs text-muted-foreground">คน</span>
            </div>
          </Link>

          <Link
            href="/owner/billing"
            className="p-5 rounded-2xl bg-card hover:bg-secondary/40 border border-border hover:border-amber-500/40 transition-all group cursor-pointer shadow-sm"
          >
            <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">บิลรอชำระ</p>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-foreground group-hover:text-amber-500 transition-colors">
                {stats.unpaidBills || 0}
              </span>
              <span className="text-xs text-muted-foreground">บิล</span>
            </div>
          </Link>
        </div>

        {/* 4. Three Primary Task Cards (3 งานหลักประจำหอพัก) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Task 1: Billing & Meters */}
          <Link
            href="/owner/meters"
            className="p-6 rounded-3xl bg-card hover:bg-secondary/30 border border-border hover:border-primary/40 transition-all flex flex-col justify-between h-48 shadow-sm group cursor-pointer"
          >
            <div>
              <span className="text-2xl">⚡</span>
              <h3 className="text-base font-bold text-foreground mt-3 group-hover:text-primary transition-colors">
                รอบบิล & มิเตอร์
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                จดเลขมิเตอร์น้ำ-ไฟ และออกใบแจ้งหนี้ประจำเดือน
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-primary group-hover:translate-x-1 transition-transform">
              <span>เริ่มจดมิเตอร์</span>
              <span>→</span>
            </div>
          </Link>

          {/* Task 2: Rooms & Tenants */}
          <Link
            href="/owner/rooms"
            className="p-6 rounded-3xl bg-card hover:bg-secondary/30 border border-border hover:border-blue-500/40 transition-all flex flex-col justify-between h-48 shadow-sm group cursor-pointer"
          >
            <div>
              <span className="text-2xl">🚪</span>
              <h3 className="text-base font-bold text-foreground mt-3 group-hover:text-blue-500 transition-colors">
                ผังห้อง & ผู้เช่า
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                ตรวจเช็คห้องว่าง สัญญาเช่า และประวัติลูกหอ
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-blue-500 group-hover:translate-x-1 transition-transform">
              <span>ดูผังห้องพัก</span>
              <span>→</span>
            </div>
          </Link>

          {/* Task 3: Maintenance & Care */}
          <Link
            href="/owner/maintenance"
            className="p-6 rounded-3xl bg-card hover:bg-secondary/30 border border-border hover:border-rose-500/40 transition-all flex flex-col justify-between h-48 shadow-sm group cursor-pointer"
          >
            <div>
              <span className="text-2xl">🔧</span>
              <h3 className="text-base font-bold text-foreground mt-3 group-hover:text-rose-500 transition-colors">
                งานแจ้งซ่อม
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                รับเรื่องแจ้งซ่อม และมอบหมายงานให้ช่าง
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs font-bold text-rose-500 group-hover:translate-x-1 transition-transform">
              <span>ดูรายการซ่อม</span>
              <span>→</span>
            </div>
          </Link>
        </div>

        {/* 5. Minimal Bottom Shortcuts */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-border text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <Link href="/owner/accounting" className="hover:text-foreground transition-colors">
              📈 บัญชีรายรับ-จ่าย
            </Link>
            <Link href="/owner/contracts" className="hover:text-foreground transition-colors">
              📝 สัญญาเช่ากระดาษ
            </Link>
            <Link href="/owner/chat" className="hover:text-foreground transition-colors">
              💬 แชทลูกหอ
            </Link>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground/60">SmartDom Owner v2.6.1</span>
        </div>

      </div>
    </div>
  );
}
