'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import PremiumDatePicker from '@/app/components/PremiumDatePicker';
import PrintableContractModal from '@/components/PrintableContractModal';
import DepositRefundModal from '@/components/DepositRefundModal';

interface Contract {
  id: number;
  tenant_name: string;
  tenant_email?: string;
  tenant_phone?: string;
  room_number: string;
  room_type?: string;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  monthly_rent?: number;
  status: string;
  contract_file_url?: string | null;
  renewal_requested?: number;
  renewal_note?: string | null;
  parent_contract_id?: number | null;
  created_at: string;
  id_card_number?: string;
  tenant_address?: string;
  id_card_image?: string;
}

interface Room {
  id: number;
  room_number: string;
  price: number;
  status: string;
}

export default function OwnerContractsPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [moveOutRequests, setMoveOutRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerDormId, setOwnerDormId] = useState<number | null>(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [renewingContract, setRenewingContract] = useState<Contract | null>(null);
  const [previewingFileUrl, setPreviewingFileUrl] = useState<string | null>(null);
  const [previewingTitle, setPreviewingTitle] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'Active' | 'History' | 'MoveOut'>('Active');
  const [submitting, setSubmitting] = useState(false);

  // Printable Contract Modal
  const [printingContract, setPrintingContract] = useState<Contract | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Deposit Refund Modal
  const [selectedMoveOut, setSelectedMoveOut] = useState<any | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // ID Card OCR state
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);

  // New Contract Form State
  const [formData, setFormData] = useState({
    tenant_name: '',
    tenant_email: '',
    tenant_phone: '',
    id_card_number: '',
    tenant_address: '',
    id_card_image: '',
    room_id: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    deposit_amount: 0,
    contract_file_url: '',
    contract_file_name: '',
  });

  // Renewal Form State
  const [renewData, setRenewData] = useState({
    new_end_date: '',
    deposit_amount: 0,
    contract_file_url: '',
    contract_file_name: '',
  });

  const fetchData = async (dormId: number) => {
    setLoading(true);
    try {
      const [contractsRes, roomsRes, moveOutRes] = await Promise.all([
        fetch(`/api/owner/contracts?dormId=${dormId}`),
        fetch(`/api/rooms?dormId=${dormId}`),
        fetch(`/api/owner/move-out?dormId=${dormId}`)
      ]);

      const contractsJson = await contractsRes.json();
      const roomsJson = await roomsRes.json();
      const moveOutJson = await moveOutRes.json();

      if (contractsJson.success) setContracts(contractsJson.data);
      if (roomsJson.success) setRooms(roomsJson.data.filter((r: Room) => r.status === 'Available'));
      if (moveOutJson.success) setMoveOutRequests(moveOutJson.data || []);
    } catch (err) {
      console.error('Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin');
      return;
    }

    if (authStatus === 'authenticated' && session?.user?.email) {
      fetch(`/api/owner/onboarding?email=${session.user.email}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.hasDorm) {
            setOwnerDormId(data.dorm.id);
            fetchData(data.dorm.id);
          } else {
            setLoading(false);
          }
        });
    }
  }, [authStatus, session, router]);

  useEffect(() => {
    if (formData.room_id) {
      const selectedRoom = rooms.find(r => r.id === parseInt(formData.room_id));
      if (selectedRoom) {
        setFormData(prev => ({
          ...prev,
          deposit_amount: selectedRoom.price * 2
        }));
      }
    }
  }, [formData.room_id, rooms]);

  // ID Card Image Upload & OCR
  const handleIdCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      try {
        const res = await fetch('/api/owner/contracts/ocr-id', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Data })
        });
        const ocrJson = await res.json();

        if (ocrJson.success && ocrJson.data) {
          const d = ocrJson.data;
          setFormData(prev => ({
            ...prev,
            tenant_name: d.full_name_th || prev.tenant_name,
            id_card_number: d.id_card_number || prev.id_card_number,
            tenant_address: d.address || prev.tenant_address,
            id_card_image: base64Data,
            contract_file_url: prev.contract_file_url || base64Data,
            contract_file_name: prev.contract_file_name || `บัตรประชาชน_${file.name}`,
            tenant_email: prev.tenant_email || 'tenant@kesorn.com',
            tenant_phone: prev.tenant_phone || '082-985-3519',
          }));
          setOcrSuccessMsg(`✓ อ่านบัตรประชาชนสำเร็จ: ${d.full_name_th} (${d.id_card_number})`);
        } else {
          alert('ไม่สามารถอ่านข้อมูลจากบัตรได้ กรุณากรอกข้อมูลเพิ่มเติม');
        }
      } catch (err) {
        console.error('OCR Error:', err);
        alert('เกิดข้อผิดพลาดในการอ่านบัตรประชาชน');
      } finally {
        setIsOcrProcessing(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Smart Demo ID Card Quick Scan
  const handleDemoIdCard = () => {
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
    setTimeout(() => {
      const firstRoom = rooms[0];
      setFormData(prev => ({
        ...prev,
        tenant_name: 'นายสมชาย ใจดี',
        tenant_email: 'tenant@kesorn.com',
        tenant_phone: '089-123-4567',
        id_card_number: '1-1002-01384-95-2',
        tenant_address: '99/50 หมู่ 3 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',
        room_id: firstRoom ? firstRoom.id.toString() : '1',
        deposit_amount: firstRoom ? firstRoom.price * 2 : 7600,
        contract_file_name: 'บัตรประชาชนตัวอย่าง_สมชาย_ใจดี.jpg',
        contract_file_url: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&q=80',
        id_card_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&q=80'
      }));
      setIsOcrProcessing(false);
      setOcrSuccessMsg('✓ อ่านข้อมูลบัตรประชาชนตัวอย่างสำเร็จ (นายสมชาย ใจดี, 1-1002-01384-95-2)');
    }, 400);
  };

  // File Upload Handlers for Contract File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, isRenewal = false) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const resultStr = reader.result as string;
      if (isRenewal) {
        setRenewData(prev => ({
          ...prev,
          contract_file_url: resultStr,
          contract_file_name: file.name
        }));
      } else {
        setFormData(prev => ({
          ...prev,
          contract_file_url: resultStr,
          contract_file_name: file.name
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  // Create Contract Submission
  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.room_id || !formData.tenant_name || !formData.tenant_email) {
      alert('กรุณากรอกข้อมูลสำคัญให้ครบถ้วน');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          contract_file_url: formData.contract_file_url || formData.id_card_image || 'CONTRACT_DOCUMENT',
          dormId: ownerDormId
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 บันทึกสัญญาเช่าและปรับสถานะผู้เช่าสำเร็จเรียบร้อยแล้ว! สามารถกดพิมพ์เอกสารสัญญาเช่า (PDF) ได้ทันที');
        setIsCreateModalOpen(false);
        setFormData({
          tenant_name: '',
          tenant_email: '',
          tenant_phone: '',
          id_card_number: '',
          tenant_address: '',
          id_card_image: '',
          room_id: '',
          start_date: new Date().toISOString().split('T')[0],
          end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
          deposit_amount: 0,
          contract_file_url: '',
          contract_file_name: '',
        });
        setOcrSuccessMsg(null);
        if (ownerDormId) fetchData(ownerDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการบันทึกสัญญา');
      }
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Renewal Submission
  const handleOpenRenewModal = (c: Contract) => {
    setRenewingContract(c);
    const defaultNewEnd = c.end_date 
      ? new Date(new Date(c.end_date).setFullYear(new Date(c.end_date).getFullYear() + 1)).toISOString().split('T')[0]
      : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0];

    setRenewData({
      new_end_date: defaultNewEnd,
      deposit_amount: c.deposit_amount || 0,
      contract_file_url: '',
      contract_file_name: '',
    });
  };

  const handleRenewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!renewingContract) return;

    if (!renewData.new_end_date) {
      alert('กรุณาระบุวันสิ้นสุดสัญญาฉบับใหม่');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/contracts/renew', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: renewingContract.id,
          new_end_date: renewData.new_end_date,
          deposit_amount: renewData.deposit_amount,
          contract_file_url: renewData.contract_file_url || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ต่ออายุสัญญาเช่าเรียบร้อยแล้ว!');
        setRenewingContract(null);
        if (ownerDormId) fetchData(ownerDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการต่ออายุสัญญา');
      }
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const activeContracts = contracts.filter(c => c.status === 'Active');
  const historyContracts = contracts.filter(c => c.status !== 'Active');
  const renewalRequestedCount = activeContracts.filter(c => c.renewal_requested === 1).length;
  const pendingMoveOutCount = moveOutRequests.filter(m => m.status === 'Pending').length;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/40 p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-primary rounded-full" />
              <h1 className="text-3xl font-black text-foreground tracking-tight">
                สัญญาเช่า & คืนเงินประกันห้องพัก
              </h1>
            </div>
            <p className="text-muted-foreground text-sm font-medium ml-4 mt-1">
              ทำสัญญาเช่าอัตโนมัติด้วยการถ่ายรูปบัตรประชาชน (Smart OCR) พิมพ์สัญญา A4 และคืนเงินประกันด้วย Dynamic PromptPay QR
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => {
                handleDemoIdCard();
                setIsCreateModalOpen(true);
              }}
              className="px-6 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer text-sm"
            >
              <span>🪪</span>
              <span>ทำสัญญาจากบัตรประชาชน (Smart OCR)</span>
            </button>

            <button 
              onClick={() => setIsCreateModalOpen(true)}
              className="px-6 py-4 bg-primary text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all flex items-center gap-2.5 cursor-pointer text-sm"
            >
              <span>📝</span>
              <span>บันทึกสัญญาใหม่</span>
            </button>
          </div>
        </div>

        {/* Dashboard Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div 
            onClick={() => setActiveTab('Active')}
            className={`p-6 rounded-3xl cursor-pointer transition-all border ${
              activeTab === 'Active' 
                ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-950/20' 
                : 'bg-card border-border hover:border-white/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-black text-emerald-400 uppercase tracking-widest">สัญญาใช้งานอยู่ (Active)</h3>
              <span className="text-xl">🟢</span>
            </div>
            <p className="text-4xl font-black text-foreground">{activeContracts.length} <span className="text-xs text-muted-foreground font-medium">สัญญา</span></p>
          </div>

          <div 
            onClick={() => setActiveTab('MoveOut')}
            className={`p-6 rounded-3xl cursor-pointer transition-all border ${
              activeTab === 'MoveOut' 
                ? 'bg-amber-500/15 border-amber-500/50 shadow-lg shadow-amber-950/20' 
                : 'bg-card border-border hover:border-white/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">คำร้องย้ายออก & คืนเงินประกัน</h3>
              <span className="text-xl">💰</span>
            </div>
            <p className="text-4xl font-black text-amber-400">{pendingMoveOutCount} <span className="text-xs text-amber-300/60 font-medium">รอคืนเงิน</span></p>
          </div>

          <div 
            onClick={() => setActiveTab('Active')}
            className={`p-6 rounded-3xl cursor-pointer transition-all border ${
              renewalRequestedCount > 0 
                ? 'bg-blue-500/15 border-blue-500/50 animate-pulse' 
                : 'bg-card border-border'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest">คำขอต่อสัญญา</h3>
              <span className="text-xl">🔄</span>
            </div>
            <p className="text-4xl font-black text-blue-400">{renewalRequestedCount} <span className="text-xs text-blue-300/60 font-medium">รายการ</span></p>
          </div>

          <div 
            onClick={() => setActiveTab('History')}
            className={`p-6 rounded-3xl cursor-pointer transition-all border ${
              activeTab === 'History' 
                ? 'bg-purple-500/10 border-purple-500/40 shadow-lg shadow-purple-950/20' 
                : 'bg-card border-border hover:border-white/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-black text-purple-400 uppercase tracking-widest">ประวัติสัญญาย้อนหลัง</h3>
              <span className="text-xl">📜</span>
            </div>
            <p className="text-4xl font-black text-foreground">{historyContracts.length} <span className="text-xs text-muted-foreground font-medium">รายการ</span></p>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-border gap-8 overflow-x-auto">
          <button
            onClick={() => setActiveTab('Active')}
            className={`pb-4 font-black text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'Active' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            🟢 สัญญาปัจจุบัน ({activeContracts.length})
          </button>

          <button
            onClick={() => setActiveTab('MoveOut')}
            className={`pb-4 font-black text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'MoveOut' 
                ? 'border-amber-500 text-amber-400' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>💰 คำขอย้ายออก & คืนเงินประกัน ({moveOutRequests.length})</span>
            {pendingMoveOutCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500 text-slate-950 font-black animate-pulse">
                {pendingMoveOutCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('History')}
            className={`pb-4 font-black text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'History' 
                ? 'border-primary text-primary' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            📜 ประวัติสัญญาย้อนหลัง ({historyContracts.length})
          </button>
        </div>

        {/* TAB 1 & 2: Active and History Contracts Table */}
        {activeTab !== 'MoveOut' && (
          <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-secondary/60 border-b border-border">
                  <tr>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ห้อง / ลูกหอ</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">เลขประจำตัวประชาชน & ที่อยู่</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ระยะเวลาสัญญา</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">เงินประกัน</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">สถานะ</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest text-center">พิมพ์สัญญา / จัดการ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm font-medium">
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-muted-foreground font-bold animate-pulse">
                        กำลังโหลดข้อมูลสัญญาเช่า...
                      </td>
                    </tr>
                  ) : (activeTab === 'Active' ? activeContracts : historyContracts).length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-muted-foreground font-bold">
                        ไม่พบรายการสัญญาในหมวดหมู่นี้
                      </td>
                    </tr>
                  ) : (
                    (activeTab === 'Active' ? activeContracts : historyContracts).map((c) => (
                      <tr key={c.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 text-primary font-black rounded-xl flex items-center justify-center text-sm border border-primary/30">
                              {c.room_number}
                            </div>
                            <div>
                              <p className="font-black text-foreground">{c.tenant_name}</p>
                              <p className="text-xs text-muted-foreground">{c.tenant_phone || c.tenant_email || '-'}</p>
                            </div>
                          </div>
                        </td>

                        <td className="px-8 py-6 text-xs max-w-xs">
                          {c.id_card_number ? (
                            <div className="space-y-1">
                              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 inline-block">
                                🪪 {c.id_card_number}
                              </span>
                              <p className="text-white/60 truncate" title={c.tenant_address}>
                                {c.tenant_address || 'ที่อยู่ตามบัตรประชาชน'}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground/60 italic">ไม่ได้บันทึกเลขบัตร</span>
                          )}
                        </td>

                        <td className="px-8 py-6">
                          <p className="font-bold text-foreground">
                            {new Date(c.start_date).toLocaleDateString('th-TH')} - {new Date(c.end_date).toLocaleDateString('th-TH')}
                          </p>
                          {c.parent_contract_id && (
                            <span className="text-[10px] text-purple-400 font-bold uppercase tracking-wider block mt-0.5">
                              🔄 ต่ออายุมาจากสัญญา #{c.parent_contract_id}
                            </span>
                          )}
                        </td>

                        <td className="px-8 py-6 font-bold text-emerald-400">
                          ฿{Number(c.deposit_amount || 0).toLocaleString()}
                        </td>

                        <td className="px-8 py-6">
                          <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border inline-block ${
                            c.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            c.status === 'Renewed' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}>
                            {c.status}
                          </span>
                        </td>

                        <td className="px-8 py-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {/* Print / Download Contract Button */}
                            <button
                              onClick={() => {
                                setPrintingContract(c);
                                setIsPrintModalOpen(true);
                              }}
                              className="px-3.5 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                              title="พิมพ์สัญญาเช่าฉบับเต็ม / ดาวน์โหลด PDF"
                            >
                              <span>🖨️</span>
                              <span>พิมพ์สัญญา (PDF)</span>
                            </button>

                            {/* Renew Button if active */}
                            {c.status === 'Active' && (
                              <button
                                onClick={() => handleOpenRenewModal(c)}
                                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                              >
                                <span>🔄</span>
                                <span>ต่อสัญญา</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: Move-Out & Deposit Refund Management */}
        {activeTab === 'MoveOut' && (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/20 p-6 rounded-3xl flex items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-2xl">
                  ⚡
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    ระบบคำนวณและคืนเงินประกันอัตโนมัติ (Automated Deposit Refund)
                  </h3>
                  <p className="text-xs text-white/70 mt-1">
                    ระบบตรวจสอบอัตโนมัติ 2 ขั้นตอน: (1) ครบสัญญา 1 ปีหรือไม่ (2) มีค่าใช้จ่ายค้างชำระหรือไม่ พร้อมออก Dynamic QR Code ล็อคยอดเงินโอนคืนเป๊ะ
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-secondary/60 border-b border-border">
                    <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ห้อง / ผู้เช่า</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">วันที่แจ้งย้ายออก</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">การตรวจสอบสัญญา</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">บิลค้างชำระ</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ยอดเงินประกันสุทธิที่ต้องคืน</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest text-center">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {moveOutRequests.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="py-20 text-center text-muted-foreground font-bold">
                          ยังไม่มีคำร้องขอย้ายออกในขณะนี้
                        </td>
                      </tr>
                    ) : (
                      moveOutRequests.map((m) => (
                        <tr key={m.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-8 py-6">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-amber-500/20 text-amber-400 font-black rounded-xl flex items-center justify-center text-sm border border-amber-500/30">
                                {m.room_number}
                              </div>
                              <div>
                                <p className="font-black text-foreground">{m.tenant_name}</p>
                                <p className="text-xs text-muted-foreground">{m.tenant_phone || m.promptpay_target || '-'}</p>
                              </div>
                            </div>
                          </td>

                          <td className="px-8 py-6 font-bold text-foreground">
                            {new Date(m.desired_date).toLocaleDateString('th-TH')}
                          </td>

                          <td className="px-8 py-6">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                              m.is_completed_calculated || m.is_contract_completed
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {m.is_completed_calculated || m.is_contract_completed ? '✓ ครบกำหนด 1 ปี' : '⚠️ ย้ายออกก่อนครบสัญญา'}
                            </span>
                          </td>

                          <td className="px-8 py-6">
                            {m.live_unpaid_total > 0 ? (
                              <span className="font-mono font-bold text-rose-400">
                                ฿{Number(m.live_unpaid_total).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-400 font-semibold">✓ ไม่มีบิลค้าง</span>
                            )}
                          </td>

                          <td className="px-8 py-6 font-mono font-black text-emerald-400 text-lg">
                            ฿{Number(m.live_net_refund !== undefined ? m.live_net_refund : m.net_refund_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="px-8 py-6 text-center">
                            <button
                              onClick={() => {
                                setSelectedMoveOut(m);
                                setIsRefundModalOpen(true);
                              }}
                              className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 mx-auto cursor-pointer hover:scale-105 active:scale-95"
                            >
                              <span>💰</span>
                              <span>สแกน QR คืนเงินประกัน</span>
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Modal 1: Create Contract with Thai ID OCR */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 overflow-y-auto">
            <div className="bg-card rounded-[36px] w-full max-w-2xl border border-border shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
              <div className="bg-[#0B0F19] border-b border-border p-8 flex items-center justify-between shrink-0">
                <div>
                  <h2 className="text-2xl font-black text-foreground">📝 บันทึกสัญญาเช่าห้องพักใหม่</h2>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    ถ่ายรูปบัตรประชาชนเพื่ออ่านข้อมูลอัตโนมัติ หรือกรอกข้อมูลด้วยตนเอง
                  </p>
                </div>
                <button 
                  onClick={() => setIsCreateModalOpen(false)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="overflow-y-auto p-8 custom-scrollbar space-y-6">

                {/* ID Card Smart OCR Banner */}
                <div className="p-6 bg-gradient-to-br from-blue-950/40 to-indigo-950/40 rounded-3xl border border-blue-500/30 space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">🪪</span>
                      <div>
                        <h4 className="text-sm font-bold text-white">
                          สแกนอ่านข้อมูลจากบัตรประชาชน (Smart ID Card OCR)
                        </h4>
                        <p className="text-xs text-white/60">
                          ถ่ายรูปหรือแนบไฟล์รูปบัตรประชาชน ระบบจะกรอกชื่อ เลขบัตร 13 หลัก และที่อยู่อัตโนมัติ
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex-1 min-w-[200px] px-4 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-95">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      {isOcrProcessing ? 'กำลังอ่านบัตรด้วย AI...' : '📸 ถ่ายรูป / อัปโหลดบัตรประชาชน'}
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleIdCardUpload}
                        disabled={isOcrProcessing}
                        className="hidden"
                      />
                    </label>

                    <button
                      type="button"
                      onClick={handleDemoIdCard}
                      disabled={isOcrProcessing}
                      className="px-4 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold border border-white/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                    >
                      <span>⚡</span>
                      <span>บัตรตัวอย่าง (Quick Test)</span>
                    </button>
                  </div>

                  {ocrSuccessMsg && (
                    <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-xs text-emerald-300 font-bold flex items-center gap-2 animate-in fade-in">
                      <span>✓</span>
                      <span>{ocrSuccessMsg}</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleCreateSubmit} className="space-y-6">
                  {/* Select Room */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                      เลือกห้องพัก (เฉพาะห้องว่าง) <span className="text-rose-500">*</span>
                    </label>
                    <select
                      required
                      value={formData.room_id}
                      onChange={(e) => setFormData({ ...formData, room_id: e.target.value })}
                      className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all cursor-pointer"
                    >
                      <option value="" className="bg-card">-- เลือกห้องพัก --</option>
                      {rooms.map(r => (
                        <option key={r.id} value={r.id} className="bg-card">
                          ห้อง {r.room_number} (ราคา ฿{r.price.toLocaleString()}/เดือน)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Name and Citizen ID */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                        ชื่อ-นามสกุล ผู้เช่า <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="สมชาย ใจดี"
                        value={formData.tenant_name}
                        onChange={(e) => setFormData({ ...formData, tenant_name: e.target.value })}
                        className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                        เลขประจำตัวประชาชน (13 หลัก)
                      </label>
                      <input
                        type="text"
                        placeholder="1-1002-01384-95-2"
                        value={formData.id_card_number}
                        onChange={(e) => setFormData({ ...formData, id_card_number: e.target.value })}
                        className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-mono font-bold outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  {/* Address from ID Card */}
                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                      ที่อยู่ตามบัตรประชาชน
                    </label>
                    <textarea
                      rows={2}
                      placeholder="99/50 หมู่ 3 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพฯ 10900"
                      value={formData.tenant_address}
                      onChange={(e) => setFormData({ ...formData, tenant_address: e.target.value })}
                      className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-medium outline-none focus:border-primary transition-all text-sm resize-none"
                    ></textarea>
                  </div>

                  {/* Contact Info */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                        อีเมลผู้เช่า <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        placeholder="tenant@gmail.com"
                        value={formData.tenant_email}
                        onChange={(e) => setFormData({ ...formData, tenant_email: e.target.value })}
                        className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                        เบอร์โทรศัพท์ผู้เช่า
                      </label>
                      <input
                        type="text"
                        placeholder="089-123-4567"
                        value={formData.tenant_phone}
                        onChange={(e) => setFormData({ ...formData, tenant_phone: e.target.value })}
                        className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  {/* Dates & Deposit */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <PremiumDatePicker
                      label="วันเริ่มสัญญา"
                      date={formData.start_date}
                      onChange={(d) => setFormData({ ...formData, start_date: d })}
                    />
                    <PremiumDatePicker
                      label="วันสิ้นสุดสัญญา (1 ปี)"
                      date={formData.end_date}
                      onChange={(d) => setFormData({ ...formData, end_date: d })}
                    />
                    <div className="space-y-2">
                      <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                        เงินประกัน (Deposit)
                      </label>
                      <input
                        type="number"
                        required
                        value={formData.deposit_amount}
                        onChange={(e) => setFormData({ ...formData, deposit_amount: parseFloat(e.target.value) || 0 })}
                        className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all"
                      />
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="flex-1 py-4 text-muted-foreground font-bold hover:bg-white/5 rounded-2xl transition-all"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex-[2] py-4 bg-primary text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {submitting ? 'กำลังบันทึกสัญญา...' : '✓ บันทึกสัญญา & สร้างสิทธิ์ลูกหอ'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* Modal 2: Contract Renewal */}
        {renewingContract && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 overflow-y-auto">
            <div className="bg-card rounded-[36px] w-full max-w-xl border border-border shadow-2xl overflow-hidden">
              <div className="bg-[#0B0F19] border-b border-border p-8 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-black text-foreground">🔄 ต่ออายุสัญญาเช่า</h2>
                  <p className="text-xs text-muted-foreground font-medium mt-1">ห้อง {renewingContract.room_number} - {renewingContract.tenant_name}</p>
                </div>
                <button 
                  onClick={() => setRenewingContract(null)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRenewSubmit} className="p-8 space-y-6">
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs font-medium space-y-1">
                  <p className="font-bold">สัญญาเดิม: {new Date(renewingContract.start_date).toLocaleDateString('th-TH')} - {new Date(renewingContract.end_date).toLocaleDateString('th-TH')}</p>
                </div>

                <PremiumDatePicker
                  label="กำหนดวันสิ้นสุดสัญญาฉบับต่ออายุใหม่"
                  date={renewData.new_end_date}
                  onChange={(d) => setRenewData({ ...renewData, new_end_date: d })}
                />

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">เงินประกันใหม่ (ถ้ามี)</label>
                  <input
                    type="number"
                    value={renewData.deposit_amount}
                    onChange={(e) => setRenewData({ ...renewData, deposit_amount: parseFloat(e.target.value) || 0 })}
                    className="w-full px-6 py-4 bg-background border border-border rounded-2xl text-foreground font-bold outline-none focus:border-primary transition-all"
                  />
                </div>

                <div className="flex gap-4 pt-4">
                  <button
                    type="button"
                    onClick={() => setRenewingContract(null)}
                    className="flex-1 py-4 text-muted-foreground font-bold hover:bg-white/5 rounded-2xl transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'กำลังบันทึกต่ออายุ...' : 'บันทึกต่ออายุสัญญา →'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Printable Contract Modal */}
        <PrintableContractModal
          isOpen={isPrintModalOpen}
          onClose={() => setIsPrintModalOpen(false)}
          contract={printingContract}
        />

        {/* Deposit Refund Modal */}
        <DepositRefundModal
          isOpen={isRefundModalOpen}
          onClose={() => setIsRefundModalOpen(false)}
          request={selectedMoveOut}
          onConfirmSuccess={() => {
            if (ownerDormId) fetchData(ownerDormId);
          }}
        />

      </div>
    </div>
  );
}
