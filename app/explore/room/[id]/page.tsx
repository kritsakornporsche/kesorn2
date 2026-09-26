'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatWidget from '@/app/components/ChatWidget';
import ContractSimulator from '@/app/components/ContractSimulator';
import ContractSigner from '@/app/components/ContractSigner';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';

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
  const [step, setStep] = useState(1); // 1: Info, 2: Tenant Info, 3: Contract Modal, 4: QR Payment & Slip Upload, 5: Waiting Owner
  const [loading, setLoading] = useState(true);
  const [bookingData, setBookingData] = useState({ name: '', phone: '', email: '' });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // QR Code & Slip Payment States
  const [qrData, setQrData] = useState<{ qrImage: string; amount: number; promptpayNumber: string; promptpayName: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [slipData, setSlipData] = useState<string | null>(null);
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
        name: prev.name || session.user?.name || '',
        email: prev.email || session.user?.email || '',
      }));
    }
  }, [sessionStatus, session, room, step, isRoomAvailable]);

  // Fetch saved progress on mount
  useEffect(() => {
    async function fetchProgress() {
      if (sessionStatus === 'authenticated' && session?.user?.email && roomId) {
        try {
          const res = await fetch(`/api/booking/progress?roomId=${roomId}`);
          const data = await res.json();
          if (data.success && data.data) {
            if (data.data.current_step > 2) {
              setStep(data.data.current_step);
            } else {
              setStep(1);
            }
            setBookingData(data.data.booking_data);
          }
        } catch (e) {
          console.error('[Fetch Progress Error]', e);
        }
      }
    }
    fetchProgress();
  }, [sessionStatus, session, roomId]);

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
              bookingData
            })
          });
        } catch (e) {
          console.error('[Save Progress Error]', e);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, bookingData, sessionStatus, roomId]);

  // Fetch QR code when reaching Step 4 (Payment) - Deposit 1 month only
  useEffect(() => {
    async function fetchQr() {
      if (step === 4 && room) {
        setQrLoading(true);
        try {
          const depositAmount = 1000; // ค่าจองห้องพักเพื่อยืนยันสิทธิ์ 1,000 บาท ตามเงื่อนไขหอพักเกษร 2
          const res = await fetch(`/api/booking/qr?roomId=${roomId}&dormId=${room.dorm_id}&amount=${depositAmount}`);
          const data = await res.json();
          if (data.success) {
            setQrData(data);
          } else {
            console.error('QR fetch error:', data.message);
          }
        } catch (e) {
          console.error('[Fetch QR Error]', e);
        } finally {
          setQrLoading(false);
        }
      }
    }
    fetchQr();
  }, [step, room, roomId]);

  // Handle Contract Agreement -> Transition to Step 4 (QR Payment)
  const handleSignContract = (signature: string) => {
    setContractSignature(signature || 'CONFIRMED_E_CONTRACT');
    setStep(4);
  };

  // Handle Slip Upload
  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Final Submit with Slip & Contract (Deposit 1 month only)
  const handleFinalSubmit = async () => {
    if (!slipData) {
      alert('กรุณาแนบรูปภาพสลิปการโอนเงินก่อนส่งคำขอจอง');
      return;
    }

    setIsProcessing(true);
    try {
      const startDate = new Date().toISOString().split('T')[0];
      const endDateDate = new Date();
      endDateDate.setFullYear(endDateDate.getFullYear() + 1);
      const endDate = endDateDate.toISOString().split('T')[0];

      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: parseInt(roomId),
          signature: contractSignature,
          startDate,
          endDate,
          depositAmount: 1000, // ค่าจองห้องพักเพื่อยืนยันสิทธิ์ 1,000 บาท
          monthlyRent: Number(room.price),
          tenantName: bookingData.name,
          slipUrl: slipData
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

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
  const totalDeposit = 1000; // ค่าจองห้องพักเพื่อยืนยันสิทธิ์ 1,000 บาท ตามประกาศจริง
  const securityDeposit = 2000; // เงินประกันความเสียหาย 2,000 บาท
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
                  {room.room_type || 'Standard Room'}
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
                  <span className="text-base font-black truncate">{room.room_type || 'Standard'}</span>
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
                        {Number(room.water_rate) === 0 ? 'ฟรี (รวมในค่าห้อง)' : `฿${Number(room.water_rate)} / เดือน`}
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
                        ฿{room.electricity_rate !== undefined && room.electricity_rate !== null ? Number(room.electricity_rate) : 6}{' '}
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
                      <span className="text-muted-foreground text-[11px]">จองเพียง 1,000 บาท (เงินประกัน 2,000 บาท คืนเมื่อสิ้นสุดสัญญา)</span>
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
                      <span className="text-[11px] text-emerald-500 font-semibold">✓ ฟรีค่าน้ำ • ฟรี Wi-Fi เราเตอร์ทุกห้อง</span>
                    </div>
                    <span className="font-bold">฿{Number(room.price).toLocaleString()} / เดือน</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">อัตราค่าไฟฟ้า</span>
                    <span className="font-bold text-amber-500">฿6 / ยูนิต</span>
                  </div>

                  <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                    <div>
                      <span className="font-semibold block">เงินประกันความเสียหาย</span>
                      <span className="text-[11px] text-muted-foreground">ชำระวันทำสัญญา/ย้ายเข้า (คืนเมื่อครบสัญญา)</span>
                    </div>
                    <span className="font-bold text-muted-foreground">฿{securityDeposit.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold block text-primary">ค่าจองห้องพักล่วงหน้า</span>
                      <span className="text-[11px] text-emerald-500">ชำระวันนี้เพื่อล็อกสิทธิ์ห้องพัก</span>
                    </div>
                    <span className="font-bold text-primary">฿{totalDeposit.toLocaleString()}</span>
                  </div>

                  <div className="border-t border-border pt-4 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm block">ยอดชำระเงินจองวันนี้</span>
                      <span className="text-[11px] text-muted-foreground">(เงินจองเพื่อยืนยันสิทธิ์)</span>
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
                      onClick={() => setStep(2)}
                      className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      {isMovingOut ? 'ตกลงเช่า และเริ่มจองล่วงหน้า →' : 'ตกลงเช่า และเริ่มจองห้อง →'}
                    </button>
                  ) : (
                    <div className="p-5 bg-muted rounded-2xl text-center text-xs text-muted-foreground font-semibold">
                      ห้องพักนี้ไม่เปิดรับจองในขณะนี้
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

            {/* Step 2: Tenant Contact Info */}
            {step === 2 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 2 จาก 3</span>
                  <h2 className="text-2xl font-black tracking-tight">ระบุข้อมูลผู้จอง</h2>
                  <p className="text-xs text-muted-foreground">ข้อมูลจะถูกนำไปใช้จัดทำสัญญาเช่าห้องพัก</p>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">ชื่อ - นามสกุล</label>
                    <input
                      type="text"
                      className="w-full px-5 py-4 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                      placeholder="ชื่อจริง - นามสกุลจริง"
                      value={bookingData.name}
                      onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">เบอร์โทรศัพท์ติดต่อ</label>
                    <input
                      type="tel"
                      className="w-full px-5 py-4 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                      placeholder="08X-XXX-XXXX"
                      value={bookingData.phone}
                      onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <button
                    onClick={() => setStep(3)}
                    disabled={!bookingData.name || !bookingData.phone}
                    className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    ถัดไป: ตรวจสอบและลงนามสัญญา →
                  </button>
                  <button
                    onClick={() => setStep(1)}
                    className="w-full py-3 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    ย้อนกลับ
                  </button>

                  {/* 💬 Quick contact in Step 2 */}
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

            {/* Step 4: PromptPay QR Payment & Transfer Slip Upload (1 Month Deposit Only) */}
            {step === 4 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2 text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">ขั้นตอนที่ 3: การชำระเงิน</span>
                  <h2 className="text-2xl font-black tracking-tight">โอนเงินค่าจองและแนบสลิป</h2>
                  <p className="text-xs text-muted-foreground">ชำระเงินจอง 1,000 บาท เพื่อล็อกห้องพักและยืนยันสิทธิ์</p>
                </div>

                {/* QR Code Container */}
                <div className="p-6 bg-slate-950/80 rounded-3xl border border-white/10 text-center space-y-4">
                  {qrLoading ? (
                    <div className="h-56 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : qrData?.qrImage ? (
                    <div className="space-y-3">
                      <div className="w-52 h-52 mx-auto bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center">
                        <img src={qrData.qrImage} alt="PromptPay QR Code" className="w-full h-full object-contain" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">{qrData.promptpayName}</p>
                        <p className="text-xs text-white/50 font-mono">พร้อมเพย์: {qrData.promptpayNumber}</p>
                        <div className="pt-1">
                          <span className="text-[10px] uppercase font-bold text-white/50 block">ยอดชำระเงินจองห้องพัก</span>
                          <span className="text-2xl font-black text-amber-400">฿{totalDeposit.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      ไม่สามารถโหลด QR Code ได้ กรุณาติดต่อผู้ดูแลหอพัก
                    </div>
                  )}
                </div>

                {qrData && (
                  <PromptPayBankSelector
                    qrImage={qrData.qrImage}
                    promptpayNumber={qrData.promptpayNumber}
                    promptpayName={qrData.promptpayName}
                    amount={totalDeposit}
                    fileName={`deposit-qr-room-${room.room_number}.png`}
                  />
                )}

                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300 leading-relaxed">
                  💡 <strong>หมายเหตุ:</strong> ชำระเฉพาะเงินประกัน 1 เดือนเพื่อยืนยันการจองห้องพัก สำหรับค่าเช่าเดือนแรก เจ้าของหอพักจะคิดคำนวณและเรียกเก็บเมื่อเข้าพักจริง
                </div>

                {/* Slip Upload Area */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    แนบรูปภาพสลิปการโอนเงิน (Transfer Slip) <span className="text-rose-500">*</span>
                  </label>

                  {slipData ? (
                    <div className="p-4 bg-secondary rounded-2xl border border-border flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-900 border border-border shrink-0">
                          <img src={slipData} alt="Slip Preview" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-500">✓ แนบสลิปเรียบร้อยแล้ว</p>
                          <p className="text-[11px] text-muted-foreground">พร้อมส่งให้เจ้าของหอพักตรวจสอบ</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSlipData(null)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        เปลี่ยนรูป
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-8 bg-secondary/60 hover:bg-secondary border-2 border-dashed border-border rounded-2xl cursor-pointer transition-all hover:border-primary group">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition-transform">
                        📷
                      </div>
                      <span className="text-xs font-bold text-foreground">คลิกเพื่ออัปโหลดสลิปโอนเงิน</span>
                      <span className="text-[10px] text-muted-foreground mt-1">รองรับไฟล์ JPG, PNG (ไม่เกิน 5MB)</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload} />
                    </label>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleFinalSubmit}
                    disabled={!slipData || isProcessing}
                    className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-sm transition-all shadow-xl shadow-emerald-500/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    {isProcessing ? 'กำลังส่งคำขอจอง...' : '✓ ยืนยันการโอนเงินและส่งคำขอจอง'}
                  </button>
                  <button
                    onClick={() => setStep(3)}
                    disabled={isProcessing}
                    className="w-full py-3 text-xs font-bold text-muted-foreground hover:text-foreground"
                  >
                    ย้อนกลับไปดูสัญญา
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Finished & Waiting for Owner Approval */}
            {step === 5 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-full flex items-center justify-center text-2xl mx-auto animate-pulse">
                  ⏳
                </div>
                <div className="space-y-2">
                  <h3 className="text-2xl font-black tracking-tight">ส่งคำขอจองห้องพักสำเร็จ</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    ระบบได้ส่งสัญญาเช่าและสลิปการโอนเงินประกัน 1 เดือนไปยังเจ้าของหอพักเรียบร้อยแล้ว <br/>
                    เจ้าของหอพักจะทำการตรวจสอบและอนุมัติสัญญาเช่าให้คุณโดยเร็ว
                  </p>
                </div>

                <div className="pt-4 space-y-3">
                  <Link
                    href="/tenant"
                    className="w-full inline-flex justify-center items-center py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20 transition-all cursor-pointer"
                  >
                    📊 ไปที่หน้าแดชบอร์ดเพื่อติดตามสถานะการจอง
                  </Link>
                  <Link
                    href="/explore"
                    className="w-full inline-flex justify-center items-center py-3.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    กลับไปหน้าสำรวจหอพัก
                  </Link>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Contract Signer Modal (Step 3) */}
      {step === 3 && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 lg:p-12 overflow-y-auto bg-black/80 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-5xl w-full">
            <ContractSigner
              tenantName={bookingData.name}
              roomNumber={room.room_number}
              monthlyRent={Number(room.price)}
              depositAmount={totalDeposit}
              startDate={contractStartDate}
              endDate={contractEndDate}
              onSign={handleSignContract}
              onCancel={() => setStep(2)}
            />
          </div>
        </div>
      )}

      {/* Contract Simulator Modal */}
      {showSimulator && room && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-4xl w-full my-auto">
            <ContractSimulator
              initialPrice={Number(room.price)}
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
