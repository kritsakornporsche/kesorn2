'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import { DynamicBillQrPaymentButton } from '@/components/features/DynamicBillQrModal';
import type { DynamicPaymentSession } from '@/lib/features/dynamic-bill-qr';

const QUICK_AMOUNTS = [1, 1.01, 2, 5, 10, 3500];

const ROOM_LIST = [
  { room: '101', tenant: 'นายธนกฤต วงศ์สวัสดิ์' },
  { room: '102', tenant: 'นางสาวพิมพ์ชนก สุขเกษม' },
  { room: '104', tenant: 'นายกฤษกร บัวอินทร์' },
  { room: '108', tenant: 'นางสาวกมลชนก ศรีวิชัย' },
  { room: '205', tenant: 'นายศุภณัฐ อินทร์แก้ว' },
];

export default function Module2DynamicQrLabPage() {
  const [amountInput, setAmountInput] = useState<string>('1.00');
  const [selectedRoom, setSelectedRoom] = useState<string>('104');
  const [tenantName, setTenantName] = useState<string>('นายกฤษกร บัวอินทร์');
  const [enableSatang, setEnableSatang] = useState<boolean>(true);

  const [session, setSession] = useState<DynamicPaymentSession | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loadingQr, setLoadingQr] = useState<boolean>(false);

  const [autoPoll, setAutoPoll] = useState<boolean>(true);
  const [checking, setChecking] = useState<boolean>(false);
  const [status, setStatus] = useState<{ type: 'info' | 'success' | 'error'; text: string }>({
    type: 'info',
    text: 'พร้อมรับโอนเข้าพร้อมเพย์ 063-604-0550 (นาย กฤษกร บัวอินทร์ • ธนาคารกรุงไทย)',
  });

  const createQr = useCallback(
    async (amtVal?: number, satangVal?: boolean, roomVal?: string, tenantVal?: string) => {
      setLoadingQr(true);
      const amt = amtVal !== undefined ? amtVal : parseFloat(amountInput) || 1;
      const satang = satangVal !== undefined ? satangVal : enableSatang;
      const room = roomVal !== undefined ? roomVal : selectedRoom;
      const tenant = tenantVal !== undefined ? tenantVal : tenantName;

      try {
        const qs = new URLSearchParams({
          amount: String(amt),
          roomNumber: room,
          tenantName: tenant,
          billTitle: `ค่าเช่าห้อง ${room}`,
          enableSatang: String(satang),
        });
        const res = await fetch(`/api/features/dynamic-qr?${qs.toString()}`);
        const json = await res.json();
        if (json.success) {
          setSession(json.session);
          setQrDataUrl(json.qrDataUrl);
          setStatus({
            type: 'info',
            text: `ล็อกยอดเฉพาะบิลห้อง ${room}: ฿${json.session.expectedAmount.toFixed(2)} (ไม่ซ้ำกับห้องอื่น)`,
          });
        }
      } catch (err: any) {
        setStatus({ type: 'error', text: err.message || 'สร้าง QR ไม่สำเร็จ' });
      } finally {
        setLoadingQr(false);
      }
    },
    [amountInput, enableSatang, selectedRoom, tenantName]
  );

  useEffect(() => {
    createQr(1, true, '104', 'นายกฤษกร บัวอินทร์');
  }, []);

  // Auto-poll Gmail & Webhook status every 5 seconds when enabled
  useEffect(() => {
    if (!autoPoll || !session || session.status !== 'PENDING') return;
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
            setStatus({
              type: 'success',
              text: `อนุมัติสำเร็จ! ดักจับยอดโอน ฿${json.session.expectedAmount.toFixed(2)} จาก LINE Krungthai Connext แล้ว`,
            });
          }
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [autoPoll, session]);

  const checkGmailNow = async () => {
    if (!session) return;
    setChecking(true);
    setStatus({ type: 'info', text: 'กำลังเช็คแจ้งเตือน LINE (Krungthai Connext) ในเซิร์ฟเวอร์...' });
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
      setStatus({
        type: json.matched ? 'success' : json.connected ? 'info' : 'error',
        text: json.message || 'เช็คแจ้งเตือนเสร็จสิ้น',
      });
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message });
    } finally {
      setChecking(false);
    }
  };

  const simulateTransfer = async (testAmount: number) => {
    if (!session) return;
    setChecking(true);
    try {
      const res = await fetch('/api/features/dynamic-qr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_bank_email',
          sessionId: session.sessionId,
          simulatedAmount: testAmount,
          fallbackAmount: session.expectedAmount,
          fallbackRoom: session.roomNumber,
        }),
      });
      const json = await res.json();
      if (json.session) setSession(json.session);
      setStatus({
        type: json.matched ? 'success' : 'error',
        text: json.matched
          ? `อนุมัติอัตโนมัติสำเร็จ! (ยอดโอน ฿${testAmount.toFixed(2)} เข้ากรุงไทย 063-604-0550)`
          : `ปฏิเสธอัตโนมัติ: ยอดโอน ฿${testAmount.toFixed(2)} ไม่ตรงกับ QR (฿${session.expectedAmount.toFixed(2)})`,
      });
    } catch (e: any) {
      setStatus({ type: 'error', text: e.message });
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      <ResearcherLabNavBar />

      {/* Compact Title Bar */}
      <div className="flex items-center justify-between gap-3 flex-wrap bg-slate-900 border border-white/10 rounded-2xl px-5 py-4">
        <div>
          <h1 className="text-lg sm:text-xl font-black text-white">
            📲 ระบบชำระเงินและอนุมัติบิลอัตโนมัติ (Dynamic QR • Zero-Slip)
          </h1>
          <p className="text-xs text-slate-400">
            โอนตรงเข้าพร้อมเพย์ 063-604-0550 (นาย กฤษกร บัวอินทร์ • ธนาคารกรุงไทย) เงินเข้าบัญชีทันที 100%
          </p>
        </div>
        <DynamicBillQrPaymentButton
          roomNumber={selectedRoom}
          tenantName={tenantName}
          amount={session ? session.baseAmount : parseFloat(amountInput) || 1}
          enableSatang={enableSatang}
          onPaid={(paidSes) => {
            setSession(paidSes);
            setStatus({
              type: 'success',
              text: `อนุมัติสำเร็จ! ยอด ฿${paidSes.expectedAmount.toFixed(2)}`,
            });
          }}
        />
      </div>

      {/* Main 2-Column Layout: Left = All Controls in One Place | Right = QR / Receipt */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-stretch">
        {/* LEFT: Unified Control Panel (7 Cols) */}
        <div className="md:col-span-7 bg-slate-900 border border-white/10 rounded-3xl p-5 sm:p-6 flex flex-col justify-between space-y-5">
          <div className="space-y-5">
            <h2 className="text-sm font-black text-cyan-400 uppercase tracking-wider border-b border-white/10 pb-2.5">
              🎛️ แผงควบคุมการตั้งค่าและทดสอบ (All-in-One Control)
            </h2>

            {/* 1. Room & Amount Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">ห้องพัก</label>
                <select
                  value={selectedRoom}
                  onChange={(e) => {
                    const rm = e.target.value;
                    const found = ROOM_LIST.find((r) => r.room === rm);
                    const tName = found ? found.tenant : tenantName;
                    setSelectedRoom(rm);
                    setTenantName(tName);
                    createQr(parseFloat(amountInput) || 1, enableSatang, rm, tName);
                  }}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/15 text-white text-xs font-bold"
                >
                  {ROOM_LIST.map((r) => (
                    <option key={r.room} value={r.room}>
                      ห้อง {r.room} ({r.tenant})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-300 block mb-1">ยอดเงินทดสอบ (บาท)</label>
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={amountInput}
                    onChange={(e) => setAmountInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-amber-400/40 text-white font-mono font-black text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => createQr(parseFloat(amountInput) || 1, enableSatang, selectedRoom, tenantName)}
                    className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shrink-0 cursor-pointer"
                  >
                    🎲 สุ่ม QR ใหม่
                  </button>
                </div>
              </div>
            </div>

            {/* 2. Quick Amount Pills + Satang Switch */}
            <div className="space-y-2.5">
              <div className="flex flex-wrap gap-1.5">
                {QUICK_AMOUNTS.map((val) => {
                  const active = Math.abs((parseFloat(amountInput) || 0) - val) < 0.001;
                  return (
                    <button
                      key={val}
                      type="button"
                      onClick={() => {
                        setAmountInput(val.toFixed(2));
                        createQr(val, enableSatang, selectedRoom, tenantName);
                      }}
                      className={`px-3 py-1.5 rounded-xl text-xs font-black border cursor-pointer transition-all ${
                        active
                          ? 'bg-amber-400 text-slate-950 border-amber-300'
                          : 'bg-slate-950 text-slate-300 border-white/10 hover:bg-slate-800'
                      }`}
                    >
                      ฿{val.toLocaleString()}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <label className="flex items-center gap-2 text-xs text-amber-300 font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={enableSatang}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setEnableSatang(checked);
                      createQr(parseFloat(amountInput) || 1, checked, selectedRoom, tenantName);
                    }}
                    className="w-4 h-4 rounded"
                  />
                  <span>🎲 สุ่มเศษสตางค์รายบิลไม่ซ้ำกัน (ป้องกันโอนเข้าห้องคนอื่น)</span>
                </label>

                <label className="flex items-center gap-2 text-xs text-cyan-300 font-bold cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={autoPoll}
                    onChange={(e) => setAutoPoll(e.target.checked)}
                    className="w-4 h-4 rounded"
                  />
                  <span>ดักจับ LINE ในเซิร์ฟเวอร์อัตโนมัติ (ทุก 3 วิ)</span>
                </label>
              </div>
            </div>

            {/* 3. Verification & Simulation Actions */}
            <div className="pt-3 border-t border-white/10 space-y-2.5">
              <span className="text-xs font-bold text-slate-400 block">
                ตรวจสอบยอดเงินเข้า / อนุมัติรายการ:
              </span>

              <button
                type="button"
                disabled={checking || !session}
                onClick={checkGmailNow}
                className="w-full py-2.5 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/40 text-cyan-200 font-black text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <span>💬</span>
                <span>
                  {checking
                    ? 'กำลังเช็คแจ้งเตือน LINE ในเซิร์ฟเวอร์...'
                    : `เช็คแจ้งเตือน LINE (Krungthai Connext) ตอนนี้ (ยอด ฿${session ? session.expectedAmount.toFixed(2) : '1.00'})`}
                </span>
              </button>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  disabled={checking || !session}
                  onClick={() => simulateTransfer(session?.expectedAmount || 1)}
                  className="py-2.5 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer disabled:opacity-50"
                >
                  ✅ ยืนยันเงินเข้าตรงยอด (อนุมัติทันที)
                </button>
                <button
                  type="button"
                  disabled={checking || !session}
                  onClick={() => simulateTransfer(0.25)}
                  className="py-2.5 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/40 text-rose-200 font-bold text-xs cursor-pointer disabled:opacity-50"
                >
                  ❌ ทดสอบโอนยอดไม่ตรง
                </button>
              </div>
            </div>
          </div>

          {/* Compact Status Bar inside Control Panel */}
          <div
            className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center gap-2 ${
              status.type === 'success'
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : status.type === 'error'
                ? 'bg-rose-500/15 border-rose-400/40 text-rose-300'
                : 'bg-slate-950 border-white/10 text-slate-300'
            }`}
          >
            <span>{status.type === 'success' ? '✅' : status.type === 'error' ? '⚠️' : '📡'}</span>
            <span className="truncate">{status.text}</span>
          </div>
        </div>

        {/* RIGHT: Dynamic QR & Instant Receipt Card (5 Cols) */}
        <div className="md:col-span-5 bg-slate-900 border border-white/10 rounded-3xl p-6 flex flex-col items-center justify-center text-center">
          {session?.status === 'PAID' ? (
            <div className="w-full space-y-4 animate-in zoom-in-95">
              <div className="w-16 h-16 rounded-full bg-emerald-500 text-slate-950 font-black text-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/30">
                ✓
              </div>
              <div>
                <span className="px-3 py-0.5 rounded-full text-[10px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  PAID • อนุมัติอัตโนมัติสำเร็จ
                </span>
                <h3 className="text-2xl font-black text-white mt-2">
                  ฿{session.expectedAmount.toFixed(2)}
                </h3>
                <p className="text-xs text-slate-400">
                  ห้อง {session.roomNumber} • {session.tenantName}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-slate-950 border border-white/10 text-left text-xs font-mono space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-400">ใบเสร็จ:</span>
                  <span className="text-emerald-400 font-bold">{session.receiptNo}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">รหัสอ้างอิง:</span>
                  <span className="text-cyan-300 font-bold">{session.matchedEmail?.transRef}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">เข้าบัญชี:</span>
                  <span className="text-amber-300 font-bold">063-604-0550 (กรุงไทย)</span>
                </div>
              </div>

              {session.screenshotDataUrl && (
                <div className="p-3 rounded-2xl bg-slate-950 border border-white/10 text-left space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-300 font-bold">📷 หลักฐานเงินเข้า (แคปหน้าจอ):</span>
                    <a
                      href={session.screenshotDataUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[11px] text-sky-400 hover:text-sky-300 font-bold underline"
                    >
                      เปิดดูภาพเต็ม ↗
                    </a>
                  </div>
                  <div className="max-h-48 overflow-hidden rounded-xl border border-white/10 bg-black/60 flex items-center justify-center">
                    <img
                      src={session.screenshotDataUrl}
                      alt="หลักฐานเงินเข้า"
                      className="max-h-48 w-auto object-contain"
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={() => createQr(parseFloat(amountInput) || 1, enableSatang, selectedRoom, tenantName)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold cursor-pointer"
              >
                🎲 สร้าง QR รายการใหม่ (สุ่มสตางค์ใหม่)
              </button>
            </div>
          ) : (
            <div className="w-full space-y-4 flex flex-col items-center">
              <div className="flex items-center justify-between w-full text-xs">
                <span className="font-bold text-slate-300">
                  ห้อง {session?.roomNumber || selectedRoom} ({session?.tenantName || tenantName})
                </span>
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-amber-500/20 text-amber-300 border border-amber-400/30">
                  ล็อกยอดเฉพาะบิลนี้
                </span>
              </div>

              <div className="p-3 bg-white rounded-2xl shadow-xl w-52 h-52 flex items-center justify-center">
                {loadingQr ? (
                  <span className="text-xs font-bold text-slate-600 animate-pulse">กำลังสร้าง QR...</span>
                ) : qrDataUrl ? (
                  <img src={qrDataUrl} alt="PromptPay QR" className="w-full h-full object-contain" />
                ) : (
                  <span className="text-xs text-slate-400">ไม่พบ QR</span>
                )}
              </div>

              <div className="w-full p-3.5 rounded-2xl bg-slate-950 border border-white/10 space-y-1">
                <span className="text-[11px] text-slate-400 block">ยอดโอนตาม QR (ห้ามแก้ยอดตอนโอน)</span>
                <div className="text-3xl font-black text-emerald-400 font-mono">
                  ฿{session ? session.expectedAmount.toFixed(2) : '1.00'}
                </div>
                {session && session.satangTag > 0 && (
                  <div className="text-[11px] font-bold text-amber-300">
                    🔒 สตางค์อ้างอิงบิลนี้: +0.{String(session.satangTag).padStart(2, '0')} บ. (ไม่ซ้ำห้องอื่น)
                  </div>
                )}
                <p className="text-xs font-bold text-white pt-1">
                  พร้อมเพย์ <span className="text-cyan-300 font-mono">063-604-0550</span>
                </p>
                <p className="text-[11px] text-slate-400">
                  นาย กฤษกร บัวอินทร์ (ธนาคารกรุงไทย)
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
