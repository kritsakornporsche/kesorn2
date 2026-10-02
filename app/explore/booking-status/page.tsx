'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Booking {
  contract_id: number;
  status: string;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  monthly_rent: number;
  created_at: string;
  room_id: number;
  room_number: string;
  floor: number;
  price: number;
  room_type: string;
  dorm_name: string;
  dorm_address: string;
  dorm_phone: string;
}

type ToastType = 'success' | 'error' | null;

export default function BookingStatusPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchBookings = async () => {
    try {
      const res = await fetch('/api/booking/status');
      const data = await res.json();
      if (data.success) setBookings(data.data || []);
    } catch (e) {
      console.error('[Fetch Booking Status Error]', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/explore/booking-status');
    } else if (sessionStatus === 'authenticated') {
      fetchBookings();
    }
  }, [sessionStatus]);

  const handleCancelBooking = async (contractId: number, roomId: number) => {
    if (!confirm('ยืนยันการยกเลิกการจองห้องพัก?\nการยกเลิกไม่สามารถเรียกคืนได้')) return;

    setCancelling(contractId);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, roomId }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ ยกเลิกการจองห้องพักเรียบร้อยแล้ว ห้องพักกลับสู่สถานะว่าง', 'success');
        // Refresh booking list
        setTimeout(() => fetchBookings(), 800);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการยกเลิก', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + (e.message || ''), 'error');
    } finally {
      setCancelling(null);
    }
  };

  const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
    PendingOwnerSignature: {
      label: 'รอเจ้าของหอตรวจสอบ',
      color: 'text-amber-400',
      bg: 'bg-amber-500/10 border-amber-500/30',
      icon: '⏳',
    },
    Active: {
      label: 'อนุมัติแล้ว / กำลังพักอยู่',
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/30',
      icon: '✅',
    },
    Cancelled: {
      label: 'ยกเลิกการจองแล้ว',
      color: 'text-slate-400',
      bg: 'bg-slate-500/10 border-slate-500/30',
      icon: '❌',
    },
  };

  const pendingBookings = bookings.filter((b) => b.status === 'PendingOwnerSignature');
  const otherBookings = bookings.filter((b) => b.status !== 'PendingOwnerSignature');

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold transition-all animate-in fade-in slide-in-from-top-4 duration-300 flex items-center gap-3 max-w-sm w-[90vw] ${
            toast.type === 'success'
              ? 'bg-emerald-500 text-white'
              : 'bg-destructive text-destructive-foreground'
          }`}
        >
          <span className="text-xl">{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link
            href="/explore"
            className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors"
          >
            ← กลับสำรวจห้องพัก
          </Link>
          <span className="text-xs font-black text-primary uppercase tracking-widest">สถานะการจอง</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-10 space-y-8">
        {/* Header */}
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight">📋 สถานะการจองของคุณ</h1>
          <p className="text-sm text-muted-foreground">
            ติดตามสถานะการจองห้องพักและประวัติการจอง
          </p>
        </div>

        {/* Info Banner: Guest role notice */}
        <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-2xl text-xs text-blue-400 leading-relaxed">
          ℹ️ <strong>หมายเหตุ:</strong> หลังจากจองห้องพักแล้ว คุณจะยังอยู่ในสถานะ <strong>แขก</strong> จนกว่าเจ้าของหอพักจะตรวจสอบและอนุมัติการจอง
          เมื่อได้รับการอนุมัติแล้ว คุณจะได้รับสิทธิ์เข้าใช้งานในฐานะ <strong>ลูกหอ</strong> พร้อมเข้าถึงแดชบอร์ดเต็มรูปแบบ
        </div>

        {/* No Bookings */}
        {bookings.length === 0 && (
          <div className="text-center py-20 space-y-6">
            <div className="text-6xl">🏠</div>
            <div className="space-y-2">
              <h2 className="text-xl font-black">ยังไม่มีการจองห้องพัก</h2>
              <p className="text-sm text-muted-foreground">เริ่มสำรวจห้องพักที่ถูกใจและทำการจองได้เลย</p>
            </div>
            <Link
              href="/explore"
              className="inline-block px-8 py-3.5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm shadow-xl shadow-primary/25 hover:scale-[1.02] transition-all"
            >
              🔍 สำรวจห้องพัก →
            </Link>
          </div>
        )}

        {/* Pending Bookings */}
        {pendingBookings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-amber-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              รอการตรวจสอบ ({pendingBookings.length})
            </h2>
            {pendingBookings.map((booking) => {
              const cfg = statusConfig[booking.status] || statusConfig.PendingOwnerSignature;
              return (
                <div
                  key={booking.contract_id}
                  className="bg-card border border-border rounded-[2rem] p-6 shadow-lg space-y-5"
                >
                  {/* Status Badge */}
                  <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </div>

                  {/* Room Info */}
                  <div className="space-y-1">
                    <h3 className="text-xl font-black">
                      ห้อง {booking.room_number}
                      {booking.room_type && (
                        <span className="ml-2 text-sm font-semibold text-muted-foreground">({booking.room_type})</span>
                      )}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {booking.dorm_name || 'หอพักเกษร 2'} • ชั้น {booking.floor}
                    </p>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-secondary/50 rounded-2xl p-4 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ค่าเช่า/เดือน</span>
                      <p className="text-lg font-black text-primary">฿{Number(booking.monthly_rent || booking.price).toLocaleString()}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-2xl p-4 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">เงินจองที่ชำระ</span>
                      <p className="text-lg font-black">฿{Number(booking.deposit_amount).toLocaleString()}</p>
                    </div>
                    <div className="bg-secondary/50 rounded-2xl p-4 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">วันเริ่มต้นสัญญา</span>
                      <p className="text-sm font-bold">
                        {booking.start_date
                          ? new Date(booking.start_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '-'}
                      </p>
                    </div>
                    <div className="bg-secondary/50 rounded-2xl p-4 space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">วันสิ้นสุดสัญญา</span>
                      <p className="text-sm font-bold">
                        {booking.end_date
                          ? new Date(booking.end_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
                          : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Submitted date */}
                  <div className="text-[11px] text-muted-foreground">
                    📅 ส่งคำขอจองเมื่อ:{' '}
                    {new Date(booking.created_at).toLocaleDateString('th-TH', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>

                  {/* Dorm Phone */}
                  {booking.dorm_phone && (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      📞 ติดต่อหอพัก:{' '}
                      <a href={`tel:${booking.dorm_phone}`} className="text-primary font-bold hover:underline">
                        {booking.dorm_phone}
                      </a>
                    </div>
                  )}

                  {/* Action: What to wait for */}
                  <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 leading-relaxed">
                    ⏳ <strong>กำลังรอ:</strong> เจ้าของหอพักกำลังตรวจสอบสลิปโอนเงินและข้อมูลของคุณ
                    โดยปกติจะใช้เวลาไม่เกิน 24 ชั่วโมงในวันทำการ
                  </div>

                  {/* Cancel Button */}
                  <button
                    onClick={() => handleCancelBooking(booking.contract_id, booking.room_id)}
                    disabled={cancelling === booking.contract_id}
                    className="w-full py-3.5 rounded-2xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-black text-xs uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {cancelling === booking.contract_id ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="w-3 h-3 border-2 border-rose-400 border-t-transparent rounded-full animate-spin" />
                        กำลังยกเลิก...
                      </span>
                    ) : (
                      '🗑️ ยกเลิกการจองห้องพักนี้'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Other bookings (Active/Cancelled) */}
        {otherBookings.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">ประวัติการจอง</h2>
            {otherBookings.map((booking) => {
              const cfg = statusConfig[booking.status] || { label: booking.status, color: 'text-muted-foreground', bg: 'bg-muted', icon: '•' };
              return (
                <div
                  key={booking.contract_id}
                  className="bg-card border border-border rounded-[2rem] p-6 shadow-sm space-y-3 opacity-75"
                >
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>
                    <span>{cfg.icon}</span>
                    <span>{cfg.label}</span>
                  </div>
                  <div>
                    <p className="font-bold">ห้อง {booking.room_number} — {booking.dorm_name}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(booking.created_at).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 pt-1 flex-wrap">
                    {booking.status === 'Active' && (
                      <Link
                        href="/tenant"
                        className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black shadow-lg hover:scale-[1.02] active:scale-95 transition-all"
                      >
                        📊 ไปที่แดชบอร์ดลูกหอ →
                      </Link>
                    )}
                    {booking.status !== 'Cancelled' && (
                      <button
                        onClick={() => handleCancelBooking(booking.contract_id, booking.room_id)}
                        disabled={cancelling === booking.contract_id}
                        className="px-4 py-2.5 rounded-xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-black text-xs transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {cancelling === booking.contract_id ? 'กำลังยกเลิก...' : '🗑️ ยกเลิกการจอง / คืนห้อง'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Explore More */}
        {bookings.length > 0 && (
          <div className="text-center pt-4">
            <Link
              href="/explore"
              className="text-xs font-bold text-muted-foreground hover:text-primary transition-colors"
            >
              ← สำรวจห้องพักอื่น
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
