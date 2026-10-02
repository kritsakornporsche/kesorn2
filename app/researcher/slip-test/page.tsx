'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';

interface SlipVerificationData {
  success: boolean;
  readSuccess?: boolean;
  reason?: string;
  message?: string;
  transRef?: string;
  amount?: number;
  expectedAmount?: number;
  dateTime?: string;
  sender?: {
    name?: string;
    account?: string;
    bank?: string;
  };
  receiver?: {
    name?: string;
    account?: string;
    bank?: string;
  };
  fromBank?: string;
  toBank?: string;
  durationMs?: number;
  testedAt?: string;
  rawData?: any;
}

interface TestHistoryItem {
  id: string;
  testedAt: string;
  fileName: string;
  fileSize: string;
  amount?: number;
  senderName?: string;
  receiverName?: string;
  transRef?: string;
  success: boolean;
  durationMs: number;
}

export default function ResearcherSlipTestPage() {
  const [slipImage, setSlipImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [fileSize, setFileSize] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<SlipVerificationData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [history, setHistory] = useState<TestHistoryItem[]>([]);
  const [showRawJson, setShowRawJson] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);

  // Optional Validation Controls
  const [validationMode, setValidationMode] = useState<'open' | 'strict'>('open');
  const [expectedAmount, setExpectedAmount] = useState<string>('3500');
  const [expectedReceiverName, setExpectedReceiverName] = useState<string>('หอพักเกษร 2');
  const [expectedPromptPay, setExpectedPromptPay] = useState<string>('0636040550');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Paste image directly from clipboard (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [validationMode, expectedAmount, expectedReceiverName, expectedPromptPay]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  };

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (PNG, JPG, JPEG, WEBP)');
      return;
    }

    setFileName(file.name);
    setFileSize(formatFileSize(file.size));
    setError(null);
    setResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = e.target?.result as string;
      setSlipImage(base64);
      // Automatically run test once image is chosen
      executeVerification(base64, file.name, formatFileSize(file.size));
    };
    reader.readAsDataURL(file);
  };

  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const onFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  // Trigger test with custom simulation slip
  const handleLoadMockSlip = (type: 'valid' | 'mismatch') => {
    const rawPixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const marker = type === 'valid' ? 'TEST_MOCK_VALID_SLIP' : 'TEST_MOCK_INVALID_SLIP';
    const mockDataUrl = `data:image/png;base64,${rawPixel}#${marker}`;
    setSlipImage(mockDataUrl);
    setFileName(type === 'valid' ? 'mock_valid_slip.png (สลิปจำลองถูกต้อง)' : 'mock_mismatch_slip.png (สลิปยอดไม่ตรง)');
    setFileSize('1.2 KB (Simulation)');
    setError(null);
    setResult(null);

    executeVerification(
      mockDataUrl, 
      type === 'valid' ? 'mock_valid_slip.png' : 'mock_mismatch_slip.png',
      '1.2 KB',
      type === 'mismatch' ? 99999 : undefined
    );
  };

  const executeVerification = async (
    imageData: string, 
    fName: string = fileName, 
    fSize: string = fileSize,
    forcedExpectedAmount?: number
  ) => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const payload: any = { slipData: imageData };

      if (forcedExpectedAmount !== undefined) {
        payload.expectedAmount = forcedExpectedAmount;
      } else if (validationMode === 'strict') {
        const amt = Number(expectedAmount);
        if (!isNaN(amt) && amt > 0) {
          payload.expectedAmount = amt;
        }
        payload.expectedReceiver = {
          name: expectedReceiverName || undefined,
          promptpay: expectedPromptPay || undefined,
          dormName: expectedReceiverName || undefined,
        };
      }

      const res = await fetch('/api/researcher/slip-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok && !json.data) {
        throw new Error(json.message || `HTTP ${res.status}: ไม่สามารถตรวจสอบสลิปได้`);
      }

      const responseData: SlipVerificationData = json.data || json;
      setResult(responseData);

      // Add to session history
      const historyItem: TestHistoryItem = {
        id: 'test_' + Date.now(),
        testedAt: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        fileName: fName || 'slip_image.png',
        fileSize: fSize || '-',
        amount: responseData.amount,
        senderName: responseData.sender?.name,
        receiverName: responseData.receiver?.name,
        transRef: responseData.transRef,
        success: responseData.success,
        durationMs: responseData.durationMs || 0,
      };

      setHistory(prev => [historyItem, ...prev.slice(0, 9)]);

    } catch (err: any) {
      console.error(err);
      setError(err.message || 'เกิดข้อผิดพลาดในการส่งข้อมูลสลิปไปยัง SlipOK');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return 'ไม่ระบุ';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('th-TH', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }) + ' น.';
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      {/* 1. Header & Navigation Breadcrumb */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-xs font-bold text-cyan-400">
            <Link href="/researcher" className="hover:underline">แดชบอร์ดงานวิจัย</Link>
            <span>/</span>
            <span className="text-white/60">โมดูลทดสอบ SlipOK Sandbox</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              SlipOK API v2 Online
            </span>
            <span className="px-2.5 py-1 rounded-lg text-[11px] font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/40">
              Port: 77132
            </span>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span className="text-cyan-400">🧾</span>
              ทดสอบระบบอ่านสลิปธนาคาร (SlipOK Sandbox)
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              เครื่องมือสำหรับผู้วิจัยและผู้พัฒนาระบบ: อัปโหลดรูปสลิปเพื่อตรวจสอบข้อมูล <span className="text-cyan-300 font-semibold">ผู้โอน</span>, <span className="text-cyan-300 font-semibold">ผู้รับเงิน</span>, <span className="text-cyan-300 font-semibold">ยอดเงิน</span>, และ <span className="text-cyan-300 font-semibold">วัน-เวลาทำรายการ</span> แบบเรียลไทม์
            </p>
          </div>
        </div>
      </div>

      {/* 2. Top Controls & Mode Switcher */}
      <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider">โหมดการทดสอบ:</span>
            <div className="inline-flex p-1 rounded-xl bg-slate-950 border border-white/10">
              <button
                type="button"
                onClick={() => setValidationMode('open')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  validationMode === 'open'
                    ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🔍 โหมดอิสระ (Open Inspection)
              </button>
              <button
                type="button"
                onClick={() => setValidationMode('strict')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  validationMode === 'strict'
                    ? 'bg-cyan-500 text-slate-950 shadow-md font-extrabold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                🛡️ โหมดตรวจตรงหอพัก (Strict Dorm Match)
              </button>
            </div>
          </div>

            {/* Quick Mock Slips */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">ตัวอย่างสลิปทดสอบ:</span>
            <button
              id="btn-mock-valid"
              type="button"
              onClick={() => handleLoadMockSlip('valid')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-cyan-950/60 hover:bg-cyan-900/60 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>🧪 สลิปจำลองถูกต้อง</span>
            </button>
            <button
              id="btn-mock-mismatch"
              type="button"
              onClick={() => handleLoadMockSlip('mismatch')}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-500/30 transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span>⚠️ สลิปยอดไม่ตรง</span>
            </button>
          </div>
        </div>

        {/* Strict Mode Configuration Inputs */}
        {validationMode === 'strict' && (
          <div className="pt-3 border-t border-white/5 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                ยอดเงินที่ต้องตรง (บาท):
              </label>
              <input
                type="number"
                value={expectedAmount}
                onChange={(e) => setExpectedAmount(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="เช่น 3500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                ชื่อบัญชีหอพักที่ต้องตรง:
              </label>
              <input
                type="text"
                value={expectedReceiverName}
                onChange={(e) => setExpectedReceiverName(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="หอพักเกษร 2"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-400 mb-1">
                พร้อมเพย์หอพักที่ต้องตรง:
              </label>
              <input
                type="text"
                value={expectedPromptPay}
                onChange={(e) => setExpectedPromptPay(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-xs text-white focus:outline-none focus:border-cyan-500"
                placeholder="0636040550"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. Main Sandbox Workspace (Split View) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Upload Dropzone & Slip Preview (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-3xl bg-slate-900/90 border border-white/10 shadow-2xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
                <span>📤</span> อัปโหลดรูปสลิป
              </h2>
              {slipImage && (
                <button
                  type="button"
                  onClick={() => {
                    setSlipImage(null);
                    setResult(null);
                    setError(null);
                    setFileName('');
                    setFileSize('');
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                >
                  ✕ ล้างรูปภาพ
                </button>
              )}
            </div>

            {/* Drag & Drop Box */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all duration-200 min-h-[220px] flex flex-col items-center justify-center ${
                isDragging
                  ? 'border-cyan-400 bg-cyan-950/30 scale-[1.01]'
                  : 'border-white/15 hover:border-cyan-500/50 bg-slate-950/60 hover:bg-slate-950/80'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={onFileInputChange}
                className="hidden"
              />

              {slipImage ? (
                <div className="space-y-3 w-full">
                  <div className="relative max-h-72 mx-auto overflow-hidden rounded-xl border border-white/10 bg-black/40">
                    <img
                      src={slipImage}
                      alt="Slip preview"
                      className="w-full h-auto object-contain max-h-72 mx-auto"
                    />
                  </div>
                  <div className="text-xs text-slate-300 font-mono truncate px-2">
                    {fileName} ({fileSize})
                  </div>
                  <p className="text-[11px] text-cyan-400">
                    คลิกเพื่อเปลี่ยนรูป หรือลากรูปใหม่มาวาง
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-2xl flex items-center justify-center mx-auto shadow-inner">
                    📁
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">
                      ลากไฟล์สลิปมาวางที่นี่
                    </p>
                    <p className="text-xs text-slate-400 mt-1">
                      หรือคลิกเพื่อเลือกไฟล์รูปภาพจากอุปกรณ์
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono text-cyan-300/80 bg-cyan-950/40 border border-cyan-800/30">
                    <span>💡 รองรับการกด Ctrl + V เพื่อ Paste รูปสลิปทันที</span>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Simulation Shortcut below Dropzone */}
            {!slipImage && (
              <div className="pt-2 flex flex-col gap-2">
                <p className="text-[11px] text-slate-400 font-semibold text-center">
                  ไม่มีไฟล์สลิปในเครื่อง? ทดสอบด้วยสลิปจำลอง:
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    id="btn-quick-mock-valid"
                    type="button"
                    onClick={() => handleLoadMockSlip('valid')}
                    className="py-2 px-3 rounded-xl text-xs font-bold bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>🧪 สลิปจำลองถูกต้อง</span>
                  </button>
                  <button
                    id="btn-quick-mock-mismatch"
                    type="button"
                    onClick={() => handleLoadMockSlip('mismatch')}
                    className="py-2 px-3 rounded-xl text-xs font-bold bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-300 transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <span>⚠️ สลิปยอดไม่ตรง</span>
                  </button>
                </div>
              </div>
            )}

            {/* Action Button */}
            {slipImage && (
              <button
                type="button"
                disabled={loading}
                onClick={() => executeVerification(slipImage)}
                className={`w-full py-3 px-4 rounded-xl text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg transition-all ${
                  loading
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 shadow-cyan-500/25 active:scale-[0.99]'
                }`}
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    <span>กำลังส่งตรวจกับ SlipOK API...</span>
                  </>
                ) : (
                  <>
                    <span>⚡ ตรวจสอบสลิปอีกครั้ง</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Right Column: Verification Results & Analysis (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Loading Indicator */}
          {loading && (
            <div className="p-8 rounded-3xl bg-slate-900/90 border border-cyan-500/30 shadow-2xl flex flex-col items-center justify-center text-center space-y-4 animate-pulse">
              <div className="w-16 h-16 rounded-2xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-3xl">
                ⏳
              </div>
              <div>
                <h3 className="text-lg font-black text-white">กำลังถอดรหัสและวิเคราะห์สลิป...</h3>
                <p className="text-xs text-cyan-300 mt-1">
                  SlipOK กำลังอ่าน QR Code / PromptPay Payload และตรวจสอบความถูกต้องกับโครงข่ายธนาคาร
                </p>
              </div>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-6 rounded-2xl bg-rose-950/60 border border-rose-500/40 shadow-xl space-y-2">
              <div className="flex items-center gap-2 text-rose-300 font-bold text-sm">
                <span>⚠️</span>
                <span>เกิดข้อผิดพลาดในการตรวจสอบ</span>
              </div>
              <p className="text-xs text-rose-200/90 leading-relaxed font-mono">
                {error}
              </p>
            </div>
          )}

          {/* Initial State Prompt */}
          {!loading && !result && !error && (
            <div className="p-10 rounded-3xl bg-slate-900/60 border border-white/10 text-center space-y-4">
              <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-white/10 text-slate-400 text-3xl flex items-center justify-center mx-auto">
                🔎
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="text-base font-bold text-white">
                  พร้อมสำหรับการทดสอบสลิป
                </h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  เลือกรูปสลิปจากเครื่อง หรือคลิกปุ่ม <span className="text-cyan-300 font-semibold">"สลิปจำลองถูกต้อง"</span> ด้านบน เพื่อเริ่มวิเคราะห์ข้อมูลธุรกรรมทันที
                </p>
              </div>
            </div>
          )}

          {/* Successful or Detailed Result Display */}
          {result && (
            <div className="space-y-6">
              {/* Status Banner */}
              <div
                className={`p-6 rounded-3xl border shadow-2xl relative overflow-hidden transition-all ${
                  result.success
                    ? 'bg-gradient-to-br from-emerald-950/60 via-slate-900 to-slate-900 border-emerald-500/40 shadow-emerald-950/30'
                    : 'bg-gradient-to-br from-rose-950/60 via-slate-900 to-slate-900 border-rose-500/40 shadow-rose-950/30'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">
                      {result.success ? '✅' : '❌'}
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-white">
                          {result.success
                            ? 'สลิปถูกต้องตามมาตรฐานธนาคาร (Verified)'
                            : 'ผลการตรวจสอบไม่ผ่านเกณฑ์ (Verification Failed)'}
                        </h3>
                        {result.reason && !result.success && (
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            {result.reason}
                          </span>
                        )}
                      </div>
                      <p
                        className={`text-xs font-medium mt-1 leading-relaxed ${
                          result.success ? 'text-emerald-300' : 'text-rose-200'
                        }`}
                      >
                        {result.message || (result.success ? 'ตรวจสอบสำเร็จ' : 'ข้อมูลไม่ถูกต้อง')}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {result.readSuccess && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 flex items-center gap-1">
                        <span>✓</span>
                        <span>อ่านสลิปสำเร็จ 100%</span>
                      </span>
                    )}
                    {result.durationMs !== undefined && (
                      <span className="px-3 py-1 rounded-full text-[11px] font-mono bg-white/5 border border-white/10 text-slate-300">
                        ⏱️ {result.durationMs} ms
                      </span>
                    )}
                  </div>
                </div>

                {/* Bank to Bank Transfer Route — only when slip was actually decoded */}
                {result.readSuccess ? (
                  <div className="mt-4 pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-300 font-medium">
                      <span className="text-slate-400">🏛️ ธนาคารต้นทาง:</span>
                      <span className="font-bold text-cyan-300">{result.fromBank || result.sender?.bank || '-'}</span>
                      <span className="text-slate-500 font-bold">➔</span>
                      <span className="text-slate-400">ธนาคารปลายทาง:</span>
                      <span className="font-bold text-emerald-300">{result.toBank || result.receiver?.bank || '-'}</span>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      ยืนยันข้อมูลจากเครือข่ายธนาคารแห่งประเทศไทย
                    </span>
                  </div>
                ) : (
                  <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-950/40 border border-orange-500/30 text-xs">
                      <span className="text-lg shrink-0">📷</span>
                      <div>
                        <p className="font-bold text-orange-300">ไม่สามารถถอดรหัส QR Code / เชื่อมต่อธนาคารไม่ได้</p>
                        <p className="text-orange-200/80 mt-0.5">ระบบไม่ได้รับข้อมูลจาก SlipOK API อาจเกิดจาก: รูปไม่ชัด, QR Code เบลอ, หรือสลิปหมดอายุ (เกิน 3 วัน)</p>
                        <p className="text-orange-300/70 mt-1 font-mono">เหตุผล: {result.reason || result.message}</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 4 Core Pillars: ใครโอน -> หาใคร -> ยอดเท่าไหร่ -> เวลาไหน */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* 1. ผู้โอนเงิน (Sender) */}
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-cyan-400">
                      <span>👤</span> ใครโอน (ผู้โอนเงิน / Sender)
                    </span>
                    {result.sender?.bank && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 border border-cyan-800 text-cyan-300 font-mono">
                        {result.sender.bank}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-white">
                      {result.sender?.name || 'ไม่พบชื่อผู้โอน'}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      เลขบัญชี/พร้อมเพย์: <span className="text-slate-200">{result.sender?.account || '-'}</span>
                    </p>
                  </div>
                </div>

                {/* 2. ผู้รับเงิน (Receiver) */}
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-400 uppercase tracking-wider">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <span>🏢</span> โอนหาใคร (ผู้รับเงิน / Receiver)
                    </span>
                    {result.receiver?.bank && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 font-mono">
                        {result.receiver.bank}
                      </span>
                    )}
                  </div>
                  <div>
                    <p className="text-base font-extrabold text-white">
                      {result.receiver?.name || 'ไม่พบชื่อผู้รับ'}
                    </p>
                    <p className="text-xs text-slate-400 font-mono mt-1">
                      บัญชี/พร้อมเพย์: <span className="text-slate-200">{result.receiver?.account || '-'}</span>
                    </p>
                    {validationMode === 'strict' && expectedReceiverName && result.receiver?.name && !result.receiver.name.includes(expectedReceiverName) && (
                      <div className="text-[11px] text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 mt-2">
                        ⚠️ โอนไปที่บัญชีนี้ ไม่ตรงกับชื่อหอพักเป้าหมาย ({expectedReceiverName})
                      </div>
                    )}
                  </div>
                </div>

                {/* 3. ยอดเงินโอน (Amount) */}
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-2">
                  <span className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>💰</span> ยอดเงินโอน (Amount)
                  </span>
                  <div className="flex items-baseline gap-2">
                    <span className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">
                      ฿ {result.amount !== undefined ? result.amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '-'}
                    </span>
                    <span className="text-xs text-slate-400 font-bold">บาท (THB)</span>
                  </div>
                  {((result.expectedAmount && result.amount !== result.expectedAmount) || (validationMode === 'strict' && expectedAmount && result.amount !== Number(expectedAmount))) && (
                    <div className="text-[11px] text-rose-300 bg-rose-500/10 px-2.5 py-1 rounded-lg border border-rose-500/20 mt-1">
                      ⚠️ ยอดโอนไม่ตรงกับยอดที่ต้องชำระ (ยอดที่คาดหวัง: ฿{Number(result.expectedAmount || expectedAmount).toLocaleString('th-TH', { minimumFractionDigits: 2 })})
                    </div>
                  )}
                </div>

                {/* 4. วัน-เวลาที่ทำรายการ (Date & Time) */}
                <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-2">
                  <span className="text-xs font-bold text-purple-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>⏱️</span> เวลาไหน (วัน-เวลาทำรายการ)
                  </span>
                  <div>
                    <p className="text-sm font-bold text-white">
                      {formatDateTime(result.dateTime)}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono mt-1 truncate">
                      Raw timestamp: {result.dateTime || '-'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transaction Reference & Security Details */}
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-white/10 shadow-lg space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🔖</span> รหัสอ้างอิงธุรกรรมธนาคาร (Transaction Ref)
                  </span>
                  {result.transRef && (
                    <button
                      type="button"
                      onClick={() => copyToClipboard(result.transRef || '')}
                      className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white/5 hover:bg-white/10 text-cyan-300 border border-white/10 transition-all flex items-center gap-1"
                    >
                      <span>{copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอก'}</span>
                    </button>
                  )}
                </div>
                <div className="p-3 rounded-xl bg-slate-950 font-mono text-xs text-cyan-300 break-all border border-white/5">
                  {result.transRef || 'ไม่พบรหัสอ้างอิงธุรกรรม'}
                </div>
              </div>

              {/* Raw JSON Data Accordion (Researcher Feature) */}
              <div className="rounded-2xl bg-slate-900/90 border border-white/10 overflow-hidden shadow-lg">
                <button
                  type="button"
                  onClick={() => setShowRawJson(prev => !prev)}
                  className="w-full p-4 text-left flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white hover:bg-white/5 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span>💻</span>
                    <span>ข้อมูลดิบจาก API (Raw SlipOK JSON Response)</span>
                  </span>
                  <span className="text-slate-400">
                    {showRawJson ? '▲ ซ่อน' : '▼ แสดง'}
                  </span>
                </button>

                {showRawJson && (
                  <div className="p-4 border-t border-white/10 bg-black/50 overflow-x-auto max-h-96 text-xs font-mono text-emerald-400 leading-relaxed">
                    <pre>{JSON.stringify(result.rawData || result, null, 2)}</pre>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. Session Test History Log */}
      {history.length > 0 && (
        <div className="p-6 rounded-3xl bg-slate-900/80 border border-white/10 shadow-2xl space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <span>📜</span> ประวัติการทดสอบในเซสชันนี้ ({history.length} รายการ)
            </h2>
            <button
              type="button"
              onClick={() => setHistory([])}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              ล้างประวัติ
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400">
                  <th className="pb-3 font-semibold">เวลา</th>
                  <th className="pb-3 font-semibold">ชื่อไฟล์</th>
                  <th className="pb-3 font-semibold">ผู้โอน</th>
                  <th className="pb-3 font-semibold">ผู้รับ</th>
                  <th className="pb-3 font-semibold text-right">ยอดเงิน</th>
                  <th className="pb-3 font-semibold text-center">สถานะ</th>
                  <th className="pb-3 font-semibold text-right">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 font-mono">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-3 text-slate-400">{item.testedAt}</td>
                    <td className="py-3 text-slate-200 truncate max-w-[150px]">{item.fileName}</td>
                    <td className="py-3 text-cyan-300 font-sans">{item.senderName || '-'}</td>
                    <td className="py-3 text-emerald-300 font-sans">{item.receiverName || '-'}</td>
                    <td className="py-3 text-right text-white font-bold">
                      {item.amount !== undefined ? `฿${item.amount.toLocaleString('th-TH')}` : '-'}
                    </td>
                    <td className="py-3 text-center">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          item.success
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                        }`}
                      >
                        {item.success ? 'ผ่าน' : 'ไม่ผ่าน'}
                      </span>
                    </td>
                    <td className="py-3 text-right text-slate-400">{item.durationMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. Researcher Notes & Academic Context */}
      <div className="p-6 rounded-2xl bg-cyan-950/20 border border-cyan-500/20 text-xs text-slate-300 space-y-2 leading-relaxed">
        <h4 className="font-bold text-cyan-300 flex items-center gap-2">
          <span>💡</span> บันทึกทางวิชาการและการทำงานของระบบตรวจสอบสลิป (Thesis Technical Notes)
        </h4>
        <p>
          ระบบเชื่อมต่อกับ <strong>SlipOK API Gateway</strong> โดยส่งข้อมูลรูปภาพสลิปที่เข้ารหัส Base64 ไปยังโครงข่ายตรวจสอบสลิปธนาคารแห่งประเทศไทย (PromptPay Standard)
          เพื่อถอดรหัส QR Code (Thai QR Payment EMVCo) และดึงข้อมูลจริงจากฐานข้อมูลธนาคารต้นทางและปลายทาง
          ช่วยตัดปัญหาการแนบสลิปปลอม, สลิปตัดต่อตัวเลข, หรือสลิปที่นำมาวนใช้ซ้ำ (Double-spending attack) ได้ 100%
        </p>
      </div>
    </div>
  );
}
