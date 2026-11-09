'use client';

import ThaiDatePicker, { LeaseShortcuts, LeaseMonthBar } from '@/components/ThaiDatePicker';
import { addDays, leaseEnd, todayTh, detectLeaseMonths, ymdTh, thaiDate } from '@/lib/thai-date';
import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatWidget from '@/app/components/ChatWidget';
import ContractSimulator from '@/app/components/ContractSimulator';
import { formatBaht } from '@/lib/format';
import PrintableContractModal from '@/components/PrintableContractModal';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { BOOKING_REQUEST_NOTE } from '@/lib/booking-text';
import { roomTypeLabel } from '@/lib/room-types';
import { itemsForRoomType } from '@/lib/room-items';
import { TEST_ROOM_PAGE_BADGE, isTestRoom } from '@/lib/test-rooms';
import { MAX_OCCUPANTS, OCCUPANT_CHOICES } from '@/lib/occupants';
import { mapDirectUrl, mapEmbedUrl } from '@/lib/maps';
import { PHONE_INPUT_PROPS, phoneDigits } from '@/lib/phone';
import PartyFields from '@/components/PartyFields';
import { ADDRESS_FIELDS, EMPTY_PARTY, checkParty, joinAddress, joinName, partyFromText, type PartyValue } from '@/lib/contract-party';
import { useConfirm } from '@/components/ConfirmModalProvider';

export default function RoomBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;
  const { data: session, status: sessionStatus } = useSession();
  const { confirm, alert } = useConfirm();
  
  const [room, setRoom] = useState<any>(null);
  // Rates, deposit and booking fee for this room from the server (lib/billing moveInCosts) — no amounts in the page
  const [costs, setCosts] = useState<{ rent: number; deposit: number; bookingFee: number; dueAtMoveIn: number; rates: { electricityPerUnit: number; waterPerPerson: number; commonFee: number; lateFeePerDay: number } } | null>(null);
  const [step, setStep] = useState(1); // 1: Info, 2: Info & Dates, 3: Tenant name / address (typed) & Contract Review, 4: QR Payment & Slip, 5: Finished
  const [loading, setLoading] = useState(true);
  const [bookingData, setBookingData] = useState({
    name: '',
    phone: '',
    parent_phone: '',
    email: '',
    // commit 28-9: today in Thai time (not the UTC date), a 12-month lease ending the day before
    start_date: todayTh(),
    end_date: leaseEnd(todayTh(), 12),
    id_card_address: '',
    id_card_image: '',
    occupants: 1,
    // commit 28-8b: the name and address in the contract form's fields (components/PartyFields); name / id_card_address /
    // village are their one-line forms (preview and older drafts)
    ...EMPTY_PARTY,
    village: '',
  });
  const partyOf = (d: typeof bookingData): PartyValue => ({
    title: d.title, firstName: d.firstName, lastName: d.lastName,
    ...(Object.fromEntries(ADDRESS_FIELDS.map((f) => [f.key, (d as any)[f.key] ?? ''])) as any),
  });
  const setParty = (p: PartyValue) => setBookingData((prev) => ({ ...prev, ...p, name: joinName(p), id_card_address: joinAddress(p), village: p.moo }));
  const partyCheck = checkParty(partyOf(bookingData));
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [createdContractId, setCreatedContractId] = useState<number | string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // QR Code & Slip Payment States
  const [contractSignature, setContractSignature] = useState<string>('CONFIRMED_E_CONTRACT');

  const router = useRouter();

  const getImagesArray = (imageParam: string | null) => {
    if (!imageParam) return ['/images/kesorn/room-bed.jpg'];
    try {
      if (imageParam.startsWith('[') && imageParam.endsWith(']')) {
        return JSON.parse(imageParam);
      }
      return [imageParam];
    } catch (e) {
      return [imageParam];
    }
  };

  const handleOpenChat = () => {
    if (!session) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (room?.dorm_id) {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { dormId: Number(room.dorm_id) } }));
    }
    const btn = document.getElementById('open-chat-widget-btn');
    if (btn) {
      btn.click();
    }
  };

  useEffect(() => {
    if (!room?.room_number) return;
    fetch(`/api/rates?roomNumber=${encodeURIComponent(room.room_number)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.room) setCosts(json.room);
      })
      .catch(() => {});
  }, [room?.room_number]);

  useEffect(() => {
    async function fetchRoom() {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        const data = await res.json();
        if (data.success) setRoom(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchRoom();
  }, [roomId]);

  const isAvailable = room?.status?.toLowerCase() === 'available' || room?.status === 'ว่าง' || room?.display_status === 'Available';
  const isMovingOut = room?.status === 'MovingOut' || room?.status === 'Moving Out' || room?.status === 'กำลังจะย้ายออก' || room?.display_status === 'MovingOut' || Boolean(room?.move_out_date);
  const isRoomAvailable = isAvailable || isMovingOut;

  // Calculate minimum available date (availableFromDate / minStartDate)
  const rawReady = room?.ready_to_occupy_date ? String(room.ready_to_occupy_date).slice(0, 10) : '';
  const rawMoveOut = room?.move_out_date ? addDays(String(room.move_out_date).slice(0, 10), 1) : '';
  const today = todayTh();
  const minStartDate = [today, rawReady, rawMoveOut].filter(Boolean).sort().pop() || today;

  // Auto-adjust start_date if current start_date is before minStartDate
  useEffect(() => {
    if (!room || !minStartDate) return;
    setBookingData((prev) => {
      if (!prev.start_date || prev.start_date < minStartDate) {
        const months = detectLeaseMonths(prev.start_date ?? minStartDate, prev.end_date ?? '');
        return {
          ...prev,
          start_date: minStartDate,
          end_date: leaseEnd(minStartDate, months),
        };
      }
      return prev;
    });
  }, [room, minStartDate]);

  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user) {
      fetch('/api/user/profile')
        .then((res) => res.json())
        .then((json) => {
          if (json.success && json.data) {
            const u = json.data;
            const p = u.party || (u.name ? partyFromText(u.name) : {});
            setBookingData((prev) => ({
              ...prev,
              ...p,
              name: u.name || joinName(p) || prev.name,
              phone: u.phone || prev.phone || '',
              parent_phone: u.parentPhone || u.parent_phone || prev.parent_phone || '',
              email: u.email || prev.email || session.user?.email || '',
              id_card_address: joinAddress(p) || prev.id_card_address || '',
              village: p.moo || prev.village || '',
            }));
          }
        })
        .catch((err) => {
          console.error('[Fetch profile error]', err);
          setBookingData((prev) => {
            const name = prev.name && prev.name !== 'guest' ? prev.name : ((session.user?.name && session.user?.name !== 'guest') ? session.user.name : '');
            const p = prev.firstName ? {} : (({ title, firstName, lastName }) => ({ title, firstName, lastName }))(partyFromText(name));
            return { ...prev, ...p, name, email: prev.email || session.user?.email || '' };
          });
        });
    }
  }, [sessionStatus, session]);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated' && step > 1) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [step, sessionStatus, router]);

  // Fetch saved progress on mount (only if room is available)
  useEffect(() => {
    async function fetchProgress() {
      if (sessionStatus === 'authenticated' && session?.user?.email && roomId && room) {
        if (!isRoomAvailable) {
          setStep(1);
          return;
        }
        try {
          const res = await fetch(`/api/booking/progress?roomId=${roomId}`);
          const data = await res.json();
          if (data.success && data.data) {
            if (data.data.current_step > 2) {
              setStep(Math.min(2, Number(data.data.current_step)));
            } else {
              setStep(1);
            }
            setBookingData((prev) => {
              const d = { ...prev, ...data.data.booking_data };
              // a draft saved before 28-8b has one-field name / address: split it for the fields
              return d.firstName || !d.name ? d : { ...d, ...partyFromText(d.name, d.id_card_address) };
            });
          }
        } catch (e) {
          console.error('[Fetch Progress Error]', e);
        }
      }
    }
    fetchProgress();
  }, [sessionStatus, session, roomId, room, isRoomAvailable]);

  // Save progress whenever step or data changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (sessionStatus === 'authenticated' && step > 1 && step < 5 && roomId) {
        try {
          await fetch('/api/booking/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: parseInt(roomId),
              currentStep: step,
              // The card photo stays in the browser (preview only) — never saved on the server (PDPA)
              bookingData: { ...bookingData, id_card_image: '' }
            })
          });
        } catch (e) {
          console.error('[Save Progress Error]', e);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, bookingData, sessionStatus, roomId]);


  // Cancel booking in progress and reset
  const handleCancelCurrentBooking = async () => {
    const ok = await confirm({
      title: 'ยกเลิกการทำรายการจอง?',
      description: 'ข้อมูลที่คุณกรอกไว้ในขั้นตอนนี้จะถูกรีเซ็ต',
      confirmText: 'ยกเลิกรายการ',
      cancelText: 'ดำเนินการต่อ',
      variant: 'warning',
    });
    if (!ok) return;
    try {
      if (sessionStatus === 'authenticated' && roomId) {
        await fetch('/api/booking/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: parseInt(roomId),
            currentStep: 1,
            bookingData: {}
          })
        });
      }
    } catch (e) {
      console.error(e);
    }
    setStep(1);
  };

  // Handle Slip Upload
  const handleFinalSubmit = async () => {
    if (minStartDate && bookingData.start_date && bookingData.start_date < minStartDate) {
      await alert({
        title: 'วันเริ่มเข้าอยู่ไม่ถูกต้อง',
        description: `ห้องนี้พร้อมเข้าอยู่วันที่ ${thaiDate(minStartDate, true)} เป็นต้นไป กรุณาเลือกวันเริ่มเข้าอยู่ใหม่`,
        variant: 'warning',
      });
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: parseInt(roomId),
          signature: 'CONFIRMED_E_CONTRACT',
          startDate: bookingData.start_date,
          endDate: bookingData.end_date,
          ...partyOf(bookingData),
          phone: bookingData.phone,
          parentPhone: bookingData.parent_phone,
          occupants: bookingData.occupants,
        })
      });

      const data = await res.json();
      if (!data.success) {
        if (data.reason === 'has_open_contract' && data.statusUrl) {
          const ok = await confirm({
            title: 'มีรายการจองค้างอยู่',
            description: `${data.message}\n\nต้องการไปที่หน้าสถานะการจองทันทีหรือไม่?`,
            confirmText: 'ไปหน้าสถานะการจอง',
            cancelText: 'ปิด',
            variant: 'info',
          });
          if (ok) router.push(data.statusUrl);
          return;
        }
        throw new Error(data.message);
      }

      // Clear booking progress
      try {
        await fetch('/api/booking/progress', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: parseInt(roomId) })
        });
      } catch (pe) {
        console.warn('Clear progress error:', pe);
      }

      if (data.contractId) {
        setCreatedContractId(data.contractId);
      }
      setStep(5);
    } catch (e: any) {
      console.error(e);
      await alert({
        title: 'ไม่สามารถส่งคำขอจองได้',
        description: e.message || 'เกิดข้อผิดพลาดในการส่งคำขอจอง กรุณาลองใหม่อีกครั้ง',
        variant: 'danger',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-foreground">ไม่พบข้อมูลห้องพัก</h2>
        <Link href="/" className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-bold inline-block">
          กลับไปหน้าแนะนำหอเกษร 2
        </Link>
      </div>
    );
  }

  const images = getImagesArray(room.images || room.image_url);
  // Booking fee and total deposit come from the server (/api/rates?roomNumber=)
  const totalDeposit = costs?.bookingFee ?? 0;
  const fullDeposit = costs?.deposit ?? 0;
  const securityDeposit = Math.max(0, fullDeposit - totalDeposit); // เงินประกันส่วนที่เหลือชำระวันทำสัญญา
  const contractStartDate = new Date().toLocaleDateString('th-TH');
  const contractEndDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('th-TH');

  return (
    <div className="min-h-screen bg-background text-foreground pb-12">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
          <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
            ← กลับไปหน้าแนะนำหอเกษร 2
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-primary">{room.dorm_name || 'หอพักเกษร 2'}</span>
            <span className="text-muted-foreground">•</span>
            <span>ห้อง {room.room_number}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column: Compact Room Summary (Single Screen View) */}
          <div className="lg:col-span-6 space-y-4">
            
            {/* Image Gallery - Height 240px */}
            <div className="space-y-2">
              <div className="relative h-56 sm:h-64 w-full rounded-3xl overflow-hidden bg-muted border border-border shadow-md">
                <Image
                  src={images[activeImageIndex] || '/images/kesorn/room-bed.jpg'}
                  alt={`Room ${room.room_number}`}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute top-3 left-3 px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-[11px] font-bold">
                  {roomTypeLabel(room.room_type)}
                </div>
                <div className="absolute top-3 right-3 px-3.5 py-1 rounded-full bg-primary text-white text-xs font-black shadow-md">
                  ฿{Number(room.price).toLocaleString()} / เดือน
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-14 h-11 rounded-xl overflow-hidden border-2 transition-all shrink-0 cursor-pointer ${
                        activeImageIndex === idx ? 'border-primary scale-105 shadow-sm' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Image src={img} alt="Thumbnail" fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Room Info Card - Compact */}
            <div className="bg-card border border-border rounded-3xl p-5 space-y-3.5 shadow-xs">
              <div className="flex items-center justify-between gap-2 pb-3 border-b border-border/60">
                <div>
                  <div className="flex items-baseline gap-2">
                    <h1 className="text-2xl font-black tracking-tight">ห้อง {room.room_number}</h1>
                    <span className="text-xs text-muted-foreground font-semibold">ชั้น {room.floor || 1} • {roomTypeLabel(room.room_type)}</span>
                  </div>
                  {isTestRoom(room.room_number) && (
                    <span className="inline-block mt-1 px-2.5 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/40 text-amber-500 text-[10px] font-bold">
                      🧪 {TEST_ROOM_PAGE_BADGE} (ทดสอบ)
                    </span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <span className={`inline-block px-3 py-1 rounded-full text-[11px] font-bold ${
                    isRoomAvailable ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'
                  }`}>
                    {isMovingOut ? 'ว่างเร็วๆ นี้' : isAvailable ? 'ห้องว่าง' : 'ไม่ว่าง'}
                  </span>
                  <div className="text-[11px] font-semibold text-emerald-600 mt-1">
                    🟢 พร้อมเข้าอยู่: {thaiDate(minStartDate, true)}
                  </div>
                </div>
              </div>

              {/* Utility Rates - Mini Horizontal Bar */}
              <div className="flex items-center justify-between gap-2 p-2.5 bg-muted/40 rounded-2xl border border-border/60 text-xs">
                <div className="flex items-center gap-1.5 font-bold">
                  <span>💧</span>
                  <span className="text-muted-foreground">น้ำ:</span>
                  <span className="text-cyan-500">
                    {!costs ? '-' : costs.rates.waterPerPerson === 0 ? 'ฟรี' : `฿${formatBaht(costs.rates.waterPerPerson)}/คน`}
                  </span>
                </div>
                <div className="h-3 w-[1px] bg-border" />
                <div className="flex items-center gap-1.5 font-bold">
                  <span>⚡</span>
                  <span className="text-muted-foreground">ไฟ:</span>
                  <span className="text-amber-500">{costs ? `฿${formatBaht(costs.rates.electricityPerUnit)}/หน่วย` : '-'}</span>
                </div>
                <div className="h-3 w-[1px] bg-border" />
                <div className="flex items-center gap-1.5 font-bold">
                  <span>📶</span>
                  <span className="text-muted-foreground">เน็ต:</span>
                  <span className="text-emerald-500">ฟรี Wi-Fi</span>
                </div>
              </div>

              {/* Room Amenities Chips */}
              {(() => {
                let parsed = [];
                try {
                  parsed = typeof room.amenities === 'string' ? JSON.parse(room.amenities) : (room.amenities || []);
                } catch {
                  parsed = [];
                }
                if (!Array.isArray(parsed) || parsed.length === 0) {
                  parsed = itemsForRoomType(room.room_type).map((it) => it.name);
                }
                if (parsed.length === 0) return null;
                return (
                  <div className="flex flex-wrap gap-1.5">
                    {parsed.map((item, idx) => (
                      <span key={idx} className="px-2 py-0.5 bg-secondary text-foreground text-[10px] font-bold rounded-lg border border-border">
                        ✓ {typeof item === 'string' ? item : item.name}
                      </span>
                    ))}
                  </div>
                );
              })()}

              {/* Rules & Map - Compact 1-line icon bar & button */}
              <div className="flex items-center justify-between gap-2 pt-1 text-xs">
                <div className="flex items-center gap-2 text-muted-foreground font-semibold text-[11px] flex-wrap">
                  <span>{room.pet_friendly ? '🐾 เลี้ยงสัตว์ได้' : '🐾 ห้ามสัตว์เลี้ยง'}</span>
                  <span>•</span>
                  <span>{room.has_parking ? '🚗 มีที่จอดรถ' : '🛵 จอดมอเตอร์ไซค์'}</span>
                  <span>•</span>
                  <span>🚭 ห้ามสูบบุหรี่</span>
                  <span>•</span>
                  <span>🕒 เข้า-ออก 24 ชม.</span>
                  <span>•</span>
                  <span>📶 ฟรี Wi-Fi</span>
                </div>
                <a
                  href={mapDirectUrl(room.dorm_map_url, room.dorm_address, room.dorm_name)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 text-[11px] font-bold text-primary hover:underline rounded-lg border border-border hover:border-primary shrink-0 transition-colors"
                >
                  📍 เปิดแผนที่ Google Maps ↗
                </a>
              </div>
            </div>

          </div>

          {/* Right Column: Step 2 Confirmation & Booking (Single Screen View) */}
          <div className="lg:col-span-6 space-y-4">
            
            {step === 1 && (
              <div className="bg-card border border-border rounded-3xl p-6 shadow-lg space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between border-b border-border/50 pb-3">
                  <h2 className="text-lg font-black tracking-tight">ยืนยันข้อมูลและวันเข้าพัก</h2>
                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-0.5 rounded-full">
                    ✓ ดึงข้อมูลโปรไฟล์แล้ว
                  </span>
                </div>

                {/* 1-Row Compact Tenant Info */}
                <div className="p-3 bg-secondary/50 rounded-2xl border border-border/70 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-bold text-foreground truncate">{bookingData.name || session?.user?.name || '-'}</span>
                      <span className="text-muted-foreground">|</span>
                      <span className="font-semibold text-muted-foreground">{bookingData.phone || '-'}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground shrink-0">{bookingData.email || session?.user?.email || ''}</span>
                  </div>

                  {(!bookingData.phone || !bookingData.parent_phone) && (
                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/40">
                      {!bookingData.phone && (
                        <input
                          className="w-full px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs font-bold"
                          placeholder="เบอร์โทรผู้เช่า *"
                          value={bookingData.phone}
                          {...PHONE_INPUT_PROPS}
                          onChange={(e) => setBookingData({ ...bookingData, phone: phoneDigits(e.target.value) })}
                        />
                      )}
                      {!bookingData.parent_phone && (
                        <input
                          className="w-full px-2.5 py-1.5 rounded-xl bg-background border border-border text-xs font-bold"
                          placeholder="เบอร์โทรผู้ปกครอง *"
                          value={bookingData.parent_phone}
                          {...PHONE_INPUT_PROPS}
                          onChange={(e) => setBookingData({ ...bookingData, parent_phone: phoneDigits(e.target.value) })}
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Lease Period & Compact Shortcuts (3, 6, 9, 12 months) */}
                <div className="p-3.5 bg-secondary/40 rounded-2xl border border-border/70 space-y-2.5">
                  {minStartDate > today && (
                    <div className="text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-xl">
                      📅 ห้องนี้พร้อมเข้าอยู่วันที่ {thaiDate(minStartDate, true)} เป็นต้นไป
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-foreground">ระยะเวลาสัญญา</span>
                    <div className="flex items-center gap-1">
                      {[3, 6, 9, 12].map((m) => {
                        const curMonths = detectLeaseMonths(bookingData.start_date ?? '', bookingData.end_date ?? '');
                        const active = curMonths === m;
                        return (
                          <button
                            key={m}
                            type="button"
                            onClick={() => {
                              if (bookingData.start_date) {
                                setBookingData((prev) => ({ ...prev, end_date: leaseEnd(prev.start_date, m) }));
                              }
                            }}
                            className={`px-2.5 py-0.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                              active
                                ? 'bg-primary text-white shadow-xs'
                                : 'bg-background hover:bg-muted text-muted-foreground border border-border'
                            }`}
                          >
                            {m} เดือน
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 pt-0.5">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground block">วันเริ่มเข้าอยู่</span>
                      <ThaiDatePicker
                        aria-label="วันเริ่มเข้าอยู่"
                        min={minStartDate}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                        value={bookingData.start_date ?? ''}
                        onChange={(v) => {
                          setBookingData((prev) => {
                            const next = { ...prev, start_date: v };
                            if (v) {
                              const months = detectLeaseMonths(prev.start_date ?? '', prev.end_date ?? '');
                              next.end_date = leaseEnd(v, months);
                            }
                            return next;
                          });
                        }}
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold text-muted-foreground block">วันสิ้นสุดสัญญา</span>
                      <ThaiDatePicker
                        aria-label="วันสิ้นสุดสัญญา"
                        min={bookingData.start_date ? addDays(bookingData.start_date, 1) : todayTh()}
                        className="w-full px-3 py-2 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                        value={bookingData.end_date ?? ''}
                        onChange={(v) => setBookingData({ ...bookingData, end_date: v })}
                      />
                    </div>
                  </div>
                </div>

                {/* Occupants: Compact Pill Buttons [1 คน] [2 คน] & View Contract Button */}
                <div className="flex items-center justify-between gap-3 p-3 bg-secondary/30 rounded-2xl border border-border/60">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">จำนวนผู้พัก:</span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2].map((n) => {
                        const active = (bookingData.occupants ?? 1) === n;
                        return (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setBookingData({ ...bookingData, occupants: n })}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              active
                                ? 'bg-primary text-white shadow-xs'
                                : 'bg-background hover:bg-muted text-foreground border border-border'
                            }`}
                          >
                            {n} คน
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(true)}
                    className="px-2.5 py-1 text-xs font-bold text-muted-foreground hover:text-primary rounded-lg border border-border hover:border-primary transition-colors cursor-pointer shrink-0"
                  >
                    📄 ดูร่างสัญญา
                  </button>
                </div>

                {/* 1-Row Cost Summary */}
                <div className="p-3 bg-primary/5 rounded-2xl border border-primary/20 flex items-center justify-between text-xs">
                  <div>
                    <span className="font-bold text-foreground block">ค่าจองห้องพัก</span>
                    <span className="text-[10px] text-muted-foreground">(เป็นส่วนหนึ่งของเงินประกัน ฿{fullDeposit.toLocaleString()})</span>
                  </div>
                  <div className="text-right">
                    <span className="text-xl font-black text-primary">฿{totalDeposit.toLocaleString()}</span>
                    <span className="block text-[10px] text-emerald-600 font-semibold">ชำระหลังหอพักอนุมัติ (10 นาที)</span>
                  </div>
                </div>

                {/* Prominent Submit Action */}
                <div className="pt-1">
                  {(session?.user as any)?.role === 'tenant' ? (
                    <div className="p-4 bg-primary/5 rounded-2xl border border-primary/20 text-center space-y-2">
                      <p className="text-xs font-bold text-primary">คุณมีสัญญาเช่าในระบบแล้ว</p>
                      <Link href="/tenant" className="inline-block px-5 py-2 bg-primary text-white rounded-xl text-xs font-bold shadow-md">
                        ไปที่หน้าแดชบอร์ด
                      </Link>
                    </div>
                  ) : !isRoomAvailable ? (
                    <div className="p-4 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-center space-y-1">
                      <p className="text-xs font-bold text-rose-500">ห้องพักนี้มีผู้จองแล้ว / ไม่ว่าง</p>
                      <Link href="/explore/booking-status" className="inline-block text-xs font-bold text-primary underline">
                        ตรวจสอบสถานะการจองของฉัน
                      </Link>
                    </div>
                  ) : (
                    <button
                      onClick={handleFinalSubmit}
                      disabled={isProcessing || !costs || !bookingData.phone || !bookingData.parent_phone}
                      className="w-full py-3.5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-lg shadow-primary/25 hover:scale-[1.01] active:scale-95 disabled:opacity-40 cursor-pointer"
                    >
                      {isProcessing ? 'กำลังส่งคำขอจอง...' : '✓ ยืนยันและส่งคำขอจองห้องพัก →'}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Step 5: Finished & Contract Documents Ready */}
            {step === 5 && (
              <div className="bg-card border border-border rounded-3xl p-8 shadow-xl space-y-5 text-center animate-in fade-in duration-300">
                <div className="w-14 h-14 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-full flex items-center justify-center text-2xl mx-auto shadow-md">
                  ✓
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">ส่งคำขอจองแล้ว</span>
                  <h3 className="text-xl font-black tracking-tight">ส่งคำขอจองแล้ว รอหอพักอนุมัติ</h3>
                </div>

                <div className="p-4 bg-secondary/50 rounded-2xl border border-border text-left space-y-2">
                  <span className="text-xs font-black text-foreground flex items-center gap-1.5">
                    <span>📄</span> เอกสารสัญญาเช่า (PDF)
                  </span>
                  <a
                    href={createdContractId ? `/contract-print/${createdContractId}?print=1` : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-disabled={!createdContractId}
                    className={`py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 ${createdContractId ? 'cursor-pointer' : 'opacity-50 pointer-events-none'}`}
                  >
                    <span>ดาวน์โหลดสัญญา (PDF)</span>
                  </a>
                </div>

                <div className="p-3.5 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-500 text-left leading-relaxed">
                  📌 <strong>ขั้นตอนถัดไป:</strong> หอพักอนุมัติ → ชำระค่าจองภายใน 10 นาทีที่หน้าสถานะการจอง → ลงนามสัญญาฉบับจริงในวันเข้าพัก
                </div>

                <div className="pt-1 space-y-2">
                  <Link
                    href="/explore/booking-status"
                    className="w-full inline-flex justify-center items-center py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs shadow-md transition-all cursor-pointer"
                  >
                    ดูสถานะการจองของฉัน
                  </Link>
                  <Link
                    href="/"
                    className="w-full inline-flex justify-center items-center py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-xl text-xs transition-all cursor-pointer"
                  >
                    กลับไปหน้าแนะนำหอเกษร 2
                  </Link>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Printable Contract Modal (PDF / print; Word for staff only) */}
      <PrintableContractModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        rates={costs?.rates}
        contract={{
          id: createdContractId || 'DRAFT',
          room_number: room?.room_number || '',
          room_type: room?.room_type,
          tenant_name: bookingData.name,
          tenant_phone: bookingData.phone,
          parent_phone: bookingData.parent_phone,
          tenant_email: bookingData.email,
          tenant_address: bookingData.id_card_address,
          occupants: bookingData.occupants ?? 1,
          houseNo: bookingData.houseNo,
          village: bookingData.village,
          road: bookingData.road,
          subdistrict: bookingData.subdistrict,
          district: bookingData.district,
          province: bookingData.province,
          start_date: bookingData.start_date,
          end_date: bookingData.end_date,
          deposit_amount: costs?.deposit ?? 0,
          monthly_rent: Number(room?.price || 0),
          created_at: new Date().toISOString(),
        } as any}
      />

      {/* Contract Simulator Modal */}
      {showSimulator && room && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-4xl w-full my-auto">
            <ContractSimulator
              roomNumber={room.room_number}
              onClose={() => setShowSimulator(false)}
            />
          </div>
        </div>
      )}

      {/* Chat Widget */}
      {room && <ChatWidget dormId={room.dorm_id} ownerName={room.owner_name} />}

    </div>
  );
}
