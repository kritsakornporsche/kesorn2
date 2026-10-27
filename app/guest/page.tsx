'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { roomTypeLabel } from '@/lib/room-types';
import { signedPaperText, type SignedPaper } from '@/lib/signed-paper';
import TenantInspectionCard from '@/components/TenantInspectionCard';
import { DynamicBillQrModal } from '@/components/features/DynamicBillQrModal';
import { BECOME_TENANT_TEXT, NextStepLine, StepBadge, StepChecklist } from '@/components/BookingSteps';
import type { BookingSteps } from '@/lib/booking-steps';
import { useConfirm } from '@/components/ConfirmModalProvider';

interface BookingData {
  contract_id: number;
  status: string;
  booking_fee?: number;
  booking_payment_id?: number | null;
  rejection_reason?: string | null;
  initial_meter_reading?: number | string | null;
  seconds_to_pay?: number | null;
  seconds_to_expire?: number | null;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  monthly_rent: number;
  created_at: string;
  room_id: number;
  contract_file_url?: string | null;
  slip_url?: string | null;
  room_number: string;
  floor: number;
  price: number;
  room_type: string;
  dorm_name: string;
  dorm_address: string;
  dorm_phone: string;
  first_bill_id?: number | null;
  first_bill_amount?: number | null;
  first_bill_status?: string | null;
  first_bill_due_date?: string | null;
  first_bill_slip_url?: string | null;
  first_bill_room_amount?: number | null;
  // Move-in (lib/moveIn.ts) — from the server
  move_in?: { rent: number; deposit: number; bookingFee: number; depositAtMoveIn: number; dueAtMoveIn: number };
  legacy?: boolean;
  move_in_bill_paid?: boolean;
  paper_uploaded?: boolean;
  paper_signed_date?: string | null;
  contract_file_is_pdf?: boolean;
  /** commit 28a: uploaded / missing / none (server) */
  signed_paper?: SignedPaper;
  /** commit 28-3: move-in inspection (step 4) */
  inspection_status?: 'none' | 'pending_ack' | 'acknowledged';
  /** commit 28-5: steps 1–7 (lib/booking-steps.ts), the same as on the owner's page */
  steps?: BookingSteps;
  print_url?: string;
  start_meter_photo_url?: string | null;
  start_meter_event_note?: string | null;
}

export default function GuestDashboardPage() {
  const { data: session, status: authStatus, update } = useSession();
  const router = useRouter();
  const { confirm } = useConfirm();

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [previewContractUrl, setPreviewContractUrl] = useState<string | null>(null);
  const [previewMeterPhotoUrl, setPreviewMeterPhotoUrl] = useState<string | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
  const [showDynamicQr, setShowDynamicQr] = useState(false);
  const [slipFile, setSlipFile] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchBookingStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/booking/status');
      const data = await res.json();
      if (data.success && data.data && data.data.length > 0) {
        setBooking(data.data[0]);
      } else {
        setBooking(null);
      }
    } catch (e) {
      console.error('Fetch booking error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/guest');
      return;
    }
    if (authStatus === 'authenticated') {
      fetchBookingStatus();
    }
  }, [authStatus, session, router]);

  // Handle Cancel Booking (Only allowed in 2.1.1)
  const handleCancelBooking = async () => {
    if (!booking) return;
    const confirmCancel = await confirm({
      title: 'ยืนยันยกเลิกการจองห้องพัก?',
      description: 'ค่าจองที่ชำระแล้วจะไม่คืน (เป็นไปตามเงื่อนไขการจอง) และห้องจะเปิดให้ผู้อื่นจองทันที',
      confirmText: 'ยืนยันยกเลิก',
      cancelText: 'ย้อนกลับ',
      variant: 'danger',
    });
    if (!confirmCancel) return;

    setCancelling(true);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: booking.contract_id, roomId: booking.room_id }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ ยกเลิกการจองเรียบร้อยแล้ว ห้องพักกลับสู่สถานะว่าง', 'success');
        setTimeout(() => fetchBookingStatus(), 1000);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการยกเลิก', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setCancelling(false);
    }
  };

  // Handle Pay First Bill
  const handlePayFirstBill = async () => {
    if (!booking) return;
    if (!slipFile) {
      showToast('กรุณาเลือกไฟล์สลิปการโอนเงินก่อนกดยืนยัน', 'error');
      return;
    }

    setPaying(true);
    try {
      const res = await fetch('/api/guest/pay-first-bill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: booking.contract_id,
          billId: booking.first_bill_id,
          slipUrl: slipFile,
        }),
      });
      const data = await res.json();
      if (data.success && data.activated) {
        showToast('🎉 ชำระเงินค่าแรกเข้าสำเร็จ! สัญญามีผลแล้ว กำลังปรับสถานะเป็นลูกหอ...', 'success');

        // Update NextAuth session to tenant
        await update({ role: 'tenant' });

        setTimeout(() => {
          router.push('/tenant');
        }, 1500);
      } else if (data.success) {
        // Paid; the contract takes effect once the dorm uploads the signed paper contract
        showToast(data.message, 'success');
        setShowSlipModal(false);
        window.location.reload();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการชำระเงิน', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setPaying(false);
    }
  };


  const isPendingContract = booking?.status === 'PendingContract' || booking?.status === 'PendingOwnerSignature';
  const isPendingFirstBill = booking?.status === 'PendingFirstBill';
  const isActive = booking?.status === 'Active';
  const isCancelled = booking?.status === 'Cancelled';
  const isRejected = booking?.status === 'Rejected' || (booking?.status === 'Cancelled' && booking?.rejection_reason?.includes('ปฏิเสธ'));
  // New approve-then-pay booking: followed (and paid) on /explore/booking-status
  const isOpenRequest = booking?.status === 'BookingRequested' || booking?.status === 'BookingApproved';
  const isExpired = booking?.status === 'Expired';

  // Move-in bill: amounts from the server (the room's figures), the bill itself once issued
  const roomPrice = Number(booking?.move_in?.rent ?? booking?.first_bill_room_amount ?? 0);
  const paidBookingDeposit = Number(booking?.move_in?.bookingFee ?? booking?.booking_fee ?? 0);
  const totalRequiredDeposit = Number(booking?.move_in?.deposit ?? 0);
  const extraDeposit = Number(booking?.move_in?.depositAtMoveIn ?? 0);
  const firstBillTotal = booking?.first_bill_amount !== undefined && booking?.first_bill_amount !== null
    ? Number(booking.first_bill_amount)
    : Number(booking?.move_in?.dueAtMoveIn ?? 0);
  const firstBillPaid = Boolean(booking?.move_in_bill_paid);
  // commit 28-5: a contract whose move-in bill was issued in the old order still needs the signed paper after paying
  const oldOrder = booking?.steps?.order === 'old';

  // /guest?pay=1 (from the booking status page): open the pay window once the move-in bill is shown
  useEffect(() => {
    if (!booking || booking.status !== 'PendingFirstBill' || booking.legacy || firstBillPaid) return;
    if (new URLSearchParams(window.location.search).get('pay') === '1') setShowSlipModal(true);
  }, [booking?.contract_id, booking?.status, firstBillPaid]); // eslint-disable-line react-hooks/exhaustive-deps

  // QR PromptPay states
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [qrError, setQrError] = useState('');

  const fetchPromptPayQR = async () => {
    if (!booking) return;
    setQrLoading(true);
    try {
      setQrError('');
      const res = await fetch(`/api/booking/qr?roomId=${booking.room_id}&contractId=${booking.contract_id}`);
      const data = await res.json();
      if (data.success && data.qrImage) {
        setQrCodeUrl(data.qrImage);
      } else {
        setQrCodeUrl(null);
        setQrError(data.message || 'ไม่สามารถโหลด QR Code ได้');
      }
    } catch (e) {
      console.error('Fetch PromptPay QR error:', e);
    } finally {
      setQrLoading(false);
    }
  };

  useEffect(() => {
    if (showSlipModal && booking) {
      fetchPromptPayQR();
    }
  }, [showSlipModal, booking, firstBillTotal]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 lg:p-12">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🛎️</span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">แดชบอร์ดผู้สนใจเช่าพัก (Guest Portal)</h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">ติดตามขั้นตอนการจองห้องพัก สัญญาเช่า และการชำระค่าแรกเข้า</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Link
              href="/guest/move-out/summary"
              className="px-3.5 py-1.5 rounded-full bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs"
            >
              <span>📜</span>
              <span>ประวัติการย้ายออก</span>
            </Link>
            <span className="px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-black">
              👤 {session?.user?.name || 'ผู้สนใจเช่า'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center bg-white border border-slate-200 rounded-3xl animate-pulse text-slate-500 font-bold shadow-xs">
            กำลังโหลดข้อมูลการจองของคุณ...
          </div>
        ) : isRejected ? (
          /* Rejected before payment (approve-then-pay): nothing was paid, nothing to refund */
          <div className="p-8 sm:p-10 bg-white border border-rose-200 rounded-3xl shadow-xs space-y-6">
            <div className="flex items-center gap-4 border-b border-slate-200 pb-5">
              <div className="w-14 h-14 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center text-3xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-xl font-black text-slate-900">คำขอจองห้องพักไม่ผ่านการอนุมัติ</h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  สาเหตุ: {booking?.rejection_reason || 'เจ้าของหอพักปฏิเสธคำขอจองห้องพัก'}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              คำขอจองถูกปฏิเสธก่อนขั้นตอนชำระค่าจอง จึงไม่มีการเรียกเก็บเงิน · หากมีข้อสงสัยกรุณาติดต่อหอพัก{booking?.dorm_phone ? ` โทร ${booking.dorm_phone}` : ''}
            </p>

            <div className="pt-2 flex justify-end">
              <Link
                href="/explore"
                className="px-6 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-2"
              >
                <span>🔍</span>
                <span>เลือกดูห้องพักอื่นที่เปิดว่าง</span>
              </Link>
            </div>
          </div>
        ) : isOpenRequest ? (
          <div className="p-8 sm:p-10 bg-white border border-amber-200 rounded-3xl shadow-xs space-y-4 text-center">
            <div className="text-4xl">{booking?.status === 'BookingApproved' ? '⏱' : '⏳'}</div>
            <h3 className="text-xl font-black text-slate-900">
              {booking?.status === 'BookingApproved' ? 'หอพักอนุมัติการจองแล้ว — กรุณาชำระค่าจองภายในเวลา' : 'ส่งคำขอจองแล้ว รอหอพักอนุมัติ'}
            </h3>
            <p className="text-sm text-slate-500">ห้อง {booking?.room_number} · ติดตามสถานะ นับถอยหลัง และชำระค่าจองได้ที่หน้าสถานะการจอง</p>
            <Link
              href="/explore/booking-status"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-black text-sm rounded-2xl shadow-xs transition-all"
            >
              <span>📋</span>
              <span>ไปหน้าสถานะการจอง</span>
            </Link>
          </div>
        ) : !booking || isCancelled || isExpired ? (
          <div className="p-12 sm:p-16 text-center bg-white border border-slate-200 rounded-3xl shadow-xs space-y-6">
            <div className="w-20 h-20 bg-amber-50 border border-amber-200 rounded-3xl flex items-center justify-center text-4xl mx-auto">
              🚪
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-2xl font-black text-slate-900">
                {isExpired ? 'การจองหมดเวลาแล้ว' : isCancelled ? 'การจองห้องพักถูกยกเลิกแล้ว' : 'คุณยังไม่มีรายการจองห้องพัก'}
              </h3>
              <p className="text-sm text-slate-500">
                {isExpired ? `ไม่ได้รับการอนุมัติหรือชำระค่าจองภายในเวลา ห้องเปิดให้จองใหม่แล้ว · หากโอนเงินแล้วกรุณาติดต่อหอพัก${booking?.dorm_phone ? ` โทร ${booking.dorm_phone}` : ''}` : isCancelled ? 'การจองถูกยกเลิกแล้ว · ค่าจองที่ชำระแล้ว (ถ้ามี) ไม่คืนตามเงื่อนไขการจอง · หากสนใจเช่าห้องพักใหม่สามารถเลือกดูห้องที่เปิดว่างได้ทันที' : 'ค้นหาและจองห้องพักคุณภาพดีใกล้มหาวิทยาลัยพะเยาได้ง่ายๆ พร้อมระบบสัญญาออนไลน์'}
              </p>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-black text-sm rounded-2xl shadow-xs transition-all hover:scale-105 active:scale-95"
            >
              <span>🔍</span>
              <span>เลือกดูห้องพักว่างที่เปิดให้จอง</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Room Details Card */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-3xl">
                    🚪
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-slate-900">ห้องพักหมายเลข {booking.room_number}</h2>
                    <p className="text-xs sm:text-sm text-slate-500">
                      {roomTypeLabel(booking.room_type)} • ชั้น {booking.floor || 1} • {booking.dorm_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border ${
                    isPendingContract ? 'bg-amber-50 border-amber-200 text-amber-800' :
                    isPendingFirstBill ? 'bg-blue-50 border-blue-200 text-blue-800' :
                    'bg-emerald-50 border-emerald-200 text-emerald-800'
                  }`}>
                    {isPendingContract ? '⏳ อยู่ระหว่างจัดทำสัญญา' :
                     isPendingFirstBill ? '📑 รอชำระค่าแรกเข้า' : '🟢 อนุมัติเข้าพักแล้ว'}
                  </span>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">ค่าเช่ารายเดือน</p>
                  <p className="text-xl font-black text-slate-900">฿{Number(roomPrice).toLocaleString()} <span className="text-xs font-normal text-slate-500">/เดือน</span></p>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">ค่าจอง (ที่จ่ายแล้ว)</p>
                  <p className="text-xl font-black text-emerald-700">฿{paidBookingDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">เงินประกันรวมเมื่อเข้าพัก</p>
                  <p className="text-xl font-black text-slate-900">฿{totalRequiredDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-500">(จ่ายเพิ่ม {extraDeposit.toLocaleString()})</span></p>
                </div>
              </div>

              {/* 2.1.2: Move-in bill + signed paper contract */}
              {isPendingFirstBill && booking.legacy && (
                <div className="p-6 bg-slate-50 border border-slate-200 rounded-2xl text-sm text-slate-600">
                  สัญญาแบบเดิม กรุณาติดต่อหอพัก{booking.dorm_phone ? ` โทร ${booking.dorm_phone}` : ''} เพื่อชำระค่าแรกเข้าและทำสัญญา
                </div>
              )}
              {isPendingFirstBill && !booking.legacy && (
                <div className="p-6 bg-slate-50 border border-blue-200 rounded-2xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-base font-black text-slate-900 flex items-center gap-2">
                        <span>📑 การ์ดสัญญาเช่าเพื่อรอการเข้าอยู่</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-800 text-[10px] font-bold border border-blue-200">
                          {firstBillPaid ? 'ชำระค่าแรกเข้าแล้ว' : 'รอชำระค่าแรกเข้า'}
                        </span>
                      </h4>
                      <p className="text-xs text-slate-500 mt-1">
                        {oldOrder ? 'สัญญามีผลเมื่อชำระบิลค่าแรกเข้าครบ และหอพักอัปโหลดสัญญาที่เซ็นบนกระดาษแล้ว' : 'สัญญาที่ลงนามอยู่ในระบบแล้ว · สัญญามีผลทันทีที่ชำระบิลนี้ครบ'}
                      </p>
                      <p className="text-xs mt-2 space-x-3">
                        <span className={firstBillPaid ? 'text-emerald-700 font-bold' : 'text-slate-500'}>{firstBillPaid ? '✓' : '○'} ชำระบิลค่าแรกเข้า</span>
                        <span className={booking.paper_uploaded ? 'text-emerald-700 font-bold' : 'text-slate-500'}>
                          {booking.paper_uploaded ? '✓' : '○'} สัญญาที่เซ็นแล้ว{booking.paper_signed_date ? ` (เซ็นวันที่ ${new Date(booking.paper_signed_date).toLocaleDateString('th-TH')})` : ''}
                        </span>
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {booking.print_url && (
                        <a
                          href={booking.print_url}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 transition-all flex items-center gap-1.5 shadow-xs"
                        >
                          <span>📥 ดาวน์โหลดสัญญา (PDF)</span>
                        </a>
                      )}
                      {booking.paper_uploaded && booking.contract_file_url && (
                        <button
                          onClick={() => setPreviewContractUrl(booking.contract_file_url || null)}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <span>🔍 สัญญาที่เซ็นแล้ว</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* First Bill Box */}
                  <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-3 shadow-xs">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                      <span>ค่าเช่าห้องพักเดือนแรก (เต็มเดือน):</span>
                      <span className="text-slate-900 font-mono font-black">฿{roomPrice.toLocaleString('th-TH')}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold text-slate-600">
                      <span>เงินประกันหอพักส่วนที่เหลือ (จ่ายเพิ่ม):</span>
                      <span className="text-slate-900 font-mono font-black">฿{extraDeposit.toLocaleString('th-TH')}</span>
                    </div>
                    {booking.initial_meter_reading !== undefined && booking.initial_meter_reading !== null && (
                      <div className="space-y-1.5">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center text-xs font-bold text-amber-800 bg-amber-50 p-2.5 rounded-lg border border-amber-200 gap-2">
                          <span className="flex items-center gap-1.5">
                            <span>⚡</span>
                            <span>เลขมิเตอร์ไฟฟ้าเริ่มต้น ณ วันส่งมอบ:</span>
                          </span>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-black text-sm text-slate-900">{Number(booking.initial_meter_reading).toLocaleString('th-TH', { minimumFractionDigits: 2 })} หน่วย</span>
                            {booking.start_meter_photo_url && (
                              <button
                                type="button"
                                onClick={() => setPreviewMeterPhotoUrl(booking.start_meter_photo_url || null)}
                                className="px-2 py-0.5 bg-white text-amber-900 rounded border border-amber-300 text-[10px] font-bold hover:bg-amber-100 cursor-pointer shadow-2xs"
                              >
                                🔍 ดูภาพถ่ายหน้าปัด
                              </button>
                            )}
                            {booking.start_meter_event_note && !booking.start_meter_photo_url && (
                              <span className="px-2 py-0.5 bg-sky-100 text-sky-900 rounded border border-sky-300 text-[10px] font-bold">
                                ✓ Smart Meter IoT
                              </span>
                            )}
                          </div>
                        </div>
                        {booking.start_meter_event_note && !booking.start_meter_photo_url && (
                          <div className="text-[10px] text-sky-800 bg-sky-50 px-2.5 py-1.5 rounded-lg border border-sky-200 font-medium">
                            ⚡ {booking.start_meter_event_note}
                          </div>
                        )}
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex justify-between items-center">
                      <div>
                        <span className="text-sm font-black text-slate-900">ยอดชำระบิลค่าแรกเข้ารวม:</span>
                        <p className="text-[10px] text-slate-500">(รวมค่าจองที่ชำระแล้ว ฿{paidBookingDeposit.toLocaleString('th-TH')} = ประกันรวม ฿{totalRequiredDeposit.toLocaleString('th-TH')})</p>
                      </div>
                      <span className="text-2xl font-black text-emerald-700 font-mono">฿{firstBillTotal.toLocaleString('th-TH')}</span>
                    </div>
                    {!firstBillPaid && booking.first_bill_due_date && (
                      <p className="text-[11px] text-amber-800 font-bold">
                        ชำระภายในวันเริ่มสัญญา {new Date(booking.first_bill_due_date).toLocaleDateString('th-TH')} — หากไม่ชำระ สัญญาจะถูกยกเลิกและค่าจองไม่คืน
                      </p>
                    )}
                  </div>

                  {firstBillPaid ? (
                    <p className="text-xs text-emerald-700 font-bold">
                      ✓ ชำระค่าแรกเข้าแล้ว {booking.paper_uploaded ? '— สัญญามีผลแล้ว (รีเฟรชหน้านี้เพื่อเข้าหน้าผู้เช่า)' : '— รอหอพักอัปโหลดสัญญาที่เซ็นแล้ว'}
                    </p>
                  ) : (
                    <div className="flex flex-col sm:flex-row gap-3">
                      <button
                        onClick={() => setShowDynamicQr(true)}
                        className="flex-1 py-4 bg-primary hover:bg-primary/90 text-white font-black text-sm rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>💳</span>
                        <span>ชำระเงิน (฿{firstBillTotal.toLocaleString('th-TH')})</span>
                      </button>
                      <button
                        onClick={() => setShowSlipModal(true)}
                        className="py-3 sm:py-4 px-5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-bold text-xs sm:text-sm rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-xs"
                      >
                        <span>📎</span>
                        <span>แนบสลิป</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Actions & Cancel Button (Cancel only visible in 2.1.1) */}
              <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-slate-500">
                  {isPendingContract && '📌 ในขั้นตอนนี้ คุณสามารถยกเลิกการจองได้ (ค่าจองที่ชำระแล้วไม่คืนตามเงื่อนไขการจอง)'}
                  {isPendingFirstBill && !booking.legacy && (oldOrder ? 'ℹ️ เมื่อชำระค่าแรกเข้าครบและหอพักอัปโหลดสัญญาที่เซ็นแล้ว ระบบจะปรับสถานะเป็นลูกหออัตโนมัติ' : 'ℹ️ เมื่อชำระค่าแรกเข้าครบ ระบบจะปรับสถานะเป็นลูกหอทันที')}
                </div>

                {isPendingContract && (
                  <button
                    onClick={handleCancelBooking}
                    disabled={cancelling}
                    className="px-6 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-bold text-xs rounded-xl shadow-xs transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                  >
                    {cancelling ? 'กำลังยกเลิก...' : '❌ ยกเลิกการจองห้องพัก'}
                  </button>
                )}
              </div>
            </div>

            {/* Steps 1–4 — where the booking is, what is next, who does it (commit 28-5, same as the owner's page) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-primary">ความคืบหน้า: จองจนเป็นลูกหอ (4 ขั้น)</h3>
                {booking.steps && <StepBadge steps={booking.steps} />}
              </div>
              {isActive ? (
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-sm font-bold text-emerald-800 flex flex-wrap items-center justify-between gap-3">
                  <span>🎉 สัญญามีผลแล้ว — คุณเป็นลูกหอแล้ว</span>
                  <Link href="/tenant" className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors">ไปหน้าผู้เช่า</Link>
                </div>
              ) : booking.steps && (
                <>
                  <StepChecklist steps={booking.steps} viewer="booker" />
                  <NextStepLine steps={booking.steps} viewer="booker" />
                  <p className="text-xs text-slate-500">{BECOME_TENANT_TEXT}</p>
                </>
              )}
              {booking?.booking_payment_id && (
                <a href={`/receipt/${booking.booking_payment_id}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold text-primary hover:underline">
                  🧾 ใบเสร็จค่าจอง
                </a>
              )}
            </div>

            {/* Step 3 — the booker acknowledges the move-in inspection here (before the contract takes effect) */}
            {(isPendingContract || isPendingFirstBill) && booking.inspection_status && booking.inspection_status !== 'none' && (
              <div className="space-y-2">
                <p className="text-xs font-black text-slate-900">ขั้น 3 · ผลตรวจสภาพห้องก่อนเข้าพัก</p>
                <TenantInspectionCard contractId={booking.contract_id} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Contract Preview Modal */}
      {previewContractUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center text-lg border border-blue-200">
                  📑
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">เอกสารสัญญาเช่า (ห้อง {booking?.room_number})</h3>
                  <p className="text-[11px] text-slate-500">หอพักเกษร 2 • ตรวจสอบข้อตกลงและเงื่อนไขการเช่า</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewContractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200"
                >
                  ↗️ เปิดเต็มจอ
                </a>
                <button
                  onClick={() => setPreviewContractUrl(null)}
                  className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100 p-2 overflow-hidden">
              {previewContractUrl.toLowerCase().endsWith('.pdf')
                || (previewContractUrl === booking?.contract_file_url && booking?.contract_file_is_pdf) ? (
                <iframe
                  src={`${previewContractUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full h-full rounded-2xl border border-slate-200 bg-white"
                  title="Contract PDF Viewer"
                />
              ) : (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                  <img
                    src={previewContractUrl}
                    alt="Signed Contract"
                    className="max-w-full max-h-full object-contain rounded-xl shadow-md"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Starting Meter Proof Modal */}
      {previewMeterPhotoUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">หลักฐานภาพถ่ายหน้าปัดมิเตอร์เริ่มต้น</h3>
              <button
                onClick={() => setPreviewMeterPhotoUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative min-h-[300px] max-h-[70vh] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col items-center justify-center p-2">
              <img
                src={previewMeterPhotoUrl}
                alt="Starting Meter Dial"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-xs"
              />
              <div className="mt-3">
                <a
                  href={previewMeterPhotoUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>🔍</span>
                  <span>เปิดดูภาพขนาดเต็ม</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Pay First Bill Modal */}
      {showSlipModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-slate-200">
              <div>
                <h3 className="text-lg font-black text-slate-900">ชำระค่าแรกเข้า (ห้อง {booking?.room_number})</h3>
                <p className="text-xs text-slate-500 mt-0.5">หอพักเกษร 2 • พร้อมเพย์มาตรฐาน</p>
              </div>
              <button
                onClick={() => setShowSlipModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3 text-center">
              <p className="text-xs text-slate-500">สแกนชำระผ่าน PromptPay (ยอดตรงกับระบบ)</p>
              <p className="text-3xl font-black text-emerald-700 font-mono">฿{firstBillTotal.toLocaleString()}</p>
              
              <div className="w-52 h-52 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center shadow-xs border border-slate-200">
                {qrLoading ? (
                  <div className="text-xs text-slate-500 animate-pulse font-bold">กำลังสร้าง QR Code...</div>
                ) : qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="PromptPay QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-rose-500 font-bold p-2 text-center">{qrError || 'ไม่สามารถโหลด QR Code ได้'}</div>
                )}
              </div>
              <p className="text-[11px] text-slate-500 font-mono">สามารถใช้แอปธนาคารทุกแห่งสแกนชำระ ฿{firstBillTotal.toLocaleString()} ได้ทันที</p>
            </div>

            {/* Slip Upload Option */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-700">แนบสลิปการโอนเงิน (ถ้ามี):</label>
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = () => setSlipFile(reader.result as string);
                    reader.readAsDataURL(file);
                  }
                }}
                className="w-full text-xs text-slate-600 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer bg-white p-2 rounded-xl border border-slate-300 shadow-xs"
              />
              {slipFile && (
                <p className="text-[11px] text-emerald-700 font-bold">✓ แนบสลิปเรียบร้อยแล้ว</p>
              )}
            </div>

            <button
              onClick={handlePayFirstBill}
              disabled={paying || !slipFile}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {paying ? 'กำลังตรวจสอบสลิปผ่าน SlipOK...' : '✅ ยืนยันชำระเงินและย้ายเข้าพัก'}
            </button>
          </div>
        </div>
      )}

      {/* Dynamic PromptPay QR Modal (Real-time Instant Auto Detection) */}
      <DynamicBillQrModal
        isOpen={showDynamicQr}
        onClose={() => {
          setShowDynamicQr(false);
          fetchBookingStatus();
        }}
        billId={booking?.first_bill_id}
        roomNumber={booking?.room_number || '104'}
        tenantName={session?.user?.name || 'ผู้เข้าพัก'}
        billTitle={`ค่าแรกเข้าห้อง ${booking?.room_number || ''}`}
        amount={firstBillTotal || 1}
        enableSatang={true}
        onPaid={async () => {
          showToast('ชำระค่าแรกเข้าเรียบร้อยแล้ว!', 'success');
          await fetchBookingStatus();
          if (update) await update();
          router.refresh();
        }}
        onSwitchToSlip={() => {
          setShowDynamicQr(false);
          setShowSlipModal(true);
        }}
      />
    </div>
  );
}
