'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface RoomMeterSummary {
  room_id: number;
  room_number: string;
  floor: number;
  room_type: string;
  room_status: string;
  latest_cycle: string;
  latest_reading: number | null;
  previous_reading: number | null;
  units_used: number | null;
  photo_url: string | null;
  created_at: string | null;
}

export default function MetersOverviewPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [rooms, setRooms] = useState<RoomMeterSummary[]>([]);
  const [loading, setLoading] = useState(true);

  // Search, Filter, Pagination state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [pageSize, setPageSize] = useState<number>(10);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const fetchSummary = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/owner/meters/summary');
      const data = await res.json();
      if (data.success) {
        setRooms(data.data || []);
      }
    } catch (e) {
      console.error('Fetch meters error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/meters');
      return;
    }
    fetchSummary();
  }, [authStatus, router]);

  // Filtered rooms
  const filteredRooms = useMemo(() => {
    return rooms.filter((r) => {
      // Status filter
      if (statusFilter !== 'ALL') {
        if (statusFilter === 'Occupied' && r.room_status !== 'Occupied') return false;
        if (statusFilter === 'Reserved' && r.room_status !== 'Reserved') return false;
        if (statusFilter === 'Available' && r.room_status !== 'Available' && r.room_status !== 'ว่าง') return false;
        if (statusFilter === 'HasReading' && (r.latest_reading === null || r.latest_reading === undefined)) return false;
        if (statusFilter === 'NoReading' && r.latest_reading !== null && r.latest_reading !== undefined) return false;
      }

      // Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const numMatch = (r.room_number || '').toLowerCase().includes(q);
        const cycleMatch = (r.latest_cycle || '').toLowerCase().includes(q);
        const readingMatch = r.latest_reading !== null && String(r.latest_reading).includes(q);
        if (!numMatch && !cycleMatch && !readingMatch) return false;
      }

      return true;
    });
  }, [rooms, searchQuery, statusFilter]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, pageSize]);

  // Pagination calculation
  const totalItems = filteredRooms.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const paginatedRooms = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredRooms.slice(startIndex, startIndex + pageSize);
  }, [filteredRooms, currentPage, pageSize]);

  const occupiedCount = rooms.filter((r) => r.room_status === 'Occupied').length;
  const availableCount = rooms.filter((r) => r.room_status === 'Available' || r.room_status === 'ว่าง').length;
  const recordedCount = rooms.filter((r) => r.latest_reading !== null).length;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-10 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">⚡</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">ระบบจดมิเตอร์ไฟฟ้า (ห้องพักทั้งหมด)</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
                อัตราค่าไฟฟ้า 4.88 บาท/หน่วย • ค่าน้ำเหมาจ่าย 100 บาท/เดือน • ส่วนกลาง 150 บาท/เดือน
              </p>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="flex items-center gap-3">
          <Link
            href="/owner/meters/record"
            className="px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs sm:text-sm rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <span>📸</span>
            <span>จดมิเตอร์รอบใหม่</span>
          </Link>
        </div>
      </div>

      {/* Stats Badges */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">ห้องทั้งหมด</span>
          <span className="text-xl font-black text-white">{rooms.length} ห้อง</span>
        </div>
        <div className="bg-slate-900/80 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 block">มีผู้พักอาศัย</span>
          <span className="text-xl font-black text-emerald-400">{occupiedCount} ห้อง</span>
        </div>
        <div className="bg-slate-900/80 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block">ห้องว่าง</span>
          <span className="text-xl font-black text-slate-300">{availableCount} ห้อง</span>
        </div>
        <div className="bg-slate-900/80 border border-white/5 p-4 rounded-2xl">
          <span className="text-[10px] font-black uppercase tracking-wider text-primary block">บันทึกมิเตอร์แล้ว</span>
          <span className="text-xl font-black text-primary">{recordedCount} / {rooms.length}</span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/90 border border-white/10 rounded-2xl p-4 sm:p-5 flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between shadow-xl">
        
        {/* Left: Filter Tabs */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 md:pb-0">
          {[
            { id: 'ALL', label: 'ทั้งหมด', count: rooms.length },
            { id: 'Occupied', label: 'มีคนอยู่', count: occupiedCount },
            { id: 'Available', label: 'ห้องว่าง', count: availableCount },
            { id: 'HasReading', label: 'มีเลขมิเตอร์', count: recordedCount },
            { id: 'NoReading', label: 'ยังไม่มีเลข', count: rooms.length - recordedCount },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-black transition-all whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === tab.id
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              <span>{tab.label}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-black/30 text-[10px] font-mono">{tab.count}</span>
            </button>
          ))}
        </div>

        {/* Right: Search + Page Size Selector */}
        <div className="flex items-center gap-3">
          {/* Search Box */}
          <div className="relative flex-1 sm:w-60">
            <span className="absolute left-3 top-2.5 text-xs text-slate-500">🔍</span>
            <input
              type="text"
              placeholder="ค้นหาเลขห้อง, รอบบิล..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-950 border border-white/10 rounded-xl pl-8 pr-8 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 text-xs text-slate-400 hover:text-white"
              >
                ✕
              </button>
            )}
          </div>

          {/* Page Size Selector */}
          <div className="flex items-center gap-2 text-xs text-slate-400 whitespace-nowrap">
            <span className="hidden sm:inline">แสดง:</span>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-slate-950 border border-white/10 text-white font-bold rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value={5}>5 ห้อง / หน้า</option>
              <option value={10}>10 ห้อง / หน้า</option>
              <option value={15}>15 ห้อง / หน้า</option>
              <option value={20}>20 ห้อง / หน้า</option>
            </select>
          </div>
        </div>
      </div>

      {/* Meter Table Container with Scroll Support */}
      <div className="bg-slate-900/80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดข้อมูลมิเตอร์ห้องพัก...</div>
        ) : filteredRooms.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-base text-white">ไม่พบรายการห้องพักตามเงื่อนไขที่ค้นหา</p>
            <p className="text-xs text-slate-500">ลองล้างคำค้นหาหรือเปลี่ยนตัวกรองสถานะ</p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-950/90 border-b border-white/10 sticky top-0 z-10 backdrop-blur-md">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">ห้อง</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">สถานะห้อง</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">รอบบิลล่าสุด</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">เลขมิเตอร์ล่าสุด</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">การดำเนินการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {paginatedRooms.map((room) => (
                  <tr key={room.room_id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-black text-white text-base font-mono">
                      ห้อง {room.room_number}
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        room.room_status === 'Occupied' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        room.room_status === 'Reserved' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400 border border-white/5'
                      }`}>
                        {room.room_status === 'Occupied' ? '🟢 มีคนอยู่' :
                         room.room_status === 'Reserved' ? '🟡 ติดจอง' : '⚪ ห้องว่าง'}
                      </span>
                    </td>

                    <td className="px-6 py-4 text-xs font-mono text-slate-300">
                      {room.latest_cycle && room.latest_cycle !== '-' ? (
                        room.latest_cycle
                      ) : (
                        <span className="text-slate-500 italic">ยังไม่มีข้อมูล</span>
                      )}
                    </td>

                    <td className="px-6 py-4 font-mono font-black text-sm text-primary">
                      {room.latest_reading !== null && room.latest_reading !== undefined ? (
                        <span>{Number(room.latest_reading).toLocaleString()}</span>
                      ) : (
                        <span className="text-slate-500 italic font-normal text-xs">-</span>
                      )}
                    </td>

                    {/* Details Button */}
                    <td className="px-6 py-4 text-right">
                      <Link
                        href={`/owner/meters/${room.room_id}`}
                        className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-colors inline-flex items-center gap-1.5 hover:scale-105 active:scale-95"
                      >
                        <span>🔍</span>
                        <span>รายละเอียด</span>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Table Footer with Pagination Controls */}
        {!loading && filteredRooms.length > 0 && (
          <div className="bg-slate-950/80 border-t border-white/10 p-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="text-xs text-slate-400">
              แสดง <strong>{((currentPage - 1) * pageSize) + 1}</strong> – <strong>{Math.min(currentPage * pageSize, totalItems)}</strong> จากทั้งหมด <strong>{totalItems}</strong> ห้อง
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl border border-white/10 transition-all"
              >
                ← ก่อนหน้า
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  onClick={() => setCurrentPage(p)}
                  className={`w-8 h-8 rounded-xl font-bold text-xs transition-all ${
                    currentPage === p
                      ? 'bg-primary text-white shadow-md'
                      : 'bg-slate-900 hover:bg-slate-800 text-slate-400 border border-white/5'
                  }`}
                >
                  {p}
                </button>
              ))}

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-xs rounded-xl border border-white/10 transition-all"
              >
                ถัดไป →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

