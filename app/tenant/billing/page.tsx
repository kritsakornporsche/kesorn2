'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import Image from 'next/image';

interface Bill {
  id: number;
  title: string;
  amount: string;
  room_amount?: number | string;
  water_units?: number | string;
  water_amount?: number | string;
  electric_units?: number | string;
  electric_amount?: number | string;
  common_fee?: number | string;
  electricity_rate?: number | string;
  water_rate?: number | string;
  days_overdue?: number;
  late_fee?: number;
  total_amount?: number;
  billing_cycle: string;
  due_date: string;
  status: string;
  meter_photo_url?: string | null;
  meter_prev_reading?: number | string;
  meter_current_reading?: number | string;
  correction_id?: number | null;
  correction_status?: string | null;
  correction_reason?: string | null;
  correction_new_reading?: number | string;
  correction_new_total?: number | string;
  correction_requested_by?: string | null;
}

export default function TenantBillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [bills, setBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedBill, setSelectedBill] = useState<Bill | null>(null);
  const [modalType, setModalType] = useState<'qr' | 'upload' | 'meter_photo' | 'dispute' | null>(null);
  const [uploading, setUploading] = useState(false);
  const [qrData, setQrData] = useState<{qrImage: string, amount: number, promptpayNumber: string, promptpayName?: string} | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  // Dispute Form State
  const [disputeReading, setDisputeReading] = useState('');
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState<string | null>(null);
  const [submittingDispute, setSubmittingDispute] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    } else if (status === 'authenticated') {
      fetchBills();
    }
  }, [status, session]);

  const fetchBills = async () => {
    try {
      const email = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : '');
      const res = await fetch(`/api/tenant/billing/list${email ? `?email=${encodeURIComponent(email)}` : ''}`);
      const json = await res.json();
      if (json.success) setBills(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedBill) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์ต้องไม่เกิน 5MB');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Data = event.target?.result;
      setUploading(true);
      try {
        const email = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : '');
        const res = await fetch('/api/tenant/billing/payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ billId: selectedBill.id, slipData: base64Data, email }),
        });
        const json = await res.json();
        if (json.success) {
          alert('✓ ส่งสลิปชำระเงินเรียบร้อยแล้ว');
          setModalType(null);
          fetchBills();
        } else {
          alert('เกิดข้อผิดพลาด: ' + json.message);
        }
      } catch (err) {
        console.error(err);
        alert('เกิดข้อผิดพลาดในการโหลดไฟล์');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleOpenQR = async (bill: Bill) => {
    setSelectedBill(bill);
    setModalType('qr');
    setQrLoading(true);
    setQrData(null);
    try {
      const email = session?.user?.email || (typeof window !== 'undefined' ? localStorage.getItem('userEmail') : '');
      const totalAmt = bill.total_amount ?? (Number(bill.amount) + (bill.late_fee || 0));
      const res = await fetch(`/api/tenant/billing/qr?billId=${bill.id}&amount=${totalAmt}${email ? `&email=${encodeURIComponent(email)}` : ''}`);
      const data = await res.json();
      if (data.success) {
        setQrData(data);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการโหลด QR Code');
      }
    } catch (err) {
      console.error(err);
      alert('ระบบขัดข้อง');
    } finally {
      setQrLoading(false);
    }
  };

  const handleOpenDispute = (bill: Bill) => {
    setSelectedBill(bill);
    setDisputeReading(bill.electric_units ? String(bill.electric_units) : '');
    setDisputeReason('');
    setDisputeEvidence(null);
    setModalType('dispute');
  };

  const handleOpenMeterPhoto = (bill: Bill) => {
    setSelectedBill(bill);
    setModalType('meter_photo');
  };

  const handleDisputeEvidenceUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      setDisputeEvidence(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleSubmitDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBill || !disputeReading) return;

    setSubmittingDispute(true);
    try {
      const res = await fetch('/api/owner/billing/dispute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          billId: selectedBill.id,
          newElectricReading: parseFloat(disputeReading) || 0,
          reason: disputeReason || 'ลูกหอขอตรวจสอบค่ามิเตอร์ไฟฟ้า',
          evidencePhotoUrl: disputeEvidence || null
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('✅ ส่งคำขอแก้ไขบิลเรียบร้อยแล้ว บิลถูกระงับชำระชั่วคราวเพื่อรอเจ้าของหอตรวจสอบ');
        setModalType(null);
        fetchBills();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการส่งคำขอ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmittingDispute(false);
    }
  };

  const handleResolveOwnerDispute = async (correctionId: number, action: 'approve' | 'reject') => {
    if (!confirm(action === 'approve' ? 'ยืนยันการอนุมัติยอดบิลที่เจ้าของหอขอแก้ไขหรือไม่?' : 'ยืนยันการปฏิเสธคำขอแก้ไขบิลของเจ้าของหอหรือไม่?')) {
      return;
    }
    try {
      const res = await fetch('/api/owner/billing/dispute', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctionId, action }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchBills();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  if (status === 'loading') return null;

  const unpaidCount = bills.filter(b => b.status === 'Unpaid' || b.status === 'Overdue').length;

  return (
    <>
      <div className="p-4 sm:p-8 lg:p-10">
        <div className="max-w-5xl mx-auto pb-16 space-y-8">
          <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-white/10">
            <div className="space-y-1">
              <h1 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">ธุรกรรมและการชำระเงิน</h1>
              <p className="text-muted-foreground font-medium text-xs sm:text-sm">รายละเอียดบิลค่าเช่า ค่าน้ำ-ไฟ และรูปหลักฐานการจดมิเตอร์</p>
            </div>
            {unpaidCount > 0 && (
              <div className="bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-2xl flex items-center gap-2.5 animate-pulse">
                  <span className="h-2 w-2 rounded-full bg-rose-500"></span>
                  <span className="text-xs font-black text-rose-400 uppercase tracking-wider">
                      มียอดค้างชำระ {unpaidCount} รายการ
                  </span>
              </div>
            )}
          </header>

          <div className="grid gap-6">
            {loading ? (
               <div className="p-20 text-center animate-pulse text-muted-foreground font-bold">กำลังดึงข้อมูลบิลล่าสุด...</div>
            ) : bills.length === 0 ? (
              <div className="bg-card border-2 border-dashed border-border rounded-3xl p-16 sm:p-20 text-center">
                <div className="w-16 h-16 bg-card rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
                   <span className="text-3xl">🧾</span>
                </div>
                <h3 className="text-lg font-black text-foreground mb-1">ยังไม่มีข้อมูลยอดเรียกเก็บ</h3>
                <p className="text-muted-foreground text-xs font-medium">เมื่อหอพักออกบิลใหม่ คุณจะเห็นรายละเอียดได้ที่นี่</p>
              </div>
            ) : bills.map((bill) => {
              const totalToPay = bill.total_amount ?? Number(bill.amount);
              const roomAmt = Number(bill.room_amount || 0);
              const elecUnits = Number(bill.electric_units || 0);
              const elecAmt = Number(bill.electric_amount || 0);
              const waterAmt = Number(bill.water_amount || 0);
              const commonFee = Number(bill.common_fee || 0);
              const lateFee = Number(bill.late_fee || 0);
              const isPendingCorrection = bill.status === 'PendingCorrection' || bill.correction_status === 'Pending';

              return (
                <div key={bill.id} className="bg-card rounded-3xl border border-border shadow-md hover:shadow-2xl transition-all duration-300 overflow-hidden flex flex-col xl:flex-row group">
                   <div className="p-6 sm:p-8 flex-1 flex flex-col justify-between">
                     <div>
                       <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">{bill.billing_cycle || 'รอบบิล'}</span>
                              <span className="px-2.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-black font-mono border border-primary/20">
                                บิล #{bill.id}
                              </span>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{bill.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isPendingCorrection ? (
                              <span className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                <span>⏳</span>
                                <span>{bill.correction_requested_by === 'owner' ? 'รอลูกหอยืนยันยอดแก้' : 'ระงับชำระ (รอเจ้าของหอตรวจสอบ)'}</span>
                              </span>
                            ) : (
                              <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-full border ${
                                 bill.status === 'Unpaid' || bill.status === 'Overdue' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                                 bill.status === 'Pending' ? 'bg-blue-500/10 text-blue-400 border-blue-500/30' :
                                 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                               }`}>
                                {bill.status === 'Unpaid' ? 'รอชำระเงิน' : bill.status === 'Overdue' ? 'เกินกำหนดชำระ' : bill.status === 'Pending' ? 'กำลังตรวจสอบ' : 'ชำระเรียบร้อย'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Owner Bill Correction Notice & Action Banner */}
                        {isPendingCorrection && bill.correction_requested_by === 'owner' && (
                          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                            <div className="flex items-start gap-3">
                              <span className="text-xl">⚠️</span>
                              <div className="flex-1 text-xs sm:text-sm">
                                <p className="font-black text-amber-300">
                                  เจ้าของหอพักได้ส่งคำขอปรับปรุงยอดบิลใหม่
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                  {bill.correction_new_reading && (
                                    <span className="mr-2">เลขมิเตอร์ใหม่: <strong className="text-foreground">{bill.correction_new_reading} หน่วย</strong></span>
                                  )}
                                  {bill.correction_new_total && (
                                    <span>ยอดรวมใหม่: <strong className="text-emerald-400">฿{Number(bill.correction_new_total).toLocaleString()}</strong></span>
                                  )}
                                </p>
                                {bill.correction_reason && (
                                  <p className="text-muted-foreground mt-0.5 text-xs">
                                    เหตุผล: <span className="italic text-foreground/80 font-medium">"{bill.correction_reason}"</span>
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
                              <button
                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, 'approve')}
                                className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>✓</span>
                                <span>ยอมรับ & อนุมัติยอดใหม่</span>
                              </button>
                              <button
                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, 'reject')}
                                className="flex-1 py-2 px-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>✕</span>
                                <span>ปฏิเสธคำขอนี้</span>
                              </button>
                            </div>
                          </div>
                        )}
                       
                       {/* Line-by-line detailed breakdown */}
                       <div className="bg-muted/30 rounded-2xl p-5 border border-border mb-6 space-y-3">
                         <div className="flex items-center justify-between border-b border-border pb-2.5">
                           <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">รายการค่าใช้จ่าย</span>
                           <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">จำนวนเงิน</span>
                         </div>

                         {/* Room Rent */}
                         <div className="flex items-center justify-between text-xs sm:text-sm">
                           <span className="font-semibold text-foreground/90 flex items-center gap-2">
                             🏠 ค่าเช่าห้องพัก
                           </span>
                           <span className="font-black text-foreground">฿{roomAmt > 0 ? roomAmt.toLocaleString() : Number(bill.amount).toLocaleString()}</span>
                         </div>

                         {/* Electricity */}
                         {(elecAmt > 0 || elecUnits > 0) && (
                           <div className="flex items-center justify-between text-xs sm:text-sm">
                             <div className="flex flex-col">
                               <span className="font-semibold text-foreground/90 flex items-center gap-2">
                                 ⚡ ค่าไฟฟ้า
                               </span>
                               <span className="text-[11px] text-muted-foreground pl-6 font-mono">
                                 {elecUnits > 0 ? `${elecUnits} หน่วย (@${bill.electricity_rate || 4.88} บ.)` : 'ตามรอบมิเตอร์'}
                                 {bill.meter_current_reading ? ` (เลขมิเตอร์: ${bill.meter_current_reading})` : ''}
                               </span>
                             </div>
                             <span className="font-black text-foreground">฿{elecAmt.toLocaleString()}</span>
                           </div>
                         )}

                         {/* Water */}
                         {waterAmt > 0 && (
                           <div className="flex items-center justify-between text-xs sm:text-sm">
                             <div className="flex flex-col">
                               <span className="font-semibold text-foreground/90 flex items-center gap-2">
                                 💧 ค่าน้ำประปา
                               </span>
                               <span className="text-[11px] text-muted-foreground pl-6">เหมาจ่าย / ตามอัตราหอพัก</span>
                             </div>
                             <span className="font-black text-foreground">฿{waterAmt.toLocaleString()}</span>
                           </div>
                         )}

                         {/* Common Fee */}
                         {commonFee > 0 && (
                           <div className="flex items-center justify-between text-xs sm:text-sm">
                             <span className="font-semibold text-foreground/90 flex items-center gap-2">
                               🧹 ค่าส่วนกลาง / ค่าบริการ
                             </span>
                             <span className="font-black text-foreground">฿{commonFee.toLocaleString()}</span>
                           </div>
                         )}

                         {/* Late Fee */}
                         {lateFee > 0 && (
                           <div className="flex items-center justify-between text-xs sm:text-sm text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                             <span className="font-bold flex items-center gap-2">
                               ⚠️ ค่าปรับล่าช้า ({bill.days_overdue} วัน x ฿50)
                             </span>
                             <span className="font-black">+฿{lateFee.toLocaleString()}</span>
                           </div>
                         )}
                       </div>

                       {/* Total & Due Date */}
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                         <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border flex flex-col justify-center">
                           <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-0.5">ยอดรวมที่ต้องชำระสุทธิ</p>
                           <p className="text-2xl sm:text-3xl font-black text-emerald-400">฿{totalToPay.toLocaleString()}</p>
                         </div>
                         <div className="bg-card p-4 sm:p-5 rounded-2xl border border-border flex flex-col justify-center">
                           <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mb-0.5">กำหนดชำระภายใน</p>
                           <p className="text-sm sm:text-base font-bold text-foreground">{bill.due_date ? new Date(bill.due_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric' }) : 'ตามกำหนดหอพัก'}</p>
                         </div>
                       </div>

                       {/* Auxiliary Tools: View Meter Photo & Request Correction */}
                       <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/5">
                         {bill.meter_photo_url && (
                           <button
                             onClick={() => handleOpenMeterPhoto(bill)}
                             className="px-3 py-1.5 bg-blue-500/10 hover:bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                           >
                             <span>📸</span>
                             <span>ดูรูปหลักฐานมิเตอร์</span>
                           </button>
                         )}

                         {bill.status !== 'Paid' && !isPendingCorrection && (
                           <button
                             onClick={() => handleOpenDispute(bill)}
                             className="px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                           >
                             <span>📝</span>
                             <span>แจ้งขอแก้ไขบิล / มิเตอร์ผิด</span>
                           </button>
                         )}

                         {isPendingCorrection && (
                           <span className="text-[11px] text-amber-400 font-bold italic">
                             * ส่งคำขอแก้เป็น {bill.correction_new_reading || '-'} หน่วย แล้ว อยู่ระหว่างรอเจ้าของหอพักตรวจสอบ
                           </span>
                         )}
                       </div>
                     </div>
                   </div>
                   
                   {/* Action Area */}
                   <div className="bg-card border-t xl:border-t-0 xl:border-l border-border p-6 sm:p-8 flex flex-col justify-center gap-3 xl:w-72">
                      {bill.status === 'Unpaid' || bill.status === 'Overdue' ? (
                        <>
                          <button 
                            disabled={isPendingCorrection}
                            onClick={() => handleOpenQR(bill)}
                            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground font-black py-3.5 px-4 rounded-2xl transition-all shadow-lg shadow-primary/20 active:scale-[0.98] flex items-center justify-center gap-2 text-sm disabled:opacity-50 cursor-pointer"
                          >
                            <span>💳</span>
                            <span>ชำระผ่าน QR Code</span>
                          </button>
                          <button 
                            disabled={isPendingCorrection}
                            onClick={() => { setSelectedBill(bill); setModalType('upload'); }}
                            className="w-full bg-secondary hover:bg-secondary/80 text-foreground border border-border font-bold py-3 px-4 rounded-2xl transition-all active:scale-[0.98] text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                          >
                            <span>📎</span>
                            <span>แจ้งโอนเงิน / แนบสลิป</span>
                          </button>
                        </>
                      ) : isPendingCorrection ? (
                        <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1 text-amber-300">
                          <p className="font-black text-xs">ระงับการชำระชั่วคราว</p>
                          <p className="text-[10px] text-slate-400">เจ้าของหอพักกำลังตรวจสอบคำขอแก้ไขบิล</p>
                        </div>
                      ) : (
                        <button disabled className={`w-full font-black py-3.5 px-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-xs ${
                            bill.status === 'Pending' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20 cursor-wait' : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        }`}>
                            {bill.status === 'Pending' ? (
                                <>
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                                    <span>กำลังตรวจสอบสลิป...</span>
                                </>
                            ) : (
                                <>
                                    <span>✓</span>
                                    <span>ชำระเงินเรียบร้อยแล้ว</span>
                                </>
                            )}
                        </button>
                      )}
                   </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Meter Evidence Photo Modal */}
      {modalType === 'meter_photo' && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 sm:p-8 space-y-4">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>📸 รูปหลักฐานมิเตอร์ไฟฟ้า</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">รอบบิล {selectedBill.billing_cycle || '-'}</p>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            {selectedBill.meter_photo_url ? (
              <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-black/60 border border-white/10">
                <Image
                  src={selectedBill.meter_photo_url}
                  alt="Meter Reading Evidence"
                  fill
                  unoptimized
                  className="object-contain p-2"
                />
              </div>
            ) : (
              <div className="p-12 text-center text-slate-400 font-bold bg-slate-950 rounded-2xl">
                ไม่มีรูปภาพมิเตอร์ในรอบบิลนี้
              </div>
            )}

            <div className="bg-slate-950 p-4 rounded-2xl border border-white/5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">หน่วยที่คำนวณในบิล</span>
                <span className="text-white font-black text-base">{selectedBill.electric_units || 0} หน่วย</span>
              </div>
              <div>
                <span className="text-slate-400 block text-[10px] uppercase font-bold">ค่าไฟฟ้า (@4.88 บ.)</span>
                <span className="text-primary font-black text-base">฿{Number(selectedBill.electric_amount || 0).toLocaleString()}</span>
              </div>
            </div>

            <button
              onClick={() => setModalType(null)}
              className="w-full py-3 bg-white/10 hover:bg-white/20 text-white font-bold rounded-xl text-xs transition-colors cursor-pointer"
            >
              ปิดหน้าต่าง
            </button>
          </div>
        </div>
      )}

      {/* Dispute Modal */}
      {modalType === 'dispute' && selectedBill && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in">
          <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 sm:p-8 space-y-5">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <h3 className="text-lg font-black text-white flex items-center gap-2">
                  <span>📝 ขอแก้ไขบิลค่าใช้จ่าย</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedBill.title} (รอบบิล {selectedBill.billing_cycle})</p>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 flex items-center justify-center cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitDispute} className="space-y-4 text-xs">
              <div className="bg-amber-500/10 border border-amber-500/20 p-3.5 rounded-2xl text-amber-200">
                <p className="font-bold">⚠️ หมายเหตุการขอแก้ไขบิล:</p>
                <p className="mt-1 text-[11px] text-white/80 leading-relaxed">
                  เมื่อกดส่งคำขอ บิลจะถูกระงับการชำระชั่วคราวและส่งแจ้งเตือนไปยังเจ้าของหอพักทันที เมื่อเจ้าของหอพักตรวจสอบและอนุมัติ ระบบจะปรับปรุงยอดและขยายเวลากำหนดชำระให้อีก 5 วัน
                </p>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  หน่วยไฟฟ้าที่ถูกต้อง (หน่วย) *
                </label>
                <input
                  type="number"
                  step="any"
                  required
                  value={disputeReading}
                  onChange={(e) => setDisputeReading(e.target.value)}
                  placeholder="ระบุจำนวนหน่วยไฟฟ้าที่ถูกต้องตามมิเตอร์จริง"
                  className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-white font-bold focus:outline-none focus:border-amber-400"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  หน่วยเดิมในบิล: {selectedBill.electric_units || 0} หน่วย
                </span>
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  เหตุผล / รายละเอียดที่ขอแก้ไข *
                </label>
                <textarea
                  rows={3}
                  required
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="เช่น จดเลขมิเตอร์สลับกับห้องข้างเคียง, เลขมิเตอร์จริงบนหน้าปัดคือ 1234..."
                  className="w-full px-4 py-3 bg-slate-950 border border-white/10 rounded-xl text-white focus:outline-none focus:border-amber-400"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-bold mb-1.5">
                  แนบรูปถ่ายมิเตอร์เป็นหลักฐาน (ถ้ามี)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleDisputeEvidenceUpload}
                  className="w-full px-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-slate-400 text-xs"
                />
                {disputeEvidence && (
                  <div className="mt-2 w-24 h-24 relative rounded-lg overflow-hidden border border-white/20">
                    <img src={disputeEvidence} alt="Evidence Preview" className="w-full h-full object-cover" />
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={submittingDispute}
                  className="flex-1 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-xl shadow-lg transition-all active:scale-95 disabled:opacity-50 cursor-pointer"
                >
                  {submittingDispute ? 'กำลังส่งเรื่อง...' : '✓ ยืนยันส่งคำขอแก้ไข'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {modalType === 'qr' && selectedBill && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in p-4 overflow-y-auto">
           <div className="bg-card rounded-[2.5rem] w-full max-w-sm p-8 overflow-hidden shadow-2xl relative animate-in zoom-in-95 border border-border my-auto">
             <button onClick={() => setModalType(null)} className="absolute top-5 right-5 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 text-muted-foreground cursor-pointer">✕</button>
             <h2 className="text-lg font-black text-white mb-4 text-center">สแกนชำระเงิน</h2>
             
             <div className="bg-card p-4 rounded-3xl border border-border flex justify-center mb-4 min-h-[200px] items-center">
                {qrLoading ? (
                   <div className="flex flex-col items-center justify-center space-y-3">
                     <svg className="w-8 h-8 text-primary animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                     <span className="text-sm font-bold text-muted-foreground">กำลังสร้าง QR Code...</span>
                   </div>
                ) : qrData ? (
                   <div className="flex flex-col items-center">
                     <img src={qrData.qrImage} alt="QR Code" className="w-52 h-52 object-contain bg-white p-2 rounded-xl shadow-md" />
                     <p className="text-xs text-muted-foreground mt-3 font-bold tracking-wider">พร้อมเพย์: {qrData.promptpayNumber}</p>
                   </div>
                ) : (
                   <p className="text-rose-400 font-bold text-xs">ไม่สามารถโหลด QR Code ได้</p>
                )}
             </div>

             <div className="text-center space-y-0.5 mb-4">
               <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ยอดที่ต้องชำระ (รวมค่าปรับถ้ามี)</p>
               <p className="text-2xl font-black text-emerald-400">฿{Number(qrData?.amount ?? selectedBill.total_amount ?? selectedBill.amount).toLocaleString()}</p>
             </div>

             {qrData && (
               <div className="mb-4">
                 <PromptPayBankSelector
                   qrImage={qrData.qrImage}
                   promptpayNumber={qrData.promptpayNumber}
                   promptpayName={qrData.promptpayName}
                   amount={Number(qrData?.amount ?? selectedBill.total_amount ?? selectedBill.amount)}
                   fileName={`qr-bill-${selectedBill.id}.png`}
                 />
               </div>
             )}

             <button 
                onClick={() => setModalType('upload')}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 px-6 rounded-2xl shadow-xl shadow-emerald-600/20 active:scale-95 transition-all cursor-pointer text-sm"
             >
                แนบสลิปการโอนเงิน
             </button>
           </div>
         </div>
      )}

      {/* Upload Slip Modal */}
      {modalType === 'upload' && selectedBill && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in p-4">
           <div className="bg-card rounded-[2.5rem] w-full max-w-md p-10 overflow-hidden shadow-2xl relative animate-in zoom-in-95">
             <button onClick={() => setModalType(null)} className="absolute top-6 right-6 h-10 w-10 flex items-center justify-center rounded-full hover:bg-black/5 text-muted-foreground" disabled={uploading}>✕</button>
             <h2 className="text-xl font-black text-foreground mb-2">อัพโหลดหลักฐาน</h2>
             <p className="text-sm text-muted-foreground font-medium mb-8">กรุณาแนบภาพสลิปที่เห็นยอดเงินและเวลาจัดเจน</p>
             
             <div className="border-2 border-dashed border-border rounded-[2rem] p-10 flex flex-col items-center justify-center bg-card relative group hover:border-primary transition-colors mb-6 cursor-pointer">
                <input 
                   type="file" 
                   accept="image/*" 
                   onChange={handleFileUpload}
                   disabled={uploading}
                   className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
                />
                <svg className={`w-12 h-12 mb-4 text-muted-foreground/60 group-hover:text-primary transition-colors ${uploading ? 'animate-bounce' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                <p className="font-bold text-white mb-1">{uploading ? 'กำลังประมวลผล...' : 'คลิกเพื่อเลือกไฟล์รูปภาพ'}</p>
                <p className="text-xs text-muted-foreground font-medium">รองรับ JPG, PNG ขนาดไม่เกิน 5MB</p>
             </div>
             
             <div className="flex gap-4">
               <button 
                  onClick={() => setModalType(null)} 
                  disabled={uploading}
                  className="flex-1 py-4 border border-border text-muted-foreground rounded-2xl font-bold text-sm hover:bg-card"
               >
                 ยกเลิก
               </button>
             </div>
           </div>
         </div>
      )}
    </>
  );
}
