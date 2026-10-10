'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import PremiumDatePicker from '@/app/components/PremiumDatePicker';
import PrintableContractModal from '@/components/PrintableContractModal';
import DepositRefundModal from '@/components/DepositRefundModal';
import { PdpaOcrConsentModal } from '@/app/components/PdpaOcrConsentModal';
import { ThaIdDigitalIdButton } from '@/components/features/ThaIdDigitalIdModal';

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
  slip_url?: string | null;
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
  const [activeTab, setActiveTab] = useState<'Active' | 'Renewal' | 'History' | 'MoveOut'>('Active');
  const [rejectingContract, setRejectingContract] = useState<Contract | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Printable Contract Modal
  const [printingContract, setPrintingContract] = useState<Contract | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Deposit Refund Modal
  const [selectedMoveOut, setSelectedMoveOut] = useState<any | null>(null);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // Upload Signed Paper Contract Modal State
  const [uploadingContract, setUploadingContract] = useState<Contract | null>(null);
  const [signedContractFile, setSignedContractFile] = useState<string | null>(null);
  const [isUploadingSigned, setIsUploadingSigned] = useState(false);

  // ID Card OCR state
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [isPdpaModalOpen, setIsPdpaModalOpen] = useState(false);
  const [pendingOcrData, setPendingOcrData] = useState<{ base64: string; fileName: string } | null>(null);

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

  const processOcrImage = async (base64Data: string, fileName: string) => {
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
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
          id_card_number: '',
          tenant_address: d.address || prev.tenant_address,
          id_card_image: '',
          tenant_email: prev.tenant_email || '',
          tenant_phone: prev.tenant_phone || '',
        }));
        setOcrSuccessMsg(`✓ อ่านชื่อและที่อยู่จากบัตรสำเร็จ: ${d.full_name_th} (ไม่เก็บเลขบัตร 13 หลักตามหลัก PDPA)`);
      } else {
        alert(ocrJson.message || 'ไม่สามารถอ่านข้อมูลบัตรได้ กรุณากรอกด้วยตนเอง');
      }
    } catch (err) {
      console.error('OCR Error:', err);
      alert('เกิดข้อผิดพลาดในการอ่านบัตรประชาชน');
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // ID Card Image Upload & OCR
  const handleIdCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrSuccessMsg(null);

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      setPendingOcrData({ base64: base64Data, fileName: file.name });
      setIsPdpaModalOpen(true);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
        id_card_number: '',
        tenant_address: '99/50 หมู่ 3 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900',
        room_id: firstRoom ? firstRoom.id.toString() : '1',
        deposit_amount: firstRoom ? firstRoom.price * 2 : 7600,
        contract_file_name: '',
        contract_file_url: '',
        id_card_image: ''
      }));
      setIsOcrProcessing(false);
      setOcrSuccessMsg('✓ อ่านชื่อและที่อยู่ตัวอย่างสำเร็จ (นายสมชาย ใจดี • ไม่เก็บเลขบัตร 13 หลักตาม PDPA)');
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

  const handleRejectRenewalSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingContract) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/contracts/reject-renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: rejectingContract.id,
          reject_reason: rejectReason,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('✓ ปฏิเสธคำขอต่อสัญญาเช่าเรียบร้อยแล้ว');
        setRejectingContract(null);
        setRejectReason('');
        if (ownerDormId) fetchData(ownerDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการปฏิเสธคำขอ');
      }
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenUploadSignedModal = (c: Contract) => {
    setUploadingContract(c);
    setSignedContractFile(c.contract_file_url || null);
  };

  const handleSignedFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      setSignedContractFile(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSignedContract = async () => {
    if (!uploadingContract || !signedContractFile) {
      alert('กรุณาเลือกหรือถ่ายภาพสัญญาเช่าที่ลงนามแล้ว');
      return;
    }
    setIsUploadingSigned(true);
    try {
      const res = await fetch('/api/owner/contracts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contractId: uploadingContract.id,
          contract_file_url: signedContractFile,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 บันทึกรูปภาพสัญญาเช่าฉบับลงนามจริงเรียบร้อยแล้ว!');
        setUploadingContract(null);
        setSignedContractFile(null);
        if (ownerDormId) fetchData(ownerDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการบันทึก');
      }
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setIsUploadingSigned(false);
    }
  };

  const activeContracts = contracts.filter(c => c.status === 'Active');
  const historyContracts = contracts.filter(c => c.status !== 'Active');
  const renewalRequestedContracts = activeContracts.filter(c => c.renewal_requested === 1);
  const renewalRequestedCount = renewalRequestedContracts.length;
  const pendingMoveOutCount = moveOutRequests.filter(m => m.status === 'Pending').length;

  const displayedContracts = 
    activeTab === 'Renewal' ? renewalRequestedContracts :
    activeTab === 'Active' ? activeContracts :
    historyContracts;

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/40 p-8 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="w-1.5 h-8 bg-primary rounded-full" />
              <h1 className="text-3xl font-black text-foreground tracking-tight">
                สัญญาเช่า & คืนค่ามัดจำห้องพัก
              </h1>
            </div>
            <p className="text-muted-foreground text-sm font-medium ml-4 mt-1">
              ตรวจสอบสัญญาเช่า จัดการคำขอต่อสัญญา พิมพ์สัญญา A4 และคืนค่ามัดจำด้วย Dynamic PromptPay QR
            </p>
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
            onClick={() => setActiveTab('Renewal')}
            className={`p-6 rounded-3xl cursor-pointer transition-all border ${
              activeTab === 'Renewal'
                ? 'bg-blue-500/20 border-blue-500/60 shadow-lg shadow-blue-950/30'
                : renewalRequestedCount > 0 
                  ? 'bg-blue-500/15 border-blue-500/50 animate-pulse' 
                  : 'bg-card border-border hover:border-white/20'
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="text-xs font-black text-blue-400 uppercase tracking-widest">คำขอต่อสัญญา</h3>
              <span className="text-xl">🔄</span>
            </div>
            <p className="text-4xl font-black text-blue-400">{renewalRequestedCount} <span className="text-xs text-blue-300/60 font-medium">รออนุมัติ</span></p>
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
              <h3 className="text-xs font-black text-amber-400 uppercase tracking-widest">คำร้องย้ายออก & คืนค่ามัดจำ</h3>
              <span className="text-xl">💰</span>
            </div>
            <p className="text-4xl font-black text-amber-400">{pendingMoveOutCount} <span className="text-xs text-amber-300/60 font-medium">รอคืนเงิน</span></p>
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
            onClick={() => setActiveTab('Renewal')}
            className={`pb-4 font-black text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'Renewal' 
                ? 'border-blue-500 text-blue-400' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>🔄 คำขอต่อสัญญา ({renewalRequestedCount})</span>
            {renewalRequestedCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] bg-blue-500 text-slate-950 font-black animate-pulse">
                {renewalRequestedCount}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('MoveOut')}
            className={`pb-4 font-black text-sm transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-2 ${
              activeTab === 'MoveOut' 
                ? 'border-amber-500 text-amber-400' 
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <span>💰 คำขอย้ายออก & คืนค่ามัดจำ ({moveOutRequests.length})</span>
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
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ที่อยู่ตามสัญญาเช่า</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ระยะเวลาสัญญา</th>
                    <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ค่ามัดจำ</th>
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
                  ) : displayedContracts.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-20 text-center text-muted-foreground font-bold">
                        {activeTab === 'Renewal' ? '🎉 ไม่มีคำขอต่อสัญญาเช่าที่รออนุมัติ' : 'ไม่พบรายการสัญญาในหมวดหมู่นี้'}
                      </td>
                    </tr>
                  ) : (
                    displayedContracts.map((c) => (
                      <tr key={c.id} className="hover:bg-white/5 transition-colors">
                        <td className="px-8 py-6">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-primary/20 text-primary font-black rounded-xl flex items-center justify-center text-sm border border-primary/30">
                              {c.room_number}
                            </div>
                            <div>
                              <p className="font-black text-foreground">{c.tenant_name}</p>
                              <p className="text-xs text-muted-foreground">{c.tenant_phone || c.tenant_email || '-'}</p>
                              {c.renewal_requested === 1 && (
                                <div className="mt-1 px-2.5 py-1 bg-blue-500/15 border border-blue-500/30 rounded-lg text-[11px] text-blue-300 font-medium">
                                  🔔 <strong>ขอต่อสัญญา:</strong> {c.renewal_note || 'ขอต่อสัญญาเช่า'}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>

                        <td className="px-8 py-6 text-xs max-w-xs">
                          {c.tenant_address ? (
                            <p className="text-white/80 line-clamp-2" title={c.tenant_address}>
                              {c.tenant_address}
                            </p>
                          ) : (
                            <span className="text-muted-foreground/60 italic">ไม่ระบุที่อยู่</span>
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

                        <td className="px-8 py-6">
                          <span className="font-bold text-emerald-400 block">
                            ฿{Number(c.deposit_amount || 0).toLocaleString()}
                          </span>
                          {c.slip_url ? (
                            <button
                              onClick={() => {
                                setPreviewingFileUrl(c.slip_url || null);
                                setPreviewingTitle(`สลิปเงินมัดจำ/จอง ห้อง ${c.room_number} (${c.tenant_name})`);
                              }}
                              className="mt-1 px-2.5 py-0.5 bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all cursor-pointer"
                              title="คลิกเพื่อดูสลิปเงินมัดจำ/จอง"
                            >
                              <span>📸</span> ดูสลิป
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground/60 italic block mt-0.5">ไม่มีสลิป</span>
                          )}
                        </td>

                        <td className="px-8 py-6">
                          <span className={`px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg border inline-block ${
                            c.renewal_requested === 1 ? 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse' :
                            c.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                            c.status === 'Renewed' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                            'bg-slate-500/10 text-slate-400 border-slate-500/20'
                          }`}>
                            {c.renewal_requested === 1 ? '🔄 ขอต่อสัญญา' : (c.status === 'Active' ? 'Active' : c.status === 'Renewed' ? 'ต่ออายุแล้ว' : c.status)}
                          </span>
                        </td>

                        <td className="px-8 py-6 text-center">
                          <div className="flex flex-wrap items-center justify-center gap-2">
                            {/* Renew / Approve / Reject Contract Buttons */}
                            {c.status === 'Active' && (
                              <>
                                <button
                                  onClick={() => handleOpenRenewModal(c)}
                                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95 ${
                                    c.renewal_requested === 1
                                      ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black shadow-lg shadow-emerald-500/20'
                                      : 'bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30'
                                  }`}
                                  title={c.renewal_requested === 1 ? 'อนุมัติต่อสัญญาเช่า' : 'ต่ออายุสัญญาเช่าฉบับใหม่'}
                                >
                                  <span>{c.renewal_requested === 1 ? '✓ อนุมัติต่อสัญญา' : '🔄 ต่อสัญญา'}</span>
                                </button>

                                {c.renewal_requested === 1 && (
                                  <button
                                    onClick={() => {
                                      setRejectingContract(c);
                                      setRejectReason('');
                                    }}
                                    className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                                    title="ปฏิเสธคำขอต่อสัญญาเช่า"
                                  >
                                    <span>✕ ปฏิเสธ</span>
                                  </button>
                                )}
                              </>
                            )}

                            {/* Print / Download Contract Button */}
                            <button
                              onClick={() => {
                                setPrintingContract(c);
                                setIsPrintModalOpen(true);
                              }}
                              className="px-3 py-1.5 bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                              title="พิมพ์สัญญาเช่าฉบับเต็ม / ดาวน์โหลด Word หรือ PDF"
                            >
                              <span>🖨️</span>
                              <span>พิมพ์ / PDF</span>
                            </button>

                            {/* View or Upload Signed Paper Contract */}
                            {c.contract_file_url ? (
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => {
                                    setPreviewingFileUrl(c.contract_file_url || null);
                                    setPreviewingTitle(`สัญญาเช่าฉบับลงนามจริง ห้อง ${c.room_number} (${c.tenant_name})`);
                                  }}
                                  className="px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                                  title="ดูรูปภาพสัญญาที่ทั้งสองฝ่ายลงชื่อแล้ว"
                                >
                                  <span>✓</span>
                                  <span>ดูสัญญาที่เซ็น</span>
                                </button>
                                <button
                                  onClick={() => handleOpenUploadSignedModal(c)}
                                  className="p-1.5 bg-white/10 hover:bg-white/20 text-muted-foreground hover:text-white rounded-lg text-xs transition-colors cursor-pointer"
                                  title="เปลี่ยนรูปสัญญาที่เซ็นแล้ว"
                                >
                                  📷
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleOpenUploadSignedModal(c)}
                                className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:scale-105 active:scale-95"
                                title="ถ่ายรูปสัญญาที่ทั้งสองฝ่ายลงชื่อแล้วบันทึกเข้าระบบ"
                              >
                                <span>📷</span>
                                <span>แนบรูปสัญญาที่เซ็น</span>
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
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ห้อง / ผู้เช่า</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">วันที่แจ้งย้ายออก</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">การตรวจสอบสัญญา</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">บิลค้างชำระ</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ยอดเงินประกันสุทธิที่ต้องคืน</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest text-center">สถานะ</th>
                      <th className="px-6 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest text-center">การดำเนินการ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-sm font-medium">
                    {moveOutRequests.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-20 text-center text-muted-foreground font-bold">
                          ยังไม่มีคำร้องขอย้ายออกในขณะนี้
                        </td>
                      </tr>
                    ) : (
                      moveOutRequests.map((m) => (
                        <tr key={m.id} className="hover:bg-white/5 transition-colors">
                          <td className="px-6 py-6">
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

                          <td className="px-6 py-6 font-bold text-foreground">
                            {new Date(m.desired_date).toLocaleDateString('th-TH')}
                          </td>

                          <td className="px-6 py-6">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                              m.is_completed_calculated || m.is_contract_completed
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                            }`}>
                              {m.is_completed_calculated || m.is_contract_completed ? '✓ ครบกำหนด 1 ปี' : '⚠️ ย้ายออกก่อนครบสัญญา'}
                            </span>
                          </td>

                          <td className="px-6 py-6">
                            {m.live_unpaid_total > 0 ? (
                              <span className="font-mono font-bold text-rose-400">
                                ฿{Number(m.live_unpaid_total).toLocaleString()}
                              </span>
                            ) : (
                              <span className="text-xs text-emerald-400 font-semibold">✓ ไม่มีบิลค้าง</span>
                            )}
                          </td>

                          <td className="px-6 py-6 font-mono font-black text-emerald-400 text-lg">
                            ฿{Number(m.live_net_refund !== undefined ? m.live_net_refund : m.net_refund_amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>

                          <td className="px-6 py-6 text-center">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold inline-flex items-center gap-1.5 ${
                              m.status === 'Completed'
                                ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                : 'bg-amber-500/15 text-amber-400 border border-amber-500/30 animate-pulse'
                            }`}>
                              {m.status === 'Completed' ? '✓ เคลียร์เงินแล้ว' : '⏳ รอเคลียร์เงิน'}
                            </span>
                          </td>

                          <td className="px-6 py-6 text-center">
                            <button
                              onClick={() => {
                                setSelectedMoveOut(m);
                                setIsRefundModalOpen(true);
                              }}
                              className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 mx-auto cursor-pointer hover:scale-105 active:scale-95 ${
                                m.status === 'Completed'
                                  ? 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                                  : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black'
                              }`}
                            >
                              <span>{m.status === 'Completed' ? '🔍' : '💰'}</span>
                              <span>{m.status === 'Completed' ? 'ดูรายละเอียด / สลิป' : 'สแกน QR คืนเงินประกัน'}</span>
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

                {/* Digital ID (D.DOPA ThaID OAuth 2.0) Plug-in */}
                <ThaIdDigitalIdButton
                  onVerified={(d) => {
                    setFormData((prev) => ({
                      ...prev,
                      tenant_name: d.full_name_th || prev.tenant_name,
                      id_card_number: '',
                      tenant_address: d.address || prev.tenant_address,
                    }));
                    setOcrSuccessMsg(`✓ ยืนยันตัวตนผ่านแอป ThaID สำเร็จ: ${d.full_name_th} (${d.ial_level} • ${d.sub_pid_hash})`);
                  }}
                />

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
                          ถ่ายรูปหรือแนบไฟล์รูปบัตรประชาชน ระบบจะกรอกชื่อ-นามสกุลและที่อยู่อัตโนมัติ (ไม่เก็บเลขบัตร 13 หลักตามหลัก PDPA)
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

                  {/* Name */}
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
                        ค่ามัดจำ (Deposit)
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
                  {renewingContract.renewal_requested === 1 && (
                    <p className="text-blue-300 mt-1 pt-1 border-t border-amber-500/20">
                      🔔 <strong>คำขอจากผู้เช่า:</strong> {renewingContract.renewal_note || 'ขอต่อสัญญาเช่า'}
                    </p>
                  )}
                </div>

                <PremiumDatePicker
                  label="กำหนดวันสิ้นสุดสัญญาฉบับต่ออายุใหม่"
                  date={renewData.new_end_date}
                  onChange={(d) => setRenewData({ ...renewData, new_end_date: d })}
                />

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">ค่ามัดจำใหม่ (ถ้ามี)</label>
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
                    className="flex-[2] py-4 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'กำลังบันทึกต่ออายุ...' : '✓ อนุมัติและบันทึกต่ออายุสัญญา →'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal 2.1: Contract Renewal Rejection Modal */}
        {rejectingContract && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6 overflow-y-auto">
            <div className="bg-card rounded-[36px] w-full max-w-lg border border-border shadow-2xl overflow-hidden">
              <div className="bg-[#0B0F19] border-b border-border p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-rose-400">✕ ปฏิเสธคำขอต่อสัญญาเช่า</h2>
                  <p className="text-xs text-muted-foreground font-medium mt-0.5">ห้อง {rejectingContract.room_number} - {rejectingContract.tenant_name}</p>
                </div>
                <button 
                  onClick={() => setRejectingContract(null)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <form onSubmit={handleRejectRenewalSubmit} className="p-6 space-y-6">
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-300 text-xs space-y-1">
                  <p className="font-bold">สัญญาห้อง {rejectingContract.room_number} (สิ้นสุด {new Date(rejectingContract.end_date).toLocaleDateString('th-TH')})</p>
                  <p className="text-white/80">🔔 <strong>คำขอเดิม:</strong> {rejectingContract.renewal_note || 'ขอต่อสัญญาเช่า'}</p>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-foreground/50 uppercase tracking-widest">
                    ระบุเหตุผลในการปฏิเสธ (จะส่งแจ้งเตือนไปยังลูกหอ)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="เช่น ทางหอพักมีแผนปรับปรุงห้องพักหลังหมดสัญญา..."
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    className="w-full px-5 py-4 bg-background border border-border rounded-2xl text-foreground text-sm outline-none focus:border-rose-500 transition-all custom-scrollbar"
                  />
                </div>

                <div className="flex gap-4 pt-2">
                  <button
                    type="button"
                    onClick={() => setRejectingContract(null)}
                    className="flex-1 py-4 text-muted-foreground font-bold hover:bg-white/5 rounded-2xl transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] py-4 bg-rose-600 hover:bg-rose-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'ยืนยันปฏิเสธคำขอ →'}
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

        {/* Upload Signed Paper Contract Modal */}
        {uploadingContract && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-card rounded-[36px] w-full max-w-xl border border-border shadow-2xl overflow-hidden my-auto">
              <div className="bg-[#0B0F19] border-b border-border p-6 flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-black text-foreground flex items-center gap-2">
                    <span>📷</span> บันทึกรูปสัญญาเช่าฉบับลงนามจริง
                  </h2>
                  <p className="text-xs text-muted-foreground font-medium mt-1">
                    ห้อง {uploadingContract.room_number} • ผู้เช่า: {uploadingContract.tenant_name}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setUploadingContract(null);
                    setSignedContractFile(null);
                  }}
                  className="w-9 h-9 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div className="p-4 bg-purple-500/10 border border-purple-500/20 rounded-2xl text-purple-300 text-xs leading-relaxed space-y-1">
                  <p className="font-bold">📝 ขั้นตอนบันทึกสัญญาฉบับจริง:</p>
                  <p>1. พิมพ์สัญญาเช่าฉบับสมบูรณ์ (A4) หรือดาวน์โหลด Word จากระบบ</p>
                  <p>2. ผู้เช่าและเจ้าของหอพักลงลายมือชื่อจริงร่วมกันในวันเข้าหอพัก</p>
                  <p>3. ถ่ายรูปหรือสแกนหน้าที่เซ็นชื่อแล้ว อัปโหลดบันทึกลงในระบบเพื่อเป็นหลักฐานอ้างอิงถาวร</p>
                </div>

                {/* File Upload / Camera Input */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    รูปภาพสัญญาเช่าที่ลงนามแล้ว (Photo / Scan) <span className="text-rose-500">*</span>
                  </label>

                  {signedContractFile ? (
                    <div className="space-y-3">
                      <div className="relative rounded-2xl overflow-hidden border border-border bg-black/40 flex items-center justify-center max-h-72">
                        <img
                          src={signedContractFile}
                          alt="Signed Contract Preview"
                          className="max-w-full max-h-72 object-contain p-2"
                        />
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-bold text-emerald-400">✓ เลือกรูปภาพเรียบร้อยแล้ว</span>
                        <label className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold cursor-pointer transition-all">
                          เปลี่ยนรูป
                          <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleSignedFileChange} />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-8 bg-secondary/60 hover:bg-secondary border-2 border-dashed border-primary/40 rounded-2xl cursor-pointer transition-all hover:border-primary group">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl mb-2 group-hover:scale-110 transition-transform">
                        📷
                      </div>
                      <span className="text-sm font-bold text-foreground">คลิกเพื่อถ่ายภาพ หรือเลือกรูปสัญญาที่เซ็นแล้ว</span>
                      <span className="text-[11px] text-muted-foreground mt-1">รองรับกล้องมือถือ, ไฟล์ JPG, PNG (ไม่เกิน 10MB)</span>
                      <input type="file" accept="image/*,application/pdf" className="hidden" onChange={handleSignedFileChange} />
                    </label>
                  )}
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => {
                      setUploadingContract(null);
                      setSignedContractFile(null);
                    }}
                    className="flex-1 py-3.5 text-muted-foreground font-bold hover:bg-white/5 rounded-2xl transition-all cursor-pointer text-xs"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveSignedContract}
                    disabled={!signedContractFile || isUploadingSigned}
                    className="flex-[2] py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer text-xs flex items-center justify-center gap-2"
                  >
                    {isUploadingSigned ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        <span>กำลังบันทึก...</span>
                      </>
                    ) : (
                      <>
                        <span>💾</span>
                        <span>บันทึกรูปสัญญาเข้าระบบ</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview Signed Contract Modal */}
        {previewingFileUrl && (
          <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-card rounded-3xl w-full max-w-3xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto">
              <div className="bg-[#0B0F19] border-b border-border p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📄</span>
                  <h3 className="text-sm font-black text-foreground">{previewingTitle || 'รูปภาพสัญญาเช่าฉบับลงนามจริง'}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <a
                    href={previewingFileUrl}
                    download="signed-contract"
                    target="_blank"
                    rel="noreferrer"
                    className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-xl text-xs font-bold transition-all"
                  >
                    ดาวน์โหลด
                  </a>
                  <button
                    onClick={() => setPreviewingFileUrl(null)}
                    className="w-8 h-8 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-foreground flex items-center justify-center transition-all cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="p-4 overflow-y-auto flex items-center justify-center bg-black/50 flex-1 min-h-[500px]">
                {previewingFileUrl.toLowerCase().endsWith('.pdf') || previewingFileUrl.startsWith('data:application/pdf') ? (
                  <iframe
                    src={previewingFileUrl}
                    title="PDF Contract Preview"
                    className="w-full h-[75vh] rounded-xl border border-white/10 shadow-lg bg-white"
                  />
                ) : (
                  <img
                    src={previewingFileUrl}
                    alt="Signed Contract"
                    className="max-w-full max-h-[75vh] object-contain rounded-xl shadow-lg"
                  />
                )}
              </div>
            </div>
          </div>
        )}

        {/* PDPA OCR Consent Modal */}
        <PdpaOcrConsentModal
          isOpen={isPdpaModalOpen}
          title="หนังสือยินยอมการเก็บและประมวลผลบัตรประชาชน (PDPA)"
          actionText="ยินยอมและอ่านข้อมูลบัตรด้วย AI"
          onClose={() => {
            setIsPdpaModalOpen(false);
            setPendingOcrData(null);
          }}
          onConsent={() => {
            setIsPdpaModalOpen(false);
            if (pendingOcrData) {
              processOcrImage(pendingOcrData.base64, pendingOcrData.fileName);
              setPendingOcrData(null);
            }
          }}
        />

      </div>
    </div>
  );
}
