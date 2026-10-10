'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { PdpaOcrConsentModal } from '@/app/components/PdpaOcrConsentModal';

interface WalkInModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface Room {
  id: number;
  room_number: string;
  room_type: string;
  price: number;
  floor: number;
  status: string;
  display_status?: string;
}

export default function WalkInTenantModal({ isOpen, onClose, onSuccess }: WalkInModalProps) {
  const [step, setStep] = useState(1); // 1: Info & OCR, 2: Payment & SlipOK, 3: Completed
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Form State
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [tenantName, setTenantName] = useState('');
  const [idCardNumber, setIdCardNumber] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
  );

  // OCR & Camera States
  const [idCardImage, setIdCardImage] = useState<string | null>(null);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [ocrErrorMsg, setOcrErrorMsg] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [isPdpaModalOpen, setIsPdpaModalOpen] = useState(false);
  const [pendingOcrImage, setPendingOcrImage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Payment / QR & Slip State
  const [qrData, setQrData] = useState<{ qrImage: string; amount: number; promptpayNumber: string; promptpayName: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [slipData, setSlipData] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  // Load available rooms on open
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      resetForm();
      fetchAvailableRooms();
    }
  }, [isOpen]);

  const resetForm = () => {
    setSelectedRoomId('');
    setTenantName('');
    setIdCardNumber('');
    setTenantAddress('');
    setEmail('');
    setPhone('');
    setParentPhone('');
    setIdCardImage(null);
    setOcrSuccessMsg(null);
    setOcrErrorMsg(null);
    setSlipData(null);
    setSubmitResult(null);
    stopCamera();
  };

  const fetchAvailableRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms?explore=true');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        const available = data.data.filter((r: Room) => {
          const st = (r.status || '').toLowerCase();
          const disp = (r.display_status || '').toLowerCase();
          return st === 'available' || st === 'ว่าง' || disp === 'available' || st === 'movingout' || disp === 'movingout';
        });
        setRooms(available);
        if (available.length > 0) {
          setSelectedRoomId(String(available[0].id));
        }
      }
    } catch (e) {
      console.error('Fetch available rooms error:', e);
    } finally {
      setLoadingRooms(false);
    }
  };

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
      setIdCardImage(base64);
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
        setIdCardImage(base64);
        setPendingOcrImage(base64);
        setIsPdpaModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const processOcrImage = async (base64: string) => {
    setIdCardImage(base64);
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
    setOcrErrorMsg(null);

    try {
      const res = await fetch('/api/booking/ocr-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const result = await res.json();

      if (result.success && result.data) {
        const d = result.data;
        const extractedName = d.full_name_th || (d.first_name_th ? `${d.title_th ? d.title_th + ' ' : ''}${d.first_name_th} ${d.last_name_th || ''}`.trim() : '');
        const extractedId = d.id_card_number || '';
        const extractedAddress = d.address || '';

        if (extractedName) setTenantName(extractedName);
        if (extractedId) setIdCardNumber(extractedId);
        if (extractedAddress) setTenantAddress(extractedAddress);

        setOcrSuccessMsg(`✓ สแกนบัตรประชาชนสำเร็จ! AI อ่านชื่อ: ${extractedName || extractedId || '-'}`);
      } else {
        setOcrErrorMsg(result.message || 'ไม่สามารถอ่านข้อมูลจากบัตรได้ กรุณากรอกด้วยตนเอง');
      }
    } catch (e: any) {
      setOcrErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ AI OCR: ' + e.message);
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // Step 1 Validation & Proceed to Step 2
  const handleProceedToPayment = async () => {
    if (!selectedRoomId) {
      alert('กรุณาเลือกห้องพักที่ต้องการจอง');
      return;
    }
    if (!tenantName.trim()) {
      alert('กรุณาระบุชื่อ-นามสกุลผู้เช่า');
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      alert('กรุณาระบุอีเมลที่ถูกต้องสำหรับสร้างบัญชีผู้ใช้');
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 9) {
      alert('กรุณาระบุเบอร์โทรศัพท์ของผู้เช่า (ใช้เป็นรหัสผ่านเริ่มต้น)');
      return;
    }

    // Fetch QR Code for Step 2
    setQrLoading(true);
    setStep(2);
    try {
      const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
      const isTestRoom = (selectedRoom?.room_number || '').toUpperCase() === 'T01';
      const depositAmt = isTestRoom ? 1 : 1000;

      const res = await fetch(`/api/booking/qr?roomId=${selectedRoomId}&dormId=1&amount=${depositAmt}`);
      const data = await res.json();
      if (data.success) {
        setQrData(data);
      }
    } catch (err) {
      console.error('Fetch QR error:', err);
    } finally {
      setQrLoading(false);
    }
  };

  // Slip Upload
  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('ไฟล์สลิปมีขนาดใหญ่เกินไป (จำกัด 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Step 2 Submit to Walk-in API
  const handleFinalSubmit = async () => {
    if (!slipData) {
      alert('กรุณาแนบรูปภาพสลิปการโอนเงิน 1,000 บาท');
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
      const isTestRoom = (selectedRoom?.room_number || '').toUpperCase() === 'T01';
      const depositAmt = isTestRoom ? 1 : 1000;

      const res = await fetch('/api/owner/tenants/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoomId,
          startDate,
          endDate,
          depositAmount: depositAmt,
          monthlyRent: selectedRoom?.price || 2800,
          tenantName,
          email,
          phone,
          parentPhone,
          idCardNumber,
          tenantAddress,
          slipUrl: slipData,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.message || 'บันทึกข้อมูลไม่สำเร็จ');
      }

      setSubmitResult(data.data);
      setStep(3);
      onSuccess();
    } catch (e: any) {
      alert(e.message || 'เกิดข้อผิดพลาดในการทำรายการ');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
  const isTestRoom = (selectedRoom?.room_number || '').toUpperCase() === 'T01';
  const depositAmount = isTestRoom ? 1 : 1000;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-white/10 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl my-8">
        
        {/* Header */}
        <div className="bg-slate-950/80 px-6 py-5 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚶</span>
            <div>
              <h2 className="text-lg font-black text-white">เพิ่มผู้เช่าแบบ Walk-in (เคาน์เตอร์หอพัก)</h2>
              <p className="text-xs text-slate-400">สร้างบัญชีผู้เช่า สแกนบัตรปชช. และตรวจสลิปมัดจำอัตโนมัติ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator */}
        <div className="grid grid-cols-3 bg-slate-950/40 border-b border-white/5 px-6 py-3 text-xs font-bold">
          <div className={`flex items-center gap-2 ${step === 1 ? 'text-primary' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 1 ? 'bg-primary text-white' : 'bg-white/10'}`}>1</span>
            <span>1. เตรียมข้อมูล & สแกนบัตร</span>
          </div>
          <div className={`flex items-center gap-2 ${step === 2 ? 'text-primary' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 2 ? 'bg-primary text-white' : 'bg-white/10'}`}>2</span>
            <span>2. ชำระมัดจำ & สลิป</span>
          </div>
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-emerald-400' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 3 ? 'bg-emerald-500 text-white' : 'bg-white/10'}`}>3</span>
            <span>3. บันทึกสำเร็จ</span>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8 space-y-6">

          {/* STEP 1: Info & OCR */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              
              {/* Room Selection - Grid of Available / Moving Out Rooms */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <span>🚪</span> เลือกห้องพักที่ต้องการจอง (เฉพาะห้องว่าง & กำลังจะว่าง) <span className="text-red-400">*</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-400">
                    {rooms.length} ห้องพร้อมจอง
                  </span>
                </div>

                {loadingRooms ? (
                  <div className="p-4 bg-slate-950 rounded-2xl text-xs text-slate-400 text-center animate-pulse border border-white/5">
                    กำลังตรวจสอบห้องพักว่าง...
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-2xl text-xs text-center font-bold">
                    ⚠️ ไม่มีห้องพักว่างหรือกำลังจะว่างในขณะนี้
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-48 overflow-y-auto p-1">
                    {rooms.map((r) => {
                      const isSelected = String(r.id) === String(selectedRoomId);
                      const isMovingOut = (r.status || '').toLowerCase().includes('moving') || (r.display_status || '').toLowerCase().includes('moving');
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRoomId(String(r.id))}
                          className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                            isSelected
                              ? 'bg-primary/20 border-primary text-white shadow-lg shadow-primary/20 scale-[1.02]'
                              : 'bg-slate-950/80 hover:bg-slate-950 border-white/10 text-slate-300 hover:border-white/20'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm text-white">ห้อง {r.room_number}</span>
                            <span className={`w-2 h-2 rounded-full ${isMovingOut ? 'bg-amber-400' : 'bg-emerald-400'}`} />
                          </div>
                          <div className="text-[11px] text-slate-400 flex items-center justify-between">
                            <span>ชั้น {r.floor || 1}</span>
                            <span className="font-bold text-primary">฿{Number(r.price).toLocaleString()}</span>
                          </div>
                          <div className="mt-1">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                              isMovingOut ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20' : 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            }`}>
                              {isMovingOut ? '🟡 ว่างเร็วๆ นี้' : '🟢 ว่างพร้อมอยู่'}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

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
                        ยินยอมการเก็บรวบรวมและประมวลผลข้อมูลบัตรประชาชน (PDPA) <span className="text-rose-400">*</span>
                      </span>
                      <span className="text-slate-400">
                        ยินยอมให้ส่งภาพถ่ายบัตรประชาชนเพื่อประมวลผลด้วย Google Gemini AI Vision สำหรับการทำสัญญาเช่า
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

              {/* Form Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300">
                    ชื่อ-นามสกุล (จากบัตรปชช.) <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น นายกฤษกร บัวอินทร์"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-500">ชื่อนี้จะถูกใช้เป็นชื่อบัญชีผู้ใช้และระบุในสัญญาเช่า (ระบบไม่เก็บเลขบัตรประชาชน 13 หลักตามหลัก PDPA)</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    อีเมลผู้เช่า <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="เช่น user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-slate-500">ใช้สำหรับล็อกอินเข้าระบบ</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">
                    เบอร์โทรศัพท์ผู้เช่า <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="เช่น 0636040550"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-primary"
                  />
                  <p className="text-[10px] text-emerald-400 font-semibold">🔒 เบอร์นี้จะถูกใช้เป็นรหัสผ่านเริ่มต้น</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300">
                    เบอร์โทรผู้ปกครอง / ผู้ติดต่อฉุกเฉิน
                  </label>
                  <input
                    type="tel"
                    placeholder="เช่น 0812345678"
                    value={parentPhone}
                    onChange={(e) => setParentPhone(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-300">ที่อยู่ตามบัตรประชาชน</label>
                  <textarea
                    rows={2}
                    placeholder="ที่อยู่ตามทะเบียนบ้าน/บัตรประชาชน"
                    value={tenantAddress}
                    onChange={(e) => setTenantAddress(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-primary resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">วันเริ่มสัญญา / เข้าพัก</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-300">วันสิ้นสุดสัญญา</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-slate-950 border border-white/10 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  type="button"
                  onClick={handleProceedToPayment}
                  className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-black rounded-xl text-xs shadow-lg transition-all hover:scale-105 active:scale-95"
                >
                  ถัดไป: สแกนจ่ายมัดจำ ฿{depositAmount.toLocaleString()} →
                </button>
              </div>

            </div>
          )}

          {/* STEP 2: Payment & SlipOK */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in">
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* QR Code */}
                <div className="md:col-span-5 bg-slate-950 p-6 rounded-2xl border border-white/10 text-center space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">สแกนจ่ายเงินจอง</span>
                  <div className="relative w-48 h-48 mx-auto bg-white p-2 rounded-2xl shadow-xl">
                    {qrLoading ? (
                      <div className="w-full h-full flex items-center justify-center text-slate-800 text-xs font-bold animate-pulse">
                        กำลังสร้าง QR...
                      </div>
                    ) : qrData?.qrImage ? (
                      <img src={qrData.qrImage} alt="PromptPay QR" className="w-full h-full object-contain p-2" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-400 text-xs">
                        พร้อมเพย์ 0636040550
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-xl font-black text-white">฿{depositAmount.toLocaleString()}</span>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {qrData?.promptpayName || 'หอพักเกษร 2'} • พร้อมเพย์ {qrData?.promptpayNumber || '0636040550'}
                    </p>
                  </div>

                  {qrData && (
                    <div className="pt-2">
                      <PromptPayBankSelector
                        qrImage={qrData.qrImage}
                        promptpayNumber={qrData.promptpayNumber}
                        promptpayName={qrData.promptpayName}
                        amount={depositAmount}
                        fileName={`deposit-walkin-room-${selectedRoom?.room_number || 'T01'}.png`}
                      />
                    </div>
                  )}
                </div>

                {/* Slip Upload & Summary */}
                <div className="md:col-span-7 space-y-4">
                  <div className="p-4 bg-slate-950/60 rounded-xl border border-white/5 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">ห้องพัก:</span>
                      <span className="font-bold text-white">ห้อง {selectedRoom?.room_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">ผู้เช่า:</span>
                      <span className="font-bold text-white">{tenantName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">เบอร์โทร (รหัสผ่าน):</span>
                      <span className="font-bold text-emerald-400">{phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">อีเมล:</span>
                      <span className="font-bold text-white">{email}</span>
                    </div>
                  </div>

                  {/* Slip Upload Box */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-300">
                      แนบรูปภาพสลิปโอนเงิน (SlipOK ตรวจสอบอัตโนมัติ) <span className="text-red-400">*</span>
                    </label>
                    <label className="border-2 border-dashed border-white/20 hover:border-primary/60 rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-950/40 hover:bg-slate-950/80 transition-all text-center">
                      <span className="text-2xl">🧾</span>
                      <span className="text-xs font-bold text-white">
                        {slipData ? '✓ อัปโหลดสลิปเรียบร้อยแล้ว (กดเพื่อเปลี่ยน)' : 'กดเพื่อเลือกรูปภาพสลิป'}
                      </span>
                      <span className="text-[10px] text-slate-500">รองรับไฟล์ JPG, PNG ขนาดไม่เกิน 5MB</span>
                      <input type="file" accept="image/*" onChange={handleSlipUpload} className="hidden" />
                    </label>
                  </div>

                  {slipData && (
                    <div className="relative aspect-[3/4] max-h-40 rounded-xl overflow-hidden border border-white/10 mx-auto">
                      <Image src={slipData} alt="Uploaded Slip" fill className="object-cover" />
                    </div>
                  )}
                </div>

              </div>

              {/* Action Buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl text-xs transition-colors"
                >
                  ← ย้อนกลับ
                </button>
                <button
                  type="button"
                  disabled={isSubmitting || !slipData}
                  onClick={handleFinalSubmit}
                  className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-black rounded-xl text-xs shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  <span>{isSubmitting ? '⏳ กำลังตรวจสอบสลิป & บันทึก...' : '✓ ตรวจสลิป & ยืนยันการจอง Walk-in'}</span>
                </button>
              </div>

            </div>
          )}

          {/* STEP 3: Completed */}
          {step === 3 && (
            <div className="text-center py-6 space-y-6 animate-in fade-in">
              <div className="w-16 h-16 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/10">
                ✓
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-400">Walk-in สำเร็จ</span>
                <h3 className="text-2xl font-black text-white">บันทึกข้อมูลและล็อกห้องพักสำเร็จ</h3>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  ระบบได้สร้างบัญชีผู้เช่า ตรวจสอบสลิปมัดจำ และปรับสถานะห้อง {submitResult?.roomNumber} เป็น <strong>Reserved</strong> เรียบร้อยแล้ว
                </p>
              </div>

              {/* Account Details Card for Tenant */}
              <div className="max-w-md mx-auto bg-slate-950 p-5 rounded-2xl border border-white/10 text-left space-y-3">
                <span className="text-xs font-black text-primary flex items-center gap-1.5">
                  <span>🔑</span> ข้อมูลเข้าสู่ระบบของผู้เช่า (ส่งให้ผู้เช่าล็อกอินได้ทันที)
                </span>
                <div className="space-y-1.5 text-xs bg-slate-900/60 p-3 rounded-xl border border-white/5 font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-400">URL เข้าสู่ระบบ:</span>
                    <span className="text-white font-bold">/signin</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">อีเมล (Username):</span>
                    <span className="text-cyan-400 font-bold">{submitResult?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">รหัสผ่านเริ่มต้น:</span>
                    <span className="text-emerald-400 font-bold">{submitResult?.defaultPassword}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-white/5">
                    <span className="text-slate-400">สถานะ:</span>
                    <span className="text-amber-400 font-bold">Guest (รอจัดทำสัญญา)</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs shadow-lg transition-all"
                >
                  เสร็จสิ้น / ปิดหน้าต่าง
                </button>
              </div>

            </div>
          )}

        </div>

      </div>

      {/* PDPA OCR Consent Modal */}
      <PdpaOcrConsentModal
        isOpen={isPdpaModalOpen}
        title="หนังสือยินยอมการเก็บและประมวลผลบัตรประชาชน (PDPA)"
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
    </div>
  );
}
