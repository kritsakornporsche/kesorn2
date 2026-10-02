'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import Image from 'next/image';

import PrintableContractModal from '@/components/PrintableContractModal';

interface ContractDetail {
  id: number;
  tenant_name: string;
  tenant_email: string;
  tenant_phone?: string;
  parent_phone?: string;
  id_card_number?: string;
  tenant_address?: string;
  id_card_image?: string;
  room_number: string;
  room_price: number;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  monthly_rent: number;
  status: string;
  slip_url: string | null;
  contract_file_url?: string | null;
  signature_data: string | null;
  owner_signature_data: string | null;
  created_at: string;
}

export default function OwnerContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const contractId = resolvedParams.id;
  const router = useRouter();

  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [approving, setApproving] = useState(false);
  const [previewSlip, setPreviewSlip] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [isUploadingSigned, setIsUploadingSigned] = useState(false);
  const [previewSignedDoc, setPreviewSignedDoc] = useState(false);

  const handleDownloadDocx = async () => {
    if (!contract) return;
    setDownloadingDocx(true);
    try {
      const res = await fetch('/api/contracts/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract }),
      });
      if (!res.ok) throw new Error('Export DOCX failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `สัญญาเช่า_หอพักเกษร_ห้อง${contract.room_number}_${(contract.tenant_name || '').replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์ Word');
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleUploadSignedContract = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 10MB');
      return;
    }
    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64Data = reader.result as string;
      setIsUploadingSigned(true);
      try {
        const res = await fetch('/api/owner/contracts', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contractId: contract?.id,
            contract_file_url: base64Data,
          }),
        });
        const data = await res.json();
        if (data.success) {
          alert('✓ บันทึกรูปภาพสัญญาเช่าฉบับลงนามจริงเรียบร้อยแล้ว!');
          setContract(prev => prev ? ({ ...prev, contract_file_url: base64Data }) : null);
        } else {
          alert(data.message || 'เกิดข้อผิดพลาดในการบันทึก');
        }
      } catch (err: any) {
        alert('เกิดข้อผิดพลาด: ' + err.message);
      } finally {
        setIsUploadingSigned(false);
      }
    };
    reader.readAsDataURL(file);
  };

  useEffect(() => {
    async function fetchContract() {
      try {
        const res = await fetch(`/api/owner/contracts/${contractId}`);
        const data = await res.json();
        
        if (data.success) {
          setContract(data.data);
        } else {
          setError(data.message || 'ไม่พบข้อมูลสัญญา');
        }
      } catch (err) {
        setError('เกิดข้อผิดพลาดในการโหลดข้อมูล');
      } finally {
        setLoading(false);
      }
    }
    fetchContract();
  }, [contractId]);

  const handleApprove = async () => {
    if (!confirm('คุณต้องการอนุมัติการจองและสัญญาเช่าฉบับนี้ใช่หรือไม่?')) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerSignatureData: 'APPROVED_DIGITALLY' })
      });
      const data = await res.json();
      if (data.success) {
        alert('อนุมัติสัญญาเช่าและผู้เช่าเรียบร้อยแล้ว!');
        router.refresh();
        window.location.reload();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการอนุมัติสัญญา');
      }
    } catch (e: any) {
      alert('เกิดข้อผิดพลาดในการอนุมัติสัญญา');
    } finally {
      setApproving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (error || !contract) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <div className="text-rose-500 font-bold text-lg">{error || 'ไม่พบข้อมูลสัญญา'}</div>
        <Link href="/owner/contracts" className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-bold inline-block">
          กลับไปหน้ารายการสัญญา
        </Link>
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-8 lg:p-10 max-w-5xl mx-auto space-y-8 font-sans pb-28 md:pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <Link href="/owner/contracts" className="text-xs font-bold text-white/50 hover:text-white flex items-center gap-1.5 mb-2 transition-colors">
            ← กลับไปหน้ารายการสัญญา
          </Link>
          <h1 className="text-3xl font-black text-white tracking-tight">รายละเอียดสัญญาเช่า #{contract.id}</h1>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleDownloadDocx}
            disabled={downloadingDocx}
            className="px-5 py-2.5 bg-blue-700 hover:bg-blue-600 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95 disabled:opacity-50"
            title="ดาวน์โหลดสัญญาเช่ารูปแบบ Microsoft Word (.docx)"
          >
            <span>📄</span>
            <span>{downloadingDocx ? 'กำลังสร้างไฟล์...' : 'โหลดไฟล์ Word (.docx)'}</span>
          </button>

          <button
            onClick={() => setIsPrintModalOpen(true)}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-all shadow-md flex items-center gap-2 cursor-pointer hover:scale-105 active:scale-95"
          >
            <span>🖨️</span>
            <span>พิมพ์สัญญาเช่า (PDF)</span>
          </button>

          <span className={cn(
            "px-4 py-1.5 rounded-full text-xs font-bold border flex items-center gap-1.5",
            contract.status === 'Active' ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" :
            contract.status === 'PendingOwnerSignature' ? "bg-amber-500/10 border-amber-500/20 text-amber-400" :
            "bg-slate-800 border-white/10 text-white/60"
          )}>
            <span className={cn(
              "w-2 h-2 rounded-full",
              contract.status === 'Active' ? "bg-emerald-400" :
              contract.status === 'PendingOwnerSignature' ? "bg-amber-400 animate-pulse" :
              "bg-slate-400"
            )} />
            {contract.status === 'Active' ? 'สัญญาใช้งานอยู่ (Active)' :
             contract.status === 'PendingOwnerSignature' ? 'รอเจ้าของหอตรวจ & อนุมัติ' : 
             contract.status}
          </span>

          {contract.status === 'PendingOwnerSignature' && (
            <button
              onClick={handleApprove}
              disabled={approving}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
            >
              {approving ? 'กำลังอนุมัติ...' : '✓ อนุมัติสัญญาเช่านี้'}
            </button>
          )}
        </div>
      </div>

      {/* Contract Detail Card */}
      <div className="bg-[#0F172A] border border-white/10 rounded-[3rem] p-8 sm:p-12 shadow-2xl space-y-8">
        
        {/* Info Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pb-8 border-b border-white/10">
          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">ข้อมูลผู้เช่า / ผู้จอง</h3>
            <div className="space-y-2">
              <p className="text-2xl font-bold text-white">คุณ {contract.tenant_name}</p>
              <p className="text-sm text-white/60 font-mono">{contract.tenant_email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary">ข้อมูลห้องพักและสัญญา</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">ห้องพัก</span>
                <span className="text-2xl font-black text-amber-300">ห้อง {contract.room_number}</span>
              </div>
              <div>
                <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block">ระยะเวลา</span>
                <span className="text-sm font-bold text-white">
                  {new Date(contract.start_date).toLocaleDateString('th-TH')} — {new Date(contract.end_date).toLocaleDateString('th-TH')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Details */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-slate-900/60 p-6 rounded-3xl border border-white/10">
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block mb-1">ค่าเช่ารายเดือน</span>
            <span className="text-2xl font-black text-white">฿{Number(contract.monthly_rent || contract.room_price || 0).toLocaleString()}</span>
          </div>
          <div>
            <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block mb-1">ค่ามัดจำสัญญา (ชำระแล้ว)</span>
            <span className="text-2xl font-black text-emerald-400">฿{Number(contract.deposit_amount).toLocaleString()}</span>
          </div>
        </div>

        {/* Payment Slip Proof Section */}
        <div className="space-y-4 pt-2">
          <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
            <span>🧾</span>
            <span>หลักฐานการชำระเงิน / สลิปโอนเงินค่าจอง (Payment Slip)</span>
          </h3>

          {contract.slip_url ? (
            <div className="p-6 bg-slate-950/60 border border-white/10 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div 
                  onClick={() => setPreviewSlip(true)}
                  className="w-20 h-28 rounded-2xl overflow-hidden border border-white/20 bg-slate-900 relative cursor-pointer group shadow-lg shrink-0"
                >
                  <img src={contract.slip_url} alt="Slip" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                    🔍 ขยาย
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">สลิปการโอนเงินค่าจองห้องพัก</p>
                  <p className="text-xs text-emerald-400 font-semibold">✓ แนบหลักฐานเรียบร้อยแล้ว</p>
                  <p className="text-[11px] text-white/40">คลิกที่รูปเพื่อตรวจสอบสลิปขนาดเต็ม</p>
                </div>
              </div>

              <button
                onClick={() => setPreviewSlip(true)}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs border border-white/10 transition-all cursor-pointer hover:scale-105 active:scale-95"
              >
                ดูสลิปขนาดเต็ม ↗
              </button>
            </div>
          ) : (
            <div className="p-6 bg-slate-950/40 border border-dashed border-white/10 rounded-3xl text-center text-xs text-white/40 font-medium">
              ยังไม่มีการแนบสลิปการโอนเงินในระบบ
            </div>
          )}
        </div>

        {/* Signed Paper Contract Proof Section */}
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
              <span>📸</span>
              <span>รูปภาพสัญญาเช่าฉบับลงนามจริง (Signed Paper Contract Proof)</span>
            </h3>
            <span className="text-[11px] text-white/50">ลงชื่อกระดาษตอนเข้าพักแล้วถ่ายรูปบันทึกเข้าระบบ</span>
          </div>

          {contract.contract_file_url ? (
            <div className="p-6 bg-slate-950/60 border border-emerald-500/30 rounded-3xl flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="flex items-center gap-5">
                <div 
                  onClick={() => setPreviewSignedDoc(true)}
                  className="w-20 h-28 rounded-2xl overflow-hidden border border-emerald-500/40 bg-slate-900 relative cursor-pointer group shadow-lg shrink-0"
                >
                  <img src={contract.contract_file_url} alt="Signed Contract" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-xs font-bold transition-opacity">
                    🔍 ขยาย
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm font-bold text-white">รูปภาพสัญญาเช่าฉบับลงนามจริง (พร้อมลายเซ็นสองฝ่าย)</p>
                  <p className="text-xs text-emerald-400 font-semibold">✓ บันทึกรูปสัญญาฉบับจริงในระบบเรียบร้อยแล้ว</p>
                  <p className="text-[11px] text-white/40">ผู้เช่าสามารถเปิดดูและดาวน์โหลดเป็นหลักฐานได้จากแดชบอร์ด</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <label className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs border border-white/10 transition-all cursor-pointer hover:scale-105 active:scale-95">
                  {isUploadingSigned ? 'กำลังอัปโหลด...' : '📷 ถ่าย/เปลี่ยนรูป'}
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={isUploadingSigned} onChange={handleUploadSignedContract} />
                </label>
                <button
                  onClick={() => setPreviewSignedDoc(true)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-all shadow-md cursor-pointer hover:scale-105 active:scale-95"
                >
                  ดูรูปขนาดเต็ม ↗
                </button>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-slate-950/40 border-2 border-dashed border-primary/30 rounded-3xl text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl mx-auto">
                📷
              </div>
              <div className="space-y-1">
                <p className="text-sm font-bold text-white">ยังไม่มีรูปภาพสัญญาเช่าฉบับลงนามจริง</p>
                <p className="text-xs text-white/50 max-w-lg mx-auto">
                  เมื่อผู้เช่าและเจ้าของหอพักลงลายมือชื่อในสัญญาเช่าฉบับกระดาษ (A4) ร่วมกันในวันเข้าหอพักแล้ว ถ่ายรูปหน้าที่ลงนามแล้วบันทึกเก็บเป็นหลักฐานในระบบ
                </p>
              </div>
              <div>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-2xl text-xs shadow-lg cursor-pointer transition-all hover:scale-105 active:scale-95">
                  <span>{isUploadingSigned ? '⏳ กำลังบันทึกรูปภาพ...' : '📷 ถ่ายภาพ / อัปโหลดรูปสัญญาที่เซ็นแล้ว'}</span>
                  <input type="file" accept="image/*,application/pdf" className="hidden" disabled={isUploadingSigned} onChange={handleUploadSignedContract} />
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Confirmation and Approval Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
          <div className="border border-white/10 rounded-[2rem] p-6 bg-[#080F1E] flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">การยืนยันของผู้เช่า</span>
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-lg font-bold">
              ✓
            </div>
            <span className="text-emerald-400 font-bold text-sm">ยอมรับสัญญาและโอนเงินแล้ว</span>
            <span className="text-white/40 text-[10px]">( คุณ{contract.tenant_name} )</span>
          </div>

          <div className="border border-white/10 rounded-[2rem] p-6 bg-[#080F1E] flex flex-col items-center justify-center text-center space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-white/40">การอนุมัติของเจ้าของหอ</span>
            {contract.status === 'Active' ? (
              <>
                <div className="w-10 h-10 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center text-lg font-bold">
                  ✓
                </div>
                <span className="text-emerald-400 font-bold text-sm">อนุมัติเรียบร้อยแล้ว</span>
                <span className="text-white/40 text-[10px]">สัญญาเริ่มมีผลบังคับใช้</span>
              </>
            ) : (
              <button
                onClick={handleApprove}
                disabled={approving}
                className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition-all shadow-lg hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer mt-1"
              >
                {approving ? 'กำลังอนุมัติ...' : '✓ กดอนุมัติสัญญาเช่าทันที'}
              </button>
            )}
          </div>
        </div>

      </div>

      {/* Slip Modal Preview */}
      {previewSlip && contract.slip_url && (
        <div 
          onClick={() => setPreviewSlip(false)}
          className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
        >
          <div className="max-w-md w-full bg-slate-900 rounded-3xl p-6 border border-white/20 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="font-bold text-white text-sm">สลิปการโอนเงิน (ห้อง {contract.room_number})</span>
              <button onClick={() => setPreviewSlip(false)} className="text-white/50 hover:text-white text-lg font-bold">✕</button>
            </div>
            <div className="rounded-2xl overflow-hidden max-h-[70vh] flex items-center justify-center bg-black">
              <img src={contract.slip_url} alt="Full Slip" className="max-h-[65vh] w-auto object-contain rounded-xl" />
            </div>
            <button 
              onClick={() => setPreviewSlip(false)} 
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Signed Contract Modal Preview */}
      {previewSignedDoc && contract.contract_file_url && (
        <div 
          onClick={() => setPreviewSignedDoc(false)}
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-200"
        >
          <div className="max-w-3xl w-full bg-slate-900 rounded-3xl p-6 border border-white/20 space-y-4 max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center pb-2 border-b border-white/10">
              <span className="font-bold text-white text-sm">📸 รูปภาพสัญญาเช่าฉบับลงนามจริง (ห้อง {contract.room_number} - {contract.tenant_name})</span>
              <div className="flex items-center gap-2">
                <a
                  href={contract.contract_file_url}
                  download={`signed_contract_room_${contract.room_number}`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-3 py-1 bg-primary/20 hover:bg-primary/30 text-primary text-xs font-bold rounded-lg transition-colors"
                >
                  ดาวน์โหลด
                </a>
                <button onClick={() => setPreviewSignedDoc(false)} className="text-white/50 hover:text-white text-lg font-bold">✕</button>
              </div>
            </div>
            <div className="rounded-2xl overflow-hidden flex-1 flex items-center justify-center bg-black/60 p-2">
              <img src={contract.contract_file_url} alt="Signed Contract Full" className="max-h-[70vh] w-auto object-contain rounded-xl" />
            </div>
            <button 
              onClick={() => setPreviewSignedDoc(false)} 
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Printable Contract Modal */}
      <PrintableContractModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        contract={contract}
      />
    </div>
  );
}
