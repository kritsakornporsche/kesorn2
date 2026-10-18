'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { SignedContractRecord } from '@/lib/features/contract-crypto';

export function ContractVerificationScanner() {
  const [records, setRecords] = useState<SignedContractRecord[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<SignedContractRecord | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Candidate fields being scanned / verified
  const [candRoom, setCandRoom] = useState<string>('104');
  const [candTenant, setCandTenant] = useState<string>('นายกฤษกร บัวอินทร์');
  const [candRent, setCandRent] = useState<string>('4000');
  const [candDeposit, setCandDeposit] = useState<string>('3000');
  const [candStart, setCandStart] = useState<string>('2026-06-01');
  const [candEnd, setCandEnd] = useState<string>('2027-05-31');

  const [verifyResult, setVerifyResult] = useState<{
    verified: boolean;
    officialHash: string;
    candidateHash: string;
    tamperedFields: string[];
  } | null>(null);

  const loadContract = useCallback(async (docId?: string) => {
    setLoading(true);
    try {
      const qs = docId ? `?docId=${encodeURIComponent(docId)}` : '';
      const res = await fetch(`/api/features/econtract-verify${qs}`);
      const json = await res.json();
      if (json.success && json.selectedRecord) {
        const doc: SignedContractRecord = json.selectedRecord;
        setRecords(json.records || []);
        setSelectedDoc(doc);
        setQrDataUrl(json.qrDataUrl || null);

        // Sync candidate inputs to official document initially
        setCandRoom(doc.roomNumber);
        setCandTenant(doc.tenantName);
        setCandRent(String(doc.monthlyRent));
        setCandDeposit(String(doc.depositAmount));
        setCandStart(doc.startDate);
        setCandEnd(doc.endDate);

        setVerifyResult({
          verified: true,
          officialHash: doc.sha256Hash,
          candidateHash: doc.sha256Hash,
          tamperedFields: [],
        });
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadContract('CTR-2569-104');
  }, [loadContract]);

  const runVerification = async (overrideCandidate?: {
    roomNumber?: string;
    tenantName?: string;
    monthlyRent?: number;
    depositAmount?: number;
    startDate?: string;
    endDate?: string;
  }) => {
    if (!selectedDoc) return;
    const payloadCandidate = {
      roomNumber: overrideCandidate?.roomNumber ?? candRoom,
      tenantName: overrideCandidate?.tenantName ?? candTenant,
      monthlyRent:
        overrideCandidate?.monthlyRent !== undefined
          ? overrideCandidate.monthlyRent
          : Number(candRent) || 0,
      depositAmount:
        overrideCandidate?.depositAmount !== undefined
          ? overrideCandidate.depositAmount
          : Number(candDeposit) || 0,
      startDate: overrideCandidate?.startDate ?? candStart,
      endDate: overrideCandidate?.endDate ?? candEnd,
    };

    try {
      const res = await fetch('/api/features/econtract-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify',
          docId: selectedDoc.docId,
          candidate: payloadCandidate,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setVerifyResult({
          verified: json.verified,
          officialHash: json.officialHash,
          candidateHash: json.candidateHash,
          tamperedFields: json.tamperedFields || [],
        });
      }
    } catch {
      // ignore
    }
  };

  // One-click tamper simulation
  const simulateTamperRent = async () => {
    if (!selectedDoc) return;
    const fakeRent = Math.max(1000, selectedDoc.monthlyRent - 1500);
    setCandRent(String(fakeRent));
    await runVerification({ monthlyRent: fakeRent });
  };

  const simulateTamperEndDate = async () => {
    if (!selectedDoc) return;
    const fakeEnd = '2029-12-31';
    setCandEnd(fakeEnd);
    await runVerification({ endDate: fakeEnd });
  };

  const restoreAuthenticDocument = async () => {
    if (!selectedDoc) return;
    setCandRoom(selectedDoc.roomNumber);
    setCandTenant(selectedDoc.tenantName);
    setCandRent(String(selectedDoc.monthlyRent));
    setCandDeposit(String(selectedDoc.depositAmount));
    setCandStart(selectedDoc.startDate);
    setCandEnd(selectedDoc.endDate);
    await runVerification({
      roomNumber: selectedDoc.roomNumber,
      tenantName: selectedDoc.tenantName,
      monthlyRent: selectedDoc.monthlyRent,
      depositAmount: selectedDoc.depositAmount,
      startDate: selectedDoc.startDate,
      endDate: selectedDoc.endDate,
    });
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: Official E-Contract Certificate & Live Verification Status */}
      <div className="lg:col-span-7 space-y-5">
        {/* Verification Status Banner */}
        {verifyResult && (
          <div
            className={`rounded-3xl p-5 border shadow-2xl transition-all ${
              verifyResult.verified
                ? 'bg-emerald-950/60 border-emerald-400/50 text-emerald-200'
                : 'bg-rose-950/80 border-rose-400 text-rose-100 shadow-[0_0_30px_rgba(244,63,94,0.35)]'
            }`}
          >
            <div className="flex items-start gap-3.5">
              <div className="text-3xl shrink-0">{verifyResult.verified ? '✅' : '🚨'}</div>
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="text-xs font-black uppercase tracking-wider">
                  {verifyResult.verified
                    ? 'CRYPTOGRAPHIC VERIFICATION PASSED • SHA-256 MATCHED'
                    : 'TAMPERING DETECTED • SHA-256 HASH MISMATCH!'}
                </div>
                <h2 className="text-lg sm:text-xl font-black text-white">
                  {verifyResult.verified
                    ? 'ยืนยันสัญญาเช่าถูกต้อง 100% (เอกสารต้นฉบับของจริง)'
                    : 'ตรวจพบการดัดแปลงปลอมแปลงข้อมูลในสัญญาเช่า!'}
                </h2>
                {!verifyResult.verified && verifyResult.tamperedFields.length > 0 && (
                  <div className="p-3 rounded-xl bg-rose-900/60 border border-rose-400/40 text-xs space-y-1">
                    <span className="font-black text-rose-200 block">
                      รายการข้อมูลที่ถูกแอบแก้ไขไม่ตรงกับต้นฉบับ:
                    </span>
                    {verifyResult.tamperedFields.map((tf, i) => (
                      <div key={i} className="font-bold text-white">
                        • {tf}
                      </div>
                    ))}
                  </div>
                )}

                <div className="pt-2 space-y-1 text-[11px] font-mono break-all">
                  <div>
                    <span className="text-slate-400">Official SHA-256: </span>
                    <span className="text-emerald-300 font-bold">{verifyResult.officialHash}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">Scanned SHA-256:  </span>
                    <span
                      className={`font-bold ${
                        verifyResult.verified ? 'text-emerald-300' : 'text-rose-300 underline'
                      }`}
                    >
                      {verifyResult.candidateHash}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Digital Contract / Receipt Certificate Card */}
        {loading || !selectedDoc ? (
          <div className="rounded-3xl bg-slate-900/80 border border-white/10 p-12 text-center text-sm text-slate-400">
            กำลังโหลดใบรับรองสัญญาเช่าดิจิทัล SHA-256...
          </div>
        ) : (
          <div className="rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-6 space-y-5 shadow-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
              <div>
                <span className="px-2.5 py-1 rounded-full bg-cyan-500/20 border border-cyan-400/40 text-cyan-300 text-[10px] font-black">
                  {selectedDoc.docType === 'E_RECEIPT'
                    ? '🧾 ใบเสร็จรับเงินอิเล็กทรอนิกส์ (E-RECEIPT)'
                    : '📜 สัญญาเช่าอิเล็กทรอนิกส์ (CRYPTOGRAPHIC E-CONTRACT)'}
                </span>
                <h3 className="text-xl font-black text-white mt-1.5">{selectedDoc.dormName}</h3>
                <p className="text-xs text-slate-400">เลขที่เอกสาร: {selectedDoc.docId}</p>
              </div>

              {qrDataUrl && (
                <div className="bg-white p-2.5 rounded-2xl shadow-lg flex flex-col items-center">
                  <img
                    src={qrDataUrl}
                    alt="Contract Verification QR"
                    className="w-28 h-28 object-contain"
                  />
                  <span className="text-[9px] font-black text-slate-900 mt-1">
                    สแกนตรวจสอบสัญญา
                  </span>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">หมายเลขห้องพัก</span>
                <span className="text-base font-black text-white font-mono">
                  ห้อง {selectedDoc.roomNumber} (ชั้น {selectedDoc.floor})
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">ชื่อผู้เช่าตามสัญญา</span>
                <span className="text-sm font-black text-white">{selectedDoc.tenantName}</span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">อัตราค่าเช่ารายเดือน</span>
                <span className="text-base font-black text-emerald-400">
                  ฿{selectedDoc.monthlyRent.toLocaleString()} / เดือน
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">เงินประกันสัญญาเช่า</span>
                <span className="text-sm font-black text-amber-300">
                  ฿{selectedDoc.depositAmount.toLocaleString()}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">วันเริ่มสัญญา</span>
                <span className="text-sm font-black text-white font-mono">
                  {selectedDoc.startDate}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-slate-950/90 border border-white/10">
                <span className="text-slate-400 block">วันสิ้นสุดสัญญา</span>
                <span className="text-sm font-black text-white font-mono">
                  {selectedDoc.endDate}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-950/90 border border-cyan-500/20 p-4 space-y-1.5 text-[11px] font-mono">
              <div className="text-cyan-400 font-sans font-black text-xs">
                🔐 ลายเซ็นดิจิทัลรับรองเอกสาร (SHA-256 & HMAC-SHA256 Digital Seal)
              </div>
              <div className="text-slate-400 break-all">
                <strong className="text-slate-200">Canonical Data:</strong> {selectedDoc.canonicalPayload}
              </div>
              <div className="text-emerald-300 break-all">
                <strong className="text-slate-200">SHA-256 Digest:</strong> {selectedDoc.sha256Hash}
              </div>
              <div className="text-amber-300 break-all">
                <strong className="text-slate-200">HMAC Signature:</strong> {selectedDoc.hmacSignature}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Right 5 Columns: Single Unified Verification & Tamper Simulator Control Panel */}
      <div className="lg:col-span-5 rounded-3xl bg-slate-900/90 border border-cyan-500/30 p-5 space-y-5 shadow-2xl">
        <div>
          <span className="text-[10px] font-black uppercase tracking-wider text-cyan-400">
            CONTRACT SCANNER & TAMPER TESTER
          </span>
          <h2 className="text-base font-black text-white mt-0.5">
            แผงควบคุมสแกนยืนยันสัญญา & ทดสอบการปลอมแปลง
          </h2>
        </div>

        {/* 1. Select Official Document */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-slate-300 block">
            1. เลือกสัญญาเช่า / ใบเสร็จที่ต้องการตรวจสอบ:
          </label>
          <select
            value={selectedDoc?.docId || ''}
            onChange={(e) => loadContract(e.target.value)}
            className="w-full p-2.5 rounded-xl bg-slate-950 border border-white/15 text-xs font-bold text-white"
          >
            {records.map((rec) => (
              <option key={rec.docId} value={rec.docId}>
                [{rec.docId}] ห้อง {rec.roomNumber} — {rec.tenantName} (฿{rec.monthlyRent.toLocaleString()})
              </option>
            ))}
          </select>
        </div>

        {/* 2. Quick One-Click Verification & Tamper Buttons */}
        <div className="space-y-2 pt-2 border-t border-white/10">
          <span className="text-xs font-bold text-slate-300 block">
            2. ทดสอบสแกนยืนยัน หรือ จำลองการปลอมแปลงสัญญาในคลิกเดียว:
          </span>

          <button
            type="button"
            onClick={restoreAuthenticDocument}
            className="w-full py-2.5 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs shadow-lg transition-all"
          >
            ✅ สแกนตรวจสอบสัญญาต้นฉบับจริง (Verify Authentic QR)
          </button>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={simulateTamperRent}
              className="p-2.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-black transition-all"
            >
              ⚠️ จำลองแอบลดค่าเช่าในสัญญา
            </button>
            <button
              type="button"
              onClick={simulateTamperEndDate}
              className="p-2.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-black transition-all"
            >
              ⚠️ จำลองแอบแก้วันหมดสัญญา
            </button>
          </div>
        </div>

        {/* 3. Interactive Document Field Inspector (Edit any field to test SHA-256 sensitivity) */}
        <div className="space-y-3 pt-2 border-t border-white/10">
          <span className="text-xs font-bold text-slate-300 block">
            3. ข้อมูลจากเอกสารที่สแกน (ลองแก้ไขตัวเลขเพื่อทดสอบระบบจับผิด SHA-256):
          </span>

          <div className="grid grid-cols-2 gap-2.5 text-xs">
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">เลขห้องพัก</label>
              <input
                type="text"
                value={candRoom}
                onChange={(e) => setCandRoom(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-white font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">ค่าเช่า/เดือน (บาท)</label>
              <input
                type="number"
                value={candRent}
                onChange={(e) => setCandRent(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-white font-bold"
              />
            </div>
            <div className="col-span-2">
              <label className="text-[11px] text-slate-400 block mb-1">ชื่อ-นามสกุลผู้เช่า</label>
              <input
                type="text"
                value={candTenant}
                onChange={(e) => setCandTenant(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-white font-bold"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">วันเริ่มสัญญา</label>
              <input
                type="text"
                value={candStart}
                onChange={(e) => setCandStart(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-white font-mono"
              />
            </div>
            <div>
              <label className="text-[11px] text-slate-400 block mb-1">วันสิ้นสุดสัญญา</label>
              <input
                type="text"
                value={candEnd}
                onChange={(e) => setCandEnd(e.target.value)}
                className="w-full p-2 rounded-xl bg-slate-950 border border-white/15 text-white font-mono"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={() => runVerification()}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-black text-xs shadow-lg transition-all"
          >
            🔍 คำนวณ SHA-256 และตรวจสอบความถูกต้องของข้อมูลชุดนี้
          </button>
        </div>
      </div>
    </div>
  );
}
