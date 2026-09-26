'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import PrintableContractModal from '@/components/PrintableContractModal';

interface Contract {
  id: number;
  room_number?: string;
  room_type?: string;
  monthly_rent?: number;
  start_date: string;
  end_date: string;
  deposit_amount: number;
  status: string;
  contract_file_url?: string | null;
  renewal_requested?: number;
  renewal_note?: string | null;
  parent_contract_id?: number | null;
  created_at: string;
  tenant_name?: string;
  tenant_email?: string;
  tenant_phone?: string;
  id_card_number?: string;
  tenant_address?: string;
  id_card_image?: string;
}

export default function TenantContractPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [contracts, setContracts] = useState<Contract[]>([]);
  const [activeContract, setActiveContract] = useState<Contract | null>(null);
  const [loading, setLoading] = useState(true);

  // Renewal Modal
  const [isRenewModalOpen, setIsRenewModalOpen] = useState(false);
  const [renewalNote, setRenewalNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Printable Contract Modal
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // Preview File Modal
  const [previewingFileUrl, setPreviewingFileUrl] = useState<string | null>(null);

  const fetchTenantContracts = async () => {
    setLoading(true);
    try {
      const email = session?.user?.email;
      if (!email) return;

      const res = await fetch(`/api/tenant/me?email=${email}`);
      const data = await res.json();

      if (data.success && data.contracts) {
        setContracts(data.contracts);
        const currentActive = data.contracts.find((c: Contract) => c.status === 'Active') || data.contracts[0] || null;
        setActiveContract(currentActive);
      }
    } catch (err) {
      console.error('Error fetching tenant contracts:', err);
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
      fetchTenantContracts();
    }
  }, [authStatus, session, router]);

  const handleRequestRenewal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeContract) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/tenant/contract/request-renewal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contract_id: activeContract.id,
          renewal_note: renewalNote
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('🎉 ส่งคำขอต่อสัญญาเช่าไปยังเจ้าของหอพักเรียบร้อยแล้ว!');
        setIsRenewModalOpen(false);
        fetchTenantContracts();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการส่งคำขอ');
      }
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const historyContracts = contracts.filter(c => c.id !== activeContract?.id);

  return (
    <div className="p-6 lg:p-10 max-w-6xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-primary rounded-full" />
            <h1 className="text-3xl font-black text-foreground tracking-tight">สัญญาเช่าห้องพัก (Lease Contract)</h1>
          </div>
          <p className="text-muted-foreground text-sm font-medium ml-4 mt-1">
            รายละเอียดสัญญาเช่าปัจจุบัน และไฟล์เอกสารสัญญาฉบับจริงที่เซ็นรับรองแล้ว
          </p>
        </div>
      </div>

      {loading ? (
        <div className="bg-card border border-border rounded-3xl p-16 text-center text-muted-foreground font-bold animate-pulse">
          กำลังโหลดข้อมูลสัญญาเช่าของคุณ...
        </div>
      ) : !activeContract ? (
        <div className="bg-card border border-border rounded-3xl p-16 text-center shadow-xl space-y-4">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center text-4xl mx-auto mb-2">📄</div>
          <h3 className="text-2xl font-black text-foreground">ไม่พบข้อมูลสัญญาเช่า</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            ยังไม่มีการบันทึกสัญญาเช่าของคุณในระบบ หรือสัญญาเช่ากำลังอยู่ระหว่างการบันทึกโดยเจ้าของหอพัก กรุณาติดต่อผู้ดูแลหอพัก
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {/* Active Contract Card */}
          <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
            {/* Status Header */}
            <div className={`p-4 text-center font-black tracking-widest uppercase text-xs border-b ${
              activeContract.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-white/5 text-muted-foreground border-border'
            }`}>
              สถานะสัญญา: {activeContract.status === 'Active' ? '🟢 มีผลบังคับใช้ (Active)' : activeContract.status}
              {activeContract.renewal_requested === 1 && ' — 🔔 แจ้งส่งคำขอต่อสัญญาแล้ว (รอเจ้าของหอพักดำเนินการ)'}
            </div>

            <div className="p-8 lg:p-12 space-y-8">
              <div className="flex flex-col md:flex-row justify-between items-start gap-6 pb-6 border-b border-border">
                <div>
                  <h2 className="text-3xl font-black text-foreground">สัญญาเช่าที่พักอาศัย</h2>
                  <p className="text-muted-foreground text-sm font-medium mt-1">
                    ห้องพักหมายเลข <span className="text-white font-bold text-lg">ห้อง {activeContract.room_number || '-'}</span>
                  </p>
                </div>
                <div className="bg-white/5 px-6 py-3 rounded-2xl border border-border text-right">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest">รหัสสัญญา</p>
                  <p className="text-lg font-mono font-bold text-white">SD-CONTRACT-{activeContract.id.toString().padStart(4, '0')}</p>
                </div>
              </div>

              {/* Specs Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-white/5 p-6 rounded-2xl border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">ระยะเวลาเช่า</p>
                  <p className="text-white font-bold text-sm">
                    {new Date(activeContract.start_date).toLocaleDateString('th-TH')} - {new Date(activeContract.end_date).toLocaleDateString('th-TH')}
                  </p>
                </div>

                <div className="bg-white/5 p-6 rounded-2xl border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">เงินประกันการเช่า (Deposit)</p>
                  <p className="text-emerald-400 font-black text-xl">
                    ฿{Number(activeContract.deposit_amount || 0).toLocaleString()}
                  </p>
                </div>

                <div className="bg-white/5 p-6 rounded-2xl border border-border">
                  <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1">วันที่ทำสัญญา/บันทึก</p>
                  <p className="text-white font-bold text-sm">
                    {new Date(activeContract.created_at).toLocaleDateString('th-TH')}
                  </p>
                </div>
              </div>

              {/* Uploaded Contract Document Attachment */}
              <div className="p-8 bg-white/5 rounded-3xl border border-border space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-white flex items-center gap-2">
                      <span>📄 เอกสารสัญญาเช่าฉบับจริง (Signed Document)</span>
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">สำเนาภาพถ่าย/ไฟล์สัญญาที่เซ็นรับรองร่วมกับเจ้าของหอพัก</p>
                  </div>

                  {activeContract.contract_file_url && (
                    <a
                      href={activeContract.contract_file_url}
                      download={`contract_room_${activeContract.room_number}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-6 py-3 bg-primary text-white font-bold text-xs rounded-xl shadow-lg hover:brightness-110 transition-all flex items-center gap-2 cursor-pointer self-start sm:self-auto"
                    >
                      📥 ดาวน์โหลดเอกสารสัญญา
                    </a>
                  )}
                </div>

                {activeContract.contract_file_url ? (
                  <div className="relative rounded-2xl overflow-hidden border border-border bg-black/40 flex items-center justify-center min-h-[350px]">
                    {activeContract.contract_file_url.startsWith('data:image') || activeContract.contract_file_url.startsWith('http') ? (
                      <Image
                        src={activeContract.contract_file_url}
                        alt="Contract Document"
                        width={700}
                        height={900}
                        unoptimized
                        className="max-w-full h-auto object-contain cursor-pointer hover:scale-105 transition-transform duration-500 p-4"
                        onClick={() => setPreviewingFileUrl(activeContract.contract_file_url || null)}
                      />
                    ) : (
                      <iframe
                        src={activeContract.contract_file_url}
                        className="w-full h-[500px]"
                        title="Signed Contract PDF"
                      />
                    )}
                  </div>
                ) : (
                  <div className="p-12 text-center text-muted-foreground italic bg-black/20 rounded-2xl border border-white/5">
                    ยังไม่มีการแนบไฟล์ภาพสัญญาเช่าฉบับจริงในระบบ
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 pt-4 border-t border-border">
                <button
                  onClick={() => setIsPrintModalOpen(true)}
                  className="flex-1 py-4 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🖨️</span>
                  <span>ดูและพิมพ์เอกสารสัญญาเช่า (PDF)</span>
                </button>

                <button
                  onClick={() => setIsRenewModalOpen(true)}
                  disabled={activeContract.renewal_requested === 1}
                  className="flex-1 py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 cursor-pointer flex items-center justify-center gap-2"
                >
                  <span>🔄 {activeContract.renewal_requested === 1 ? 'ส่งคำขอต่อสัญญาแล้ว' : 'แจ้งความประสงค์ขอต่อสัญญาเช่า'}</span>
                </button>
              </div>
            </div>
          </div>

          {/* History Contracts Section */}
          {historyContracts.length > 0 && (
            <div className="space-y-6 pt-6">
              <h3 className="text-xl font-black text-foreground flex items-center gap-2">
                <span>📜 ประวัติสัญญาเช่าที่ผ่านมา ({historyContracts.length})</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {historyContracts.map(hc => (
                  <div key={hc.id} className="bg-card p-6 rounded-3xl border border-border space-y-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-black text-white text-base">สัญญา #{hc.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(hc.start_date).toLocaleDateString('th-TH')} - {new Date(hc.end_date).toLocaleDateString('th-TH')}
                        </p>
                      </div>
                      <span className="px-3 py-1 text-[10px] font-black uppercase tracking-widest rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20">
                        {hc.status === 'Renewed' ? 'ต่ออายุแล้ว' : hc.status}
                      </span>
                    </div>

                    {hc.contract_file_url && (
                      <button
                        onClick={() => setPreviewingFileUrl(hc.contract_file_url || null)}
                        className="w-full py-2.5 bg-white/5 hover:bg-white/10 border border-border rounded-xl text-xs font-bold text-white transition-all cursor-pointer"
                      >
                        📄 ดูไฟล์สัญญาย้อนหลัง
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Renewal Modal */}
      {isRenewModalOpen && activeContract && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-card rounded-[32px] w-full max-w-lg border border-border shadow-2xl overflow-hidden">
            <div className="bg-secondary/60 border-b border-border p-6 flex items-center justify-between">
              <h3 className="text-xl font-black text-foreground">🔄 แจ้งขอต่อสัญญาเช่า</h3>
              <button
                onClick={() => setIsRenewModalOpen(false)}
                className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-white flex items-center justify-center transition-all cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleRequestRenewal} className="p-6 space-y-6">
              <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-amber-300 text-xs font-medium space-y-1">
                <p className="font-bold">สัญญาปัจจุบัน: ห้อง {activeContract.room_number}</p>
                <p>สิ้นสุดสัญญา: {new Date(activeContract.end_date).toLocaleDateString('th-TH')}</p>
              </div>

              <div className="space-y-2">
                <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest">หมายเหตุ / ความประสงค์ขอต่อสัญญา</label>
                <textarea
                  rows={3}
                  placeholder="เช่น ประสงค์ขอต่อสัญญาเช่าเพิ่มอีก 1 ปีครับ..."
                  value={renewalNote}
                  onChange={(e) => setRenewalNote(e.target.value)}
                  className="w-full px-5 py-4 bg-white/5 border border-white/20 rounded-2xl text-white text-sm outline-none focus:border-primary transition-all custom-scrollbar"
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  type="button"
                  onClick={() => setIsRenewModalOpen(false)}
                  className="flex-1 py-4 text-muted-foreground font-bold hover:bg-white/5 rounded-2xl transition-all"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-[2] py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl hover:brightness-110 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'กำลังส่งคำขอ...' : 'ส่งคำขอต่อสัญญา →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* File Preview Modal */}
      {previewingFileUrl && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex items-center justify-center p-6">
          <div className="bg-card rounded-[36px] w-full max-w-4xl max-h-[90vh] border border-border shadow-2xl flex flex-col overflow-hidden">
            <div className="bg-secondary/60 border-b border-border p-6 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-black text-white">เอกสารสัญญาเช่า</h3>
              <div className="flex items-center gap-3">
                <a
                  href={previewingFileUrl}
                  download="contract_document"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-primary text-white text-xs font-bold rounded-xl shadow-lg hover:brightness-110 transition-all"
                >
                  📥 ดาวน์โหลดเอกสาร
                </a>
                <button
                  onClick={() => setPreviewingFileUrl(null)}
                  className="w-10 h-10 bg-white/5 hover:bg-white/10 rounded-xl text-muted-foreground hover:text-white flex items-center justify-center transition-all cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 flex items-center justify-center custom-scrollbar">
              {previewingFileUrl.startsWith('data:image') || previewingFileUrl.startsWith('http') ? (
                <div className="relative w-full min-h-[500px] flex items-center justify-center">
                  <Image
                    src={previewingFileUrl}
                    alt="Contract Document"
                    width={800}
                    height={1000}
                    unoptimized
                    className="max-w-full h-auto object-contain rounded-2xl shadow-2xl"
                  />
                </div>
              ) : (
                <iframe
                  src={previewingFileUrl}
                  className="w-full h-[600px] rounded-2xl border border-border"
                  title="Document Preview"
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Printable Contract Modal */}
      <PrintableContractModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        contract={activeContract as any}
      />
    </div>
  );
}
