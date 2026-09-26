"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import CameraMeterModal from "./components/CameraMeterModal";

interface MeterReading {
  id: number;
  room_id: number;
  room_number: string;
  type: 'Water' | 'Electricity';
  billing_cycle: string;
  previous_reading: number | string;
  current_reading: number | string;
  photo_url?: string | null;
  created_at?: string;
}

interface Room {
  id: number;
  room_number: string;
}

export default function MetersPage() {
  const router = useRouter();
  const [readings, setReadings] = useState<MeterReading[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [submitting, setSubmitting] = useState(false);

  // Camera Meter Modal State
  const [cameraModal, setCameraModal] = useState<{
    isOpen: boolean;
    roomNumber: string;
    roomId?: number;
    meterType: 'Water' | 'Electricity';
    previousReading: number;
    batchIndex?: number;
  } | null>(null);

  // Photo Evidence Lightbox Modal State
  const [viewingPhoto, setViewingPhoto] = useState<{
    url: string;
    roomNumber: string;
    type: 'Water' | 'Electricity';
    cycle: string;
    reading: number | string;
    prevReading: number | string;
    createdAt?: string;
  } | null>(null);

  // Checkbox Selection States
  const [selectedRoomIds, setSelectedRoomIds] = useState<number[]>([]);

  // Search & Filter States
  const [searchRoom, setSearchRoom] = useState<string>('');
  const [searchDate, setSearchDate] = useState<string>('');
  const [selectedCycle, setSelectedCycle] = useState<string>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'Water' | 'Electricity'>('all');
  
  // Pagination States
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);
  
  // Meter OCR AI Key Modal States
  const [showApiKeyModal, setShowApiKeyModal] = useState<boolean>(false);
  const [apiKeyInput, setApiKeyInput] = useState<string>('');
  const [showKeySecret, setShowKeySecret] = useState<boolean>(false);
  const [testingKey, setTestingKey] = useState<boolean>(false);
  const [savingKey, setSavingKey] = useState<boolean>(false);
  const [keyTestStatus, setKeyTestStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasCustomKey, setHasCustomKey] = useState<boolean>(false);
  const [systemFallback, setSystemFallback] = useState<boolean>(false);
  
  // Single Entry Form
  const [form, setForm] = useState({
    room_id: '',
    type: 'Electricity' as 'Electricity',
    previous_reading: '',
    current_reading: '',
    billing_cycle: new Date().toISOString().substring(0, 7),
    photo_url: '',
  });

  // Batch Form State
  const [batchCycle, setBatchCycle] = useState<string>('');
  const [batchItems, setBatchItems] = useState<{
    room_id: number;
    room_number: string;
    elec_prev: number;
    elec_curr: string;
    elec_photo?: string;
  }[]>([]);

  // Calculate Next Month string (YYYY-MM)
  const getNextMonthCycle = (currentCycleStr?: string) => {
    let baseDate = new Date();
    if (currentCycleStr && currentCycleStr.match(/^\d{4}-\d{2}$/)) {
      const [y, m] = currentCycleStr.split('-').map(Number);
      baseDate = new Date(y, m, 1);
    } else {
      baseDate.setMonth(baseDate.getMonth() + 1);
    }
    const year = baseDate.getFullYear();
    const month = String(baseDate.getMonth() + 1).padStart(2, '0');
    return `${year}-${month}`;
  };

  const fetchMeters = useCallback(async () => {
    try {
      setLoading(true);
      const url = selectedCycle === 'all' 
        ? '/api/owner/meters' 
        : `/api/owner/meters?billing_cycle=${selectedCycle}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.success) {
        setReadings(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [selectedCycle]);

  const fetchRooms = async () => {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      if (data.success) {
        setRooms(data.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchApiKeyStatus = async () => {
    try {
      const res = await fetch('/api/owner/meters/ocr/key');
      const data = await res.json();
      if (data.success) {
        setApiKeyInput(data.apiKey || '');
        setHasCustomKey(Boolean(data.hasCustomKey));
        setSystemFallback(Boolean(data.systemFallbackAvailable));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestKey = async () => {
    if (!apiKeyInput.trim()) {
      setKeyTestStatus({ type: 'error', message: 'กรุณากรอก API Key ก่อนกดทดสอบ' });
      return;
    }
    setTestingKey(true);
    setKeyTestStatus(null);
    try {
      const res = await fetch('/api/owner/meters/ocr/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: apiKeyInput.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setKeyTestStatus({ type: 'success', message: data.message });
      } else {
        setKeyTestStatus({ type: 'error', message: data.message || 'ทดสอบล้มเหลว' });
      }
    } catch (err: any) {
      setKeyTestStatus({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setTestingKey(false);
    }
  };

  const handleSaveKey = async (overrideKey?: string) => {
    setSavingKey(true);
    setKeyTestStatus(null);
    const keyToSave = overrideKey !== undefined ? overrideKey : apiKeyInput.trim();
    try {
      const res = await fetch('/api/owner/meters/ocr/key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyToSave, provider: 'gemini' }),
      });
      const data = await res.json();
      if (data.success) {
        setApiKeyInput(keyToSave);
        setHasCustomKey(Boolean(keyToSave));
        setKeyTestStatus({ 
          type: 'success', 
          message: keyToSave ? '✅ บันทึก API Key สำเร็จ! ระบบจะใช้คีย์นี้อ่านมิเตอร์อัตโนมัติ' : 'ล้างการตั้งค่าคีย์เรียบร้อยแล้ว' 
        });
        if (keyToSave) {
          setTimeout(() => setShowApiKeyModal(false), 1500);
        }
      } else {
        setKeyTestStatus({ type: 'error', message: data.message || 'บันทึกล้มเหลว' });
      }
    } catch (err: any) {
      setKeyTestStatus({ type: 'error', message: err.message || 'เกิดข้อผิดพลาดในการบันทึก' });
    } finally {
      setSavingKey(false);
    }
  };

  useEffect(() => {
    fetchMeters();
    fetchRooms();
    fetchApiKeyStatus();
  }, [fetchMeters]);

  // Unique billing cycles for filter
  const billingCycles = useMemo(() => {
    const cycles = Array.from(new Set(readings.map(r => r.billing_cycle))).filter(Boolean);
    cycles.sort().reverse();
    return cycles;
  }, [readings]);

  // Latest cycle
  const latestCycle = useMemo(() => {
    if (billingCycles.length > 0) return billingCycles[0];
    return new Date().toISOString().substring(0, 7);
  }, [billingCycles]);

  // Summary stats
  const stats = useMemo(() => {
    let waterUnits = 0;
    let elecUnits = 0;
    let totalRooms = new Set<string>();

    readings.forEach(r => {
      totalRooms.add(r.room_number);
      const units = Math.max(0, Number(r.current_reading) - Number(r.previous_reading));
      if (r.type === 'Water') waterUnits += units;
      else elecUnits += units;
    });

    return {
      waterUnits,
      elecUnits,
      recordedRooms: totalRooms.size,
      totalReadings: readings.length,
    };
  }, [readings]);

  // Filtered readings based on search and filters
  const filteredReadings = useMemo(() => {
    return readings.filter(r => {
      // Room search
      const matchesRoom = searchRoom.trim() === '' || 
        r.room_number.toLowerCase().includes(searchRoom.toLowerCase().trim());

      // Date / Cycle search
      const matchesDate = searchDate.trim() === '' || 
        r.billing_cycle.includes(searchDate.trim()) ||
        (r.created_at && r.created_at.includes(searchDate.trim()));

      // Type filter
      const matchesType = selectedType === 'all' || r.type === selectedType;

      return matchesRoom && matchesDate && matchesType;
    });
  }, [readings, searchRoom, searchDate, selectedType]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchRoom, searchDate, selectedType, selectedCycle, pageSize]);

  // Pagination calculation
  const totalPages = useMemo(() => {
    if (pageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredReadings.length / pageSize));
  }, [filteredReadings.length, pageSize]);

  const paginatedReadings = useMemo(() => {
    if (pageSize === 0) return filteredReadings;
    const start = (currentPage - 1) * pageSize;
    return filteredReadings.slice(start, start + pageSize);
  }, [filteredReadings, currentPage, pageSize]);

  // Toggle selection for a single room
  const toggleRoomSelection = (roomId: number) => {
    setSelectedRoomIds(prev => 
      prev.includes(roomId) ? prev.filter(id => id !== roomId) : [...prev, roomId]
    );
  };

  // Toggle Select All in current page
  const currentPageRoomIds = useMemo(() => {
    return Array.from(new Set(paginatedReadings.map(r => r.room_id)));
  }, [paginatedReadings]);

  const isAllCurrentPageSelected = useMemo(() => {
    if (currentPageRoomIds.length === 0) return false;
    return currentPageRoomIds.every(id => selectedRoomIds.includes(id));
  }, [currentPageRoomIds, selectedRoomIds]);

  const toggleSelectAllCurrentPage = () => {
    if (isAllCurrentPageSelected) {
      setSelectedRoomIds(prev => prev.filter(id => !currentPageRoomIds.includes(id)));
    } else {
      setSelectedRoomIds(prev => Array.from(new Set([...prev, ...currentPageRoomIds])));
    }
  };

  // Open single modal for new month (optionally for a specific room)
  const handleOpenNewMonthSingle = (targetRoomId?: number) => {
    const nextCycle = getNextMonthCycle(latestCycle);
    const chosenRoomId = targetRoomId ? String(targetRoomId) : (rooms[0]?.id ? String(rooms[0].id) : '');
    const lastRecord = readings.find(r => r.room_id === Number(chosenRoomId) && r.type === 'Electricity');
    
    setForm({
      room_id: chosenRoomId,
      type: 'Electricity',
      previous_reading: lastRecord ? String(lastRecord.current_reading) : '0',
      current_reading: '',
      billing_cycle: nextCycle,
      photo_url: '',
    });
    setShowModal(true);
  };

  // Open Batch Modal (for all rooms or only selected rooms)
  const handleOpenBatchModal = (onlySelected = false) => {
    const nextCycle = getNextMonthCycle(latestCycle);
    setBatchCycle(nextCycle);

    const targetRooms = onlySelected && selectedRoomIds.length > 0
      ? rooms.filter(r => selectedRoomIds.includes(r.id))
      : rooms;

    // Build batch template prefilled with previous electricity readings
    const items = targetRooms.map(room => {
      const lastElec = readings.find(r => r.room_id === room.id && r.type === 'Electricity');

      return {
        room_id: room.id,
        room_number: room.room_number,
        elec_prev: lastElec ? Number(lastElec.current_reading) : 0,
        elec_curr: '',
      };
    });

    setBatchItems(items);
    setShowBatchModal(true);
  };

  const handleRoomSelectChange = (roomId: string) => {
    const selectedRoomId = Number(roomId);
    const lastRecord = readings.find(r => r.room_id === selectedRoomId && r.type === form.type);
    setForm(prev => ({
      ...prev,
      room_id: roomId,
      previous_reading: lastRecord ? String(lastRecord.current_reading) : '0',
    }));
  };

  const handleTypeSelectChange = (type: 'Water' | 'Electricity') => {
    const selectedRoomId = Number(form.room_id);
    const lastRecord = readings.find(r => r.room_id === selectedRoomId && r.type === type);
    setForm(prev => ({
      ...prev,
      type,
      previous_reading: lastRecord ? String(lastRecord.current_reading) : '0',
    }));
  };

  // Submit Single Reading
  const handleSubmitSingle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.room_id || !form.current_reading || !form.billing_cycle) {
       alert('กรุณากรอกข้อมูลให้ครบถ้วน');
       return;
    }
    
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/meters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
           ...form,
           previous_reading: parseFloat(form.previous_reading) || 0,
           current_reading: parseFloat(form.current_reading)
        })
      });
      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        setForm(prev => ({ ...prev, previous_reading: '', current_reading: '' }));
        fetchMeters();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCameraConfirm = (reading: number, photoUrl: string) => {
    if (cameraModal?.batchIndex !== undefined) {
      const idx = cameraModal.batchIndex;
      const type = cameraModal.meterType;
      setBatchItems((prev) => {
        const copy = [...prev];
        if (type === 'Water') {
          copy[idx].water_curr = String(reading);
          copy[idx].water_photo = photoUrl;
        } else {
          copy[idx].elec_curr = String(reading);
          copy[idx].elec_photo = photoUrl;
        }
        return copy;
      });
    } else {
      setForm((prev) => ({
        ...prev,
        current_reading: String(reading),
        photo_url: photoUrl,
      }));
    }
  };

  // Submit Batch Readings
  const handleSubmitBatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchCycle) {
      alert('กรุณาระบุรอบบิล');
      return;
    }

    const payloadItems: any[] = [];
    batchItems.forEach(item => {
      if (item.elec_curr !== '') {
        payloadItems.push({
          room_id: item.room_id,
          type: 'Electricity',
          previous_reading: item.elec_prev,
          current_reading: parseFloat(item.elec_curr),
          billing_cycle: batchCycle,
          photo_url: item.elec_photo || null,
        });
      }
    });

    if (payloadItems.length === 0) {
      alert('กรุณากรอกเลขมิเตอร์อย่างน้อย 1 รายการ');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/meters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payloadItems })
      });
      const data = await res.json();
      if (data.success) {
        alert(`บันทึกมิเตอร์รอบเดือน ${batchCycle} สำเร็จ ${payloadItems.length} รายการ`);
        setShowBatchModal(false);
        setSelectedRoomIds([]);
        setSelectedCycle(batchCycle);
        fetchMeters();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาด');
      }
    } catch (err) {
      console.error(err);
      alert('เกิดข้อผิดพลาดในการเชื่อมต่อ');
    } finally {
      setSubmitting(false);
    }
  };

  const clearAllFilters = () => {
    setSearchRoom('');
    setSearchDate('');
    setSelectedCycle('all');
    setSelectedType('all');
  };

  const isFiltering = searchRoom !== '' || searchDate !== '' || selectedCycle !== 'all' || selectedType !== 'all';

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative z-10 text-foreground min-h-screen bg-background">
       {/* Top Header */}
       <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
         <div>
           <div className="flex items-center gap-3">
             <h1 className="text-2xl lg:text-3xl font-display font-black tracking-tight text-foreground">ระบบจดมิเตอร์ไฟฟ้า</h1>
             <span className="px-3 py-1 rounded-full text-xs font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
               รอบล่าสุด: {latestCycle}
             </span>
           </div>
           <p className="text-xs text-muted-foreground font-medium mt-1">บันทึกและตรวจสอบหน่วยการใช้ไฟฟ้า (หน่วยละ 7 บาท) · ค่าน้ำเหมาจ่าย 100 บาท/เดือน</p>
         </div>
         <div className="flex flex-wrap gap-3">
           <button 
             onClick={() => handleOpenNewMonthSingle()}
             className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
           >
             <span>➕</span> จดมิเตอร์เดือนใหม่ (รายห้อง)
           </button>
           <button 
             onClick={() => handleOpenBatchModal(false)}
             className="bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
           >
             <span>⚡</span> จดมิเตอร์ด่วนทุกห้องรอบใหม่
           </button>
           <button 
             onClick={() => router.push('/owner/billing')}
             className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer"
           >
             <span>💰</span> ไปหน้าออกบิลค่าเช่า →
           </button>
           <button 
             onClick={() => { setShowApiKeyModal(true); setKeyTestStatus(null); }}
             className={`text-xs font-bold px-3.5 py-2.5 rounded-xl border transition-all transform hover:scale-105 active:scale-95 flex items-center gap-2 cursor-pointer ${
               hasCustomKey 
                 ? 'bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 border-purple-500/40 shadow-sm'
                 : 'bg-secondary hover:bg-secondary/80 text-foreground border-border'
             }`}
             title="ตั้งค่า Google Gemini API Key สำหรับระบบอ่านมิเตอร์ด้วย AI"
           >
             <span>🔑</span>
             <span>ตั้งค่า AI Key</span>
             {hasCustomKey && (
               <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
             )}
           </button>
           <button 
             onClick={fetchMeters} 
             disabled={loading}
             className="bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-bold px-4 py-2.5 rounded-xl transition-all flex items-center gap-2 cursor-pointer"
           >
             <svg className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
               <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
             </svg>
             รีเฟรช
           </button>
         </div>
       </div>

       {/* Stats Grid */}
       <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
         <div className="bg-card border border-border p-6 rounded-3xl shadow-sm relative overflow-hidden group">
           <div className="text-xs font-bold text-muted-foreground uppercase tracking-wider">ห้องที่บันทึกแล้ว</div>
           <div className="mt-3 flex items-baseline gap-2">
             <span className="text-3xl font-display font-black text-foreground">{stats.recordedRooms}</span>
             <span className="text-xs text-muted-foreground font-medium">/ {rooms.length} ห้อง</span>
           </div>
         </div>
         <div className="bg-card border border-border p-6 rounded-3xl shadow-sm relative overflow-hidden group">
           <div className="text-xs font-bold text-cyan-400 uppercase tracking-wider">ค่าน้ำประปา (เหมาจ่าย)</div>
           <div className="mt-3 flex items-baseline gap-2">
             <span className="text-3xl font-display font-black text-cyan-400">100</span>
             <span className="text-xs text-cyan-400/60 font-medium">บาท / ห้อง / เดือน</span>
           </div>
         </div>
         <div className="bg-card border border-border p-6 rounded-3xl shadow-sm relative overflow-hidden group">
           <div className="text-xs font-bold text-orange-400 uppercase tracking-wider">หน่วยไฟฟ้ารวม (หน่วยละ 7 บาท)</div>
           <div className="mt-3 flex items-baseline gap-2">
             <span className="text-3xl font-display font-black text-orange-400">{stats.elecUnits.toLocaleString()}</span>
             <span className="text-xs text-orange-400/60 font-medium">หน่วย (ยูนิต)</span>
           </div>
         </div>
       </div>

       {/* Advanced Search & Multi-filter Suite */}
       <div className="bg-card border border-border rounded-3xl p-6 mb-6 shadow-sm">
         <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
           
           {/* Room Search */}
           <div className="md:col-span-4 relative">
             <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
               🔍 ค้นหาเลขห้อง
             </label>
             <div className="relative">
               <input
                 type="text"
                 placeholder="พิมพ์เลขห้อง เช่น 101, 202..."
                 value={searchRoom}
                 onChange={e => setSearchRoom(e.target.value)}
                 className="w-full bg-background border border-border text-foreground rounded-2xl pl-10 pr-10 py-2.5 text-xs text-foreground placeholder-muted-foreground font-bold outline-none focus:ring-2 focus:ring-blue-500/30"
               />
               <svg className="w-4 h-4 text-muted-foreground absolute left-3.5 top-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                 <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
               </svg>
               {searchRoom && (
                 <button
                   onClick={() => setSearchRoom('')}
                   className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                 >
                   ✕
                 </button>
               )}
             </div>
           </div>

           {/* Date / Month Search */}
           <div className="md:col-span-3 relative">
             <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
               📅 ค้นหาตามวันที่ / รอบเดือน
             </label>
             <div className="relative">
               <input
                 type="month"
                 value={searchDate}
                 onChange={e => setSearchDate(e.target.value)}
                 className="w-full bg-background border border-border text-foreground rounded-2xl px-4 py-2 text-xs text-foreground font-bold outline-none focus:ring-2 focus:ring-blue-500/30"
               />
               {searchDate && (
                 <button
                   onClick={() => setSearchDate('')}
                   className="absolute right-9 top-2 text-xs text-muted-foreground hover:text-foreground"
                   title="ล้างวันที่"
                 >
                   ✕
                 </button>
               )}
             </div>
           </div>

           {/* Billing Cycle Selector */}
           <div className="md:col-span-3">
             <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
               🔄 รอบบิล
             </label>
             <select
               value={selectedCycle}
               onChange={e => setSelectedCycle(e.target.value)}
               className="w-full bg-background border border-border text-foreground rounded-2xl px-4 py-2.5 text-xs text-foreground font-bold outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
             >
               <option value="all">ทุกรอบบิลทั้งหมด ({readings.length} รายการ)</option>
               {billingCycles.map(c => (
                 <option key={c} value={c}>รอบบิล {c}</option>
               ))}
             </select>
           </div>

           {/* Rows per page */}
           <div className="md:col-span-2">
             <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
               📄 แสดงต่อหน้า
             </label>
             <select
               value={pageSize}
               onChange={e => setPageSize(Number(e.target.value))}
               className="w-full bg-background border border-border text-foreground rounded-2xl px-3 py-2.5 text-xs text-foreground font-bold outline-none focus:ring-2 focus:ring-blue-500/30 cursor-pointer"
             >
               <option value={10}>10 รายการ</option>
               <option value={20}>20 รายการ</option>
               <option value={50}>50 รายการ</option>
               <option value={100}>100 รายการ</option>
               <option value={0}>ทั้งหมด</option>
             </select>
           </div>

         </div>

         {/* Second Filter Row: Meter Type Tabs & Filter Status */}
         <div className="mt-4 pt-4 border-t border-purple-500/20 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
           <div className="flex items-center gap-2">
             <span className="text-[11px] font-bold text-muted-foreground uppercase mr-1">ประเภทมิเตอร์:</span>
             <span className="px-3 py-1.5 rounded-xl text-xs font-black bg-amber-500 text-slate-950 shadow-sm">
               ⚡ ไฟฟ้า (หน่วยละ 7 บาท)
             </span>
             <span className="text-xs text-muted-foreground pl-2 font-medium">
               (💧 ค่าน้ำเหมาจ่าย 100 บาท/เดือน ไม่ต้องจดมิเตอร์)
             </span>
           </div>

           <div className="flex items-center gap-3">
             {isFiltering && (
               <button
                 onClick={clearAllFilters}
                 className="text-xs text-rose-400 hover:text-rose-300 font-bold flex items-center gap-1 transition-colors cursor-pointer"
               >
                 ✕ ล้างตัวกรองทั้งหมด
               </button>
             )}
             <span className="text-xs font-bold text-muted-foreground">
               พบ <strong className="text-foreground">{filteredReadings.length}</strong> รายการ
               {pageSize > 0 && ` (หน้า ${currentPage}/${totalPages})`}
             </span>
           </div>
         </div>
       </div>

       {/* Floating / Sticky Multi-Selection Action Bar */}
       {selectedRoomIds.length > 0 && (
         <div className="mb-6 p-4 bg-gradient-to-r from-blue-900/90 to-indigo-900/90 border-2 border-blue-500/50 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in slide-in-from-top-4 duration-200">
           <div className="flex items-center gap-3">
             <div className="h-9 w-9 rounded-xl bg-blue-500 flex items-center justify-center font-black text-white text-sm shadow-md">
               {selectedRoomIds.length}
             </div>
             <div>
               <div className="text-sm font-black text-foreground">
                 เลือกอยู่ {selectedRoomIds.length} ห้อง
               </div>
               <div className="text-xs text-blue-200/70 font-medium">
                 พร้อมดำเนินการจดมิเตอร์หรือออกบิลแจ้งหนี้เฉพาะห้องที่เลือก
               </div>
             </div>
           </div>

           <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
             <button
               onClick={() => handleOpenBatchModal(true)}
               className="flex-1 sm:flex-initial bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-500/20 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
             >
               <span>⚡</span> จดมิเตอร์รอบใหม่ ({selectedRoomIds.length} ห้อง)
             </button>

             <button
               onClick={() => router.push('/owner/billing')}
               className="flex-1 sm:flex-initial bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-4 py-2.5 rounded-xl shadow-lg shadow-blue-600/20 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
             >
               <span>📄</span> ออกบิลห้องที่เลือก
             </button>

             <button
               onClick={() => setSelectedRoomIds([])}
               className="px-3 py-2.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary transition-all cursor-pointer"
             >
               ✕ ยกเลิก
             </button>
           </div>
         </div>
       )}

       {/* Main Table Container */}
       <div className="bg-card rounded-3xl border border-border shadow-xl overflow-hidden backdrop-blur-xl mb-6">
         {loading ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin"></div>
              <p className="text-sm font-medium text-muted-foreground">กำลังโหลดข้อมูลมิเตอร์...</p>
            </div>
         ) : paginatedReadings.length === 0 ? (
            <div className="p-20 text-center flex flex-col items-center gap-4">
              <div className="text-4xl text-muted-foreground/50">⚡</div>
              <p className="text-sm font-medium text-muted-foreground">
                {isFiltering ? 'ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา' : 'ยังไม่มีข้อมูลการจดมิเตอร์ในรอบบิลนี้'}
              </p>
              {isFiltering ? (
                <button
                  onClick={clearAllFilters}
                  className="mt-2 bg-secondary hover:bg-secondary/80 text-foreground border border-border text-xs font-bold px-4 py-2 rounded-xl transition-all cursor-pointer"
                >
                  ล้างตัวกรองเพื่อดูข้อมูลทั้งหมด
                </button>
              ) : (
                <button 
                  onClick={() => handleOpenNewMonthSingle()}
                  className="mt-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-xl cursor-pointer"
                >
                  เริ่มจดมิเตอร์ห้องแรก
                </button>
              )}
            </div>
         ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border text-muted-foreground text-xs uppercase tracking-wider bg-secondary/50">
                    <th className="py-4 px-6">ห้อง</th>
                    <th className="py-4 px-6">ประเภท</th>
                    <th className="py-4 px-6">รอบบิล</th>
                    <th className="py-4 px-6 text-right">เลขครั้งก่อน</th>
                    <th className="py-4 px-6 text-right">เลขครั้งนี้</th>
                    <th className="py-4 px-6 text-right">หน่วยที่ใช้</th>
                    <th className="py-4 px-6 text-center">หลักฐานภาพถ่าย</th>
                    {/* Checkbox Column Header at the end */}
                    <th className="py-4 px-6 text-center w-24">
                      <div className="flex flex-col items-center gap-1">
                        <label className="text-[10px] font-bold text-muted-foreground cursor-pointer">เลือก</label>
                        <input
                          type="checkbox"
                          checked={isAllCurrentPageSelected}
                          onChange={toggleSelectAllCurrentPage}
                          title="เลือก/ยกเลิกทั้งหมดในหน้านี้"
                          className="w-4 h-4 rounded accent-blue-600 cursor-pointer"
                        />
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-sm">
                  {paginatedReadings.map((r: any) => {
                    const units = Number(r.current_reading) - Number(r.previous_reading);
                    const isSelected = selectedRoomIds.includes(r.room_id);

                    return (
                      <tr 
                        key={r.id} 
                        className={`transition-colors group cursor-pointer ${
                          isSelected ? 'bg-blue-600/10 hover:bg-blue-600/20' : 'hover:bg-white/5'
                        }`}
                        onClick={() => toggleRoomSelection(r.room_id)}
                      >
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-2">
                            <span className={`h-8 w-10 border rounded-lg flex items-center justify-center font-black text-xs transition-colors ${
                              isSelected 
                                ? 'bg-blue-600 text-white border-blue-400' 
                                : 'bg-secondary border-border text-foreground group-hover:border-primary/40'
                            }`}>
                              {r.room_number}
                            </span>
                            <span className="font-bold text-foreground group-hover:text-primary transition-colors">ห้อง {r.room_number}</span>
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold inline-flex items-center gap-1 ${
                            r.type === 'Water' 
                              ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                              : 'bg-orange-500/20 text-orange-300 border border-orange-500/30'
                          }`}>
                            {r.type === 'Water' ? '💧 น้ำประปา' : '⚡ ไฟฟ้า'}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-muted-foreground font-medium">{r.billing_cycle}</td>
                        <td className="py-4 px-6 text-right font-mono text-muted-foreground font-semibold">{Number(r.previous_reading).toFixed(2)}</td>
                        <td className="py-4 px-6 text-right font-mono text-emerald-400 font-black text-base">{Number(r.current_reading).toFixed(2)}</td>
                        <td className="py-4 px-6 text-right font-mono font-black text-foreground">
                          <span className="px-2.5 py-0.5 rounded-lg bg-secondary text-foreground font-bold border border-border">
                            {units >= 0 ? units : 0}
                          </span>
                        </td>

                        {/* Photo Evidence Column */}
                        <td className="py-4 px-6 text-center" onClick={e => e.stopPropagation()}>
                          {r.photo_url ? (
                            <button
                              type="button"
                              onClick={() => setViewingPhoto({
                                url: r.photo_url,
                                roomNumber: r.room_number,
                                type: r.type,
                                cycle: r.billing_cycle,
                                reading: r.current_reading,
                                prevReading: r.previous_reading,
                                createdAt: r.created_at,
                              })}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-200 hover:text-white transition-all cursor-pointer shadow-sm active:scale-95 group"
                              title="คลิกเพื่อดูภาพหลักฐานหน้าปัดมิเตอร์"
                            >
                              <span className="w-6 h-6 rounded-lg overflow-hidden bg-black/50 border border-purple-400/40 flex items-center justify-center shrink-0">
                                <img src={r.photo_url} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                              </span>
                              <span className="text-xs font-bold font-mono">📷 ดูรูป</span>
                            </button>
                          ) : (
                            <span className="text-[11px] text-muted-foreground/50 italic font-medium">ไม่มีรูป</span>
                          )}
                        </td>
                        
                        {/* Checkbox at the end of each row */}
                        <td className="py-4 px-6 text-center" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRoomSelection(r.room_id)}
                              className="w-5 h-5 rounded-lg accent-blue-600 cursor-pointer shadow-sm"
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
         )}

         {/* Pagination Controls Section */}
         {pageSize > 0 && totalPages > 1 && (
           <div className="px-6 py-4 bg-card border-t border-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
             <div className="text-xs text-muted-foreground font-medium">
               แสดงรายการที่ <strong className="text-foreground font-bold">{(currentPage - 1) * pageSize + 1}</strong> ถึง{' '}
               <strong className="text-foreground font-bold">{Math.min(currentPage * pageSize, filteredReadings.length)}</strong> จากทั้งหมด{' '}
               <strong className="text-foreground font-bold">{filteredReadings.length}</strong> รายการ
             </div>
             
             <div className="flex items-center gap-1">
               <button
                 onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                 disabled={currentPage === 1}
                 className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
               >
                 ‹ ก่อนหน้า
               </button>
               
               {Array.from({ length: totalPages }, (_, i) => i + 1)
                 .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2)
                 .map((pageNum, idx, arr) => {
                   const prev = arr[idx - 1];
                   return (
                     <div key={pageNum} className="flex items-center">
                       {prev && pageNum - prev > 1 && (
                         <span className="px-1 text-muted-foreground/50 text-xs font-bold">...</span>
                       )}
                       <button
                         onClick={() => setCurrentPage(pageNum)}
                         className={`h-8 w-8 rounded-xl text-xs font-black transition-all cursor-pointer ${
                           currentPage === pageNum
                             ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                             : 'border border-border text-muted-foreground hover:bg-secondary hover:text-foreground'
                         }`}
                       >
                         {pageNum}
                       </button>
                     </div>
                   );
                 })}

               <button
                 onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                 disabled={currentPage === totalPages}
                 className="px-3 py-1.5 rounded-xl border border-border text-xs font-bold text-muted-foreground hover:text-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
               >
                 ถัดไป ›
               </button>
             </div>
           </div>
         )}

         {/* Prominent Bottom Action Bar Under Table */}
         <div className="p-6 bg-secondary/30 border-t border-purple-500/20 flex flex-col sm:flex-row items-center justify-between gap-4">
           <div className="flex items-center gap-3 text-xs text-muted-foreground">
             <span className="h-3 w-3 rounded-full bg-emerald-500 animate-ping"></span>
             <span>สิ้นสุดตารางข้อมูลมิเตอร์ • พร้อมบันทึกรอบเดือนใหม่ถัดไป: <strong>{getNextMonthCycle(latestCycle)}</strong></span>
           </div>
           <div className="flex flex-wrap gap-3 w-full sm:w-auto">
             <button
               onClick={() => handleOpenNewMonthSingle()}
               className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white text-xs font-black px-5 py-3 rounded-xl shadow-lg shadow-purple-600/25 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer border border-blue-400/30"
             >
               <span className="text-base">➕</span> จดมิเตอร์เดือนใหม่ ({getNextMonthCycle(latestCycle)})
             </button>
             <button
               onClick={() => handleOpenBatchModal(false)}
               className="flex-1 sm:flex-initial bg-gradient-to-r from-purple-600 via-purple-500 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-white text-xs font-black px-5 py-3 rounded-xl shadow-lg shadow-purple-600/25 transition-all transform hover:scale-105 active:scale-95 flex items-center justify-center gap-2 cursor-pointer border border-emerald-400/30"
             >
               <span className="text-base">⚡</span> จดมิเตอร์ด่วนทุกห้อง ({getNextMonthCycle(latestCycle)})
             </button>
           </div>
         </div>
       </div>

        {/* Modal: Single Meter Entry */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
            <div className="bg-card rounded-3xl p-5 sm:p-7 max-w-md w-full shadow-2xl border border-purple-500/25 relative z-10 animate-in fade-in zoom-in duration-200 max-h-[92vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-5 pb-3 border-b border-purple-500/20">
                <div>
                  <h2 className="text-lg font-display font-black text-foreground">บันทึกมิเตอร์รอบเดือนใหม่</h2>
                  <p className="text-xs text-purple-300/70 mt-0.5">ระบุเลขมิเตอร์ห้องพักรายบุคคล</p>
                </div>
                <button onClick={() => setShowModal(false)} className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1">
                  ✕
                </button>
              </div>

              <form onSubmit={handleSubmitSingle} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-purple-300/80 mb-1.5">เลือกรอบบิล (YYYY-MM)</label>
                  <input 
                    type="month" 
                    required 
                    value={form.billing_cycle} 
                    onChange={e => setForm({...form, billing_cycle: e.target.value})} 
                    className="w-full bg-background border border-border text-foreground rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500" 
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-purple-300/80 mb-1.5">ห้องพัก</label>
                  <select 
                    required 
                    value={form.room_id} 
                    onChange={e => handleRoomSelectChange(e.target.value)} 
                    className="w-full bg-background border border-border text-foreground rounded-xl px-4 py-2.5 text-sm font-bold outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">-- เลือกห้องพัก --</option>
                    {rooms.map((room: any) => (
                      <option key={room.id} value={room.id}>ห้อง {room.room_number}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-purple-300/80 mb-1.5">ประเภทมิเตอร์</label>
                  <div className="p-3 bg-secondary/40 rounded-xl border border-border flex items-center justify-between">
                    <span className="text-xs font-black text-amber-500">⚡ มิเตอร์ไฟฟ้า (หน่วยละ 7 บาท)</span>
                    <span className="text-[11px] text-muted-foreground">💧 ค่าน้ำ 100฿ (เหมาจ่าย)</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-purple-300/80 mb-1.5">เลขครั้งก่อน</label>
                    <input 
                      type="number" 
                      step="any" 
                      value={form.previous_reading} 
                      onChange={e => setForm({...form, previous_reading: e.target.value})} 
                      className="w-full bg-background border border-border text-foreground rounded-xl px-3 py-2 text-sm text-foreground font-mono outline-none" 
                      placeholder="0" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-purple-300/80 mb-1.5">เลขครั้งนี้ (ใหม่)</label>
                    <input 
                      type="number" 
                      step="any" 
                      required 
                      value={form.current_reading} 
                      onChange={e => setForm({...form, current_reading: e.target.value})} 
                      className="w-full bg-background border-2 border-amber-500/70 dark:border-amber-400/50 rounded-xl px-3 py-2 text-base text-amber-600 dark:text-amber-300 font-mono font-black outline-none focus:ring-2 focus:ring-amber-500 shadow-inner" 
                      placeholder="0.00"
                    />
                  </div>
                </div>

                {form.current_reading && form.previous_reading && (
                  <div className="bg-secondary/40 p-3 rounded-xl flex items-center justify-between text-xs border border-purple-500/20">
                    <span className="text-purple-300/80">ใช้ไปในรอบนี้:</span>
                    <span className="font-mono font-black text-emerald-400 text-sm">
                      {Math.max(0, Number(form.current_reading) - Number(form.previous_reading)).toFixed(2)} ยูนิต
                    </span>
                  </div>
                )}

                {/* Evidence Photo / Camera Action in Single Modal */}
                <div className="pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-purple-300/80">หลักฐานภาพถ่าย</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (!form.room_id) {
                          alert('กรุณาเลือกห้องพักก่อน');
                          return;
                        }
                        const curRoom = rooms.find(r => String(r.id) === String(form.room_id));
                        setCameraModal({
                          isOpen: true,
                          roomNumber: curRoom?.room_number || '',
                          roomId: Number(form.room_id),
                          meterType: form.type,
                          previousReading: parseFloat(form.previous_reading) || 0,
                        });
                      }}
                      className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                    >
                      <span>📸 กล้อง / 🖼️ อัพรูป AI</span>
                    </button>
                  </div>

                  {form.photo_url ? (
                    <div className="mt-2 p-2 rounded-xl bg-background border border-border text-foreground flex items-center justify-between gap-2">
                      <div 
                        className="flex items-center gap-2 cursor-pointer group"
                        onClick={() => {
                          const curRoom = rooms.find(r => String(r.id) === String(form.room_id));
                          setViewingPhoto({
                            url: form.photo_url,
                            roomNumber: curRoom?.room_number || '',
                            type: form.type,
                            cycle: form.billing_cycle,
                            reading: form.current_reading || '0',
                            prevReading: form.previous_reading || '0',
                          });
                        }}
                      >
                        <div className="w-10 h-10 rounded-lg overflow-hidden border border-purple-400/40 shrink-0">
                          <img src={form.photo_url} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-emerald-400 block">✓ บันทึกภาพแล้ว</span>
                          <span className="text-[10px] text-purple-300/60 font-mono">คลิกเพื่อดูภาพขยาย</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => setForm(prev => ({ ...prev, photo_url: '' }))}
                        className="text-xs text-rose-400 hover:text-rose-300 px-2 py-1 rounded-lg bg-rose-500/10 border border-rose-500/20 cursor-pointer"
                      >
                        ✕ ลบรูป
                      </button>
                    </div>
                  ) : (
                    <p className="text-[10px] text-purple-300/50 mt-1 italic">
                      * สามารถกดถ่ายภาพหน้าปัดมิเตอร์เพื่อเก็บเป็นหลักฐานยืนยันกับผู้เช่าได้
                    </p>
                  )}
                </div>

                <div className="flex gap-2.5 pt-3">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)} 
                    className="flex-1 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-xs font-bold text-foreground cursor-pointer border border-border"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit" 
                    disabled={submitting} 
                    className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 disabled:opacity-50 transition-all font-bold text-xs text-white shadow-lg shadow-purple-600/20 cursor-pointer"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกมิเตอร์'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Batch Quick Entry Sheet (Clean, Responsive, Mobile Cards) */}
        {showBatchModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
            <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" onClick={() => setShowBatchModal(false)}></div>
            <div className="bg-card sm:rounded-3xl p-4 sm:p-6 w-full max-w-4xl h-[100dvh] sm:h-auto sm:max-h-[90vh] flex flex-col shadow-2xl border border-purple-500/25 relative z-10 animate-in fade-in zoom-in duration-200">
              
              {/* Header */}
              <div className="flex justify-between items-center mb-4 pb-3 border-b border-purple-500/20 shrink-0">
                <div>
                  <div className="flex items-center gap-2 sm:gap-3">
                    <h2 className="text-base sm:text-lg font-display font-black text-foreground">
                      ⚡ จดมิเตอร์ด่วน {selectedRoomIds.length > 0 ? `(${batchItems.length} ห้องที่เลือก)` : `(ทั้งหมด ${batchItems.length} ห้อง)`}
                    </h2>
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-black bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      รอบบิล {batchCycle}
                    </span>
                  </div>
                  <p className="text-[11px] text-purple-300/70 mt-0.5">กรอกเลขมิเตอร์ครั้งนี้ของแต่ละห้อง หรือกดปุ่ม 📸 เพื่อถ่ายภาพให้ AI อ่าน</p>
                </div>
                <button onClick={() => setShowBatchModal(false)} className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer border border-border">
                  ✕
                </button>
              </div>

              {/* Cycle Selector Bar */}
              <div className="mb-3 flex items-center gap-2 shrink-0">
                <label className="text-xs font-bold text-purple-300/80">เลือกรอบบิล:</label>
                <input 
                  type="month" 
                  value={batchCycle} 
                  onChange={e => setBatchCycle(e.target.value)} 
                  className="bg-background border border-border text-foreground rounded-xl px-3 py-1.5 text-xs font-bold outline-none focus:border-amber-400"
                />
              </div>

              {/* Sheet Container: Cards on Mobile, Table on Desktop */}
              <div className="flex-1 min-h-0 overflow-y-auto rounded-2xl border border-purple-500/20">
                
                {/* Mobile Responsive Cards (md:hidden) */}
                <div className="md:hidden divide-y divide-purple-500/15 p-2 space-y-2.5">
                  {batchItems.map((item, idx) => (
                    <div key={item.room_id} className="p-3 rounded-2xl bg-background border border-border text-foreground space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-foreground text-sm sm:text-base">ห้อง {item.room_number}</span>
                        <span className="text-[10px] text-purple-300/60 font-mono">ห้องพัก</span>
                      </div>

                      <div>
                        {/* Electricity Input Box */}
                        <div className="p-3 rounded-xl bg-card border border-border space-y-1">
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-bold text-amber-400">⚡ ไฟ</span>
                            <span className="text-amber-300/60 font-mono">เดิม {item.elec_prev.toFixed(1)}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <input 
                              type="number" 
                              step="any" 
                              placeholder={`${item.elec_prev}`} 
                              value={item.elec_curr}
                              onChange={e => {
                                const val = e.target.value;
                                setBatchItems(prev => {
                                  const copy = [...prev];
                                  copy[idx].elec_curr = val;
                                  return copy;
                                });
                              }}
                              className="w-full bg-secondary/40 border border-amber-500/40 rounded-lg px-2 py-1 text-center font-mono font-bold text-amber-300 text-xs outline-none focus:border-amber-400"
                            />
                            {item.elec_photo && (
                              <button
                                type="button"
                                title="ดูภาพถ่ายมิเตอร์ไฟ"
                                onClick={() => setViewingPhoto({
                                  url: item.elec_photo!,
                                  roomNumber: item.room_number,
                                  type: 'Electricity',
                                  cycle: batchCycle,
                                  reading: item.elec_curr || item.elec_prev,
                                  prevReading: item.elec_prev
                                })}
                                className="w-6 h-6 rounded-md overflow-hidden border border-amber-400/50 shrink-0 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                              >
                                <img src={item.elec_photo} alt="Elec meter" className="w-full h-full object-cover" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="ถ่ายรูปมิเตอร์ไฟ"
                              onClick={() => setCameraModal({
                                isOpen: true,
                                roomNumber: item.room_number,
                                roomId: item.room_id,
                                meterType: 'Electricity',
                                previousReading: item.elec_prev,
                                batchIndex: idx
                              })}
                              className={`p-1.5 rounded-lg border text-xs cursor-pointer shrink-0 transition-all ${
                                item.elec_photo 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                                  : 'bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 border-amber-500/20'
                              }`}
                            >
                              📸
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop Table (hidden md:table) */}
                <table className="hidden md:table w-full text-left border-collapse text-xs">
                  <thead className="bg-secondary/40 sticky top-0 z-10 text-purple-300/80">
                    <tr className="border-b border-purple-500/20">
                      <th className="py-2.5 px-4 font-bold">ห้อง</th>
                      <th className="py-2.5 px-4 text-center font-bold">⚡ เลขไฟก่อนหน้า</th>
                      <th className="py-2.5 px-4 text-center font-bold">⚡ เลขไฟครั้งนี้ (ใหม่)</th>
                      <th className="py-2.5 px-4 text-center font-bold">💧 ค่าน้ำประปา</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-purple-500/10 bg-card">
                    {batchItems.map((item, idx) => (
                      <tr key={item.room_id} className="hover:bg-purple-500/5">
                        <td className="py-2.5 px-4 font-black text-foreground text-sm">
                          ห้อง {item.room_number}
                        </td>
                        <td className="py-2.5 px-4 text-center font-mono text-purple-300/60">
                          {item.elec_prev.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="inline-flex items-center gap-1.5 justify-center">
                            <input 
                              type="number" 
                              step="any" 
                              placeholder={`${item.elec_prev}`} 
                              value={item.elec_curr}
                              onChange={e => {
                                const val = e.target.value;
                                setBatchItems(prev => {
                                  const copy = [...prev];
                                  copy[idx].elec_curr = val;
                                  return copy;
                                });
                              }}
                              className="w-28 bg-background border border-amber-500/40 rounded-lg px-2.5 py-1 text-center font-mono font-bold text-amber-500 dark:text-amber-300 text-xs outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 shadow-inner"
                            />
                            {item.elec_photo && (
                              <button
                                type="button"
                                title="ดูภาพถ่ายมิเตอร์ไฟ"
                                onClick={() => setViewingPhoto({
                                  url: item.elec_photo!,
                                  roomNumber: item.room_number,
                                  type: 'Electricity',
                                  cycle: batchCycle,
                                  reading: item.elec_curr || item.elec_prev,
                                  prevReading: item.elec_prev
                                })}
                                className="w-6 h-6 rounded-md overflow-hidden border border-amber-400/50 shrink-0 cursor-pointer shadow-sm hover:scale-105 transition-transform"
                              >
                                <img src={item.elec_photo} alt="Elec meter" className="w-full h-full object-cover" />
                              </button>
                            )}
                            <button
                              type="button"
                              title="ถ่ายรูป/สแกนมิเตอร์ไฟ"
                              onClick={() => setCameraModal({
                                isOpen: true,
                                roomNumber: item.room_number,
                                roomId: item.room_id,
                                meterType: 'Electricity',
                                previousReading: item.elec_prev,
                                batchIndex: idx
                              })}
                              className={`p-1.5 rounded-lg border transition-all text-xs cursor-pointer ${
                                item.elec_photo 
                                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' 
                                  : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground border border-border'
                              }`}
                            >
                              📸
                            </button>
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            💧 เหมาจ่าย 100฿
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
               </table>
             </div>

             <div className="flex gap-2.5 pt-4 shrink-0">
                <button 
                  type="button" 
                  onClick={() => setShowBatchModal(false)} 
                  className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-xs font-bold text-foreground cursor-pointer border border-border"
                >
                  ยกเลิก
                </button>
                <button 
                  type="button" 
                  onClick={handleSubmitBatch} 
                  disabled={submitting} 
                  className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 disabled:opacity-50 transition-all font-bold text-xs text-white shadow-lg shadow-purple-600/20 cursor-pointer"
                >
                  {submitting ? 'กำลังบันทึกข้อมูล...' : `บันทึกทั้งหมด (${batchItems.length} ห้อง)`}
                </button>
              </div>
            </div>
          </div>
        )}
    
        {/* AI & Camera Meter Reading Modal */}
        {cameraModal && cameraModal.isOpen && (
          <CameraMeterModal
            isOpen={cameraModal.isOpen}
            onClose={() => setCameraModal(null)}
            roomNumber={cameraModal.roomNumber}
            meterType={cameraModal.meterType}
            previousReading={cameraModal.previousReading}
            onConfirmReading={handleCameraConfirm}
          />
        )}

        {/* Photo Evidence Lightbox Modal */}
        {viewingPhoto && (
          <div 
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-6 animate-in fade-in"
            onClick={() => setViewingPhoto(null)}
          >
            <div 
              className="bg-card border border-purple-500/30 rounded-3xl p-5 sm:p-6 max-w-lg w-full shadow-2xl flex flex-col gap-4 relative animate-in zoom-in-95 max-h-[92vh] overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between pb-3 border-b border-purple-500/20 shrink-0">
                <div className="flex items-center gap-2.5">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ${
                    viewingPhoto.type === 'Water'
                      ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                      : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                  }`}>
                    {viewingPhoto.type === 'Water' ? '💧' : '⚡'}
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-foreground">
                      หลักฐานภาพถ่าย{viewingPhoto.type === 'Water' ? 'มิเตอร์น้ำ' : 'มิเตอร์ไฟ'} ห้อง <span className="text-amber-400 font-mono">{viewingPhoto.roomNumber}</span>
                    </h3>
                    <p className="text-[11px] text-purple-300/70 font-mono">
                      รอบบิล: <span className="text-foreground font-bold">{viewingPhoto.cycle}</span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setViewingPhoto(null)}
                  className="w-8 h-8 rounded-xl bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground flex items-center justify-center transition-colors cursor-pointer border border-border"
                >
                  ✕
                </button>
              </div>

              {/* Stats Bar */}
              <div className="grid grid-cols-3 gap-2 bg-secondary/40 p-3 rounded-2xl border border-purple-500/20 text-center shrink-0">
                <div>
                  <span className="text-[9px] text-purple-300/70 block uppercase font-bold">เลขครั้งก่อน</span>
                  <span className="font-mono text-xs sm:text-sm font-bold text-foreground">
                    {Number(viewingPhoto.prevReading).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-purple-300/70 block uppercase font-bold">เลขครั้งนี้</span>
                  <span className="font-mono text-xs sm:text-sm font-black text-amber-400">
                    {Number(viewingPhoto.reading).toFixed(2)}
                  </span>
                </div>
                <div>
                  <span className="text-[9px] text-purple-300/70 block uppercase font-bold">หน่วยที่ใช้</span>
                  <span className="font-mono text-xs sm:text-sm font-black text-emerald-400">
                    +{(Math.max(0, Number(viewingPhoto.reading) - Number(viewingPhoto.prevReading))).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Image View Area */}
              <div className="flex-1 min-h-0 relative bg-black rounded-2xl overflow-hidden border border-purple-500/20 flex items-center justify-center group min-h-[220px]">
                <img
                  src={viewingPhoto.url}
                  alt={`Meter evidence room ${viewingPhoto.roomNumber}`}
                  className="w-full h-full max-h-[50vh] object-contain select-none"
                />
              </div>

              {/* Footer Actions */}
              <div className="flex items-center justify-between gap-2 pt-1 shrink-0">
                <a
                  href={viewingPhoto.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 border border-border text-xs font-bold text-foreground transition-all inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🔗</span>
                  <span>เปิดรูปขนาดเต็ม</span>
                </a>

                <button
                  type="button"
                  onClick={() => setViewingPhoto(null)}
                  className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-amber-500 hover:from-purple-500 hover:to-amber-400 text-xs font-black text-white shadow-md shadow-purple-600/20 cursor-pointer"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Modal: Gemini AI API Key Settings for Meter OCR */}
        {showApiKeyModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="bg-[#120B24] border border-purple-500/30 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl relative my-auto">
              {/* Header */}
              <div className="flex items-center justify-between pb-4 border-b border-purple-500/20">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-purple-600 to-amber-500 flex items-center justify-center text-lg text-white shadow-lg shadow-purple-500/20">
                    🔑
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-black text-white">ตั้งค่า Google Gemini API Key</h3>
                    <p className="text-xs text-purple-300/80">ระบบ AI สแกนอ่านมิเตอร์น้ำ-ไฟอัตโนมัติ</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowApiKeyModal(false)}
                  className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 text-white/60 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Status Badge */}
              <div className="mt-4 p-3.5 rounded-2xl bg-[#1A1033] border border-purple-500/20 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${hasCustomKey ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
                  <span className="text-xs font-bold text-white">
                    {hasCustomKey ? 'ใช้งาน Google Gemini AI (คีย์ส่วนตัว)' : systemFallback ? 'ใช้งาน Gemini AI (ระบบกลาง)' : 'ใช้งาน Tesseract OCR (ออฟไลน์)'}
                  </span>
                </div>
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11px] font-bold text-amber-300 hover:text-amber-200 underline flex items-center gap-1 cursor-pointer"
                >
                  <span>รับคีย์ฟรี</span>
                  <span>↗</span>
                </a>
              </div>

              {/* Body */}
              <div className="mt-4 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-purple-200 mb-1.5">
                    Google AI Studio API Key:
                  </label>
                  <div className="relative">
                    <input
                      type={showKeySecret ? 'text' : 'password'}
                      value={apiKeyInput}
                      onChange={(e) => {
                        setApiKeyInput(e.target.value);
                        setKeyTestStatus(null);
                      }}
                      placeholder="เช่น AIzaSyD..."
                      className="w-full bg-[#0B0617] border border-purple-500/30 focus:border-amber-400 focus:ring-1 focus:ring-amber-400 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-muted-foreground font-mono outline-none pr-20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeySecret(!showKeySecret)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] text-purple-300 hover:text-white px-2 py-1 rounded bg-white/5 cursor-pointer"
                    >
                      {showKeySecret ? 'ซ่อน' : 'แสดง'}
                    </button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                    💡 เจ้าของหอสามารถขอ Gemini API Key ได้ฟรีจาก Google AI Studio เพื่อใช้สแกนมิเตอร์ได้รวดเร็วและแม่นยำสูง หากไม่กรอก ระบบจะใช้ระบบตรวจจับตัวเลขออฟไลน์ในเครื่องให้อัตโนมัติ
                  </p>
                </div>

                {/* Feedback message */}
                {keyTestStatus && (
                  <div className={`p-3 rounded-xl text-xs font-bold border ${
                    keyTestStatus.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : 'bg-rose-500/10 border-rose-500/30 text-rose-300'
                  }`}>
                    {keyTestStatus.message}
                  </div>
                )}

                {/* Guide Box */}
                <div className="p-3.5 rounded-2xl bg-purple-950/30 border border-purple-500/20 text-xs text-purple-200/90 space-y-1.5">
                  <div className="font-bold text-amber-300 flex items-center gap-1.5">
                    <span>📌</span> วิธีรับ API Key ฟรีใน 1 นาที:
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-[11px] text-purple-300/80">
                    <li>ไปที่ <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="text-amber-300 underline font-bold">aistudio.google.com/app/apikey</a></li>
                    <li>ล็อกอินด้วยบัญชี Google ของท่าน</li>
                    <li>กดปุ่ม <strong>"Create API key"</strong></li>
                    <li>คัดลอกคีย์มาวางในช่องด้านบน แล้วกดบันทึก</li>
                  </ol>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-purple-500/20">
                <div>
                  {hasCustomKey && (
                    <button
                      type="button"
                      onClick={() => handleSaveKey('')}
                      disabled={savingKey}
                      className="text-xs text-rose-400 hover:text-rose-300 px-3 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
                    >
                      ลบคีย์ออก
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleTestKey}
                    disabled={testingKey || !apiKeyInput.trim()}
                    className="px-4 py-2.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white border border-purple-500/40 text-xs font-bold transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {testingKey ? <span className="animate-spin">⏳</span> : <span>🧪</span>}
                    <span>{testingKey ? 'กำลังทดสอบ...' : 'ทดสอบคีย์'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSaveKey()}
                    disabled={savingKey}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 text-xs font-black shadow-lg shadow-amber-500/20 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-1.5"
                  >
                    {savingKey ? <span className="animate-spin">⏳</span> : <span>💾</span>}
                    <span>{savingKey ? 'กำลังบันทึก...' : 'บันทึกการตั้งค่า'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
  );
}
