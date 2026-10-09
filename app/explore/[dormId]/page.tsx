'use client';

import { useState, useEffect, use } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatWidget from '@/app/components/ChatWidget';

interface Room {
  id: number;
  room_number: string;
  room_type: string;
  price: string;
  status: string;
  floor: number;
  image_url: string | null;
  display_status?: string;
  move_out_date?: string | null;
  move_out_status?: string | null;
}

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

export default function GuestDormRoomsPage({ params }: { params: Promise<{ dormId: string }> }) {
  const resolvedParams = use(params);
  const dormId = resolvedParams.dormId;
  const router = useRouter();
  const { data: session } = useSession();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [dormName, setDormName] = useState('...');
  const [dormInfo, setDormInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'available' | 'moving_out'>('all');

  const handleOpenChat = () => {
    if (!session) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const btn = document.getElementById('open-chat-widget-btn');
    if (btn) {
      btn.click();
    } else {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { dormId: Number(dormId) } }));
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        // Fetch dorm info
        try {
          const dSingleRes = await fetch(`/api/dorms/${dormId}`);
          const dSingleData = await dSingleRes.json();
          if (dSingleData.success && dSingleData.data) {
            setDormInfo(dSingleData.data);
            setDormName(dSingleData.data.name);
          } else {
            const dRes = await fetch('/api/dorms');
            const dData = await dRes.json();
            if (dData.success) {
              const d = dData.data.find((item: any) => item.id.toString() === dormId);
              if (d) {
                setDormInfo(d);
                setDormName(d.name);
              }
            }
          }
        } catch (err) {
          console.error('Error fetching dorm info:', err);
        }

        // Fetch rooms for this dorm with explore filter enabled
        const res = await fetch(`/api/rooms?dormId=${dormId}&explore=true`);
        const data = await res.json();
        if (data.success) {
          setRooms(data.data);
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dormId]);

  // Determine if room is strictly available or moving out
  const isAvailable = (room: Room) => {
    return room.display_status === 'Available' || room.status === 'Available' || room.status === 'ว่าง';
  };

  const isMovingOut = (room: Room) => {
    return (
      room.display_status === 'MovingOut' ||
      room.status === 'MovingOut' ||
      room.status === 'Moving Out' ||
      room.status === 'กำลังจะย้ายออก' ||
      Boolean(room.move_out_date)
    );
  };

  // Filter only rooms that are either Available OR Moving Out
  const validRooms = rooms.filter(r => isAvailable(r) || isMovingOut(r));

  const filteredRooms = validRooms
    .filter(r => {
      if (filterTab === 'available') return isAvailable(r);
      if (filterTab === 'moving_out') return isMovingOut(r);
      return true;
    })
    .sort((a, b) => {
      const isTestA = /^t0?1$/i.test(a.room_number) || /^tc0?1$/i.test(a.room_number);
      const isTestB = /^t0?1$/i.test(b.room_number) || /^tc0?1$/i.test(b.room_number);
      if (isTestA && !isTestB) return -1;
      if (!isTestA && isTestB) return 1;
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
    });

  const availableCount = validRooms.filter(isAvailable).length;
  const movingOutCount = validRooms.filter(isMovingOut).length;

  const getFirstImage = (imageParam: string | null) => {
    if (!imageParam) return '/modern_dorm_room_2_1775739199686.png';
    try {
      if (imageParam.startsWith('[') && imageParam.endsWith(']')) {
        const images = JSON.parse(imageParam);
        return images[0] || '/modern_dorm_room_2_1775739199686.png';
      }
      return imageParam;
    } catch (e) {
      return imageParam;
    }
  };

  const formatMoveOutDate = (dateStr?: string | null) => {
    if (!dateStr) return null;
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-background px-4 sm:px-6 lg:px-8 py-8 sm:py-12 lg:py-16 max-w-7xl mx-auto space-y-10">
      <Link href="/" className="inline-flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors group">
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M10 19l-7-7m0 0l-7 7m7-7H3" />
        </svg>
        ย้อนกลับไปหน้าหลัก
      </Link>

      {/* 🏢 Dormitory Details & Overview Hero Card */}
      <div className="bg-card border border-border rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-xl space-y-8 animate-reveal relative overflow-hidden">
        {dormInfo?.cover_image && (
          <div className="absolute top-0 right-0 w-1/3 h-full opacity-10 pointer-events-none hidden md:block">
            <Image src={dormInfo.cover_image} alt={dormName} fill className="object-cover" />
          </div>
        )}

        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 relative z-10">
          <div className="space-y-3 max-w-2xl">
            <span className="px-3.5 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              หอพักเกษร 2 • Phayao
            </span>
            <h1 className="text-3xl sm:text-5xl font-display font-black tracking-tighter text-foreground italic break-words">
              {dormName}
            </h1>
            {dormInfo?.address && (
              <p className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                <span>📍</span>
                <span>{dormInfo.address}</span>
              </p>
            )}
          </div>

          {/* Action Buttons: Inquire & Call */}
          <div className="flex flex-wrap items-center gap-3 relative z-10 shrink-0">
            <button
              type="button"
              onClick={handleOpenChat}
              className="px-6 py-3.5 bg-primary hover:bg-primary/90 text-primary-foreground font-black text-xs uppercase tracking-wider rounded-2xl flex items-center gap-2 transition-all shadow-lg shadow-primary/25 hover:scale-105 active:scale-95 cursor-pointer"
            >
              <span>💬</span>
              <span>สอบถามหอพัก / แชท</span>
            </button>

            {dormInfo?.phone && (
              <a
                href={`tel:${dormInfo.phone}`}
                className="px-5 py-3.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 font-black text-xs uppercase tracking-wider rounded-2xl flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
              >
                <span>📞</span>
                <span>โทร {dormInfo.phone}</span>
              </a>
            )}

            {dormInfo?.map_url && (
              <a
                href={dormInfo.map_url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-5 py-3.5 bg-secondary hover:bg-secondary/80 text-foreground border border-border font-bold text-xs uppercase tracking-wider rounded-2xl flex items-center gap-2 transition-all"
              >
                <span>🗺️</span>
                <span>แผนที่ Google Maps</span>
              </a>
            )}
          </div>
        </div>

        {/* 💧 Utility Rates & Rules Bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
          <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-3">
            <span className="text-2xl">💧</span>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">ค่าน้ำประปา</span>
              <span className="text-base font-black text-cyan-500">
                ฿{dormInfo?.water_rate || 100} <span className="text-xs font-medium text-muted-foreground">/ เดือน (เหมาจ่าย)</span>
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
            <span className="text-2xl">⚡</span>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">ค่าไฟฟ้า</span>
              <span className="text-base font-black text-amber-500">
                ฿{dormInfo?.electricity_rate || 7} <span className="text-xs font-medium text-muted-foreground">/ ยูนิต</span>
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center gap-3">
            <span className="text-2xl">{dormInfo?.pet_friendly ? '🐾' : '🚫'}</span>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">สัตว์เลี้ยง</span>
              <span className="text-xs font-black text-foreground">
                {dormInfo?.pet_friendly ? 'อนุญาตให้เลี้ยง' : 'ห้ามเลี้ยงสัตว์'}
              </span>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-muted/40 border border-border flex items-center gap-3">
            <span className="text-2xl">{dormInfo?.has_parking ? '🚗' : '🛵'}</span>
            <div>
              <span className="text-[10px] font-bold text-muted-foreground uppercase block">ที่จอดรถ</span>
              <span className="text-xs font-black text-foreground">
                {dormInfo?.has_parking ? 'มีที่จอดรถยนต์' : 'เฉพาะมอเตอร์ไซค์'}
              </span>
            </div>
          </div>
        </div>

        {/* Rules & Facilities Highlights */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
          {/* Rules / Policies */}
          <div className="p-5 rounded-2xl bg-muted/20 border border-border/80 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span>📋</span> กฎระเบียบและเงื่อนไขการพักอาศัย
            </h3>
            <ul className="text-xs space-y-2 text-foreground/80 font-medium">
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>สัญญาเช่าขั้นต่ำ 1 ปี (เงินประกันสัญญา 1 เดือน ได้รับคืนเมื่อครบสัญญา)</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>ระบบรักษาความปลอดภัย เข้า-ออกประตูหลักด้วยคีย์การ์ดตลอด 24 ชั่วโมง</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-500">✓</span>
                <span>{dormInfo?.has_wifi ? 'มีสัญญาณอินเทอร์เน็ต Wi-Fi ฟรีครอบคลุม' : 'ผู้เช่าสามารถติดตั้งอินเทอร์เน็ตส่วนตัวได้'}</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-rose-500">✕</span>
                <span>ห้ามสูบบุหรี่และสิ่งเสพติดภายในห้องพักและพื้นที่ส่วนกลางเด็ดขาด</span>
              </li>
            </ul>
          </div>

          {/* Description & Facilities */}
          <div className="p-5 rounded-2xl bg-muted/20 border border-border/80 space-y-3">
            <h3 className="text-xs font-black uppercase tracking-widest text-muted-foreground flex items-center gap-2">
              <span>✨</span> สิ่งอำนวยความสะดวกและรายละเอียดหอพัก
            </h3>
            {dormInfo?.description && (
              <p className="text-xs text-muted-foreground leading-relaxed">
                {dormInfo.description}
              </p>
            )}
            {dormInfo?.facilities && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {dormInfo.facilities.split(',').map((item: string, idx: number) => {
                  const trimmed = item.trim();
                  if (!trimmed) return null;
                  return (
                    <span key={idx} className="px-2.5 py-1 bg-secondary text-[11px] font-bold rounded-lg border border-border">
                      {trimmed}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 📍 Pinned Map & Location Section */}
      <div className="rounded-3xl bg-card text-card-foreground border border-border p-6 sm:p-8 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5 mb-1">
              <span>📍</span> แผนที่และการเดินทาง
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-foreground">
              ตำแหน่งที่ตั้งและการปักหมุดหอพัก
            </h2>
            {dormInfo?.address && (
              <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                <span>📌</span>
                <span>{dormInfo.address}</span>
              </p>
            )}
          </div>

          <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent((dormName ? dormName + ' ' : '') + (dormInfo?.address || 'จ.พะเยา'))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm hover:scale-105 active:scale-95"
            >
              <span>🧭</span>
              <span>ขอเส้นทางนำทาง ↗</span>
            </a>
            <a
              href={getGoogleMapsDirectUrl(dormInfo?.map_url, dormInfo?.address, dormName)}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground text-xs font-bold rounded-xl border border-border flex items-center gap-1.5 transition-all"
            >
              <span>🗺️</span>
              <span>เปิดใน Google Maps</span>
            </a>
          </div>
        </div>

        {/* Embedded Interactive Map */}
        <div className="w-full h-72 sm:h-96 rounded-2xl overflow-hidden border border-border shadow-inner relative bg-muted/40">
          <iframe
            title={`แผนที่ ${dormName}`}
            src={getGoogleMapsEmbedUrl(dormInfo?.map_url, dormInfo?.address, dormName)}
            className="w-full h-full border-0"
            loading="lazy"
            allowFullScreen
            referrerPolicy="no-referrer-when-downgrade"
          />
        </div>
      </div>

      {/* Filter Tabs & Rooms Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 pt-4">
        <div>
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-foreground">
            รายการห้องพักเปิดรับจอง
          </h2>
          <p className="text-muted-foreground text-xs font-bold mt-1">
            เลือกห้องพักเพื่อดูภาพถ่าย 360°, สัญญาเช่า และชำระเงินมัดจำออนไลน์
          </p>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-muted/60 dark:bg-card border border-border rounded-full shadow-inner">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all ${
              filterTab === 'all'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            ทั้งหมด ({validRooms.length})
          </button>
          <button
            onClick={() => setFilterTab('available')}
            className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              filterTab === 'available'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            ว่างพร้อมอยู่ ({availableCount})
          </button>
          <button
            onClick={() => setFilterTab('moving_out')}
            className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 ${
              filterTab === 'moving_out'
                ? 'bg-amber-600 text-white shadow-md'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            กำลังจะย้ายออก ({movingOutCount})
          </button>
        </div>
      </div>

      <div className="h-px w-full bg-border" />

      {/* Rooms Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
          {[1, 2, 3].map(i => (
            <div key={i} className="aspect-[4/5] sm:aspect-[3.5/5.5] rounded-[3rem] sm:rounded-[4rem] bg-muted animate-pulse" />
          ))}
        </div>
      ) : filteredRooms.length === 0 ? (
        <div className="text-center py-24 px-6 bg-card border border-border rounded-[3rem] shadow-sm max-w-2xl mx-auto space-y-6">
          <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-7h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div className="space-y-2">
            <h3 className="text-2xl font-bold text-foreground">ยังไม่มีห้องพักที่ตรงกับเงื่อนไข</h3>
            <p className="text-muted-foreground text-sm font-medium">
              {filterTab === 'available' 
                ? 'ขณะนี้ยังไม่มีห้องว่างพร้อมอยู่ ลองดูห้องที่กำลังจะย้ายออกหรือเลือกหอพักอื่น'
                : filterTab === 'moving_out'
                ? 'ขณะนี้ยังไม่มีห้องที่กำลังจะย้ายออก'
                : 'ขณะนี้ไม่มีห้องว่างหรือห้องที่กำลังจะย้ายออกสำหรับหอพักนี้'}
            </p>
          </div>
          <div className="pt-4">
            <button
              onClick={() => setFilterTab('all')}
              className="px-6 py-2.5 rounded-full text-xs font-bold bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
            >
              ดูห้องทั้งหมด
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {filteredRooms.map((room) => {
            const roomIsAvailable = isAvailable(room);
            const moveOutFormatted = formatMoveOutDate(room.move_out_date);

            return (
              <Link 
                href={`/explore/room/${room.id}`} 
                key={room.id}
                className="group relative flex flex-col aspect-[4/5] sm:aspect-[3.5/5.5] rounded-[3rem] sm:rounded-[4rem] overflow-hidden bg-white dark:bg-card border border-border shadow-2xl transition-all duration-700 hover:-translate-y-4 premium-shadow"
              >
                <div className="absolute inset-0 z-0">
                  <Image 
                    src={getFirstImage(room.image_url)} 
                    alt={room.room_number} 
                    fill 
                    className="object-cover transition-transform duration-[2000ms] group-hover:scale-110 opacity-95 group-hover:opacity-100"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent opacity-90 group-hover:opacity-100 transition-opacity" />
                </div>
                
                <div className="relative z-10 mt-auto p-8 sm:p-12 text-white">
                   <div className="flex flex-wrap items-center gap-2 mb-6">
                      <span className="px-4 py-1.5 bg-white/20 backdrop-blur-md rounded-full text-[9px] font-black uppercase tracking-widest border border-white/20">
                        Floor {room.floor}
                      </span>
                      
                      {roomIsAvailable ? (
                        <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-emerald-500 text-white border-emerald-400 shadow-lg shadow-emerald-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          ว่าง พร้อมเข้าอยู่
                        </span>
                      ) : (
                        <span className="px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border bg-amber-500 text-slate-950 font-black border-amber-400 shadow-lg shadow-amber-500/30 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-pulse" />
                          กำลังจะย้ายออก (จองล่วงหน้า)
                        </span>
                      )}
                   </div>
                   
                   <h3 className="text-4xl font-display font-black tracking-tight mb-2 leading-tight group-hover:text-primary transition-colors">
                     Room {room.room_number}
                   </h3>

                   <div className="space-y-1 mb-8">
                     <p className="text-white/80 font-black text-[10px] uppercase tracking-[0.2em] drop-shadow-sm">
                       {room.room_type} · Minimal Living Ecosystem
                     </p>
                     {!roomIsAvailable && moveOutFormatted && (
                       <p className="text-amber-300 font-bold text-xs flex items-center gap-1.5">
                         <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                         </svg>
                         พร้อมเข้าอยู่หลัง {moveOutFormatted}
                       </p>
                     )}
                   </div>
                   
                   <div className="flex items-center justify-between border-t border-white/10 pt-8">
                      <div className="flex flex-col gap-1">
                         <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Monthly Rent</span>
                         <span className="text-3xl font-display font-black tracking-tight">฿{Number(room.price).toLocaleString()} <span className="text-xs font-black text-white/40">/mo</span></span>
                      </div>
                      <div className="w-16 h-16 rounded-full bg-white dark:bg-secondary flex items-center justify-center text-foreground group-hover:bg-primary group-hover:text-primary-foreground transition-all duration-500 shadow-2xl group-hover:scale-110 group-hover:rotate-12">
                        <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </div>
                   </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Floating Chat Widget for this Dormitory */}
      <ChatWidget dormId={Number(dormId)} ownerName={dormInfo?.owner_name || dormName} />
    </div>
  );
}
