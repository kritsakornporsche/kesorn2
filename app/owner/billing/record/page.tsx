'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';
import { useRates } from '@/lib/use-rates';
import { ratesForRoom } from '@/lib/billing';
import TestRoomBadge from '@/components/TestRoomBadge';
import { testRoomSuffix, testRoomsLast } from '@/lib/test-rooms';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

interface RoomRecord {
  id: number;
  room_number: string;
  floor: number;
  room_type: string;
  previous_reading: number | null;
  rollover_default: number | null;
  recorded: boolean;
  current_reading?: number;
  photo_url?: string;
  iot_kwh?: number | null;
  iot_online?: boolean;
}

type MeterEvent = 'normal' | 'rollover' | 'replaced';
const LARGE_UNITS = 200;
const round2 = (n: number) => Math.round(n * 100) / 100;
const stepOf = (n: number) => {
  const decimals = (String(n).split('.')[1] || '').length;
  return decimals === 0 ? 1 : decimals === 1 ? 0.1 : 0.01;
};
const thaiMonth = (cycle: string) => {
  const [y, m] = cycle.split('-').map(Number);
  if (!y || !m) return cycle;
  return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' });
};

export default function BillingRecordPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<RoomRecord[]>([]);
  const rates = useRates();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [syncingAllIot, setSyncingAllIot] = useState(false);
  const [billingCycle, setBillingCycle] = useState('');

  // Current room input state
  const [inputReading, setInputReading] = useState<string>('');
  const [inputPrevious, setInputPrevious] = useState<string>('');
  const [meterEvent, setMeterEvent] = useState<MeterEvent>('normal');
  const [rolloverAt, setRolloverAt] = useState<string>('');
  const [oldMeterFinal, setOldMeterFinal] = useState<string>('');
  const [newMeterStart, setNewMeterStart] = useState<string>('');
  const [eventNote, setEventNote] = useState<string>('');
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showExcessConfirmModal, setShowExcessConfirmModal] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'warning') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const [res, iotRes] = await Promise.all([
        fetch('/api/owner/meters/summary'),
        fetch('/api/features/iot-meter').catch(() => null),
      ]);

      const data = await res.json();
      let iotMap = new Map<string, any>();
      if (iotRes && iotRes.ok) {
        try {
          const iData = await iotRes.json();
          if (iData.success && Array.isArray(iData.rooms)) {
            iData.rooms.forEach((r: any) => {
              iotMap.set(String(r.roomNumber).toUpperCase(), r);
            });
          }
        } catch (err) {
          console.warn('Parse IoT failed:', err);
        }
      }

      if (data.success) {
        setBillingCycle(data.cycle || '');
        const formatted: RoomRecord[] = (data.data || [])
          .filter((r: any) => r.needs_reading && r.can_record)
          .map((r: any) => {
            const iot = iotMap.get(String(r.room_number).toUpperCase());
            return {
              id: r.room_id,
              room_number: r.room_number,
              floor: r.floor,
              room_type: r.room_type,
              previous_reading: r.previous_for_record === null || r.previous_for_record === undefined ? null : Number(r.previous_for_record),
              rollover_default: r.rollover_default ?? null,
              recorded: !!r.cycle_reading,
              current_reading: r.cycle_reading ? Number(r.cycle_reading.current) : undefined,
              photo_url: r.cycle_reading?.photo_url || undefined,
              iot_kwh: iot ? Number(iot.currentMeterKwh) : null,
              iot_online: iot ? (iot.esp32Meta?.espStatus === 'ONLINE' || iot.esp32Meta?.isHardwareConnected === true) : false,
            };
          });

        formatted.sort((a, b) => Number(a.recorded) - Number(b.recorded));
        setRooms(testRoomsLast(formatted, (r: any) => r.room_number));
        setCurrentIndex(0);
      }
    } catch (e) {
      console.error('Fetch rooms error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/billing/record');
      return;
    }
    fetchRooms();
  }, [authStatus, router]);

  const currentRoom = rooms[currentIndex] || null;
  const isLastRoom = currentIndex === rooms.length - 1;

  // Sync inputs when switching room (Auto-populate from ESP32 IoT if unrecorded)
  useEffect(() => {
    if (currentRoom) {
      const initialReading = currentRoom.current_reading !== undefined 
        ? String(currentRoom.current_reading) 
        : (currentRoom.iot_kwh !== null && currentRoom.iot_kwh !== undefined)
          ? String(currentRoom.iot_kwh)
          : '';
      setInputReading(initialReading);
      setCapturedPhoto(null);
      setInputPrevious('');
      setMeterEvent('normal');
      setRolloverAt(currentRoom.rollover_default !== null ? String(currentRoom.rollover_default) : '');
      setOldMeterFinal('');
      setNewMeterStart('');
      setEventNote('');
      setServerError(null);
    }
  }, [currentIndex, rooms.length]);

  // Pull current room reading from ESP32 IoT
  const handleFillFromIot = () => {
    if (!currentRoom) return;
    if (currentRoom.iot_kwh !== null && currentRoom.iot_kwh !== undefined) {
      setInputReading(String(currentRoom.iot_kwh));
      showToast(`⚡ ดึงค่ามิเตอร์จาก ESP32 ห้อง ${currentRoom.room_number}: ${currentRoom.iot_kwh} kWh`, 'success');
    } else {
      showToast('ไม่พบข้อมูล ESP32 ของห้องนี้ กรุณากรอกด้วยตนเองหรือถ่ายรูป', 'warning');
    }
  };

  // One-Click: Auto-fill all rooms from ESP32 IoT & Auto Save
  const handleAutoFillAllIot = async () => {
    setSyncingAllIot(true);
    try {
      const res = await fetch('/api/features/iot-meter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute_auto_billing',
          syncToDb: true,
          billingCycle: billingCycle || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast('✓ ดึงค่าและบันทึกมิเตอร์จาก ESP32 ทุกห้องสำเร็จ พร้อมออกบิลแล้ว', 'success');
        setTimeout(() => {
          router.push('/owner/billing');
        }, 1200);
      } else {
        showToast(data.message || 'ซิงค์ไม่สำเร็จ', 'error');
      }
    } catch (err: any) {
      showToast('เกิดข้อผิดพลาด: ' + err.message, 'error');
    } finally {
      setSyncingAllIot(false);
    }
  };

  // Compress image
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
          const dataUrl = canvas.toDataURL('image/webp', 0.8);
          resolve(dataUrl);
        };
        img.onerror = (err: any) => reject(err);
      };
      reader.onerror = (err) => reject(err);
    });
  };

  // OCR
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsCompressing(true);
    try {
      const compressedWebP = await compressImage(file);
      setCapturedPhoto(compressedWebP);
      setIsCompressing(false);
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
    } finally {
      e.target.value = '';
    }
  };

  const num = (v: string) => (v.trim() === '' || isNaN(Number(v)) ? null : Number(v));
  const prevVal = currentRoom?.previous_reading ?? num(inputPrevious);
  const currentVal = num(inputReading);
  let unitsUsed: number | null = null;
  let eventError = '';
  if (currentVal !== null && prevVal !== null) {
    if (meterEvent === 'normal') {
      unitsUsed = currentVal >= prevVal ? round2(currentVal - prevVal) : null;
    } else if (meterEvent === 'rollover') {
      const max = num(rolloverAt);
      if (max === null || max < prevVal) eventError = `เลขสูงสุดต้องไม่น้อยกว่าเลขก่อนหน้า (${prevVal})`;
      else if (currentVal >= prevVal) eventError = 'มิเตอร์วนรอบ: เลขใหม่ต้องน้อยกว่าเลขก่อนหน้า';
      else if (currentVal > max) eventError = 'เลขใหม่ต้องไม่เกินเลขสูงสุด';
      else unitsUsed = round2(max - prevVal + stepOf(max) + currentVal);
    } else {
      const oldFinal = num(oldMeterFinal);
      const newStart = num(newMeterStart);
      if (oldFinal === null || newStart === null) eventError = 'กรอกเลขสุดท้ายเครื่องเก่าและเลขเริ่มเครื่องใหม่';
      else if (oldFinal < prevVal) eventError = `เลขสุดท้ายเครื่องเก่าต้องไม่น้อยกว่าเลขก่อนหน้า (${prevVal})`;
      else if (currentVal < newStart) eventError = 'เลขใหม่ต้องไม่น้อยกว่าเลขเริ่มเครื่องใหม่';
      else unitsUsed = round2(oldFinal - prevVal + (currentVal - newStart));
    }
  }

  let alertType: 'green' | 'yellow' | 'red' | 'neutral' = 'neutral';
  let alertMessage = '';

  if (currentVal !== null && prevVal !== null) {
    if (meterEvent === 'normal' && currentVal < prevVal) {
      alertType = 'red';
      alertMessage = '🔴 เลขใหม่น้อยกว่าเลขก่อนหน้า';
    } else if (eventError) {
      alertType = 'red';
      alertMessage = `🔴 ${eventError}`;
    } else if (unitsUsed !== null && unitsUsed > LARGE_UNITS) {
      alertType = 'yellow';
      alertMessage = `🟡 ค่ามากกว่าปกติ (${unitsUsed.toFixed(1)} หน่วย เกิน ${LARGE_UNITS} หน่วย) ต้องยืนยันก่อนบันทึก`;
    } else if (unitsUsed !== null) {
      alertType = 'green';
      alertMessage = `🟢 ${unitsUsed.toFixed(1)} หน่วย ปกติพร้อมบันทึก`;
    }
  }

  const readingBody = (confirmLarge: boolean) => ({
    room_id: currentRoom?.id,
    current_reading: inputReading.trim(),
    event: meterEvent,
    rollover_at: meterEvent === 'rollover' ? rolloverAt.trim() : undefined,
    old_meter_final: meterEvent === 'replaced' ? oldMeterFinal.trim() : undefined,
    new_meter_start: meterEvent === 'replaced' ? newMeterStart.trim() : undefined,
    event_note: meterEvent !== 'normal' ? eventNote.trim() : undefined,
    previous_if_none: currentRoom?.previous_reading === null ? inputPrevious.trim() : undefined,
    confirm_large: confirmLarge,
    photo: capturedPhoto || undefined,
  });

  const saveReading = async (skip = false, confirmLarge = false) => {
    if (!currentRoom) return;
    setServerError(null);

    if (!skip) {
      if (alertType === 'red' || unitsUsed === null) {
        showToast(alertMessage || 'กรุณากรอกเลขมิเตอร์ให้ครบถ้วน', 'error');
        return;
      }
      if (alertType === 'yellow' && !confirmLarge) {
        setShowExcessConfirmModal(true);
        return;
      }
    }

    setSubmitting(true);
    try {
      if (!skip) {
        const res = await fetch('/api/owner/meters', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(readingBody(confirmLarge)),
        });

        const resData = await res.json();
        if (!res.ok || !resData.success) {
          setServerError(resData.message || 'ไม่สามารถบันทึกข้อมูลมิเตอร์ได้');
          return;
        }
        showToast(`✅ ${resData.message}`, 'success');

        setRooms((prev) =>
          prev.map((r, i) =>
            i === currentIndex
              ? { ...r, recorded: true, current_reading: Number(resData.data.current) }
              : r
          )
        );
      }

      if (isLastRoom) {
        const totalRecorded = rooms.filter((r, i) => (i === currentIndex ? !skip || r.recorded : r.recorded)).length;
        showToast(`🎉 จดบิลรอบ ${billingCycle} เสร็จแล้ว ${totalRecorded} ห้อง กำลังนำกลับไปหน้าบิล...`, 'success');
        setTimeout(() => {
          router.push('/owner/billing');
        }, 1500);
      } else {
        setCurrentIndex((prev) => prev + 1);
        setShowExcessConfirmModal(false);
      }
    } catch (err: any) {
      setServerError('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const recordedCount = rooms.filter((r) => r.recorded).length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-8 space-y-6">
      {/* Toast Alert */}
      {toast && (
        <div className={`fixed top-6 right-6 z-50 px-6 py-4 rounded-2xl shadow-2xl font-bold text-sm border flex items-center gap-3 transition-all ${
          toast.type === 'success' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' :
          toast.type === 'warning' ? 'bg-amber-50 border-amber-300 text-amber-800' :
          'bg-rose-50 border-rose-300 text-rose-800'
        }`}>
          <span>{toast.type === 'success' ? '✅' : toast.type === 'warning' ? '⚠️' : '❌'}</span>
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div className="flex items-center gap-4">
          <Link
            href="/owner/billing"
            className="w-10 h-10 rounded-2xl bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 flex items-center justify-center font-bold transition-all shadow-xs cursor-pointer"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-primary font-bold">
              <span>ระบบจดบิลรายเดือน (Monthly Billing Flow)</span>
              <span>•</span>
              <span>{thaiMonth(billingCycle)}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              จดเลขมิเตอร์และเตรียมออกบิล ({recordedCount}/{rooms.length} ห้อง)
            </h1>
          </div>
        </div>

        {/* Global Auto-Fill Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleAutoFillAllIot}
            disabled={syncingAllIot}
            className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-teal-600 hover:from-cyan-500 hover:to-teal-500 text-white font-black text-xs sm:text-sm rounded-xl shadow-xs transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
            title="ดึงเลขมิเตอร์สะสมล่าสุดจากโหนด ESP32 ทุกห้องและบันทึกอัตโนมัติ"
          >
            <span>⚡</span>
            <span>{syncingAllIot ? 'กำลังดึงค่า...' : 'ดึงค่า ESP32 อัตโนมัติทุกห้อง'}</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="p-16 text-center text-slate-500 font-bold animate-pulse">กำลังโหลดข้อมูลห้องพัก...</div>
      ) : rooms.length === 0 ? (
        <div className="p-16 text-center text-slate-500 font-bold bg-white rounded-3xl border border-slate-200 shadow-xs space-y-3">
          <span className="text-4xl block">🎉</span>
          <p className="text-base text-slate-900 font-black">จดเลขมิเตอร์ครบทุกห้องที่มีสัญญาแล้วสำหรับรอบนี้</p>
          <Link
            href="/owner/billing"
            className="inline-block px-5 py-2.5 bg-primary hover:bg-primary-hover text-white font-bold text-xs rounded-xl shadow-xs"
          >
            ไปหน้าออกบิลและแจ้งเตือนผู้เช่า →
          </Link>
        </div>
      ) : (
        <div className="max-w-3xl mx-auto space-y-6">
          {/* Room Progress Navigator */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
            {rooms.map((r, idx) => (
              <button
                key={r.id}
                onClick={() => setCurrentIndex(idx)}
                className={`px-3 py-1.5 rounded-xl font-mono text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                  currentIndex === idx
                    ? 'bg-primary text-white shadow-xs'
                    : r.recorded
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {r.recorded ? '✓ ' : ''}{r.room_number}
              </button>
            ))}
          </div>

          {/* Current Room Form Card */}
          {currentRoom && (
            <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-black text-slate-900 font-mono">
                      ห้อง {currentRoom.room_number}
                    </h2>
                    <span className="text-xs font-bold text-slate-500">
                      (ชั้น {currentRoom.floor} • {currentRoom.room_type})
                    </span>
                    <TestRoomBadge roomNumber={currentRoom.room_number} />
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    เลขก่อนหน้า: <strong className="font-mono text-slate-800">{prevVal ?? '-'}</strong> kWh
                  </p>
                </div>

                {/* IoT Quick Pull */}
                {currentRoom.iot_kwh !== null && (
                  <button
                    onClick={handleFillFromIot}
                    className="px-4 py-2 rounded-xl bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>⚡</span>
                    <span>ดึงค่า ESP32: <strong>{currentRoom.iot_kwh}</strong></span>
                  </button>
                )}
              </div>

              {/* Main Reading Input */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-xs font-black uppercase tracking-wider text-slate-500">
                      เลขมิเตอร์ครั้งนี้ (Current Reading)
                    </label>
                    {currentRoom.iot_kwh !== null && inputReading === String(currentRoom.iot_kwh) && (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-bold border border-emerald-300 flex items-center gap-1 animate-fade-in">
                        <span>⚡</span>
                        <span>ดึงค่าอัตโนมัติจาก ESP32 ({currentRoom.iot_kwh} kWh)</span>
                      </span>
                    )}
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    value={inputReading}
                    onChange={(e) => setInputReading(e.target.value)}
                    placeholder="กรอกตัวเลขมิเตอร์..."
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-2xl font-black font-mono text-slate-900 focus:outline-none focus:border-primary shadow-inner"
                  />
                </div>

                {/* Units & Calculation Preview */}
                {unitsUsed !== null && (
                  <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                    <span className="text-slate-600 font-bold">หน่วยที่ใช้รอบนี้:</span>
                    <span className="text-lg font-black font-mono text-emerald-700">
                      {unitsUsed} หน่วย
                    </span>
                  </div>
                )}

                {/* Status Alert */}
                {alertMessage && (
                  <p className={`text-xs font-bold ${alertType === 'red' ? 'text-rose-600' : alertType === 'yellow' ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {alertMessage}
                  </p>
                )}

                {/* Camera / Upload OCR Actions */}
                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    disabled={isCompressing || isOcrProcessing}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>📸</span>
                    <span>{isOcrProcessing ? 'กำลังอ่าน OCR...' : 'ถ่ายรูปหน้าปัด'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isCompressing || isOcrProcessing}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span>🖼️</span>
                    <span>อัปโหลดรูป</span>
                  </button>

                  {capturedPhoto && (
                    <span className="text-xs text-emerald-700 font-bold">✓ แนบรูปแล้ว</span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => saveReading(true)}
                  disabled={submitting}
                  className="px-4 py-2.5 rounded-xl text-slate-500 hover:text-slate-800 font-bold text-xs transition-all cursor-pointer"
                >
                  ข้ามห้องนี้ →
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => saveReading(false, false)}
                    disabled={submitting || !inputReading}
                    className="px-6 py-3 rounded-2xl bg-primary hover:bg-primary-hover text-white font-black text-xs sm:text-sm shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer disabled:opacity-40"
                  >
                    {submitting ? 'กำลังบันทึก...' : isLastRoom ? 'บันทึกและเสร็จสิ้น' : 'บันทึกและไปห้องถัดไป →'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
