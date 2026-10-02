'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface Booking {
  contract_id: number;
  tenant_id: number;
  room_id: number;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  booking_status: string;
  slip_url: string | null;
  contract_file_url?: string | null;
  id_card_number?: string | null;
  tenant_address?: string | null;
  id_card_image?: string | null;
  parent_phone?: string | null;
  booking_created_at: string;
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  room_number: string;
  room_type: string;
  floor: number;
  monthly_rent: number;
  room_status: string;
  first_bill_id?: number | null;
  first_bill_title?: string | null;
  first_bill_amount?: number | null;
  first_bill_status?: string | null;
  first_bill_due_date?: string | null;
  first_bill_created_at?: string | null;
}

export default function OwnerBookingsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter tabs: 8.1 PendingContract, 8.2 PendingFirstBill, 8.3 Active, 8.4 Cancelled, All
  const [activeTab, setActiveTab] = useState<'8.1' | '8.2' | '8.3' | '8.4' | 'ALL'>('8.1');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [previewContractModal, setPreviewContractModal] = useState<Booking | null>(null);
  const [previewBillModal, setPreviewBillModal] = useState<Booking | null>(null);
  const [uploadContractBooking, setUploadContractBooking] = useState<Booking | null>(null);
  const [contractFile, setContractFile] = useState<string | null>(null);
  const [initialMeterReading, setInitialMeterReading] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchBookings = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/bookings');
      const data = await res.json();
      if (data.success) {
        setBookings(data.data || []);
      }
    } catch (e) {
      console.error('Fetch bookings error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/bookings');
      return;
    }
    fetchBookings();
  }, [authStatus, router]);

  // Handle Owner Upload Contract & Create First Bill
  const handleUploadContract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadContractBooking || !contractFile) {
      alert('กรุณาเลือกไฟล์สัญญาเช่า');
      return;
    }

    setUploading(true);
    try {
      const isTestBooking = (uploadContractBooking.room_number || '').toUpperCase() === 'T01';
      const totalDeposit = isTestBooking ? 20 : 3000;
      const paidBooking = isTestBooking ? 1 : Number(uploadContractBooking.deposit_amount || 1000);
      const extraDeposit = Math.max(0, totalDeposit - paidBooking);

      const res = await fetch('/api/owner/contracts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: uploadContractBooking.contract_id,
          contract_file_url: contractFile,
          status: 'PendingFirstBill', // Move to 8.2 / 2.1.2
          create_first_bill: true,
          monthly_rent: uploadContractBooking.monthly_rent || (isTestBooking ? 10 : 3400),
          deposit_extra: extraDeposit,
          initial_meter_reading: initialMeterReading ? parseFloat(initialMeterReading) : null,
        }),
      });

      const data = await res.json();
      if (data.success) {
        showToast('✅ อัปโหลดสัญญาและส่งบิลค่าแรกเข้าพร้อมบันทึกมิเตอร์เริ่มต้นเรียบร้อยแล้ว!', 'success');
        setUploadContractBooking(null);
        setContractFile(null);
        setInitialMeterReading('');
        fetchBookings();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึกสัญญา', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  const filteredBookings = bookings.filter((b) => {
    // Tab filter
    if (activeTab === '8.1') {
      if (b.booking_status !== 'PendingContract' && b.booking_status !== 'PendingOwnerSignature') return false;
    } else if (activeTab === '8.2') {
      if (b.booking_status !== 'PendingFirstBill') return false;
    } else if (activeTab === '8.3') {
      if (b.booking_status !== 'Active') return false;
    } else if (activeTab === '8.4') {
      if (b.booking_status !== 'Cancelled') return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = b.room_number?.toLowerCase().includes(q);
      const matchName = b.guest_name?.toLowerCase().includes(q);
      const matchPhone = b.guest_phone?.toLowerCase().includes(q);
      if (!matchRoom && !matchName && !matchPhone) return false;
    }

    return true;
  });

  const count81 = bookings.filter((b) => b.booking_status === 'PendingContract' || b.booking_status === 'PendingOwnerSignature').length;
  const count82 = bookings.filter((b) => b.booking_status === 'PendingFirstBill').length;
  const count83 = bookings.filter((b) => b.booking_status === 'Active').length;
  const count84 = bookings.filter((b) => b.booking_status === 'Cancelled').length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-10 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 ${
          toast.type === 'success' ? 'bg-emerald-950/90 border-emerald-500/50 text-emerald-200' : 'bg-rose-950/90 border-rose-500/50 text-rose-200'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔔</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">รายการจองห้องพัก (Booking Pipeline)</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">จัดการกระบวนการจอง 3 ระดับ: ชำระมัดจำ ➔ ทำสัญญา/บิลแรกเข้า ➔ เข้าพักสมบูรณ์</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBookings}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-2"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-slate-900/80 p-4 rounded-2xl border border-white/10 shadow-xl">
        {/* Horizontal Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('8.1')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '8.1' ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🟡 8.1 ชำระมัดจำแล้ว รอทำสัญญา</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{count81}</span>
          </button>

          <button
            onClick={() => setActiveTab('8.2')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '8.2' ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🔵 8.2 ทำสัญญาแล้ว รอค่าแรกเข้า</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{count82}</span>
          </button>

          <button
            onClick={() => setActiveTab('8.3')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '8.3' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🟢 8.3 เสร็จสิ้น/เข้าพักแล้ว</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{count83}</span>
          </button>

          <button
            onClick={() => setActiveTab('8.4')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === '8.4' ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🔴 8.4 ยกเลิกการจอง</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{count84}</span>
          </button>

          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            ทั้งหมด ({bookings.length})
          </button>
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <input
            type="text"
            placeholder="ค้นหาเลขห้อง, ชื่อ, เบอร์โทร..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Bookings List (Horizontal Row Cards) */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold bg-slate-900/50 rounded-3xl border border-white/10 animate-pulse">
            กำลังโหลดรายการจองห้องพัก...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold bg-slate-900/50 rounded-3xl border border-white/10 space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-base text-white">ไม่พบรายการจองในหมวดหมู่นี้</p>
            <p className="text-xs text-slate-400">เลือกแท็บสถานะอื่นหรือล้างคำค้นหา</p>
          </div>
        ) : (
          filteredBookings.map((item) => {
            const is81 = item.booking_status === 'PendingContract' || item.booking_status === 'PendingOwnerSignature';
            const is82 = item.booking_status === 'PendingFirstBill';
            const is83 = item.booking_status === 'Active';
            const is84 = item.booking_status === 'Cancelled';

            return (
              <div
                key={item.contract_id}
                className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-2xl space-y-5 transition-all hover:border-white/20"
              >
                {/* Card Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/30 flex items-center justify-center text-xl">
                      🚪
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-white">
                        ห้อง {item.room_number}{' '}
                        <span className="text-xs font-normal text-slate-400">({item.room_type || 'ห้องพัก'} • ชั้น {item.floor || 1})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        จองเมื่อ: {item.booking_created_at ? new Date(item.booking_created_at).toLocaleDateString('th-TH') : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <div>
                    <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border ${
                      is81 ? 'bg-amber-500/10 border-amber-500/40 text-amber-400' :
                      is82 ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' :
                      is83 ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400' :
                      'bg-rose-500/10 border-rose-500/40 text-rose-400'
                    }`}>
                      {is81 ? '🟡 8.1 รอทำสัญญา' :
                       is82 ? '🔵 8.2 รอชำระค่าแรกเข้า' :
                       is83 ? '🟢 8.3 เข้าพักเรียบร้อย' : '🔴 8.4 ยกเลิกการจอง'}
                    </span>
                  </div>
                </div>

                {/* Card Body (3 Sub-cards Layout) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Box 1: Guest Info */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ข้อมูลผู้จอง</p>
                    <p className="text-sm font-black text-white">{item.guest_name || 'ไม่ระบุชื่อ'}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-300 font-mono">📞 {item.guest_phone || '-'}</span>
                      {item.guest_phone && (
                        <a
                          href={`tel:${item.guest_phone}`}
                          className="px-2.5 py-1 bg-emerald-500/20 hover:bg-emerald-500 text-emerald-400 hover:text-white rounded-lg text-[10px] font-bold transition-colors"
                        >
                          โทรออก
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 truncate">✉️ {item.guest_email || '-'}</p>
                  </div>

                  {/* Box 2: Financial & Contract */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">ข้อมูลสัญญาที่แขกกรอก</p>
                      <button
                        onClick={() => setPreviewContractModal(item)}
                        className="px-2 py-0.5 bg-blue-500/20 hover:bg-blue-500 text-blue-300 hover:text-white rounded-lg text-[10px] font-bold transition-all flex items-center gap-1"
                      >
                        <span>🔍</span>
                        <span>ดูข้อมูลสัญญา</span>
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">เงินมัดจำการจอง:</span>
                      <span className="font-mono font-black text-emerald-400">฿{Number(item.deposit_amount || 1000).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">ค่าเช่ารายเดือน:</span>
                      <span className="font-mono font-black text-white">฿{Number(item.monthly_rent || 3400).toLocaleString()} /ด.</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">
                      บัตร ปชช: {item.id_card_number || '-'}
                    </p>
                    <div className="pt-1 flex items-center gap-2">
                      <a
                        href={`/api/contracts/export-pdf?contractId=${item.contract_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>📄</span>
                        <span>ดู / บันทึกสัญญา (PDF)</span>
                      </a>
                    </div>
                  </div>

                  {/* Box 3: Slip Evidence */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">สลิปโอนเงินมัดจำ (1,000 บ.)</p>
                    {item.slip_url ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => setPreviewSlipUrl(item.slip_url)}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                        >
                          <span>🖼️</span>
                          <span>ดูภาพสลิปมัดจำ</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">ไม่มีสลิปแนบ</p>
                    )}
                  </div>
                </div>

                {/* Footer Action Bar */}
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {item.contract_file_url && (
                      <a
                        href={item.contract_file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3.5 py-2 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-xl border border-white/10 transition-all flex items-center gap-1.5"
                      >
                        <span>📄</span>
                        <span>สัญญาฉบับเต็ม</span>
                      </a>
                    )}

                    <button
                      onClick={() => setPreviewBillModal(item)}
                      className="px-3.5 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 text-xs font-bold rounded-xl border border-blue-500/30 transition-all flex items-center gap-1.5 hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <span>🧾</span>
                      <span>ดูบิลแรกเข้า</span>
                    </button>
                  </div>

                  {/* Primary Actions based on stage */}
                  <div className="flex items-center gap-2">
                    {is81 && (
                      <button
                        onClick={() => setUploadContractBooking(item)}
                        className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
                      >
                        <span>✍️</span>
                        <span>อัปโหลดสัญญา & ออกบิลแรกเข้า</span>
                      </button>
                    )}

                    {is82 && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-blue-400 font-bold">
                          รอ Guest ชำระค่าแรกเข้า (฿{Number((item.first_bill_amount) || (item.monthly_rent + 2000)).toLocaleString()})
                        </span>
                      </div>
                    )}

                    {is83 && (
                      <span className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5">
                        <span>✓</span>
                        <span>สัญญาใช้งานอยู่ (ลูกหอปัจจุบัน)</span>
                      </span>
                    )}

                    {is84 && (
                      <span className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl">
                        ยกเลิกแล้ว (ไม่คืนเงินมัดจำ)
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Slip Preview Modal */}
      {previewSlipUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-white">หลักฐานสลิปโอนเงิน</h3>
              <button
                onClick={() => setPreviewSlipUrl(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative min-h-[350px] max-h-[70vh] bg-black/40 rounded-2xl overflow-hidden border border-white/5 flex flex-col items-center justify-center p-2">
              <img
                src={previewSlipUrl}
                alt="Slip Preview"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-lg"
                onError={(e) => {
                  console.error('Image load error for:', previewSlipUrl);
                }}
              />
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={previewSlipUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center gap-1.5"
                >
                  <span>🔍</span>
                  <span>เปิดดูภาพขนาดเต็ม</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Guest Contract Details Modal */}
      {previewContractModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>📄</span>
                  <span>รายละเอียดสัญญาที่ผู้จองกรอก (ห้อง {previewContractModal.room_number})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">ผู้จอง: {previewContractModal.guest_name}</p>
              </div>
              <button
                onClick={() => setPreviewContractModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Personal Info */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-primary">ข้อมูลผู้เช่าและบัตรประชาชน</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">ชื่อ-นามสกุล:</span>
                    <span className="text-white font-bold text-sm">{previewContractModal.guest_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">เลขประจำตัวประชาชน:</span>
                    <span className="text-white font-bold font-mono text-sm">{previewContractModal.id_card_number || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">เบอร์โทรศัพท์ผู้เช่า:</span>
                    <span className="text-white font-bold font-mono">{previewContractModal.guest_phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">เบอร์โทรศัพท์ผู้ปกครอง:</span>
                    <span className="text-white font-bold font-mono">{previewContractModal.parent_phone || '-'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">ที่อยู่ตามบัตรประชาชน:</span>
                    <span className="text-slate-200">{previewContractModal.tenant_address || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Contract Terms */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-2 text-xs">
                <h4 className="text-xs font-black uppercase tracking-widest text-primary">เงื่อนไขสัญญาเช่า</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">ห้องพัก:</span>
                    <span className="text-white font-bold">ห้อง {previewContractModal.room_number} (ชั้น {previewContractModal.floor})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">ค่าเช่ารายเดือน:</span>
                    <span className="text-white font-bold font-mono">฿{Number(previewContractModal.monthly_rent).toLocaleString()} /ด.</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">เงินมัดจำการจอง:</span>
                    <span className="text-emerald-400 font-bold font-mono">฿{Number(previewContractModal.deposit_amount || 1000).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">ระยะเวลาสัญญา:</span>
                    <span className="text-white font-bold">{new Date(previewContractModal.start_date).toLocaleDateString('th-TH')} — {new Date(previewContractModal.end_date).toLocaleDateString('th-TH')}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-white/10">
              <a
                href={`/api/contracts/export-pdf?contractId=${previewContractModal.contract_id}&autoPrint=true`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-6 py-3 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2"
              >
                <span>📄</span>
                <span>พิมพ์ / ดาวน์โหลดเป็น PDF</span>
              </a>

              <button
                type="button"
                onClick={() => setPreviewContractModal(null)}
                className="w-full sm:w-auto px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Contract & Generate First Bill Modal */}
      {uploadContractBooking && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-xl w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white">อัปโหลดสัญญา & ออกบิลแรกเข้า</h3>
                <p className="text-xs text-slate-400 mt-0.5">ห้อง {uploadContractBooking.room_number} • ผู้จอง: {uploadContractBooking.guest_name}</p>
              </div>
              <button
                onClick={() => setUploadContractBooking(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadContract} className="space-y-5">
              {(() => {
                const isTestBooking = (uploadContractBooking.room_number || '').toUpperCase() === 'T01';
                const roomRent = Number(uploadContractBooking.monthly_rent || (isTestBooking ? 10 : 3400));
                const totalDep = isTestBooking ? 20 : 3000;
                const paidDep = isTestBooking ? 1 : Number(uploadContractBooking.deposit_amount || 1000);
                const extraDep = Math.max(0, totalDep - paidDep);
                const totalFirstBill = roomRent + extraDep;

                return (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                    <p className="text-xs font-bold text-slate-300">บิลค่าแรกเข้าที่จะส่งไปยัง Guest:</p>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>ค่าห้องเดือนแรก:</span>
                      <span className="text-white font-mono">฿{roomRent.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>เงินประกันหอพักเพิ่ม:</span>
                      <span className="text-white font-mono">฿{extraDep.toLocaleString('th-TH', { minimumFractionDigits: 2 })} (รวมมัดจำเดิม = {totalDep.toLocaleString()} บาท)</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-black text-emerald-400">
                      <span>ยอดบิลแรกเข้ารวม:</span>
                      <span className="font-mono">฿{totalFirstBill.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-2">เลือกไฟล์เอกสารสัญญาเช่า (รูปภาพหรือ PDF):</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  required
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = () => {
                        if (reader.result) {
                          setContractFile(reader.result as string);
                        }
                      };
                      reader.readAsDataURL(file);
                    } else {
                      setContractFile(null);
                    }
                  }}
                  className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer bg-slate-950 p-2 rounded-xl border border-white/10"
                />
                {contractFile && (
                  <p className="text-[11px] text-emerald-400 font-bold mt-2">✓ แนบไฟล์สัญญาเรียบร้อยแล้ว</p>
                )}
              </div>

              {/* Initial Meter Reading Input */}
              <div className="p-4 bg-slate-950 rounded-2xl border border-amber-500/20 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-base">⚡</span>
                  <label className="block text-xs font-black text-amber-300">
                    เลขมิเตอร์ไฟฟ้าเริ่มต้นของห้อง {uploadContractBooking.room_number}:
                  </label>
                </div>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="กรอกเลขมิเตอร์หน้าปัด ณ วันส่งมอบห้อง (เช่น 0, 100)"
                  value={initialMeterReading}
                  onChange={(e) => setInitialMeterReading(e.target.value)}
                  className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-3 text-sm font-mono font-bold text-white focus:outline-none focus:border-amber-400"
                />
                <p className="text-[10px] text-slate-400">
                  🔒 กำหนดค่ามิเตอร์เริ่มต้นเพื่อใช้เป็นฐานคำนวณหน่วยไฟในรอบบิลถัดไป และป้องกันการโกงหน่วยไฟ
                </p>
              </div>

              <button
                type="submit"
                disabled={uploading || !contractFile}
                className="w-full py-4 bg-amber-500 hover:bg-amber-400 text-white font-black text-sm rounded-xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
              >
                {uploading ? 'กำลังบันทึกสัญญา...' : '🚀 บันทึกสัญญา & ส่งบิลแรกเข้า'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Preview First Bill Modal */}
      {previewBillModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl">
            <div className="flex justify-between items-center pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl">
                  🧾
                </div>
                <div>
                  <h3 className="text-lg font-black text-white">รายละเอียดบิลแรกเข้า</h3>
                  <p className="text-xs text-slate-400 mt-0.5">ห้อง {previewBillModal.room_number} • ผู้เช่า: {previewBillModal.guest_name}</p>
                </div>
              </div>
              <button
                onClick={() => setPreviewBillModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">สถานะบิล:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${
                    previewBillModal.first_bill_status === 'Paid'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                  }`}>
                    {previewBillModal.first_bill_status === 'Paid' ? '✓ ชำระแล้ว' : '⏳ รอ Guest ชำระเงิน'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-400">กำหนดชำระภายใน:</span>
                  <span className="text-white font-bold">
                    {previewBillModal.first_bill_due_date ? new Date(previewBillModal.first_bill_due_date).toLocaleDateString('th-TH') : '-'}
                  </span>
                </div>
              </div>

              <div className="p-5 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3 text-xs">
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">รายการค่าใช้จ่าย</h4>
                
                <div className="flex justify-between py-1 border-b border-white/5">
                  <span className="text-slate-300">1. ค่าเช่าห้องพักเดือนแรก:</span>
                  <span className="text-white font-mono font-bold">฿{Number(previewBillModal.monthly_rent || 2800).toLocaleString()}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <div>
                    <span className="text-slate-300">2. เงินประกันหอพักส่วนที่เหลือ:</span>
                    <p className="text-[10px] text-slate-500">(รวมเงินมัดจำเดิม 1,000 = ประกันรวม 3,000 บาท)</p>
                  </div>
                  <span className="text-white font-mono font-bold">฿2,000.00</span>
                </div>

                <div className="pt-2 flex justify-between items-center text-base font-black">
                  <span className="text-emerald-400">ยอดชำระรวม:</span>
                  <span className="text-emerald-400 font-mono text-xl">
                    ฿{Number(previewBillModal.first_bill_amount || (Number(previewBillModal.monthly_rent || 2800) + 2000)).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewBillModal(null)}
                className="w-full sm:w-auto px-6 py-3 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
