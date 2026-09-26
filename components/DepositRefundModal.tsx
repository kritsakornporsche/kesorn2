'use client';

import React, { useState, useEffect } from 'react';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

interface MoveOutRequestItem {
  id: number;
  tenant_id: number;
  room_id: number;
  room_number: string;
  room_type?: string;
  room_price?: number;
  tenant_name: string;
  tenant_phone?: string;
  tenant_email?: string;
  tenant_id_card?: string;
  desired_date: string;
  reason?: string;
  status: string;
  promptpay_target?: string;
  promptpay_name?: string;
  bank_name?: string;
  contract_id?: number;
  contract_start_date?: string;
  contract_end_date?: string;
  contract_deposit_amount?: number;
  contract_status?: string;
  deposit_amount?: number;
  unpaid_bills_total?: number;
  penalty_amount?: number;
  net_refund_amount?: number;
  is_contract_completed?: number | boolean;
  is_completed_calculated?: boolean;
  live_unpaid_total?: number;
  live_net_refund?: number;
  qr_payload?: string;
  qr_image?: string;
  unpaid_bills?: Array<{
    id: number;
    title: string;
    amount: number;
    billing_cycle?: string;
    created_at?: string;
  }>;
}

interface DepositRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  request: MoveOutRequestItem | null;
  onConfirmSuccess: () => void;
}

export default function DepositRefundModal({
  isOpen,
  onClose,
  request,
  onConfirmSuccess
}: DepositRefundModalProps) {
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Dynamic deduction/penalty states
  const [additionalDeduction, setAdditionalDeduction] = useState<number>(0);
  const [deductionReason, setDeductionReason] = useState<string>('');
  const [dynamicQrUrl, setDynamicQrUrl] = useState<string | null>(null);

  useEffect(() => {
    if (request) {
      const initialPenalty = Number(request.penalty_amount || 0);
      setAdditionalDeduction(initialPenalty);
      setDeductionReason('');
    }
  }, [request]);

  const deposit = Number(request?.contract_deposit_amount || request?.deposit_amount || 0);
  const unpaid = Number(request?.live_unpaid_total !== undefined ? request.live_unpaid_total : (request?.unpaid_bills_total || 0));
  
  // Real-time calculated net refund
  const totalDeductions = unpaid + additionalDeduction;
  const netRefund = Math.max(0, deposit - totalDeductions);
  const isDeficit = deposit < totalDeductions;
  const deficitAmount = isDeficit ? totalDeductions - deposit : 0;

  const promptpayTarget = (request?.promptpay_target || request?.tenant_phone || request?.tenant_id_card || '0829853519').replace(/[\s-]/g, '');

  // Live QR Code Generation whenever netRefund changes
  useEffect(() => {
    if (!request || netRefund <= 0 || !promptpayTarget) {
      setDynamicQrUrl(null);
      return;
    }

    try {
      const payload = generatePayload(promptpayTarget, { amount: netRefund });
      qrcode.toDataURL(payload, {
        type: 'image/png',
        errorCorrectionLevel: 'H',
        margin: 2,
        scale: 6
      }, (err, url) => {
        if (!err && url) {
          setDynamicQrUrl(url);
        }
      });
    } catch (e) {
      console.warn('QR Code generation error:', e);
    }
  }, [netRefund, promptpayTarget, request]);

  if (!isOpen || !request) return null;

  const isCompleted = request.is_completed_calculated !== undefined 
    ? request.is_completed_calculated 
    : Boolean(request.is_contract_completed);

  const handleCopyTarget = () => {
    navigator.clipboard.writeText(promptpayTarget);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmRefund = async () => {
    const confirmMsg = isDeficit 
      ? `ยอดค้างชำระเกินเงินประกัน (ผู้เช่าคงค้าง ฿${deficitAmount.toLocaleString()})\n\nคุณแน่ใจหรือไม่ว่าต้องการปิดสัญญาและปลดล็อคห้อง ${request.room_number} ให้เป็นสถานะว่าง?`
      : `คุณแน่ใจหรือไม่ว่าได้โอนเงินประกันจำนวน ฿${netRefund.toLocaleString(undefined, { minimumFractionDigits: 2 })} คืนให้ลูกหอเรียบร้อยแล้ว?\n\nการกดยืนยันจะปลดล็อคห้อง ${request.room_number} ให้เป็นสถานะว่าง และปิดสัญญานี้ทันที`;

    if (!confirm(confirmMsg)) return;

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id,
          penaltyAmount: additionalDeduction,
          note: deductionReason
        })
      });

      const data = await res.json();
      if (data.success) {
        alert('🎉 ยืนยันการคืนเงินประกันและปิดสัญญาเรียบร้อยแล้ว ห้องพักกลับมาเป็นสถานะว่างพร้อมปล่อยเช่าทันที');
        onConfirmSuccess();
        onClose();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการยืนยัน');
      }
    } catch (err: any) {
      console.error('Confirm error:', err);
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-md flex justify-center items-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-6 max-h-[92vh] flex flex-col">
        
        {/* Header */}
        <div className="bg-slate-800/80 px-6 py-5 border-b border-white/10 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-xl">
              💰
            </div>
            <div>
              <h2 className="text-lg font-bold text-white tracking-tight">
                ตรวจสอบและคืนเงินประกันห้องพัก (ห้อง {request.room_number})
              </h2>
              <p className="text-xs text-white/50">
                ผู้เช่า: คุณ{request.tenant_name} • คำร้องแจ้งย้ายออก #{request.id}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/50 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-sm font-sans custom-scrollbar">

          {/* Section 1: Contract Term Verification */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                1. ตรวจสอบการครบกำหนดสัญญาเช่า
              </span>
              <span className={`px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 ${
                isCompleted 
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                  : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
              }`}>
                {isCompleted ? '✓ อยู่ครบสัญญาเช่า (1 ปีบริบูรณ์)' : '⚠️ ย้ายออกก่อนครบสัญญา'}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3 text-xs bg-slate-900/60 p-3 rounded-xl">
              <div>
                <span className="text-white/40 block text-[11px]">วันเริ่มสัญญา</span>
                <span className="font-semibold text-white">
                  {request.contract_start_date ? new Date(request.contract_start_date).toLocaleDateString('th-TH') : '-'}
                </span>
              </div>
              <div>
                <span className="text-white/40 block text-[11px]">วันสิ้นสุดสัญญา</span>
                <span className="font-semibold text-white">
                  {request.contract_end_date ? new Date(request.contract_end_date).toLocaleDateString('th-TH') : '-'}
                </span>
              </div>
              <div>
                <span className="text-white/40 block text-[11px]">วันที่ขอย้ายออก</span>
                <span className="font-semibold text-amber-300">
                  {request.desired_date ? new Date(request.desired_date).toLocaleDateString('th-TH') : '-'}
                </span>
              </div>
            </div>
            {request.reason && (
              <p className="text-xs text-white/60 italic">
                เหตุผลการย้ายออก: &quot;{request.reason}&quot;
              </p>
            )}
          </div>

          {/* Section 2: Unpaid Expenses Audit */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                2. ตรวจสอบบิลและค่าใช้จ่ายค้างชำระ
              </span>
              <span className="text-xs font-mono font-bold text-rose-400">
                รวมค้างชำระ: ฿{unpaid.toLocaleString()}
              </span>
            </div>

            {request.unpaid_bills && request.unpaid_bills.length > 0 ? (
              <div className="space-y-2">
                {request.unpaid_bills.map((bill, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-slate-900/60 px-3 py-2 rounded-xl text-xs">
                    <span className="text-white/80">{bill.title}</span>
                    <span className="font-mono font-bold text-rose-300">
                      -฿{Number(bill.amount).toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-2 text-xs text-emerald-400 font-semibold bg-emerald-500/10 rounded-xl border border-emerald-500/20">
                ✓ ไม่มีค่าใช้จ่ายหรือบิลค้างชำระ
              </div>
            )}
          </div>

          {/* Section 3: Room Damage & Cleaning Adjustment (Real-world flexibility) */}
          <div className="bg-slate-950/60 p-4 rounded-2xl border border-white/10 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                3. ค่าเสียหาย / ค่าทำความสะอาดห้อง / ค่าปรับเพิ่มเติม (ถ้ามี)
              </span>
              <span className="text-[11px] text-white/50">ปรับเปลี่ยนได้ตามสภาพห้องจริง</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[11px] font-bold text-white/60 mb-1">
                  จำนวนเงินที่หักเพิ่ม (บาท)
                </label>
                <input
                  type="number"
                  min="0"
                  disabled={request.status === 'Completed'}
                  value={additionalDeduction}
                  onChange={(e) => setAdditionalDeduction(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="0"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-white/20 rounded-xl text-white font-mono font-bold focus:border-amber-400 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-white/60 mb-1">
                  หมายเหตุรายการหัก (เช่น ค่าล้างแอร์, ค่าซ่อมลูกบิด)
                </label>
                <input
                  type="text"
                  disabled={request.status === 'Completed'}
                  value={deductionReason}
                  onChange={(e) => setDeductionReason(e.target.value)}
                  placeholder="เช่น ค่าทำความสะอาดคราบ 300 บาท"
                  className="w-full px-4 py-2.5 bg-slate-900 border border-white/20 rounded-xl text-white text-xs focus:border-amber-400 outline-none transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                />
              </div>
            </div>
          </div>

          {/* Section 4: Net Refund Calculation Breakdown */}
          <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
              4. สรุปยอดเงินประกันสุทธิที่ต้องคืน (คำนวณแบบ Real-time)
            </h4>
            
            <div className="flex justify-between text-xs text-white/80">
              <span>เงินประกันสัญญาเดิมที่ผู้เช่าวางไว้</span>
              <span className="font-mono font-bold text-emerald-400">+฿{deposit.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-xs text-white/80">
              <span>หักยอดค่าใช้จ่ายค้างชำระ (บิลน้ำ-ไฟ-ห้อง)</span>
              <span className="font-mono font-bold text-rose-400">-฿{unpaid.toLocaleString()}</span>
            </div>

            {additionalDeduction > 0 && (
              <div className="flex justify-between text-xs text-white/80">
                <span>หักค่าเสียหาย / ทำความสะอาดห้องเพิ่มเติม {deductionReason ? `(${deductionReason})` : ''}</span>
                <span className="font-mono font-bold text-rose-400">-฿{additionalDeduction.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
              <span className="text-sm font-bold text-white">
                {isDeficit ? 'ยอดเงินคงค้างที่ลูกหอต้องชำระเพิ่ม' : 'ยอดเงินประกันสุทธิที่เจ้าของหอต้องโอนคืน'}
              </span>
              <span className={`text-2xl font-black font-mono ${isDeficit ? 'text-rose-400' : 'text-emerald-400'}`}>
                {isDeficit ? `฿${deficitAmount.toFixed(2)}` : `฿${netRefund.toFixed(2)}`}
              </span>
            </div>

            {isDeficit && (
              <p className="text-[11px] text-rose-300 font-semibold bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                ⚠️ ยอดค้างชำระรวมค่าเสียหายมากกว่าเงินประกัน ผู้เช่าต้องชำระเพิ่มจำนวน ฿{deficitAmount.toFixed(2)} บาท เจ้าของหอไม่ต้องโอนเงินคืน
              </p>
            )}
          </div>

          {/* Section 5: PromptPay QR with Exact Amount */}
          {request.status === 'Completed' ? (
            <div className="bg-emerald-950/30 border border-emerald-500/40 p-5 rounded-2xl space-y-3">
              <div className="flex items-center gap-3">
                <span className="text-3xl">🎉</span>
                <div>
                  <h4 className="text-sm font-bold text-emerald-400">รายการนี้ได้รับการเคลียร์เงินประกันและปิดสัญญาแล้ว</h4>
                  <p className="text-xs text-white/70">
                    ยอดเงินประกันสุทธิ <strong>฿{Number(request.net_refund_amount !== undefined ? request.net_refund_amount : netRefund).toFixed(2)} บาท</strong> 
                    {request.refunded_at && ` • โอนเมื่อ ${new Date(request.refunded_at).toLocaleDateString('th-TH')} เวลา ${new Date(request.refunded_at).toLocaleTimeString('th-TH')}`}
                  </p>
                </div>
              </div>
              <div className="bg-slate-900/60 p-3 rounded-xl border border-white/10 text-xs">
                <span className="text-white/40 block text-[10px]">บัญชีพร้อมเพย์ที่โอนคืน:</span>
                <span className="font-mono font-bold text-white text-sm">{promptpayTarget}</span>
                <span className="text-emerald-300 ml-2">({request.promptpay_name || request.tenant_name})</span>
              </div>
              {request.refund_slip_url && (
                <div className="pt-2">
                  <span className="text-xs text-white/60 block mb-1 font-bold">สลิปหลักฐานการโอนเงิน:</span>
                  <a href={request.refund_slip_url} target="_blank" rel="noreferrer" className="inline-block">
                    <img src={request.refund_slip_url} alt="Refund Slip" className="w-28 h-36 object-cover rounded-xl border border-white/20 hover:scale-105 transition-transform shadow-md" />
                  </a>
                </div>
              )}
            </div>
          ) : !isDeficit && netRefund > 0 ? (
            <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                    <span>🔒</span>
                    <span>5. QR Code พร้อมเพย์ ล็อคยอดเงินโอนคืนเป๊ะ (Exact PromptPay Dynamic QR)</span>
                  </h4>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    เจ้าของหอสแกนด้วยแอปธนาคาร ยอดเงินจะขึ้นตรงตามยอดสุทธิ <strong>฿{netRefund.toFixed(2)}</strong> พอดี โอนขาดหรือเกินไม่ได้
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-2">
                {/* QR Image */}
                {dynamicQrUrl ? (
                  <div className="bg-white p-3 rounded-2xl shadow-xl border border-white/20 shrink-0">
                    <img
                      src={dynamicQrUrl}
                      alt="PromptPay QR"
                      className="w-44 h-44 object-contain"
                    />
                    <div className="text-center pt-1 font-mono text-[10px] text-slate-700 font-bold">
                      ฿{netRefund.toFixed(2)} บาท
                    </div>
                  </div>
                ) : (
                  <div className="w-44 h-44 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center text-xs text-white/40">
                    กำลังสร้าง QR Code...
                  </div>
                )}

                {/* Target Details */}
                <div className="space-y-3 text-xs flex-1">
                  <div className="bg-slate-900/80 p-3 rounded-xl space-y-1 border border-white/10">
                    <span className="text-white/40 text-[10px] block font-mono">บัญชีพร้อมเพย์ปลายทาง</span>
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base font-bold text-white tracking-wider">
                        {promptpayTarget}
                      </span>
                      <button
                        onClick={handleCopyTarget}
                        className="px-2.5 py-1 bg-white/10 hover:bg-white/20 text-white rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                      >
                        {copied ? '✓ คัดลอกแล้ว' : 'คัดลอก'}
                      </button>
                    </div>
                    <p className="text-[11px] text-emerald-300 font-medium pt-1">
                      ชื่อบัญชี: {request.promptpay_name || request.tenant_name} ({request.bank_name || 'พร้อมเพย์'})
                    </p>
                  </div>

                  <div className="bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-xl text-[11px] text-emerald-300">
                    ⚡ <strong>ระบบป้องกันความผิดพลาด:</strong> โค้ดถูกสร้างตามมาตรฐาน EMVCo Dynamic QR ระบุยอดเงิน <strong>฿{netRefund.toFixed(2)}</strong> เจ้าของหอเพียงเปิดแอปธนาคารแล้วสแกนได้ทันที
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-slate-950/60 border border-white/10 rounded-2xl text-center text-xs text-white/60">
              {isDeficit 
                ? 'ไม่มีการสร้าง QR Code โอนคืนเงิน เนื่องจากผู้เช่ามียอดค้างชำระเกินวงเงินประกัน' 
                : 'ยอดเงินประกันสุทธิที่ต้องคืนเท่ากับ 0 บาท (หักกลบลบหนี้พอดี)'}
            </div>
          )}

        </div>

        {/* Footer Actions */}
        <div className="bg-slate-800/80 px-6 py-4 border-t border-white/10 flex items-center justify-between gap-4 shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
          >
            ปิดหน้าต่าง
          </button>

          {request.status !== 'Completed' ? (
            <button
              onClick={handleConfirmRefund}
              disabled={submitting}
              className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 rounded-xl text-xs font-bold transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
            >
              {submitting ? 'กำลังบันทึก...' : '✓ ยืนยันการเคลียร์เงินประกัน & ปลดล็อคห้องว่าง'}
            </button>
          ) : (
            <div className="text-emerald-400 font-bold text-xs flex items-center gap-1.5">
              <span>✓ คืนเงินประกันและปิดสัญญาเรียบร้อยแล้ว</span>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
