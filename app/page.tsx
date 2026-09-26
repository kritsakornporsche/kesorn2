'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Navbar from './components/Navbar';
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

interface DormInfo {
  id: number;
  name: string;
  address: string;
  phone: string;
  cover_image: string | null;
  description: string | null;
  pet_friendly: boolean;
  has_parking: boolean;
  has_air_con: boolean;
  has_wifi: boolean;
  has_lan: boolean;
  water_rate: number;
  electricity_rate: number;
  facilities: string;
  map_url: string;
  min_price: number;
  available_rooms_count: number;
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

const DORM_GALLERY = [
  {
    id: 1,
    title: 'อาคารหอพักเกษร 2 (วิวภายนอก)',
    category: 'exterior',
    categoryName: 'ภายนอกอาคาร',
    desc: 'อาคาร 2 ชั้น โทนสีฟ้าสดใส บรรยากาศโปร่งสบาย สะอาดและเงียบสงบ อยู่ฝั่งเดียวกับมอ ใกล้หอวรางคณา',
    src: '/images/kesorn/building-exterior.jpg',
  },
  {
    id: 2,
    title: 'ด้านหน้าอาคารหอพักเต็มอาคาร (20 ห้องพัก)',
    category: 'exterior',
    categoryName: 'ภายนอกอาคาร',
    desc: 'อาคาร 2 ชั้น รวม 20 ห้องพัก มีบันไดขึ้นชั้น 2 ระเบียงทางเดินกว้าง และพื้นที่จอดรถด้านหน้า',
    src: '/images/kesorn/building-front.jpg',
  },
  {
    id: 3,
    title: 'ภายในห้องพัก: เตียงนอน 5 ฟุต & ตู้เสื้อผ้าไม้สัก',
    category: 'room',
    categoryName: 'ห้องพัก',
    desc: 'เตียงนอนพร้อมฟูก 5 ฟุต, ตู้เสื้อผ้าไม้สักบานเกล็ด, โต๊ะและเก้าอี้ทำงานไม้, ชั้นวางของติดผนัง 3 ชั้น และผ้าม่านบังแดด',
    src: '/images/kesorn/room-bed.jpg',
  },
  {
    id: 4,
    title: 'มุมโต๊ะทำงาน & เครื่องปรับอากาศ / พัดลมติดผนัง',
    category: 'room',
    categoryName: 'ห้องพัก',
    desc: 'ติดตั้งเครื่องปรับอากาศ, พัดลมติดผนัง, โต๊ะทำงาน, ราวแขวนสิ่งของ และกล่องเราเตอร์อินเทอร์เน็ต Wi-Fi ประจำห้อง',
    src: '/images/kesorn/room-ac-fan.jpg',
  },
  {
    id: 5,
    title: 'ห้องน้ำส่วนตัวในห้องพัก (กว้างขวาง)',
    category: 'bathroom',
    categoryName: 'ห้องน้ำ',
    desc: 'ห้องน้ำกว้างมาก พร้อมเครื่องทำน้ำอุ่น อ่างล้างหน้า กระจกแต่งหน้า สุขภัณฑ์ชักโครกพร้อมสายฉีด และผ้าม่านกั้นส่วนเปียก-แห้ง',
    src: '/images/kesorn/bathroom.jpg',
  },
  {
    id: 6,
    title: 'ระเบียงและทางเดินชั้น 2',
    category: 'balcony',
    categoryName: 'ระเบียงและทางเดิน',
    desc: 'ทางเดินปูกระเบื้องสะอาดตา ราวกันตกสแตนเลสโปร่งรับลมธรรมชาติ บรรยากาศเงียบสงบและปลอดภัย',
    src: '/images/kesorn/corridor.jpg',
  },
];

export default function Home() {
  const router = useRouter();
  const { data: session } = useSession();

  const [dormInfo, setDormInfo] = useState<DormInfo | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<'all' | 'available' | 'moving_out'>('all');
  const [selectedPhoto, setSelectedPhoto] = useState<typeof DORM_GALLERY[0] | null>(null);
  const [galleryFilter, setGalleryFilter] = useState<'all' | 'exterior' | 'room' | 'bathroom' | 'balcony'>('all');

  const handleOpenChat = () => {
    if (!session) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    const btn = document.getElementById('open-chat-widget-btn');
    if (btn) {
      btn.click();
    } else {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { dormId: 1 } }));
    }
  };

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        // 1. Fetch Dorm Info
        const dRes = await fetch('/api/dorms/1');
        const dData = await dRes.json();
        if (dData.success && dData.data) {
          setDormInfo(dData.data);
        }

        // 2. Fetch Rooms
        const rRes = await fetch('/api/rooms?explore=true');
        const rData = await rRes.json();
        if (rData.success && Array.isArray(rData.data)) {
          setRooms(rData.data);
        }
      } catch (err) {
        console.error('Fetch home error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

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

  const validRooms = rooms.filter(r => isAvailable(r) || isMovingOut(r));

  const filteredRooms = validRooms
    .filter(r => {
      if (filterTab === 'available') return isAvailable(r);
      if (filterTab === 'moving_out') return isMovingOut(r);
      return true;
    })
    .sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
    });

  const availableCount = validRooms.filter(isAvailable).length;
  const movingOutCount = validRooms.filter(isMovingOut).length;

  const getFirstImage = (imageParam: string | null) => {
    if (!imageParam) return '/images/kesorn/room-bed.jpg';
    try {
      if (imageParam.startsWith('[') && imageParam.endsWith(']')) {
        const images = JSON.parse(imageParam);
        return images[0] || '/images/kesorn/room-bed.jpg';
      }
      return imageParam;
    } catch {
      return imageParam;
    }
  };

  const dormName = dormInfo?.name || 'หอพักเกษร 2 (หน้า ม.พะเยา)';

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-200">
      <Navbar />

      {/* Hero Section */}
      <section className="relative h-[55vh] min-h-[420px] flex items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Image
            src={dormInfo?.cover_image || '/images/kesorn/building-exterior.jpg'}
            alt={dormName}
            fill
            className="object-cover brightness-[0.45] dark:brightness-[0.35]"
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-transparent to-background" />
        </div>

        <div className="relative z-10 text-center px-6 animate-reveal max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-[10px] font-black uppercase tracking-[0.3em] text-primary border border-white/20 mb-6 shadow-xl">
            <span className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
            Kesorn 2 Dormitory • Phayao
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-display font-black tracking-tight text-white mb-4 sm:mb-6 leading-tight">
            {dormName}
          </h1>
          <p className="max-w-2xl mx-auto text-white/90 dark:text-white/80 font-semibold text-sm sm:text-base leading-relaxed">
            {dormInfo?.description || 'หอพักคุณภาพ บรรยากาศเงียบสงบ สะอาด ปลอดภัย สิ่งอำนวยความสะดวกครบครัน พร้อมระบบจัดการออนไลน์ทั้งจองห้อง เช็กบิล แจ้งซ่อม'}
          </p>
        </div>
      </section>

      {/* Main Content Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-12 relative z-20 space-y-12 pb-24">

        {/* 🏢 Dormitory Overview & Contact Card */}
        <div className="bg-card border border-border rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl space-y-8 backdrop-blur-xl">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
            <div className="space-y-3 max-w-2xl">
              <span className="px-3.5 py-1.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[10px] font-black uppercase tracking-widest inline-flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                หอพักคุณภาพ • จ.พะเยา
              </span>
              <h2 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-foreground">
                ยินดีต้อนรับสู่ {dormName}
              </h2>
              {dormInfo?.address && (
                <p className="text-muted-foreground text-sm font-medium flex items-center gap-2">
                  <span>📍</span>
                  <span>{dormInfo.address}</span>
                </p>
              )}
            </div>

            {/* Action Buttons: Chat & Call */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
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
                  <span>เปิด Google Maps</span>
                </a>
              )}
            </div>
          </div>

          {/* 💧 Utility Rates & Highlights Bar (Exact RentHub Data) */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-4 border-t border-border">
            <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-3">
              <span className="text-2xl">💧</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">ค่าน้ำประปา</span>
                <span className="text-sm font-black text-cyan-500">
                  ฟรี <span className="text-[11px] font-medium text-muted-foreground">(รวมในค่าห้อง)</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
              <span className="text-2xl">⚡</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">ค่าไฟฟ้า</span>
                <span className="text-sm font-black text-amber-500">
                  ฿6 <span className="text-[11px] font-medium text-muted-foreground">/ ยูนิต</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
              <span className="text-2xl">🚪</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">ห้องว่างพร้อมอยู่</span>
                <span className="text-sm font-black text-emerald-500">
                  {availableCount} <span className="text-[11px] font-medium text-muted-foreground">ห้อง</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center gap-3">
              <span className="text-2xl">🏷️</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">ราคาห้องพัก</span>
                <span className="text-sm font-black text-purple-500">
                  ฿2,800 - 3,100 <span className="text-[11px] font-medium text-muted-foreground">/ ด.</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/20 flex items-center gap-3">
              <span className="text-2xl">🔒</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">เงินประกัน</span>
                <span className="text-sm font-black text-blue-500">
                  ฿2,000 <span className="text-[11px] font-medium text-muted-foreground">(คืนครบสัญญา)</span>
                </span>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 flex items-center gap-3">
              <span className="text-2xl">📝</span>
              <div>
                <span className="text-[10px] font-bold text-muted-foreground uppercase block">ค่าจองสิทธิ์</span>
                <span className="text-sm font-black text-rose-500">
                  ฿1,000 <span className="text-[11px] font-medium text-muted-foreground">(ล็อกห้องทันที)</span>
                </span>
              </div>
            </div>
          </div>

          {/* Rules & Facilities Overview (From RentHub Photos & Post) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            <div className="p-6 rounded-3xl bg-muted/20 border border-border/80 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <span>📋</span> ระเบียบและข้อกำหนดหอพักเกษร 2
              </h3>
              <ul className="text-xs space-y-2.5 text-foreground font-medium">
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                  <span><strong>อนุญาตให้เลี้ยงสัตว์ได้ (Pet-Friendly):</strong> เช่น สุนัข แมว โดยผู้พักดูแลความสะอาด</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                  <span><strong>ที่จอดรถสะดวก:</strong> มีที่จอดรถยนต์ และที่จอดรถมอเตอร์ไซค์/จักรยาน</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                  <span><strong>อินเทอร์เน็ต Wi-Fi ฟรี:</strong> ติดตั้งกล่องเราเตอร์ประจำห้องทุกห้อง สัญญาณแรง</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-500 flex items-center justify-center font-bold text-xs shrink-0">✓</span>
                  <span><strong>ฟรีค่าน้ำประปา:</strong> รวมในค่าห้องพักแล้ว • ค่าไฟหน่วยละ 6 บาท</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-rose-500/20 text-rose-500 flex items-center justify-center font-bold text-xs shrink-0">✕</span>
                  <span><strong>ห้ามสูบบุหรี่และสิ่งเสพติด:</strong> ปลอดบุหรี่ในห้องพักและอาคารเด็ดขาด</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-500 flex items-center justify-center font-bold text-xs shrink-0">ℹ</span>
                  <span><strong>เงื่อนไขเข้าพัก:</strong> จองเพียง 1,000 บาท • เงินประกัน 2,000 บาท</span>
                </li>
              </ul>
            </div>

            <div className="p-6 rounded-3xl bg-muted/20 border border-border/80 space-y-4">
              <h3 className="text-xs font-black uppercase tracking-widest text-primary flex items-center gap-2">
                <span>✨</span> สิ่งอำนวยความสะดวกครบครัน
              </h3>
              <div className="flex flex-wrap gap-2 pt-1">
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🛏️ เตียงที่นอน 5 ฟุต</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🚪 ตู้เสื้อผ้าไม้สักบานเกล็ด</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🧊 ตู้เย็นประจำห้อง</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🪑 โต๊ะและเก้าอี้ทำงานไม้</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🌀 พัดลมติดผนัง</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🚿 เครื่องทำน้ำอุ่น (ห้องน้ำกว้างมาก)</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🍽️ อ่างล้างจานระเบียง (ทำกับข้าวได้)</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🧺 ระเบียงด้านนอกกว้างมาก</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">📚 ชั้นวางของติดผนัง 3 ชั้น</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🪝 ราวแขวนของรอบห้อง</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">📶 กล่องเราเตอร์ Wi-Fi ทุกห้อง</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🚗 ที่จอดรถยนต์ & รถมอเตอร์ไซค์</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">📹 กล้องวงจรปิด (CCTV)</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">🐶 อนุญาตให้เลี้ยงสัตว์ได้</span>
                <span className="px-3 py-1.5 bg-secondary text-xs font-bold rounded-xl border border-border">❄️ เครื่องปรับอากาศ (ห้องแอร์)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 📸 Real Dormitory Photo Gallery Section (แกลเลอรีภาพถ่ายสถานที่จริง) */}
        <div className="rounded-[2.5rem] bg-card text-card-foreground border border-border p-6 sm:p-10 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.25em] text-primary flex items-center gap-1.5 mb-1.5">
                <span>📸</span> Real Photos & Facilities
              </span>
              <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight text-foreground">
                แกลเลอรีภาพถ่ายสถานที่จริง หอพักเกษร 2
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                ภาพถ่ายจริงของตัวอาคาร ภายในห้องพัก ห้องน้ำ และระเบียงทางเดิน (คลิกที่ภาพเพื่อดูรูปขยายใหญ่)
              </p>
            </div>

            {/* Gallery Category Filter */}
            <div className="flex flex-wrap items-center gap-1.5 p-1 bg-muted/60 rounded-2xl border border-border shrink-0">
              {[
                { id: 'all', label: 'ทั้งหมด (6)' },
                { id: 'exterior', label: 'ภายนอกอาคาร (2)' },
                { id: 'room', label: 'ห้องพัก (2)' },
                { id: 'bathroom', label: 'ห้องน้ำ (1)' },
                { id: 'balcony', label: 'ระเบียงทางเดิน (1)' }
              ].map(f => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setGalleryFilter(f.id as any)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                    galleryFilter === f.id
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Photo Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
            {DORM_GALLERY
              .filter(item => galleryFilter === 'all' || item.category === galleryFilter)
              .map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className="group relative rounded-3xl overflow-hidden bg-muted border border-border shadow-lg cursor-pointer hover:-translate-y-1.5 hover:border-primary hover:shadow-2xl transition-all duration-300"
                >
                  <div className="relative h-60 w-full overflow-hidden">
                    <Image
                      src={photo.src}
                      alt={photo.title}
                      fill
                      className="object-cover group-hover:scale-110 transition-transform duration-700"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-80 group-hover:opacity-90 transition-opacity" />

                    <span className="absolute top-3.5 left-3.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/20">
                      {photo.categoryName}
                    </span>

                    <span className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-white/20 backdrop-blur-md text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      🔍
                    </span>

                    <div className="absolute bottom-4 left-4 right-4 text-white space-y-1">
                      <h4 className="font-bold text-sm line-clamp-1 group-hover:text-primary-foreground">
                        {photo.title}
                      </h4>
                      <p className="text-[11px] text-white/80 line-clamp-2 leading-relaxed">
                        {photo.desc}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>

        {/* 📍 Interactive Map Section */}
        <div className="rounded-[2.5rem] bg-card text-card-foreground border border-border p-6 sm:p-8 shadow-xl space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary flex items-center gap-1.5 mb-1">
                <span>📍</span> แผนที่และการเดินทาง
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-foreground">
                ตำแหน่งที่ตั้งหอพักเกษร 2
              </h3>
              {dormInfo?.address && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1.5">
                  <span>📌</span>
                  <span>{dormInfo.address}</span>
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 shrink-0 flex-wrap">
              <a
                href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent('หอพักเกษร 2 ' + (dormInfo?.address || 'จ.พะเยา'))}`}
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

        {/* 🚪 Rooms Listing Header & Filter Tabs */}
        <div className="space-y-6 pt-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary block mb-1">
                Room Availability
              </span>
              <h2 className="text-2xl sm:text-4xl font-display font-black tracking-tight text-foreground">
                ห้องพักว่างและเปิดรับจอง
              </h2>
              <p className="text-muted-foreground text-xs font-medium mt-1">
                คลิกเลือกห้องพักเพื่อดูภาพห้อง ทำสัญญาเช่าดิจิทัล และชำระเงินมัดจำออนไลน์ได้ทันที
              </p>
            </div>

            {/* Filter Tabs */}
            <div className="flex flex-wrap items-center gap-2 p-1.5 bg-muted/60 dark:bg-card border border-border rounded-full shadow-inner">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                ทั้งหมด ({validRooms.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('available')}
                className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                  filterTab === 'available'
                    ? 'bg-emerald-600 text-white shadow-md'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                ว่างพร้อมอยู่ ({availableCount})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('moving_out')}
                className={`px-5 py-2.5 rounded-full text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
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

          {/* Rooms Grid */}
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {[1, 2, 3].map(i => (
                <div key={i} className="aspect-[4/5] rounded-[2.5rem] bg-muted animate-pulse" />
              ))}
            </div>
          ) : filteredRooms.length === 0 ? (
            <div className="text-center py-20 px-6 bg-card border border-border rounded-[2.5rem] shadow-sm max-w-xl mx-auto space-y-4">
              <span className="text-4xl block">🚪</span>
              <h3 className="text-lg font-black text-foreground">
                {filterTab === 'available' ? 'ขณะนี้ไม่มีห้องว่างพร้อมอยู่' : 'ไม่พบรายการห้องพักตามตัวกรอง'}
              </h3>
              <p className="text-xs text-muted-foreground">
                สามารถกดปุ่ม "สอบถามหอพัก / แชท" เพื่อติดต่อสอบถามคิวห้องว่างกับเจ้าของหอพักได้โดยตรงครับ
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {filteredRooms.map((room) => {
                const available = isAvailable(room);
                const movingOut = isMovingOut(room);
                const isAirCon = (room.room_type || '').toLowerCase().includes('air') || (room.room_type || '').includes('แอร์');

                return (
                  <Link
                    href={`/explore/room/${room.id}`}
                    key={room.id}
                    className="group flex flex-col rounded-[2.5rem] overflow-hidden bg-card border border-border shadow-xl hover:-translate-y-2 hover:border-primary hover:shadow-2xl transition-all duration-300"
                  >
                    {/* Room Image */}
                    <div className="relative h-60 w-full overflow-hidden bg-muted">
                      <Image
                        src={getFirstImage(room.image_url)}
                        alt={`ห้อง ${room.room_number}`}
                        fill
                        className="object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20" />

                      {/* Status Badge */}
                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between gap-2 z-10">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold text-white backdrop-blur-md shadow-md flex items-center gap-1.5 ${
                          available ? 'bg-emerald-600/90' : 'bg-amber-600/90'
                        }`}>
                          <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                          {available ? 'ว่างพร้อมอยู่' : 'กำลังจะย้ายออก'}
                        </span>

                        <span className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold">
                          ชั้น {room.floor || 1}
                        </span>
                      </div>

                      {/* Price Tag */}
                      <div className="absolute bottom-4 left-4 z-10">
                        <div className="text-xl sm:text-2xl font-black text-white drop-shadow-md">
                          ฿{Number(room.price).toLocaleString()}
                          <span className="text-xs font-medium text-white/90"> /เดือน</span>
                        </div>
                        <span className="text-[10px] text-emerald-300 font-bold block drop-shadow">
                          ✓ ฟรีค่าน้ำ • ฟรี Wi-Fi เราเตอร์
                        </span>
                      </div>
                    </div>

                    {/* Room Details */}
                    <div className="p-6 flex flex-col flex-1 justify-between gap-4">
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="text-xl font-display font-black text-foreground group-hover:text-primary transition-colors">
                            ห้อง {room.room_number}
                          </h3>
                          <span className="text-xs font-bold px-2.5 py-1 rounded-lg bg-secondary text-secondary-foreground border border-border">
                            {isAirCon ? '❄️ แอร์' : '🌀 พัดลม'}
                          </span>
                        </div>

                        <p className="text-xs text-muted-foreground font-medium">
                          ประเภท: {room.room_type || 'ห้องมาตรฐาน'} • ชั้น {room.floor || 1}
                        </p>

                        {movingOut && room.move_out_date && (
                          <div className="mt-3 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-bold">
                            ย้ายออกประมาณ: {new Date(room.move_out_date).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </div>

                      <div className="pt-3 border-t border-border flex items-center justify-between text-xs font-bold text-primary group-hover:underline">
                        <span>ดูรายละเอียด & จองห้องนี้</span>
                        <span>→</span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </main>

      {/* 🖼️ Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-4xl w-full bg-card rounded-3xl overflow-hidden border border-border shadow-2xl flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Image */}
            <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-black">
              <Image
                src={selectedPhoto.src}
                alt={selectedPhoto.title}
                fill
                className="object-contain"
                priority
              />
              <button
                type="button"
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full bg-black/60 hover:bg-black/90 text-white flex items-center justify-center font-bold text-lg backdrop-blur-md border border-white/20 transition-all cursor-pointer z-10"
              >
                ✕
              </button>
            </div>

            {/* Modal Footer Description */}
            <div className="p-6 bg-card space-y-2 border-t border-border">
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-primary/10 text-primary border border-primary/20">
                  {selectedPhoto.categoryName}
                </span>
                <h3 className="text-lg font-black text-foreground">
                  {selectedPhoto.title}
                </h3>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {selectedPhoto.desc}
              </p>
            </div>
          </div>
        </div>
      )}

      <ChatWidget />
    </div>
  );
}
