'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import { useRates } from '@/lib/use-rates';
import { useConfirm } from '@/components/ConfirmModalProvider';
import TestRoomBadge from '@/components/TestRoomBadge';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

interface BillPayment {
  id: number;
  amount: number;
  method: string;
  paid_at: string;
  voided: boolean;
}

interface MonthlyBill {
  id: number;
  room_number: string;
  tenant_name: string;
  title?: string | null;
  amount: number;
  electric_units?: number;
  electric_amount?: number;
  water_amount?: number;
  common_fee?: number;
  billing_cycle: string;
  due_date: string;
  status: 'Draft' | 'Unpaid' | 'Partial' | 'Paid' | 'Overdue' | 'PendingCorrection' | 'Cancelled';
  created_at: string;
  paid_at?: string;
  payment_method?: string;
  slip_url?: string;
  slip_data?: string;
  meter_photo_url?: string;
  days_overdue?: number;
  late_fee?: number;
  late_fee_per_day?: number;
  total_amount?: number;
  paid_total?: number;
  outstanding?: number;
  payments?: BillPayment[];
}

interface MeterReadyRoom {
  room_id: number;
  room_number: string;
  tenant_name: string;
  tenant_id: number;
  room_price: number;
  units_used: number;
  elec_amount: number;
  water_amount: number;
  common_fee: number;
  total_amount: number;
  billing_cycle: string;
  due_date: string;
  lines: { key: string; label: string; detail: string; amount: number }[];
  photo_url?: string | null;
}

export default function OwnerMonthlyBillingPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const rates = useRates();
  const { confirm, prompt } = useConfirm();

  // 4 Core Stages Flow Dashboard
  const [activeTab, setActiveTab] = useState<'ready' | 'draft' | 'unpaid' | 'paid' | 'dispute'>('ready');
  const [bills, setBills] = useState<MonthlyBill[]>([]);
  const [readyRooms, setReadyRooms] = useState<MeterReadyRoom[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Financial MIS Tracking
  const [currentCycle, setCurrentCycle] = useState<string>('');
  const [roomsWithContractCount, setRoomsWithContractCount] = useState<number>(0);
  const [recordedRoomsCount, setRecordedRoomsCount] = useState<number>(0);

  // Modals & Actions
  const [selectedSlip, setSelectedSlip] = useState<{ url: string; details?: any } | null>(null);
  const [selectedMeterPhoto, setSelectedMeterPhoto] = useState<{ url: string; roomNumber: string; cycle?: string; reading?: string | number } | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [batchIssuing, setBatchIssuing] = useState(false);
  const [issuingSingleId, setIssuingSingleId] = useState<number | null>(null);
  const [disputeModalBill, setDisputeModalBill] = useState<MonthlyBill | null>(null);
  const [receiveBill, setReceiveBill] = useState<MonthlyBill | null>(null);
  const [receiveForm, setReceiveForm] = useState({ method: 'cash', amount: '', paidAt: '', note: '' });
  const [receiving, setReceiving] = useState(false);
  const [disputeReading, setDisputeReading] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchBillingData = async () => {
    try {
      setLoading(true);
      const [billsRes, metersRes, disputeRes] = await Promise.all([
        fetch('/api/owner/billing'),
        fetch('/api/owner/meters/summary'),
        fetch('/api/owner/billing/dispute')
      ]);

      const billsData = await billsRes.json();
      const metersData = await metersRes.json();
      const disputeData = await disputeRes.json();

      if (billsData.success) {
        const monthlyOnly = (billsData.data || []).filter((b: any) => b.bill_type !== 'booking');
        setBills(monthlyOnly);
      }

      if (disputeData.success) {
        setDisputes(disputeData.data || []);
      }

      if (metersData.success && billsData.success) {
        const issuedBillKeys = new Set(
          (billsData.data || []).map((b: any) => `${b.room_number}_${b.billing_cycle}`)
        );

        const cycle: string = metersData.cycle;
        setCurrentCycle(cycle);

        const activeRooms = (metersData.data || []).filter((m: any) => m.needs_reading);
        setRoomsWithContractCount(activeRooms.length);
        const recordedRooms = activeRooms.filter((m: any) => m.cycle_reading);
        setRecordedRoomsCount(recordedRooms.length);

        const ready: MeterReadyRoom[] = [];
        (metersData.data || []).forEach((m: any) => {
          if (m.needs_reading && m.cycle_reading && m.bill_preview && !m.cycle_bill && !issuedBillKeys.has(`${m.room_number}_${cycle}`)) {
            const p = m.bill_preview;
            ready.push({
              room_id: m.room_id,
              room_number: m.room_number,
              tenant_name: m.tenant_name || 'ผู้เช่า',
              tenant_id: m.tenant_id || m.room_id,
              room_price: p.roomAmount,
              units_used: p.electricUnits,
              elec_amount: p.electricAmount,
              water_amount: p.waterAmount,
              common_fee: p.commonFee,
              total_amount: p.total,
              billing_cycle: cycle,
              due_date: p.due_date,
              lines: p.lines,
              photo_url: m.cycle_reading.photo_url || null,
            });
          }
        });

        setReadyRooms(ready);
      }
    } catch (e) {
      console.error('Fetch billing error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/billing');
      return;
    }
    fetchBillingData();
  }, [authStatus, router]);

  // Issue single bill
  const handleIssueSingleBill = async (room: MeterReadyRoom) => {
    setIssuingSingleId(room.room_id);
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          room_number: room.room_number,
          title: `ค่าเช่าห้องและสาธารณูปโภค (${room.billing_cycle})`,
          billing_cycle: room.billing_cycle,
          bill_type: 'monthly',
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`📝 สร้างร่างบิลห้อง ${room.room_number} แล้ว ตรวจแล้วกดส่งในแท็บ "ร่าง"`, 'success');
        fetchBillingData();
      } else {
        showToast(d.message || 'เกิดข้อผิดพลาดในการออกบิล', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setIssuingSingleId(null);
    }
  };

  // Batch issue all ready bills
  const handleIssueAllReadyBills = async () => {
    if (readyRooms.length === 0) return;
    setBatchIssuing(true);
    try {
      let count = 0;
      for (const room of readyRooms) {
        const res = await fetch('/api/owner/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_number: room.room_number,
            title: `ค่าเช่าห้องและสาธารณูปโภค (${room.billing_cycle})`,
            billing_cycle: room.billing_cycle,
            bill_type: 'monthly',
          }),
        });
        const d = await res.json();
        if (d.success) count++;
      }
      showToast(`🎉 สร้างร่างบิลเรียบร้อยแล้ว ${count} ห้อง! ตรวจแล้วกดส่งในแท็บ "ร่างรอส่ง"`, 'success');
      setActiveTab('draft');
      fetchBillingData();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setBatchIssuing(false);
    }
  };

  // Send draft bills
  const handleSendBills = async (ids: number[]) => {
    const ok = await confirm({
      title: 'ส่งบิลให้ผู้เช่า',
      description: `ต้องการส่งบิล ${ids.length} ฉบับนี้ให้ผู้เช่าหรือไม่? ผู้เช่าจะเห็นบิลและได้รับการแจ้งเตือน Web Push ทันที`,
      confirmText: 'ยืนยันส่งบิล',
      cancelText: 'ยกเลิก',
      variant: 'info',
    });
    if (!ok) return;

    try {
      const res = await fetch('/api/owner/billing/send-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const d = await res.json();
      showToast(d.message || (d.success ? 'ส่งบิลแล้ว' : 'ส่งบิลไม่สำเร็จ'), d.success ? 'success' : 'error');
      fetchBillingData();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
  };

  // Delete draft bill
  const handleDeleteDraft = async (billId: number) => {
    const ok = await confirm({
      title: 'ลบร่างบิล',
      description: 'ต้องการลบร่างบิลนี้หรือไม่? (ยังไม่ได้ส่งให้ผู้เช่า สามารถสร้างใหม่ได้)',
      confirmText: 'ลบร่างบิล',
      cancelText: 'ยกเลิก',
      variant: 'danger',
    });
    if (!ok) return;

    try {
      const res = await fetch(`/api/owner/billing/${billId}`, { method: 'DELETE' });
      const d = await res.json();
      showToast(d.message || (d.success ? 'ลบร่างบิลแล้ว' : 'ลบไม่สำเร็จ'), d.success ? 'success' : 'error');
      fetchBillingData();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
  };

  // Manual payment receive
  const openReceive = (bill: MonthlyBill) => {
    const defaultAmount = bill.outstanding ?? bill.total_amount ?? bill.amount;
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const localNow = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
    setReceiveBill(bill);
    setReceiveForm({ method: 'cash', amount: String(defaultAmount), paidAt: localNow, note: '' });
  };

  const handleReceive = async () => {
    if (!receiveBill) return;
    setReceiving(true);
    try {
      const res = await fetch('/api/owner/billing/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: receiveBill.id,
          method: receiveForm.method,
          amount: Number(receiveForm.amount),
          paidAt: receiveForm.paidAt ? new Date(receiveForm.paidAt).toISOString() : undefined,
          note: receiveForm.note.trim() || undefined,
        }),
      });
      const d = await res.json();
      showToast(d.message || (d.success ? 'บันทึกรับเงินสำเร็จแล้ว' : 'บันทึกไม่สำเร็จ'), d.success ? 'success' : 'error');
      if (d.success) {
        setReceiveBill(null);
        fetchBillingData();
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setReceiving(false);
    }
  };

  // Unpay action
  const handleUnpay = async (billId: number) => {
    const reason = await prompt({
      title: 'ยกเลิกการชำระเงิน',
      description: 'ระบุเหตุผลที่ยกเลิกการชำระเงินของบิลนี้ (ระบบจะบันทึกประวัติไว้)',
      placeholder: 'ระบุเหตุผล เช่น สลิปผิดพลาด, มีการคืนเงิน...',
      confirmText: 'ยืนยันยกเลิกการชำระ',
      cancelText: 'ยกเลิก',
      variant: 'danger',
      required: true,
    });
    if (reason === null) return;
    if (!reason.trim()) {
      showToast('ต้องระบุเหตุผล', 'error');
      return;
    }
    try {
      const res = await fetch('/api/owner/billing/unpay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, reason }),
      });
      const d = await res.json();
      showToast(d.message || (d.success ? 'ยกเลิกการชำระแล้ว' : 'ไม่สำเร็จ'), d.success ? 'success' : 'error');
      fetchBillingData();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
  };

  // SlipOK verify
  const handleVerifySlip = async (billId: number, slipUrl: string) => {
    setVerifying(billId);
    try {
      const res = await fetch('/api/owner/billing/verify-slip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billId, slipUrl }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ ตรวจสอบสลิปถูกต้อง อนุมัติการชำระเงินเรียบร้อยแล้ว', 'success');
        fetchBillingData();
      } else {
        showToast(data.message || 'สลิปไม่ผ่านการตรวจสอบ', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setVerifying(null);
    }
  };

  // Submit dispute
  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disputeModalBill || !disputeReading) return;

    try {
      const res = await fetch('/api/owner/billing/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: disputeModalBill.id,
          newElectricReading: Number(disputeReading),
          reason: disputeReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ ส่งคำขอแก้ไขบิลเรียบร้อยแล้ว บิลถูกระงับชำระชั่วคราว', 'success');
        setDisputeModalBill(null);
        setDisputeReading('');
        setDisputeReason('');
        fetchBillingData();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
  };

  // Resolve dispute
  const handleResolveDispute = async (correctionId: number, action: 'approve' | 'reject') => {
    try {
      const res = await fetch('/api/owner/billing/dispute', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctionId, action }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        fetchBillingData();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    }
  };

  // Grouped bills
  const draftBills = bills.filter((b) => String(b.status).toLowerCase() === 'draft');
  const unpaidBills = bills.filter((b) => ['unpaid', 'overdue', 'pendingcorrection', 'partial'].includes(String(b.status).toLowerCase()));
  const paidBills = bills.filter((b) => b.status === 'Paid');

  const filteredBills = (activeTab === 'unpaid' ? unpaidBills : activeTab === 'draft' ? draftBills : paidBills).filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = b.room_number?.toLowerCase().includes(q);
      const matchName = b.tenant_name?.toLowerCase().includes(q);
      if (!matchRoom && !matchName) return false;
    }
    return true;
  });

  // Financial MIS Totals
  const unrecordedRoomsCount = Math.max(0, roomsWithContractCount - recordedRoomsCount);
  const totalBilledAmount = bills.filter(b => b.status !== 'Draft' && b.status !== 'Cancelled').reduce((sum, b) => sum + Number(b.total_amount ?? b.amount ?? 0), 0);
  const totalPaidAmount = bills.reduce((sum, b) => sum + Number(b.paid_total ?? (b.status === 'Paid' ? (b.total_amount ?? b.amount) : 0)), 0);
  const totalOutstandingAmount = unpaidBills.reduce((sum, b) => sum + Number(b.outstanding ?? b.total_amount ?? b.amount ?? 0), 0);
  const collectionRate = totalBilledAmount > 0 ? ((totalPaidAmount / totalBilledAmount) * 100).toFixed(1) : '100.0';

  const formatBaht = (n?: number | null) => (n ?? 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const formatThaiDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' });
  };
  const formatThaiDateTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('th-TH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const PAYMENT_METHOD_LABEL: Record<string, string> = {
    cash: '💵 เงินสด',
    transfer: '📱 โอนเงิน',
    promptpay: '💳 พร้อมเพย์ / Dynamic QR',
    slipok: '🛡️ สแกนสลิป SlipOK',
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 lg:p-10 space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <span>{toast.type === 'success' ? '✅' : '⚠️'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header & Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">💰</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">ระบบบิลค่าเช่ารายเดือน (Monthly Billing MIS)</h1>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                จดบิล • ออกบิล • ส่งแจ้งเตือน • ตรวจรับชำระเงิน Dynamic QR อัตโนมัติ (รอบ {currentCycle || 'ปัจจุบัน'})
              </p>
            </div>
          </div>
        </div>

        {/* Primary Action Buttons */}
        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/owner/billing/record"
            className="px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xs transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
          >
            <span>📝</span>
            <span>จดบิลประจำเดือน</span>
            {unrecordedRoomsCount > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-white text-amber-900 text-[10px] font-mono font-black">
                {unrecordedRoomsCount} ห้องรอจด
              </span>
            )}
          </Link>

          <button
            onClick={fetchBillingData}
            className="px-4 py-3 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-2xl border border-slate-200 shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Financial MIS Metric Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 block">ความคืบหน้าการจดบิล</span>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-black text-amber-800">{recordedRoomsCount}</span>
            <span className="text-xs font-bold text-slate-400">/ {roomsWithContractCount} ห้อง</span>
          </div>
          <span className="text-[11px] text-slate-400 block">
            {unrecordedRoomsCount > 0 ? `⏳ เหลืออีก ${unrecordedRoomsCount} ห้องที่ยังไม่จด` : '✓ จดครบทุกห้องแล้ว'}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 block">ยอดเรียกเก็บรวม</span>
          <p className="text-2xl font-black text-slate-900 font-mono">฿{formatBaht(totalBilledAmount)}</p>
          <span className="text-[11px] text-slate-400 block">บิลที่ส่งแล้วรอบนี้</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 block">รับชำระแล้ว</span>
          <div className="flex items-baseline gap-2">
            <p className="text-2xl font-black text-emerald-700 font-mono">฿{formatBaht(totalPaidAmount)}</p>
          </div>
          <span className="text-[11px] text-emerald-600 font-bold block">สำเร็จ {collectionRate}% (Realization)</span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-2xl shadow-xs space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-rose-700 block">ยอดค้างชำระ</span>
          <p className="text-2xl font-black text-rose-700 font-mono">฿{formatBaht(totalOutstandingAmount)}</p>
          <span className="text-[11px] text-slate-400 block">รอชำระ {unpaidBills.length} ห้อง</span>
        </div>
      </div>

      {/* Auto-Payment Status Indicator */}
      <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
        <div className="flex items-center gap-2.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
          <p className="text-emerald-900 font-bold">
            🤖 ระบบตรวจรับเงินอัตโนมัติ: <span className="font-normal">Dynamic QR พร้อมตรวจสอบยอดเงินเข้าผ่าน LINE Krungthai Connext แบบเรียลไทม์</span>
          </p>
        </div>
        <span className="text-[11px] text-emerald-700 font-mono font-bold bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
          Auto-Reconciliation Active
        </span>
      </div>

      {/* 4 Core Pipeline Tabs Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'ready'
                ? 'bg-amber-500 text-white shadow-xs'
                : readyRooms.length > 0
                ? 'bg-amber-50 text-amber-900 border border-amber-300'
                : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>🟡 1. พร้อมออกบิล</span>
            {readyRooms.length > 0 ? (
              <span className={`min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-black font-mono flex items-center justify-center shadow-xs animate-pulse ${
                activeTab === 'ready' ? 'bg-white text-amber-600 ring-2 ring-white/50' : 'bg-amber-500 text-white ring-2 ring-amber-200'
              }`}>
                {readyRooms.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-400">
                0
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('draft')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'draft' ? 'bg-sky-600 text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>📝 2. ร่างรอส่ง</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'draft' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {draftBills.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'unpaid'
                ? 'bg-rose-600 text-white shadow-xs'
                : unpaidBills.length > 0
                ? 'bg-rose-50 text-rose-900 border border-rose-300'
                : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>🔴 3. รอชำระ / ค้างชำระ</span>
            {unpaidBills.length > 0 ? (
              <span className={`min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-black font-mono flex items-center justify-center shadow-xs animate-pulse ${
                activeTab === 'unpaid' ? 'bg-white text-rose-600 ring-2 ring-white/50' : 'bg-rose-600 text-white ring-2 ring-rose-200'
              }`}>
                {unpaidBills.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-400">
                0
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'paid' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>🟢 4. ชำระแล้ว</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${activeTab === 'paid' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
              {paidBills.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('dispute')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 cursor-pointer ${
              activeTab === 'dispute'
                ? 'bg-purple-600 text-white shadow-xs'
                : disputes.filter((d) => d.status === 'Pending').length > 0
                ? 'bg-purple-50 text-purple-900 border border-purple-300'
                : 'bg-slate-50 text-slate-600 hover:text-slate-900 border border-slate-200'
            }`}
          >
            <span>⚖️ ข้อพิพาทแก้ไขบิล</span>
            {disputes.filter((d) => d.status === 'Pending').length > 0 ? (
              <span className={`min-w-[20px] h-[20px] px-1.5 rounded-full text-[11px] font-black font-mono flex items-center justify-center shadow-xs animate-pulse ${
                activeTab === 'dispute' ? 'bg-white text-purple-600 ring-2 ring-white/50' : 'bg-purple-600 text-white ring-2 ring-purple-200'
              }`}>
                {disputes.filter((d) => d.status === 'Pending').length}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-100 text-slate-400">
                0
              </span>
            )}
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <input
            type="text"
            placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
          />
        </div>
      </div>

      {/* Stage 1: Ready to Issue */}
      {activeTab === 'ready' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-50 border border-amber-200 p-5 rounded-2xl shadow-xs">
            <div>
              <h3 className="text-sm font-black text-amber-900">ห้องที่จดมิเตอร์แล้วและพร้อมออกบิล ({readyRooms.length} ห้อง)</h3>
              <p className="text-xs text-amber-700 mt-0.5">
                คำนวณค่าเช่า ค่าน้ำ ค่าไฟ และส่วนกลางเรียบร้อย สามารถกดสร้างร่างบิลเพื่อส่งให้ผู้เช่า
              </p>
            </div>
            <div className="flex items-center gap-2">
              {unrecordedRoomsCount > 0 && (
                <Link
                  href="/owner/billing/record"
                  className="px-4 py-2.5 bg-white hover:bg-slate-50 text-amber-900 border border-amber-300 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                >
                  <span>📝 จดบิลอีก {unrecordedRoomsCount} ห้อง</span>
                </Link>
              )}
              {readyRooms.length > 0 && (
                <button
                  onClick={handleIssueAllReadyBills}
                  disabled={batchIssuing}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs rounded-xl shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <span>🚀</span>
                  <span>{batchIssuing ? 'กำลังสร้างร่าง...' : 'สร้างร่างบิลทั้งหมดที่พร้อมออก'}</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {readyRooms.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs space-y-3">
                <span className="text-4xl block">✨</span>
                <p className="text-base text-slate-900 font-black">ไม่มีบิลค้างที่รอออก</p>
                {unrecordedRoomsCount > 0 ? (
                  <Link
                    href="/owner/billing/record"
                    className="inline-block px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs rounded-xl shadow-xs"
                  >
                    📝 ไปจดบิลห้องที่เหลือ ({unrecordedRoomsCount} ห้อง) →
                  </Link>
                ) : (
                  <p className="text-xs text-slate-500">จดเลขมิเตอร์และออกบิลครบถ้วนแล้วสำหรับรอบนี้</p>
                )}
              </div>
            ) : (
              readyRooms.map((r) => (
                <div key={r.room_id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition-all">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <span className="text-base font-black text-slate-900">ห้อง {r.room_number}<TestRoomBadge roomNumber={r.room_number} /></span>
                    <span className="text-xs font-mono font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">รอบ {r.billing_cycle}</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>ผู้เช่า:</span>
                      <span className="font-bold text-slate-900">{r.tenant_name}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าห้องพัก:</span>
                      <span className="font-mono text-slate-900 font-bold">฿{formatBaht(r.room_price)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าไฟ ({r.lines.find(l => l.key === 'electric')?.detail}):</span>
                      <span className="font-mono text-slate-900 font-bold">฿{formatBaht(r.elec_amount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าน้ำประปา ({r.lines.find(l => l.key === 'water')?.detail}):</span>
                      <span className="font-mono text-slate-900 font-bold">฿{formatBaht(r.water_amount)}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ค่าส่วนกลาง:</span>
                      <span className="font-mono text-slate-900 font-bold">฿{formatBaht(r.common_fee)}</span>
                    </div>
                    <div className="pt-2 border-t border-slate-100 flex justify-between font-black text-emerald-700 text-sm">
                      <span>ยอดรวมทั้งสิ้น:</span>
                      <span className="font-mono">฿{formatBaht(r.total_amount)}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    {r.photo_url && (
                      <button
                        onClick={() => setSelectedMeterPhoto({ url: r.photo_url!, roomNumber: r.room_number, cycle: r.billing_cycle, reading: r.units_used })}
                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="ดูรูปถ่ายมิเตอร์"
                      >
                        <span>📸 รูปมิเตอร์</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleIssueSingleBill(r)}
                      disabled={issuingSingleId === r.room_id || batchIssuing}
                      className="flex-1 py-2 bg-primary/10 hover:bg-primary text-primary hover:text-white border border-primary/20 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span>📨</span>
                      <span>{issuingSingleId === r.room_id ? 'กำลังสร้างร่าง...' : `สร้างร่างบิล`}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stage 2: Draft Bills */}
      {activeTab === 'draft' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-sky-50 border border-sky-200 p-4 rounded-2xl shadow-xs">
            <p className="text-xs text-sky-800 font-medium">
              ผู้เช่ายังไม่เห็นบิลร่าง • กด "ส่งบิล" แล้วผู้เช่าจะได้รับการแจ้งเตือน Web Push ทันที
            </p>
            {filteredBills.length > 0 && (
              <button
                onClick={() => handleSendBills(filteredBills.map((b) => b.id))}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl whitespace-nowrap shadow-xs cursor-pointer"
              >
                📤 ส่งทั้งหมด ({filteredBills.length} ฉบับ)
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs">
                ✨ ไม่มีร่างบิลรอส่ง
              </div>
            ) : (
              filteredBills.map((bill) => (
                <div key={bill.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition-all">
                  <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                    <div>
                      <span className="text-base font-black text-slate-900">ห้อง {bill.room_number}<TestRoomBadge roomNumber={bill.room_number} /></span>
                      <p className="text-[11px] text-slate-500">{bill.tenant_name}</p>
                    </div>
                    <span className="px-3 py-1 rounded-full text-[10px] font-black bg-sky-50 text-sky-700 border border-sky-200">📝 ร่าง</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>รอบบิล:</span>
                      <span className="font-mono text-slate-900 font-bold">{bill.billing_cycle}</span>
                    </div>
                    <div className="flex justify-between text-slate-600">
                      <span>ยอดรวม:</span>
                      <span className="font-mono font-black text-slate-900 text-sm">฿{formatBaht(bill.amount)}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSendBills([bill.id])}
                      className="flex-1 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                    >
                      📤 ส่งบิล
                    </button>
                    <button
                      onClick={() => handleDeleteDraft(bill.id)}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 cursor-pointer"
                    >
                      ลบร่าง
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Stage 3: Unpaid & Overdue */}
      {activeTab === 'unpaid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs">
                ✨ ไม่มีบิลค้างชำระในขณะนี้
              </div>
            ) : (
              filteredBills.map((bill) => {
                const isOverdue = Number(bill.days_overdue) > 0;
                const isPendingCorrection = bill.status === 'PendingCorrection';
                const isPartial = String(bill.status).toLowerCase() === 'partial';

                return (
                  <div key={bill.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition-all">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900">ห้อง {bill.room_number}<TestRoomBadge roomNumber={bill.room_number} /></span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-[10px] font-mono font-bold">
                            บิล #{bill.id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{bill.tenant_name}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        isPendingCorrection ? 'bg-purple-50 text-purple-700 border border-purple-200' :
                        isOverdue ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                        'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {isPendingCorrection ? '⚖️ ระงับชั่วคราว (ขอแก้)' :
                         isOverdue ? `⚠️ เกินกำหนด ${bill.days_overdue} วัน` :
                         isPartial ? '🟠 ชำระบางส่วน' : '⏳ รอชำระ'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>รอบบิล:</span>
                        <span className="font-mono text-slate-900 font-bold">{bill.billing_cycle}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>ครบกำหนดชำระ:</span>
                        <span className="text-slate-900 font-bold">{formatThaiDate(bill.due_date)}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>ยอดบิลหลัก:</span>
                        <span className="font-mono text-slate-900 font-bold">฿{formatBaht(bill.amount)}</span>
                      </div>
                      {isOverdue && (
                        <div className="flex justify-between text-rose-600 font-bold">
                          <span>ค่าปรับล่าช้า ({bill.days_overdue} วัน):</span>
                          <span className="font-mono">+฿{formatBaht(bill.late_fee)}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-slate-100 flex justify-between font-black text-emerald-700 text-sm">
                        <span>ยอดชำระรวม:</span>
                        <span className="font-mono">฿{formatBaht(bill.total_amount ?? bill.amount)}</span>
                      </div>
                    </div>

                    {!isPendingCorrection && (
                      <button
                        onClick={() => openReceive(bill)}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-xs cursor-pointer"
                      >
                        💵 บันทึกรับเงิน (เงินสด/โอนตรง)
                      </button>
                    )}

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                      {bill.meter_photo_url && (
                        <button
                          onClick={() => setSelectedMeterPhoto({ url: bill.meter_photo_url!, roomNumber: bill.room_number, cycle: bill.billing_cycle, reading: bill.electric_units })}
                          className="px-2.5 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                        >
                          <span>📸 ดูรูปมิเตอร์</span>
                        </button>
                      )}
                      <button
                        onClick={() => setDisputeModalBill(bill)}
                        className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg border border-slate-200 cursor-pointer ml-auto"
                      >
                        ✏️ ขอแก้เลข
                      </button>
                    </div>

                    {bill.slip_url && (
                      <div className="flex items-center gap-2 w-full pt-1 border-t border-slate-100">
                        <button
                          onClick={() => setSelectedSlip({ url: bill.slip_url! })}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg cursor-pointer border border-slate-200"
                        >
                          ดูสลิป
                        </button>
                        <button
                          onClick={() => handleVerifySlip(bill.id, bill.slip_url!)}
                          disabled={verifying === bill.id}
                          className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg shadow-xs transition-all cursor-pointer"
                        >
                          {verifying === bill.id ? 'กำลังตรวจ...' : '✓ ตรวจ SlipOK'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Stage 4: Paid Bills */}
      {activeTab === 'paid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs">
                ✨ ยังไม่มีประวัติบิลที่ชำระแล้ว
              </div>
            ) : (
              filteredBills.map((bill) => {
                let slipInfo: any = null;
                try {
                  slipInfo = bill.slip_data ? JSON.parse(bill.slip_data) : null;
                } catch {}

                return (
                  <div key={bill.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs space-y-4 hover:border-slate-300 transition-all">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-100">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-slate-900">ห้อง {bill.room_number}<TestRoomBadge roomNumber={bill.room_number} /></span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-mono font-bold border border-emerald-200">
                            บิล #{bill.id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500">{bill.tenant_name}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                        🟢 ชำระแล้ว
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-600">
                        <span>รอบบิล:</span>
                        <span className="font-mono text-slate-900 font-bold">{bill.billing_cycle}</span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>ยอดชำระสุทธิ:</span>
                        <span className="font-mono font-black text-emerald-700 text-sm">
                          ฿{formatBaht(Number(bill.paid_total) > 0 ? bill.paid_total : bill.amount)}
                        </span>
                      </div>
                      <div className="flex justify-between text-slate-600">
                        <span>ชำระเมื่อ:</span>
                        <span className="text-slate-900 font-bold">{formatThaiDateTime(bill.paid_at)}</span>
                      </div>
                      {bill.payment_method && (
                        <div className="flex justify-between text-slate-600">
                          <span>วิธีชำระ:</span>
                          <span className="text-slate-900 font-bold">{PAYMENT_METHOD_LABEL[bill.payment_method] || bill.payment_method}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      {bill.slip_url && (
                        <button
                          onClick={() => setSelectedSlip({ url: bill.slip_url!, details: slipInfo })}
                          className="w-full py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
                        >
                          🖼️ ดูสลิปหลักฐาน
                        </button>
                      )}

                      {(session?.user as any)?.role === 'owner' && (
                        <button
                          onClick={() => handleUnpay(bill.id)}
                          className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
                        >
                          ↩️ ยกเลิกการชำระ
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Disputes Tab */}
      {activeTab === 'dispute' && (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl overflow-hidden border border-slate-200 shadow-xs">
            <div className="p-5 border-b border-slate-100 flex justify-between items-center">
              <h3 className="text-sm font-black text-slate-900">รายการคำขอแก้ไขมิเตอร์และบิลค่าเช่า</h3>
              <span className="text-xs text-slate-500 font-mono">{disputes.length} รายการ</span>
            </div>

            {disputes.length === 0 ? (
              <div className="p-16 text-center text-slate-500 font-bold">✨ ไม่มีรายการข้อพิพาทหรือคำขอแก้ไขบิล</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
                    <tr>
                      <th className="px-6 py-3 font-black">ห้อง</th>
                      <th className="px-6 py-3 font-black">ผู้ยื่นคำขอ</th>
                      <th className="px-6 py-3 font-black">เลขเดิม ➔ เลขใหม่</th>
                      <th className="px-6 py-3 font-black">ยอดเงินใหม่</th>
                      <th className="px-6 py-3 font-black">หลักฐาน</th>
                      <th className="px-6 py-3 font-black">สถานะ</th>
                      <th className="px-6 py-3 font-black text-right">การตัดสินใจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {disputes.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-6 py-3.5 font-black text-slate-900">ห้อง {d.room_number}<TestRoomBadge roomNumber={d.room_number} /></td>
                        <td className="px-6 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            d.requested_by === 'owner' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                          }`}>
                            {d.requested_by === 'owner' ? 'เจ้าของหอ' : 'ผู้เช่า'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 font-mono text-slate-600">
                          {d.old_electric_reading} ➔ <strong className="text-emerald-700">{d.new_electric_reading}</strong>
                        </td>
                        <td className="px-6 py-3.5 font-mono font-bold text-emerald-700">
                          ฿{formatBaht(d.new_total_amount)}
                        </td>
                        <td className="px-6 py-3.5">
                          {d.meter_photo_url && (
                            <button
                              onClick={() => setSelectedMeterPhoto({ url: d.meter_photo_url, roomNumber: d.room_number, cycle: d.billing_cycle, reading: d.old_electric_reading })}
                              className="px-2 py-1 bg-blue-50 text-blue-700 rounded text-[11px] font-bold cursor-pointer"
                            >
                              📸 ดูรูป
                            </button>
                          )}
                        </td>
                        <td className="px-6 py-3.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            d.status === 'Approved' ? 'bg-emerald-100 text-emerald-800' :
                            d.status === 'Rejected' ? 'bg-rose-100 text-rose-800' :
                            'bg-amber-100 text-amber-800'
                          }`}>
                            {d.status === 'Approved' ? 'อนุมัติแล้ว' : d.status === 'Rejected' ? 'ปฏิเสธ' : 'รอดำเนินการ'}
                          </span>
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {d.status === 'Pending' && d.requested_by !== 'owner' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleResolveDispute(d.id, 'approve')}
                                className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                อนุมัติ
                              </button>
                              <button
                                onClick={() => handleResolveDispute(d.id, 'reject')}
                                className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                              >
                                ปฏิเสธ
                              </button>
                            </div>
                          ) : (
                            <span className="text-slate-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slip Lightbox */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">สลิปโอนเงิน</h3>
              <button
                onClick={() => setSelectedSlip(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="relative h-96 bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
              <Image src={selectedSlip.url} alt="Slip" fill unoptimized className="object-contain p-2" />
            </div>
          </div>
        </div>
      )}

      {/* Meter Evidence Photo Modal */}
      {selectedMeterPhoto && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-lg w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">
                  📸 ภาพหลักฐานมิเตอร์ไฟฟ้า (ห้อง {selectedMeterPhoto.roomNumber})
                </h3>
                {selectedMeterPhoto.cycle && (
                  <p className="text-xs text-slate-500 mt-0.5">รอบบิล {selectedMeterPhoto.cycle}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedMeterPhoto(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>
            <div className="relative aspect-[4/3] bg-slate-50 rounded-2xl overflow-hidden border border-slate-200 flex items-center justify-center">
              <Image src={selectedMeterPhoto.url} alt="Meter Evidence" fill unoptimized className="object-contain p-2" />
            </div>
          </div>
        </div>
      )}

      {/* Manual Receive Payment Modal */}
      {receiveBill && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-black text-slate-900">💵 บันทึกรับเงิน — ห้อง {receiveBill.room_number}</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  รอบ {receiveBill.billing_cycle} • คงเหลือ ฿{formatBaht(receiveBill.outstanding ?? receiveBill.total_amount ?? receiveBill.amount)}
                </p>
              </div>
              <button
                onClick={() => setReceiveBill(null)}
                className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 hover:bg-slate-300 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <label className="block space-y-1">
                <span className="text-slate-600 font-bold">วิธีรับเงิน</span>
                <select
                  value={receiveForm.method}
                  onChange={(e) => setReceiveForm({ ...receiveForm, method: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 shadow-xs focus:outline-none focus:border-primary"
                >
                  <option value="cash">เงินสด</option>
                  <option value="transfer">โอนเงิน</option>
                </select>
              </label>

              <label className="block space-y-1">
                <span className="text-slate-600 font-bold">จำนวนเงิน (บาท)</span>
                <input
                  type="number" {...NUMBER_INPUT_PROPS} min="0.01" step="0.01"
                  value={receiveForm.amount}
                  onChange={(e) => setReceiveForm({ ...receiveForm, amount: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 font-mono shadow-xs focus:outline-none focus:border-primary"
                />
              </label>

              <label className="block space-y-1">
                <span className="text-slate-600 font-bold">หมายเหตุ (ไม่บังคับ)</span>
                <input
                  type="text" maxLength={255}
                  value={receiveForm.note}
                  onChange={(e) => setReceiveForm({ ...receiveForm, note: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-slate-900 shadow-xs focus:outline-none focus:border-primary"
                />
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setReceiveBill(null)}
                className="flex-1 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                onClick={handleReceive}
                disabled={receiving}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs cursor-pointer shadow-xs"
              >
                {receiving ? 'กำลังบันทึก...' : 'บันทึกรับเงิน'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {disputeModalBill && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-slate-100">
              <h3 className="text-base font-black text-slate-900">ขอแก้ไขตัวเลขมิเตอร์ (ห้อง {disputeModalBill.room_number})</h3>
              <button
                onClick={() => setDisputeModalBill(null)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-700 hover:bg-slate-200 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">เลขมิเตอร์ครั้งนี้ที่ถูกต้อง:</label>
                <input
                  type="number" {...NUMBER_INPUT_PROPS}
                  step="0.01"
                  required
                  placeholder="เช่น 2645.00"
                  value={disputeReading}
                  onChange={(e) => setDisputeReading(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">เหตุผลในการขอแก้ไข:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="เช่น AI อ่านตัวเลขหลักสิบผิดจากรูปถ่าย..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-xl p-3 text-xs text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-primary hover:bg-primary-hover text-white font-black text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                ส่งคำขอแก้ไข (ระงับบิลชั่วคราว)
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
