'use client';

import React, { useState } from 'react';
import Image from 'next/image';

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

  if (!isOpen || !request) return null;

  const isCompleted = request.is_completed_calculated !== undefined 
    ? request.is_completed_calculated 
    : Boolean(request.is_contract_completed);

  const deposit = Number(request.contract_deposit_amount || request.deposit_amount || 0);
  const unpaid = Number(request.live_unpaid_total !== undefined ? request.live_unpaid_total : (request.unpaid_bills_total || 0));
  const penalty = Number(request.penalty_amount || 0);
  const netRefund = Number(request.live_net_refund !== undefined ? request.live_net_refund : (request.net_refund_amount || Math.max(0, deposit - unpaid - penalty)));

  const promptpayTarget = request.promptpay_target || request.tenant_phone || request.tenant_id_card || '082-985-3519';

  const handleCopyTarget = () => {
    navigator.clipboard.writeText(promptpayTarget.replace(/[\s-]/g, ''));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirmRefund = async () => {
    if (!confirm(`คุณแน่ใจหรือไม่ว่าได้โอนเงินประกันจำนวน ฿${netRefund.toLocaleString()} คืนให้ลูกหอเรียบร้อยแล้ว?\n\nการกดยืนยันจะปลดล็อคห้อง ${request.room_number} ให้เป็นสถานะว่าง และปิดสัญญานี้ทันที`)) {
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestId: request.id
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
      <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl space-y-6 max-h-[90vh] flex flex-col">
        
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
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-sm font-sans">

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
                {isCompleted ? '✓ อยู่ครบสัญญาเช่า (1 ปี)' : '⚠️ ย้ายออกก่อนครบสัญญา'}
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
                เหตุผลการย้ายออก: "{request.reason}"
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

          {/* Section 3: Net Refund Calculation Breakdown */}
          <div className="bg-slate-800/60 p-5 rounded-2xl border border-white/10 space-y-2.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-white/60 mb-2">
              3. สรุปการคำนวณเงินประกันสุทธิที่ต้องคืน
            </h4>
            
            <div className="flex justify-between text-xs text-white/80">
              <span>เงินประกันสัญญาเดิมที่วางไว้</span>
              <span className="font-mono font-bold text-emerald-400">+฿{deposit.toLocaleString()}</span>
            </div>

            <div className="flex justify-between text-xs text-white/80">
              <span>หักยอดค่าใช้จ่ายค้างชำระ</span>
              <span className="font-mono font-bold text-rose-400">-฿{unpaid.toLocaleString()}</span>
            </div>

            {penalty > 0 && (
              <div className="flex justify-between text-xs text-white/80">
                <span>หักค่าปรับกรณีผิดสัญญา</span>
                <span className="font-mono font-bold text-rose-400">-฿{penalty.toLocaleString()}</span>
              </div>
            )}

            <div className="pt-2 border-t border-white/10 flex justify-between items-center">
              <span className="text-sm font-bold text-white">ยอดเงินประกันสุทธิที่ต้องโอนคืน</span>
              <span className="text-2xl font-black text-emerald-400 font-mono">
                ฿{netRefund.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>

          {/* Section 4: PromptPay QR with Exact Amount */}
          <div className="bg-emerald-950/20 border border-emerald-500/30 p-5 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wider">
                  <span>🔒</span>
                  <span>4. QR Code พร้อมเพย์ ล็อคยอดเงินโอนคืนเป๊ะ (Exact PromptPay QR)</span>
                </h4>
                <p className="text-[11px] text-white/60 mt-0.5">
                  เจ้าของหอสแกนด้วยแอปธนาคาร ยอดเงินจะขึ้นตรงตามยอดสุทธิพอดี โอนขาดหรือเกินไม่ได้
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-6 pt-2">
              {/* QR Image */}
              {request.qr_image ? (
                <div className="bg-white p-3 rounded-2xl shadow-xl border border-white/20 shrink-0">
                  <img
                    src={request.qr_image}
                    alt="PromptPay QR"
                    className="w-44 h-44 object-contain"
                  />
                  <div className="text-center pt-1 font-mono text-[10px] text-slate-700 font-bold">
                    ฿{netRefund.toFixed(2)} บาท
                  </div>
                </div>
              ) : (
                <div className="w-44 h-44 bg-slate-900 border border-white/10 rounded-2xl flex items-center justify-center text-xs text-white/40">
                  ยอดเงินคืนเป็น 0 บาท
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
              {submitting ? 'กำลังบันทึก...' : '✓ ยืนยันว่าโอนเงินคืนแล้ว & ปลดล็อคห้องว่าง'}
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
