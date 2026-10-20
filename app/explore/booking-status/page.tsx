'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { formatBaht } from '@/lib/format';
import { BOOKING_REQUEST_NOTE } from '@/lib/booking-text';
import { BECOME_TENANT_TEXT, NextStepLine, StepChecklist } from '@/components/BookingSteps';
import type { BookingSteps } from '@/lib/booking-steps';

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
  const { status: sessionStatus } = useSession();
  const router = useRouter();

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

  const left = (seconds: number | null) =>
    seconds === null ? null : Math.max(0, seconds - Math.floor((performance.now() - syncedAt.current) / 1000));

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
    const message = paid
      ? 'ยืนยันยกเลิกการจอง? ค่าจองที่ชำระแล้วจะไม่คืน (เป็นไปตามเงื่อนไขการจอง) และห้องจะเปิดให้ผู้อื่นจองทันที'
      : 'ยืนยันยกเลิกคำขอจอง? ห้องจะเปิดให้ผู้อื่นจองทันที';
    if (!confirm(message)) return;
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
          <p className="text-sm text-muted-foreground">1 ขอจอง → 2 ชำระค่าจอง (10 นาที) → 3 หอพักยืนยันข้อมูลสัญญา → 4 ตรวจห้องและรับทราบ → 5 ลงนามสัญญา → 6 บิลค่าแรกเข้า → 7 ชำระ = เป็นลูกหอ</p>
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
                  <span className="block mt-1 text-amber-300/90">{BOOKING_REQUEST_NOTE}</span>
                </div>
              )}

              {booking.status === 'BookingApproved' && !uploadOver && (
                <div className="space-y-4">
                  <div className={`p-5 rounded-2xl border text-center ${toPay !== null && toPay > 0 && toPay <= WARN_SECONDS ? 'bg-rose-500/10 border-rose-500/30' : 'bg-sky-500/10 border-sky-500/30'}`}>
                    {toPay !== null && toPay > 0 ? (
                      <>
                        <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">เหลือเวลาโอน</p>
                        <p className="text-5xl font-black font-mono">{clock(toPay)}</p>
                        {toPay <= WARN_SECONDS && (
                          <p className="text-xs text-rose-400 font-bold mt-2">เหลือเวลาอีก 5 นาที — หากไม่ชำระภายในเวลา การจองจะหมดอายุและห้องจะเปิดให้ผู้อื่นจอง</p>
                        )}
                      </>
                    ) : (
                      <p className="text-sm text-amber-300 font-bold">หมดเวลาโอนแล้ว — หากโอนภายในเวลาแล้ว กรุณาอัปโหลดสลิปภายใน {Math.ceil((toUpload || 0) / 60)} นาที</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    หอพักอนุมัติการจองแล้ว กรุณาโอนค่าจอง ฿{formatBaht(booking.booking_fee)} และอัปโหลดสลิปภายในเวลา · โอนหลังเวลาอนุมัติเท่านั้น · ค่าจองเป็นส่วนหนึ่งของเงินประกัน ไม่คืนหากยกเลิกการจองหรือไม่มาตามนัด
                  </p>
                  {qr && toPay !== null && toPay > 0 && (
                    <div className="flex flex-col items-center text-center">
                      <img src={qr.qrImage} alt="PromptPay QR" className="w-52 h-52 object-contain bg-white p-2 rounded-xl shadow-md" />
                      <p className="text-xs text-muted-foreground mt-3 font-bold tracking-wider">พร้อมเพย์: {qr.promptpayNumber}</p>
                      {qr.promptpayName && <p className="text-xs text-muted-foreground">{qr.promptpayName}</p>}
                    </div>
                  )}
                  {qrFailed && toPay !== null && toPay > 0 && (
                    <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-2xl text-xs text-red-400 font-bold text-center">
                      หอพักยังไม่ได้ตั้งเลขพร้อมเพย์ กรุณาติดต่อหอพัก{phoneOf(booking) ? ` โทร ${phoneOf(booking)}` : ''}
                    </div>
                  )}
                  {qr && toPay !== null && toPay > 0 && (
                    <PromptPayBankSelector
                      qrImage={qr.qrImage}
                      promptpayNumber={qr.promptpayNumber}
                      promptpayName={qr.promptpayName}
                      amount={booking.booking_fee}
                      fileName={`booking-${booking.contract_id}.png`}
                    />
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
                  <p className="text-xs text-muted-foreground">{BECOME_TENANT_TEXT}</p>
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
    </div>
  );
}
