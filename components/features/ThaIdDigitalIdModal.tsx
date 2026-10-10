'use client';

import React, { useState } from 'react';
import type { ThaIdVerifiedPayload } from '@/lib/features/thaid-digital-id';

interface ThaIdDigitalIdButtonProps {
  onVerified: (data: ThaIdVerifiedPayload) => void;
  compact?: boolean;
}

export const ThaIdDigitalIdButton: React.FC<ThaIdDigitalIdButtonProps> = ({
  onVerified,
  compact = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [loadingSession, setLoadingSession] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [verifyStep, setVerifyStep] = useState<number>(0);
  const [sessionData, setSessionData] = useState<any>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('citizen-up-student');
  const [useCustomInput, setUseCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [verifiedData, setVerifiedData] = useState<ThaIdVerifiedPayload | null>(null);

  const openThaIdModal = async () => {
    setIsOpen(true);
    setLoadingSession(true);
    setVerifyStep(0);
    try {
      const res = await fetch('/api/features/thaid');
      const json = await res.json();
      if (json.success) {
        setSessionData(json.session);
        setQrDataUrl(json.qrDataUrl);
        setProfiles(json.profiles || []);
      }
    } catch (err) {
      console.error('Failed to init ThaID session:', err);
    } finally {
      setLoadingSession(false);
    }
  };

  const handleConfirmThaIdCallback = async () => {
    setVerifying(true);
    setVerifyStep(1);

    await new Promise((r) => setTimeout(r, 350));
    setVerifyStep(2);

    await new Promise((r) => setTimeout(r, 400));
    setVerifyStep(3);

    try {
      const res = await fetch('/api/features/thaid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: sessionData?.session_id,
          state: sessionData?.state,
          profileId: selectedProfileId,
          customName: useCustomInput ? customName : undefined,
          customAddress: useCustomInput ? customAddress : undefined,
        }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        await new Promise((r) => setTimeout(r, 300));
        setVerifyStep(4);
        setVerifiedData(json.data);
        onVerified(json.data);
        setTimeout(() => {
          setIsOpen(false);
          setVerifying(false);
        }, 450);
      } else {
        alert(json.message || 'ไม่สามารถยืนยันตัวตนผ่าน ThaID ได้');
        setVerifying(false);
      }
    } catch (e: any) {
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ ThaID: ' + e.message);
      setVerifying(false);
    }
  };

  return (
    <>
      {/* Trigger Card / Button */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#111c44] via-[#16255c] to-[#1e327a] border border-amber-400/30 shadow-lg space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-amber-400 text-slate-950 font-black flex flex-col items-center justify-center shadow-md shrink-0 leading-none">
              <span className="text-[10px] tracking-tighter">D.DOPA</span>
              <span className="text-xs font-extrabold">ThaID</span>
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs sm:text-sm font-black text-white">
                  ยืนยันตัวตนดิจิทัลผ่านแอป ThaID (OAuth 2.0 / OpenID)
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-amber-400/20 text-amber-300 border border-amber-400/30">
                  IAL 2.3 • PDPA Zero-ID
                </span>
              </div>
              {!compact && (
                <p className="text-[11px] text-blue-200/80 mt-0.5">
                  ดึงเฉพาะชื่อ-นามสกุลและที่อยู่ตามทะเบียนราษฎร์โดยตรงจากกรมการปกครอง (ไม่เก็บเลขบัตร 13 หลัก)
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={openThaIdModal}
            className="px-4 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-black text-xs shadow-md transition-all flex items-center gap-2 cursor-pointer active:scale-95 shrink-0"
          >
            <span>🇹🇭</span>
            <span>{verifiedData ? 'เชื่อมต่อ ThaID ใหม่' : 'เข้าสู่ระบบ / ดึงข้อมูลด้วย ThaID'}</span>
          </button>
        </div>

        {/* Verified Badge */}
        {verifiedData && (
          <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-400/30 flex items-center justify-between gap-2 flex-wrap text-xs text-emerald-300">
            <div className="flex items-center gap-2 font-bold">
              <span>✅</span>
              <span>
                ยืนยันตัวตนด้วย ThaID สำเร็จ: <strong className="text-white">{verifiedData.full_name_th}</strong> ({verifiedData.ial_level})
              </span>
            </div>
            <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-slate-950/60 text-amber-300 border border-amber-400/20">
              KYC Ref: {verifiedData.sub_pid_hash}
            </span>
          </div>
        )}
      </div>

      {/* Modal */}
      {isOpen && (
        <div className="fixed inset-0 z-[110] bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-amber-400/30 rounded-3xl max-w-3xl w-full overflow-hidden shadow-2xl my-6 text-slate-100">
            {/* Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-[#0f1a3d] via-[#172860] to-[#0f1a3d] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400 text-slate-950 font-black flex flex-col items-center justify-center text-xs leading-none">
                  <span className="text-[9px]">D.DOPA</span>
                  <span>ThaID</span>
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-black text-white">
                    ระบบพิสูจน์และยืนยันตัวตนทางดิจิทัล (D.DOPA ThaID OAuth 2.0)
                  </h3>
                  <p className="text-[11px] text-amber-300/90">
                    OpenID Connect (OIDC) + PKCE S256 • มาตรฐานความมั่นคงปลอดภัยระดับ IAL 2.3
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !verifying && setIsOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center text-xs font-bold cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Body */}
            <div className="p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
              {/* Left Column: QR Code & OAuth 2.0 PKCE Inspector */}
              <div className="md:col-span-5 flex flex-col items-center justify-between bg-slate-950/70 p-4 rounded-2xl border border-white/10 space-y-3">
                <div className="text-center space-y-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                    สแกนด้วยแอปพลิเคชัน ThaID
                  </span>
                  <p className="text-xs font-bold text-white pt-1">QR Code สำหรับยืนยันตัวตน</p>
                </div>

                <div className="p-3 bg-white rounded-2xl shadow-lg flex items-center justify-center w-48 h-48">
                  {loadingSession ? (
                    <span className="text-xs font-bold text-slate-600 animate-pulse">
                      กำลังสร้าง OAuth QR...
                    </span>
                  ) : qrDataUrl ? (
                    <img src={qrDataUrl} alt="ThaID OAuth QR" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-xs text-slate-400">QR Not Available</span>
                  )}
                </div>

                {/* OAuth 2.0 / PDPA Scope Inspector */}
                {sessionData && (
                  <div className="w-full p-3 rounded-xl bg-slate-900 border border-white/10 text-[10px] space-y-1 font-mono">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Session:</span>
                      <span className="text-amber-300 font-bold">{sessionData.session_id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">PKCE Method:</span>
                      <span className="text-emerald-400 font-bold">SHA-256 (S256)</span>
                    </div>
                    <div className="pt-1 border-t border-white/5 text-slate-300 font-sans">
                      <span className="text-emerald-400 font-bold block">
                        🛡️ Scope ที่ร้องขอ (PDPA Minimization):
                      </span>
                      <span>✓ ชื่อ-นามสกุล (`given_name`, `family_name`)</span>
                      <br />
                      <span>✓ ที่อยู่ทะเบียนบ้าน (`address`)</span>
                      <br />
                      <span className="text-rose-400 font-bold">
                        ✕ ไม่ร้องขอเลขบัตร 13 หลัก (`pid` Excluded)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* Right Column: Sandbox Consent & Handshake Simulator */}
              <div className="md:col-span-7 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-xs space-y-1">
                    <div className="font-black text-amber-300 flex items-center gap-1.5">
                      <span>📱</span>
                      <span>โหมดจำลองการกดอนุญาตบนแอปมือถือ ThaID (D.DOPA Sandbox)</span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      สำหรับการทดสอบและสาธิตงานวิจัย: เลือกโปรไฟล์พลเมืองจำลองด้านล่าง (หรือระบุชื่อ-ที่อยู่เอง) แล้วกดปุ่ม{' '}
                      <strong className="text-white">&quot;อนุญาตบนแอป ThaID&quot;</strong> เพื่อจำลองการส่ง Callback Token กลับมายังระบบหอพัก
                    </p>
                  </div>

                  {/* Mode Toggle */}
                  <div className="flex gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setUseCustomInput(false)}
                      className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                        !useCustomInput
                          ? 'bg-primary/20 border-primary text-white'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      👤 เลือกโปรไฟล์พลเมืองจำลอง
                    </button>
                    <button
                      type="button"
                      onClick={() => setUseCustomInput(true)}
                      className={`flex-1 py-2 rounded-xl font-bold border transition-all cursor-pointer ${
                        useCustomInput
                          ? 'bg-primary/20 border-primary text-white'
                          : 'bg-slate-950 border-white/10 text-slate-400'
                      }`}
                    >
                      ✏️ กำหนดชื่อ-ที่อยู่เอง
                    </button>
                  </div>

                  {!useCustomInput ? (
                    <div className="space-y-2">
                      {profiles.map((p) => {
                        const selected = selectedProfileId === p.id;
                        return (
                          <label
                            key={p.id}
                            onClick={() => setSelectedProfileId(p.id)}
                            className={`block p-3 rounded-xl border transition-all cursor-pointer ${
                              selected
                                ? 'bg-blue-600/20 border-amber-400/60 shadow-md'
                                : 'bg-slate-950/60 border-white/10 hover:border-white/25'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-black text-white">
                                {p.title_th}
                                {p.first_name_th} {p.last_name_th}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 text-amber-300 font-bold">
                                {p.label}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-300 mt-1">{p.address}</p>
                          </label>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="space-y-3 bg-slate-950/60 p-3.5 rounded-2xl border border-white/10">
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          ชื่อ-นามสกุล (จากทะเบียนราษฎร์):
                        </label>
                        <input
                          type="text"
                          placeholder="เช่น นายกฤษกร บัวอินทร์"
                          value={customName}
                          onChange={(e) => setCustomName(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-300 block mb-1">
                          ที่อยู่ตามทะเบียนราษฎร์:
                        </label>
                        <textarea
                          rows={2}
                          placeholder="เช่น 199/4 หมู่ 2 ตำบลแม่กา อำเภอเมืองพะเยา จังหวัดพะเยา 56000"
                          value={customAddress}
                          onChange={(e) => setCustomAddress(e.target.value)}
                          className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white resize-none"
                        />
                      </div>
                    </div>
                  )}

                  {/* Step-by-Step OAuth Handshake Progress */}
                  {verifying && (
                    <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 space-y-1.5 text-[11px]">
                      <div className={verifyStep >= 1 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {verifyStep >= 1 ? '✓' : '○'} 1. ตรวจสอบ OAuth 2.0 State & PKCE Code Verifier (S256)
                      </div>
                      <div className={verifyStep >= 2 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {verifyStep >= 2 ? '✓' : '○'} 2. ยืนยันตัวตนระดับ IAL 2.3 และสร้างรหัสอ้างอิง PPID Hash (ไม่ส่งเลข 13 หลัก)
                      </div>
                      <div className={verifyStep >= 3 ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                        {verifyStep >= 3 ? '✓' : '○'} 3. แยกโครงสร้างที่อยู่ (บ้านเลขที่/หมู่/ตำบล/อำเภอ/จังหวัด) อัตโนมัติ
                      </div>
                      <div className={verifyStep >= 4 ? 'text-amber-300 font-black' : 'text-slate-500'}>
                        {verifyStep >= 4 ? '✓' : '○'} 4. กรอกข้อมูลลงในฟอร์มสัญญาเช่าเรียบร้อย!
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-white/10 flex items-center justify-end gap-3">
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    disabled={verifying}
                    onClick={handleConfirmThaIdCallback}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 font-black text-xs shadow-lg flex items-center gap-2 cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <span>📲</span>
                    <span>
                      {verifying
                        ? 'กำลังแลกเปลี่ยน Token กับ ThaID...'
                        : 'กดอนุญาตบนแอป ThaID (ส่งข้อมูลเข้าสัญญาเช่า)'}
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
