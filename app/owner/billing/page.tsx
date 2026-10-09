'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

interface MonthlyBill {
  id: number;
  room_number: string;
  tenant_name: string;
  tenant_phone?: string;
  amount: number;
  room_amount?: number;
  electric_units?: number;
  electric_amount?: number;
  water_amount?: number;
  common_fee?: number;
  billing_cycle: string;
  due_date: string;
  status: 'Pending' | 'Unpaid' | 'Paid' | 'Overdue' | 'PendingCorrection' | string;
  slip_url?: string | null;
  slip_data?: string | null;
  meter_photo_url?: string | null;
  created_at: string;
  days_overdue?: number;
  late_fee?: number;
  penalty_amount?: number;
  total_amount?: number;
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
  photo_url?: string | null;
}

export default function OwnerMonthlyBillingPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  // 15. 3 Core Tabs: Ready (พร้อมออก) | Overdue/Unpaid (ค้างชำระ) | Paid (ชำระแล้ว)
  const [activeTab, setActiveTab] = useState<'ready' | 'unpaid' | 'paid' | 'dispute'>('ready');
  const [bills, setBills] = useState<MonthlyBill[]>([]);
  const [readyRooms, setReadyRooms] = useState<MeterReadyRoom[]>([]);
  const [disputes, setDisputes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Modals & Inspection State
  const [selectedSlip, setSelectedSlip] = useState<{ url: string; details?: any } | null>(null);
  const [selectedMeterPhoto, setSelectedMeterPhoto] = useState<{ url: string; roomNumber: string; cycle?: string; reading?: string | number } | null>(null);
  const [verifying, setVerifying] = useState<number | null>(null);
  const [batchIssuing, setBatchIssuing] = useState(false);
  const [disputeModalBill, setDisputeModalBill] = useState<MonthlyBill | null>(null);
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
        // Filter only monthly bills
        const monthlyOnly = (billsData.data || []).filter((b: any) => b.bill_type !== 'booking');
        setBills(monthlyOnly);
      }

      if (disputeData.success) {
        setDisputes(disputeData.data || []);
      }

      // 15.1 Calculate Ready to Issue bills from meter readings (Strictly Occupied rooms in current cycle)
      if (metersData.success && billsData.success) {
        const issuedBillKeys = new Set(
          (billsData.data || []).map((b: any) => `${b.room_number}_${b.billing_cycle}`)
        );

        const currentCycle = new Date().toISOString().substring(0, 7);
        const ready: MeterReadyRoom[] = [];

        (metersData.data || []).forEach((m: any) => {
          const meterCycle = m.latest_cycle || currentCycle;
          const key = `${m.room_number}_${meterCycle}`;
          
          // Must meet ALL criteria:
          // 1. Room is Occupied OR has active contract status
          // 2. Meter cycle matches the current billing cycle (or is a valid current active cycle)
          // 3. Meter has reading and units calculated
          // 4. Bill not already issued for this room and cycle
          // 5. Not undergoing move-out (Rule 16.1)
          const isOccupied = m.room_status === 'Occupied' || m.contract_status === 'Active';
          const isCurrentCycle = meterCycle === currentCycle;

          if (
            isOccupied &&
            isCurrentCycle &&
            m.latest_reading !== null && 
            m.units_used !== null && 
            !issuedBillKeys.has(key) &&
            m.contract_status !== 'MoveOutPending'
          ) {
            const isT01 = (m.room_number || '').toUpperCase() === 'T01';
            const roomPrice = isT01 ? 10 : Number(m.price || 3400);
            const units = Number(m.units_used);
            const elecRate = isT01 ? 1.00 : 4.88;
            const elecAmount = units * elecRate;
            const waterAmount = isT01 ? 5.00 : 100.00;
            const commonFee = isT01 ? 5.00 : 150.00;
            const total = roomPrice + elecAmount + waterAmount + commonFee;

            ready.push({
              room_id: m.room_id,
              room_number: m.room_number,
              tenant_name: m.tenant_name || (m.room_status === 'Occupied' ? 'ผู้เช่าประจำ' : 'ผู้เช่า'),
              tenant_id: m.tenant_id || m.room_id,
              room_price: roomPrice,
              units_used: units,
              elec_amount: elecAmount,
              water_amount: waterAmount,
              common_fee: commonFee,
              total_amount: total,
              billing_cycle: meterCycle,
              photo_url: m.photo_url || null,
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

  const [issuingSingleId, setIssuingSingleId] = useState<number | null>(null);

  // 15.1 Issue Single Bill for specific room
  const handleIssueSingleBill = async (room: MeterReadyRoom) => {
    setIssuingSingleId(room.room_id);
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant_id: room.tenant_id,
          room_number: room.room_number,
          title: `ค่าเช่าห้องและสาธารณูปโภค (${room.billing_cycle})`,
          room_amount: room.room_price,
          electric_units: room.units_used,
          electric_amount: room.elec_amount,
          water_amount: room.water_amount,
          common_fee: room.common_fee,
          amount: room.total_amount,
          billing_cycle: room.billing_cycle,
          due_date: `${room.billing_cycle}-05`,
          bill_type: 'monthly',
        }),
      });
      const d = await res.json();
      if (d.success) {
        showToast(`🎉 ออกบิลและส่งแจ้งเตือนห้อง ${room.room_number} เรียบร้อยแล้ว!`, 'success');
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

  // 15.1 Batch Issue All Ready Bills
  const handleIssueAllReadyBills = async () => {
    if (readyRooms.length === 0) return;
    setBatchIssuing(true);
    try {
      let successCount = 0;
      for (const room of readyRooms) {
        const res = await fetch('/api/owner/billing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            tenant_id: room.tenant_id,
            room_number: room.room_number,
            title: `ค่าเช่าห้องและสาธารณูปโภค (${room.billing_cycle})`,
            room_amount: room.room_price,
            electric_units: room.units_used,
            electric_amount: room.elec_amount,
            water_amount: room.water_amount,
            common_fee: room.common_fee,
            amount: room.total_amount,
            billing_cycle: room.billing_cycle,
            due_date: `${room.billing_cycle}-05`,
            bill_type: 'monthly',
          }),
        });
        const d = await res.json();
        if (d.success) successCount++;
      }

      showToast(`🎉 ออกบิลและส่งแจ้งเตือนเรียบร้อยแล้วทั้งหมด ${successCount} ห้อง!`, 'success');
      fetchBillingData();
    } catch (e: any) {
      showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
    } finally {
      setBatchIssuing(false);
    }
  };

  // 15.3 SlipOK Verification Call
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
        showToast('✅ ตรวจสอบสลิปถูกต้อง อนุมัติการชำระเงินเรียบร้อยแล้ว!', 'success');
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

  // 14.1 Owner Submit Dispute Request
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

  // 14.3.2 Approve / Reject Dispute
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

  const unpaidBills = bills.filter((b) => b.status === 'Unpaid' || b.status === 'Overdue' || b.status === 'PendingCorrection');
  const paidBills = bills.filter((b) => b.status === 'Paid');

  const filteredBills = (activeTab === 'unpaid' ? unpaidBills : paidBills).filter((b) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = b.room_number?.toLowerCase().includes(q);
      const matchName = b.tenant_name?.toLowerCase().includes(q);
      if (!matchRoom && !matchName) return false;
    }
    return true;
  });

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
            <span className="text-3xl">💰</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">ระบบบิลค่าเช่ารายเดือน (Monthly Billing)</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                ค่าไฟ 4.88 บาท/หน่วย • ค่าน้ำ 100 บาท • ค่าส่วนกลาง 150 บาท • ค่าปรับวันละ 50 บาท (เพดาน 500 บาท)
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchBillingData}
            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-2"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* 15. 3 Core Tabs Bar + Dispute Tab */}
      <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center bg-slate-900/80 p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          <button
            onClick={() => setActiveTab('ready')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'ready' ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🟡 15.1 บิลพร้อมออก</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{readyRooms.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('unpaid')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'unpaid' ? 'bg-rose-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🔴 15.2 บิลค้างชำระ / รอชำระ</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{unpaidBills.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('paid')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'paid' ? 'bg-emerald-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>🟢 15.3 บิลชำระแล้ว (SlipOK)</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">{paidBills.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('dispute')}
            className={`px-4 py-2.5 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-2 ${
              activeTab === 'dispute' ? 'bg-purple-500 text-white shadow-lg' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            <span>⚖️ 14. ข้อพิพาทแก้ไขบิล</span>
            <span className="px-2 py-0.5 rounded-full bg-black/30 text-[10px] font-mono">
              {disputes.filter((d) => d.status === 'Pending').length}
            </span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="relative min-w-[240px]">
          <input
            type="text"
            placeholder="ค้นหาเลขห้อง, ชื่อผู้เช่า..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* 15.1 Ready to Issue Tab */}
      {activeTab === 'ready' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-amber-500/10 border border-amber-500/30 p-5 rounded-2xl">
            <div>
              <h3 className="text-sm font-black text-amber-300">บิลที่พร้อมส่งไปยังลูกหอ ({readyRooms.length} ห้อง)</h3>
              <p className="text-xs text-amber-200/70 mt-0.5">ห้องเหล่านี้ได้รับการจดมิเตอร์ไฟรอบเดือนเรียบร้อยแล้ว และพร้อมส่งบิลเข้าสู่ระบบลูกหอ</p>
            </div>
            {readyRooms.length > 0 && (
              <button
                onClick={handleIssueAllReadyBills}
                disabled={batchIssuing}
                className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl shadow-xl transition-all flex items-center gap-2"
              >
                <span>🚀</span>
                <span>{batchIssuing ? 'กำลังส่งบิลทั้งหมด...' : 'ส่งบิลทั้งหมดที่พร้อมออก'}</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {readyRooms.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-400 font-bold bg-slate-900/50 rounded-3xl border border-white/10">
                ✨ ไม่มีบิลค้างที่รอออก (ออกบิลตามมิเตอร์ครบถ้วนแล้ว)
              </div>
            ) : (
              readyRooms.map((r) => (
                <div key={r.room_id} className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
                  <div className="flex justify-between items-center pb-3 border-b border-white/10">
                    <span className="text-base font-black text-white">ห้อง {r.room_number}</span>
                    <span className="text-xs font-mono font-bold text-amber-400">รอบ {r.billing_cycle}</span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>ผู้เช่า:</span>
                      <span className="font-bold text-white">{r.tenant_name}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>ค่าห้องพัก:</span>
                      <span className="font-mono">฿{r.room_price.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>ค่าไฟ ({r.units_used} หน่วย x 4.88):</span>
                      <span className="font-mono">฿{r.elec_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>ค่าน้ำประปา (เหมาจ่าย):</span>
                      <span className="font-mono">฿{r.water_amount.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-slate-300">
                      <span>ค่าส่วนกลาง (เหมาจ่าย):</span>
                      <span className="font-mono">฿{r.common_fee.toFixed(2)}</span>
                    </div>
                    <div className="pt-2 border-t border-white/10 flex justify-between font-black text-emerald-400 text-sm">
                      <span>ยอดรวมทั้งสิ้น:</span>
                      <span className="font-mono">฿{r.total_amount.toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-white/10 flex items-center gap-2">
                    {r.photo_url && (
                      <button
                        onClick={() => setSelectedMeterPhoto({ url: r.photo_url!, roomNumber: r.room_number, cycle: r.billing_cycle, reading: r.units_used })}
                        className="px-3 py-2.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                        title="ดูรูปถ่ายมิเตอร์"
                      >
                        <span>📸</span>
                        <span>รูปมิเตอร์</span>
                      </button>
                    )}
                    <button
                      onClick={() => handleIssueSingleBill(r)}
                      disabled={issuingSingleId === r.room_id || batchIssuing}
                      className="flex-1 py-2.5 bg-primary/20 hover:bg-primary text-primary hover:text-white border border-primary/30 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <span>📨</span>
                      <span>{issuingSingleId === r.room_id ? 'กำลังส่งบิล...' : `ส่งบิลห้อง ${r.room_number}`}</span>
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* 15.2 Unpaid & Overdue Tab (With 50 THB/day Late Fee) */}
      {activeTab === 'unpaid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-400 font-bold bg-slate-900/50 rounded-3xl border border-white/10">
                ✨ ไม่มีบิลค้างชำระในขณะนี้
              </div>
            ) : (
              filteredBills.map((bill) => {
                const isOverdue = bill.days_overdue && bill.days_overdue > 0;
                const isPendingCorrection = bill.status === 'PendingCorrection';

                return (
                  <div key={bill.id} className="bg-slate-900/90 border border-white/10 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white">ห้อง {bill.room_number}</span>
                          <span className="px-2 py-0.5 rounded-md bg-white/10 text-slate-300 text-[10px] font-mono font-bold">
                            บิล #{bill.id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{bill.tenant_name}</p>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                        isPendingCorrection ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' :
                        isOverdue ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                        'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      }`}>
                        {isPendingCorrection ? '⚖️ ระงับชั่วคราว (ขอแก้)' :
                         isOverdue ? `⚠️ เกินกำหนด ${bill.days_overdue} วัน` : '⏳ รอชำระ'}
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>รอบบิล:</span>
                        <span className="font-mono text-white">{bill.billing_cycle}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>ยอดบิลหลัก:</span>
                        <span className="font-mono text-white">฿{Number(bill.amount).toLocaleString()}</span>
                      </div>
                      {isOverdue && (
                        <div className="flex justify-between text-rose-400 font-bold">
                          <span>ค่าปรับล่าช้า ({bill.days_overdue} วัน x 50 บ.):</span>
                          <span className="font-mono">+฿{Number(bill.late_fee ?? bill.penalty_amount ?? (bill.days_overdue! * 50)).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="pt-2 border-t border-white/10 flex justify-between font-black text-emerald-400 text-sm">
                        <span>ยอดชำระรวม:</span>
                        <span className="font-mono">฿{Number(bill.total_amount ?? (Number(bill.amount) + (bill.days_overdue ? bill.days_overdue * 50 : 0))).toLocaleString()}</span>
                      </div>
                    </div>

                    {/* Slip Attachment or Actions */}
                    <div className="pt-3 border-t border-white/10 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        {bill.meter_photo_url && (
                          <button
                            onClick={() => setSelectedMeterPhoto({ url: bill.meter_photo_url!, roomNumber: bill.room_number, cycle: bill.billing_cycle, reading: bill.electric_units })}
                            className="px-2.5 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                          >
                            <span>📸</span>
                            <span>ดูรูปมิเตอร์</span>
                          </button>
                        )}
                        <button
                          onClick={() => setDisputeModalBill(bill)}
                          className="px-2.5 py-1.5 bg-white/5 hover:bg-white/15 text-slate-300 text-xs font-bold rounded-lg border border-white/10 cursor-pointer ml-auto"
                        >
                          ✏️ ขอแก้เลข
                        </button>
                      </div>

                      {bill.slip_url ? (
                        <div className="flex items-center gap-2 w-full pt-1 border-t border-white/5">
                          <button
                            onClick={() => setSelectedSlip({ url: bill.slip_url! })}
                            className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-lg cursor-pointer"
                          >
                            ดูสลิป
                          </button>
                          <button
                            onClick={() => handleVerifySlip(bill.id, bill.slip_url!)}
                            disabled={verifying === bill.id}
                            className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg shadow-md transition-all cursor-pointer"
                          >
                            {verifying === bill.id ? 'กำลังตรวจ...' : '✓ ตรวจ SlipOK'}
                          </button>
                        </div>
                      ) : (
                        <span className="text-[10px] text-slate-500 italic text-right">ยังไม่แนบสลิปชำระเงิน</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 15.3 Paid Bills Tab (SlipOK Verified with Anti-Cheat Details) */}
      {activeTab === 'paid' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredBills.length === 0 ? (
              <div className="col-span-full p-16 text-center text-slate-400 font-bold bg-slate-900/50 rounded-3xl border border-white/10">
                ✨ ยังไม่มีประวัติบิลที่ชำระแล้ว
              </div>
            ) : (
              filteredBills.map((bill) => {
                let slipInfo: any = null;
                try {
                  slipInfo = bill.slip_data ? JSON.parse(bill.slip_data) : null;
                } catch {}

                return (
                  <div key={bill.id} className="bg-slate-900/90 border border-emerald-500/30 rounded-2xl p-5 shadow-xl space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-base font-black text-white">ห้อง {bill.room_number}</span>
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 text-[10px] font-mono font-bold">
                            บิล #{bill.id}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">{bill.tenant_name}</p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                        🟢 ชำระแล้ว
                      </span>
                    </div>

                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between text-slate-300">
                        <span>รอบบิล:</span>
                        <span className="font-mono text-white">{bill.billing_cycle}</span>
                      </div>
                      <div className="flex justify-between text-slate-300">
                        <span>ยอดชำระสุทธิ:</span>
                        <span className="font-mono font-black text-emerald-400 text-sm">
                          ฿{Number(bill.amount).toLocaleString()}
                        </span>
                      </div>
                      {slipInfo?.transDate && (
                        <div className="p-2.5 bg-slate-950 rounded-xl border border-white/5 space-y-1 text-[11px]">
                          <p className="text-slate-400">ผู้โอน: <span className="text-white font-bold">{slipInfo.sender?.name || bill.tenant_name}</span></p>
                          <p className="text-slate-400">วัน-เวลาโอน: <span className="text-white font-mono">{slipInfo.transDate} {slipInfo.transTime}</span></p>
                          <p className="text-slate-400">Ref: <span className="text-slate-300 font-mono text-[10px]">{slipInfo.transRef || '-'}</span></p>
                        </div>
                      )}
                    </div>

                    {bill.slip_url && (
                      <button
                        onClick={() => setSelectedSlip({ url: bill.slip_url!, details: slipInfo })}
                        className="w-full py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl border border-white/10 transition-colors"
                      >
                        🖼️ ดูภาพสลิปหลักฐาน
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 14. Dispute Management Tab */}
      {activeTab === 'dispute' && (
        <div className="space-y-4">
          <div className="bg-slate-900/80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
            <div className="p-5 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-sm font-black text-white">รายการคำขอแก้ไขมิเตอร์และบิลค่าเช่า</h3>
              <span className="text-xs text-slate-400 font-mono">ทั้งหมด {disputes.length} รายการ</span>
            </div>

            {disputes.length === 0 ? (
              <div className="p-16 text-center text-slate-400 font-bold">✨ ไม่มีรายการข้อพิพาทหรือคำขอแก้ไขบิล</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[700px]">
                  <thead className="bg-slate-950/60 border-b border-white/10">
                    <tr>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">ห้อง</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">ผู้ยื่นคำขอ</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">เลขเดิม ➔ เลขใหม่</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">ยอดเงินใหม่</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">หลักฐานภาพถ่าย</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">เหตุผล</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400">สถานะ</th>
                      <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 text-right">การตัดสินใจ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {disputes.map((d) => (
                      <tr key={d.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-6 py-4 font-black text-white text-sm">ห้อง {d.room_number}</td>
                        <td className="px-6 py-4 text-xs text-slate-300">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            d.requested_by === 'owner' ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'
                          }`}>
                            {d.requested_by === 'owner' ? 'เจ้าของหอ' : 'ผู้เช่า'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono text-slate-300">
                          {d.old_electric_reading} ➔ <strong className="text-emerald-400">{d.new_electric_reading}</strong>
                        </td>
                        <td className="px-6 py-4 text-xs font-mono font-bold text-emerald-400">
                          ฿{Number(d.new_total_amount).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            {d.meter_photo_url && (
                              <button
                                onClick={() => setSelectedMeterPhoto({ url: d.meter_photo_url, roomNumber: d.room_number, cycle: d.billing_cycle, reading: d.old_electric_reading })}
                                className="px-2 py-1 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="ดูภาพถ่ายมิเตอร์จากระบบ"
                              >
                                <span>📸</span>
                                <span>รูปมิเตอร์เดิม</span>
                              </button>
                            )}
                            {d.evidence_photo_url && (
                              <button
                                onClick={() => setSelectedMeterPhoto({ url: d.evidence_photo_url, roomNumber: d.room_number, cycle: d.billing_cycle, reading: d.new_electric_reading })}
                                className="px-2 py-1 bg-purple-500/10 hover:bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                                title="ดูภาพถ่ายหลักฐานที่ผู้ยื่นแนบมา"
                              >
                                <span>🔍</span>
                                <span>รูปหลักฐานที่แนบ</span>
                              </button>
                            )}
                            {!d.meter_photo_url && !d.evidence_photo_url && (
                              <span className="text-slate-500 text-[11px] italic">-</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-400 max-w-[200px] truncate" title={d.reason}>{d.reason || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            d.status === 'Approved' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                            d.status === 'Rejected' ? 'bg-rose-500/10 text-rose-400 border border-rose-500/30' :
                            'bg-amber-500/10 text-amber-400 border border-amber-500/30'
                          }`}>
                            {d.status === 'Approved' ? 'อนุมัติแล้ว' : d.status === 'Rejected' ? 'ปฏิเสธ' : 'รอดำเนินการ'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          {d.status === 'Pending' ? (
                            d.requested_by === 'owner' ? (
                              <span className="px-2.5 py-1 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 text-[11px] font-bold">
                                ⏳ รอลูกหอกดอนุมัติ
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleResolveDispute(d.id, 'approve')}
                                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-lg cursor-pointer"
                                >
                                  อนุมัติ
                                </button>
                                <button
                                  onClick={() => handleResolveDispute(d.id, 'reject')}
                                  className="px-3 py-1 bg-rose-600 hover:bg-rose-500 text-white text-xs font-black rounded-lg cursor-pointer"
                                >
                                  ปฏิเสธ
                                </button>
                              </div>
                            )
                          ) : (
                            <span className="text-slate-500 text-[11px]">-</span>
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

      {/* Slip Modal */}
      {selectedSlip && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-white">สลิปโอนเงิน</h3>
              <button
                onClick={() => setSelectedSlip(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative h-96 bg-black/40 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center">
              <Image
                src={selectedSlip.url}
                alt="Slip"
                fill
                unoptimized
                className="object-contain p-2"
              />
            </div>
          </div>
        </div>
      )}

      {/* Dispute Request Modal */}
      {disputeModalBill && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-md w-full p-6 sm:p-8 space-y-5 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-white">ขอแก้ไขตัวเลขมิเตอร์ (ห้อง {disputeModalBill.room_number})</h3>
              <button
                onClick={() => setDisputeModalBill(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">เลขมิเตอร์ครั้งนี้ที่ถูกต้อง:</label>
                <input
                  type="number"
                  step="0.01"
                  required
                  placeholder="เช่น 2645.00"
                  value={disputeReading}
                  onChange={(e) => setDisputeReading(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">เหตุผลในการขอแก้ไข:</label>
                <textarea
                  rows={3}
                  required
                  placeholder="เช่น AI อ่านตัวเลขหลักสิบผิดจากรูปถ่าย..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-xl p-3 text-xs text-white"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-black text-xs rounded-xl shadow-lg transition-all"
              >
                ส่งคำขอแก้ไข (ระงับบิลชั่วคราว)
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Meter Evidence Photo Modal */}
      {selectedMeterPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <h3 className="text-base font-black text-white flex items-center gap-2">
                  <span>📸 ภาพหลักฐานมิเตอร์ไฟฟ้า (ห้อง {selectedMeterPhoto.roomNumber})</span>
                </h3>
                {selectedMeterPhoto.cycle && (
                  <p className="text-xs text-slate-400 mt-0.5">รอบบิล {selectedMeterPhoto.cycle}</p>
                )}
              </div>
              <button
                onClick={() => setSelectedMeterPhoto(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="relative aspect-[4/3] bg-black/60 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center">
              <Image
                src={selectedMeterPhoto.url}
                alt="Meter Evidence"
                fill
                unoptimized
                className="object-contain p-2"
              />
            </div>

            {selectedMeterPhoto.reading !== undefined && selectedMeterPhoto.reading !== null && (
              <div className="bg-slate-950 p-3.5 rounded-xl border border-white/5 flex justify-between items-center text-xs">
                <span className="text-slate-400">หน่วยมิเตอร์ / เลขที่บันทึก:</span>
                <span className="text-emerald-400 font-mono font-bold text-sm">{selectedMeterPhoto.reading} หน่วย</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setSelectedMeterPhoto(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
