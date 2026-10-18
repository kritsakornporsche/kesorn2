'use client';

import React, { useState, useEffect } from 'react';
import type { DynamicPaymentSession } from '@/lib/features/dynamic-bill-qr';

interface DynamicBillQrButtonProps {
  billId?: number | null;
  roomNumber?: string;
  tenantName?: string;
  billTitle?: string;
  amount: number;
  enableSatang?: boolean;
  onPaid?: (session: DynamicPaymentSession) => void;
}

export const DynamicBillQrPaymentButton: React.FC<DynamicBillQrButtonProps> = ({
  billId = null,
  roomNumber = '104',
  tenantName = 'นายกฤษกร บัวอินทร์',
  billTitle = 'ค่าเช่าและสาธารณูปโภค',
  amount = 1.0,
  enableSatang = true,
  onPaid,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const [session, setSession] = useState<DynamicPaymentSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const initPaymentSession = async () => {
    setIsOpen(true);
    setLoading(true);
    setStatusMsg('กำลังสร้าง QR...');
    try {
      const qs = new URLSearchParams({
        amount: String(amount),
        roomNumber,
        tenantName,
        billTitle,
        enableSatang: String(enableSatang),
      });
      if (billId) qs.set('billId', String(billId));

      const res = await fetch(`/api/features/dynamic-qr?${qs.toString()}`);
      const json = await res.json();
      if (json.success) {
        setSession(json.session);
        setQrDataUrl(json.qrDataUrl);
        setStatusMsg(`รอรับยอดโอน ฿${json.session.expectedAmount.toFixed(2)} เข้าพร้อมเพย์ 063-604-0550...`);
      }
    } catch (e: any) {
      setStatusMsg('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

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
          if (json.session.status === 'PAID' && onPaid) {
            onPaid(json.session);
          }
        }
      } catch {
        // ignore
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [isOpen, session, onPaid]);

  const handleManualImapCheck = async () => {
    if (!session) return;
    setCheckingEmail(true);
    setStatusMsg('กำลังเช็คแจ้งเตือนใน Gmail...');
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

  const handleSimulateBankEmail = async () => {
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
      if (json.matched && json.session && onPaid) onPaid(json.session);
    } catch (e: any) {
      setStatusMsg('เกิดข้อผิดพลาด: ' + e.message);
    } finally {
      setCheckingEmail(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={initPaymentSession}
        className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-md flex items-center gap-2 cursor-pointer active:scale-95 transition-all"
      >
        <span>📲</span>
        <span>เปิดหน้าต่างสแกนจ่าย (Modal)</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-white/15 rounded-3xl max-w-md w-full max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto text-slate-100">
            {/* Sticky Header */}
            <div className="shrink-0 px-5 py-3.5 bg-slate-950 border-b border-white/10 flex items-center justify-between">
              <span className="text-sm font-black text-white">สแกนชำระเงินอัตโนมัติ (ห้อง {roomNumber})</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Scrollable Body */}
            <div className="flex-1 overflow-y-auto overscroll-contain p-5 text-center space-y-4">
              {session?.status === 'PAID' ? (
                <div className="p-5 rounded-2xl bg-emerald-500/15 border border-emerald-400/40 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-500 text-slate-950 font-black text-2xl flex items-center justify-center mx-auto">
                    ✓
                  </div>
                  <h4 className="text-lg font-black text-white">
                    ชำระเงิน ฿{session.expectedAmount.toFixed(2)} สำเร็จ!
                  </h4>
                  <p className="text-xs text-emerald-300 font-mono">ใบเสร็จ: {session.receiptNo}</p>
                </div>
              ) : (
                <>
                  <div className="p-3 bg-white rounded-2xl shadow-lg w-48 h-48 mx-auto flex items-center justify-center">
                    {loading ? (
                      <span className="text-xs font-bold text-slate-600 animate-pulse">กำลังสร้าง QR...</span>
                    ) : qrDataUrl ? (
                      <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain" />
                    ) : (
                      <span className="text-xs text-slate-400">ไม่พบ QR</span>
                    )}
                  </div>

                  <div>
                    <div className="text-3xl font-black text-emerald-400 font-mono">
                      ฿{session ? session.expectedAmount.toFixed(2) : amount.toFixed(2)}
                    </div>
                    <p className="text-xs font-bold text-white mt-1">
                      พร้อมเพย์ 063-604-0550 (นาย กฤษกร บัวอินทร์)
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">{statusMsg}</p>
                  </div>
                </>
              )}
            </div>

            {/* Sticky Footer */}
            <div className="shrink-0 px-5 py-3 bg-slate-950 border-t border-white/10 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
              >
                ปิด
              </button>

              {session?.status !== 'PAID' && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={checkingEmail}
                    onClick={handleManualImapCheck}
                    className="px-3 py-2 rounded-xl bg-cyan-500/20 border border-cyan-400/40 text-cyan-200 text-xs font-bold cursor-pointer disabled:opacity-50"
                  >
                    🔍 เช็ค Gmail
                  </button>
                  <button
                    type="button"
                    disabled={checkingEmail}
                    onClick={handleSimulateBankEmail}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black cursor-pointer disabled:opacity-50"
                  >
                    ✅ ยืนยันเงินเข้า
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};
