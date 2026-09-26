'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';
import PremiumDatePicker from '@/app/components/PremiumDatePicker';

interface Bill {
  id: number;
  title: string;
  amount: number | string;
  billing_cycle: string;
  due_date: string;
  status: 'Unpaid' | 'Paid' | 'Pending' | 'Overdue' | 'Cancelled' | string;
  slip_url?: string | null;
  created_at: string;
  dorm_id?: number;
  room_number: string;
  water_units?: number | string;
  electric_units?: number | string;
  water_amount?: number | string;
  electric_amount?: number | string;
  room_amount?: number | string;
  tenant_id?: number;
  tenant_name?: string;
  tenant_phone?: string | null;
  tenant_email?: string | null;
  dorm_name?: string;
  dorm_address?: string;
  dorm_phone?: string;
  promptpay_number?: string;
  promptpay_name?: string;
  water_rate?: number;
  electricity_rate?: number;
}

interface Tenant {
  id: number;
  name: string;
  room_number: string;
  phone?: string;
  price?: number;
}

export default function OwnerBillingPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [bills, setBills] = useState<Bill[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [dormsList, setDormsList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerDormId, setOwnerDormId] = useState<number | null>(null);
  const [dormProfile, setDormProfile] = useState<any>(null);

  // Filters & Search
  const [filterStatus, setFilterStatus] = useState<string>('All');
  const [selectedCycle, setSelectedCycle] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [inspectingBill, setInspectingBill] = useState<Bill | null>(null);
  const [receiptBill, setReceiptBill] = useState<Bill | null>(null);
  const [zoomSlip, setZoomSlip] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Form Data for Single Bill
  const [formData, setFormData] = useState({
    tenant_id: '',
    room_number: '',
    title: 'ค่าเช่าห้องพักและสาธารณูปโภค',
    room_amount: '',
    water_units: '0',
    electric_units: '0',
    water_amount: '0',
    electric_amount: '0',
    amount: '',
    billing_cycle: '',
    due_date: '',
  });

  // Batch Form Data
  const [batchData, setBatchData] = useState({
    title: 'ค่าเช่าห้องพักประจำเดือน',
    billing_cycle: '',
    due_date: '',
  });

  const showToast = (message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  const fetchBillData = async (dormId: number) => {
    setLoading(true);
    try {
      const [billsRes, tenantsRes, dormRes] = await Promise.all([
        fetch(`/api/owner/billing?dormId=${dormId}`),
        fetch(`/api/tenants?dormId=${dormId}`),
        fetch(`/api/owner/settings?dormId=${dormId}`).catch(() => null),
      ]);

      const billsData = await billsRes.json();
      const tenantsData = await tenantsRes.json();

      if (billsData.success) setBills(billsData.data || []);
      if (tenantsData.success) setTenants(tenantsData.data || []);

      if (dormRes) {
        const dormData = await dormRes.json();
        if (dormData.success) setDormProfile(dormData.dorm || null);
      }
    } catch (err) {
      console.error('Fetch error:', err);
      showToast('ไม่สามารถดึงข้อมูลบิลได้ กรุณาลองใหม่อีกครั้ง', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin');
      return;
    }

    if (authStatus === 'authenticated' && session.user?.email) {
      const urlStatus = searchParams.get('status');
      const urlDormId = searchParams.get('dormId');
      const savedDb = urlDormId || (typeof window !== 'undefined' ? localStorage.getItem('selectedDormDbName') : null);

      if (urlStatus) {
        setFilterStatus(urlStatus);
        setSelectedCycle('All');
      }

      fetch(`/api/owner/onboarding?email=${encodeURIComponent(session.user.email)}${savedDb ? `&dormDbName=${savedDb}` : ''}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.hasDorm) {
            setDormsList(data.dorms || []);
            const targetDorm = (urlDormId && data.dorms?.find((d: any) => String(d.id) === String(urlDormId) || d.db_name === urlDormId)) || data.dorm || data.dorms?.[0];
            const resolvedDormId = Number(targetDorm?.id || targetDorm?.dorm_id || data.selectedDormId || data.dorms?.[0]?.id || 1);
            setOwnerDormId(resolvedDormId);
            setDormProfile(targetDorm || { id: resolvedDormId, dorm_id: resolvedDormId });
            fetchBillData(resolvedDormId);
          } else {
            setLoading(false);
          }
        })
        .catch(() => setLoading(false));
    }
  }, [authStatus, session, router, searchParams]);

  // Set default billing cycles on mount
  useEffect(() => {
    const currentMonthTh = new Date().toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
    const currentDueDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    setBatchData({
      title: `ค่าเช่าและสาธารณูปโภคประจำเดือน ${currentMonthTh}`,
      billing_cycle: currentMonthTh,
      due_date: currentDueDate,
    });
    
    setFormData((prev) => ({
      ...prev,
      billing_cycle: currentMonthTh,
      due_date: currentDueDate,
    }));
  }, []);

  // When tenant is selected in single bill form
  const handleTenantChange = async (tenantId: string) => {
    const found = tenants.find((t) => String(t.id) === tenantId);
    if (found) {
      const roomPrice = Number(found.price) || 2800;
      const defaultWater = 100;
      let eleUnits = 0;
      let eleAmount = 0;

      // Auto-lookup latest electricity meter reading for this room
      try {
        const mRes = await fetch(`/api/owner/meters?dormId=${ownerDormId || 1}`);
        const mData = await mRes.json();
        if (mData.success && Array.isArray(mData.data)) {
          const roomReadings = mData.data.filter((r: any) => 
            (String(r.room_number) === String(found.room_number) || String(r.room_id) === String(found.room_id)) &&
            (r.type === 'Electricity' || r.type === 'Electric')
          );
          if (roomReadings.length > 0) {
            roomReadings.sort((a: any, b: any) => b.id - a.id);
            const latest = roomReadings[0];
            const units = Number(latest.units_used) || (Number(latest.current_reading) - Number(latest.previous_reading)) || 0;
            if (units > 0) {
              eleUnits = units;
              eleAmount = units * 7;
            }
          }
        }
      } catch (err) {
        console.warn('Could not auto-fetch meter reading:', err);
      }

      setFormData((prev) => ({
        ...prev,
        tenant_id: tenantId,
        room_number: found.room_number || '',
        room_amount: String(roomPrice),
        water_amount: String(defaultWater),
        water_units: '1',
        electric_units: String(eleUnits),
        electric_amount: String(eleAmount),
        amount: String(roomPrice + defaultWater + eleAmount),
      }));
    } else {
      setFormData((prev) => ({ ...prev, tenant_id: tenantId, room_number: '' }));
    }
  };

  // Recalculate total amount for single form
  const updateUtilityAmounts = (waterAmt: number, elecAmt: number, roomAmt: number) => {
    const total = roomAmt + waterAmt + elecAmt;
    setFormData((prev) => ({
      ...prev,
      water_amount: String(waterAmt),
      electric_amount: String(elecAmt),
      room_amount: String(roomAmt),
      amount: String(total),
    }));
  };

  const handleCreateBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerDormId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/billing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          dorm_id: ownerDormId,
          amount: parseFloat(formData.amount) || 0,
          room_amount: parseFloat(formData.room_amount) || 0,
          water_amount: parseFloat(formData.water_amount) || 0,
          electric_amount: parseFloat(formData.electric_amount) || 0,
          water_units: parseFloat(formData.water_units) || 0,
          electric_units: parseFloat(formData.electric_units) || 0,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        showToast('✓ ออกใบแจ้งหนี้รายห้องสำเร็จ');
        setFormData((prev) => ({
          ...prev,
          tenant_id: '',
          room_number: '',
          amount: '',
          water_units: '0',
          electric_units: '0',
          water_amount: '0',
          electric_amount: '0',
        }));
        fetchBillData(ownerDormId);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการออกบิล', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleBatchGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ownerDormId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/billing/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dormId: ownerDormId,
          billingCycle: batchData.billing_cycle,
          dueDate: batchData.due_date,
          title: batchData.title,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message || '✓ ออกบิลอัตโนมัติสำเร็จ');
        setIsBatchModalOpen(false);
        fetchBillData(ownerDormId);
      } else {
        showToast(data.message || 'เกิดข้อผิดพลาดในการออกบิลอัตโนมัติ', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการเชื่อมต่อ', 'error');
    } finally {
      setSubmitting(false);
    }
  };

  // Status and Verification handlers
  const updateStatus = async (billId: number, newStatus: string, slipUrlParam?: string | null) => {
    try {
      const payload: any = { status: newStatus };
      if (slipUrlParam !== undefined) payload.slip_url = slipUrlParam;

      const res = await fetch(`/api/owner/billing/${billId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const resData = await res.json();
      if (res.ok && resData.success) {
        showToast(`✓ อัปเดตสถานะเป็น "${newStatus === 'Paid' ? 'ชำระแล้ว' : newStatus === 'Pending' ? 'รอตรวจสอบ' : newStatus === 'Unpaid' ? 'ค้างชำระ' : newStatus}" เรียบร้อย`);
        if (ownerDormId) fetchBillData(ownerDormId);
        if (inspectingBill && inspectingBill.id === billId) {
          setInspectingBill(null);
          setShowRejectBox(false);
          setRejectReason('');
        }
      } else {
        showToast(resData.message || 'ไม่สามารถอัปเดตสถานะได้', 'error');
      }
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการอัปเดต', 'error');
    }
  };

  const handleApproveSlip = async (bill: Bill) => {
    await updateStatus(bill.id, 'Paid');
  };

  const handleRejectSlip = async (bill: Bill) => {
    if (!rejectReason.trim()) {
      alert('กรุณาระบุเหตุผลในการปฏิเสธสลิป');
      return;
    }
    // Set to Unpaid and clear slip
    await updateStatus(bill.id, 'Unpaid', null);
  };

  const deleteBill = async (billId: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบบิลนี้? การกระทำนี้ไม่สามารถเรียกคืนได้')) return;
    try {
      const res = await fetch(`/api/owner/billing/${billId}`, { method: 'DELETE' });
      if (res.ok) {
        showToast('✓ ลบบิลเรียบร้อยแล้ว');
        if (ownerDormId) fetchBillData(ownerDormId);
      }
    } catch (err) {
      console.error(err);
      showToast('เกิดข้อผิดพลาดในการลบ', 'error');
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (bills.length === 0) {
      alert('ไม่มีข้อมูลบิลสำหรับส่งออก');
      return;
    }
    const headers = ['เลขที่บิล', 'ห้อง', 'ชื่อผู้เช่า', 'เบอร์โทร', 'รายการ', 'รอบบิล', 'ค่าห้อง', 'ค่าน้ำ', 'ค่าไฟ', 'ยอดรวมสุทธิ', 'กำหนดชำระ', 'สถานะ'];
    const rows = filteredBills.map((b) => [
      b.id,
      `"${b.room_number}"`,
      `"${b.tenant_name || '-'}"`,
      `"${b.tenant_phone || '-'}"`,
      `"${b.title}"`,
      `"${b.billing_cycle}"`,
      Number(b.room_amount || 0).toFixed(2),
      Number(b.water_amount || 0).toFixed(2),
      Number(b.electric_amount || 0).toFixed(2),
      Number(b.amount).toFixed(2),
      b.due_date ? new Date(b.due_date).toLocaleDateString('th-TH') : '-',
      b.status,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `smartdom_billing_report_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Unique billing cycles for dropdown
  const billingCycles = useMemo(() => {
    const cycles = Array.from(new Set(bills.map((b) => b.billing_cycle))).filter(Boolean);
    return ['All', ...cycles];
  }, [bills]);

  // Filtering
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      // Status filter
      if (filterStatus !== 'All' && b.status !== filterStatus) return false;
      // Cycle filter
      if (selectedCycle !== 'All' && b.billing_cycle !== selectedCycle) return false;
      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchRoom = (b.room_number || '').toLowerCase().includes(q);
        const matchName = (b.tenant_name || '').toLowerCase().includes(q);
        const matchPhone = (b.tenant_phone || '').toLowerCase().includes(q);
        const matchTitle = (b.title || '').toLowerCase().includes(q);
        if (!matchRoom && !matchName && !matchPhone && !matchTitle) return false;
      }
      return true;
    });
  }, [bills, filterStatus, selectedCycle, searchQuery]);

  // Statistics
  const stats = useMemo(() => {
    const pendingBills = bills.filter((b) => b.status === 'Pending');
    const unpaidBills = bills.filter((b) => b.status === 'Unpaid' || b.status === 'Overdue');
    const paidBills = bills.filter((b) => b.status === 'Paid' || b.status === 'paid');

    const totalPendingAmount = pendingBills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    const totalUnpaidAmount = unpaidBills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    const totalPaidAmount = paidBills.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    const totalAmount = bills.reduce((acc, b) => acc + Number(b.amount || 0), 0);

    return {
      pendingCount: pendingBills.length,
      pendingAmount: totalPendingAmount,
      unpaidCount: unpaidBills.length,
      unpaidAmount: totalUnpaidAmount,
      paidCount: paidBills.length,
      paidAmount: totalPaidAmount,
      totalCount: bills.length,
      totalAmount: totalAmount,
    };
  }, [bills]);

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground min-h-screen p-4 sm:p-6 lg:p-10 font-sans">
      
      {/* Floating Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-6 right-6 z-50 px-6 py-3.5 rounded-2xl shadow-2xl backdrop-blur-xl border flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300',
            toast.type === 'success'
              ? 'bg-emerald-950/90 text-emerald-200 border-emerald-500/30'
              : 'bg-rose-950/90 text-rose-200 border-rose-500/30'
          )}
        >
          <span className="w-2.5 h-2.5 rounded-full bg-current animate-ping" />
          <span className="text-sm font-bold">{toast.message}</span>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-8 pb-16">
        
        {/* Header Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 bg-card/80 backdrop-blur-xl p-6 sm:p-8 rounded-[2.5rem] border border-border shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10">
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <span className="px-3 py-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 text-xs font-black uppercase tracking-widest rounded-full">
                ⚡ ระบบบิลและการเงิน
              </span>
              {dormsList.length > 1 ? (
                <select
                  value={ownerDormId || ''}
                  onChange={(e) => {
                    const selectedId = Number(e.target.value);
                    const chosen = dormsList.find((d: any) => d.id === selectedId);
                    if (chosen) {
                      setOwnerDormId(chosen.id);
                      setDormProfile(chosen);
                      if (chosen.db_name) localStorage.setItem('selectedDormDbName', chosen.db_name);
                      fetchBillData(chosen.id);
                    }
                  }}
                  className="bg-black/20 text-amber-300 text-xs font-bold px-3 py-1 rounded-xl border border-amber-500/30 outline-none cursor-pointer"
                >
                  {dormsList.map((d: any) => (
                    <option key={d.id} value={d.id} className="bg-slate-900 text-white">
                      🏢 {d.name || d.dorm_name}
                    </option>
                  ))}
                </select>
              ) : dormProfile?.name ? (
                <span className="text-xs font-semibold text-slate-400">
                  📍 {dormProfile.name}
                </span>
              ) : null}
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-foreground tracking-tight">
              การตรวจสอบและบิลค่าเช่า
            </h1>
            <p className="text-slate-400 mt-1 text-sm font-medium">
              ตรวจสอบสลิปการโอนเงิน ออกใบแจ้งหนี้อัตโนมัติ และพิมพ์ใบเสร็จรับเงินสำหรับผู้เช่า
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 relative z-10">
            <button
              onClick={handleExportCSV}
              className="px-5 py-3.5 bg-white/5 hover:bg-white/10 text-slate-200 border border-border rounded-2xl font-bold text-xs sm:text-sm transition-all flex items-center gap-2 cursor-pointer shadow-lg active:scale-95"
              title="ส่งออกไฟล์ CSV สำหรับบัญชี"
            >
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              ส่งออก CSV
            </button>

            <button
              onClick={() => setIsBatchModalOpen(true)}
              className="px-6 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-amber-500/20 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              ออกบิลทั้งหอ (Auto Batch)
            </button>

            <button
              onClick={() => setIsModalOpen(true)}
              className="px-6 py-3.5 bg-primary hover:bg-primary/90 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl shadow-primary/30 transition-all flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              ออกบิลรายห้อง
            </button>
          </div>
        </div>

        {/* 4-Dimension Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
          
          {/* Card 1: Pending Slips Review */}
          <div 
            onClick={() => setFilterStatus('Pending')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden group shadow-lg",
              filterStatus === 'Pending' 
                ? "bg-amber-500/15 border-amber-500/50 ring-2 ring-amber-400/30" 
                : "bg-card/70 border-amber-500/20 hover:border-amber-500/40 hover:bg-card"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-amber-400 uppercase tracking-widest flex items-center gap-2">
                <span className={cn("w-2 h-2 rounded-full bg-amber-400", stats.pendingCount > 0 && "animate-ping")} />
                รอตรวจสอบสลิป
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-amber-400/10 text-amber-400 font-black text-xs border border-amber-400/20">
                {stats.pendingCount} รายการ
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-foreground group-hover:text-amber-300 transition-colors">
              ฿{stats.pendingAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-amber-300/80 mt-2 font-medium flex items-center justify-between">
              <span>แนบสลิปแล้วรออนุมัติ</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform">คลิกเพื่อกรอง →</span>
            </p>
          </div>

          {/* Card 2: Unpaid / Overdue */}
          <div 
            onClick={() => setFilterStatus('Unpaid')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden group shadow-lg",
              filterStatus === 'Unpaid' 
                ? "bg-rose-500/15 border-rose-500/50 ring-2 ring-rose-400/30" 
                : "bg-card/70 border-rose-500/20 hover:border-rose-500/40 hover:bg-card"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-rose-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                ค้างชำระทั้งหมด
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-rose-400/10 text-rose-400 font-black text-xs border border-rose-400/20">
                {stats.unpaidCount} ห้อง
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-rose-400 group-hover:text-rose-300 transition-colors">
              ฿{stats.unpaidAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-rose-300/80 mt-2 font-medium flex items-center justify-between">
              <span>ยังไม่ได้รับชำระ</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform">คลิกเพื่อกรอง →</span>
            </p>
          </div>

          {/* Card 3: Paid / Completed */}
          <div 
            onClick={() => setFilterStatus('Paid')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden group shadow-lg",
              filterStatus === 'Paid' 
                ? "bg-emerald-500/15 border-emerald-500/50 ring-2 ring-emerald-400/30" 
                : "bg-card/70 border-emerald-500/20 hover:border-emerald-500/40 hover:bg-card"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-emerald-400 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                รับชำระเงินแล้ว
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 font-black text-xs border border-emerald-400/20">
                {stats.paidCount} รายการ
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-emerald-400 group-hover:text-emerald-300 transition-colors">
              ฿{stats.paidAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-emerald-300/80 mt-2 font-medium flex items-center justify-between">
              <span>รายรับที่ตรวจสอบแล้ว</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform">คลิกเพื่อกรอง →</span>
            </p>
          </div>

          {/* Card 4: Total Invoices */}
          <div 
            onClick={() => setFilterStatus('All')}
            className={cn(
              "p-6 rounded-[2rem] border transition-all cursor-pointer relative overflow-hidden group shadow-lg",
              filterStatus === 'All' 
                ? "bg-violet-500/15 border-violet-500/50 ring-2 ring-violet-400/30" 
                : "bg-card/70 border-border hover:border-white/20 hover:bg-card"
            )}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                บิลทั้งหมดในระบบ
              </span>
              <span className="px-2.5 py-0.5 rounded-full bg-secondary text-foreground font-black text-xs border border-border">
                {stats.totalCount} ฉบับ
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-foreground group-hover:text-violet-300 transition-colors">
              ฿{stats.totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h3>
            <p className="text-xs text-slate-400 mt-2 font-medium flex items-center justify-between">
              <span>ยอดรวมทุกสถานะ</span>
              <span className="text-[10px] underline font-bold group-hover:translate-x-1 transition-transform">ดูทั้งหมด →</span>
            </p>
          </div>

        </div>

        {/* Filter and Search Bar Section */}
        <div className="bg-card/90 backdrop-blur-md rounded-[2.5rem] border border-border p-6 space-y-6 shadow-xl">
          
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            
            {/* Status Pills */}
            <div className="flex flex-wrap items-center gap-2 bg-secondary/40 p-1.5 rounded-2xl border border-border">
              {[
                { id: 'All', label: 'ทั้งหมด', count: stats.totalCount },
                { id: 'Pending', label: '🔔 รอตรวจสลิป', count: stats.pendingCount, highlight: true },
                { id: 'Unpaid', label: '⏳ ค้างชำระ', count: stats.unpaidCount },
                { id: 'Paid', label: '✓ ชำระแล้ว', count: stats.paidCount },
                { id: 'Overdue', label: '⚠️ เกินกำหนด', count: bills.filter((b) => b.status === 'Overdue').length },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setFilterStatus(tab.id)}
                  className={cn(
                    'px-4 py-2 rounded-xl text-xs font-black transition-all flex items-center gap-2 cursor-pointer',
                    filterStatus === tab.id
                      ? tab.id === 'Pending'
                        ? 'bg-amber-500 text-slate-950 shadow-lg shadow-amber-500/20'
                        : 'bg-primary text-white shadow-lg shadow-primary/20'
                      : 'text-slate-400 hover:text-foreground hover:bg-secondary',
                    tab.highlight && filterStatus !== tab.id && tab.count > 0 && 'text-amber-400 font-bold animate-pulse'
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      'px-1.5 py-0.5 rounded-md text-[10px] font-black',
                      filterStatus === tab.id ? 'bg-black/20 text-current' : 'bg-white/10 text-slate-300'
                    )}
                  >
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Cycle Selector */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-bold text-slate-400 shrink-0">รอบบิล:</span>
              <select
                value={selectedCycle}
                onChange={(e) => setSelectedCycle(e.target.value)}
                className="bg-secondary/40 text-slate-200 border border-border px-4 py-2.5 rounded-xl text-xs font-bold outline-none focus:border-primary cursor-pointer transition-colors"
              >
                {billingCycles.map((c) => (
                  <option key={c} value={c} className="bg-card text-foreground">
                    {c === 'All' ? '📅 ทุกรอบบิล' : c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <svg
              className="w-5 h-5 absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ค้นหาตามหมายเลขห้อง, ชื่อผู้เช่า, เบอร์โทรศัพท์ หรือรายการบิล..."
              className="w-full pl-12 pr-4 py-3.5 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground placeholder:text-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs font-bold"
              >
                ล้างคำค้น
              </button>
            )}
          </div>
        </div>

        {/* Bills Table Card */}
        <div className="bg-card/90 backdrop-blur-md rounded-[2.5rem] border border-border shadow-2xl overflow-hidden">
          
          <div className="p-6 sm:p-8 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-xl font-black text-foreground">รายการใบแจ้งหนี้และสลิปชำระเงิน</h2>
              <p className="text-slate-400 text-xs font-medium mt-0.5">
                แสดงผล {filteredBills.length} จากทั้งหมด {bills.length} รายการ
              </p>
            </div>
            {filterStatus === 'Pending' && stats.pendingCount > 0 && (
              <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400 text-xs font-black flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                มีสลิปรอตรวจสอบ {stats.pendingCount} รายการ
              </div>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[900px]">
              <thead className="bg-secondary/40/80 border-b border-border">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ห้อง</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ผู้เช่า / ติดต่อ</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">รายการ / รอบบิล</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดแยกย่อย</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ยอดสุทธิ</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">ครบกำหนด</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">หลักฐานสลิป</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">สถานะ</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {loading ? (
                  [...Array(4)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td colSpan={9} className="px-6 py-6 bg-white/[0.02]" />
                    </tr>
                  ))
                ) : filteredBills.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-6 py-20 text-center">
                      <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-500">
                        <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <h4 className="text-base font-black text-foreground">ไม่พบรายการบิล</h4>
                      <p className="text-slate-400 text-xs mt-1">ลองเปลี่ยนคำค้นหาหรือเปลี่ยนตัวกรองสถานะ</p>
                    </td>
                  </tr>
                ) : (
                  filteredBills.map((bill) => {
                    const isPending = bill.status === 'Pending';
                    const isPaid = bill.status === 'Paid' || bill.status === 'paid';
                    const isUnpaid = bill.status === 'Unpaid';
                    const isOverdue = bill.status === 'Overdue';

                    return (
                      <tr 
                        key={bill.id} 
                        className={cn(
                          "transition-colors group",
                          isPending ? "bg-amber-500/5 hover:bg-amber-500/10" : "hover:bg-white/[0.03]"
                        )}
                      >
                        {/* Room Number */}
                        <td className="px-6 py-5">
                          <div className="flex items-center gap-2">
                            <span className="w-9 h-9 rounded-xl bg-primary/20 text-primary border border-primary/30 flex items-center justify-center font-black text-sm">
                              {bill.room_number || '-'}
                            </span>
                          </div>
                        </td>

                        {/* Tenant Info */}
                        <td className="px-6 py-5">
                          <p className="font-bold text-sm text-foreground">{bill.tenant_name || 'ไม่ระบุผู้เช่า'}</p>
                          {bill.tenant_phone && (
                            <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                              📞 {bill.tenant_phone}
                            </p>
                          )}
                        </td>

                        {/* Title & Cycle */}
                        <td className="px-6 py-5">
                          <p className="text-sm font-bold text-slate-200">{bill.title}</p>
                          <span className="text-[11px] font-semibold text-slate-400 bg-white/5 px-2 py-0.5 rounded-md mt-1 inline-block">
                            รอบ {bill.billing_cycle}
                          </span>
                        </td>

                        {/* Breakdown */}
                        <td className="px-6 py-5 text-xs text-slate-300">
                          <div className="space-y-0.5">
                            {Number(bill.room_amount || 0) > 0 && (
                              <p className="text-slate-400">ค่าห้อง: <span className="font-semibold text-slate-200">฿{Number(bill.room_amount).toLocaleString()}</span></p>
                            )}
                            {Number(bill.water_amount || 0) > 0 && (
                              <p className="text-cyan-400/80">น้ำ: {bill.water_units} น. (฿{Number(bill.water_amount).toLocaleString()})</p>
                            )}
                            {Number(bill.electric_amount || 0) > 0 && (
                              <p className="text-amber-400/80">ไฟ: {bill.electric_units} น. (฿{Number(bill.electric_amount).toLocaleString()})</p>
                            )}
                          </div>
                        </td>

                        {/* Total Amount */}
                        <td className="px-6 py-5">
                          <span className="text-lg font-black text-emerald-400 tracking-tight">
                            ฿{Number(bill.amount).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </span>
                        </td>

                        {/* Due Date */}
                        <td className="px-6 py-5">
                          <p className="text-xs font-bold text-slate-300">
                            {bill.due_date ? new Date(bill.due_date).toLocaleDateString('th-TH') : '-'}
                          </p>
                          {isUnpaid && bill.due_date && new Date(bill.due_date) < new Date() && (
                            <span className="text-[10px] text-rose-400 font-bold block mt-0.5">
                              ⚠️ เลยกำหนดแล้ว
                            </span>
                          )}
                        </td>

                        {/* Slip Status & Inspection Button */}
                        <td className="px-6 py-5 text-center">
                          {bill.slip_url ? (
                            <button
                              onClick={() => {
                                setInspectingBill(bill);
                                setShowRejectBox(false);
                                setRejectReason('');
                              }}
                              className={cn(
                                "px-3 py-1.5 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 mx-auto transition-all cursor-pointer shadow-md",
                                isPending
                                  ? "bg-amber-400 text-slate-950 hover:bg-amber-300 ring-2 ring-amber-400/40 animate-pulse"
                                  : "bg-white/10 text-slate-200 hover:bg-white/20"
                              )}
                              title="คลิกเพื่อตรวจสอบสลิปการโอนเงิน"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                              </svg>
                              <span>{isPending ? 'ตรวจสลิป' : 'ดูสลิป'}</span>
                            </button>
                          ) : (
                            <span className="text-xs text-slate-500 italic">ไม่มีสลิป</span>
                          )}
                        </td>

                        {/* Status Badge & Dropdown */}
                        <td className="px-6 py-5 text-center">
                          <select
                            value={bill.status}
                            onChange={(e) => updateStatus(bill.id, e.target.value)}
                            className={cn(
                              'text-xs font-black uppercase tracking-wider px-3 py-1.5 rounded-xl border outline-none cursor-pointer transition-all',
                              isPaid && 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
                              isPending && 'bg-amber-500/15 text-amber-400 border-amber-500/40 ring-1 ring-amber-400/40',
                              isUnpaid && 'bg-rose-500/15 text-rose-400 border-rose-500/30',
                              isOverdue && 'bg-red-500/20 text-red-400 border-red-500/40'
                            )}
                          >
                            <option value="Unpaid" className="bg-card text-rose-400">ค้างชำระ (Unpaid)</option>
                            <option value="Pending" className="bg-card text-amber-400">รอตรวจสลิป (Pending)</option>
                            <option value="Paid" className="bg-card text-emerald-400">ชำระแล้ว (Paid)</option>
                            <option value="Overdue" className="bg-card text-red-400">เกินกำหนด (Overdue)</option>
                          </select>
                        </td>

                        {/* Actions */}
                        <td className="px-6 py-5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            {/* Receipt / Invoice Modal Button */}
                            <button
                              onClick={() => setReceiptBill(bill)}
                              className="p-2 rounded-xl text-slate-300 hover:text-foreground hover:bg-secondary transition-colors"
                              title="ดูใบแจ้งหนี้ / ใบเสร็จรับเงิน"
                            >
                              <svg className="w-4 h-4 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>

                            {/* Quick Approve button if Pending */}
                            {isPending && (
                              <button
                                onClick={() => handleApproveSlip(bill)}
                                className="p-2 rounded-xl text-emerald-400 hover:bg-emerald-500/20 transition-colors"
                                title="อนุมัติการชำระเงินทันที"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              </button>
                            )}

                            {/* Delete button */}
                            <button
                              onClick={() => deleteBill(bill.id)}
                              className="p-2 rounded-xl text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="ลบบิลนี้"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>

      {/* ========================================================================= */}
      {/* 🔍 SLIP INSPECTION & VERIFICATION MODAL */}
      {/* ========================================================================= */}
      {inspectingBill && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-card border border-border rounded-[2.5rem] w-full max-w-4xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="p-6 bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground">ตรวจสอบสลิปและยืนยันการชำระเงิน</h3>
                  <p className="text-xs text-amber-300 font-medium">ห้อง {inspectingBill.room_number} • ผู้เช่า: {inspectingBill.tenant_name}</p>
                </div>
              </div>
              <button
                onClick={() => setInspectingBill(null)}
                className="p-2 text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              
              {/* Slip Image View */}
              <div className="space-y-4">
                <div className="text-xs font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>📸 ภาพสลิปหลักฐานการโอน</span>
                  <button 
                    onClick={() => setZoomSlip(!zoomSlip)} 
                    className="text-amber-400 hover:underline text-[11px] font-bold"
                  >
                    {zoomSlip ? 'ย่อขนาด' : '🔍 ดูรูปเต็มจอ'}
                  </button>
                </div>

                <div className="relative rounded-2xl overflow-hidden border border-border bg-black/40 flex items-center justify-center min-h-[320px] max-h-[440px] group">
                  {inspectingBill.slip_url ? (
                    <img
                      src={inspectingBill.slip_url}
                      alt="สลิปการโอนเงิน"
                      className="w-full h-full object-contain cursor-zoom-in group-hover:scale-105 transition-transform duration-300"
                      onClick={() => setZoomSlip(true)}
                    />
                  ) : (
                    <div className="text-center p-8 text-slate-500">
                      <p>ไม่พบไฟล์รูปสลิป</p>
                    </div>
                  )}
                </div>
                <p className="text-[11px] text-slate-400 text-center">
                  💡 แตะที่รูปเพื่อขยายตรวจสอบยอดเงิน วันที่ และเลขอ้างอิงสลิป
                </p>
              </div>

              {/* Bill Details & Verification Actions */}
              <div className="space-y-6">
                
                {/* Amount Compare Card */}
                <div className="bg-secondary/40 p-6 rounded-2xl border border-border space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-400">ยอดที่ต้องชำระตามบิล:</span>
                    <span className="text-2xl font-black text-emerald-400">
                      ฿{Number(inspectingBill.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </span>
                  </div>

                  <div className="border-t border-border pt-3 space-y-2 text-xs">
                    <div className="flex justify-between text-slate-300">
                      <span>ค่าเช่าห้องพัก:</span>
                      <span className="font-bold">฿{Number(inspectingBill.room_amount || 0).toLocaleString()}</span>
                    </div>
                    {Number(inspectingBill.water_amount || 0) > 0 && (
                      <div className="flex justify-between text-cyan-300">
                        <span>ค่าน้ำประปา ({inspectingBill.water_units || 0} หน่วย):</span>
                        <span className="font-bold">฿{Number(inspectingBill.water_amount).toLocaleString()}</span>
                      </div>
                    )}
                    {Number(inspectingBill.electric_amount || 0) > 0 && (
                      <div className="flex justify-between text-amber-300">
                        <span>ค่าไฟฟ้า ({inspectingBill.electric_units || 0} หน่วย):</span>
                        <span className="font-bold">฿{Number(inspectingBill.electric_amount).toLocaleString()}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-400 pt-1 border-t border-border">
                      <span>รอบบิล:</span>
                      <span className="font-semibold text-slate-200">{inspectingBill.billing_cycle}</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>กำหนดชำระ:</span>
                      <span className="font-semibold text-slate-200">
                        {inspectingBill.due_date ? new Date(inspectingBill.due_date).toLocaleDateString('th-TH') : '-'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Reject Slip Form */}
                {showRejectBox ? (
                  <div className="bg-rose-500/10 border border-rose-500/30 p-5 rounded-2xl space-y-3 animate-in fade-in duration-200">
                    <label className="block text-xs font-black text-rose-300">
                      ระบุเหตุผลในการปฏิเสธสลิป:
                    </label>
                    <input
                      type="text"
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder="เช่น ยอดเงินโอนไม่ตรง, สลิปไม่ชัดเจน, โอนผิดบัญชี..."
                      className="w-full px-4 py-2.5 bg-secondary/40 border border-rose-500/40 rounded-xl text-xs font-bold text-foreground outline-none focus:ring-1 focus:ring-rose-400"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowRejectBox(false)}
                        className="px-4 py-2 bg-white/10 hover:bg-white/20 text-slate-300 font-bold text-xs rounded-xl transition-colors"
                      >
                        ยกเลิก
                      </button>
                      <button
                        onClick={() => handleRejectSlip(inspectingBill)}
                        className="flex-1 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-black text-xs rounded-xl shadow-lg transition-all"
                      >
                        ยืนยันปฏิเสธสลิป
                      </button>
                    </div>
                  </div>
                ) : null}

                {/* Verification Actions */}
                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => handleApproveSlip(inspectingBill)}
                    className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm rounded-2xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-2 cursor-pointer active:scale-95"
                  >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                    ✓ อนุมัติการชำระเงิน (ปรับสถานะเป็น Paid)
                  </button>

                  {!showRejectBox && (
                    <button
                      onClick={() => setShowRejectBox(true)}
                      className="w-full py-3.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 border border-rose-500/20 font-bold text-xs rounded-2xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      ปฏิเสธสลิป / แจ้งโอนใหม่
                    </button>
                  )}
                </div>

              </div>

            </div>

          </div>
        </div>
      )}

      {/* Fullscreen Slip Image Zoom Modal */}
      {zoomSlip && inspectingBill?.slip_url && (
        <div 
          onClick={() => setZoomSlip(false)}
          className="fixed inset-0 bg-black/95 z-[60] flex items-center justify-center p-4 cursor-zoom-out animate-in fade-in duration-200"
        >
          <img
            src={inspectingBill.slip_url}
            alt="สลิปขนาดเต็ม"
            className="max-w-full max-h-screen object-contain rounded-xl shadow-2xl"
          />
          <button
            onClick={() => setZoomSlip(false)}
            className="absolute top-6 right-6 text-white bg-white/20 hover:bg-white/30 p-3 rounded-full font-bold"
          >
            ✕ ปิด
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 📄 OFFICIAL INVOICE & RECEIPT MODAL (PRINT READY) */}
      {/* ========================================================================= */}
      {receiptBill && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-card border border-border rounded-[2.5rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            {/* Modal Top Bar */}
            <div className="p-6 bg-secondary/40 border-b border-border flex items-center justify-between">
              <span className="text-xs font-black text-slate-400 uppercase tracking-widest">
                📄 ใบเสร็จรับเงิน / ใบแจ้งหนี้ (Official Receipt)
              </span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => window.print()}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-foreground font-bold text-xs rounded-xl flex items-center gap-2 transition-all shadow-lg cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  สั่งพิมพ์ (Print)
                </button>
                <button
                  onClick={() => setReceiptBill(null)}
                  className="p-2 text-muted-foreground hover:text-foreground bg-white/5 hover:bg-white/10 rounded-xl transition-colors"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Printable Document Area */}
            <div className="p-8 sm:p-10 space-y-6 text-slate-200 bg-white/[0.02]">
              
              {/* Document Header */}
              <div className="flex justify-between items-start border-b border-border pb-6">
                <div>
                  <h2 className="text-2xl font-black text-foreground">
                    {receiptBill.dorm_name || dormProfile?.name || 'หอพักเกษร 2'}
                  </h2>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm">
                    {receiptBill.dorm_address || dormProfile?.address || '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000'}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    โทร: {receiptBill.dorm_phone || dormProfile?.phone || '081-234-5678'}
                  </p>
                </div>
                <div className="text-right">
                  <span className={cn(
                    "px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider inline-block",
                    (receiptBill.status === 'Paid' || receiptBill.status === 'paid') ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  )}>
                    {(receiptBill.status === 'Paid' || receiptBill.status === 'paid') ? '✓ ชำระเงินแล้ว (PAID)' : 'ค้างชำระ (UNPAID)'}
                  </span>
                  <p className="text-xs text-slate-400 mt-2 font-mono">เลขที่: #{receiptBill.id.toString().padStart(6, '0')}</p>
                  <p className="text-xs text-slate-400 font-mono">วันที่ออก: {new Date(receiptBill.created_at).toLocaleDateString('th-TH')}</p>
                </div>
              </div>

              {/* Tenant & Bill Details */}
              <div className="grid grid-cols-2 gap-4 bg-secondary/40 p-4 rounded-2xl border border-border text-xs">
                <div>
                  <span className="text-slate-500 font-bold block mb-1">ข้อมูลผู้เช่า:</span>
                  <p className="font-black text-foreground text-sm">{receiptBill.tenant_name || '-'}</p>
                  <p className="text-slate-400 mt-0.5">ห้องพัก: <span className="font-bold text-primary">{receiptBill.room_number || '-'}</span></p>
                  {receiptBill.tenant_phone && <p className="text-slate-400">โทร: {receiptBill.tenant_phone}</p>}
                </div>
                <div className="text-right">
                  <span className="text-slate-500 font-bold block mb-1">รายละเอียดรอบบิล:</span>
                  <p className="font-bold text-foreground text-sm">{receiptBill.billing_cycle}</p>
                  <p className="text-slate-400 mt-0.5">
                    กำหนดชำระ: {receiptBill.due_date ? new Date(receiptBill.due_date).toLocaleDateString('th-TH') : '-'}
                  </p>
                </div>
              </div>

              {/* Line Items Table */}
              <div className="rounded-2xl border border-border overflow-hidden">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-secondary/40 text-slate-400 border-b border-border">
                    <tr>
                      <th className="px-4 py-3 font-bold">ลำดับ</th>
                      <th className="px-4 py-3 font-bold">รายการ</th>
                      <th className="px-4 py-3 font-bold text-center">หน่วยที่ใช้</th>
                      <th className="px-4 py-3 font-bold text-right">จำนวนเงิน (บาท)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    <tr>
                      <td className="px-4 py-3 text-slate-500 font-mono">1</td>
                      <td className="px-4 py-3 font-bold text-foreground">ค่าเช่าห้องพัก (Room Rent)</td>
                      <td className="px-4 py-3 text-center text-slate-400">1 เดือน</td>
                      <td className="px-4 py-3 text-right font-bold text-foreground">
                        {Number(receiptBill.room_amount || receiptBill.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                    {Number(receiptBill.water_amount || 0) > 0 && (
                      <tr>
                        <td className="px-4 py-3 text-slate-500 font-mono">2</td>
                        <td className="px-4 py-3 font-bold text-cyan-300">ค่าน้ำประปา (Water Utility)</td>
                        <td className="px-4 py-3 text-center text-slate-300">{receiptBill.water_units || 0} หน่วย</td>
                        <td className="px-4 py-3 text-right font-bold text-cyan-300">
                          {Number(receiptBill.water_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                    {Number(receiptBill.electric_amount || 0) > 0 && (
                      <tr>
                        <td className="px-4 py-3 text-slate-500 font-mono">3</td>
                        <td className="px-4 py-3 font-bold text-amber-300">ค่าไฟฟ้า (Electricity Utility)</td>
                        <td className="px-4 py-3 text-center text-slate-300">{receiptBill.electric_units || 0} หน่วย</td>
                        <td className="px-4 py-3 text-right font-bold text-amber-300">
                          {Number(receiptBill.electric_amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-secondary/40 border-t border-border font-bold">
                    <tr>
                      <td colSpan={3} className="px-4 py-4 text-right text-slate-300 font-black text-sm">
                        ยอดรวมสุทธิ (Total Amount):
                      </td>
                      <td className="px-4 py-4 text-right text-emerald-400 font-black text-lg">
                        ฿{Number(receiptBill.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Payment Instructions / PromptPay Info */}
              <div className="bg-secondary/40 p-4 rounded-2xl border border-border flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-foreground">ช่องทางชำระเงิน PromptPay:</p>
                  <p className="text-slate-400 mt-0.5">
                    หมายเลขพร้อมเพย์: <span className="font-mono font-bold text-primary">{receiptBill.promptpay_number || dormProfile?.promptpay_number || '0812345678'}</span>
                  </p>
                  <p className="text-slate-400">
                    ชื่อบัญชี: {receiptBill.promptpay_name || dormProfile?.promptpay_name || 'หอพัก SmartDom'}
                  </p>
                </div>
                <div className="text-right text-[11px] text-slate-500">
                  <p>SmartDom Invoicing System</p>
                  <p>ระบบจัดการหอพักอัจฉริยะ</p>
                </div>
              </div>

            </div>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ⚡ AUTO BATCH BILLING MODAL */}
      {/* ========================================================================= */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-card border border-border rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            <div className="bg-gradient-to-r from-amber-500/20 to-transparent p-6 sm:p-8 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground">ออกบิลอัตโนมัติทั้งหอพัก</h3>
                  <p className="text-xs text-amber-300 font-bold uppercase tracking-widest">Smart Batch Invoicing</p>
                </div>
              </div>
              <button
                onClick={() => setIsBatchModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <div className="p-6 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-200 flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>ระบบจะสร้างบิลค่าเช่าให้ผู้เช่าที่มีสถานะ Active ทุกห้องในหอพักนี้โดยอัตโนมัติ</span>
            </div>

            <form onSubmit={handleBatchGenerate} className="p-6 sm:p-8 space-y-6">
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  หัวข้อบิล
                </label>
                <input
                  type="text"
                  required
                  value={batchData.title}
                  onChange={(e) => setBatchData({ ...batchData, title: e.target.value })}
                  className="w-full px-4 py-3.5 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground outline-none focus:border-primary"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                    รอบบิล
                  </label>
                  <input
                    type="text"
                    required
                    value={batchData.billing_cycle}
                    onChange={(e) => setBatchData({ ...batchData, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3.5 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground outline-none focus:border-primary"
                    placeholder="เช่น สิงหาคม 2569"
                  />
                </div>
                <div>
                  <PremiumDatePicker
                    label="กำหนดชำระ"
                    date={batchData.due_date}
                    onChange={(d) => setBatchData({ ...batchData, due_date: d })}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsBatchModalOpen(false)}
                  className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-2xl transition-colors text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-2xl transition-all shadow-xl shadow-amber-500/20 text-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'กำลังสร้างบิล...' : 'ยืนยันออกบิลทั้งหอ'}
                </button>
              </div>
            </form>

          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ➕ SINGLE ROOM BILLING MODAL */}
      {/* ========================================================================= */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
          <div className="bg-card border border-border rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            
            <div className="bg-gradient-to-r from-primary/20 to-transparent p-6 sm:p-8 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-primary/20 text-primary flex items-center justify-center border border-primary/30">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-xl font-black text-foreground">ออกใบแจ้งหนี้รายห้อง</h3>
                  <p className="text-xs text-primary font-bold uppercase tracking-widest">Single Invoicing</p>
                </div>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateBill} className="p-6 sm:p-8 space-y-5">
              
              {/* Select Tenant / Room */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  เลือกห้องพัก / ผู้เช่า
                </label>
                <select
                  required
                  value={formData.tenant_id}
                  onChange={(e) => handleTenantChange(e.target.value)}
                  className="w-full px-4 py-3.5 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground outline-none focus:border-primary cursor-pointer"
                >
                  <option value="">-- กรุณาเลือกห้องพัก --</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id} className="bg-card text-foreground">
                      ห้อง {t.room_number} - {t.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  หัวข้อบิล
                </label>
                <input
                  type="text"
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-3 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground outline-none focus:border-primary"
                />
              </div>

              {/* Utility and Room breakdown */}
              <div className="space-y-3 bg-secondary/40 p-4 rounded-2xl border border-border text-xs">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 mb-1">ค่าเช่าห้อง (฿)</label>
                    <input
                      type="number"
                      value={formData.room_amount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateUtilityAmounts(parseFloat(formData.water_amount) || 0, parseFloat(formData.electric_amount) || 0, val);
                      }}
                      className="w-full px-3 py-2 bg-card border border-border rounded-xl text-foreground font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-cyan-300 mb-1">ค่าน้ำเหมาจ่าย (฿)</label>
                    <input
                      type="number"
                      value={formData.water_amount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateUtilityAmounts(val, parseFloat(formData.electric_amount) || 0, parseFloat(formData.room_amount) || 0);
                      }}
                      className="w-full px-3 py-2 bg-card border border-border rounded-xl text-foreground font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-amber-300 mb-1">ค่าไฟฟ้า (฿)</label>
                    <input
                      type="number"
                      value={formData.electric_amount}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        updateUtilityAmounts(parseFloat(formData.water_amount) || 0, val, parseFloat(formData.room_amount) || 0);
                      }}
                      className="w-full px-3 py-2 bg-card border border-border rounded-xl text-foreground font-bold"
                    />
                  </div>
                </div>

                {/* Meter units inputs */}
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/50">
                  <div>
                    <label className="block text-[10px] font-bold text-amber-400 mb-1">
                      ⚡ หน่วยไฟที่ใช้ (ยูนิต × ฿7)
                    </label>
                    <input
                      type="number"
                      value={formData.electric_units}
                      onChange={(e) => {
                        const units = parseFloat(e.target.value) || 0;
                        const elecAmt = units * 7;
                        setFormData((prev) => ({ ...prev, electric_units: String(units) }));
                        updateUtilityAmounts(parseFloat(formData.water_amount) || 0, elecAmt, parseFloat(formData.room_amount) || 0);
                      }}
                      className="w-full px-3 py-2 bg-card border border-amber-500/30 rounded-xl text-amber-400 font-bold"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-cyan-400 mb-1">
                      💧 หน่วยน้ำ (เหมาจ่าย)
                    </label>
                    <input
                      type="number"
                      value={formData.water_units}
                      onChange={(e) => {
                        setFormData((prev) => ({ ...prev, water_units: e.target.value }));
                      }}
                      className="w-full px-3 py-2 bg-card border border-cyan-500/30 rounded-xl text-cyan-400 font-bold"
                      placeholder="1"
                    />
                  </div>
                </div>
              </div>

              {/* Total Amount */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                  ยอดรวมสุทธิ (บาท)
                </label>
                <input
                  type="number"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-5 py-3.5 bg-secondary/40 border border-border rounded-2xl text-2xl font-black text-emerald-400 outline-none focus:border-primary"
                  placeholder="0.00"
                />
              </div>

              {/* Cycle & Due Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-400 uppercase tracking-wider mb-2">
                    รอบบิล
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.billing_cycle}
                    onChange={(e) => setFormData({ ...formData, billing_cycle: e.target.value })}
                    className="w-full px-4 py-3 bg-secondary/40 border border-border rounded-2xl text-sm font-bold text-foreground outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <PremiumDatePicker
                    label="กำหนดชำระ"
                    date={formData.due_date}
                    onChange={(d) => setFormData({ ...formData, due_date: d })}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="flex-1 py-3.5 bg-white/5 hover:bg-white/10 text-slate-300 font-bold rounded-2xl transition-colors text-xs"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl transition-all shadow-xl shadow-primary/30 text-xs disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'กำลังออกบิล...' : 'ยืนยันการออกบิล'}
                </button>
              </div>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
