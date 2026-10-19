'use client';

import { useEffect, useRef, useState } from 'react';
import { PdpaOcrConsentModal } from '@/app/components/PdpaOcrConsentModal';

// ID card OCR (moved from app/components/WalkInTenantModal.tsx in commit 23b; used by walk-in and by the move-in bill
// step in owner/bookings — both owner / manager screens). PDPA: the photo goes to /api/owner/contracts/ocr-id (owner /
// manager only) just to read the name and address — the ID number and the photo are not stored or sent anywhere else;
// the result is handed to the page through onRead.
export interface IdCardOcrResult {
  name: string;
  address: string;
}

export default function IdCardOcr({ onRead }: { onRead: (result: IdCardOcrResult) => void }) {
  // OCR & Camera States
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [ocrErrorMsg, setOcrErrorMsg] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [isPdpaModalOpen, setIsPdpaModalOpen] = useState(false);
  const [pendingOcrImage, setPendingOcrImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // The camera stops when the form closes or is reset (the parent remounts this component)
  useEffect(() => () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
  }, []);

  // Camera Management
  const startCamera = async () => {
    setOcrErrorMsg(null);
    setCameraActive(true);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (err: any) {
      setCameraActive(false);
      setOcrErrorMsg('ไม่สามารถเปิดกล้องได้: ' + (err.message || 'โปรดอนุญาตสิทธิ์เข้าถึงกล้อง'));
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const captureCameraPhoto = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas.toDataURL('image/jpeg', 0.92);
      stopCamera();
      setPendingOcrImage(base64);
      setIsPdpaModalOpen(true);
    }
  };

  const handleIdCardUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPendingOcrImage(base64);
        setIsPdpaModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const processOcrImage = async (base64: string) => {
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
    setOcrErrorMsg(null);

    try {
      const res = await fetch('/api/owner/contracts/ocr-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64 }),
      });
      const result = await res.json();

      if (result.success && result.data) {
        const d = result.data;
        const extractedName = d.full_name_th || (d.first_name_th ? `${d.title_th ? d.title_th + ' ' : ''}${d.first_name_th} ${d.last_name_th || ''}`.trim() : '');
        const extractedAddress = d.address || '';

        onRead({ name: extractedName, address: extractedAddress });

        setOcrSuccessMsg(`✓ อ่านชื่อและที่อยู่จากบัตรสำเร็จ: ${extractedName || '-'} (ระบบไม่เก็บเลขบัตรประชาชน)`);
      } else {
        setOcrErrorMsg(result.message || 'ไม่สามารถอ่านข้อมูลจากบัตรได้ กรุณากรอกด้วยตนเอง');
      }
    } catch (e: any) {
      setOcrErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ AI OCR: ' + e.message);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  return (
    <>
      {/* ID Card AI OCR Section */}
      <div className="p-5 bg-slate-950/60 border border-white/10 rounded-2xl space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-xs font-black text-white flex items-center gap-1.5">
              <span>📸</span> สแกนบัตรประชาชน (AI Vision Auto-Fill)
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">ใช้กล้องหรืออัปโหลดรูปบัตร AI จะช่วยกรอกข้อมูลอัตโนมัติ</p>
          </div>
          {isOcrProcessing && (
            <span className="text-xs text-amber-400 font-bold animate-pulse flex items-center gap-1">
              <span>⏳</span> กำลังวิเคราะห์บัตร...
            </span>
          )}
        </div>

        {/* Mandatory PDPA Checkbox */}
        <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/25 space-y-1.5">
          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pdpaConsent}
              onChange={(e) => setPdpaConsent(e.target.checked)}
              className="mt-0.5 w-4 h-4 rounded border-blue-400 text-primary focus:ring-primary cursor-pointer shrink-0"
            />
            <div className="text-[11px] leading-relaxed">
              <span className="font-bold text-white block">
                ยินยอมให้ประมวลผลภาพบัตรเพื่ออ่านชื่อ/ที่อยู่ (ไม่จัดเก็บ) (PDPA) <span className="text-rose-400">*</span>
              </span>
              <span className="text-slate-400">
                ส่งภาพถ่ายบัตรให้ Google Gemini AI อ่านชื่อและที่อยู่มากรอกฟอร์ม · ระบบไม่จัดเก็บเลขบัตรประชาชนและรูปบัตร
              </span>
            </div>
          </label>
        </div>

        {/* Camera View / Actions */}
        {cameraActive ? (
          <div className="space-y-3">
            <div className="relative aspect-video rounded-xl overflow-hidden bg-black border border-white/20">
              <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={captureCameraPhoto}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 shadow-md"
              >
                <span>📸 ถ่ายรูปและสแกน</span>
              </button>
              <button
                type="button"
                onClick={stopCamera}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs"
              >
                ยกเลิก
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {!pdpaConsent && (
              <p className="text-[11px] text-amber-400 font-medium">
                🔒 โปรดกดยินยอม PDPA ด้านบนเพื่อปลดล็อกการเปิดกล้องหรืออัปโหลดรูปบัตร
              </p>
            )}
            <div className={`flex flex-wrap gap-2 transition-opacity ${!pdpaConsent ? 'opacity-40 pointer-events-none' : ''}`}>
              <button
                type="button"
                disabled={!pdpaConsent}
                onClick={startCamera}
                className="px-4 py-2.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all disabled:cursor-not-allowed"
              >
                <span>📷 เปิดกล้องถ่ายบัตร</span>
              </button>
              <label className={`px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all ${
                pdpaConsent ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}>
                <span>📁 อัปโหลดรูปบัตร</span>
                <input
                  type="file"
                  accept="image/*"
                  disabled={!pdpaConsent}
                  onChange={handleIdCardUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>
        )}

        {/* OCR Success / Error Feedback */}
        {ocrSuccessMsg && (
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl text-xs flex items-center gap-2">
            <span>✓</span>
            <span>{ocrSuccessMsg}</span>
          </div>
        )}
        {ocrErrorMsg && (
          <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{ocrErrorMsg}</span>
          </div>
        )}
      </div>

      {/* PDPA OCR Consent Modal */}
      <PdpaOcrConsentModal
        isOpen={isPdpaModalOpen}
        title="ยินยอมให้ประมวลผลภาพบัตรประชาชนเพื่ออ่านชื่อและที่อยู่ (PDPA)"
        actionText="ยินยอมและอ่านข้อมูลบัตรด้วย AI"
        onClose={() => {
          setIsPdpaModalOpen(false);
          setPendingOcrImage(null);
        }}
        onConsent={() => {
          setIsPdpaModalOpen(false);
          if (pendingOcrImage) {
            processOcrImage(pendingOcrImage);
            setPendingOcrImage(null);
          }
        }}
      />
    </>
  );
}
