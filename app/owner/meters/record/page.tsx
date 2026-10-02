'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

interface RoomRecord {
  id: number;
  room_number: string;
  floor: number;
  room_type: string;
  previous_reading: number;
  recorded: boolean;
  current_reading?: number;
  photo_url?: string;
}

export default function MeterRecordMobileFlowPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState(new Date().toISOString().substring(0, 7));

  // Current room input state
  const [inputReading, setInputReading] = useState<string>('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showExcessConfirmModal, setShowExcessConfirmModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch rooms 1 to 20
  const fetchRooms = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/meters/summary');
      const data = await res.json();
      if (data.success) {
        const formatted: RoomRecord[] = (data.data || []).map((r: any) => ({
          id: r.room_id,
          room_number: r.room_number,
          floor: r.floor,
          room_type: r.room_type,
          previous_reading: r.latest_reading !== null ? Number(r.latest_reading) : 0,
          recorded: false,
        }));
        setRooms(formatted);
      }
    } catch (e) {
      console.error('Fetch rooms error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/meters/record');
      return;
    }
    fetchRooms();
  }, [authStatus, router]);

  const currentRoom = rooms[currentIndex] || null;
  const isLastRoom = currentIndex === rooms.length - 1;

  // Sync inputs when switching room
  useEffect(() => {
    if (currentRoom) {
      setInputReading(currentRoom.current_reading ? String(currentRoom.current_reading) : '');
      setCapturedPhoto(currentRoom.photo_url || null);
    }
  }, [currentIndex]);

  // Client-side WebP Image Compression (13.2.3.4: ~200-400KB)
  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
        const img = new (window as any).Image();
        img.src = event.target?.result as string;
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const maxDim = 1280;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(img, 0, 0, width, height);

          // Compress to WebP quality 0.8
          const dataUrl = canvas.toDataURL('image/webp', 0.8);
          resolve(dataUrl);
        };
        img.onerror = (err: any) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // Handle Photo Capture/Upload + Real AI OCR
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCompressing(true);
    try {
      const compressedWebP = await compressImage(file);
      setCapturedPhoto(compressedWebP);
      setIsCompressing(false);

      // Call Real AI OCR Endpoint
      setIsOcrProcessing(true);
      try {
        const ocrRes = await fetch('/api/owner/meters/ocr', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            image: compressedWebP,
            previous_reading: currentRoom?.previous_reading || 0,
            type: 'electricity',
          }),
        });
        const ocrData = await ocrRes.json();
        const extractedReading = ocrData.reading ?? ocrData.data?.reading ?? null;

        if (ocrData.success && extractedReading !== null && extractedReading !== undefined) {
          setInputReading(String(extractedReading));
          showToast(`⚡ AI อ่านเลขมิเตอร์ได้: ${extractedReading}`, 'success');
        } else if (currentRoom) {
          showToast('📸 อัปโหลดรูปสำเร็จ กรุณาตรวจสอบหรือกรอกตัวเลขมิเตอร์', 'warning');
        }
      } catch (ocrErr) {
        console.warn('OCR processing error:', ocrErr);
      } finally {
        setIsOcrProcessing(false);
      }
    } catch (err) {
      setIsCompressing(false);
      setIsOcrProcessing(false);
      showToast('เกิดข้อผิดพลาดในการประมวลผลภาพถ่าย', 'error');
    }
  };

  // 13.2.3.1 - 13.2.3.3 Smart Alert Calculations
  const prevVal = currentRoom?.previous_reading || 0;
  const currentVal = inputReading ? parseFloat(inputReading) : null;
  const unitsUsed = currentVal !== null && !isNaN(currentVal) ? currentVal - prevVal : null;

  let alertType: 'green' | 'yellow' | 'red' | 'neutral' = 'neutral';
  let alertMessage = '';

  if (currentVal !== null && !isNaN(currentVal)) {
    if (currentVal < prevVal) {
      alertType = 'red'; // 13.2.3.3
      alertMessage = '🔴 ไม่สามารถคำนวณได้เนื่องจากค่าน้อยกว่าค่าล่าสุด (ปุ่มบันทึกจะถูกปิดการทำงาน)';
    } else if (unitsUsed !== null && unitsUsed > 200) {
      alertType = 'yellow'; // 13.2.3.2
      alertMessage = `🟡 ค่ามากกว่าปกติ (${unitsUsed.toFixed(1)} หน่วย เกิน 200 หน่วย) กรุณาตรวจสอบให้แน่ใจ`;
    } else if (unitsUsed !== null && unitsUsed >= 0 && unitsUsed <= 200) {
      alertType = 'green'; // 13.2.3.1
      alertMessage = `🟢 อ่านค่าได้แล้ว (${unitsUsed.toFixed(1)} หน่วย) ค่าปกติพร้อมบันทึก`;
    }
  }

  // Save room reading to Backend
  const saveReading = async (skip = false) => {
    if (!currentRoom) return;

    if (!skip) {
      if (!capturedPhoto) {
        showToast('📸 กรุณาถ่ายภาพหรืออัปโหลดรูปหน้าปัดมิเตอร์เป็นหลักฐานก่อนบันทึก', 'error');
        return;
      }
      if (alertType === 'red') {
        showToast('ไม่สามารถบันทึกได้เนื่องจากเลขมิเตอร์น้อยกว่าครั้งก่อน', 'error');
        return;
      }
      if (alertType === 'yellow' && !showExcessConfirmModal) {
        setShowExcessConfirmModal(true);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!skip && currentVal !== null && !isNaN(currentVal)) {
        const res = await fetch('/api/owner/meters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: currentRoom.id,
            type: 'Electricity',
            previous_reading: prevVal,
            current_reading: currentVal,
            units_used: unitsUsed,
            billing_cycle: billingCycle,
            photo_url: capturedPhoto,
          }),
        });

        const resData = await res.json();
        if (!res.ok || !resData.success) {
          throw new Error(resData.message || 'ไม่สามารถบันทึกข้อมูลมิเตอร์ได้');
        }

        // Mark current room as recorded
        setRooms((prev) =>
          prev.map((r, i) =>
            i === currentIndex
              ? { ...r, recorded: true, current_reading: currentVal, photo_url: capturedPhoto || undefined }
              : r
          )
        );
      }

      // Check if this is the last room (13.2.6)
      if (isLastRoom) {
        const totalRecorded = rooms.filter((r, i) => (i === currentIndex ? !skip : r.recorded)).length;
        const totalSkipped = rooms.length - totalRecorded;
        showToast(`🎉 จดมิเตอร์เสร็จสิ้นแล้ว! บันทึกสำเร็จ ${totalRecorded} ห้อง (ข้าม ${totalSkipped} ห้อง)`, 'success');
        setTimeout(() => {
          router.push('/owner/meters');
        }, 1500);
      } else {
        // Move to next room (13.2.4 / 13.2.5)
        setCurrentIndex((prev) => prev + 1);
        setShowExcessConfirmModal(false);
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const [showFinishModal, setShowFinishModal] = useState(false);

  // Finish whole meter recording session
  const handleFinishEarly = () => {
    const totalRecorded = rooms.filter(r => r.recorded).length;
    if (totalRecorded === 0 && !capturedPhoto && !inputReading) {
      showToast('ยังไม่มีการบันทึกมิเตอร์ห้องใดๆ สามารถกดกลับได้เลย', 'warning');
      router.push('/owner/meters');
      return;
    }
    setShowFinishModal(true);
  };

  const confirmFinish = async () => {
    // If current room has valid input and photo, save it first before finishing
    if (capturedPhoto && inputReading && alertType !== 'red') {
      try {
        await fetch('/api/owner/meters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room_id: currentRoom?.id,
            type: 'Electricity',
            previous_reading: prevVal,
            current_reading: currentVal,
            units_used: unitsUsed,
            billing_cycle: billingCycle,
            photo_url: capturedPhoto,
          }),
        });
      } catch (e) {
        console.error(e);
      }
    }

    const recordedCount = rooms.filter(r => r.recorded).length + (capturedPhoto && inputReading && alertType !== 'red' && !currentRoom?.recorded ? 1 : 0);
    const skippedCount = rooms.length - recordedCount;
    showToast(`🎉 เสร็จสิ้นการจดมิเตอร์รอบนี้แล้ว! บันทึกสำเร็จ ${recordedCount} ห้อง (ข้าม ${skippedCount} ห้อง)`, 'success');
    setShowFinishModal(false);
    setTimeout(() => {
      router.push('/owner/meters');
    }, 1200);
  };

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-2xl shadow-2xl font-bold text-xs border flex items-center gap-2 max-w-[90vw] text-center ${
          toast.type === 'success' ? 'bg-emerald-950 border-emerald-500 text-emerald-200' :
          toast.type === 'warning' ? 'bg-amber-950 border-amber-500 text-amber-200' :
          'bg-rose-950 border-rose-500 text-rose-200'
        }`}>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <Link
            href="/owner/meters"
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold border border-white/10 transition-all flex items-center gap-1.5"
          >
            <span>←</span>
            <span>กลับหน้ารวมมิเตอร์</span>
          </Link>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <span>📸</span>
              <span>บันทึกจดมิเตอร์ไฟฟ้ารายห้อง</span>
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3 bg-slate-900/80 px-4 py-2 rounded-2xl border border-white/10">
            <span className="text-xs text-slate-400 font-bold">รอบบิล:</span>
            <span className="text-sm font-mono font-black text-amber-400">{billingCycle}</span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs text-slate-400 font-bold">
              ความคืบหน้า: <strong className="text-emerald-400 font-mono">{rooms.filter(r => r.recorded).length}/{rooms.length}</strong>
            </span>
          </div>

          <button
            onClick={handleFinishEarly}
            disabled={submitting}
            className="px-4 py-2 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 rounded-2xl text-xs font-black transition-all flex items-center gap-2 hover:scale-105 active:scale-95 cursor-pointer shadow-lg"
          >
            <span>🏁</span>
            <span>จบการจดมิเตอร์ ({rooms.filter(r => r.recorded).length} ห้อง)</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-20 text-center text-slate-400 font-bold animate-pulse">กำลังเตรียมระบบจดมิเตอร์...</div>
      ) : !currentRoom ? (
        <div className="p-16 text-center text-slate-400">ไม่พบข้อมูลห้องพัก</div>
      ) : (
        /* Desktop: 2-Column Responsive Layout | Mobile: Single Column */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (lg:col-span-4): Room Quick Select List (Sticky on desktop) */}
          <div className="lg:col-span-4 bg-slate-900/90 border border-white/10 rounded-3xl p-5 shadow-xl space-y-4 lg:sticky lg:top-4">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">
                  รายการห้อง ({currentIndex + 1}/{rooms.length})
                </span>
                <h3 className="text-base font-black text-white">เลือกห้องที่จะจด</h3>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 font-mono font-bold">
                ห้อง {currentRoom.room_number}
              </span>
            </div>

            {/* Mobile Dropdown */}
            <div className="block lg:hidden">
              <select
                value={currentIndex}
                onChange={(e) => setCurrentIndex(Number(e.target.value))}
                className="w-full bg-slate-950 text-white font-black text-sm rounded-xl px-4 py-3 border border-white/10 focus:outline-none focus:border-primary"
              >
                {rooms.map((r, idx) => (
                  <option key={r.id} value={idx}>
                    ห้อง {r.room_number} {r.recorded ? '✅ (จดแล้ว)' : '⏳ (ยังไม่จด)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Desktop Room Grid / List (Scrollable) */}
            <div className="hidden lg:grid grid-cols-2 gap-2 max-h-[480px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-white/10">
              {rooms.map((r, idx) => {
                const isCurrent = idx === currentIndex;
                return (
                  <button
                    key={r.id}
                    onClick={() => setCurrentIndex(idx)}
                    className={`p-3 rounded-2xl border text-left transition-all flex flex-col justify-between ${
                      isCurrent
                        ? 'bg-primary text-white border-primary shadow-lg scale-[1.02]'
                        : r.recorded
                        ? 'bg-emerald-950/30 border-emerald-500/30 text-slate-300 hover:border-emerald-500/50'
                        : 'bg-slate-950 border-white/5 text-slate-400 hover:text-white hover:border-white/20'
                    }`}
                  >
                    <div className="flex justify-between items-center w-full mb-1">
                      <span className="font-mono font-black text-sm">ห้อง {r.room_number}</span>
                      <span className="text-xs">{r.recorded ? '✅' : '⏳'}</span>
                    </div>
                    <span className="text-[10px] opacity-70 font-mono">
                      เดิม: {r.previous_reading.toLocaleString()}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Previous Room Reading Card */}
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 flex justify-between items-center">
              <div>
                <span className="text-[10px] font-bold text-slate-400 block uppercase">เลขมิเตอร์เดิม</span>
                <span className="text-xs text-slate-300">ห้อง {currentRoom.room_number} (รอบก่อน)</span>
              </div>
              <span className="text-xl font-mono font-black text-amber-400">
                {prevVal.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Right Column (lg:col-span-8): Camera, Input & Action Panel */}
          <div className="lg:col-span-8 space-y-5">
            
            {/* 1. Camera Box & Capture Card */}
            <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-sm font-black text-white flex items-center gap-2">
                  <span>📸</span>
                  <span>ถ่ายรูปหน้าปัดมิเตอร์ไฟฟ้า (ห้อง {currentRoom.room_number})</span>
                </span>
                {capturedPhoto && (
                  <button
                    onClick={() => setCapturedPhoto(null)}
                    className="text-xs text-rose-400 hover:text-rose-300 font-bold"
                  >
                    ลบรูปถ่าย ✕
                  </button>
                )}
              </div>

              {/* Photo Preview / Capture Frame */}
              <div className="relative h-64 sm:h-80 bg-slate-950 rounded-2xl overflow-hidden border border-white/10 flex items-center justify-center shadow-inner">
                {capturedPhoto ? (
                  <Image
                    src={capturedPhoto}
                    alt="Meter Capture"
                    fill
                    unoptimized
                    className="object-contain p-3"
                  />
                ) : (
                  <div className="text-center space-y-3 text-slate-500 p-6">
                    <span className="text-4xl sm:text-5xl block opacity-60">📷</span>
                    <div>
                      <p className="text-sm font-bold text-slate-300">ยังไม่มีรูปภาพหน้าปัดมิเตอร์</p>
                      <p className="text-xs text-slate-500 mt-1">ใช้กล้องมือถือถ่าย หรือ อัปโหลดรูปภาพเพื่อตรวจอ่านค่าอัตโนมัติ</p>
                    </div>
                  </div>
                )}

                {(isCompressing || isOcrProcessing) && (
                  <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                    <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs sm:text-sm font-bold text-primary">
                      {isCompressing ? 'กำลังบีบอัดภาพ WebP...' : 'AI กำลังประมวลผลตัวเลขมิเตอร์...'}
                    </p>
                  </div>
                )}
              </div>

              {/* Camera / Upload Action Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Rear Camera Capture */}
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={cameraInputRef}
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="py-3.5 px-4 bg-primary hover:bg-primary/90 text-white font-black text-xs sm:text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <span>📷</span>
                  <span>เปิดกล้องถ่ายภาพ</span>
                </button>

                {/* Upload from Gallery / Disk */}
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="py-3.5 px-4 bg-white/10 hover:bg-white/20 text-white font-black text-xs sm:text-sm rounded-2xl border border-white/10 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-95 cursor-pointer"
                >
                  <span>📁</span>
                  <span>เลือกรูปจากคอม / อุปกรณ์</span>
                </button>
              </div>
            </div>

            {/* 2. Reading Input & Calculation Card */}
            <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 shadow-xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-sm font-black text-white">
                  ตัวเลขมิเตอร์ใหม่ (ห้อง {currentRoom.room_number}):
                </label>
                {unitsUsed !== null && unitsUsed >= 0 && (
                  <span className="text-xs sm:text-sm font-mono font-bold text-emerald-400 bg-emerald-950/50 px-3 py-1 rounded-full border border-emerald-500/30">
                    หน่วยที่ใช้: {unitsUsed.toFixed(1)} ยูนิต (฿{(unitsUsed * 4.88).toFixed(2)})
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  type="number"
                  step="0.01"
                  placeholder={`กรอกเลขมิเตอร์ครั้งนี้ (เดิม: ${prevVal})`}
                  value={inputReading}
                  onChange={(e) => setInputReading(e.target.value)}
                  className="w-full bg-slate-950 border border-white/10 rounded-2xl px-5 py-4 text-xl sm:text-2xl font-mono font-black text-white focus:outline-none focus:border-primary tracking-wider"
                />
              </div>

              {/* Alert Feedback Banner */}
              {alertMessage && (
                <div
                  className={`p-4 rounded-2xl text-xs sm:text-sm font-bold border transition-all ${
                    alertType === 'green'
                      ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-300'
                      : alertType === 'yellow'
                      ? 'bg-amber-950/80 border-amber-500/50 text-amber-300'
                      : 'bg-rose-950/80 border-rose-500/50 text-rose-300'
                  }`}
                >
                  {alertMessage}
                </div>
              )}
            </div>

            {/* 3. Action Buttons (Save & Next / Skip) */}
            <div className="space-y-2 pt-2">
              {!capturedPhoto && inputReading && alertType !== 'red' && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-2.5 text-xs text-amber-300 font-bold">
                  <span className="text-base">📸</span>
                  <span>กรุณาถ่ายภาพหรืออัปโหลดรูปหน้าปัดมิเตอร์เพื่อใช้เป็นหลักฐานก่อนกดบันทึก</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => saveReading(false)}
                  disabled={submitting || alertType === 'red' || !inputReading || !capturedPhoto}
                  className={`py-4 px-6 font-black text-sm rounded-2xl shadow-xl transition-all flex items-center justify-center gap-2 active:scale-95 cursor-pointer ${
                    alertType === 'red' || !inputReading || !capturedPhoto
                      ? 'bg-slate-800 text-slate-500 opacity-50 cursor-not-allowed'
                      : alertType === 'yellow'
                      ? 'bg-amber-500 hover:bg-amber-400 text-white shadow-amber-500/20'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/20 hover:scale-[1.01]'
                  }`}
                >
                  {submitting ? (
                    'กำลังบันทึก...'
                  ) : !capturedPhoto ? (
                    <span>📷 ถ่ายภาพเพื่อเปิดใช้งานปุ่มบันทึก</span>
                  ) : isLastRoom ? (
                    <span>🎉 เสร็จสิ้นการจดมิเตอร์ (ห้องสุดท้าย)</span>
                  ) : (
                    <span>
                      {alertType === 'yellow' ? '⚠️ ยืนยันบันทึกค่าไฟ (เกิน 200 หน่วย)' : '✅ บันทึก & ไปห้องถัดไป ⏩'}
                    </span>
                  )}
                </button>

                <button
                  onClick={() => saveReading(true)}
                  disabled={submitting}
                  className="py-4 px-6 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold text-xs sm:text-sm rounded-2xl border border-white/5 transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLastRoom ? 'ข้ามห้องสุดท้าย & เสร็จสิ้น' : '⏭️ ข้ามห้องนี้ (ไม่จด / ไม่ออกบิล)'}
                </button>
              </div>

              {/* Quick Finish Button */}
              {rooms.some(r => r.recorded) && (
                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={handleFinishEarly}
                    disabled={submitting}
                    className="w-full sm:w-auto px-5 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 rounded-2xl text-xs font-black transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>🏁</span>
                    <span>บันทึกเสร็จสิ้นแล้ว {rooms.filter(r => r.recorded).length} ห้อง (กดเพื่อจบการจดมิเตอร์)</span>
                  </button>
                </div>
              )}
            </div>

          </div>
        </div>
      )}

      {/* Excess Confirm Modal for 13.2.3.2 */}
      {showExcessConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-amber-500/40 rounded-3xl max-w-sm w-full p-6 space-y-4 shadow-2xl text-center">
            <span className="text-4xl block">⚠️</span>
            <h3 className="text-base font-black text-white">ยืนยันการบันทึกค่าไฟเกินปกติ?</h3>
            <p className="text-xs text-slate-300">
              ห้อง {currentRoom?.room_number} มีการใช้ไฟฟ้า{' '}
              <strong className="text-amber-400 font-mono text-sm">{unitsUsed?.toFixed(1)} หน่วย</strong> (เกิน 200
              หน่วย)
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowExcessConfirmModal(false)}
                className="flex-1 py-2.5 bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold rounded-xl cursor-pointer"
              >
                ตรวจทานอีกครั้ง
              </button>
              <button
                onClick={() => {
                  setShowExcessConfirmModal(false);
                  saveReading(false);
                }}
                className="flex-1 py-2.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-black rounded-xl shadow-lg cursor-pointer"
              >
                ยืนยันบันทึก
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Finish Session Confirmation Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-emerald-500/40 rounded-3xl max-w-md w-full p-6 space-y-4 shadow-2xl text-center">
            <span className="text-4xl block">🏁</span>
            <h3 className="text-lg font-black text-white">ยืนยันจบการจดมิเตอร์รอบนี้?</h3>
            <div className="p-4 bg-slate-950 rounded-2xl border border-white/5 space-y-2 text-xs text-slate-300">
              <div className="flex justify-between items-center">
                <span>บันทึกสำเร็จแล้ว:</span>
                <strong className="text-emerald-400 font-mono text-sm">
                  {rooms.filter(r => r.recorded).length + (capturedPhoto && inputReading && alertType !== 'red' && !currentRoom?.recorded ? 1 : 0)} ห้อง
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span>ข้าม / ยังไม่ได้จด:</span>
                <strong className="text-amber-400 font-mono text-sm">
                  {rooms.length - (rooms.filter(r => r.recorded).length + (capturedPhoto && inputReading && alertType !== 'red' && !currentRoom?.recorded ? 1 : 0))} ห้อง
                </strong>
              </div>
              {capturedPhoto && inputReading && alertType !== 'red' && !currentRoom?.recorded && (
                <p className="text-[11px] text-emerald-300/90 pt-1 border-t border-white/5">
                  💡 ระบบจะทำการบันทึกห้อง <strong>{currentRoom?.room_number}</strong> ปัจจุบันให้โดยอัตโนมัติ
                </p>
              )}
            </div>
            <p className="text-xs text-slate-400">
              เมื่อกดจบการจดมิเตอร์ ข้อมูลที่บันทึกแล้วจะพร้อมสำหรับการออกบิลค่าเช่าในระบบต่อไป
            </p>
            <div className="flex gap-2 pt-2">
              <button
                onClick={() => setShowFinishModal(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-slate-300 text-xs font-bold rounded-xl transition-all cursor-pointer"
              >
                จดห้องอื่นต่อ
              </button>
              <button
                onClick={confirmFinish}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black rounded-xl shadow-lg transition-all cursor-pointer"
              >
                ยืนยันจบการจดมิเตอร์
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
