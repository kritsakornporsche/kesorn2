'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { checkPaperFile } from '@/lib/paper-file-check';
import InspectionModal, { type InspectionStatus } from '@/components/InspectionModal';
import { NextStepLine, STEP_COLOR, StepBadge, StepChecklist } from '@/components/BookingSteps';
import { STEP_SHORT, type StepNo } from '@/lib/booking-steps';
import { roomTypeLabel } from '@/lib/room-types';
import TestRoomBadge from '@/components/TestRoomBadge';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';
import { PAPER_CONFIRM_TEXT, signedPaperText, type SignedPaper } from '@/lib/signed-paper';
import ContractDataModal from '@/components/ContractDataModal';
import type { BookingSteps } from '@/lib/booking-steps';

interface Booking {
  contract_id: number;
  /** commit 27: occupants from the booking */
  occupants?: number | null;
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
  // Booking flow (approve, then pay) — times are computed on the server
  cancel_reason?: string | null;
  booking_fee?: number;
  seconds_to_expire?: number | null;
  seconds_to_pay?: number | null;
  no_show_allowed?: boolean;
  // Move-in (lib/moveIn.ts) — amounts and checks come from the server
  move_in?: { rent: number; deposit: number; bookingFee: number; depositAtMoveIn: number; dueAtMoveIn: number; cap_ok: boolean; cap_message: string | null };
  legacy?: boolean;
  move_in_bill_paid?: boolean;
  paper_uploaded?: boolean;
  paper_signed_date?: string | null;
  start_meter_reading?: number | null;
  move_in_overdue_partial?: boolean;
  can_issue_move_in?: boolean;
  contract_file_is_pdf?: boolean;
  /** commit 28a: uploaded / missing / none (server) */
  signed_paper?: SignedPaper;
  // Move-in inspection (lib/inspections.ts); null when it cannot be inspected or migration 011 is not run
  inspection_status?: InspectionStatus | null;
  /** commit 28: steps 1–7 (lib/booking-steps.ts) */
  steps?: BookingSteps;
}

type TabKey = 's1' | 's2' | 's3' | 's4' | 's5' | 's6' | 's7' | 'ACTIVE' | 'CLOSED' | 'LEGACY' | 'ALL';

/** The tab a booking belongs to, from its step */
const tabOf = (b: { steps?: BookingSteps }): TabKey => {
  const s = b.steps;
  if (!s) return 'ALL';
  if (s.phase === 'step') return `s${s.current}` as TabKey;
  return s.phase === 'active' ? 'ACTIVE' : s.phase === 'closed' ? 'CLOSED' : 'LEGACY';
};

export default function OwnerBookingsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter tabs: 8.1 PendingContract, 8.2 PendingFirstBill, 8.3 Active, 8.4 Cancelled, All
  // commit 28-4: tabs by step (lib/booking-steps.ts) — s1…s7, in effect, cancelled / expired, older contracts, all
  const [activeTab, setActiveTab] = useState<TabKey>('s1');
  const [inspectId, setInspectId] = useState<number | null>(null);
  const [actingId, setActingId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [previewSlipUrl, setPreviewSlipUrl] = useState<string | null>(null);
  const [previewContractModal, setPreviewContractModal] = useState<Booking | null>(null);
  const [previewBillModal, setPreviewBillModal] = useState<Booking | null>(null);
  // Move-in bill (with the starting meter) and the signed paper contract are two separate steps
  const [issueBooking, setIssueBooking] = useState<Booking | null>(null);
  const [initialMeterReading, setInitialMeterReading] = useState<string>('');
  // Tenant name / address for the contract: what the booker typed, checked against the ID card by hand
  const [paperBooking, setPaperBooking] = useState<Booking | null>(null);
  // commit 28-2: step 3 — contract data (confirm / change with a reason)
  const [dataContractId, setDataContractId] = useState<number | null>(null);
  const [paperFile, setPaperFile] = useState<string | null>(null);
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperSignedDate, setPaperSignedDate] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // commit 28a: new booking requests show up without pressing refresh — the list is reloaded quietly every
  // REFRESH_MS and when the tab comes back; a request not seen before raises the "มีคำขอจองใหม่" bar.
  const seenRequests = useRef<Set<number> | null>(null);
  const [newRequests, setNewRequests] = useState(0);
  const fetchBookings = async (opts: { silent?: boolean } = {}) => {
    try {
      if (!opts.silent) setLoading(true);
      const res = await fetch('/api/owner/bookings', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        const list: Booking[] = data.data || [];
        const requested = list.filter((b) => b.booking_status === 'BookingRequested').map((b) => Number(b.contract_id));
        if (seenRequests.current) {
          const fresh = requested.filter((id) => !seenRequests.current!.has(id)).length;
          if (fresh > 0) setNewRequests((n) => n + fresh);
        }
        seenRequests.current = new Set([...(seenRequests.current || []), ...requested]);
        setBookings(list);
      }
    } catch (e) {
      console.error('Fetch bookings error:', e);
    } finally {
      if (!opts.silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/bookings');
      return;
    }
    fetchBookings();
  }, [authStatus, router]);

  // Issue the move-in bill: the server sets the amounts from the room; only the starting meter is sent
  const handleIssueMoveIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!issueBooking) return;
    if (initialMeterReading.trim() === '') {
      showToast('กรุณากรอกเลขมิเตอร์ไฟฟ้าเริ่มต้น (บังคับตอนทำสัญญา)', 'error');
      return;
    }

    setUploading(true);
    try {
      const res = await fetch('/api/owner/contracts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract_id: issueBooking.contract_id, initial_meter_reading: initialMeterReading }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message}`, 'success');
        setIssueBooking(null);
        setInitialMeterReading('');
        fetchBookings();
      } else {
        showToast(data.message || 'ออกบิลเข้าอยู่ไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Upload the signed paper contract with its signing date; the contract takes effect once the move-in bill is paid too
  const handleUploadPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!paperBooking || !paperFile || !paperSignedDate) {
      showToast('กรุณาเลือกไฟล์สัญญาที่เซ็นแล้วและระบุวันที่เซ็น', 'error');
      return;
    }
    if (!confirm(PAPER_CONFIRM_TEXT)) return;

    setUploading(true);
    try {
      const res = await fetch('/api/owner/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId: paperBooking.contract_id, file: paperFile, signedDate: paperSignedDate, confirm: true }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message}`, 'success');
        setPaperBooking(null);
        setPaperFile(null);
        setPaperSignedDate('');
        fetchBookings();
      } else {
        showToast(data.message || 'บันทึกสัญญาที่เซ็นแล้วไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Today in Thai time, for the latest allowed signing date
  const todayBangkok = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

  const runAction = async (action: 'approve' | 'reject' | 'cancel', item: Booking) => {
    let reason = '';
    if (action === 'approve' && !confirm(`อนุมัติการจองห้อง ${item.room_number} ของ ${item.guest_name}? ผู้จองจะมีเวลาชำระค่าจอง 10 นาที`)) return;
    if (action === 'reject') {
      const input = prompt('เหตุผลที่ปฏิเสธคำขอจอง (ส่งให้ผู้จองเห็น)');
      if (input === null) return;
      reason = input.trim();
    }
    if (action === 'cancel' && !confirm(`ยืนยัน: ผู้จองไม่มาเข้าพักตามวันนัด? ระบบจะยกเลิกการจอง ริบค่าจอง ฿${Number(item.booking_fee || 0).toLocaleString('th-TH')} เป็นรายได้ และเปิดห้องให้จองใหม่`)) return;
    setActingId(item.contract_id);
    try {
      const res = await fetch('/api/owner/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, contractId: item.contract_id, reason }),
      });
      const data = await res.json();
      showToast(data.message || (data.success ? 'สำเร็จ' : 'ทำรายการไม่สำเร็จ'), data.success ? 'success' : 'error');
      fetchBookings();
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setActingId(null);
    }
  };

  // Always refresh quietly every REFRESH_MS while the tab is visible, and at once when it comes back (commit 28a)
  useEffect(() => {
    if (authStatus !== 'authenticated') return;
    const REFRESH_MS = 20_000;
    const id = setInterval(() => { if (document.visibilityState === 'visible') fetchBookings({ silent: true }); }, REFRESH_MS);
    const onBack = () => { if (document.visibilityState === 'visible') fetchBookings({ silent: true }); };
    document.addEventListener('visibilitychange', onBack);
    window.addEventListener('focus', onBack);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onBack); window.removeEventListener('focus', onBack); };
  }, [authStatus]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBookings = bookings.filter((b) => {
    if (activeTab !== 'ALL' && tabOf(b) !== activeTab) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = b.room_number?.toLowerCase().includes(q);
      const matchName = b.guest_name?.toLowerCase().includes(q);
      const matchPhone = b.guest_phone?.toLowerCase().includes(q);
      if (!matchRoom && !matchName && !matchPhone) return false;
    }
    return true;
  });
  const countOf = (k: TabKey) => bookings.filter((b) => tabOf(b) === k).length;
  const TABS: { key: TabKey; label: string; color: string }[] = [
    ...([1, 2, 3, 4, 5, 6, 7] as StepNo[]).map((n) => ({ key: `s${n}` as TabKey, label: `${n} ${STEP_SHORT[n]}`, color: STEP_COLOR[n].dot })),
    { key: 'ACTIVE', label: 'มีผลแล้ว', color: STEP_COLOR.active.dot },
    { key: 'CLOSED', label: 'ยกเลิก / หมดเวลา', color: STEP_COLOR.closed.dot },
    ...(countOf('LEGACY') > 0 ? [{ key: 'LEGACY' as TabKey, label: 'สัญญาแบบเดิม', color: STEP_COLOR.legacy.dot }] : []),
  ];

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

      {/* New booking requests since the page was opened (commit 28a) */}
      {newRequests > 0 && (
        <div role="status" className="flex items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-amber-500/15 border border-amber-500/40 text-amber-200 text-sm font-bold">
          <span>🛎️ มีคำขอจองใหม่ {newRequests} รายการ</span>
          <span className="flex gap-2">
            <button onClick={() => { setActiveTab('s1'); setNewRequests(0); }} className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-black">ดูคำขอ</button>
            <button onClick={() => setNewRequests(0)} className="px-3 py-1.5 rounded-xl bg-white/10 text-white text-xs font-bold">ปิด</button>
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔔</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">รายการจองห้องพัก (Booking Pipeline)</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">1 ขอจอง ➔ 2 ชำระค่าจอง ➔ 3 ยืนยันข้อมูลสัญญา ➔ 4 ตรวจห้อง ➔ 5 ลงนาม ➔ 6 บิลค่าแรกเข้า ➔ 7 ชำระ = เป็นลูกหอ</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchBookings()}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-2"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-slate-900/80 p-4 rounded-2xl border border-white/10 shadow-xl">
        {/* Tabs by step (commit 28-4) */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0" role="tablist" aria-label="ขั้นตอน">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.key ? 'bg-white/15 text-white ring-1 ring-white/40 shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tab.color}`} />
              <span>{tab.label}</span>
              <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{countOf(tab.key)}</span>
            </button>
          ))}
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
            <p className="text-xs text-slate-400">เลือกขั้นอื่นหรือล้างคำค้นหา</p>
          </div>
        ) : (
          filteredBookings.map((item) => {
            const s = item.steps;
            const step = s?.phase === 'step' ? s.current : null;
            const paidStage = ['PendingContract', 'PendingOwnerSignature', 'PendingFirstBill'].includes(item.booking_status);
            const btn = 'px-5 py-2.5 font-black text-xs rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1.5';
            const menuItem = 'w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-200 hover:bg-white/10';

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
                        ห้อง {item.room_number}<TestRoomBadge roomNumber={item.room_number} />{' '}
                        <span className="text-xs font-normal text-slate-400">({roomTypeLabel(item.room_type)} • ชั้น {item.floor || 1})</span>
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        จองเมื่อ: {item.booking_created_at ? new Date(item.booking_created_at).toLocaleDateString('th-TH') : '-'}
                      </p>
                    </div>
                  </div>

                  {/* Step badge (commit 28-4) */}
                  <div>{s && <StepBadge steps={s} />}</div>
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
                      <span className="text-slate-400">ค่าจอง (ส่วนหนึ่งของเงินประกัน):</span>
                      <span className="font-mono font-black text-emerald-400">฿{Number(item.booking_fee || 0).toLocaleString('th-TH')}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">ค่าเช่ารายเดือน:</span>
                      <span className="font-mono font-black text-white">฿{Number(item.monthly_rent || 0).toLocaleString('th-TH')} /ด.</span>
                    </div>
                    {item.move_in && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-400">เงินประกันรวม:</span>
                        <span className="font-mono font-black text-white">฿{Number(item.move_in.deposit).toLocaleString('th-TH')}</span>
                      </div>
                    )}
                    <div className="pt-1 flex items-center gap-2">
                      <a
                        href={`/contract-print/${item.contract_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white text-[11px] font-bold rounded-lg border border-rose-500/30 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>🖨</span>
                        <span>พิมพ์สัญญา (PDF)</span>
                      </a>
                    </div>
                  </div>

                  {/* Box 3: Slip Evidence */}
                  <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/5 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">สลิปโอนค่าจอง (฿{Number(item.booking_fee || 0).toLocaleString('th-TH')})</p>
                    {item.slip_url ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => setPreviewSlipUrl(item.slip_url)}
                          className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2"
                        >
                          <span>🖼️</span>
                          <span>ดูภาพสลิปค่าจอง</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500 italic py-2">ไม่มีสลิปแนบ</p>
                    )}
                  </div>
                </div>

                {/* Steps 1–7: what is done, what is now, who does it (commit 28-4) */}
                {s && (
                  <div className="space-y-2">
                    <StepChecklist steps={s} />
                    <NextStepLine steps={s} />
                  </div>
                )}

                {/* Footer: one main button for the step, the rest under "เพิ่มเติม" */}
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {step === 1 && (
                      <>
                        <button onClick={() => runAction('approve', item)} disabled={actingId === item.contract_id} className={`${btn} bg-emerald-500 hover:bg-emerald-400 text-white`}>✓ อนุมัติคำขอจอง</button>
                        <button onClick={() => runAction('reject', item)} disabled={actingId === item.contract_id} className="px-4 py-2.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 font-black text-xs rounded-xl disabled:opacity-50">✕ ปฏิเสธ</button>
                      </>
                    )}
                    {step === 2 && (
                      <span className="text-xs text-sky-300 font-bold">
                        รอผู้จองชำระค่าจอง ฿{Number(item.booking_fee || 0).toLocaleString('th-TH')} · เหลือเวลาประมาณ {Math.ceil(Number(item.seconds_to_pay || 0) / 60)} นาที
                      </span>
                    )}
                    {step === 3 && (
                      <button onClick={() => setDataContractId(item.contract_id)} className={`${btn} bg-violet-500 hover:bg-violet-400 text-white`}>📝 กรอก/ยืนยันข้อมูลสัญญา</button>
                    )}
                    {step === 4 && (
                      <button onClick={() => setInspectId(item.contract_id)} className={`${btn} bg-cyan-500 hover:bg-cyan-400 text-slate-950`}>
                        🔍 {item.inspection_status === 'pending_ack' ? 'ผลตรวจห้อง (รอผู้เช่ารับทราบ)' : 'ตรวจห้องและบันทึกผล'}
                      </button>
                    )}
                    {step === 5 && (
                      <>
                        <a href={`/contract-print/${item.contract_id}`} target="_blank" rel="noreferrer" className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-black text-xs rounded-xl border border-white/10">🖨 พิมพ์สัญญา (PDF)</a>
                        <button onClick={() => { setPaperBooking(item); setPaperFile(null); setPaperError(null); setPaperSignedDate(''); }} className={`${btn} bg-fuchsia-500 hover:bg-fuchsia-400 text-white`}>📤 อัปโหลดสัญญาที่ลงนาม</button>
                      </>
                    )}
                    {step === 6 && (item.can_issue_move_in && s?.canIssueMoveIn ? (
                      <button onClick={() => { setIssueBooking(item); setInitialMeterReading(''); }} className={`${btn} bg-amber-500 hover:bg-amber-400 text-white`}>🧾 ออกบิลค่าแรกเข้า</button>
                    ) : (
                      <span className="flex items-center gap-2 flex-wrap">
                        <button disabled className="px-5 py-2.5 bg-amber-500/30 text-white/60 font-black text-xs rounded-xl cursor-not-allowed">🧾 ออกบิลค่าแรกเข้า</button>
                        <span className="text-[11px] text-amber-300 font-bold">
                          {s && s.missingForMoveIn.length > 0 ? `ออกบิลได้เมื่อ: ${s.missingForMoveIn.join(' · ')}` : 'เลยวันเริ่มสัญญาแล้ว — ใช้ "ไม่มาตามนัด" ในเมนูเพิ่มเติม'}
                        </span>
                      </span>
                    ))}
                    {step === 7 && (
                      <span className="text-xs text-blue-300 font-bold">
                        {item.move_in_bill_paid ? 'ชำระบิลค่าแรกเข้าแล้ว' : `รอผู้จองชำระค่าแรกเข้า ฿${Number(item.first_bill_amount || 0).toLocaleString('th-TH')}${item.first_bill_due_date ? ` ภายใน ${new Date(item.first_bill_due_date).toLocaleDateString('th-TH')}` : ''}`}
                      </span>
                    )}
                    {s?.phase === 'active' && (
                      <span className="px-4 py-2 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold rounded-xl">✓ สัญญามีผล (ลูกหอปัจจุบัน)</span>
                    )}
                    {s?.phase === 'closed' && (
                      <span className="px-4 py-2 bg-rose-500/10 text-rose-400 border border-rose-500/30 text-xs font-bold rounded-xl">
                        {item.booking_status === 'Rejected' ? 'ปฏิเสธแล้ว' : item.booking_status === 'Expired' ? 'หมดเวลา' : 'ยกเลิกแล้ว'}{item.cancel_reason ? ` · ${item.cancel_reason}` : ''}
                      </span>
                    )}
                    {s?.phase === 'legacy' && (
                      <span className="px-4 py-2 bg-slate-500/10 text-slate-300 border border-slate-500/30 text-xs font-bold rounded-xl">สัญญาแบบเดิม — จัดการด้วยมือ</span>
                    )}
                    {item.move_in_overdue_partial && (
                      <span className="px-3 py-1.5 bg-rose-500/10 text-rose-300 border border-rose-500/30 text-[11px] font-bold rounded-xl">เลยกำหนด — จ่ายบางส่วน กรุณาจัดการด้วยมือ</span>
                    )}
                  </div>

                  {/* Everything else (commit 28-4) */}
                  <details className="relative">
                    <summary className="list-none cursor-pointer px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-200 text-xs font-bold rounded-xl border border-white/10">เพิ่มเติม ▾</summary>
                    <div className="absolute right-0 z-20 mt-2 w-64 p-2 bg-slate-900 border border-white/15 rounded-2xl shadow-2xl space-y-1">
                      <button onClick={() => setPreviewContractModal(item)} className={menuItem}>🔍 ข้อมูลที่ผู้จองกรอก</button>
                      <a href={`/contract-print/${item.contract_id}`} target="_blank" rel="noreferrer" className={`block ${menuItem}`}>🖨 พิมพ์สัญญา (PDF)</a>
                      {paidStage && step !== 3 && !item.legacy && (
                        <button onClick={() => setDataContractId(item.contract_id)} className={menuItem}>📝 ข้อมูลสัญญา / ประวัติการแก้</button>
                      )}
                      {(paidStage || item.booking_status === 'Active') && step !== 4 && !item.legacy && item.inspection_status && item.inspection_status !== 'none' && (
                        <button onClick={() => setInspectId(item.contract_id)} className={menuItem}>🔍 ผลตรวจห้อง</button>
                      )}
                      {item.contract_file_url && (
                        <a href={item.contract_file_url} target="_blank" rel="noreferrer" className={`block ${menuItem}`}>
                          📄 สัญญาที่ลงนาม{item.paper_signed_date ? ` (${new Date(item.paper_signed_date).toLocaleDateString('th-TH')})` : ''}
                        </a>
                      )}
                      {paidStage && item.paper_uploaded && step !== 5 && !item.legacy && (
                        <button onClick={() => { setPaperBooking(item); setPaperFile(null); setPaperError(null); setPaperSignedDate(''); }} className={menuItem}>📤 อัปโหลดสัญญาที่ลงนามใหม่</button>
                      )}
                      {s?.order === 'old' && !item.paper_uploaded && (
                        <button onClick={() => { setPaperBooking(item); setPaperFile(null); setPaperError(null); setPaperSignedDate(''); }} className={menuItem}>📤 อัปโหลดสัญญาที่ลงนาม</button>
                      )}
                      {item.first_bill_id && (
                        <button onClick={() => setPreviewBillModal(item)} className={menuItem}>🧾 ดูบิลค่าแรกเข้า</button>
                      )}
                      {item.no_show_allowed && !item.legacy && (
                        <button onClick={() => runAction('cancel', item)} disabled={actingId === item.contract_id} className={`${menuItem} text-rose-300`}>ไม่มาตามนัด (ริบค่าจอง)</button>
                      )}
                    </div>
                  </details>
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

      {/* Guest Contract Details Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {previewContractModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-white/10 bg-slate-950/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
                  <span>📄</span>
                  <span>รายละเอียดสัญญาที่ผู้จองกรอก (ห้อง {previewContractModal.room_number})</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">ผู้จอง: {previewContractModal.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewContractModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 custom-scrollbar">
              {/* Personal Info */}
              <div className="p-4 bg-slate-950/80 rounded-2xl border border-white/5 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-primary">ข้อมูลผู้เช่า</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">ชื่อ-นามสกุล:</span>
                    <span className="text-white font-bold text-sm">{previewContractModal.guest_name}</span>
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
                    <span className="text-slate-400">ค่าจอง / เงินประกันรวม:</span>
                    <span className="text-emerald-400 font-bold font-mono">฿{Number(previewContractModal.booking_fee || 0).toLocaleString('th-TH')} / ฿{Number(previewContractModal.move_in?.deposit || 0).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-white/5">
                    <span className="text-slate-400">ระยะเวลาสัญญา:</span>
                    <span className="text-white font-bold">{new Date(previewContractModal.start_date).toLocaleDateString('th-TH')} — {new Date(previewContractModal.end_date).toLocaleDateString('th-TH')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href={`/contract-print/${previewContractModal.contract_id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🖨</span>
                <span>พิมพ์สัญญา (PDF)</span>
              </a>

              <button
                type="button"
                onClick={() => setPreviewContractModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Issue Move-in Bill Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {issueBooking && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-white/10 bg-slate-950/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">ออกบิลเข้าอยู่</h3>
                <p className="text-xs text-slate-400 mt-0.5">ห้อง {issueBooking.room_number} • ผู้จอง: {issueBooking.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIssueBooking(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleIssueMoveIn} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
                {issueBooking.move_in && (
                  <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-3">
                    <p className="text-xs font-bold text-slate-300">บิลค่าแรกเข้าที่จะส่งไปยังผู้จอง (คำนวณจากราคาห้อง):</p>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>ค่าห้องเดือนแรก (เต็มเดือน):</span>
                      <span className="text-white font-mono">฿{Number(issueBooking.move_in.rent).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-400">
                      <span>เงินประกันส่วนที่เหลือ:</span>
                      <span className="text-white font-mono">฿{Number(issueBooking.move_in.depositAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (รวมค่าจอง = ประกัน ฿{Number(issueBooking.move_in.deposit).toLocaleString('th-TH')})</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex justify-between text-sm font-black text-emerald-400">
                      <span>ยอดบิลแรกเข้ารวม:</span>
                      <span className="font-mono">฿{Number(issueBooking.move_in.dueAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[10px] text-slate-400">ครบกำหนดชำระ: วันเริ่มสัญญา {issueBooking.start_date ? new Date(issueBooking.start_date).toLocaleDateString('th-TH') : '-'} — หากไม่ชำระ สัญญาจะถูกยกเลิกและค่าจองไม่คืน</p>
                    {!issueBooking.move_in.cap_ok && (
                      <p className="text-[11px] text-rose-300 font-bold">{issueBooking.move_in.cap_message}</p>
                    )}
                  </div>
                )}

                {/* Tenant on the contract: confirmed in step 3 and printed on the signed paper (commit 28-3) — read only here */}
                <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-1.5">
                  <p className="text-xs font-black text-white">ข้อมูลในสัญญา (ยืนยันแล้วในขั้น 3 · ตรงกับสัญญาที่ลงนาม)</p>
                  <p className="text-[11px] text-slate-300">ผู้เช่า: <span className="font-bold text-white">{issueBooking.guest_name}</span></p>
                  <p className="text-[11px] text-slate-300">ที่อยู่: <span className="font-bold text-white">{issueBooking.tenant_address || '-'}</span></p>
                  <p className="text-[11px] text-slate-300">จำนวนผู้พัก: <span className="font-bold text-white">{Number(issueBooking.occupants) || 1} คน</span> (ค่าน้ำคิดตามจำนวนผู้พัก)</p>
                </div>

                {/* Initial Meter Reading Input */}
                <div className="p-4 bg-slate-950 rounded-2xl border border-amber-500/20 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <label className="block text-xs font-black text-amber-300">
                      เลขมิเตอร์ไฟฟ้าเริ่มต้นของห้อง {issueBooking.room_number} (บังคับ):
                    </label>
                  </div>
                  <input
                    type="number" {...NUMBER_INPUT_PROPS}
                    step="0.01"
                    min="0"
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
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIssueBooking(null)}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={uploading || initialMeterReading.trim() === '' || (issueBooking.move_in ? !issueBooking.move_in.cap_ok : false)}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-sm rounded-xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {uploading ? 'กำลังออกบิล...' : '🧾 ออกบิลเข้าอยู่ & ส่งให้ผู้จอง'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Upload Signed Paper Contract Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {paperBooking && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-white/10 bg-slate-950/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-white">อัปโหลดสัญญาที่เซ็นแล้ว</h3>
                <p className="text-xs text-slate-400 mt-0.5">ห้อง {paperBooking.room_number} • ผู้จอง: {paperBooking.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPaperBooking(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleUploadPaper} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
                <p className="text-xs text-slate-400">
                  พิมพ์แบบฟอร์มสัญญา → ให้ผู้เช่าและผู้ให้เช่าเซ็นบนกระดาษ → ถ่ายรูปหรือสแกนแล้วอัปโหลดที่นี่ · สัญญามีผลเมื่อบิลเข้าอยู่ชำระครบและอัปโหลดสัญญานี้แล้ว
                </p>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">ไฟล์สัญญาที่เซ็นแล้ว (JPG, PNG หรือ PDF ไม่เกิน 10MB):</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    required
                    onChange={async (e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      setPaperFile(null);
                      setPaperError(null);
                      if (!file) return;
                      // Type from the file content (a renamed text file is refused), size up to 10MB
                      const problem = await checkPaperFile(file);
                      if (problem) {
                        setPaperError(problem);
                        input.value = '';
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => setPaperFile((reader.result as string) || null);
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/20 file:text-primary hover:file:bg-primary/30 cursor-pointer bg-slate-950 p-2 rounded-xl border border-white/10"
                  />
                  {paperError && (
                    <p className="text-[11px] text-rose-400 font-bold mt-2">✕ {paperError}</p>
                  )}
                  {paperFile && (
                    <p className="text-[11px] text-emerald-400 font-bold mt-2">✓ แนบไฟล์สัญญาเรียบร้อยแล้ว</p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-2">วันที่เซ็นสัญญา:</label>
                  <input
                    type="date"
                    required
                    max={todayBangkok}
                    value={paperSignedDate}
                    onChange={(e) => setPaperSignedDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-3 text-sm font-bold text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPaperBooking(null)}
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={uploading || !paperFile || !paperSignedDate}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-primary hover:brightness-110 text-white font-black text-sm rounded-xl shadow-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {uploading ? 'กำลังบันทึก...' : '📤 บันทึกสัญญาที่เซ็นแล้ว'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {inspectId !== null && (
        <InspectionModal contractId={inspectId} onClose={() => { setInspectId(null); fetchBookings({ silent: true }); }} />
      )}

      {dataContractId !== null && (
        <ContractDataModal contractId={dataContractId} onClose={() => setDataContractId(null)} onSaved={() => fetchBookings({ silent: true })} />
      )}

      {/* Preview First Bill Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {previewBillModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-white/10 bg-slate-950/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl">
                  🧾
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-white">รายละเอียดบิลแรกเข้า</h3>
                  <p className="text-xs text-slate-400 mt-0.5">ห้อง {previewBillModal.room_number} • ผู้เช่า: {previewBillModal.guest_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBillModal(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 custom-scrollbar">
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
                  <span className="text-white font-mono font-bold">฿{Number(previewBillModal.move_in?.rent || 0).toLocaleString('th-TH')}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-white/5">
                  <div>
                    <span className="text-slate-300">2. เงินประกันหอพักส่วนที่เหลือ:</span>
                    <p className="text-[10px] text-slate-500">(รวมค่าจอง ฿{Number(previewBillModal.move_in?.bookingFee || 0).toLocaleString('th-TH')} = ประกันรวม ฿{Number(previewBillModal.move_in?.deposit || 0).toLocaleString('th-TH')})</p>
                  </div>
                  <span className="text-white font-mono font-bold">฿{Number(previewBillModal.move_in?.depositAtMoveIn || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="pt-2 flex justify-between items-center text-base font-black">
                  <span className="text-emerald-400">ยอดชำระรวม:</span>
                  <span className="text-emerald-400 font-mono text-xl">
                    ฿{Number(previewBillModal.first_bill_amount ?? previewBillModal.move_in?.dueAtMoveIn ?? 0).toLocaleString('th-TH')}
                  </span>
                </div>
                {!previewBillModal.first_bill_id && (
                  <p className="text-[10px] text-slate-500">ยังไม่ได้ออกบิล — ยอดด้านบนคำนวณจากราคาห้องปัจจุบัน</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewBillModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
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
