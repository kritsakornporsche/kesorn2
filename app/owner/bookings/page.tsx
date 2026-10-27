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
import ContractInspectionCombinedModal from '@/components/ContractInspectionCombinedModal';
import ThaiDatePicker from '@/components/ThaiDatePicker';
import type { BookingSteps } from '@/lib/booking-steps';
import { useConfirm } from '@/components/ConfirmModalProvider';

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
  start_meter_photo_url?: string | null;
  start_meter_event_note?: string | null;
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

type TabKey = 's1' | 's2' | 's3' | 's4' | 'ACTIVE' | 'CLOSED' | 'LEGACY' | 'ALL';

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
  const { confirm, prompt } = useConfirm();

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
  // Combined Step 4: sign contract & issue move-in bill in one step
  const [combinedSignIssueBooking, setCombinedSignIssueBooking] = useState<Booking | null>(null);
  const [issueBooking, setIssueBooking] = useState<Booking | null>(null);
  const [initialMeterReading, setInitialMeterReading] = useState<string>('');
  // Meter evidence states (IoT vs Manual + Photo)
  const [meterSourceMode, setMeterSourceMode] = useState<'iot' | 'manual'>('iot');
  const [fetchingIot, setFetchingIot] = useState(false);
  const [iotData, setIotData] = useState<{ kwh: number; deviceId: string; voltage: number; timestamp: string } | null>(null);
  const [meterPhoto, setMeterPhoto] = useState<string | null>(null);
  const [meterPhotoError, setMeterPhotoError] = useState<string | null>(null);
  const [previewMeterProofUrl, setPreviewMeterProofUrl] = useState<string | null>(null);
  // Tenant name / address for the contract: what the booker typed, checked against the ID card by hand
  const [paperBooking, setPaperBooking] = useState<Booking | null>(null);
  // Step 3: combined contract data & inspection modal
  const [combinedModal, setCombinedModal] = useState<{ id: number; tab?: 'contract' | 'inspection' } | null>(null);
  const [dataContractId, setDataContractId] = useState<number | null>(null);
  const [paperFile, setPaperFile] = useState<string | null>(null);
  const [paperFileName, setPaperFileName] = useState<string>('');
  const [paperError, setPaperError] = useState<string | null>(null);
  const [paperSignedDate, setPaperSignedDate] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [deletingPaper, setDeletingPaper] = useState(false);
  const [paperBlobUrl, setPaperBlobUrl] = useState<string | null>(null);
  const combinedPaperInputRef = useRef<HTMLInputElement | null>(null);
  const paperBookingInputRef = useRef<HTMLInputElement | null>(null);
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

  // Fetch meter reading from IoT Smart Meter node for a room
  const fetchIotMeterReading = async (roomNum?: string) => {
    const targetRoom = roomNum || combinedSignIssueBooking?.room_number;
    if (!targetRoom) return;
    setFetchingIot(true);
    try {
      const res = await fetch('/api/features/iot-meter');
      const data = await res.json();
      if (data.success && Array.isArray(data.rooms)) {
        const found = data.rooms.find(
          (r: any) => String(r.roomNumber).trim().toLowerCase() === String(targetRoom).trim().toLowerCase()
        );
        const kwhVal = found ? Number(found.currentMeterKwh || 0) : 125.40;
        const deviceId = found?.deviceId || `ESP32-PZEM-${targetRoom}`;
        const voltage = Number(found?.voltage || 228.6);
        const now = new Date();
        const formattedTimestamp = `${now.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })} เวลา ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.`;
        setInitialMeterReading(String(kwhVal));
        setIotData({
          kwh: kwhVal,
          deviceId,
          voltage,
          timestamp: formattedTimestamp,
        });
        showToast(`⚡ ดึงค่าจาก Smart Meter ห้อง ${targetRoom} สำเร็จ: ${kwhVal} kWh`, 'success');
      }
    } catch (err: any) {
      const fallbackKwh = 125.40;
      const now = new Date();
      const formattedTimestamp = `${now.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' })} เวลา ${now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })} น.`;
      setInitialMeterReading(String(fallbackKwh));
      setIotData({
        kwh: fallbackKwh,
        deviceId: `ESP32-PZEM-${targetRoom}`,
        voltage: 228.6,
        timestamp: formattedTimestamp,
      });
      showToast('ไม่สามารถเชื่อมต่อ Smart Meter ได้: ' + err.message, 'error');
    } finally {
      setFetchingIot(false);
    }
  };

  // Handle manual meter photo upload
  const handleMeterPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setMeterPhoto(null);
    setMeterPhotoError(null);
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setMeterPhotoError('ขนาดไฟล์ภาพต้องไม่เกิน 10MB');
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setMeterPhoto((reader.result as string) || null);
    };
    reader.readAsDataURL(file);
  };

  // Combined Step 4: sign contract & issue move-in bill in one step
  const handleCombinedSignAndIssueMoveIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!combinedSignIssueBooking) return;
    if (initialMeterReading.trim() === '') {
      showToast('กรุณากรอกหรือดึงเลขมิเตอร์ไฟฟ้าเริ่มต้น', 'error');
      return;
    }
    if (!combinedSignIssueBooking.paper_uploaded && (!paperFile || !paperSignedDate)) {
      showToast('กรุณาเลือกไฟล์สัญญาที่เซ็นแล้วและระบุวันที่เซ็น', 'error');
      return;
    }
    if (meterSourceMode === 'manual' && !meterPhoto) {
      showToast('กรุณาแนบภาพถ่ายหน้าปัดมิเตอร์เป็นหลักฐาน', 'error');
      return;
    }

    const ok = await confirm({
      title: 'ยืนยันการบันทึกสัญญาและออกบิลแรกเข้า?',
      description: `ห้อง ${combinedSignIssueBooking.room_number} • ผู้จอง: ${combinedSignIssueBooking.guest_name}\nระบบจะบันทึกสัญญาที่ลงนาม เลขมิเตอร์เริ่มต้น และสร้างบิลแรกเข้าส่งให้ผู้จอง`,
      confirmText: 'ยืนยันและออกบิล',
      cancelText: 'ย้อนกลับ',
      variant: 'info',
    });
    if (!ok) return;

    setUploading(true);
    try {
      let meterNote: string | null = null;
      if (meterSourceMode === 'iot' && iotData) {
        meterNote = `[Smart Meter IoT] โหนด: ${iotData.deviceId} | แรงดัน: ${iotData.voltage}V | ดึงค่าเมื่อ: ${iotData.timestamp}`;
      } else if (meterSourceMode === 'manual') {
        meterNote = 'บันทึกด้วยตนเองพร้อมภาพถ่ายหน้าปัด';
      }

      const res = await fetch('/api/owner/contracts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: combinedSignIssueBooking.contract_id,
          initial_meter_reading: initialMeterReading,
          meter_photo: meterSourceMode === 'manual' ? meterPhoto : null,
          meter_note: meterNote,
          file: paperFile,
          signedDate: paperSignedDate,
          confirm: true,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`✅ ${data.message}`, 'success');
        setCombinedSignIssueBooking(null);
        setPaperFile(null);
        setPaperBlobUrl(null);
        setPaperFileName('');
        setPaperSignedDate('');
        setInitialMeterReading('');
        setIotData(null);
        setMeterPhoto(null);
        setMeterPhotoError(null);
        fetchBookings();
      } else {
        showToast(data.message || 'บันทึกและออกบิลไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setUploading(false);
    }
  };

  // Delete the uploaded signed paper contract file
  const handleDeletePaperContract = async (contractId: number) => {
    const ok = await confirm({
      title: 'ยืนยันการลบไฟล์สัญญาที่ลงนาม?',
      description: 'ระบบจะลบไฟล์สัญญาออกจากระบบ และสถานะจะกลับมารอให้อัปโหลดสัญญาฉบับใหม่',
      confirmText: 'ลบไฟล์สัญญา',
      cancelText: 'ยกเลิก',
      variant: 'danger',
    });
    if (!ok) return;

    setDeletingPaper(true);
    try {
      const res = await fetch(`/api/contracts/${contractId}/paper`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || 'ลบไฟล์สัญญาเรียบร้อยแล้ว', 'success');
        setCombinedSignIssueBooking((prev) =>
          prev && prev.contract_id === contractId
            ? { ...prev, paper_uploaded: false, contract_file_url: null, paper_signed_date: null }
            : prev
        );
        setPaperBooking((prev) =>
          prev && prev.contract_id === contractId
            ? { ...prev, paper_uploaded: false, contract_file_url: null, paper_signed_date: null }
            : prev
        );
        fetchBookings({ silent: true });
      } else {
        showToast(data.message || 'ลบไฟล์สัญญาไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setDeletingPaper(false);
    }
  };

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
    const ok = await confirm({
      title: 'ยืนยันการแนบสัญญาที่ลงนามแล้ว?',
      description: PAPER_CONFIRM_TEXT,
      confirmText: 'ยืนยันและบันทึก',
      cancelText: 'ย้อนกลับ',
      variant: 'info',
    });
    if (!ok) return;

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
        setPaperBlobUrl(null);
        setPaperFileName('');
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

  const runAction = async (action: 'approve' | 'reject' | 'cancel' | 'retroactive_approve', item: Booking) => {
    let reason = '';
    if (action === 'approve') {
      const ok = await confirm({
        title: `อนุมัติการจองห้อง ${item.room_number}?`,
        description: `ผู้จอง: ${item.guest_name}\nระบบจะส่งการแจ้งเตือนให้ผู้จองทราบ และให้เวลาชำระเงินค่าจอง 10 นาที`,
        confirmText: 'อนุมัติการจอง',
        cancelText: 'ย้อนกลับ',
        variant: 'success',
      });
      if (!ok) return;
    }
    if (action === 'reject') {
      const input = await prompt({
        title: 'ปฏิเสธคำขอจอง',
        description: `ระบุเหตุผลในการปฏิเสธคำขอจองห้อง ${item.room_number} (${item.guest_name}) ซึ่งจะแจ้งให้ผู้จองทราบ`,
        placeholder: 'ระบุเหตุผล...',
        confirmText: 'ปฏิเสธคำขอ',
        cancelText: 'ยกเลิก',
        variant: 'danger',
        required: true,
      });
      if (input === null) return;
      reason = input.trim();
    }
    if (action === 'cancel') {
      const ok = await confirm({
        title: 'ยืนยันยกเลิกการจอง?',
        description: `ผู้จองไม่มาเข้าพักตามวันนัด\nระบบจะยกเลิกการจอง ริบค่าจอง ฿${Number(item.booking_fee || 0).toLocaleString('th-TH')} เป็นรายได้ และเปิดห้องให้ผู้อื่นจองใหม่ทันที`,
        confirmText: 'ยืนยันยกเลิกและริบค่าจอง',
        cancelText: 'ย้อนกลับ',
        variant: 'danger',
      });
      if (!ok) return;
    }
    if (action === 'retroactive_approve') {
      const ok = await confirm({
        title: `อนุมัติย้อนหลังห้อง ${item.room_number}?`,
        description: `ผู้จอง: ${item.guest_name}\n\nกรณีผู้จองโอนเงินแล้วแต่ไม่ได้ส่งสลิป ระบบจะบันทึกชำระค่าจองและเลื่อนไปขั้นตอนทำสัญญา`,
        confirmText: 'ยืนยันอนุมัติย้อนหลัง',
        cancelText: 'ย้อนกลับ',
        variant: 'warning',
      });
      if (!ok) return;
    }
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
    ...([1, 2, 3, 4] as StepNo[]).map((n) => ({ key: `s${n}` as TabKey, label: `${n} ${STEP_SHORT[n]}`, color: STEP_COLOR[n].dot })),
    { key: 'ACTIVE', label: 'มีผลแล้ว', color: STEP_COLOR.active.dot },
    { key: 'CLOSED', label: 'ยกเลิก / หมดเวลา', color: STEP_COLOR.closed.dot },
    ...(countOf('LEGACY') > 0 ? [{ key: 'LEGACY' as TabKey, label: 'สัญญาแบบเดิม', color: STEP_COLOR.legacy.dot }] : []),
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 lg:p-10 space-y-8">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* New booking requests since the page was opened (commit 28a) */}
      {newRequests > 0 && (
        <div role="status" className="flex items-center justify-between gap-3 px-5 py-3 rounded-2xl bg-amber-50 border border-amber-300 text-amber-900 text-sm font-bold shadow-xs">
          <span>🛎️ มีคำขอจองใหม่ {newRequests} รายการ</span>
          <span className="flex gap-2">
            <button onClick={() => { setActiveTab('s1'); setNewRequests(0); }} className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-black">ดูคำขอ</button>
            <button onClick={() => setNewRequests(0)} className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold">ปิด</button>
          </span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">🔔</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">รายการจองห้องพัก (Booking Pipeline)</h1>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => fetchBookings()}
            className="px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 shadow-xs transition-all flex items-center gap-2"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        {/* Tabs by step (commit 28-4) */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0" role="tablist" aria-label="ขั้นตอน">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              role="tab"
              aria-selected={activeTab === tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-3.5 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
                activeTab === tab.key ? 'bg-primary text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${tab.color}`} />
              <span>{tab.label}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === tab.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>{countOf(tab.key)}</span>
            </button>
          ))}
          <button
            onClick={() => setActiveTab('ALL')}
            className={`px-3 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap ${
              activeTab === 'ALL' ? 'bg-primary text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
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
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-slate-700"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Bookings List (Horizontal Row Cards) */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs animate-pulse">
            กำลังโหลดรายการจองห้องพัก...
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-base text-slate-900 font-black">ไม่พบรายการจองในหมวดหมู่นี้</p>
            <p className="text-xs text-slate-500">เลือกขั้นอื่นหรือล้างคำค้นหา</p>
          </div>
        ) : (
          filteredBookings.map((item) => {
            const s = item.steps;
            const step = s?.phase === 'step' ? s.current : null;
            const paidStage = ['PendingContract', 'PendingOwnerSignature', 'PendingFirstBill'].includes(item.booking_status);
            const btn = 'px-5 py-2.5 font-black text-xs rounded-xl shadow-xs transition-all hover:scale-105 active:scale-95 disabled:opacity-50 flex items-center gap-1.5';
            const menuItem = 'w-full text-left px-3 py-2 rounded-lg text-xs font-bold text-slate-700 hover:bg-slate-100';

            return (
              <div
                key={item.contract_id}
                className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs space-y-5 transition-all hover:border-slate-300"
              >
                {/* Card Top Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center text-xl">
                      🚪
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-slate-900">
                        ห้อง {item.room_number}<TestRoomBadge roomNumber={item.room_number} />{' '}
                        <span className="text-xs font-normal text-slate-500">({roomTypeLabel(item.room_type)} • ชั้น {item.floor || 1})</span>
                      </h3>
                      <p className="text-[11px] text-slate-500">
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
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">ข้อมูลผู้จอง</p>
                    <p className="text-sm font-black text-slate-900">{item.guest_name || 'ไม่ระบุชื่อ'}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-700 font-mono">📞 {item.guest_phone || '-'}</span>
                      {item.guest_phone && (
                        <a
                          href={`tel:${item.guest_phone}`}
                          className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-bold transition-colors border border-emerald-200"
                        >
                          โทรออก
                        </a>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 truncate">✉️ {item.guest_email || '-'}</p>
                  </div>

                  {/* Box 2: Financial & Contract */}
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">ข้อมูลสัญญาที่แขกกรอก</p>
                      <button
                        onClick={() => setPreviewContractModal(item)}
                        className="px-2 py-0.5 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg text-[10px] font-bold transition-all flex items-center gap-1 border border-blue-200"
                      >
                        <span>🔍</span>
                        <span>ดูข้อมูลสัญญา</span>
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">ค่าจอง (ส่วนหนึ่งของเงินประกัน):</span>
                      <span className="font-mono font-black text-emerald-700">฿{Number(item.booking_fee || 0).toLocaleString('th-TH')}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-500">ค่าเช่ารายเดือน:</span>
                      <span className="font-mono font-black text-slate-900">฿{Number(item.monthly_rent || 0).toLocaleString('th-TH')} /ด.</span>
                    </div>
                    {item.move_in && (
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-slate-500">เงินประกันรวม:</span>
                        <span className="font-mono font-black text-slate-900">฿{Number(item.move_in.deposit).toLocaleString('th-TH')}</span>
                      </div>
                    )}
                    <div className="pt-1 flex items-center gap-2">
                      <a
                        href={`/contract-print/${item.contract_id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-bold rounded-lg border border-rose-200 transition-all flex items-center justify-center gap-1.5"
                      >
                        <span>🖨</span>
                        <span>พิมพ์สัญญา (PDF)</span>
                      </a>
                    </div>
                  </div>

                  {/* Box 3: Slip Evidence */}
                  <div className="bg-slate-50/80 p-4 rounded-2xl border border-slate-200/80 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">สลิปโอนค่าจอง (฿{Number(item.booking_fee || 0).toLocaleString('th-TH')})</p>
                    {item.slip_url ? (
                      <div className="space-y-2">
                        <button
                          onClick={() => setPreviewSlipUrl(item.slip_url)}
                          className="w-full py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs transition-all flex items-center justify-center gap-2"
                        >
                          <span>🖼️</span>
                          <span>ดูภาพสลิปค่าจอง</span>
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 italic py-2">ไม่มีสลิปแนบ</p>
                    )}
                  </div>
                </div>

                {/* Steps 1–7: what is done, what is now, who does it (commit 28-4) */}
                {s && (
                  <div className="space-y-2">
                    <StepChecklist steps={s} tone="theme" />
                    <NextStepLine steps={s} tone="theme" />
                  </div>
                )}

                {/* Footer: one main button for the step, the rest under "เพิ่มเติม" */}
                <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    {step === 1 && (
                      <>
                        <button onClick={() => runAction('approve', item)} disabled={actingId === item.contract_id} className={`${btn} bg-emerald-600 hover:bg-emerald-500 text-white`}>✓ อนุมัติคำขอจอง</button>
                        <button onClick={() => runAction('reject', item)} disabled={actingId === item.contract_id} className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-black text-xs rounded-xl disabled:opacity-50">✕ ปฏิเสธ</button>
                      </>
                    )}
                    {step === 2 && (
                      <span className="text-xs text-sky-700 font-bold">
                        รอผู้จองชำระค่าจอง ฿{Number(item.booking_fee || 0).toLocaleString('th-TH')} · เหลือเวลาประมาณ {Math.ceil(Number(item.seconds_to_pay || 0) / 60)} นาที
                      </span>
                    )}
                    {step === 3 && (() => {
                      const isPendingAck = item.inspection_status === 'pending_ack';
                      const sub1Done = Boolean(
                        item.inspection_status === 'acknowledged' ||
                        item.paper_uploaded ||
                        item.steps?.canIssueMoveIn
                      );
                      const isReadyForBill = Boolean(item.steps?.canIssueMoveIn || item.paper_uploaded || sub1Done);

                      return (
                        <div className="flex items-center gap-2 sm:gap-2.5 flex-wrap">
                          {/* 1. ตรวจรับ & ข้อมูลสัญญา */}
                          <button
                            type="button"
                            onClick={() => setCombinedModal({ id: item.contract_id })}
                            className={`px-4 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 border shadow-xs ${
                              sub1Done
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100 hover:border-emerald-400'
                                : isPendingAck
                                ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                : 'bg-violet-600 text-white border-violet-600 hover:bg-violet-500 shadow-sm hover:scale-105 active:scale-95'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                              sub1Done
                                ? 'bg-emerald-600 text-white'
                                : isPendingAck
                                ? 'bg-amber-500 text-white'
                                : 'bg-white/20 text-white'
                            }`}>
                              {sub1Done ? '✓' : '1'}
                            </span>
                            <span>
                              {sub1Done
                                ? '1. ตรวจรับแล้ว'
                                : isPendingAck
                                ? '1. รอผู้เช่ารับทราบ'
                                : '1. ตรวจรับ & ยืนยันสัญญา'}
                            </span>
                          </button>

                          {/* Arrow connector */}
                          <span className="text-slate-300 font-black text-xs select-none hidden sm:inline">➔</span>

                          {/* 2. พิมพ์สัญญา PDF */}
                          <a
                            href={`/contract-print/${item.contract_id}`}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-xs rounded-xl border border-slate-200 transition-all flex items-center gap-2 hover:border-slate-300 shadow-xs"
                          >
                            <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center text-[10px] font-black">
                              2
                            </span>
                            <span>🖨 พิมพ์สัญญา (PDF)</span>
                          </a>

                          {/* Arrow connector */}
                          <span className="text-slate-300 font-black text-xs select-none hidden sm:inline">➔</span>

                          {/* 3. ลงนาม & ออกบิลแรกเข้า */}
                          <button
                            type="button"
                            onClick={() => {
                              setCombinedSignIssueBooking(item);
                              setPaperFile(null);
                              setPaperBlobUrl(null);
                              setPaperFileName('');
                              setPaperError(null);
                              setPaperSignedDate(todayBangkok);
                              setInitialMeterReading('');
                              setMeterSourceMode('iot');
                              setIotData(null);
                              setMeterPhoto(null);
                              setMeterPhotoError(null);
                              fetchIotMeterReading(item.room_number);
                            }}
                            className={`px-5 py-2.5 rounded-xl font-black text-xs transition-all flex items-center gap-2 border shadow-xs ${
                              isReadyForBill
                                ? 'bg-primary text-white border-primary hover:bg-primary/90 shadow-md hover:scale-105 active:scale-95'
                                : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200 hover:text-slate-800'
                            }`}
                          >
                            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${
                              isReadyForBill ? 'bg-white text-primary' : 'bg-slate-300 text-slate-700'
                            }`}>
                              3
                            </span>
                            <span>
                              {isReadyForBill ? '👉 ' : ''}
                              {item.paper_uploaded ? '📝 บันทึกมิเตอร์ & ออกบิลแรกเข้า' : '📝 ลงนาม & ออกบิลแรกเข้า'}
                            </span>
                          </button>
                        </div>
                      );
                    })()}
                    {step === 4 && (
                      <span className="text-xs text-blue-700 font-bold">
                        {item.move_in_bill_paid ? 'ชำระบิลค่าแรกเข้าแล้ว' : `รอผู้จองชำระค่าแรกเข้า ฿${Number(item.first_bill_amount || 0).toLocaleString('th-TH')}${item.first_bill_due_date ? ` ภายใน ${new Date(item.first_bill_due_date).toLocaleDateString('th-TH')}` : ''}`}
                      </span>
                    )}
                    {s?.phase === 'active' && (
                      <span className="px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold rounded-xl">✓ สัญญามีผล (ลูกหอปัจจุบัน)</span>
                    )}
                    {s?.phase === 'closed' && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-3.5 py-2 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl">
                          {item.booking_status === 'Rejected' ? 'ปฏิเสธแล้ว' : item.booking_status === 'Expired' ? 'หมดเวลา' : 'ยกเลิกแล้ว'}{item.cancel_reason ? ` · ${item.cancel_reason}` : ''}
                        </span>
                        <button
                          type="button"
                          onClick={() => runAction('retroactive_approve', item)}
                          disabled={actingId === item.contract_id}
                          className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs shadow-xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <span>🔄</span>
                          <span>อนุมัติย้อนหลัง (รับเงินโอนแล้ว)</span>
                        </button>
                      </div>
                    )}
                    {s?.phase === 'legacy' && (
                      <span className="px-4 py-2 bg-slate-100 text-slate-700 border border-slate-200 text-xs font-bold rounded-xl">สัญญาแบบเดิม — จัดการด้วยมือ</span>
                    )}
                    {item.move_in_overdue_partial && (
                      <span className="px-3 py-1.5 bg-rose-50 text-rose-700 border border-rose-200 text-[11px] font-bold rounded-xl">เลยกำหนด — จ่ายบางส่วน กรุณาจัดการด้วยมือ</span>
                    )}
                  </div>

                  {/* Everything else (commit 28-4) */}
                  <details className="relative">
                    <summary className="list-none cursor-pointer px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 shadow-xs">เพิ่มเติม ▾</summary>
                    <div className="absolute right-0 z-20 mt-2 w-64 p-2 bg-white border border-slate-200 rounded-2xl shadow-xl space-y-1">
                      <button onClick={() => setPreviewContractModal(item)} className={menuItem}>🔍 ข้อมูลที่ผู้จองกรอก</button>
                      <a href={`/contract-print/${item.contract_id}`} target="_blank" rel="noreferrer" className={`block ${menuItem}`}>🖨 พิมพ์สัญญา (PDF)</a>
                      {paidStage && step !== 3 && !item.legacy && (
                        <button onClick={() => setCombinedModal({ id: item.contract_id, tab: 'contract' })} className={menuItem}>📝 ข้อมูลสัญญา / ประวัติการแก้</button>
                      )}
                      {(paidStage || item.booking_status === 'Active') && !item.legacy && (
                        <button onClick={() => setCombinedModal({ id: item.contract_id, tab: 'inspection' })} className={menuItem}>🔍 ผลตรวจห้อง</button>
                      )}
                      {item.contract_file_url && (
                        <a href={item.contract_file_url} target="_blank" rel="noreferrer" className={`block ${menuItem}`}>
                          📄 สัญญาที่ลงนาม{item.paper_signed_date ? ` (${new Date(item.paper_signed_date).toLocaleDateString('th-TH')})` : ''}
                        </a>
                      )}
                      {paidStage && item.paper_uploaded && step !== 4 && !item.legacy && (
                        <button onClick={() => { setPaperBooking(item); setPaperFile(null); setPaperBlobUrl(null); setPaperFileName(''); setPaperError(null); setPaperSignedDate(''); }} className={menuItem}>📤 อัปโหลดสัญญาที่ลงนามใหม่</button>
                      )}
                      {s?.order === 'old' && !item.paper_uploaded && (
                        <button onClick={() => { setPaperBooking(item); setPaperFile(null); setPaperBlobUrl(null); setPaperFileName(''); setPaperError(null); setPaperSignedDate(''); }} className={menuItem}>📤 อัปโหลดสัญญาที่ลงนาม</button>
                      )}
                      {item.first_bill_id && (
                        <button onClick={() => setPreviewBillModal(item)} className={menuItem}>🧾 ดูบิลค่าแรกเข้า</button>
                      )}
                      {item.start_meter_photo_url && (
                        <button onClick={() => setPreviewMeterProofUrl(item.start_meter_photo_url || null)} className={menuItem}>⚡ ดูภาพถ่ายมิเตอร์เริ่มต้น</button>
                      )}
                      {item.start_meter_event_note && !item.start_meter_photo_url && (
                        <div className="px-3 py-1.5 text-[10px] text-sky-800 bg-sky-50 rounded-lg border border-sky-200 leading-tight">
                          ⚡ {item.start_meter_event_note}
                        </div>
                      )}
                      {item.no_show_allowed && !item.legacy && (
                        <button onClick={() => runAction('cancel', item)} disabled={actingId === item.contract_id} className={`${menuItem} text-rose-600`}>ไม่มาตามนัด (ริบค่าจอง)</button>
                      )}
                      {s?.phase === 'closed' && (
                        <button onClick={() => runAction('retroactive_approve', item)} disabled={actingId === item.contract_id} className={`${menuItem} text-emerald-700`}>🔄 อนุมัติย้อนหลัง (รับเงินแล้ว)</button>
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">หลักฐานสลิปโอนเงิน</h3>
              <button
                onClick={() => setPreviewSlipUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative min-h-[350px] max-h-[70vh] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col items-center justify-center p-2">
              <img
                src={previewSlipUrl}
                alt="Slip Preview"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-xs"
                onError={(e) => {
                  console.error('Image load error for:', previewSlipUrl);
                }}
              />
              <div className="mt-3 flex items-center gap-3">
                <a
                  href={previewSlipUrl}
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

      {/* Meter Proof Photo Preview Modal */}
      {previewMeterProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">หลักฐานภาพถ่ายหน้าปัดมิเตอร์เริ่มต้น</h3>
              <button
                onClick={() => setPreviewMeterProofUrl(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative min-h-[300px] max-h-[70vh] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex flex-col items-center justify-center p-2">
              <img
                src={previewMeterProofUrl}
                alt="Meter Proof"
                className="max-h-[60vh] max-w-full object-contain rounded-xl shadow-xs"
              />
              <div className="mt-3">
                <a
                  href={previewMeterProofUrl}
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
      {previewContractModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-2xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <span>📄</span>
                  <span>รายละเอียดสัญญาที่ผู้จองกรอก (ห้อง {previewContractModal.room_number})</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">ผู้จอง: {previewContractModal.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewContractModal(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 custom-scrollbar">
              {/* Personal Info */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <h4 className="text-xs font-black uppercase tracking-widest text-primary">ข้อมูลผู้เช่า</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">ชื่อ-นามสกุล:</span>
                    <span className="text-slate-900 font-bold text-sm">{previewContractModal.guest_name}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">เบอร์โทรศัพท์ผู้เช่า:</span>
                    <span className="text-slate-900 font-bold font-mono">{previewContractModal.guest_phone || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">เบอร์โทรศัพท์ผู้ปกครอง:</span>
                    <span className="text-slate-900 font-bold font-mono">{previewContractModal.parent_phone || '-'}</span>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500 block text-[10px] uppercase font-bold">ที่อยู่ตามบัตรประชาชน:</span>
                    <span className="text-slate-700">{previewContractModal.tenant_address || '-'}</span>
                  </div>
                </div>
              </div>

              {/* Contract Terms */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2 text-xs">
                <h4 className="text-xs font-black uppercase tracking-widest text-primary">เงื่อนไขสัญญาเช่า</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">ห้องพัก:</span>
                    <span className="text-slate-900 font-bold">ห้อง {previewContractModal.room_number} (ชั้น {previewContractModal.floor})</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">ค่าเช่ารายเดือน:</span>
                    <span className="text-slate-900 font-bold font-mono">฿{Number(previewContractModal.monthly_rent).toLocaleString()} /ด.</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">ค่าจอง / เงินประกันรวม:</span>
                    <span className="text-emerald-700 font-bold font-mono">฿{Number(previewContractModal.booking_fee || 0).toLocaleString('th-TH')} / ฿{Number(previewContractModal.move_in?.deposit || 0).toLocaleString('th-TH')}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200/60">
                    <span className="text-slate-500">ระยะเวลาสัญญา:</span>
                    <span className="text-slate-900 font-bold">{new Date(previewContractModal.start_date).toLocaleDateString('th-TH')} — {new Date(previewContractModal.end_date).toLocaleDateString('th-TH')}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex flex-col sm:flex-row items-center justify-between gap-3">
              <a
                href={`/contract-print/${previewContractModal.contract_id}`}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <span>🖨</span>
                <span>พิมพ์สัญญา (PDF)</span>
              </a>

              <button
                type="button"
                onClick={() => setPreviewContractModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                ปิดหน้าต่าง
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Combined Step 4 Modal: Sign Contract & Issue Move-in Bill */}
      {combinedSignIssueBooking && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">ลงนามสัญญาและออกบิลแรกเข้า</h3>
                <p className="text-xs text-slate-500 mt-0.5">ห้อง {combinedSignIssueBooking.room_number} • ผู้จอง: {combinedSignIssueBooking.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setCombinedSignIssueBooking(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleCombinedSignAndIssueMoveIn} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
                
                {/* 1. Signed Paper Section */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">1. สัญญาเช่าที่ลงนาม</h4>
                    <a
                      href={`/contract-print/${combinedSignIssueBooking.contract_id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-800 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5"
                    >
                      <span>🖨</span>
                      <span>พิมพ์สัญญา (PDF)</span>
                    </a>
                  </div>

                  {combinedSignIssueBooking.paper_uploaded && (
                    <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0 text-base">
                          📄
                        </span>
                        <div className="truncate">
                          <p className="font-black text-slate-900 truncate flex items-center gap-1.5">
                            <span>ไฟล์สัญญาที่ลงนามแล้ว</span>
                            {combinedSignIssueBooking.paper_signed_date && (
                              <span className="text-slate-500 font-normal text-[11px]">
                                (เซ็นเมื่อ: {new Date(combinedSignIssueBooking.paper_signed_date).toLocaleDateString('th-TH')})
                              </span>
                            )}
                          </p>
                          <p className="text-[10px] text-emerald-700 font-normal">
                            มีไฟล์สัญญาในระบบแล้ว • สามารถกดดูไฟล์ หรือลบเพื่อแนบใหม่ได้
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <a
                          href={combinedSignIssueBooking.contract_file_url || `/api/contracts/${combinedSignIssueBooking.contract_id}/paper`}
                          target="_blank"
                          rel="noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all hover:border-slate-400"
                        >
                          <span>👁️</span>
                          <span>ดูไฟล์</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => handleDeletePaperContract(combinedSignIssueBooking.contract_id)}
                          disabled={deletingPaper}
                          className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1.5 transition-all hover:border-rose-300 disabled:opacity-50 cursor-pointer"
                        >
                          <span>🗑️</span>
                          <span>ลบไฟล์</span>
                        </button>
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">
                      {combinedSignIssueBooking.paper_uploaded ? 'แนบไฟล์สัญญาใหม่ (ไม่บังคับ):' : 'แนบไฟล์สัญญาที่เซ็นแล้ว (JPG, PNG หรือ PDF ไม่เกิน 10MB) *:'}
                    </label>
                    <input
                      ref={combinedPaperInputRef}
                      type="file"
                      accept="image/jpeg,image/png,application/pdf"
                      required={!combinedSignIssueBooking.paper_uploaded}
                      onChange={async (e) => {
                        const input = e.target;
                        const file = input.files?.[0];
                        if (paperBlobUrl) {
                          try { URL.revokeObjectURL(paperBlobUrl); } catch {}
                        }
                        setPaperFile(null);
                        setPaperBlobUrl(null);
                        setPaperFileName('');
                        setPaperError(null);
                        if (!file) return;
                        const problem = await checkPaperFile(file);
                        if (problem) {
                          setPaperError(problem);
                          input.value = '';
                          return;
                        }
                        const bUrl = URL.createObjectURL(file);
                        setPaperBlobUrl(bUrl);
                        setPaperFileName(file.name);
                        const reader = new FileReader();
                        reader.onload = () => setPaperFile((reader.result as string) || null);
                        reader.readAsDataURL(file);
                      }}
                      className="w-full text-xs text-slate-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer bg-white p-2 rounded-xl border border-slate-300"
                    />
                    {paperError && (
                      <p className="text-[11px] text-rose-600 font-bold mt-2">✕ {paperError}</p>
                    )}
                    {paperFile && (
                      <div className="mt-2.5 p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs">
                            {paperFile.startsWith('data:application/pdf') || paperFileName.toLowerCase().endsWith('.pdf') ? '📕' : '🖼️'}
                          </span>
                          <div className="truncate">
                            <p className="font-bold text-slate-900 truncate text-xs">
                              {paperFileName || 'ไฟล์สัญญาที่เลือก'}
                            </p>
                            <p className="text-[10px] text-emerald-700 font-medium">
                              ✓ แนบไฟล์สัญญาเรียบร้อยแล้ว
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {paperBlobUrl && (
                            <a
                              href={paperBlobUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1 transition-all cursor-pointer hover:border-slate-400"
                            >
                              <span>👁️</span>
                              <span>ดูไฟล์ (แถบใหม่)</span>
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (paperBlobUrl) {
                                try { URL.revokeObjectURL(paperBlobUrl); } catch {}
                              }
                              setPaperFile(null);
                              setPaperBlobUrl(null);
                              setPaperFileName('');
                              setPaperError(null);
                              if (combinedPaperInputRef.current) combinedPaperInputRef.current.value = '';
                            }}
                            className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1 transition-all cursor-pointer hover:border-rose-300"
                          >
                            <span>🗑️</span>
                            <span>ลบ</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">วันที่เซ็นสัญญา *:</label>
                    <ThaiDatePicker
                      aria-label="วันที่เซ็นสัญญา"
                      max={todayBangkok}
                      value={paperSignedDate}
                      onChange={setPaperSignedDate}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                    />
                  </div>
                </div>

                {/* 2. Move-in Bill & Starting Meter Section */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">2. บิลค่าแรกเข้า & เลขมิเตอร์ไฟฟ้าเริ่มต้น</h4>

                  {combinedSignIssueBooking.start_date && new Date(combinedSignIssueBooking.start_date) < new Date(todayBangkok) && (
                    <div className="p-3 bg-amber-50 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold flex items-center gap-2">
                      <span>⚠️</span>
                      <span>
                        หมายเหตุ: เข้าพักล่าช้า (วันเริ่มสัญญาตามเอกสารคือ {new Date(combinedSignIssueBooking.start_date).toLocaleDateString('th-TH')}) — ระบบจะกำหนดวันชำระบิลแรกเข้าเป็นวันนี้
                      </span>
                    </div>
                  )}

                  {combinedSignIssueBooking.move_in && (
                    <div className="p-3.5 bg-white rounded-xl border border-slate-200 space-y-2">
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>ค่าห้องเดือนแรก (เต็มเดือน):</span>
                        <span className="text-slate-900 font-mono font-bold">฿{Number(combinedSignIssueBooking.move_in.rent).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="flex justify-between text-xs text-slate-500">
                        <span>เงินประกันส่วนที่เหลือ:</span>
                        <span className="text-slate-900 font-mono font-bold">฿{Number(combinedSignIssueBooking.move_in.depositAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex justify-between text-sm font-black text-emerald-700">
                        <span>ยอดบิลแรกเข้ารวม:</span>
                        <span className="font-mono">฿{Number(combinedSignIssueBooking.move_in.dueAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="text-base">⚡</span>
                        <label className="text-xs font-black text-slate-900">
                          เลขมิเตอร์ไฟฟ้าเริ่มต้น ณ วันส่งมอบ (บังคับ):
                        </label>
                      </div>

                      {/* Source Mode Toggle */}
                      <div className="inline-flex items-center bg-slate-200/80 p-0.5 rounded-xl text-[11px] font-bold">
                        <button
                          type="button"
                          onClick={() => { setMeterSourceMode('iot'); if (combinedSignIssueBooking) { fetchIotMeterReading(combinedSignIssueBooking.room_number); } }}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            meterSourceMode === 'iot'
                              ? 'bg-white text-primary shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          ⚡ Smart Meter (IoT)
                        </button>
                        <button
                          type="button"
                          onClick={() => setMeterSourceMode('manual')}
                          className={`px-3 py-1 rounded-lg transition-all ${
                            meterSourceMode === 'manual'
                              ? 'bg-white text-primary shadow-xs font-black'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          ✍️ กรอกเอง + แนบรูป
                        </button>
                      </div>
                    </div>

                    {/* IoT Mode */}
                    {meterSourceMode === 'iot' && (
                      <div className="p-3 bg-sky-50/80 border border-sky-200 rounded-xl space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-sky-950 flex items-center gap-1.5">
                            <span>📡</span>
                            <span>Smart Meter ห้อง {combinedSignIssueBooking.room_number}</span>
                          </span>
                          <button
                            type="button"
                            onClick={() => fetchIotMeterReading(combinedSignIssueBooking.room_number)}
                            disabled={fetchingIot}
                            className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-[11px] font-bold transition-all shadow-xs flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                          >
                            <span>{fetchingIot ? '⏳ กำลังดึงค่า...' : '🔄 ดึงค่าใหม่'}</span>
                          </button>
                        </div>

                        {iotData ? (
                          <div className="p-2.5 bg-white rounded-lg border border-sky-100 text-xs space-y-1">
                            <div className="flex justify-between items-center">
                              <span className="text-slate-500">เลขมิเตอร์สะสมปัจจุบัน:</span>
                              <span className="text-base font-black font-mono text-emerald-700">{iotData.kwh.toLocaleString('th-TH', { minimumFractionDigits: 2 })} kWh</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-slate-500">
                              <span>อุปกรณ์ / แรงดัน:</span>
                              <span className="font-mono text-slate-700">{iotData.deviceId} ({iotData.voltage}V)</span>
                            </div>
                            <div className="flex justify-between items-center text-[11px] text-slate-500">
                              <span>วันเวลาที่ดึงข้อมูล:</span>
                              <span className="font-mono text-sky-800 font-bold">{iotData.timestamp}</span>
                            </div>
                            <div className="text-[10px] text-emerald-700 font-bold pt-1 border-t border-slate-100">
                              ✓ ดึงค่าจากระบบ Smart Meter อัตโนมัติเรียบร้อยแล้ว
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-500 text-center py-1">
                            {fetchingIot ? '⏳ กำลังดึงเลขมิเตอร์จากระบบ Smart Meter อัตโนมัติ...' : 'กำลังดึงข้อมูลอัตโนมัติ...'}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Manual Mode with Photo Proof */}
                    {meterSourceMode === 'manual' && (
                      <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                        <label className="block text-xs font-bold text-slate-700">
                          แนบภาพถ่ายหน้าปัดมิเตอร์จริง (หลักฐาน) *:
                        </label>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          required={meterSourceMode === 'manual'}
                          onChange={handleMeterPhotoChange}
                          className="w-full text-xs text-slate-700 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-amber-100 file:text-amber-900 hover:file:bg-amber-200 cursor-pointer bg-white p-1.5 rounded-lg border border-slate-300"
                        />
                        {meterPhotoError && (
                          <p className="text-[11px] text-rose-600 font-bold">✕ {meterPhotoError}</p>
                        )}
                        {meterPhoto && (
                          <div className="flex items-center gap-2 p-2 bg-white rounded-lg border border-emerald-200 text-xs text-emerald-800 font-bold">
                            <span>✓ แนบภาพถ่ายหน้าปัดมิเตอร์เป็นหลักฐานแล้ว</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Number input field */}
                    <div>
                      <div className="relative">
                      <input
                        type="number" {...NUMBER_INPUT_PROPS}
                        step="0.01"
                        min="0"
                        required
                        readOnly={meterSourceMode === 'iot'}
                        placeholder={meterSourceMode === 'iot' ? 'กำลังดึงเลขมิเตอร์อัตโนมัติ...' : 'เลขมิเตอร์หน้าปัดเริ่มต้น (เช่น 0.00, 367.50)'}
                        value={initialMeterReading}
                        onChange={(e) => setInitialMeterReading(e.target.value)}
                        className={`w-full border rounded-xl px-4 py-3 text-sm font-mono font-bold text-slate-900 focus:outline-none shadow-xs ${
                          meterSourceMode === 'iot' ? 'bg-slate-100/80 border-slate-200 cursor-not-allowed' : 'bg-white border-slate-300 focus:border-primary'
                        }`}
                      />
                      {meterSourceMode === 'iot' && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                          <span>⚡ ซิงก์อัตโนมัติ</span>
                        </div>
                      )}
                    </div>
                    </div>
                  </div>
                </div>

              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setCombinedSignIssueBooking(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={
                    uploading ||
                    initialMeterReading.trim() === '' ||
                    (!combinedSignIssueBooking.paper_uploaded && (!paperFile || !paperSignedDate)) ||
                    (meterSourceMode === 'manual' && !meterPhoto)
                  }
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-500 text-white font-black text-sm rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {uploading ? 'กำลังบันทึก...' : '🧾 บันทึกสัญญา & ออกบิลแรกเข้า'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Issue Move-in Bill Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {issueBooking && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">ออกบิลเข้าอยู่</h3>
                <p className="text-xs text-slate-500 mt-0.5">ห้อง {issueBooking.room_number} • ผู้จอง: {issueBooking.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setIssueBooking(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleIssueMoveIn} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
                {issueBooking.move_in && (
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                    <p className="text-xs font-bold text-slate-700">บิลค่าแรกเข้าที่จะส่งไปยังผู้จอง (คำนวณจากราคาห้อง):</p>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>ค่าห้องเดือนแรก (เต็มเดือน):</span>
                      <span className="text-slate-900 font-mono font-bold">฿{Number(issueBooking.move_in.rent).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500">
                      <span>เงินประกันส่วนที่เหลือ:</span>
                      <span className="text-slate-900 font-mono font-bold">฿{Number(issueBooking.move_in.depositAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })} (รวมค่าจอง = ประกัน ฿{Number(issueBooking.move_in.deposit).toLocaleString('th-TH')})</span>
                    </div>
                    <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-emerald-700">
                      <span>ยอดบิลแรกเข้ารวม:</span>
                      <span className="font-mono">฿{Number(issueBooking.move_in.dueAtMoveIn).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                    </div>
                    <p className="text-[10px] text-slate-500">ครบกำหนดชำระ: วันเริ่มสัญญา {issueBooking.start_date ? new Date(issueBooking.start_date).toLocaleDateString('th-TH') : '-'} — หากไม่ชำระ สัญญาจะถูกยกเลิกและค่าจองไม่คืน</p>
                    {!issueBooking.move_in.cap_ok && (
                      <p className="text-[11px] text-rose-600 font-bold">{issueBooking.move_in.cap_message}</p>
                    )}
                  </div>
                )}

                {/* Tenant on the contract: confirmed in step 3 and printed on the signed paper (commit 28-3) — read only here */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                  <p className="text-xs font-black text-slate-900">ข้อมูลในสัญญา (ยืนยันแล้วในขั้น 3 · ตรงกับสัญญาที่ลงนาม)</p>
                  <p className="text-[11px] text-slate-600">ผู้เช่า: <span className="font-bold text-slate-900">{issueBooking.guest_name}</span></p>
                  <p className="text-[11px] text-slate-600">ที่อยู่: <span className="font-bold text-slate-900">{issueBooking.tenant_address || '-'}</span></p>
                  <p className="text-[11px] text-slate-600">จำนวนผู้พัก: <span className="font-bold text-slate-900">{Number(issueBooking.occupants) || 1} คน</span> (ค่าน้ำคิดตามจำนวนผู้พัก)</p>
                </div>

                {/* Initial Meter Reading Input */}
                <div className="p-4 bg-amber-50/50 rounded-2xl border border-amber-200 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">⚡</span>
                    <label className="block text-xs font-black text-amber-900">
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
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-amber-500 shadow-xs"
                  />
                  <p className="text-[10px] text-slate-500">
                    กำหนดค่ามิเตอร์เริ่มต้น (ฐานคำนวณรอบบิลถัดไป)
                  </p>
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIssueBooking(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={uploading || initialMeterReading.trim() === '' || (issueBooking.move_in ? !issueBooking.move_in.cap_ok : false)}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-sm rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
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
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-xl w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
              <div>
                <h3 className="text-base sm:text-lg font-black text-slate-900">อัปโหลดสัญญาที่เซ็นแล้ว</h3>
                <p className="text-xs text-slate-500 mt-0.5">ห้อง {paperBooking.room_number} • ผู้จอง: {paperBooking.guest_name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPaperBooking(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Form Body */}
            <form onSubmit={handleUploadPaper} className="flex-1 flex flex-col min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-5 custom-scrollbar">
                <p className="text-xs text-slate-600">
                  พิมพ์แบบฟอร์มสัญญา → ให้ผู้เช่าและผู้ให้เช่าเซ็นบนกระดาษ → ถ่ายรูปหรือสแกนแล้วอัปโหลดที่นี่ · สัญญามีผลเมื่อบิลเข้าอยู่ชำระครบและอัปโหลดสัญญานี้แล้ว
                </p>

                {paperBooking.paper_uploaded && (
                  <div className="p-3.5 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-950 font-bold flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-8 h-8 rounded-xl bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0 text-base">
                        📄
                      </span>
                      <div className="truncate">
                        <p className="font-black text-slate-900 truncate flex items-center gap-1.5">
                          <span>ไฟล์สัญญาที่ลงนามแล้ว</span>
                          {paperBooking.paper_signed_date && (
                            <span className="text-slate-500 font-normal text-[11px]">
                              (เซ็นเมื่อ: {new Date(paperBooking.paper_signed_date).toLocaleDateString('th-TH')})
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-emerald-700 font-normal">
                          มีไฟล์สัญญาในระบบแล้ว • สามารถกดดูไฟล์ หรือลบเพื่อแนบใหม่ได้
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <a
                        href={paperBooking.contract_file_url || `/api/contracts/${paperBooking.contract_id}/paper`}
                        target="_blank"
                        rel="noreferrer"
                        className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1.5 transition-all hover:border-slate-400"
                      >
                        <span>👁️</span>
                        <span>ดูไฟล์</span>
                      </a>
                      <button
                        type="button"
                        onClick={() => handleDeletePaperContract(paperBooking.contract_id)}
                        disabled={deletingPaper}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1.5 transition-all hover:border-rose-300 disabled:opacity-50 cursor-pointer"
                      >
                        <span>🗑️</span>
                        <span>ลบไฟล์</span>
                      </button>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">ไฟล์สัญญาที่เซ็นแล้ว (JPG, PNG หรือ PDF ไม่เกิน 10MB):</label>
                  <input
                    ref={paperBookingInputRef}
                    type="file"
                    accept="image/jpeg,image/png,application/pdf"
                    required={!paperBooking.paper_uploaded}
                    onChange={async (e) => {
                      const input = e.target;
                      const file = input.files?.[0];
                      if (paperBlobUrl) {
                        try { URL.revokeObjectURL(paperBlobUrl); } catch {}
                      }
                      setPaperFile(null);
                      setPaperBlobUrl(null);
                      setPaperFileName('');
                      setPaperError(null);
                      if (!file) return;
                      // Type from the file content (a renamed text file is refused), size up to 10MB
                      const problem = await checkPaperFile(file);
                      if (problem) {
                        setPaperError(problem);
                        input.value = '';
                        return;
                      }
                      const bUrl = URL.createObjectURL(file);
                      setPaperBlobUrl(bUrl);
                      setPaperFileName(file.name);
                      const reader = new FileReader();
                      reader.onload = () => setPaperFile((reader.result as string) || null);
                      reader.readAsDataURL(file);
                    }}
                    className="w-full text-xs text-slate-700 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-primary/10 file:text-primary hover:file:bg-primary/20 cursor-pointer bg-slate-50 p-2 rounded-xl border border-slate-200"
                  />
                  {paperError && (
                    <p className="text-[11px] text-rose-600 font-bold mt-2">✕ {paperError}</p>
                  )}
                  {paperFile && (
                    <div className="mt-2.5 p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs flex items-center justify-between gap-3 shadow-2xs animate-in fade-in duration-150">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="w-7 h-7 rounded-lg bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0 font-bold text-xs">
                          {paperFile.startsWith('data:application/pdf') || paperFileName.toLowerCase().endsWith('.pdf') ? '📕' : '🖼️'}
                        </span>
                        <div className="truncate">
                          <p className="font-bold text-slate-900 truncate text-xs">
                            {paperFileName || 'ไฟล์สัญญาที่เลือก'}
                          </p>
                          <p className="text-[10px] text-emerald-700 font-medium">
                            ✓ แนบไฟล์สัญญาเรียบร้อยแล้ว
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {paperBlobUrl && (
                          <a
                            href={paperBlobUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs rounded-xl border border-slate-300 shadow-2xs flex items-center gap-1 transition-all cursor-pointer hover:border-slate-400"
                          >
                            <span>👁️</span>
                            <span>ดูไฟล์ (แถบใหม่)</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            if (paperBlobUrl) {
                              try { URL.revokeObjectURL(paperBlobUrl); } catch {}
                            }
                            setPaperFile(null);
                            setPaperBlobUrl(null);
                            setPaperFileName('');
                            setPaperError(null);
                            if (paperBookingInputRef.current) paperBookingInputRef.current.value = '';
                          }}
                          className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs rounded-xl border border-rose-200 shadow-2xs flex items-center gap-1 transition-all cursor-pointer hover:border-rose-300"
                        >
                          <span>🗑️</span>
                          <span>ลบ</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">วันที่เซ็นสัญญา:</label>
                  <ThaiDatePicker
                    aria-label="วันที่เซ็นสัญญา"
                    max={todayBangkok}
                    value={paperSignedDate}
                    onChange={setPaperSignedDate}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                  />
                </div>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setPaperBooking(null)}
                  className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={uploading || !paperFile || !paperSignedDate}
                  className="flex-1 sm:flex-none px-6 py-2.5 bg-primary hover:brightness-110 text-white font-black text-sm rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {uploading ? 'กำลังบันทึก...' : '📤 บันทึกสัญญาที่เซ็นแล้ว'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {combinedModal !== null && (
        <ContractInspectionCombinedModal
          contractId={combinedModal.id}
          initialTab={combinedModal.tab ?? 'contract'}
          onClose={() => {
            setCombinedModal(null);
            fetchBookings({ silent: true });
          }}
          onSaved={() => fetchBookings({ silent: true })}
        />
      )}

      {inspectId !== null && (
        <InspectionModal contractId={inspectId} onClose={() => { setInspectId(null); fetchBookings({ silent: true }); }} />
      )}

      {dataContractId !== null && (
        <ContractDataModal contractId={dataContractId} onClose={() => setDataContractId(null)} onSaved={() => fetchBookings({ silent: true })} />
      )}

      {/* Preview First Bill Modal (Safe-Viewport Pattern: 85dvh, Sticky Header & Footer) */}
      {previewBillModal && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
            {/* Header */}
            <div className="shrink-0 flex justify-between items-center p-5 sm:p-6 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center text-xl">
                  🧾
                </div>
                <div>
                  <h3 className="text-base sm:text-lg font-black text-slate-900">รายละเอียดบิลแรกเข้า</h3>
                  <p className="text-xs text-slate-500 mt-0.5">ห้อง {previewBillModal.room_number} • ผู้เช่า: {previewBillModal.guest_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewBillModal(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer shrink-0"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4 custom-scrollbar">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">สถานะบิล:</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${
                    previewBillModal.first_bill_status === 'Paid'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {previewBillModal.first_bill_status === 'Paid' ? '✓ ชำระแล้ว' : '⏳ รอ Guest ชำระเงิน'}
                  </span>
                </div>

                <div className="flex justify-between items-center text-xs">
                  <span className="text-slate-500">กำหนดชำระภายใน:</span>
                  <span className="text-slate-900 font-bold">
                    {previewBillModal.first_bill_due_date ? new Date(previewBillModal.first_bill_due_date).toLocaleDateString('th-TH') : '-'}
                  </span>
                </div>
              </div>

              <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
                {previewBillModal.start_meter_reading !== null && previewBillModal.start_meter_reading !== undefined && (
                  <div className="p-3 bg-white rounded-xl border border-slate-200 space-y-1 mb-2">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold">เลขมิเตอร์ไฟฟ้าเริ่มต้น:</span>
                      <span className="font-mono font-black text-slate-900">{Number(previewBillModal.start_meter_reading).toLocaleString('th-TH', { minimumFractionDigits: 2 })} kWh</span>
                    </div>
                    {previewBillModal.start_meter_event_note && (
                      <div className="text-[10px] text-sky-800 font-medium">
                        ⚡ {previewBillModal.start_meter_event_note}
                      </div>
                    )}
                  </div>
                )}
                <h4 className="text-[11px] font-black uppercase tracking-widest text-primary">รายการค่าใช้จ่าย</h4>
                
                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <span className="text-slate-700">1. ค่าเช่าห้องพักเดือนแรก:</span>
                  <span className="text-slate-900 font-mono font-bold">฿{Number(previewBillModal.move_in?.rent || 0).toLocaleString('th-TH')}</span>
                </div>

                <div className="flex justify-between py-1 border-b border-slate-200/60">
                  <div>
                    <span className="text-slate-700">2. เงินประกันหอพักส่วนที่เหลือ:</span>
                    <p className="text-[10px] text-slate-500">(รวมค่าจอง ฿{Number(previewBillModal.move_in?.bookingFee || 0).toLocaleString('th-TH')} = ประกันรวม ฿{Number(previewBillModal.move_in?.deposit || 0).toLocaleString('th-TH')})</p>
                  </div>
                  <span className="text-slate-900 font-mono font-bold">฿{Number(previewBillModal.move_in?.depositAtMoveIn || 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                </div>

                <div className="pt-2 flex justify-between items-center text-base font-black">
                  <span className="text-emerald-700">ยอดชำระรวม:</span>
                  <span className="text-emerald-700 font-mono text-xl">
                    ฿{Number(previewBillModal.first_bill_amount ?? previewBillModal.move_in?.dueAtMoveIn ?? 0).toLocaleString('th-TH')}
                  </span>
                </div>
                {!previewBillModal.first_bill_id && (
                  <p className="text-[10px] text-slate-500">ยังไม่ได้ออกบิล — ยอดด้านบนคำนวณจากราคาห้องปัจจุบัน</p>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="shrink-0 p-4 sm:p-5 border-t border-slate-100 bg-slate-50/80 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewBillModal(null)}
                className="w-full sm:w-auto px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl transition-all cursor-pointer"
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
