'use client';

import React, { useState, useEffect } from 'react';
import type { DynamicPaymentSession } from '@/lib/features/dynamic-bill-qr';

export interface DynamicBillQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  billId?: number | null;
  roomNumber?: string;
  tenantName?: string;
  billTitle?: string;
  amount: number;
  enableSatang?: boolean;
  onPaid?: (session: DynamicPaymentSession) => void;
  onSwitchToSlip?: () => void;
}

export const DynamicBillQrModal: React.FC<DynamicBillQrModalProps> = ({
  isOpen,
  onClose,
  billId = null,
  roomNumber = '104',
  tenantName = 'ผู้เช่า',
  billTitle = 'ค่าเช่าและสาธารณูปโภค',
  amount = 1.0,
  enableSatang = true,
  onPaid,
  onSwitchToSlip,
}) => {
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [session, setSession] = useState<DynamicPaymentSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const initPaymentSession = async () => {
    setLoading(true);
    setStatusMsg('กำลังสร้าง Dynamic QR Code...');
    try {
      const qs = new URLSearchParams({
        amount: String(amount),
        roomNumber: String(roomNumber || '104'),
        tenantName: String(tenantName || 'ผู้เช่า'),
        billTitle: String(billTitle || 'ค่าบริการ'),
        enableSatang: String(enableSatang),
      });
      if (billId) qs.set('billId', String(billId));

      const res = await fetch(`/api/features/dynamic-qr?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        setQrDataUrl(json.qrDataUrl);
        setStatusMsg(`รอรับยอดโอน ฿${json.session.expectedAmount.toFixed(2)} เข้าพร้อมเพย์ 063-604-0550...`);
      } else {
        setStatusMsg(json.message || 'สร้าง QR ไม่สำเร็จ');
      }
    } catch (e: any) {
      setStatusMsg('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      initPaymentSession();
    } else {
      setSession(null);
      setQrDataUrl(null);
    }
  }, [isOpen, billId, amount, roomNumber]);

  // Real-time polling check (every 3.5s)
  useEffect(() => {
    if (!isOpen || !session || session.status !== 'PENDING') return;
    const timer = setInterval(async () => {
      try {
        const qs = new URLSearchParams({
          action: 'status',
          sessionId: session.sessionId,
          checkImap: 'true',
          amount: String(session.expectedAmount),
          roomNumber: session.roomNumber,
        });
        const res = await fetch(`/api/features/dynamic-qr?${qs.toString()}`);
        const json = await res.json();
        if (json.success && json.session) {
          setSession(json.session);
          if (json.session.status === 'PAID') {
            setStatusMsg('✅ ตรวจพบยอดเงินเข้าบัญชีแล้ว! ชำระเงินสำเร็จ');
            if (onPaid) onPaid(json.session);
          }
        }
      } catch {
        // ignore network hiccups
      }
    }, 3500);
    return () => clearInterval(timer);
  }, [isOpen, session, onPaid]);

  const handleManualCheck = async () => {
    if (!session) return;
    setCheckingEmail(true);
    setStatusMsg('กำลังตรวจหาแจ้งเตือนเงินเข้าในระบบ...');
    try {
      const res = await fetch('/api/features/dynamic-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'check_imap',
          sessionId: session.sessionId,
          fallbackAmount: session.expectedAmount,
          fallbackRoom: session.roomNumber,
        }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
      if (json.message) setStatusMsg(json.message);
      if (json.matched && json.session && onPaid) onPaid(json.session);
    } catch (e: any) {
      setStatusMsg('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setCheckingEmail(false);
    }
  };

  const handleSimulatePayment = async () => {
    if (!session) return;
    setCheckingEmail(true);
    try {
      const res = await fetch('/api/features/dynamic-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_bank_email',
          sessionId: session.sessionId,
          simulatedAmount: session.expectedAmount,
          fallbackAmount: session.expectedAmount,
          fallbackRoom: session.roomNumber,
        }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
      if (json.matched && json.session) {
        setStatusMsg('✅ ยืนยันยอดเงินสำเร็จ! บิลถูกบันทึกเรียบร้อย');
        if (onPaid) onPaid(json.session);
      }
    } catch (e: any) {
      setStatusMsg('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setCheckingEmail(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-card text-card-foreground border border-border rounded-3xl max-w-md w-full max-h-[92dvh] flex flex-col overflow-hidden shadow-2xl my-auto">
        {/* Sticky Header */}
        <div className="shrink-0 px-6 py-4 bg-secondary/50 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-black text-foreground">ชำระเงินด่วน (Dynamic QR)</h3>
              <p className="text-[10px] text-muted-foreground font-semibold">ห้อง {roomNumber} • ยืนยันเงินเข้าอัตโนมัติ</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center text-sm font-bold cursor-pointer transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-6 text-center space-y-4">
          {session?.status === 'PAID' ? (
            <div className="p-6 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 space-y-3 animate-in zoom-in-95">
              <div className="w-14 h-14 rounded-full bg-emerald-500 text-white font-black text-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20">
                ✓
              </div>
              <h4 className="text-xl font-black text-emerald-400">
                ชำระเงิน ฿{session.expectedAmount.toFixed(2)} สำเร็จ!
              </h4>
              <p className="text-xs text-muted-foreground font-mono">
                รหัสใบเสร็จ: <span className="text-foreground font-bold">{session.receiptNo}</span>
              </p>
              <p className="text-[11px] text-emerald-400 font-bold">
                ระบบได้ตัดยอดและบันทึกใบเสร็จรับเงินให้อัตโนมัติเรียบร้อยแล้ว
              </p>
            </div>
          ) : (
            <>
              {/* QR Image Box */}
              <div className="p-3 bg-white rounded-2xl shadow-xl w-56 h-56 mx-auto flex items-center justify-center border border-border/50">
                {loading ? (
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                    <span className="text-xs font-bold text-slate-600">กำลังสร้าง Dynamic QR...</span>
                  </div>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="PromptPay Dynamic QR" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-rose-500 font-bold">{statusMsg || 'ไม่พบ QR Code'}</span>
                )}
              </div>

              {/* Amount & PromptPay Info */}
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ยอดเงินที่ต้องสแกนจ่าย (รวมเศษสตางค์ระบุตัวตน)</p>
                <div className="text-3xl font-black text-emerald-500 font-mono tracking-tight">
                  ฿{session ? session.expectedAmount.toFixed(2) : amount.toFixed(2)}
                </div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-secondary/80 text-[11px] font-bold text-foreground mt-1">
                  <span>📱 พร้อมเพย์:</span>
                  <span className="font-mono text-primary font-black">063-604-0550</span>
                  <span className="text-muted-foreground">({session?.promptpayName || 'นาย กฤษกร บัวอินทร์'})</span>
                </div>
              </div>

              {/* Real-time Status Banner */}
              <div className="p-3 rounded-xl bg-secondary/40 border border-border text-xs text-muted-foreground flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{statusMsg || 'กำลังรอรับยอดเงินโอนเข้าบัญชีแบบเรียลไทม์...'}</span>
              </div>
            </>
          )}
        </div>

        {/* Sticky Footer */}
        <div className="shrink-0 px-6 py-4 bg-secondary/50 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="w-full sm:w-auto flex items-center gap-2">
            {onSwitchToSlip && session?.status !== 'PAID' && (
              <button
                type="button"
                onClick={onSwitchToSlip}
                className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-foreground text-xs font-bold transition-all cursor-pointer"
              >
                📎 แนบสลิปโอนเงินแทน
              </button>
            )}
          </div>

          <div className="w-full sm:w-auto flex items-center gap-2 justify-end">
            {session?.status === 'PAID' ? (
              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                เรียบร้อย (ปิดหน้าต่าง)
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={checkingEmail || loading}
                  onClick={handleManualCheck}
                  className="px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-muted-foreground hover:text-foreground text-xs font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="เช็คยอดเงินเข้าทันที"
                >
                  {checkingEmail ? 'กำลังเช็ค...' : '🔄 เช็คยอดเงิน'}
                </button>
                <button
                  type="button"
                  disabled={checkingEmail || loading}
                  onClick={handleSimulatePayment}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black transition-all cursor-pointer disabled:opacity-50 shadow-md shadow-emerald-600/20"
                  title="ทดสอบจำลองเงินเข้าเพื่อยืนยันบิลทันที"
                >
                  ⚡ ยืนยันเงินเข้า (จำลอง)
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const DynamicBillQrPaymentButton: React.FC<{
  billId?: number | null;
  roomNumber?: string;
  tenantName?: string;
  billTitle?: string;
  amount: number;
  enableSatang?: boolean;
  onPaid?: (session: DynamicPaymentSession) => void;
}> = (props) => {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-md flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
      >
        <span>📲</span>
        <span>สแกนจ่าย Dynamic QR</span>
      </button>

      <DynamicBillQrModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        {...props}
      />
    </>
  );
};

export default DynamicBillQrModal;
