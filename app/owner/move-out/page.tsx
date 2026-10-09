'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

interface MoveOutItem {
  id: number;
  tenant_id: number;
  room_id: number;
  room_number: string;
  floor: number;
  room_price: number;
  tenant_name: string;
  tenant_phone: string;
  tenant_email: string;
  desired_date: string;
  move_out_date: string;
  reason: string;
  status: string;
  promptpay_target: string;
  promptpay_name: string;
  bank_name: string;
  deposit_amount: number;
  contract_deposit_amount: number;
  contract_start_date: string;
  contract_end_date: string;
  is_early_calculated: boolean;
  prev_meter_reading: number;
  live_unpaid_total: number;
  unpaid_bills: any[];
  qr_image: string | null;
  // Inspection & Settlement
  electric_prev_unit: number;
  electric_new_unit: number;
  electric_units_used: number;
  electric_amount: number;
  water_amount: number;
  common_fee: number;
  room_rent_amount: number;
  extra_damage_amount: number;
  extra_damage_note: string;
  total_expenses: number;
  net_refund_amount: number;
  ready_to_occupy_date: string;
  move_out_type: 'Early' | 'Normal';
  settlement_type: 'OwnerRefund' | 'TenantPay' | 'ZeroBalance';
  settlement_status: 'PendingMeter' | 'PendingPayment' | 'Completed';
  refund_slip_url: string;
  created_at: string;
}

export default function OwnerMoveOutPage() {
  const { data: session } = useSession();
  const [requests, setRequests] = useState<MoveOutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'16.1' | '16.2' | '16.3'>('16.1');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal State for Meter Recording & Inspection (16.1)
  const [selectedReq, setSelectedReq] = useState<MoveOutItem | null>(null);
  const [meterForm, setMeterForm] = useState({
    prevUnit: 0,
    newUnit: 0,
    extraDamage: 0,
    damageNote: '',
    readyDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  });
  const [submittingMeter, setSubmittingMeter] = useState(false);

  // Modal State for Refund Slip Upload / Verification (16.2)
  const [settleReq, setSettleReq] = useState<MoveOutItem | null>(null);
  const [refundSlipFile, setRefundSlipFile] = useState<string | null>(null);
  const [settleNote, setSettleNote] = useState('');
  const [submittingSettle, setSubmittingSettle] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/move-out');
      const data = await res.json();
      if (data.success) {
        setRequests(data.data || []);
      }
    } catch (e) {
      console.error('Fetch move-out error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, []);

  // Filter requests by Tab
  const filterByTab = (item: MoveOutItem) => {
    if (activeTab === '16.1') {
      // Pending Meter & Calculation
      return item.settlement_status === 'PendingMeter' || item.status === 'Pending';
    }
    if (activeTab === '16.2') {
      // Pending Payment or Refund Settlement
      return item.settlement_status === 'PendingPayment' && item.status !== 'Completed';
    }
    if (activeTab === '16.3') {
      // Completed
      return item.settlement_status === 'Completed' || item.status === 'Completed';
    }
    return true;
  };

  const filtered = requests
    .filter(filterByTab)
    .filter(item => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.room_number?.toLowerCase().includes(q) ||
        item.tenant_name?.toLowerCase().includes(q) ||
        item.tenant_phone?.toLowerCase().includes(q)
      );
    });

  // Open Meter Modal
  const openMeterModal = (item: MoveOutItem) => {
    setSelectedReq(item);
    const prev = item.electric_prev_unit || item.prev_meter_reading || 0;
    setMeterForm({
      prevUnit: prev,
      newUnit: prev,
      extraDamage: item.extra_damage_amount || 0,
      damageNote: item.extra_damage_note || '',
      readyDate: item.ready_to_occupy_date || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
    });
  };

  // Submit Meter & Inspection
  const handleSubmitMeter = async () => {
    if (!selectedReq) return;
    if (meterForm.newUnit < meterForm.prevUnit) {
      alert('⚠️ เลขมิเตอร์ใหม่ต้องไม่น้อยกว่าเลขมิเตอร์ครั้งล่าสุด');
      return;
    }

    setSubmittingMeter(true);
    try {
      const res = await fetch('/api/owner/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: selectedReq.id,
          electricPrevUnit: meterForm.prevUnit,
          electricNewUnit: meterForm.newUnit,
          extraDamageAmount: meterForm.extraDamage,
          extraDamageNote: meterForm.damageNote,
          readyToOccupyDate: meterForm.readyDate
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ บันทึกมิเตอร์และคำนวณยอดปิดการย้ายออกเรียบร้อย', 'success');
        setSelectedReq(null);
        fetchRequests();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการบันทึก', 'error');
      }
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setSubmittingMeter(false);
    }
  };

  // Submit Final Settlement (16.2 -> 16.3)
  const handleFinalizeSettlement = async () => {
    if (!settleReq) return;
    setSubmittingSettle(true);
    try {
      const res = await fetch('/api/owner/move-out', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: settleReq.id,
          refundSlipUrl: refundSlipFile,
          note: settleNote
        })
      });
      const data = await res.json();
      if (data.success) {
        showToast('🎉 ปิดจบกระบวนการย้ายออกสมบูรณ์แล้ว', 'success');
        setSettleReq(null);
        setRefundSlipFile(null);
        fetchRequests();
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาด', 'error');
      }
    } catch (e: any) {
      showToast('Error: ' + e.message, 'error');
    } finally {
      setSubmittingSettle(false);
    }
  };

  // Real-time calculation helpers for modal
  const unitsUsedCalc = Math.max(0, (meterForm.newUnit || 0) - (meterForm.prevUnit || 0));
  const elecAmountCalc = Number((unitsUsedCalc * 4.88).toFixed(2));
  const waterAmountCalc = 100;
  const commonFeeCalc = 150;
  const roomRentCalc = selectedReq ? Number(selectedReq.room_price || 0) : 0;
  const unpaidTotalCalc = selectedReq ? Number(selectedReq.live_unpaid_total || 0) : 0;
  const extraDamageCalc = Number(meterForm.extraDamage || 0);

  const totalExpenseCalc = Number((roomRentCalc + elecAmountCalc + waterAmountCalc + commonFeeCalc + unpaidTotalCalc + extraDamageCalc).toFixed(2));
  
  const isEarlySelected = selectedReq?.is_early_calculated || selectedReq?.move_out_type === 'Early';
  const depositBase = 3000;
  const netRefundCalc = isEarlySelected ? 0 : Math.max(0, depositBase - totalExpenseCalc);
  const tenantMustPayCalc = isEarlySelected ? totalExpenseCalc : (totalExpenseCalc > depositBase ? totalExpenseCalc - depositBase : 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6">
      
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 px-5 py-3 rounded-2xl shadow-2xl text-xs font-black flex items-center gap-2 border animate-bounce ${
          toast.type === 'success' ? 'bg-emerald-950 text-emerald-300 border-emerald-500/50' : 'bg-rose-950 text-rose-300 border-rose-500/50'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-white/10 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-xl shadow-lg shadow-amber-500/10">
              📦
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">คำร้องขอย้ายออก & ปิดยอดห้องพัก</h1>
              <p className="text-xs text-slate-400">ระบบจัดการคำขอย้ายออก 3 ขั้นตอน พร้อมจดมิเตอร์และคำนวณหักเงินประกันอัตโนมัติ</p>
            </div>
          </div>
        </div>

        {/* Global Stats */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
          <div className="px-3.5 py-2 bg-slate-800/80 rounded-2xl border border-white/5 text-center min-w-[90px]">
            <p className="text-[10px] text-amber-400 font-bold uppercase">16.1 ยื่นคำร้อง</p>
            <p className="text-lg font-black text-white">
              {requests.filter(r => r.settlement_status === 'PendingMeter' || r.status === 'Pending').length}
            </p>
          </div>
          <div className="px-3.5 py-2 bg-slate-800/80 rounded-2xl border border-white/5 text-center min-w-[90px]">
            <p className="text-[10px] text-cyan-400 font-bold uppercase">16.2 รอชำระ/คืน</p>
            <p className="text-lg font-black text-white">
              {requests.filter(r => r.settlement_status === 'PendingPayment' && r.status !== 'Completed').length}
            </p>
          </div>
          <div className="px-3.5 py-2 bg-slate-800/80 rounded-2xl border border-white/5 text-center min-w-[90px]">
            <p className="text-[10px] text-emerald-400 font-bold uppercase">16.3 เสร็จสิ้น</p>
            <p className="text-lg font-black text-white">
              {requests.filter(r => r.settlement_status === 'Completed' || r.status === 'Completed').length}
            </p>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/60 p-2.5 rounded-2xl border border-white/5">
        <div className="flex items-center gap-1.5 w-full sm:w-auto">
          {[
            { id: '16.1', label: '16.1 ยื่นคำร้อง (ตรวจห้อง/มิเตอร์)', badge: requests.filter(r => r.settlement_status === 'PendingMeter' || r.status === 'Pending').length },
            { id: '16.2', label: '16.2 รอชำระเงิน / คืนเงินประกัน', badge: requests.filter(r => r.settlement_status === 'PendingPayment' && r.status !== 'Completed').length },
            { id: '16.3', label: '16.3 เสร็จสิ้นแล้ว (Archive)', badge: requests.filter(r => r.settlement_status === 'Completed' || r.status === 'Completed').length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-lg shadow-primary/20'
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-black ${
                  activeTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-800 text-slate-300'
                }`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="w-full sm:w-64">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาห้อง หรือ ชื่อผู้เช่า..."
            className="w-full bg-slate-950 border border-white/10 px-3.5 py-2 rounded-xl text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
          />
        </div>
      </div>

      {/* Content List */}
      {loading ? (
        <div className="py-20 text-center">
          <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
          <p className="text-xs text-slate-400 font-bold">กำลังโหลดข้อมูลคำร้องขอย้ายออก...</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-slate-900/40 border border-white/5 rounded-3xl p-12 text-center">
          <p className="text-4xl mb-3">📭</p>
          <p className="text-sm font-bold text-white">ไม่มีรายการคำร้องในสถานะนี้</p>
          <p className="text-xs text-slate-400 mt-1">คำร้องขอย้ายออกที่ตรงกับตัวกรองจะปรากฏขึ้นที่นี่</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map((item) => {
            const isEarly = item.is_early_calculated || item.move_out_type === 'Early';
            return (
              <div
                key={item.id}
                className="bg-slate-900/80 rounded-3xl p-5 sm:p-6 border border-white/10 shadow-xl hover:border-white/20 transition-all flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                {/* Room & Tenant Info */}
                <div className="flex items-start gap-4">
                  <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-white/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] text-slate-400 font-bold uppercase">ห้อง</span>
                    <span className="text-xl font-black text-amber-400 font-mono">{item.room_number || '-'}</span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-black text-white">{item.tenant_name || 'ไม่ระบุชื่อ'}</h3>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                        isEarly 
                          ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' 
                          : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {isEarly ? '⚠️ 16.1.1 ย้ายออกก่อนกำหนด (ริบประกัน)' : '✅ 16.1.2 ครบกำหนดสัญญา (ประกัน 3,000)'}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">#{item.id}</span>
                    </div>

                    <p className="text-xs text-slate-300 flex flex-wrap items-center gap-3">
                      <span>📞 {item.tenant_phone || '-'}</span>
                      <span>📅 ย้ายออก: <strong className="text-white">{item.desired_date ? new Date(item.desired_date).toLocaleDateString('th-TH') : '-'}</strong></span>
                      <span>💰 ค่าเช่า: <strong className="text-amber-300 font-mono">฿{Number(item.room_price || 0).toLocaleString()}</strong></span>
                    </p>

                    {item.promptpay_target && (
                      <p className="text-[11px] text-cyan-400 font-mono">
                        💳 พร้อมเพย์รับเงิน: {item.promptpay_target} ({item.promptpay_name || item.tenant_name})
                      </p>
                    )}

                    {item.reason && (
                      <p className="text-[11px] text-slate-400 italic">
                        เหตุผล: &ldquo;{item.reason}&rdquo;
                      </p>
                    )}
                  </div>
                </div>

                {/* Financial Summary */}
                <div className="bg-slate-950/80 p-4 rounded-2xl border border-white/5 flex flex-wrap lg:flex-nowrap items-center gap-4 text-xs shrink-0">
                  {item.settlement_status === 'PendingMeter' && item.status !== 'Completed' ? (
                    <div className="text-amber-300 font-bold flex items-center gap-2">
                      <span>⚡</span>
                      <span>รอเจ้าของหอจดมิเตอร์และระบุวันที่พร้อมพัก</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-slate-900/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 block">ค่าไฟ ({item.electric_units_used || 0} หน่วย)</span>
                        <span className="font-mono font-bold text-white">฿{Number(item.electric_amount || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 block">ค่าน้ำ+ส่วนกลาง</span>
                        <span className="font-mono font-bold text-white">฿{(Number(item.water_amount || 100) + Number(item.common_fee || 150)).toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-xl">
                        <span className="text-[10px] text-slate-400 block">รวมค่าใช้จ่ายทั้งหมด</span>
                        <span className="font-mono font-bold text-amber-400">฿{Number(item.total_expenses || 0).toLocaleString()}</span>
                      </div>
                      <div className="bg-slate-900/60 p-2 rounded-xl">
                        {item.settlement_type === 'OwnerRefund' ? (
                          <>
                            <span className="text-[10px] text-emerald-400 font-bold block">คืนเงินประกันสุทธิ</span>
                            <span className="font-mono font-black text-emerald-300">฿{Number(item.net_refund_amount || 0).toLocaleString()}</span>
                          </>
                        ) : item.settlement_type === 'TenantPay' ? (
                          <>
                            <span className="text-[10px] text-rose-400 font-bold block">ลูกหอต้องชำระ</span>
                            <span className="font-mono font-black text-rose-300">
                              ฿{(isEarly ? Number(item.total_expenses) : Math.max(0, Number(item.total_expenses) - 3000)).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-slate-400 block">สถานะยอด</span>
                            <span className="font-mono font-bold text-slate-300">หักล้าง 0 บาท</span>
                          </>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 shrink-0">
                  {activeTab === '16.1' && (
                    <button
                      onClick={() => openMeterModal(item)}
                      className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black shadow-lg shadow-primary/20 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>⚡</span>
                      <span>จดมิเตอร์ & ตรวจห้อง</span>
                    </button>
                  )}

                  {activeTab === '16.2' && (
                    <button
                      onClick={() => setSettleReq(item)}
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>💸</span>
                      <span>{item.settlement_type === 'OwnerRefund' ? 'แนบสลิปคืนเงิน' : 'ตรวจสอบสลิป/ปิดยอด'}</span>
                    </button>
                  )}

                  {activeTab === '16.3' && (
                    <div className="text-right">
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[11px] font-black">
                        ✓ เสร็จสิ้นสมบูรณ์
                      </span>
                      {item.ready_to_occupy_date && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          พร้อมพัก: <strong className="text-white">{new Date(item.ready_to_occupy_date).toLocaleDateString('th-TH')}</strong>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ──────────────── MODAL 16.1: METER INSPECTION & CALCULATION ──────────────── */}
      {selectedReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-2xl w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-reveal my-8">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">ขั้นตอนที่ 16.1</span>
                <h2 className="text-xl font-black text-white">จดมิเตอร์ & คำนวณยอดปิดการย้ายออก — ห้อง {selectedReq.room_number}</h2>
              </div>
              <button
                onClick={() => setSelectedReq(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* Type Alert */}
            <div className={`p-4 rounded-2xl border text-xs font-bold ${
              isEarlySelected
                ? 'bg-rose-950/50 border-rose-500/30 text-rose-300'
                : 'bg-emerald-950/50 border-emerald-500/30 text-emerald-300'
            }`}>
              {isEarlySelected ? (
                <p>⚠️ <strong>16.1.1 ย้ายออกก่อนกำหนด:</strong> ไม่คืนเงินประกัน (ริบประกัน 3,000 บ.) และส่งบิลค่าเช่าเต็มเดือน + ค่าไฟ + ค่าน้ำ + ส่วนกลาง ให้ลูกหอชำระ</p>
              ) : (
                <p>🛡️ <strong>16.1.2 ย้ายออกตามกำหนด:</strong> มีเงินประกันตั้งต้น 3,000 บ. นำมาหักลบกลบหนี้กับค่าใช้จ่ายทั้งหมด</p>
              )}
            </div>

            {/* Meter Inputs Form */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">เลขมิเตอร์ครั้งล่าสุด (เลขตั้งต้น)</label>
                <input
                  type="number"
                  step="0.01"
                  value={meterForm.prevUnit}
                  onChange={(e) => setMeterForm({ ...meterForm, prevUnit: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-white/10 px-4 py-3 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">เลขมิเตอร์วันย้ายออก (เลขใหม่)</label>
                <input
                  type="number"
                  step="0.01"
                  value={meterForm.newUnit}
                  onChange={(e) => setMeterForm({ ...meterForm, newUnit: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-primary/50 px-4 py-3 rounded-xl text-sm font-mono font-bold text-primary focus:outline-none focus:border-primary"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">ค่าเสียหายเพิ่มเติม / ค่าทำความสะอาด (ถ้ามี)</label>
                <input
                  type="number"
                  value={meterForm.extraDamage}
                  onChange={(e) => setMeterForm({ ...meterForm, extraDamage: parseFloat(e.target.value) || 0 })}
                  className="w-full bg-slate-950 border border-white/10 px-4 py-3 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-primary"
                  placeholder="0.00"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">วันที่ห้องพร้อมเข้าพักใหม่ (ready_to_occupy_date)</label>
                <input
                  type="date"
                  required
                  value={meterForm.readyDate}
                  onChange={(e) => setMeterForm({ ...meterForm, readyDate: e.target.value })}
                  className="w-full bg-slate-950 border border-amber-500/40 px-4 py-3 rounded-xl text-sm text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div className="sm:col-span-2 space-y-1.5">
                <label className="text-xs font-bold text-slate-300">หมายเหตุค่าเสียหาย / รายการตรวจห้อง</label>
                <textarea
                  rows={2}
                  value={meterForm.damageNote}
                  onChange={(e) => setMeterForm({ ...meterForm, damageNote: e.target.value })}
                  placeholder="เช่น ค่าล้างแอร์ 500 บาท, กุญแจห้องหาย 150 บาท..."
                  className="w-full bg-slate-950 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-primary"
                />
              </div>
            </div>

            {/* Real-time Calculation Breakdown (Rule 16.1 Real-time Feedback) */}
            <div className="bg-slate-950 p-5 rounded-2xl border border-white/10 space-y-3 text-xs">
              <h4 className="font-black text-amber-400 uppercase tracking-wider text-[11px]">สรุปการคำนวณแบบ Real-time</h4>
              <div className="space-y-1.5 divide-y divide-white/5 font-mono">
                <div className="flex justify-between py-1 text-slate-300">
                  <span>ค่าเช่าเดือนสุดท้าย (คิดเต็มเดือน):</span>
                  <span>฿{roomRentCalc.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-300">
                  <span>ค่าไฟ ({unitsUsedCalc} หน่วย × 4.88 บาท):</span>
                  <span className="text-primary font-bold">฿{elecAmountCalc.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-300">
                  <span>ค่าน้ำเหมาจ่าย:</span>
                  <span>฿{waterAmountCalc.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-1 text-slate-300">
                  <span>ค่าส่วนกลางเหมาจ่าย:</span>
                  <span>฿{commonFeeCalc.toLocaleString()}</span>
                </div>
                {unpaidTotalCalc > 0 && (
                  <div className="flex justify-between py-1 text-rose-300">
                    <span>ยอดค้างชำระจากเดือนก่อน:</span>
                    <span>฿{unpaidTotalCalc.toLocaleString()}</span>
                  </div>
                )}
                {extraDamageCalc > 0 && (
                  <div className="flex justify-between py-1 text-rose-300">
                    <span>ค่าเสียหาย/ทำความสะอาดเพิ่มเติม:</span>
                    <span>฿{extraDamageCalc.toLocaleString()}</span>
                  </div>
                )}
                <div className="flex justify-between py-2 text-white font-bold text-sm border-t border-white/10">
                  <span>รวมค่าใช้จ่ายทั้งหมด (Total Expenses):</span>
                  <span className="text-amber-400">฿{totalExpenseCalc.toLocaleString()}</span>
                </div>

                {/* Final Net Comparison */}
                {!isEarlySelected ? (
                  <div className="flex justify-between py-2 text-sm font-bold border-t border-dashed border-white/20">
                    {totalExpenseCalc < depositBase ? (
                      <>
                        <span className="text-emerald-400">เจ้าของหอต้องคืนเงินประกัน (฿3,000 - ฿{totalExpenseCalc}):</span>
                        <span className="text-emerald-300 text-base">฿{netRefundCalc.toLocaleString()}</span>
                      </>
                    ) : totalExpenseCalc > depositBase ? (
                      <>
                        <span className="text-rose-400">ลูกหอต้องจ่ายส่วนเกิน (฿{totalExpenseCalc} - ฿3,000):</span>
                        <span className="text-rose-300 text-base">฿{tenantMustPayCalc.toLocaleString()}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-cyan-400">หักล้างพอดี 0 บาท:</span>
                        <span className="text-cyan-300 text-base">฿0.00 (ข้ามไป 16.3 ทันที)</span>
                      </>
                    )}
                  </div>
                ) : (
                  <div className="flex justify-between py-2 text-sm font-bold border-t border-dashed border-white/20 text-rose-400">
                    <span>ลูกหอต้องชำระเต็มจำนวน (ริบเงินประกัน):</span>
                    <span className="text-rose-300 text-base">฿{tenantMustPayCalc.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSelectedReq(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submittingMeter}
                onClick={handleSubmitMeter}
                className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black shadow-xl shadow-primary/20 cursor-pointer disabled:opacity-50"
              >
                {submittingMeter 
                  ? 'กำลังบันทึก...' 
                  : (!isEarlySelected && totalExpenseCalc === depositBase)
                  ? '✓ ยืนยันปิดจบการย้ายออกทันที (หักล้าง 0 บาท)'
                  : (!isEarlySelected && totalExpenseCalc < depositBase)
                  ? 'ยืนยันและไปขั้นตอนคืนเงินประกัน →'
                  : 'ยืนยันและส่งบิลค่าใช้จ่าย →'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────── MODAL 16.2: SETTLEMENT & SLIP UPLOAD ──────────────── */}
      {settleReq && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-6 shadow-2xl animate-reveal">
            
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div>
                <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-widest">ขั้นตอนที่ 16.2</span>
                <h2 className="text-lg font-black text-white">ปิดยอดการเงิน — ห้อง {settleReq.room_number}</h2>
              </div>
              <button
                onClick={() => setSettleReq(null)}
                className="w-8 h-8 rounded-full bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            {/* QR Code & Transfer Target (If Owner Refund) */}
            {settleReq.settlement_type === 'OwnerRefund' ? (
              <div className="bg-slate-950 p-5 rounded-2xl border border-white/10 text-center space-y-4">
                <p className="text-xs text-slate-300">
                  โอนคืนเงินประกันให้ลูกหอจำนวน: <strong className="text-emerald-400 text-lg font-mono">฿{Number(settleReq.net_refund_amount || 0).toLocaleString()}</strong>
                </p>

                {settleReq.qr_image ? (
                  <div className="mx-auto w-48 h-48 bg-white p-2 rounded-2xl shadow-xl flex items-center justify-center">
                    <img src={settleReq.qr_image} alt="PromptPay QR" className="w-full h-full object-contain" />
                  </div>
                ) : (
                  <div className="p-4 bg-slate-900 rounded-xl text-xs text-slate-400">
                    พร้อมเพย์: <strong className="text-white">{settleReq.promptpay_target}</strong> ({settleReq.promptpay_name || settleReq.tenant_name})
                  </div>
                )}

                <div className="space-y-2 text-left">
                  <label className="text-xs font-bold text-slate-300">แนบสลิปการโอนเงินคืนประกัน</label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onload = (event) => setRefundSlipFile(event.target?.result as string);
                        reader.readAsDataURL(file);
                      }
                    }}
                    className="w-full text-xs text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-black file:bg-primary file:text-white hover:file:bg-primary/90"
                  />
                  {refundSlipFile && (
                    <div className="mt-2 w-24 h-24 relative rounded-xl overflow-hidden border border-white/20">
                      <img src={refundSlipFile} alt="Slip Preview" className="w-full h-full object-cover" />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-950 p-5 rounded-2xl border border-white/10 text-center space-y-3">
                <p className="text-xs text-slate-300">
                  ลูกหอมียอดต้องชำระ: <strong className="text-rose-400 text-lg font-mono">฿{Number(settleReq.total_expenses || 0).toLocaleString()}</strong>
                </p>
                <p className="text-[11px] text-slate-400">
                  เมื่อลูกหอสแกนชำระผ่านระบบ หรือชำระเงินสดเรียบร้อยแล้ว ให้กดยืนยันเพื่อปิดสัญญาและปรับสิทธิ์เป็น Guest
                </p>
              </div>
            )}

            {/* Note */}
            <div className="space-y-1.5 text-left">
              <label className="text-xs font-bold text-slate-300">บันทึกเพิ่มเติม (Audit Note)</label>
              <input
                type="text"
                value={settleNote}
                onChange={(e) => setSettleNote(e.target.value)}
                placeholder="เช่น เคลียร์กุญแจครบถ้วน, โอนเงินคืนสำเร็จ..."
                className="w-full bg-slate-950 border border-white/10 p-3 rounded-xl text-xs text-white focus:outline-none focus:border-primary"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setSettleReq(null)}
                className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                type="button"
                disabled={submittingSettle}
                onClick={handleFinalizeSettlement}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black shadow-xl shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
              >
                {submittingSettle ? 'กำลังบันทึก...' : 'ยืนยันปิดการย้ายออก (Complete)'}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
