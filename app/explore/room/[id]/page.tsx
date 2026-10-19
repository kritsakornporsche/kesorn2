'use client';

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

function getGoogleMapsEmbedUrl(mapUrl?: string, address?: string, dormName?: string) {
  if (mapUrl) {
    const trimmed = mapUrl.trim();
    if (trimmed.includes('/embed')) {
      return trimmed;
    }
    const coordMatch = trimmed.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (coordMatch) {
      const lat = coordMatch[1];
      const lng = coordMatch[2];
      return `https://maps.google.com/maps?q=${lat},${lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
    }
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get('q') || url.searchParams.get('query');
      if (q) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
      }
    } catch (e) {}
    if (trimmed.startsWith('http')) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(trimmed)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    }
  }
  const query = [dormName, address, 'พะเยา'].filter(Boolean).join(' ');
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
}

function getGoogleMapsDirectUrl(mapUrl?: string, address?: string, dormName?: string) {
  if (mapUrl && !mapUrl.includes('/embed') && mapUrl.startsWith('http')) {
    return mapUrl;
  }
  const query = [dormName, address, 'พะเยา'].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function RoomBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;
  const { data: session, status: sessionStatus } = useSession();
  
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
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    id_card_address: '',
    id_card_image: '',
    houseNo: '',
    village: '',
    road: '',
    subdistrict: '',
    district: '',
    province: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  const [createdContractId, setCreatedContractId] = useState<number | string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

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

  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user) {
      setBookingData((prev) => ({
        ...prev,
        name: prev.name && prev.name !== 'guest' ? prev.name : ((session.user?.name && session.user?.name !== 'guest') ? session.user.name : ''),
        email: prev.email || session.user?.email || '',
      }));
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
              setStep(Math.min(3, Number(data.data.current_step)));
            } else {
              setStep(1);
            }
            setBookingData((prev) => ({ ...prev, ...data.data.booking_data }));
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


  // Download Word Contract
  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    try {
      const contractPayload = {
        room_number: room?.room_number,
        floor: room?.floor,
        price: room?.price,
        monthly_rent: room?.price,
        deposit_amount: costs?.deposit ?? 0, // deposit in total, from /api/rates (server)
        tenant_name: bookingData.name,
        tenant_phone: bookingData.phone,
        parent_phone: bookingData.parent_phone,
        tenant_email: bookingData.email,
        tenant_address: bookingData.id_card_address,
        start_date: bookingData.start_date,
        end_date: bookingData.end_date,
        created_at: new Date().toISOString()
      };
      const res = await fetch('/api/contracts/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: contractPayload }),
      });
      if (!res.ok) throw new Error('Export DOCX failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `สัญญาเช่า_หอพักเกษร_ห้อง${room?.room_number}_${(bookingData.name || '').replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์ Word');
    } finally {
      setDownloadingDocx(false);
    }
  };

  // Cancel booking in progress and reset
  const handleCancelCurrentBooking = async () => {
    if (!confirm('ต้องการยกเลิกการทำรายการจองห้องนี้หรือไม่?')) return;
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
          tenantName: bookingData.name,
          phone: bookingData.phone,
          parentPhone: bookingData.parent_phone,
          tenantAddress: bookingData.id_card_address,
        })
      });

      const data = await res.json();
      if (!data.success) {
        if (data.reason === 'has_open_contract' && data.statusUrl) {
          if (confirm(`${data.message}\n\nไปหน้าสถานะการจองตอนนี้?`)) router.push(data.statusUrl);
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
      alert(e.message || 'เกิดข้อผิดพลาดในการส่งคำขอจอง');
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
  const isTestRoom = (room.room_number || '').toUpperCase() === 'T01';
  // Booking fee and total deposit come from the server (/api/rates?roomNumber=)
  const totalDeposit = costs?.bookingFee ?? 0;
  const fullDeposit = costs?.deposit ?? 0;
  const securityDeposit = Math.max(0, fullDeposit - totalDeposit); // เงินประกันส่วนที่เหลือชำระวันทำสัญญา
  const contractStartDate = new Date().toLocaleDateString('th-TH');
  const contractEndDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('th-TH');

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
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

      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Room Details & Images */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Image Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-video rounded-[2.5rem] overflow-hidden bg-muted border border-border shadow-lg">
                <Image
                  src={images[activeImageIndex] || '/images/kesorn/room-bed.jpg'}
                  alt={`Room ${room.room_number}`}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute top-4 left-4 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold">
                  {roomTypeLabel(room.room_type)}
                </div>
                <div className="absolute top-4 right-4 px-4 py-1.5 rounded-full bg-primary text-white text-xs font-black shadow-lg">
                  ฿{Number(room.price).toLocaleString()} / เดือน
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-20 h-16 rounded-2xl overflow-hidden border-2 transition-all shrink-0 ${
                        activeImageIndex === idx ? 'border-primary scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Image src={img} alt="Thumbnail" fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Room Info */}
            <div className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-border">
                <div>
                  <h1 className="text-3xl font-black tracking-tight">ห้อง {room.room_number}</h1>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    {room.dorm_name || 'SmartDom Dormitory'} • ชั้น {room.floor || 1}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                    isRoomAvailable ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'
                  }`}>
                    {isMovingOut ? '🟡 ว่างเร็วๆ นี้ (จองล่วงหน้าได้)' : isAvailable ? '🟢 ห้องว่างพร้อมเข้าอยู่' : '🔴 ไม่ว่าง'}
                  </span>
                </div>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-3 gap-4 text-center py-2">
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ชั้น</span>
                  <span className="text-xl font-black">{room.floor || 1}</span>
                </div>
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ประเภท</span>
                  <span className="text-base font-black truncate">{roomTypeLabel(room.room_type)}</span>
                </div>
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ค่าเช่า</span>
                  <span className="text-xl font-black text-primary">฿{Number(room.price).toLocaleString()}</span>
                </div>
              </div>

              {/* Amenities */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">สิ่งอำนวยความสะดวกในห้องพัก</h3>
                <div className="flex flex-wrap gap-2">
                  {['เครื่องปรับอากาศ', 'เครื่องทำน้ำอุ่น', 'เตียงนอน & ฟูก', 'โต๊ะเขียนหนังสือ', 'ตู้เสื้อผ้า', 'ระเบียงส่วนตัว', 'Free Wi-Fi'].map((amenity, i) => (
                    <span key={i} className="px-3.5 py-1.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-xl border border-border/60">
                      ✓ {amenity}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 🏢 Dormitory Overview, Utility Rates, and Rules */}
            <div className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ข้อมูลหอพัก & เงื่อนไขสัญญา</span>
                  <h2 className="text-2xl font-black tracking-tight">{room.dorm_name || 'ข้อมูลหอพัก'}</h2>
                  {room.dorm_address && (
                    <p className="text-xs text-muted-foreground mt-0.5">📍 {room.dorm_address}</p>
                  )}
                </div>

                {/* Quick inquiry buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenChat}
                    className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <span>💬</span>
                    <span>สอบถามหอพัก</span>
                  </button>
                  {room.dorm_phone && (
                    <a
                      href={`tel:${room.dorm_phone}`}
                      className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                    >
                      <span>📞</span>
                      <span>โทรติดต่อ</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Utility Rates (ค่าน้ำ-ค่าไฟ) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">⚡ อัตราค่าน้ำ / ค่าไฟ</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-xl shrink-0">
                      💧
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">ค่าน้ำประปา</span>
                      <span className="text-base font-black text-cyan-500">
                        {!costs ? '-' : costs.rates.waterPerPerson === 0 ? 'ฟรี (รวมในค่าห้อง)' : `฿${formatBaht(costs.rates.waterPerPerson)} / คน / เดือน`}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">
                      ⚡
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">ค่าไฟฟ้า</span>
                      <span className="text-lg font-black text-amber-500">
                        {costs ? `฿${formatBaht(costs.rates.electricityPerUnit)}` : '-'}{' '}
                        <span className="text-xs font-bold text-muted-foreground">/ ยูนิต</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rules & Policies (กฎระเบียบและเงื่อนไข) */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">📋 กฎระเบียบและเงื่อนไขของหอพัก</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">{room.pet_friendly ? '🐾' : '🚫'}</span>
                    <div className="text-xs">
                      <span className="font-bold block">นโยบายสัตว์เลี้ยง</span>
                      <span className="text-muted-foreground text-[11px]">
                        {room.pet_friendly ? 'อนุญาตให้เลี้ยงสัตว์ได้ (Pet-Friendly)' : 'ห้ามเลี้ยงสัตว์เลี้ยงทุกชนิด'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">{room.has_parking ? '🚗' : '🛵'}</span>
                    <div className="text-xs">
                      <span className="font-bold block">ที่จอดรถ</span>
                      <span className="text-muted-foreground text-[11px]">
                        {room.has_parking ? 'มีที่จอดรถยนต์ และรถจักรยานยนต์' : 'มีเฉพาะที่จอดรถจักรยานยนต์'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">🚭</span>
                    <div className="text-xs">
                      <span className="font-bold block">การสูบบุหรี่</span>
                      <span className="text-muted-foreground text-[11px]">ห้ามสูบบุหรี่ภายในห้องพักและพื้นที่ส่วนกลาง</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">🕒</span>
                    <div className="text-xs">
                      <span className="font-bold block">เวลาเข้า-ออก</span>
                      <span className="text-muted-foreground text-[11px]">เข้า-ออกได้ตลอด 24 ชม. (ระบบคีย์การ์ด/สแกน)</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">📶</span>
                    <div className="text-xs">
                      <span className="font-bold block">อินเทอร์เน็ต</span>
                      <span className="text-muted-foreground text-[11px]">
                        ฟรี Wi-Fi (มีกล่องเราเตอร์แยกทุกห้อง)
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">📝</span>
                    <div className="text-xs">
                      <span className="font-bold block">การจองและเงินประกัน</span>
                      <span className="text-muted-foreground text-[11px]">
                        ค่าจอง {totalDeposit.toLocaleString()} บาท ชำระหลังหอพักอนุมัติ (เป็นส่วนหนึ่งของเงินประกันรวม {fullDeposit.toLocaleString()} บาท ชำระส่วนที่เหลือวันเข้าพัก)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description from Dorm Profile */}
              {room.dorm_description && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">ℹ️ รายละเอียดเพิ่มเติมจากหอพัก</h3>
                  <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border whitespace-pre-line">
                    {room.dorm_description}
                  </p>
                </div>
              )}

              {/* Dorm Facilities */}
              {room.dorm_facilities && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">✨ สิ่งอำนวยความสะดวกส่วนกลาง</h3>
                  <div className="flex flex-wrap gap-2">
                    {room.dorm_facilities.split(',').map((fac: string, idx: number) => {
                      const trimmed = fac.trim();
                      if (!trimmed) return null;
                      return (
                        <span key={idx} className="px-3 py-1 bg-secondary text-xs font-semibold rounded-lg border border-border">
                          {trimmed}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 📍 Pinned Map & Location */}
              <div className="pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>📍</span> พิกัดตำแหน่งหอพัก
                  </span>
                  <a
                    href={getGoogleMapsDirectUrl(room.dorm_map_url, room.dorm_address, room.dorm_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    เปิดใน Google Maps ↗
                  </a>
                </div>
                <div className="w-full h-48 rounded-2xl overflow-hidden border border-border shadow-inner relative bg-muted/40">
                  <iframe
                    title={`แผนที่ ${room.dorm_name}`}
                    src={getGoogleMapsEmbedUrl(room.dorm_map_url, room.dorm_address, room.dorm_name)}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Step-by-Step Booking Workflow */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Step 1: Summary & Calculation (1 Month Deposit Only) */}
            {step === 1 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 1 จาก 3</span>
                  <h2 className="text-2xl font-black tracking-tight">สรุปค่าใช้จ่ายการจองห้องพัก</h2>
                </div>

                <div className="space-y-4 bg-secondary/50 p-6 rounded-3xl border border-border">
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="text-muted-foreground block">ค่าเช่ารายเดือน</span>
                      <span className="text-[11px] text-cyan-500 font-semibold">
                        {costs ? `ค่าน้ำ ฿${formatBaht(costs.rates.waterPerPerson)}/คน/ด. • ส่วนกลาง ฿${formatBaht(costs.rates.commonFee)}/ด.` : '-'}
                      </span>
                    </div>
                    <span className="font-bold">฿{Number(room.price).toLocaleString()} / เดือน</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">อัตราค่าไฟฟ้า</span>
                    <span className="font-bold text-amber-500">{costs ? `฿${formatBaht(costs.rates.electricityPerUnit)}` : '-'} / ยูนิต</span>
                  </div>

                  <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                    <div>
                      <span className="font-semibold block">เงินประกันความเสียหาย</span>
                      <span className="text-[11px] text-muted-foreground">ชำระวันทำสัญญา/ย้ายเข้า (คืนภายใน 7 วันหลังคืนห้อง ตามประกาศ สคบ. พ.ศ. 2568 · 14 วันเมื่อมีรายการหัก ตามนโยบายหอพัก)</span>
                    </div>
                    <span className="font-bold text-muted-foreground">฿{securityDeposit.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold block text-primary">ค่าจอง ฿{totalDeposit.toLocaleString()}</span>
                      <span className="text-[11px] text-emerald-500">ชำระหลังหอพักอนุมัติคำขอ (ภายใน 10 นาที)</span>
                    </div>
                    <span className="font-bold text-primary">฿{totalDeposit.toLocaleString()}</span>
                  </div>

                  <div className="border-t border-border pt-4 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm block">ยอดที่ต้องชำระหลังได้รับอนุมัติ</span>
                      <span className="text-[11px] text-muted-foreground">(ค่าจอง เป็นส่วนหนึ่งของเงินประกัน)</span>
                    </div>
                    <span className="text-2xl font-black text-primary">฿{totalDeposit.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setShowSimulator(true)}
                    className="w-full py-3.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-2xl text-xs transition-all border border-border"
                  >
                    🧮 จำลองคำนวณค่าสัญญาเช่า
                  </button>

                  {(session?.user as any)?.role === 'tenant' ? (
                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/20 text-center space-y-3">
                      <p className="text-xs font-bold text-primary">คุณมีสัญญาเช่าในระบบแล้ว</p>
                      <Link href="/tenant" className="inline-block px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-lg">
                        ไปที่หน้าแดชบอร์ด
                      </Link>
                    </div>
                  ) : isRoomAvailable ? (
                    <button
                      onClick={() => {
                        if (!session) {
                          router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
                          return;
                        }
                        setStep(2);
                      }}
                      className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      {isMovingOut ? 'ตกลงเช่า และเริ่มจองล่วงหน้า →' : 'ตกลงเช่า และเริ่มจองห้อง →'}
                    </button>
                  ) : (
                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center space-y-3">
                      <div className="w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center text-lg mx-auto">
                        🔒
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-400">ห้องพักนี้มีผู้จองแล้ว / ไม่ว่างในขณะนี้</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          คุณสามารถตรวจสอบสถานะการจองของคุณ หรือเลือกดูห้องพักอื่นที่ยังว่างอยู่ได้ครับ
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <Link
                          href="/explore/booking-status"
                          className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
                        >
                          📋 ตรวจสอบสถานะการจองของฉัน
                        </Link>
                        <Link
                          href="/"
                          className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-all border border-border"
                        >
                          🔍 ดูห้องพักอื่นที่ว่าง
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* 💬 Inquire Dormitory & Call Action */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground text-center">มีคำถามหรือต้องการดูห้องจริง?</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenChat}
                        className="flex-1 py-3.5 px-4 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer shadow-sm"
                      >
                        <span>💬</span>
                        <span>สอบถามหอพัก / แชท</span>
                      </button>
                      {room.dorm_phone && (
                        <a
                          href={`tel:${room.dorm_phone}`}
                          className="py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01] active:scale-95 shrink-0"
                          title={`โทรสอบถาม: ${room.dorm_phone}`}
                        >
                          <span>📞</span>
                          <span className="hidden sm:inline">โทร {room.dorm_phone}</span>
                          <span className="sm:hidden">โทร</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Tenant Contact Info & Lease Period */}
            {step === 2 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 2 จาก 3</span>
                  <h2 className="text-2xl font-black tracking-tight">ข้อมูลผู้จองและระยะเวลาเข้าพัก</h2>
                  <p className="text-xs text-muted-foreground">ข้อมูลจะถูกนำไปใช้กรอกลงในแบบฟอร์มสัญญาเช่าหอพักเกษร 2 อัตโนมัติ</p>
                </div>

                <div className="space-y-4">
                  <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-2xl text-xs text-primary flex items-center gap-2.5">
                    <span className="text-base">🪪</span>
                    <span><strong>ชื่อ-นามสกุลและที่อยู่:</strong> กรอกเองในขั้นตอนถัดไป · ระบบไม่จัดเก็บเลขบัตรและรูปบัตร</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        เบอร์โทรศัพท์ผู้เช่า <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        className="w-full px-5 py-3.5 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                        placeholder="08X-XXX-XXXX"
                        value={bookingData.phone ?? ''}
                        onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        เบอร์โทรผู้ปกครอง <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        className="w-full px-5 py-3.5 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                        placeholder="08X-XXX-XXXX (ผู้ปกครอง)"
                        value={bookingData.parent_phone ?? ''}
                        onChange={(e) => setBookingData({ ...bookingData, parent_phone: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Lease Period (ระยะเวลาสัญญา) */}
                  <div className="p-4 bg-secondary/50 rounded-2xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span>📅</span> ระยะเวลาตามสัญญาเช่า
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const start = new Date(bookingData.start_date || new Date());
                            const end = new Date(start);
                            end.setFullYear(end.getFullYear() + 1);
                            setBookingData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
                          }}
                          className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          สัญญา 1 ปี (12 เดือน)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const start = new Date(bookingData.start_date || new Date());
                            const end = new Date(start);
                            end.setMonth(end.getMonth() + 6);
                            setBookingData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
                          }}
                          className="px-2.5 py-1 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          6 เดือน
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground block">วัน/เดือน ที่เริ่มเข้าอยู่</span>
                        <input
                          type="date"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                          value={bookingData.start_date ?? ''}
                          onChange={(e) => setBookingData({ ...bookingData, start_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground block">วัน/เดือน สิ้นสุดสัญญา</span>
                        <input
                          type="date"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                          value={bookingData.end_date ?? ''}
                          onChange={(e) => setBookingData({ ...bookingData, end_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setStep(3)}
                    disabled={!bookingData.phone || !bookingData.parent_phone}
                    className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    ถัดไป: ข้อมูลผู้เช่าและสัญญา →
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ← ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCancelCurrentBooking}
                      className="py-2.5 px-3 text-xs font-bold text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิกการจอง
                    </button>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span>มีข้อสงสัยก่อนทำสัญญา?</span>
                    <button
                      type="button"
                      onClick={handleOpenChat}
                      className="text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>💬</span>
                      <span>แชทสอบถามหอพัก</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Tenant name / address (typed by the booker) & Contract Review */}
            {step === 3 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 3 จาก 3</span>
                  <h2 className="text-2xl font-black tracking-tight">ข้อมูลผู้เช่าและสัญญา</h2>
                  <p className="text-xs text-muted-foreground">
                    กรอกชื่อ-นามสกุลและที่อยู่ตามบัตรประชาชนเพื่อใช้ในสัญญาเช่า (หอพักตรวจกับบัตรจริงอีกครั้งตอนทำสัญญา)
                  </p>
                </div>

                {/* Extracted Fields */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        ชื่อ-นามสกุล ผู้เช่า <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                        placeholder="นาย/นางสาว..."
                        value={bookingData.name ?? ''}
                        onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground">🔒 ระบบไม่เก็บเลขบัตรประชาชนและรูปบัตร (เลขบัตรกรอกด้วยมือในสัญญากระดาษตอนเซ็น)</p>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        ที่อยู่ตามทะเบียนบ้าน / บัตรประชาชน <span className="text-rose-500">*</span>
                      </label>
                      {bookingData.subdistrict && (
                        <span className="text-[10px] font-bold text-primary">
                          ✓ แยกช่องอัตโนมัติ: ต.{bookingData.subdistrict} อ.{bookingData.district} จ.{bookingData.province}
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-bold text-xs"
                      placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                      value={bookingData.id_card_address ?? ''}
                      onChange={(e) => setBookingData({ ...bookingData, id_card_address: e.target.value })}
                    />
                  </div>
                </div>

                {/* Contract Summary & Terms Preview */}
                <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>📜</span> ข้อตกลงสัญญาเช่าหอพักเกษร 2
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <span>📄</span> ดูร่างสัญญาฉบับทางการ 3 หน้า (ฟอนต์ TH Sarabun New)
                    </button>
                  </div>

                  <div className="text-[11px] text-muted-foreground space-y-1 bg-background/50 p-3 rounded-xl border border-border max-h-32 overflow-y-auto leading-relaxed">
                    <p>1. ค่าเช่าห้องพักเดือนละ ฿{Number(room.price).toLocaleString()} กำหนดชำระภายในวันที่ 5 ของทุกเดือน</p>
                    <p>2. ค่าน้ำประปาเหมาจ่าย {costs ? `฿${formatBaht(costs.rates.waterPerPerson)}` : '-'}/คน/เดือน • ค่าส่วนกลาง {costs ? `฿${formatBaht(costs.rates.commonFee)}` : '-'}/เดือน • ค่าไฟฟ้าหน่วยละ {costs ? `฿${formatBaht(costs.rates.electricityPerUnit)}` : '-'}/ยูนิต</p>
                    <p>3. ค่าจอง {costs ? `฿${formatBaht(costs.bookingFee)}` : '-'} เป็นส่วนหนึ่งของเงินประกันรวม {costs ? `฿${formatBaht(costs.deposit)}` : '-'} · ชำระหลังหอพักอนุมัติคำขอ · ไม่คืนหากยกเลิกการจองหรือไม่มาเข้าพักตามวันนัด · วันเข้าอยู่ชำระค่าเช่าเดือนแรกเต็มเดือน + เงินประกันส่วนที่เหลือ · เงินประกันคืนตามเงื่อนไขในสัญญา</p>
                    <p>4. ห้ามส่งเสียงดังรบกวนยามวิกาล, ห้ามเสพสิ่งเสพติด, รักษาความสะอาดห้องพักสม่ำเสมอ</p>
                    <p>5. สัญญาเช่าฉบับจริงจะลงลายมือชื่อทั้งสองฝ่ายต่อหน้าในวันเข้าพักจริง</p>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-400 leading-relaxed">
                    ℹ️ <strong>วิธีลงนามสัญญา:</strong> เมื่อท่านชำระเงินจองสำเร็จ ระบบจะส่งไฟล์ Word (.docx) และ PDF ที่พิมพ์ด้วยแบบฟอร์มทางการ <strong>TH Sarabun New</strong> ไปยังเจ้าของหอพัก เพื่อพิมพ์เอกสารให้ท่านและเจ้าของหอพักลงลายมือชื่อจริงร่วมกันในวันเข้าหอพัก
                  </div>
                </div>

                {/* Next & Back Actions */}
                <div className="space-y-3 pt-2">
                  <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-[11px] text-amber-400 leading-relaxed">
                    ค่าจอง ฿{totalDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} ชำระหลังหอพักอนุมัติคำขอ และเป็นส่วนหนึ่งของเงินประกันรวม ฿{fullDeposit.toLocaleString('th-TH', { minimumFractionDigits: 2 })} · ไม่คืนหากยกเลิกการจองหรือไม่มาเข้าพักตามวันนัด
                  </div>
                  <div className="p-3 bg-sky-500/10 border border-sky-500/20 rounded-xl text-[11px] text-sky-300 leading-relaxed">
                    {BOOKING_REQUEST_NOTE}
                  </div>
                  <button
                    onClick={handleFinalSubmit}
                    disabled={!bookingData.name || !bookingData.id_card_address || isProcessing || !costs}
                    className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    {isProcessing ? 'กำลังส่งคำขอจอง...' : 'ส่งคำขอจอง →'}
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ← ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCancelCurrentBooking}
                      className="py-2.5 px-3 text-xs font-bold text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิกการจอง
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Finished & Contract Documents Ready */}
            {step === 5 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/10">
                  ✓
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">ส่งคำขอจองแล้ว</span>
                  <h3 className="text-2xl font-black tracking-tight">ส่งคำขอจองแล้ว รอหอพักอนุมัติ</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {BOOKING_REQUEST_NOTE} (ชำระที่หน้าสถานะการจอง)
                  </p>
                </div>

                {/* Contract Download Box */}
                <div className="p-5 bg-secondary/50 rounded-3xl border border-border space-y-3 text-left">
                  <span className="text-xs font-black text-foreground flex items-center gap-2">
                    <span>📄</span> เอกสารสัญญาเช่าของคุณ (พร้อมพิมพ์/แก้ไข)
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    คุณสามารถดาวน์โหลดเอกสารสัญญาเช่าที่กรอกข้อมูลครบถ้วนแล้วเก็บไว้เป็นหลักฐาน หรือเจ้าของหอจะพิมพ์ฉบับจริงให้เซ็นชื่อเมื่อเข้าหอพัก
                  </p>

                  <div className="grid grid-cols-1 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadDocx}
                      disabled={downloadingDocx}
                      className="py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <span>{downloadingDocx ? '⏳ กำลังสร้างไฟล์ Word...' : '📄 ดาวน์โหลด Word (.docx)'}</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-400 text-left leading-relaxed">
                  📌 <strong>ขั้นตอนถัดไป:</strong> หอพักอนุมัติ → ชำระค่าจองภายใน 10 นาที (หน้าสถานะการจอง) → ในวันเข้าพักเจ้าของหอพักจะพิมพ์สัญญาเช่าฉบับนี้ให้ลงลายมือชื่อร่วมกัน
                </div>

                <div className="pt-2 space-y-2.5">
                  <Link
                    href="/explore/booking-status"
                    className="w-full inline-flex justify-center items-center py-4 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20 transition-all cursor-pointer"
                  >
                    📋 ดูสถานะการจองของฉัน
                  </Link>
                  <Link
                    href="/"
                    className="w-full inline-flex justify-center items-center py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    กลับไปหน้าแนะนำหอเกษร 2
                  </Link>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Printable Contract Modal (Word/PDF/Print) */}
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
