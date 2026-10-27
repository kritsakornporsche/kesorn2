'use client';

import ThaiDatePicker, { LeaseShortcuts, LeaseMonthBar } from '@/components/ThaiDatePicker';
import { addDays, leaseEnd, todayTh, detectLeaseMonths } from '@/lib/thai-date';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { MAX_OCCUPANTS, OCCUPANT_CHOICES } from '@/lib/occupants';
import { testRoomsLast } from '@/lib/test-rooms';
import TestRoomBadge from '@/components/TestRoomBadge';
import OccupiedRooms from '@/components/OccupiedRooms';
import PartyFields from '@/components/PartyFields';
import { EMPTY_PARTY, checkParty, joinAddress, joinName, type PartyValue } from '@/lib/contract-party';
import { PHONE_INPUT_PROPS, phoneDigits } from '@/lib/phone';
import { useConfirm } from '@/components/ConfirmModalProvider';

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
  /** an open move-out request (api/rooms) */
  move_out_request_id?: number | null;
}

export default function WalkInTenantModal({ isOpen, onClose, onSuccess }: WalkInModalProps) {
  const { alert } = useConfirm();
  const [step, setStep] = useState(1); // 1: Info, 2: Payment & SlipOK, 3: Completed
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Form State
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  // commit 28-8b: name and address in the contract form's fields (components/PartyFields)
  const [party, setParty] = useState<PartyValue>(EMPTY_PARTY);
  const tenantName = joinName(party);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  // commit 27: occupants of the room (water per person); only the tenant's details are kept
  const [occupants, setOccupants] = useState(1);
  // commit 28-9: today in Thai time (not the UTC date), a 12-month lease ending the day before
  const [startDate, setStartDate] = useState(todayTh());
  const [endDate, setEndDate] = useState(() => leaseEnd(todayTh(), 12));

  // Payment / QR & Slip State
  const [qrData, setQrData] = useState<{ qrImage: string; amount: number; promptpayNumber: string; promptpayName: string } | null>(null);
  const [qrError, setQrError] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  const [slipData, setSlipData] = useState<string | null>(null);
  // Booking fee paid by transfer slip (SlipOK) or in cash on site (receipt from the payment record)
  const [payMethod, setPayMethod] = useState<'slip' | 'cash'>('slip');
  const [roomFee, setRoomFee] = useState<number | null>(null);
  const [cashPaidAt, setCashPaidAt] = useState('');
  const [cashConfirmed, setCashConfirmed] = useState(false);
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
    setParty(EMPTY_PARTY);
    setEmail('');
    setPhone('');
    setParentPhone('');
    setOccupants(1);
    setSlipData(null);
    setSubmitResult(null);
  };

  const fetchAvailableRooms = async () => {
    setLoadingRooms(true);
    try {
      const res = await fetch('/api/rooms?explore=true');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        // commit 28-12: free rooms only — a room being moved out of still has its tenant's contract, which the server
        // refuses (lib/contracts createContractTx); rooms with a tenant are listed below the grid instead
        const available = data.data.filter((r: Room) => (r.display_status || '').toLowerCase() === 'available' && !r.move_out_request_id);
        setRooms(testRoomsLast(available, (r: any) => r.room_number)); // test rooms last (commit 27b)
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

  // Step 1 Validation & Proceed to Step 2
  const handleProceedToPayment = async () => {
    if (!selectedRoomId) {
      await alert({
        title: 'ข้อมูลไม่ครบถ้วน',
        description: 'กรุณาเลือกห้องพักที่ต้องการจอง',
        variant: 'warning',
      });
      return;
    }
    const pc = checkParty(party);
    if (!pc.ok) {
      await alert({
        title: 'ข้อมูลผู้เช่าไม่ถูกต้อง',
        description: pc.message,
        variant: 'warning',
      });
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      await alert({
        title: 'อีเมลไม่ถูกต้อง',
        description: 'กรุณาระบุอีเมลที่ถูกต้องสำหรับสร้างบัญชีผู้ใช้',
        variant: 'warning',
      });
      return;
    }
    if (!phone.trim() || phone.replace(/\D/g, '').length < 9) {
      await alert({
        title: 'เบอร์โทรศัพท์ไม่ถูกต้อง',
        description: 'กรุณาระบุเบอร์โทรศัพท์ของผู้เช่า (ใช้เป็นรหัสผ่านเริ่มต้น)',
        variant: 'warning',
      });
      return;
    }

    // Fetch QR Code for Step 2
    setQrLoading(true);
    setStep(2);
    setCashConfirmed(false);
    // Default time of a cash payment: now, Thai time (YYYY-MM-DDTHH:mm)
    setCashPaidAt(new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16));
    // Booking fee of the room from the server (shown for cash; the QR has its own amount)
    const roomNumber = rooms.find((r) => String(r.id) === String(selectedRoomId))?.room_number;
    setRoomFee(null);
    if (roomNumber) {
      fetch(`/api/rates?roomNumber=${encodeURIComponent(roomNumber)}`)
        .then((r) => r.json())
        .then((d) => { if (d.success && d.room) setRoomFee(Number(d.room.bookingFee)); })
        .catch(() => {});
    }
    try {
      // The booking fee is set by the server for the room (never sent from this page)
      setQrError('');
      const res = await fetch(`/api/booking/qr?roomId=${selectedRoomId}`);
      const data = await res.json();
      if (data.success) {
        setQrData(data);
      } else {
        setQrData(null);
        setQrError(data.message || 'สร้าง QR ไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Fetch QR error:', err);
      setQrError('สร้าง QR ไม่สำเร็จ');
    } finally {
      setQrLoading(false);
    }
  };

  // Slip Upload
  const handleSlipUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        await alert({
          title: 'ไฟล์มีขนาดใหญ่เกินไป',
          description: 'ไฟล์สลิปมีขนาดใหญ่เกินไป (จำกัดไม่เกิน 5MB)',
          variant: 'warning',
        });
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
    if (payMethod === 'cash' && (!cashConfirmed || roomFee === null)) {
      await alert({
        title: 'ยืนยันการรับเงินสด',
        description: 'กรุณาติ๊กยืนยันว่าได้รับเงินสดค่าจองครบแล้ว',
        variant: 'warning',
      });
      return;
    }
    if (payMethod === 'slip' && !slipData) {
      await alert({
        title: 'แนบสลิปการโอนเงิน',
        description: `กรุณาแนบรูปภาพสลิปการโอนเงินค่าจอง${qrData ? ` ฿${qrData.amount.toLocaleString()}` : ''}`,
        variant: 'warning',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));

      // The booking fee is set by the server (bookingFeeFor), so it is not sent from here
      const res = await fetch('/api/owner/tenants/walk-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: selectedRoomId,
          startDate,
          endDate,
          monthlyRent: selectedRoom?.price || 2800,
          ...party,
          tenantName,
          email,
          phone,
          parentPhone,
          tenantAddress: joinAddress(party),
          occupants,
          paymentMethod: payMethod,
          ...(payMethod === 'cash' ? { cashAmount: roomFee, cashPaidAt } : { slipUrl: slipData }),
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
      await alert({
        title: 'เกิดข้อผิดพลาด',
        description: e.message || 'เกิดข้อผิดพลาดในการทำรายการ',
        variant: 'danger',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const selectedRoom = rooms.find((r) => String(r.id) === String(selectedRoomId));
  const depositAmount = qrData?.amount ?? null;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-xs overflow-y-auto overscroll-contain animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-3xl w-full max-w-3xl max-h-[85dvh] flex flex-col overflow-hidden shadow-2xl my-auto">

        {/* Header */}
        <div className="shrink-0 bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🚶</span>
            <div>
              <h2 className="text-lg font-black text-slate-900">เพิ่มผู้เช่าแบบ Walk-in (เคาน์เตอร์หอพัก)</h2>
              <p className="text-xs text-slate-500">สร้างบัญชีผู้เช่า กรอกชื่อ-ที่อยู่ตามบัตรประชาชน และตรวจสลิปค่าจองอัตโนมัติ</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors text-sm cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Step Indicator */}
        <div className="shrink-0 grid grid-cols-3 bg-slate-50 border-b border-slate-200 px-6 py-3 text-xs font-bold">
          <div className={`flex items-center gap-2 ${step === 1 ? 'text-primary' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 1 ? 'bg-primary text-white' : 'bg-slate-200 text-slate-700'}`}>1</span>
            <span>1. ข้อมูลผู้เช่า</span>
          </div>
          <div className={`flex items-center gap-2 ${step === 2 ? 'text-primary' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 2 ? 'bg-primary text-white' : 'bg-slate-200 text-slate-700'}`}>2</span>
            <span>2. ชำระค่าจอง & สลิป</span>
          </div>
          <div className={`flex items-center gap-2 ${step === 3 ? 'text-emerald-600' : 'text-slate-500'}`}>
            <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black ${step === 3 ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-700'}`}>3</span>
            <span>3. บันทึกสำเร็จ</span>
          </div>
        </div>

        {/* Content Body (the only part that scrolls) */}
        <div className="flex-1 min-h-0 overflow-y-auto p-6 sm:p-8 space-y-6">

          {/* STEP 1: Info (name / address typed from the ID card — no OCR, commit 24c) */}
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in">
              
              {/* Room Selection - Grid of Available / Moving Out Rooms */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <span>🚪</span> เลือกห้องพักที่ต้องการจอง (เฉพาะห้องว่าง) <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[11px] font-bold text-emerald-600">
                    {rooms.length} ห้องพร้อมจอง
                  </span>
                </div>

                {loadingRooms ? (
                  <div className="p-4 bg-slate-50 rounded-2xl text-xs text-slate-400 text-center animate-pulse border border-slate-200">
                    กำลังตรวจสอบห้องพักว่าง...
                  </div>
                ) : rooms.length === 0 ? (
                  <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-2xl text-xs text-center font-bold">
                    ⚠️ ไม่มีห้องพักว่างในขณะนี้
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 p-1">
                    {rooms.map((r) => {
                      const isSelected = String(r.id) === String(selectedRoomId);
                      return (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setSelectedRoomId(String(r.id))}
                          className={`p-3 rounded-2xl border text-left transition-all relative overflow-hidden cursor-pointer ${
                            isSelected
                              ? 'bg-primary/10 border-primary text-primary shadow-xs scale-[1.02]'
                              : 'bg-white hover:bg-slate-50 border-slate-200 text-slate-700 hover:border-slate-300 shadow-xs'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-sm text-slate-900">ห้อง {r.room_number}<TestRoomBadge roomNumber={r.room_number} /></span>
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center justify-between">
                            <span>ชั้น {r.floor || 1}</span>
                            <span className="font-bold text-primary">฿{Number(r.price).toLocaleString()}</span>
                          </div>
                          <div className="mt-1">
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              🟢 ว่างพร้อมอยู่
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
                <OccupiedRooms tone="theme" />
              </div>

              {/* Form Input Fields */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <PartyFields
                    value={party}
                    onChange={setParty}
                    inputClass="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
                    labelClass="text-xs font-bold text-slate-700"
                    hintClass="text-[11px] text-slate-500"
                  />
                  <p className="text-[10px] text-slate-500">คำนำหน้า + ชื่อ + นามสกุล ใช้เป็นชื่อบัญชีผู้ใช้</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    อีเมลผู้เช่า <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    placeholder="เช่น user@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
                  />
                  <p className="text-[10px] text-slate-500">ใช้สำหรับล็อกอินเข้าระบบ</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    เบอร์โทรศัพท์ผู้เช่า <span className="text-red-500">*</span>
                  </label>
                  <input
                    placeholder="เช่น 0636040550"
                    value={phone}
                    {...PHONE_INPUT_PROPS}
                    onChange={(e) => setPhone(phoneDigits(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
                  />
                  <p className="text-[10px] text-emerald-600 font-semibold">🔒 เบอร์นี้จะถูกใช้เป็นรหัสผ่านเริ่มต้น</p>
                </div>

                <div className="space-y-1.5 sm:col-span-2">
                  <label className="text-xs font-bold text-slate-700">
                    เบอร์โทรผู้ปกครอง / ผู้ติดต่อฉุกเฉิน
                  </label>
                  <input
                    placeholder="เช่น 0812345678"
                    value={parentPhone}
                    {...PHONE_INPUT_PROPS}
                    onChange={(e) => setParentPhone(phoneDigits(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">จำนวนผู้พัก (1–{MAX_OCCUPANTS} คน)</label>
                  <select
                    value={occupants}
                    onChange={(e) => setOccupants(Number(e.target.value))}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                  >
                    {OCCUPANT_CHOICES.map((n) => <option key={n} value={n}>{n} คน</option>)}
                  </select>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">ระยะเวลาสัญญา</span>
                    <span className="text-xs font-black text-primary bg-primary/10 px-2 py-0.5 rounded-full border border-primary/20">
                      สัญญา {detectLeaseMonths(startDate, endDate)} เดือน
                    </span>
                  </div>
                  <LeaseMonthBar start={startDate} end={endDate} onEnd={setEndDate} />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">วันเริ่มสัญญา / เข้าพัก</label>
                  <ThaiDatePicker
                    aria-label="วันเริ่มสัญญา"
                    min={todayTh()}
                    value={startDate}
                    onChange={(v) => {
                      setStartDate(v);
                      if (v) {
                        const m = detectLeaseMonths(startDate, endDate);
                        setEndDate(leaseEnd(v, m));
                      }
                    }}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-slate-700">วันสิ้นสุดสัญญา</label>
                  <ThaiDatePicker
                    aria-label="วันสิ้นสุดสัญญา"
                    min={startDate ? addDays(startDate, 1) : todayTh()}
                    value={endDate}
                    onChange={setEndDate}
                    className="w-full bg-white border border-slate-300 rounded-xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-primary shadow-xs"
                  />
                </div>
              </div>

            </div>
          )}

          {/* STEP 2: Payment & SlipOK */}
          {step === 2 && (
            <div className="space-y-6 animate-in fade-in">
              {/* Payment method */}
              <div className="flex gap-2" role="radiogroup" aria-label="วิธีชำระค่าจอง">
                {([['slip', '📱 โอนเงิน + แนบสลิป'], ['cash', '💵 รับเงินสด']] as const).map(([m, label]) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={payMethod === m}
                    onClick={() => setPayMethod(m)}
                    className={`flex-1 px-4 py-2.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${payMethod === m ? 'bg-primary text-white border-primary shadow-xs' : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                
                {/* QR Code */}
                {payMethod === 'slip' ? (
                <div className="md:col-span-5 bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center space-y-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">สแกนจ่ายเงินจอง</span>
                  <div className="relative w-48 h-48 mx-auto bg-white p-2 rounded-2xl shadow-sm border border-slate-200">
                    {qrLoading ? (
                      <div className="w-full h-full flex items-center justify-center text-slate-800 text-xs font-bold animate-pulse">
                        กำลังสร้าง QR...
                      </div>
                    ) : qrData?.qrImage ? (
                      <img src={qrData.qrImage} alt="PromptPay QR" className="w-full h-full object-contain p-2" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-rose-600 text-xs font-bold p-2">
                        {qrError || 'สร้าง QR ไม่สำเร็จ'}
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-xl font-black text-slate-900">{depositAmount !== null ? `฿${depositAmount.toLocaleString()}` : '-'}</span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {qrData?.promptpayName || '-'} • พร้อมเพย์ {qrData?.promptpayNumber || '-'}
                    </p>
                  </div>

                  {qrData && (
                    <div className="pt-2">
                      <PromptPayBankSelector
                        qrImage={qrData.qrImage}
                        promptpayNumber={qrData.promptpayNumber}
                        promptpayName={qrData.promptpayName}
                        amount={qrData.amount}
                        fileName={`deposit-walkin-room-${selectedRoom?.room_number || 'T01'}.png`}
                      />
                    </div>
                  )}
                </div>
                ) : (
                <div className="md:col-span-5 bg-slate-50 p-6 rounded-2xl border border-slate-200 text-center space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">รับเงินสดค่าจอง</span>
                  <p className="text-3xl font-black text-slate-900">{roomFee !== null ? `฿${roomFee.toLocaleString('th-TH')}` : '...'}</p>
                  <p className="text-[11px] text-slate-500">ยอดตามที่ระบบกำหนดสำหรับห้อง {selectedRoom?.room_number} · ระบบออกใบเสร็จให้หลังบันทึก</p>
                </div>
                )}

                {/* Slip Upload & Summary */}
                <div className="md:col-span-7 space-y-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-500">ห้องพัก:</span>
                      <span className="font-bold text-slate-900">ห้อง {selectedRoom?.room_number}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">ผู้เช่า:</span>
                      <span className="font-bold text-slate-900">{tenantName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">เบอร์โทร (รหัสผ่าน):</span>
                      <span className="font-bold text-emerald-700">{phone}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500">อีเมล:</span>
                      <span className="font-bold text-slate-900">{email}</span>
                    </div>
                  </div>

                  {payMethod === 'cash' ? (
                    <div className="space-y-3">
                      <label className="block space-y-1">
                        <span className="text-xs font-bold text-slate-700">วันเวลาที่รับเงิน (เวลาไทย)</span>
                        <input
                          type="datetime-local"
                          value={cashPaidAt}
                          max={new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 16)}
                          onChange={(e) => setCashPaidAt(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 shadow-xs"
                        />
                      </label>
                      <label className="flex items-start gap-2 p-3 rounded-xl border border-amber-200 bg-amber-50 text-xs text-amber-800 cursor-pointer">
                        <input type="checkbox" checked={cashConfirmed} onChange={(e) => setCashConfirmed(e.target.checked)} className="mt-0.5" />
                        <span>ได้รับเงินสดค่าจอง {roomFee !== null ? `฿${roomFee.toLocaleString('th-TH')}` : ''} ครบถ้วนแล้ว (บันทึกในชื่อผู้รับเงินคือบัญชีของคุณ)</span>
                      </label>
                    </div>
                  ) : (
                  <>
                  {/* Slip Upload Box */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700">
                      แนบรูปภาพสลิปโอนเงิน (SlipOK ตรวจสอบอัตโนมัติ) <span className="text-red-500">*</span>
                    </label>
                    <label className="border-2 border-dashed border-slate-300 hover:border-primary rounded-2xl p-6 flex flex-col items-center justify-center gap-2 cursor-pointer bg-slate-50 hover:bg-slate-100 transition-all text-center">
                      <span className="text-2xl">🧾</span>
                      <span className="text-xs font-bold text-slate-800">
                        {slipData ? '✓ อัปโหลดสลิปเรียบร้อยแล้ว (กดเพื่อเปลี่ยน)' : 'กดเพื่อเลือกรูปภาพสลิป'}
                      </span>
                      <span className="text-[10px] text-slate-500">รองรับไฟล์ JPG, PNG ขนาดไม่เกิน 5MB</span>
                      <input type="file" accept="image/*" onChange={handleSlipUpload} className="hidden" />
                    </label>
                  </div>

                  {slipData && (
                    <div className="relative aspect-[3/4] max-h-40 rounded-xl overflow-hidden border border-slate-200 mx-auto shadow-xs">
                      <Image src={slipData} alt="Uploaded Slip" fill className="object-cover" />
                    </div>
                  )}
                  </>
                  )}
                </div>

              </div>

            </div>
          )}

          {/* STEP 3: Completed */}
          {step === 3 && (
            <div className="text-center py-6 space-y-6 animate-in fade-in">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full flex items-center justify-center text-3xl mx-auto shadow-sm">
                ✓
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-widest text-emerald-700">Walk-in สำเร็จ</span>
                <h3 className="text-2xl font-black text-slate-900">บันทึกข้อมูลและล็อกห้องพักสำเร็จ</h3>
                <p className="text-xs text-slate-600 max-w-md mx-auto">
                  ระบบได้สร้างบัญชีผู้เช่า {submitResult?.paymentMethod === 'cash' ? 'บันทึกรับเงินสดค่าจอง' : 'ตรวจสอบสลิปค่าจอง'} และปรับสถานะห้อง {submitResult?.roomNumber} เป็น <strong>ติดจอง</strong> เรียบร้อยแล้ว
                </p>
                {submitResult?.paymentId && (
                  <a
                    href={`/receipt/${submitResult.paymentId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-colors cursor-pointer"
                  >
                    🧾 พิมพ์ใบเสร็จค่าจอง
                  </a>
                )}
              </div>

              {/* Account Details Card for Tenant */}
              <div className="max-w-md mx-auto bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left space-y-3">
                <span className="text-xs font-black text-primary flex items-center gap-1.5">
                  <span>🔑</span> ข้อมูลเข้าสู่ระบบของผู้เช่า (ส่งให้ผู้เช่าล็อกอินได้ทันที)
                </span>
                <div className="space-y-1.5 text-xs bg-white p-3 rounded-xl border border-slate-200 shadow-xs font-mono">
                  <div className="flex justify-between">
                    <span className="text-slate-500">URL เข้าสู่ระบบ:</span>
                    <span className="text-slate-900 font-bold">/signin</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">อีเมล (Username):</span>
                    <span className="text-cyan-700 font-bold">{submitResult?.email}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">รหัสผ่านเริ่มต้น:</span>
                    <span className="text-emerald-700 font-bold">{submitResult?.defaultPassword}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-slate-200">
                    <span className="text-slate-500">สถานะ:</span>
                    <span className="text-amber-700 font-bold">Guest (รอจัดทำสัญญา)</span>
                  </div>
                </div>
              </div>

            </div>
          )}

        </div>

        {/* Footer: buttons of the current step, always visible */}
        {step === 1 && (
          <div className="shrink-0 flex justify-end gap-3 px-6 py-4 border-t border-slate-200 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="button"
              onClick={handleProceedToPayment}
              className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-black rounded-xl text-xs shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              ถัดไป: สแกนจ่ายค่าจอง →
            </button>
          </div>
        )}
        {step === 2 && (
          <div className="shrink-0 flex justify-between items-center gap-3 px-6 py-4 border-t border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs border border-slate-200 transition-colors cursor-pointer"
            >
              ← ย้อนกลับ
            </button>
            <div className="flex items-center gap-3">
              {payMethod === 'slip' && !qrLoading && !qrData && (
                <span className="text-[11px] font-bold text-rose-500">สร้าง QR ไม่ได้ — ยืนยันการจองไม่ได้</span>
              )}
              <button
                type="button"
                disabled={isSubmitting || (payMethod === 'cash' ? !cashConfirmed || roomFee === null : !slipData || qrLoading || !qrData)}
                onClick={handleFinalSubmit}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 text-white font-black rounded-xl text-xs shadow-xs transition-all hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
              >
                <span>{isSubmitting ? '⏳ กำลังบันทึก...' : payMethod === 'cash' ? '✓ บันทึกรับเงินสด & ยืนยันการจอง Walk-in' : '✓ ตรวจสลิป & ยืนยันการจอง Walk-in'}</span>
              </button>
            </div>
          </div>
        )}
        {step === 3 && (
          <div className="shrink-0 flex justify-center px-6 py-4 border-t border-slate-200 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs shadow-xs transition-all cursor-pointer"
            >
              เสร็จสิ้น / ปิดหน้าต่าง
            </button>
          </div>
        )}

      </div>

    </div>
  );
}
