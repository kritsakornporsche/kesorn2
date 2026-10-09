'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';

interface BookingData {
  contract_id: number;
  status: string;
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
}

export default function GuestDashboardPage() {
  const { data: session, status: authStatus, update } = useSession();
  const router = useRouter();

  const [booking, setBooking] = useState<BookingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [paying, setPaying] = useState(false);
  const [previewContractUrl, setPreviewContractUrl] = useState<string | null>(null);
  const [showSlipModal, setShowSlipModal] = useState(false);
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
      const userRole = (session?.user as any)?.role;
      if (userRole === 'tenant') {
        router.push('/tenant');
        return;
      }
      fetchBookingStatus();
    }
  }, [authStatus, session, router]);

  // Handle Cancel Booking (Only allowed in 2.1.1)
  const handleCancelBooking = async () => {
    if (!booking) return;
    const confirmCancel = confirm(
      '⚠️ ยืนยันการยกเลิกการจองห้องพัก?\n\nหมายเหตุ: การยกเลิกจะไม่ได้รับเงินมัดจำคืน และห้องพักจะถูกปรับเป็นสถานะว่างทันที'
    );
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
      if (data.success) {
        showToast('🎉 ชำระเงินค่าแรกเข้าสำเร็จ! กำลังปรับสถานะเป็นลูกหอ...', 'success');
        
        // Update NextAuth session to tenant
        await update({ role: 'tenant' });

        setTimeout(() => {
          router.push('/tenant');
        }, 1500);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการชำระเงิน', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setPaying(false);
    }
  };

  const [showPromptPayModal, setShowPromptPayModal] = useState(false);
  const [promptPayNum, setPromptPayNum] = useState('');
  const [bankName, setBankName] = useState('พร้อมเพย์ (PromptPay)');
  const [accountName, setAccountName] = useState('');
  const [submittingPromptPay, setSubmittingPromptPay] = useState(false);
  const [promptPaySaved, setPromptPaySaved] = useState(false);

  const isPendingContract = booking?.status === 'PendingContract' || booking?.status === 'PendingOwnerSignature';
  const isPendingFirstBill = booking?.status === 'PendingFirstBill';
  const isActive = booking?.status === 'Active';
  const isCancelled = booking?.status === 'Cancelled';
  const isRejected = booking?.status === 'Rejected' || (booking?.status === 'Cancelled' && booking?.rejection_reason?.includes('ปฏิเสธ'));

  // First bill calculation: Use actual bill amount from DB if available, else roomPrice + extraDeposit
  const isTestBooking = (booking?.room_number || '').toUpperCase() === 'T01';
  const roomPrice = Number(booking?.price || booking?.monthly_rent || (isTestBooking ? 10 : 3400));
  const paidBookingDeposit = isTestBooking ? 1 : Number(booking?.deposit_amount || 1000);
  const totalRequiredDeposit = isTestBooking ? 20 : 3000;
  const extraDeposit = Math.max(0, totalRequiredDeposit - paidBookingDeposit);
  const firstBillTotal = booking?.first_bill_amount !== undefined && booking?.first_bill_amount !== null
    ? Number(booking.first_bill_amount)
    : (roomPrice + extraDeposit);

  // QR PromptPay states
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const fetchPromptPayQR = async () => {
    if (!booking) return;
    setQrLoading(true);
    try {
      const res = await fetch(`/api/booking/qr?roomId=${booking.room_id}&amount=${firstBillTotal}`);
      const data = await res.json();
      if (data.success && data.qrImage) {
        setQrCodeUrl(data.qrImage);
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

  // Handle PromptPay Refund Submit (Rule 2.1.5)
  const handlePromptPaySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!booking) return;
    setSubmittingPromptPay(true);
    try {
      const res = await fetch('/api/booking/refund-promptpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: booking.contract_id,
          promptpayNumber: promptPayNum,
          bankName,
          accountName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ บันทึกข้อมูลรับเงินมัดจำคืน 1,000 บาท เรียบร้อยแล้ว', 'success');
        setPromptPaySaved(true);
        setShowPromptPayModal(false);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSubmittingPromptPay(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-12">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 ${
          toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
          <div>
            <div className="flex items-center gap-3">
              <span className="text-3xl">🛎️</span>
              <div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">แดชบอร์ดผู้สนใจเช่าพัก (Guest Portal)</h1>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5">ติดตามขั้นตอนการจองห้องพัก สัญญาเช่า และการชำระค่าแรกเข้า</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 self-start sm:self-auto">
            <Link
              href="/guest/move-out/summary"
              className="px-3.5 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5"
            >
              <span>📜</span>
              <span>ประวัติการย้ายออก</span>
            </Link>
            <span className="px-3.5 py-1.5 rounded-full bg-primary/10 border border-primary/30 text-primary text-xs font-black">
              👤 {session?.user?.name || 'ผู้สนใจเช่า'}
            </span>
          </div>
        </div>

        {loading ? (
          <div className="p-16 text-center bg-slate-900/50 border border-white/10 rounded-3xl animate-pulse text-slate-400 font-bold">
            กำลังโหลดข้อมูลการจองของคุณ...
          </div>
        ) : isRejected ? (
          /* 2.1.5 (ถูกปฏิเสธการจองจากเจ้าของหอ): ให้กรอกเลขพร้อมเพย์เพื่อให้เจ้าของหอชดเชยค่ามัดจำคืน */
          <div className="p-8 sm:p-10 bg-slate-900/90 border border-rose-500/30 rounded-3xl shadow-2xl space-y-6">
            <div className="flex items-center gap-4 border-b border-white/10 pb-5">
              <div className="w-14 h-14 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center justify-center text-3xl">
                ⚠️
              </div>
              <div>
                <h3 className="text-xl font-black text-white">คำขอจองห้องพักไม่ผ่านการอนุมัติ (2.1.5)</h3>
                <p className="text-xs text-rose-300 mt-0.5">
                  สาเหตุ: {booking?.rejection_reason || 'เจ้าของหอพักปฏิเสธคำขอจองห้องพัก'}
                </p>
              </div>
            </div>

            <div className="p-5 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3">
              <h4 className="text-sm font-black text-amber-300 flex items-center gap-2">
                <span>💰</span>
                <span>การขอรับเงินมัดจำคืน (1,000 บาท)</span>
              </h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                เนื่องจากคำขอจองห้องพักไม่ผ่านการอนุมัติจากทางหอพัก ท่านมีสิทธิ์ได้รับเงินมัดจำการจองจำนวน <strong>1,000 บาท</strong> คืนเต็มจำนวน กรุณาระบุข้อมูลพร้อมเพย์หรือเลขที่บัญชีเพื่อให้เจ้าของหอพักโอนเงินชดเชยคืนให้ท่าน
              </p>

              {promptPaySaved ? (
                <div className="p-4 bg-emerald-950/60 border border-emerald-500/40 rounded-xl text-emerald-200 text-xs font-bold flex items-center gap-2">
                  <span>✅</span>
                  <span>บันทึกข้อมูลพร้อมเพย์เรียบร้อยแล้ว รอเจ้าของหอพักตรวจสอบและดำเนินการโอนเงินคืน</span>
                </div>
              ) : (
                <form onSubmit={handlePromptPaySubmit} className="pt-2 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        หมายเลขพร้อมเพย์ (เบอร์โทร/เลขบัตรประชาชน) *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="08X-XXX-XXXX หรือ 1XXXXXXXXXXXX"
                        value={promptPayNum}
                        onChange={(e) => setPromptPayNum(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">
                        ชื่อบัญชีผู้รับโอน *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="ชื่อ-นามสกุล"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        className="w-full px-4 py-2.5 bg-slate-900 border border-white/10 rounded-xl text-sm font-bold text-white focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={submittingPromptPay}
                    className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50"
                  >
                    {submittingPromptPay ? 'กำลังบันทึกข้อมูล...' : '💾 บันทึกข้อมูลเพื่อรับเงินมัดจำคืน (1,000 บ.)'}
                  </button>
                </form>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Link
                href="/explore"
                className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-2"
              >
                <span>🔍</span>
                <span>เลือกดูห้องพักอื่นที่เปิดว่าง</span>
              </Link>
            </div>
          </div>
        ) : !booking || isCancelled ? (
          <div className="p-12 sm:p-16 text-center bg-slate-900/60 border border-white/10 rounded-3xl shadow-2xl space-y-6">
            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-3xl flex items-center justify-center text-4xl mx-auto">
              🚪
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h3 className="text-2xl font-black text-white">
                {isCancelled ? 'การจองห้องพักถูกยกเลิกแล้ว' : 'คุณยังไม่มีรายการจองห้องพัก'}
              </h3>
              <p className="text-sm text-slate-400">
                {isCancelled ? 'คุณได้ยกเลิกการจองห้องพักเรียบร้อยแล้ว (ไม่คืนเงินมัดจำ) หากสนใจเช่าห้องพักใหม่สามารถเลือกดูห้องที่เปิดว่างได้ทันที' : 'ค้นหาและจองห้องพักคุณภาพดีใกล้มหาวิทยาลัยพะเยาได้ง่ายๆ พร้อมระบบสัญญาออนไลน์'}
              </p>
            </div>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-black text-sm rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95"
            >
              <span>🔍</span>
              <span>เลือกดูห้องพักว่างที่เปิดให้จอง</span>
            </Link>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Step Progress Indicator (3 Steps) */}
            <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-xl">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary mb-6">ความคืบหน้าการจอง (Booking Pipeline)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative">
                {/* Step 1 */}
                <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isPendingContract ? 'bg-amber-500/10 border-amber-500/40 text-white shadow-lg' : 'bg-slate-950/60 border-white/5 text-slate-400'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center font-black text-sm">1</span>
                    <span className="font-black text-sm">จองสำเร็จ</span>
                  </div>
                  <p className="text-xs text-slate-400">โอนมัดจำ 1,000 บาทแล้ว รอเจ้าของหอจัดทำสัญญา</p>
                </div>

                {/* Step 2 */}
                <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isPendingFirstBill ? 'bg-blue-500/10 border-blue-500/40 text-white shadow-lg' : 'bg-slate-950/60 border-white/5 text-slate-400'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center font-black text-sm">2</span>
                    <span className="font-black text-sm">ทำสัญญาสำเร็จ</span>
                  </div>
                  <p className="text-xs text-slate-400">เจ้าของแนบสัญญาแล้ว อยู่ระหว่างชำระค่าแรกเข้า</p>
                </div>

                {/* Step 3 */}
                <div className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                  isActive ? 'bg-emerald-500/10 border-emerald-500/40 text-white shadow-lg' : 'bg-slate-950/60 border-white/5 text-slate-400'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-black text-sm">3</span>
                    <span className="font-black text-sm">กำลังเข้าอยู่อาศัย</span>
                  </div>
                  <p className="text-xs text-slate-400">ชำระค่าแรกเข้าสำเร็จ ปรับเป็นลูกหอสมบูรณ์</p>
                </div>
              </div>
            </div>

            {/* Room Details Card */}
            <div className="bg-slate-900/80 border border-white/10 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center text-3xl">
                    🚪
                  </div>
                  <div>
                    <h2 className="text-2xl font-black text-white">ห้องพักหมายเลข {booking.room_number}</h2>
                    <p className="text-xs sm:text-sm text-slate-400">
                      {booking.room_type || 'ห้องพักมาตรฐาน'} • ชั้น {booking.floor || 1} • {booking.dorm_name}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border ${
                    isPendingContract ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' :
                    isPendingFirstBill ? 'bg-blue-500/10 border-blue-500/30 text-blue-400' :
                    'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  }`}>
                    {isPendingContract ? '⏳ อยู่ระหว่างจัดทำสัญญา' :
                     isPendingFirstBill ? '📑 รอชำระค่าแรกเข้า' : '🟢 อนุมัติเข้าพักแล้ว'}
                  </span>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-slate-950/60 p-5 rounded-2xl border border-white/5 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ค่าเช่ารายเดือน</p>
                  <p className="text-xl font-black text-white">฿{Number(roomPrice).toLocaleString()} <span className="text-xs font-normal text-slate-400">/เดือน</span></p>
                </div>

                <div className="bg-slate-950/60 p-5 rounded-2xl border border-white/5 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">เงินมัดจำการจอง (ที่จ่ายแล้ว)</p>
                  <p className="text-xl font-black text-emerald-400">฿{paidBookingDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>

                <div className="bg-slate-950/60 p-5 rounded-2xl border border-white/5 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">เงินประกันรวมเมื่อเข้าพัก</p>
                  <p className="text-xl font-black text-blue-400">฿{totalRequiredDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} <span className="text-xs font-normal text-slate-400">(จ่ายเพิ่ม {extraDeposit.toLocaleString()})</span></p>
                </div>
              </div>

              {/* 2.1.2: Waiting Lease Contract Attachment Card */}
              {isPendingFirstBill && (
                <div className="p-6 bg-blue-950/20 border border-blue-500/30 rounded-2xl space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-base font-black text-white flex items-center gap-2">
                        <span>📑 การ์ดสัญญาเช่าเพื่อรอการเข้าอยู่</span>
                        <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-bold">รอชำระค่าแรกเข้า</span>
                      </h4>
                      <p className="text-xs text-slate-400 mt-1">เจ้าของหอพักได้อัปโหลดเอกสารสัญญาเช่าฉบับจริงแล้ว คุณสามารถกดดูตัวอย่างหรือดาวน์โหลดเพื่อตรวจทานเงื่อนไขได้</p>
                    </div>

                    {booking.contract_file_url && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setPreviewContractUrl(booking.contract_file_url || null)}
                          className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
                        >
                          <span>🔍 ดูตัวอย่างสัญญา</span>
                        </button>
                        <a
                          href={booking.contract_file_url}
                          download={`contract_room_${booking.room_number}`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
                        >
                          <span>📥 ดาวน์โหลด</span>
                        </a>
                      </div>
                    )}
                  </div>

                  {/* First Bill Box */}
                  <div className="p-5 bg-slate-950/80 border border-white/10 rounded-xl space-y-3">
                    <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                      <span>ค่าเช่าห้องพักเดือนแรก:</span>
                      <span className="text-white font-mono font-black">฿{roomPrice.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs font-bold text-slate-300">
                      <span>เงินประกันหอพักส่วนที่เหลือ (จ่ายเพิ่ม):</span>
                      <span className="text-white font-mono font-black">฿{extraDeposit.toLocaleString()}</span>
                    </div>
                    {booking.initial_meter_reading !== undefined && booking.initial_meter_reading !== null && (
                      <div className="flex justify-between items-center text-xs font-bold text-amber-300 bg-amber-500/10 p-2.5 rounded-lg border border-amber-500/20">
                        <span className="flex items-center gap-1.5">
                          <span>⚡</span>
                          <span>เลขมิเตอร์ไฟฟ้าเริ่มต้น ณ วันส่งมอบ:</span>
                        </span>
                        <span className="font-mono font-black text-sm text-white">{Number(booking.initial_meter_reading).toLocaleString()} หน่วย</span>
                      </div>
                    )}
                    <div className="pt-2 border-t border-white/10 flex justify-between items-center">
                      <div>
                        <span className="text-sm font-black text-white">ยอดชำระบิลค่าแรกเข้ารวม:</span>
                        <p className="text-[10px] text-slate-400">(รวมเงินมัดจำเดิม {paidBookingDeposit.toLocaleString()} = ประกันรวม {totalRequiredDeposit.toLocaleString()} บาท)</p>
                      </div>
                      <span className="text-2xl font-black text-emerald-400 font-mono">฿{firstBillTotal.toLocaleString()}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setShowSlipModal(true)}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl shadow-xl transition-all flex items-center justify-center gap-2 hover:brightness-110 active:scale-95"
                  >
                    <span>💳 ชำระบิลค่าแรกเข้า (฿{firstBillTotal.toLocaleString()})</span>
                  </button>
                </div>
              )}

              {/* Actions & Cancel Button (Cancel only visible in 2.1.1) */}
              <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="text-xs text-slate-400">
                  {isPendingContract && '📌 ในขั้นตอนนี้ คุณสามารถยกเลิกการจองได้ (ไม่คืนเงินมัดจำ 1,000 บาท)'}
                  {isPendingFirstBill && 'ℹ️ เมื่อชำระค่าแรกเข้าเรียบร้อย ระบบจะปรับสถานะเข้าสู่ระบบลูกหออัตโนมัติ'}
                </div>

                {isPendingContract && (
                  <button
                    onClick={handleCancelBooking}
                    disabled={cancelling}
                    className="px-6 py-3 bg-rose-600/10 hover:bg-rose-600 text-rose-400 hover:text-white border border-rose-500/30 font-bold text-xs rounded-xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    {cancelling ? 'กำลังยกเลิก...' : '❌ ยกเลิกการจองห้องพัก'}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Contract Preview Modal */}
      {previewContractUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="p-4 sm:p-5 border-b border-white/10 flex justify-between items-center bg-slate-950">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center text-lg">
                  📑
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">เอกสารสัญญาเช่า (ห้อง {booking?.room_number})</h3>
                  <p className="text-[11px] text-slate-400">หอพักเกษร 2 • ตรวจสอบข้อตกลงและเงื่อนไขการเช่า</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={previewContractUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all"
                >
                  ↗️ เปิดเต็มจอ
                </a>
                <button
                  onClick={() => setPreviewContractUrl(null)}
                  className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
                >
                  ✕
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-950 p-2 overflow-hidden">
              {previewContractUrl.toLowerCase().endsWith('.pdf') || previewContractUrl.includes('/api/contracts/export-pdf') ? (
                <iframe
                  src={`${previewContractUrl}#toolbar=1&navpanes=0&scrollbar=1`}
                  className="w-full h-full rounded-2xl border border-white/5 bg-white"
                  title="Contract PDF Viewer"
                />
              ) : (
                <div className="w-full h-full overflow-auto flex items-center justify-center p-4">
                  <img
                    src={previewContractUrl}
                    alt="Signed Contract"
                    className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pay First Bill Modal */}
      {showSlipModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white">ชำระค่าแรกเข้า (ห้อง {booking?.room_number})</h3>
                <p className="text-xs text-slate-400 mt-0.5">หอพักเกษร 2 • พร้อมเพย์มาตรฐาน</p>
              </div>
              <button
                onClick={() => setShowSlipModal(false)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="bg-slate-950 p-5 rounded-2xl border border-white/5 space-y-3 text-center">
              <p className="text-xs text-slate-400">สแกนชำระผ่าน PromptPay (ยอดตรงกับระบบ)</p>
              <p className="text-3xl font-black text-emerald-400 font-mono">฿{firstBillTotal.toLocaleString()}</p>
              
              <div className="w-52 h-52 bg-white p-3 rounded-2xl mx-auto flex items-center justify-center shadow-lg">
                {qrLoading ? (
                  <div className="text-xs text-slate-500 animate-pulse font-bold">กำลังสร้าง QR Code...</div>
                ) : qrCodeUrl ? (
                  <img
                    src={qrCodeUrl}
                    alt="PromptPay QR Code"
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="text-xs text-rose-500 font-bold">ไม่สามารถโหลด QR Code ได้</div>
                )}
              </div>
              <p className="text-[11px] text-slate-400 font-mono">สามารถใช้แอปธนาคารทุกแห่งสแกนชำระ ฿{firstBillTotal.toLocaleString()} ได้ทันที</p>
            </div>

            {/* Slip Upload Option */}
            <div className="space-y-2">
              <label className="block text-xs font-bold text-slate-300">แนบสลิปการโอนเงิน (ถ้ามี):</label>
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
                className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer bg-slate-950 p-2 rounded-xl border border-white/10"
              />
              {slipFile && (
                <p className="text-[11px] text-emerald-400 font-bold">✓ แนบสลิปเรียบร้อยแล้ว</p>
              )}
            </div>

            <button
              onClick={handlePayFirstBill}
              disabled={paying || !slipFile}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-sm rounded-xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed active:scale-95"
            >
              {paying ? 'กำลังตรวจสอบสลิปผ่าน SlipOK...' : '✅ ยืนยันชำระเงินและย้ายเข้าพัก'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
