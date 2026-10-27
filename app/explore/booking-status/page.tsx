'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { DynamicBillQrModal } from '@/components/features/DynamicBillQrModal';
import { formatBaht } from '@/lib/format';
import { BOOKING_REQUEST_NOTE } from '@/lib/booking-text';
import { BECOME_TENANT_TEXT, NextStepLine, StepChecklist } from '@/components/BookingSteps';
import type { BookingSteps } from '@/lib/booking-steps';
import { useConfirm } from '@/components/ConfirmModalProvider';

interface Booking {
  contract_id: number;
  booking_bill_id?: number | null;
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
  dorm_phone: string;
  dorm_contact_phone?: string | null;
  rejection_reason?: string | null;
  booking_fee: number;
  // Seconds left, computed with the server clock at the time of the response
  seconds_to_expire: number | null;
  seconds_to_pay: number | null;
  seconds_to_upload: number | null;
  /** commit 28-5: steps 1–7 (lib/booking-steps.ts) and the move-in bill (step 7) */
  steps?: BookingSteps;
  inspection_status?: 'none' | 'pending_ack' | 'acknowledged';
  first_bill_amount?: number | null;
  first_bill_due_date?: string | null;
  move_in_bill_paid?: boolean;
  legacy?: boolean;
}

type ToastType = 'success' | 'error' | null;

const OPEN = ['BookingRequested', 'BookingApproved'];
const PAID = ['PendingOwnerSignature', 'PendingContract', 'PendingFirstBill'];
const WARN_SECONDS = 5 * 60;

const statusConfig: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  BookingRequested: { label: 'รอหอพักอนุมัติ', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/30', icon: '⏳' },
  BookingApproved: { label: 'อนุมัติแล้ว — รอชำระค่าจอง', color: 'text-sky-400', bg: 'bg-sky-500/10 border-sky-500/30', icon: '⏱' },
  PendingOwnerSignature: { label: 'ชำระค่าจองแล้ว — รอทำสัญญา', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '✅' },
  PendingContract: { label: 'ชำระค่าจองแล้ว — รอทำสัญญา', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '✅' },
  PendingFirstBill: { label: 'ทำสัญญาแล้ว — รอชำระบิลแรกเข้า', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '📄' },
  Active: { label: 'กำลังพักอยู่', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/30', icon: '🏠' },
  Cancelled: { label: 'ยกเลิกแล้ว', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', icon: '❌' },
  Rejected: { label: 'ไม่ได้รับการอนุมัติ', color: 'text-rose-400', bg: 'bg-rose-500/10 border-rose-500/30', icon: '🚫' },
  Expired: { label: 'หมดเวลา', color: 'text-slate-400', bg: 'bg-slate-500/10 border-slate-500/30', icon: '⌛' },
};

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export default function BookingStatusPage() {
  const { data: session, status: sessionStatus } = useSession();
  const router = useRouter();
  const { confirm } = useConfirm();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<number | null>(null);
  const [paying, setPaying] = useState(false);
  const [slipData, setSlipData] = useState<string | null>(null);
  const [qr, setQr] = useState<{ qrImage: string; promptpayNumber: string; promptpayName: string } | null>(null);
  // QR could not be made (e.g. no PromptPay number set): show a message instead of an empty space
  const [qrFailed, setQrFailed] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);
  // Countdown base: elapsed time since the last response (monotonic), not the device's wall clock
  const syncedAt = useRef<number>(0);
  const [, setTick] = useState(0);
  const [dynamicQrTarget, setDynamicQrTarget] = useState<Booking | null>(null);
  const [dynamicQr, setDynamicQr] = useState<{
    qrDataUrl: string;
    expectedAmount: number;
    sessionId: string;
    status: string;
    promptpayNumber: string;
    promptpayName: string;
  } | null>(null);
  const [dynamicLoading, setDynamicLoading] = useState(false);
  const [paymentMethodTab, setPaymentMethodTab] = useState<"auto" | "slip">("auto");

  const showToast = (message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchBookings = useCallback(async () => {
    try {
      const res = await fetch('/api/booking/status', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setBookings(data.data || []);
        syncedAt.current = performance.now();
      }
    } catch (e) {
      console.error('[Fetch Booking Status Error]', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/explore/booking-status');
    } else if (sessionStatus === 'authenticated') {
      fetchBookings();
    }
  }, [sessionStatus, fetchBookings, router]);

  const open = bookings.find((b) => OPEN.includes(b.status)) || null;

  // While a booking is open: refresh from the server every ~10 s (approval shows up without reloading)
  useEffect(() => {
    if (!open) return;
    const id = setInterval(fetchBookings, 10_000);
    return () => clearInterval(id);
  }, [open?.contract_id, open?.status, fetchBookings]);

  // Redraw the countdown every second
  useEffect(() => {
    if (!open) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [open?.contract_id]);

  // Alert on screen when status transitions to BookingApproved
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!open) return;
    if (prevStatusRef.current === 'BookingRequested' && open.status === 'BookingApproved') {
      showToast('🎉 หอพักอนุมัติการจองแล้ว! กรุณาชำระค่าจองภายใน 10 นาที', 'success');
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('🎉 หอพักอนุมัติการจองแล้ว!', {
          body: `ห้อง ${open.room_number}: กรุณาชำระค่าจอง ฿${formatBaht(open.booking_fee)} ภายใน 10 นาที`,
          icon: '/favicon.ico',
        });
      }
    }
    prevStatusRef.current = open.status;
  }, [open?.status, open?.room_number, open?.booking_fee]);

  const left = (seconds: number | null) =>
    seconds === null ? null : Math.max(0, seconds - Math.floor((performance.now() - syncedAt.current) / 1000));

  // Dynamic QR: Fetch auto QR and poll payment status
  useEffect(() => {
    if (!open || open.status !== 'BookingApproved') {
      setDynamicQr(null);
      return;
    }
    setDynamicLoading(true);
    const qs = new URLSearchParams({
      amount: String(open.booking_fee || 1000),
      roomNumber: String(open.room_number || '104'),
      tenantName: String(session?.user?.name || 'ผู้จองห้อง'),
      billTitle: `ค่าจองห้อง ${open.room_number}`,
      enableSatang: 'true',
    });
    if (open.booking_bill_id) qs.set('billId', String(open.booking_bill_id));

    fetch(`/api/features/dynamic-qr?${qs.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.session) {
          setDynamicQr({
            qrDataUrl: data.qrDataUrl,
            expectedAmount: data.session.expectedAmount,
            sessionId: data.session.sessionId,
            status: data.session.status,
            promptpayNumber: data.session.promptpayNumber || '063-604-0550',
            promptpayName: data.session.promptpayName || 'นาย กฤษกร บัวอินทร์',
          });
        }
      })
      .catch((e) => console.error('[Dynamic QR fetch error]', e))
      .finally(() => setDynamicLoading(false));
  }, [open?.contract_id, open?.status, open?.booking_fee, open?.room_number, open?.booking_bill_id, session?.user?.name]);

  useEffect(() => {
    if (!dynamicQr || dynamicQr.status === 'PAID' || paymentMethodTab !== 'auto') return;
    const timer = setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          action: 'status',
          sessionId: dynamicQr.sessionId,
          checkImap: 'true',
          amount: String(dynamicQr.expectedAmount),
          roomNumber: open?.room_number || '104',
        });
        const res = await fetch(`/api/features/dynamic-qr?${qs.toString()}`);
        const data = await res.json();
        if (data.success && data.session) {
          if (data.session.status === 'PAID') {
            setDynamicQr((prev) => (prev ? { ...prev, status: 'PAID' } : null));
            showToast('ชำระค่าจองห้องพักเรียบร้อยแล้ว!', 'success');
            await fetchBookings();
          }
        }
      } catch {
        // ignore network error
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [dynamicQr?.sessionId, dynamicQr?.status, paymentMethodTab, open?.room_number, fetchBookings]);

  // QR for the booking fee (amount from the server)
  useEffect(() => {
    setQrFailed(false);
    if (!open || open.status !== 'BookingApproved') { setQr(null); return; }
    fetch(`/api/booking/qr?roomId=${open.room_id}`)
      .then((res) => res.json())
      .then((data) => { if (data.success) setQr(data); else { setQr(null); setQrFailed(true); } })
      .catch(() => setQrFailed(true));
  }, [open?.contract_id, open?.status, open?.booking_fee, open?.room_id]);

  const handleSlip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { showToast('ไฟล์ต้องไม่เกิน 5MB', 'error'); return; }
    const reader = new FileReader();
    reader.onloadend = () => setSlipData(reader.result as string);
    reader.readAsDataURL(file);
  };

  const handlePay = async (booking: Booking) => {
    if (!slipData) return;
    setPaying(true);
    try {
      const res = await fetch('/api/booking/pay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: booking.contract_id, slipData }),
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'ชำระค่าจองแล้ว' : 'ชำระไม่สำเร็จ'), data.success ? 'success' : 'error');
      if (data.success) setSlipData(null);
      fetchBookings();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + (e.message || ''), 'error');
    } finally {
      setPaying(false);
    }
  };

  const handleCancel = async (booking: Booking) => {
    const paid = PAID.includes(booking.status);
    const ok = await confirm({
      title: paid ? 'ยืนยันยกเลิกการจองห้องพัก?' : 'ยืนยันยกเลิกคำขอจองห้องพัก?',
      description: paid
        ? 'ค่าจองที่ชำระแล้วจะไม่คืน (เป็นไปตามเงื่อนไขการจอง) และห้องพักจะเปิดให้ผู้อื่นจองทันที'
        : 'คำขอจองจะถูกยกเลิก และห้องพักจะเปิดให้ผู้อื่นจองทันที',
      confirmText: 'ยืนยันยกเลิก',
      cancelText: 'ย้อนกลับ',
      variant: 'danger',
    });
    if (!ok) return;
    setCancelling(booking.contract_id);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: booking.contract_id, roomId: booking.room_id }),
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'ยกเลิกแล้ว' : 'ยกเลิกไม่สำเร็จ'), data.success ? 'success' : 'error');
      fetchBookings();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + (e.message || ''), 'error');
    } finally {
      setCancelling(null);
    }
  };

  if (sessionStatus === 'loading' || loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  const current = bookings.filter((b) => OPEN.includes(b.status) || PAID.includes(b.status));
  const history = bookings.filter((b) => !OPEN.includes(b.status) && !PAID.includes(b.status));
  const phoneOf = (b: Booking) => b.dorm_contact_phone || b.dorm_phone;

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {toast && (
        <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[200] px-6 py-4 rounded-2xl shadow-2xl text-sm font-bold flex items-center gap-3 max-w-sm w-[90vw] ${
          toast.type === 'success' ? 'bg-emerald-500 text-white' : 'bg-destructive text-destructive-foreground'
        }`}>
          <span className="text-xl">{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-3xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/explore" className="text-xs font-bold text-muted-foreground hover:text-foreground">← กลับสำรวจห้องพัก</Link>
          <span className="text-xs font-black text-primary uppercase tracking-widest">สถานะการจอง</span>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pt-10 space-y-8">
        <div className="space-y-1">
          <h1 className="text-3xl font-black tracking-tight">📋 สถานะการจองของคุณ</h1>
          
        </div>

        {bookings.length === 0 && (
          <div className="text-center py-20 space-y-6">
            <div className="text-6xl">🏠</div>
            <h2 className="text-xl font-black">ยังไม่มีการจองห้องพัก</h2>
            <Link href="/explore" className="inline-block px-8 py-3.5 bg-primary text-white font-black rounded-2xl text-sm shadow-xl">🔍 สำรวจห้องพัก →</Link>
          </div>
        )}

        {current.map((booking) => {
          const cfg = statusConfig[booking.status] || { label: booking.status, color: 'text-muted-foreground', bg: 'bg-muted', icon: '•' };
          const toPay = left(booking.seconds_to_pay);
          const toUpload = left(booking.seconds_to_upload);
          const uploadOver = booking.status === 'BookingApproved' && toUpload === 0;
          return (
            <div key={booking.contract_id} className="bg-card border border-border rounded-[2rem] p-6 shadow-lg space-y-5">
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>
                <span>{cfg.icon}</span><span>{cfg.label}</span>
              </div>
              <div className="space-y-1">
                <h3 className="text-xl font-black">ห้อง {booking.room_number}</h3>
                <p className="text-sm text-muted-foreground">{booking.dorm_name || 'หอพักเกษร 2'} · ค่าเช่า ฿{formatBaht(booking.monthly_rent || booking.price)}/เดือน · เข้าพัก {booking.start_date ? new Date(booking.start_date).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' }) : '-'}</p>
              </div>

              {booking.status === 'BookingRequested' && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-xs text-amber-300 leading-relaxed">
                  ส่งคำขอจองแล้ว รอหอพักอนุมัติ
                  
                </div>
              )}

              {booking.status === 'BookingApproved' && !uploadOver && (
                <div className="space-y-4">
                  {/* Countdown Timer */}
                  <div className={`p-4 rounded-2xl border text-center ${toPay !== null && toPay > 0 && toPay <= WARN_SECONDS ? 'bg-rose-500/10 border-rose-500/30' : 'bg-sky-500/10 border-sky-500/30'}`}>
                    {toPay !== null && toPay > 0 ? (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">เหลือเวลาโอน</p>
                        <p className="text-4xl font-black font-mono">{clock(toPay)}</p>
                        {toPay <= WARN_SECONDS && (
                          <p className="text-xs text-rose-400 font-bold mt-1">เหลือเวลาอีก 5 นาที</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-amber-300 font-bold">หมดเวลาโอน — กรุณาแนบสลิปภายใน {Math.ceil((toUpload || 0) / 60)} นาที</p>
                    )}
                  </div>

                  {/* Payment Method Switcher Tabs */}
                  {toPay !== null && toPay > 0 && (
                    <div className="flex p-1 bg-secondary/60 rounded-2xl border border-border gap-1">
                      <button
                        type="button"
                        onClick={() => setPaymentMethodTab('auto')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          paymentMethodTab === 'auto'
                            ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span>⚡</span>
                        <span>สแกนจ่ายอัตโนมัติ</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setPaymentMethodTab('slip')}
                        className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          paymentMethodTab === 'slip'
                            ? 'bg-primary text-white shadow-md'
                            : 'text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        <span>📎</span>
                        <span>แนบสลิป (สำรอง)</span>
                      </button>
                    </div>
                  )}

                  {/* TAB 1: Auto Detection (QR displayed directly!) */}
                  {paymentMethodTab === 'auto' && toPay !== null && toPay > 0 && (
                    <div className="p-5 rounded-2xl bg-secondary/30 border border-border space-y-4 text-center">
                      {dynamicLoading && !dynamicQr ? (
                        <div className="w-52 h-52 mx-auto bg-card rounded-2xl border border-border flex flex-col items-center justify-center gap-2">
                          <div className="w-8 h-8 border-3 border-emerald-500 border-t-transparent rounded-full animate-spin" />
                          <span className="text-xs text-muted-foreground font-bold">กำลังสร้าง QR...</span>
                        </div>
                      ) : dynamicQr?.qrDataUrl ? (
                        <div className="space-y-3">
                          <img
                            src={dynamicQr.qrDataUrl}
                            alt="PromptPay QR"
                            className="w-52 h-52 mx-auto object-contain bg-white p-2 rounded-2xl shadow-md border border-border"
                          />
                          <div className="space-y-1">
                            <div className="text-2xl font-black text-emerald-500 font-mono">
                              ฿{dynamicQr.expectedAmount.toFixed(2)}
                            </div>
                            <div className="text-xs text-muted-foreground font-bold">
                              พร้อมเพย์: {dynamicQr.promptpayNumber} ({dynamicQr.promptpayName})
                            </div>
                          </div>
                          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                            <span>รอเงินเข้า... (ตรวจจับอัตโนมัติ)</span>
                          </div>
                          <PromptPayBankSelector
                            qrImage={dynamicQr.qrDataUrl}
                            promptpayNumber={dynamicQr.promptpayNumber}
                            promptpayName={dynamicQr.promptpayName}
                            amount={dynamicQr.expectedAmount}
                            fileName={`booking-qr-${booking.contract_id}.png`}
                          />
                        </div>
                      ) : (
                        <div className="p-4 text-xs text-muted-foreground font-bold">
                          ไม่สามารถสร้าง QR ได้ กรุณาสลับไปใช้แบบแนบสลิป
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 2: Fallback - Manual Slip Upload */}
                  {(paymentMethodTab === 'slip' || toPay === 0) && (
                    <div className="p-5 rounded-2xl bg-secondary/30 border border-border space-y-4">
                      {qr && toPay !== null && toPay > 0 && (
                        <div className="flex flex-col items-center text-center space-y-2">
                          <img src={qr.qrImage} alt="PromptPay QR" className="w-52 h-52 object-contain bg-white p-2 rounded-2xl shadow-md border border-border" />
                          <div className="text-2xl font-black text-foreground font-mono">฿{formatBaht(booking.booking_fee)}</div>
                          <p className="text-xs text-muted-foreground font-bold">พร้อมเพย์: {qr.promptpayNumber} {qr.promptpayName ? `(${qr.promptpayName})` : ''}</p>
                          <PromptPayBankSelector
                            qrImage={qr.qrImage}
                            promptpayNumber={qr.promptpayNumber}
                            promptpayName={qr.promptpayName}
                            amount={booking.booking_fee}
                            fileName={`booking-${booking.contract_id}.png`}
                          />
                        </div>
                      )}
                      <div className="space-y-3">
                        {slipData ? (
                          <div className="flex items-center gap-3">
                            <img src={slipData} alt="สลิป" className="w-20 h-28 object-cover rounded-xl border border-border" />
                            <button onClick={() => setSlipData(null)} className="text-xs text-rose-400 font-bold cursor-pointer">ลบ / เลือกใหม่</button>
                          </div>
                        ) : (
                          <label className="block p-6 border-2 border-dashed border-border rounded-2xl text-center text-xs font-bold text-muted-foreground cursor-pointer hover:border-primary">
                            📎 แนบรูปสลิปการโอนเงิน
                            <input type="file" accept="image/*" className="hidden" onChange={handleSlip} />
                          </label>
                        )}
                        <button
                          onClick={() => handlePay(booking)}
                          disabled={!slipData || paying}
                          className="w-full py-4 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm shadow-xl disabled:opacity-40 cursor-pointer"
                        >
                          {paying ? 'กำลังตรวจสอบสลิป...' : '✓ ยืนยันการชำระค่าจอง'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {uploadOver && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-xs text-rose-300 leading-relaxed">
                  การจองหมดเวลาแล้ว หากโอนเงินแล้วกรุณาติดต่อหอพัก{phoneOf(booking) ? ` โทร ${phoneOf(booking)}` : ''}
                </div>
              )}

              {/* Steps 1–7 (commit 28-5): where the booking is, what is next and who does it */}
              {booking.steps && (
                <div className="space-y-2">
                  <StepChecklist steps={booking.steps} viewer="booker" tone="theme" />
                  <NextStepLine steps={booking.steps} viewer="booker" tone="theme" />
                  
                </div>
              )}

              {/* Step 4: acknowledge the inspection on the guest page */}
              {booking.steps?.current === 4 && booking.inspection_status === 'pending_ack' && (
                <Link href="/guest" className="block w-full py-3 rounded-2xl bg-cyan-600 hover:bg-cyan-500 text-white font-black text-xs text-center">
                  🔍 ดูผลตรวจห้องและกดรับทราบ
                </Link>
              )}

              {/* Step 7: the move-in bill, paid on the guest page */}
              {booking.status === 'PendingFirstBill' && !booking.legacy && (
                booking.move_in_bill_paid ? (
                  <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 font-bold">✓ ชำระบิลค่าแรกเข้าแล้ว</div>
                ) : (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-2xl space-y-3">
                    <p className="text-xs font-bold text-foreground">
                      บิลค่าแรกเข้า ฿{formatBaht(Number(booking.first_bill_amount || 0))}
                      {booking.first_bill_due_date ? ` · ชำระภายใน ${new Date(booking.first_bill_due_date).toLocaleDateString('th-TH')} (ถ้าไม่ชำระ สัญญาถูกยกเลิกและค่าจองไม่คืน)` : ''}
                    </p>
                    <Link href="/guest?pay=1" className="block w-full py-3 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs text-center">💳 ชำระบิลค่าแรกเข้า</Link>
                  </div>
                )
              )}

              {PAID.includes(booking.status) && booking.status !== 'PendingFirstBill' && (
                <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  ชำระค่าจอง ฿{formatBaht(booking.booking_fee)} แล้ว
                </div>
              )}

              {phoneOf(booking) && (
                <div className="text-xs text-muted-foreground">📞 ติดต่อหอพัก: <a href={`tel:${phoneOf(booking)}`} className="text-primary font-bold">{phoneOf(booking)}</a></div>
              )}

              {(OPEN.includes(booking.status) || booking.status === 'PendingOwnerSignature' || booking.status === 'PendingContract') && !uploadOver && (
                <button
                  onClick={() => handleCancel(booking)}
                  disabled={cancelling === booking.contract_id}
                  className="w-full py-3 rounded-2xl border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-black text-xs disabled:opacity-50 cursor-pointer"
                >
                  {cancelling === booking.contract_id ? 'กำลังยกเลิก...' : OPEN.includes(booking.status) ? '🗑️ ยกเลิกคำขอจอง' : '🗑️ ยกเลิกการจอง'}
                </button>
              )}
            </div>
          );
        })}

        {history.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-muted-foreground">ประวัติการจอง</h2>
            {history.map((booking) => {
              const cfg = statusConfig[booking.status] || { label: booking.status, color: 'text-muted-foreground', bg: 'bg-muted', icon: '•' };
              return (
                <div key={booking.contract_id} className="bg-card border border-border rounded-[2rem] p-6 shadow-sm space-y-3 opacity-80">
                  <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-black border ${cfg.bg} ${cfg.color}`}>
                    <span>{cfg.icon}</span><span>{cfg.label}</span>
                  </div>
                  <p className="font-bold">ห้อง {booking.room_number} — {booking.dorm_name}</p>
                  {booking.rejection_reason && booking.status !== 'Active' && (
                    <p className="text-xs text-muted-foreground">เหตุผล: {booking.rejection_reason}</p>
                  )}
                  {booking.status === 'Expired' && (
                    <p className="text-xs text-muted-foreground">การจองหมดเวลาแล้ว หากโอนเงินแล้วกรุณาติดต่อหอพัก{phoneOf(booking) ? ` โทร ${phoneOf(booking)}` : ''}</p>
                  )}
                  {booking.status === 'Active' && (
                    <Link href="/tenant" className="inline-block px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black">📊 ไปที่แดชบอร์ดลูกหอ →</Link>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {bookings.length > 0 && (
          <div className="text-center pt-4">
            <Link href="/explore" className="text-xs font-bold text-muted-foreground hover:text-primary">← สำรวจห้องพักอื่น</Link>
          </div>
        )}
      </div>

      {/* Dynamic PromptPay QR Modal for Booking Fee */}
      {dynamicQrTarget && (
        <DynamicBillQrModal
          isOpen={Boolean(dynamicQrTarget)}
          onClose={() => {
            setDynamicQrTarget(null);
            fetchBookings();
          }}
          billId={dynamicQrTarget.booking_bill_id || null}
          roomNumber={dynamicQrTarget.room_number || '104'}
          tenantName={session?.user?.name || 'ผู้จองห้อง'}
          billTitle={`ค่าจองห้อง ${dynamicQrTarget.room_number}`}
          amount={Number(dynamicQrTarget.booking_fee || 1000)}
          enableSatang={true}
          onSwitchToSlip={() => {
            setDynamicQrTarget(null);
            setPaymentMethodTab('slip');
          }}
          onPaid={async () => {
            showToast('ชำระค่าจองห้องพักเรียบร้อยแล้ว!', 'success');
            setDynamicQrTarget(null);
            await fetchBookings();
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
