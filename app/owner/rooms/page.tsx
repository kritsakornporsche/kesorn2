'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Image from 'next/image';

interface Room {
  id: number;
  room_number: string;
  room_type: string;
  price: number;
  status: string;
  floor: number;
  image_url?: string | null;
}

export default function RoomsManagement() {
  const { data: session, status: authStatus } = useSession();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const router = useRouter();

  // Batch Form State
  const [batchForm, setBatchForm] = useState({
    prefix: 'A',
    floor: 1,
    startRoom: 1,
    endRoom: 10,
    pattern: 'prefix_floor_num', // 'prefix_floor_num' (A101), 'prefix_num' (A1), 'prefix_floor_dash' (A1-01)
    room_type: 'Standard',
    price: 4500,
    status: 'Available',
  });

  // Updated Form State to handle multiple images
  const [formData, setFormData] = useState({
    room_number: '',
    room_type: 'Standard',
    price: 4500,
    floor: 1,
    status: 'Available',
    images: [] as string[] // array of base64 strings
  });

  const [ownerDormId, setOwnerDormId] = useState<number | null>(1);

  const fetchRooms = async (dormId: number = 1) => {
    setLoading(true);
    try {
      const url = dormId > 0 ? `/api/rooms?dormId=${dormId}` : '/api/rooms';
      console.log('[Rooms] Fetching from:', url);
      const res = await fetch(url);
      const data = await res.json();
      console.log('[Rooms] Fetch result:', data);
      if (data.success && Array.isArray(data.data)) {
        setRooms(data.data);
      }
    } catch (err) {
      console.error('[Rooms] Fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin');
      return;
    }

    if (authStatus === 'authenticated' && session?.user?.email) {
      const init = async () => {
        try {
          console.log('[Rooms] Initializing for:', session.user?.email);
          const res = await fetch(`/api/owner/onboarding?email=${session.user?.email}`);
          const data = await res.json();
          console.log('[Rooms] Onboarding data:', data);
          
          const dormId = data.dorm?.dorm_id || data.dorm?.id || (data.dorms && data.dorms[0]?.id) || 1;
          setOwnerDormId(dormId);
          fetchRooms(dormId);
        } catch (err) {
          console.error('[Rooms] Init error:', err);
          fetchRooms(1);
        } finally {
          setLoading(false);
        }
      };
      init();
    } else if (authStatus !== 'loading') {
      fetchRooms(1);
    }
  }, [authStatus, session, router]);

  const getGeneratedRoomNumbers = () => {
    const list: string[] = [];
    const start = Math.min(batchForm.startRoom, batchForm.endRoom);
    const end = Math.max(batchForm.startRoom, batchForm.endRoom);

    if (isNaN(start) || isNaN(end) || end - start > 200) return list;

    for (let i = start; i <= end; i++) {
      const numStr = i.toString();
      let roomNum = '';
      if (batchForm.pattern === 'prefix_floor_num') {
        const formattedNum = numStr.padStart(2, '0');
        roomNum = `${batchForm.prefix}${batchForm.floor}${formattedNum}`;
      } else if (batchForm.pattern === 'prefix_floor_dash') {
        const formattedNum = numStr.padStart(2, '0');
        roomNum = `${batchForm.prefix}${batchForm.floor}-${formattedNum}`;
      } else {
        roomNum = `${batchForm.prefix}${numStr}`;
      }
      list.push(roomNum);
    }
    return list;
  };

  const handleBatchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const roomNumbers = getGeneratedRoomNumbers();
    if (roomNumbers.length === 0) {
      alert('กรุณาระบุช่วงเลขห้องให้ถูกต้อง');
      return;
    }

    setBatchLoading(true);
    try {
      const roomsToCreate = roomNumbers.map(num => ({
        room_number: num,
        room_type: batchForm.room_type,
        price: batchForm.price,
        floor: batchForm.floor,
        status: batchForm.status,
        dorm_id: ownerDormId
      }));

      const res = await fetch('/api/rooms/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: roomsToCreate, dorm_id: ownerDormId }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || `เพิ่มห้องพักสำเร็จ ${data.createdCount} ห้อง`);
        setIsBatchModalOpen(false);
        if (ownerDormId) fetchRooms(ownerDormId);
      } else {
        alert(`เกิดข้อผิดพลาด: ${data.message}`);
      }
    } catch (err: any) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการสร้างห้องพัก');
    } finally {
      setBatchLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const url = editingRoom ? `/api/rooms/${editingRoom.id}` : '/api/rooms';
    const method = editingRoom ? 'PUT' : 'POST';

    // Stringify images array for storage in the image_url column
    const payload = {
      ...formData,
      image_url: JSON.stringify(formData.images),
      dorm_id: ownerDormId
    };

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        setEditingRoom(null);
        setFormData({ room_number: '', room_type: 'Standard', price: 4500, floor: 1, status: 'Available', images: [] });
        if (ownerDormId) fetchRooms(ownerDormId);
      } else {
        alert(`${data.message}${data.error ? `: ${data.error}` : ''}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleEdit = (room: Room) => {
    setEditingRoom(room);
    
    // Parse images from the stringified array
    let parsedImages = [];
    try {
      if (room.image_url) {
        if (room.image_url.startsWith('[')) {
          parsedImages = JSON.parse(room.image_url);
        } else {
          parsedImages = [room.image_url]; // legacy single image support
        }
      }
    } catch (e) {
      parsedImages = [room.image_url];
    }

    setFormData({
      room_number: room.room_number,
      room_type: room.room_type,
      price: room.price,
      floor: room.floor,
      status: room.status,
      images: parsedImages
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('ยืนยันการลบห้องพักนี้?')) return;
    try {
      await fetch(`/api/rooms/${id}`, { method: 'DELETE' });
      if (ownerDormId) fetchRooms(ownerDormId);
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({
          ...prev,
          images: [...prev.images, reader.result as string]
        }));
      };
      reader.readAsDataURL(file);
    });
  };

  const removeImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      images: prev.images.filter((_, i) => i !== index)
    }));
  };

  const getFirstImage = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return null;
    try {
      if (imageUrl.startsWith('[')) {
        const parsed = JSON.parse(imageUrl);
        return parsed[0] || null;
      }
      return imageUrl;
    } catch (e) {
      return imageUrl;
    }
  };

  const getImageCount = (imageUrl: string | null | undefined) => {
    if (!imageUrl) return 0;
    try {
      if (imageUrl.startsWith('[')) {
        return JSON.parse(imageUrl).length;
      }
      return 1;
    } catch (e) {
      return 1;
    }
  };

  const filteredRooms = rooms
    .filter(room => {
      const matchesSearch = room.room_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            room.room_type.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesFilter = filterStatus === 'All' || room.status === filterStatus;
      return matchesSearch && matchesFilter;
    })
    .sort((a, b) => {
      if (a.floor !== b.floor) return a.floor - b.floor;
      return a.room_number.localeCompare(b.room_number, undefined, { numeric: true });
    });

  const stats = {
    total: rooms.length,
    available: rooms.filter(r => r.status === 'Available').length,
    occupied: rooms.filter(r => r.status === 'Occupied' || r.status === 'มีผู้เช่า').length,
    maintenance: rooms.filter(r => r.status === 'Maintenance' || r.status === 'ปิดปรับปรุง').length,
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background text-foreground scroll-smooth custom-scrollbar">
      {/* Header - Sticky with Backdrop Blur */}
      <header className="sticky top-0 bg-card/90 backdrop-blur-xl border-b border-border flex items-center justify-between px-6 sm:px-10 py-4 shrink-0 z-20 shadow-sm transition-all duration-300">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <div className="w-1.5 h-6 bg-primary rounded-full" />
            <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">จัดการห้องพัก</h1>
          </div>
          <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-[0.2em] ml-3.5 mt-0.5 opacity-80">
            SmartDom Asset & Unit Management
          </p>
        </div>
        
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative group">
            <input 
              type="text" 
              placeholder="ค้นหาเลขห้อง หรือ ประเภท..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-11 pr-5 py-2.5 sm:py-3 bg-secondary/80 border border-border rounded-2xl text-xs sm:text-sm font-bold text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary focus:bg-card transition-all outline-none w-48 sm:w-64 group-hover:w-64 sm:group-hover:w-80 duration-500 shadow-sm"
            />
            <svg className="w-4 h-4 sm:w-5 sm:h-5 absolute left-3.5 sm:left-4 top-1/2 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          <button 
            onClick={() => setIsBatchModalOpen(true)}
            className="px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all duration-300 group bg-emerald-600 text-white hover:bg-emerald-500 shadow-lg hover:brightness-110 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <div className="p-1 bg-black/20 rounded-lg group-hover:scale-110 transition-transform">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <span className="hidden sm:inline">เพิ่มหลายห้อง</span>
            <span className="sm:hidden">เพิ่มชุด</span>
          </button>

          <button 
            onClick={() => { setEditingRoom(null); setFormData({ room_number: '', room_type: 'Standard', price: 4500, floor: 1, status: 'Available', images: [] }); setIsModalOpen(true); }}
            className="px-4 sm:px-6 py-2.5 sm:py-3.5 rounded-2xl font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 transition-all duration-300 group bg-primary text-white shadow-lg hover:brightness-110 active:scale-95 cursor-pointer whitespace-nowrap"
          >
            <div className="p-1 bg-card/20 rounded-lg group-hover:rotate-90 transition-transform duration-500">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </div>
            <span>เพิ่มห้องพัก</span>
          </button>
        </div>
      </header>

      {/* Hero Stats */}
      <div className="px-6 sm:px-10 py-5 sm:py-6 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 bg-gradient-to-b from-white/40 to-transparent">
        {[
          { label: 'ยูนิตทั้งหมด', val: stats.total, color: 'bg-primary', icon: '🏢' },
          { label: 'ห้องว่าง', val: stats.available, color: 'bg-emerald-500', icon: '✨' },
          { label: 'มีผู้เช่าแล้ว', val: stats.occupied, color: 'bg-blue-500', icon: '🔑' },
          { label: 'รอตรวจสภาพ', val: stats.maintenance, color: 'bg-amber-500', icon: '🛠️' },
        ].map((s, i) => (
          <div key={i} className="bg-card p-4 sm:p-5 rounded-3xl border border-border shadow-sm flex items-center gap-4 sm:gap-5 hover:border-primary transition-colors group">
            <div className={`w-12 h-12 sm:w-14 sm:h-14 ${s.color} rounded-2xl flex items-center justify-center text-2xl sm:text-3xl shadow-lg shadow-black/5 group-hover:scale-110 transition-transform duration-500 shrink-0`}>
              {s.icon}
            </div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">{s.label}</p>
              <h3 className="text-xl sm:text-2xl font-black text-foreground">{s.val}</h3>
            </div>
          </div>
        ))}
      </div>

      {/* Filter Section */}
      <div className="px-6 sm:px-10 mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex bg-white/5 p-1 rounded-2xl border border-border">
          {['All', 'Available', 'Occupied', 'Maintenance'].map((s) => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              className={`px-4 sm:px-6 py-2 rounded-xl text-xs font-black transition-all ${
                filterStatus === s 
                ? 'bg-card text-white shadow-sm ring-1 ring-[#DCD3C6]' 
                : 'text-white/50 hover:text-white/80'
              }`}
            >
              {s === 'All' ? 'ทั้งหมด' : s === 'Available' ? 'ว่าง' : s === 'Occupied' ? 'มีผู้เช่า' : 'ปิดซ่อม'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <p className="text-xs font-bold text-muted-foreground">
            แสดง <span className="text-foreground font-black">{filteredRooms.length}</span> จาก <span className="text-foreground font-black">{rooms.length}</span> ห้อง
          </p>
        </div>
      </div>

      {/* Room Grid */}
      <div className="px-6 sm:px-10 pb-16">
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
              <div key={i} className="bg-card h-[380px] rounded-[40px] border border-border animate-pulse flex flex-col p-6">
                <div className="bg-white/5 h-48 rounded-3xl mb-6" />
                <div className="h-6 bg-white/5 w-2/3 rounded-lg mb-4" />
                <div className="h-4 bg-white/5 w-1/2 rounded-lg" />
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-20">
            <div className="w-24 h-24 bg-white/5 rounded-full flex items-center justify-center text-4xl mb-6">🔍</div>
            <h3 className="text-xl font-black text-foreground mb-2 text-balance">ไม่พบข้อมูลห้องพักที่คุณต้องการ</h3>
            <p className="text-muted-foreground text-sm font-medium">ลองเปลี่ยนเงื่อนไขการค้นหา หรือเพิ่มห้องพักใหม่ในระบบ</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
            {filteredRooms.map((room) => {
              const firstImage = getFirstImage(room.image_url);
              const extraCount = getImageCount(room.image_url) - 1;

              return (
              <div 
                key={room.id} 
                className="bg-card rounded-[40px] border border-border shadow-md shadow-[#DCD3C6]/10 overflow-hidden group hover:shadow-2xl hover:border-primary hover:-translate-y-2 transition-all duration-500 flex flex-col"
              >
                {/* Image Placeholder / Real Image */}
                <div className="relative h-56 w-full bg-card overflow-hidden">
                   {firstImage ? (
                     <>
                       <Image src={firstImage} alt={room.room_number} fill unoptimized className="object-cover group-hover:scale-110 transition-transform duration-700" />
                       {extraCount > 0 && (
                         <div className="absolute bottom-4 right-4 bg-black/60 backdrop-blur-md text-white text-[10px] font-black px-2 py-1 rounded-lg">
                            +{extraCount} รูป
                         </div>
                       )}
                     </>
                   ) : (
                     <div className="absolute inset-0 flex flex-col items-center justify-center opacity-30 group-hover:opacity-100 transition-opacity duration-500">
                        <svg className="w-16 h-16 text-muted-foreground mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                        </svg>
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">SMARTDOM UNIT</span>
                     </div>
                   )}
                   <div className="absolute top-4 left-4 bg-card/90 border border-border backdrop-blur-md text-foreground px-4 py-2 rounded-2xl text-sm font-black shadow-lg z-10">
                      ห้อง {room.room_number}
                   </div>
                   <div className={`absolute top-4 right-4 px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border backdrop-blur-md shadow-xl z-10 ${
                     room.status === 'Available' ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 
                     room.status === 'Occupied' || room.status === 'มีผู้เช่า' ? 'bg-blue-500/10 text-blue-600 border-blue-500/20' : 'bg-amber-500/10 text-amber-600 border-amber-500/20'
                   }`}>
                      {room.status === 'Available' ? 'ว่าง' : room.status === 'Occupied' || room.status === 'มีผู้เช่า' ? 'มีผู้เช่าแล้ว' : 'ปิดปรับปรุง'}
                   </div>
                </div>

                <div className="p-8 flex flex-col flex-1">
                   <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">{room.room_type} (Type)</span>
                      <span className="text-[10px] font-black text-muted-foreground uppercase tracking-[0.2em]">ชั้น {room.floor} (Floor)</span>
                   </div>
                   <div className="flex items-end gap-1 mb-8">
                      <span className="text-3xl font-black text-foreground">฿{Number(room.price).toLocaleString()}</span>
                      <span className="text-xs font-bold text-muted-foreground mb-1.5 whitespace-nowrap">/ เดือน</span>
                   </div>

                   <div className="mt-auto flex items-center gap-3 pt-6 border-t border-[#F3EFE9]">
                      <button 
                        onClick={() => handleEdit(room)}
                        className="flex-1 bg-card text-muted-foreground py-3.5 rounded-2xl text-xs font-bold border border-border hover:bg-primary/90 hover:text-white hover:border-primary hover:shadow-lg hover:shadow-primary/20 transition-all active:scale-95"
                      >
                         แก้ไขข้อมูล
                      </button>
                      <button 
                        onClick={() => handleDelete(room.id)}
                        className="p-3.5 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all group/del"
                      >
                         <svg className="w-5 h-5 group-hover/del:scale-125 duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                   </div>
                </div>
              </div>
            )})}
          </div>
        )}
      </div>

      {/* CRUD Modal - Premium Redesign */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-card rounded-[48px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom duration-500 border border-border max-h-[90vh] flex flex-col">
             <div className="bg-card border-b border-border px-10 py-8 text-white relative overflow-hidden shrink-0">
                <div className="relative z-10 text-center">
                  <h2 className="text-3xl font-black mb-1 tracking-tight">{editingRoom ? 'แก้ไขข้อมูลยูนิต' : 'เพิ่มยูนิตใหม่'}</h2>
                  <p className="text-white/40 text-[9px] font-black uppercase tracking-[0.3em] font-display font-medium">SMARTDOM PREMIUM REAL ESTATE</p>
                </div>
             </div>
             
             <div className="overflow-y-auto p-10 custom-scrollbar">
               <form onSubmit={handleSubmit} className="space-y-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">หมายเลขห้อง</label>
                        <input 
                          type="text" 
                          required
                          value={formData.room_number}
                          onChange={(e) => setFormData({...formData, room_number: e.target.value})}
                          className="w-full px-6 py-4 bg-background border border-border rounded-[24px] focus:ring-4 focus:ring-primary/10 focus:border-primary focus:bg-card outline-none font-black text-foreground text-lg transition-all"
                          placeholder="101"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">ประเภท (Type)</label>
                        <select 
                            value={formData.room_type}
                            onChange={(e) => setFormData({...formData, room_type: e.target.value})}
                            className="w-full px-6 py-4 bg-background border border-border rounded-[24px] font-black outline-none text-foreground transition-all focus:bg-card cursor-pointer"
                        >
                            <option>Standard</option>
                            <option>Deluxe</option>
                            <option>Premium</option>
                            <option>Suite</option>
                        </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">ชั้น (Floor)</label>
                        <input 
                            type="number" 
                            value={formData.floor}
                            onChange={(e) => setFormData({...formData, floor: parseInt(e.target.value)})}
                            className="w-full px-6 py-4 bg-background border border-border rounded-[24px] font-black outline-none text-foreground focus:bg-card transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">สถานะ (Status)</label>
                        <select 
                            value={formData.status}
                            onChange={(e) => setFormData({...formData, status: e.target.value})}
                            className="w-full px-6 py-4 bg-background border border-border rounded-[24px] font-black outline-none text-foreground focus:bg-card cursor-pointer"
                        >
                            <option value="Available">ว่าง (Available)</option>
                            <option value="Occupied">มีผู้เช่า (Occupied)</option>
                            <option value="Maintenance">ปิดปรับปรุง (Maintenance)</option>
                        </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 text-center">ราคาเช่ารายเดือน (Rental Price)</label>
                    <div className="relative group max-w-xs mx-auto">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground group-focus-within:scale-110 transition-transform">฿</span>
                        <input 
                          type="number" 
                          required
                          value={formData.price}
                          onChange={(e) => setFormData({...formData, price: parseFloat(e.target.value)})}
                          className="w-full pl-14 pr-6 py-5 bg-white/5 border border-primary/30 rounded-[30px] font-black outline-none text-foreground text-3xl text-center focus:ring-8 focus:ring-primary/5 focus:bg-card transition-all"
                        />
                    </div>
                  </div>

                  <div className="space-y-4">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">รูปภาพห้องพัก (Gallery - หลายรูป)</label>
                    
                    <div className="grid grid-cols-3 gap-4">
                        {formData.images.map((img, idx) => (
                          <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-border group/img shadow-sm hover:border-primary transition-all">
                              <Image src={img} alt={`Preview ${idx}`} fill unoptimized className="object-cover" />
                              <button 
                                type="button"
                                onClick={() => removeImage(idx)}
                                className="absolute top-2 right-2 bg-rose-500 text-white p-1.5 rounded-lg opacity-0 group-hover/img:opacity-100 transition-opacity shadow-lg scale-90"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                              </button>
                          </div>
                        ))}
                        
                        <label className="aspect-square rounded-2xl border-2 border-dashed border-border bg-card flex flex-col items-center justify-center cursor-pointer hover:border-primary hover:bg-card transition-all group">
                            <div className="w-10 h-10 bg-card rounded-xl shadow-sm mb-2 flex items-center justify-center group-hover:scale-110 transition-transform">
                              <svg className="w-6 h-6 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                            </div>
                            <span className="text-[9px] font-black text-muted-foreground uppercase tracking-widest">เพิ่มรูป</span>
                            <input 
                                type="file" 
                                accept="image/*"
                                multiple
                                className="hidden" 
                                onChange={handleFileUpload}
                            />
                        </label>
                    </div>
                  </div>

                  <div className="flex gap-6 pt-6 sr-only-btn-container shrink-0">
                    <button 
                      type="button" 
                      onClick={() => setIsModalOpen(false)} 
                      className="flex-1 py-5 text-muted-foreground font-black hover:bg-secondary rounded-[28px] transition-all"
                    >
                      ยกเลิก
                    </button>
                    <button 
                      type="submit" 
                      className="flex-[2] py-5 bg-primary text-white font-black rounded-[28px] shadow-xl hover:brightness-110 active:scale-95 transition-all"
                    >
                        {editingRoom ? 'อัปเดตข้อมูล' : 'บันทึกลงฐานข้อมูล'}
                    </button>
                  </div>
               </form>
             </div>
          </div>
        </div>
      )}

      {/* Batch Create Modal */}
      {isBatchModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-card rounded-[48px] w-full max-w-2xl overflow-hidden shadow-2xl animate-in zoom-in slide-in-from-bottom duration-500 border border-border max-h-[90vh] flex flex-col">
             <div className="bg-gradient-to-r from-emerald-600 to-teal-700 border-b border-border px-10 py-8 text-white relative overflow-hidden shrink-0">
                <div className="relative z-10 text-center">
                  <h2 className="text-3xl font-black mb-1 tracking-tight">เพิ่มข้อมูลหลายห้อง (Batch)</h2>
                  <p className="text-white/80 text-[10px] font-black uppercase tracking-[0.25em]">สร้างยูนิตหลายห้องพร้อมกัน เช่น ตึก A ชั้น 1 ห้อง 1-10</p>
                </div>
             </div>
             
             <div className="overflow-y-auto p-10 custom-scrollbar space-y-8">
               <form onSubmit={handleBatchSubmit} className="space-y-8">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">ตึก / คำนำหน้า (Building / Prefix)</label>
                        <input 
                          type="text" 
                          value={batchForm.prefix}
                          onChange={(e) => setBatchForm({...batchForm, prefix: e.target.value})}
                          className="w-full px-6 py-4 bg-background border border-border rounded-[24px] focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-card outline-none font-black text-foreground text-lg transition-all"
                          placeholder="เช่น A หรือ ตึก A-"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">ชั้น (Floor)</label>
                        <input 
                          type="number" 
                          required
                          min={1}
                          value={batchForm.floor}
                          onChange={(e) => setBatchForm({...batchForm, floor: parseInt(e.target.value) || 1})}
                          className="w-full px-6 py-4 bg-background border border-border rounded-[24px] focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-card outline-none font-black text-foreground text-lg transition-all"
                        />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">เลขห้องเริ่มต้น (Start)</label>
                        <input 
                          type="number" 
                          required
                          min={1}
                          value={batchForm.startRoom}
                          onChange={(e) => setBatchForm({...batchForm, startRoom: parseInt(e.target.value) || 1})}
                          className="w-full px-6 py-4 bg-background border border-border rounded-[24px] focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-card outline-none font-black text-foreground text-lg transition-all"
                          placeholder="1"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">เลขห้องสิ้นสุด (End)</label>
                        <input 
                          type="number" 
                          required
                          min={1}
                          value={batchForm.endRoom}
                          onChange={(e) => setBatchForm({...batchForm, endRoom: parseInt(e.target.value) || 1})}
                          className="w-full px-6 py-4 bg-background border border-border rounded-[24px] focus:ring-4 focus:ring-emerald-500/20 focus:border-emerald-500 focus:bg-card outline-none font-black text-foreground text-lg transition-all"
                          placeholder="10"
                        />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">รูปแบบการสร้างเลขห้อง (Format Pattern)</label>
                    <div className="grid grid-cols-3 gap-3">
                      {[
                        { id: 'prefix_floor_num', label: 'ตึก + ชั้น + เลขห้อง', example: `${batchForm.prefix}${batchForm.floor}01` },
                        { id: 'prefix_num', label: 'ตึก + เลขห้องตรงๆ', example: `${batchForm.prefix}${batchForm.startRoom}` },
                        { id: 'prefix_floor_dash', label: 'ตึก + ชั้น - เลขห้อง', example: `${batchForm.prefix}${batchForm.floor}-01` },
                      ].map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => setBatchForm({...batchForm, pattern: p.id})}
                          className={`p-4 rounded-2xl border text-left flex flex-col gap-1 transition-all ${
                            batchForm.pattern === p.id 
                            ? 'bg-emerald-500/10 border-emerald-500 text-white' 
                            : 'bg-secondary border-border text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                          }`}
                        >
                          <span className="text-xs font-bold">{p.label}</span>
                          <span className="text-[10px] text-emerald-400 font-mono font-bold">เช่น {p.example}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">ประเภท (Type)</label>
                        <select 
                            value={batchForm.room_type}
                            onChange={(e) => setBatchForm({...batchForm, room_type: e.target.value})}
                            className="w-full px-6 py-4 bg-background border border-border rounded-[24px] font-black outline-none text-foreground transition-all focus:bg-card cursor-pointer"
                        >
                            <option>Standard</option>
                            <option>Deluxe</option>
                            <option>Premium</option>
                            <option>Suite</option>
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1">สถานะเริ่มต้น (Status)</label>
                        <select 
                            value={batchForm.status}
                            onChange={(e) => setBatchForm({...batchForm, status: e.target.value})}
                            className="w-full px-6 py-4 bg-background border border-border rounded-[24px] font-black outline-none text-foreground focus:bg-card cursor-pointer"
                        >
                            <option value="Available">ว่าง (Available)</option>
                            <option value="Occupied">มีผู้เช่า (Occupied)</option>
                            <option value="Maintenance">ปิดปรับปรุง (Maintenance)</option>
                        </select>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="block text-[10px] font-black text-muted-foreground uppercase tracking-widest ml-1 text-center">ราคาเช่ารายเดือนทุกห้อง (Rental Price)</label>
                    <div className="relative group max-w-xs mx-auto">
                        <span className="absolute left-6 top-1/2 -translate-y-1/2 text-2xl font-black text-muted-foreground group-focus-within:scale-110 transition-transform">฿</span>
                        <input 
                          type="number" 
                          required
                          value={batchForm.price}
                          onChange={(e) => setBatchForm({...batchForm, price: parseFloat(e.target.value) || 0})}
                          className="w-full pl-14 pr-6 py-5 bg-white/5 border border-emerald-500/40 rounded-[30px] font-black outline-none text-foreground text-3xl text-center focus:ring-8 focus:ring-emerald-500/10 focus:bg-card transition-all"
                        />
                    </div>
                  </div>

                  {/* Live Preview Box */}
                  <div className="bg-white/5 p-6 rounded-3xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        ตัวอย่างห้องที่จะถูกเพิ่ม (Preview)
                      </span>
                      <span className="text-xs font-black text-white bg-emerald-600/30 border border-emerald-500/40 px-3 py-1 rounded-full">
                        รวม {getGeneratedRoomNumbers().length} ห้อง
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar pt-1">
                      {getGeneratedRoomNumbers().map((num, idx) => (
                        <span key={idx} className="px-3 py-1.5 bg-card border border-emerald-500/30 text-emerald-300 font-mono text-xs font-bold rounded-xl shadow-sm">
                          {num}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="flex gap-4 pt-4 shrink-0">
                    <button 
                      type="button" 
                      onClick={() => setIsBatchModalOpen(false)} 
                      className="flex-1 py-4 text-muted-foreground font-black hover:bg-secondary rounded-[24px] transition-all text-sm"
                    >
                      ยกเลิก
                    </button>
                    <button 
                      type="submit" 
                      disabled={batchLoading || getGeneratedRoomNumbers().length === 0}
                      className="flex-[2] py-4 bg-emerald-600 text-white font-black rounded-[24px] shadow-xl hover:bg-emerald-500 active:scale-95 transition-all disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                    >
                      {batchLoading ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          <span>กำลังบันทึกข้อมูล...</span>
                        </>
                      ) : (
                        `สร้างห้องพักทั้งหมด (${getGeneratedRoomNumbers().length} ห้อง)`
                      )}
                    </button>
                  </div>
               </form>
             </div>
          </div>
        </div>
      )}
    </div>
  );
}
