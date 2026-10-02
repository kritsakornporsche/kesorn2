'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import Image from 'next/image';

interface HistoryItem {
  id: number;
  billing_cycle: string;
  previous_reading: number;
  current_reading: number;
  units_used: number;
  photo_url: string | null;
  created_at: string;
  bill_status: string;
  bill_id?: number | null;
}

interface RoomInfo {
  id: number;
  room_number: string;
  room_type: string;
  floor: number;
  price: number;
  status: string;
}

export default function RoomMeterHistoryPage() {
  const params = useParams();
  const roomId = params?.id as string;
  const router = useRouter();
  const { data: session, status: authStatus } = useSession();

  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);

  const fetchHistory = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/owner/meters/summary?roomId=${roomId}`);
      const data = await res.json();
      if (data.success) {
        setRoom(data.room);
        setHistory(data.history || []);
      }
    } catch (e) {
      console.error('Fetch history error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/meters');
      return;
    }
    if (roomId) fetchHistory();
  }, [roomId, authStatus, router]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-10 space-y-8">
      {/* Top Navigation & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div className="flex items-center gap-4">
          <Link
            href="/owner/meters"
            className="w-10 h-10 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white flex items-center justify-center font-bold transition-all"
          >
            ←
          </Link>
          <div>
            <div className="flex items-center gap-2 text-xs text-primary font-bold">
              <span>ประวัติมิเตอร์ไฟฟ้า</span>
              <span>•</span>
              <span>หอพักเกษร 2</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              ห้องพักหมายเลข {room?.room_number || roomId}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchHistory}
            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-colors flex items-center gap-1.5"
          >
            <span>🔄</span>
            <span>รีเฟรช</span>
          </button>
        </div>
      </div>

      {/* Room Quick Specs */}
      {room && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ประเภทห้อง</span>
            <p className="text-sm font-bold text-white">{room.room_type || 'มาตรฐาน'}</p>
          </div>
          <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ชั้น</span>
            <p className="text-sm font-bold text-white">ชั้น {room.floor || 1}</p>
          </div>
          <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">ค่าเช่ารายเดือน</span>
            <p className="text-sm font-bold text-emerald-400 font-mono">฿{Number(room.price || 3400).toLocaleString()}</p>
          </div>
          <div className="p-4 bg-slate-900/80 rounded-2xl border border-white/10 space-y-0.5">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">สถานะปัจจุบัน</span>
            <p className="text-sm font-bold text-primary">{room.status === 'Occupied' ? 'มีผู้พักอาศัย' : room.status}</p>
          </div>
        </div>
      )}

      {/* 13.1 History Table (ว/ด/ป, เลขก่อน, เลขหลัง, หน่วยที่ใช้, รูปถ่าย) */}
      <div className="bg-slate-900/80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        <div className="p-5 border-b border-white/10 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider text-white flex items-center gap-2">
            <span>📜</span>
            <span>ตารางประวัติการจดมิเตอร์ย้อนหลัง</span>
          </h3>
          <span className="text-xs text-slate-400 font-mono">ทั้งหมด {history.length} รอบบันทึก</span>
        </div>

        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดประวัติมิเตอร์...</div>
        ) : history.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold space-y-2">
            <span className="text-4xl block">📭</span>
            <p className="text-white">ยังไม่มีประวัติการจดมิเตอร์สำหรับห้องนี้</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[750px]">
              <thead className="bg-slate-950/60 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">รอบบิล (ว/ด/ป)</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">วันที่จดบันทึก</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">เลขก่อนหน้า</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">เลขครั้งนี้</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 font-mono">หน่วยที่ใช้</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">รูปถ่ายหลักฐาน</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">สถานะบิล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {history.map((item) => (
                  <tr key={item.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-black text-white text-xs font-mono">
                      {item.billing_cycle}
                    </td>

                    <td className="px-6 py-4 text-xs text-slate-400">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString('th-TH', {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : '-'}
                    </td>

                    <td className="px-6 py-4 text-xs font-mono text-slate-300">
                      {Number(item.previous_reading).toLocaleString()}
                    </td>

                    <td className="px-6 py-4 text-xs font-mono font-bold text-primary">
                      {Number(item.current_reading).toLocaleString()}
                    </td>

                    <td className="px-6 py-4 font-mono font-black text-xs text-emerald-400">
                      {Number(item.units_used || 0).toLocaleString()} หน่วย
                    </td>

                    {/* Photo Evidence Column */}
                    <td className="px-6 py-4">
                      {item.photo_url ? (
                        <button
                          onClick={() => setSelectedPhoto(item.photo_url)}
                          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-bold transition-all flex items-center gap-1.5"
                        >
                          <span>🖼️</span>
                          <span>ดูรูปหลักฐาน</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-500 italic">ไม่มีรูปภาพ</span>
                      )}
                    </td>

                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                        item.bill_status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        item.bill_status === 'Unpaid' || item.bill_status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-slate-800 text-slate-400'
                      }`}>
                        {item.bill_status === 'Paid' ? 'ชำระแล้ว' :
                         item.bill_status === 'Unpaid' || item.bill_status === 'Pending' ? 'ออกบิลแล้ว' : 'ยังไม่ออกบิล'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-white/10 rounded-3xl max-w-2xl w-full p-6 space-y-4 shadow-2xl">
            <div className="flex justify-between items-center pb-3 border-b border-white/10">
              <h3 className="text-base font-black text-white">ภาพถ่ายหลักฐานมิเตอร์ไฟฟ้า</h3>
              <button
                onClick={() => setSelectedPhoto(null)}
                className="w-8 h-8 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center font-bold"
              >
                ✕
              </button>
            </div>
            <div className="relative h-[450px] bg-black/50 rounded-2xl overflow-hidden border border-white/5 flex items-center justify-center">
              <Image
                src={selectedPhoto}
                alt="Meter Photo Evidence"
                fill
                unoptimized
                className="object-contain p-2"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
