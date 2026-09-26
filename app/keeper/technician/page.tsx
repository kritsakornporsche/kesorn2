'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import KeeperSidebar from '../components/KeeperSidebar';

interface TechnicianJob {
  id: number;
  dorm_id?: number;
  dorm_name?: string;
  issue_type?: string;
  description?: string;
  room_number: string;
  tenant_name?: string;
  tenant_phone?: string;
  status: string;
  created_at: string;
  notes?: string;
  photo_url?: string;
}

interface TechnicianData {
  stats: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
  };
  jobs: TechnicianJob[];
}

const statusConfig: Record<string, { label: string; bg: string; icon: string }> = {
  Pending: { label: 'ยังไม่ได้รับงาน', bg: 'bg-rose-100 text-rose-700', icon: '📋' },
  pending: { label: 'ยังไม่ได้รับงาน', bg: 'bg-rose-100 text-rose-700', icon: '📋' },
  InProgress: { label: 'กำลังดำเนินการ', bg: 'bg-amber-100 text-amber-700', icon: '🛠️' },
  in_progress: { label: 'กำลังดำเนินการ', bg: 'bg-amber-100 text-amber-700', icon: '🛠️' },
  Completed: { label: 'ซ่อมเสร็จแล้ว', bg: 'bg-green-100 text-green-700', icon: '✅' },
  completed: { label: 'ซ่อมเสร็จแล้ว', bg: 'bg-green-100 text-green-700', icon: '✅' },
};

export default function TechnicianDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [data, setData] = useState<TechnicianData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [activeDormId, setActiveDormId] = useState<string>('all');

  // Filtering & Search
  const [filter, setFilter] = useState<'all' | 'Pending' | 'InProgress' | 'Completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modal states
  const [selectedJob, setSelectedJob] = useState<TechnicianJob | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishPhoto, setFinishPhoto] = useState('');

  const fetchData = useCallback(async (dormId = activeDormId, showLoading = true) => {
    if (showLoading) setLoadingData(true);
    try {
      const res = await fetch(`/api/keeper/technician/jobs?dormId=${dormId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Error fetching technician jobs:', err);
    } finally {
      if (showLoading) setTimeout(() => setLoadingData(false), 200);
    }
  }, [activeDormId]);

  useEffect(() => {
    const localEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null;

    if (status === 'authenticated') {
      const user = session?.user as any;
      if (user?.role !== 'keeper' || user?.sub_role !== 'technician') {
        router.push('/');
      } else {
        const savedDorm = typeof window !== 'undefined' ? localStorage.getItem('selectedKeeperDormId') || 'all' : 'all';
        setActiveDormId(savedDorm);
        fetchData(savedDorm);
      }
    } else if (status === 'unauthenticated') {
      if (localEmail) {
        // Fallback to local session storage
        const savedDorm = typeof window !== 'undefined' ? localStorage.getItem('selectedKeeperDormId') || 'all' : 'all';
        setActiveDormId(savedDorm);
        fetchData(savedDorm);
      } else {
        router.push('/signin');
      }
    }
  }, [status, session, router, fetchData]);

  // Listen to dorm changes from sidebar
  useEffect(() => {
    const handleDormChange = (e: any) => {
      const newDormId = e.detail?.dormId || 'all';
      setActiveDormId(newDormId);
      fetchData(newDormId);
    };

    window.addEventListener('keeperDormChanged', handleDormChange);
    return () => window.removeEventListener('keeperDormChanged', handleDormChange);
  }, [fetchData]);

  // Polling
  useEffect(() => {
    const poll = setInterval(() => {
      fetchData(activeDormId, false);
    }, 30000);
    return () => clearInterval(poll);
  }, [activeDormId, fetchData]);

  useEffect(() => {
    setCurrentTime(new Date().toLocaleTimeString('th-TH'));
    const timer = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString('th-TH'));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('ขนาดไฟล์ภาพต้องไม่เกิน 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      setFinishPhoto(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const updateStatus = async (id: number, newStatus: string, notes?: string, photo?: string) => {
    try {
      const res = await fetch('/api/keeper/technician/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, notes, photo_url: photo }),
      });
      const json = await res.json();
      if (json.success) {
        if (newStatus === 'InProgress' && selectedJob && selectedJob.id === id) {
          setSelectedJob({ ...selectedJob, status: 'InProgress' });
        } else {
          setIsFinishing(false);
          setFinishNotes('');
          setFinishPhoto('');
          setSelectedJob(null);
        }
        fetchData(activeDormId, false); 
      } else {
        alert('เกิดข้อผิดพลาด: ' + json.message);
      }
    } catch (err) {
      console.error('Error updating status:', err);
      alert('ไม่สามารถอัปเดตสถานะได้ ติดต่อผู้ดูแลระบบ');
    }
  };

  const filteredJobs = useMemo(() => {
    if (!data?.jobs) return [];
    return data.jobs.filter(job => {
      const matchesFilter = filter === 'all' || job.status === filter || job.status.toLowerCase() === filter.toLowerCase();
      const matchesSearch = job.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (job.issue_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (job.description || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (job.dorm_name || '').toLowerCase().includes(searchQuery.toLowerCase());
      return matchesFilter && matchesSearch;
    });
  }, [data, filter, searchQuery]);

  if (status === 'loading') {
    return <div className="flex h-screen items-center justify-center bg-[#080F1E] font-display text-white/50 tracking-wider">กำลังโหลดระบบ...</div>;
  }

  return (
    <div className="flex flex-col h-screen bg-[#080F1E]">
      <KeeperSidebar onDormChange={(id) => { setActiveDormId(id); fetchData(id); }} />
      
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        {/* Header */}
        <header className="h-20 bg-[#0F172A] border-b border-white/20/10 flex items-center justify-between px-10 shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="font-display text-xl font-bold tracking-tight text-white">ภาพรวมงานช่างซ่อมบำรุง</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                Multi-Dormitory
              </span>
            </div>
            <p className="text-xs text-white/50 font-medium mt-0.5">ยินดีต้อนรับคุณ {session?.user?.name}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-xs font-medium text-white/50 hidden sm:block">เวลาปัจจุบัน: {currentTime}</div>
            <button
              onClick={() => {
                if (typeof window !== 'undefined') {
                  localStorage.removeItem('userRole');
                  localStorage.removeItem('userEmail');
                  localStorage.removeItem('userName');
                }
                signOut({ callbackUrl: '/' });
              }}
              className="text-xs font-semibold text-rose-600 hover:text-rose-700 bg-rose-50 border border-rose-100 hover:bg-rose-100 transition-colors px-4 py-2 rounded-xl"
            >
              ออกจากระบบ
            </button>
            <div className="h-10 w-10 rounded-full overflow-hidden border-2 border-white/20/10 shadow-sm">
              <Image width={40} height={40} src={`https://ui-avatars.com/api/?name=${session?.user?.name || 'Technician'}&background=4f46e5&color=fff`} alt="ช่างซ่อม" />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-2xl">📋</div>
                <span className="text-sm font-semibold text-white">งานซ่อมทั้งหมด</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-muted-foreground">{loadingData ? '-' : data?.stats?.total || 0}</span>
                  <span className="text-sm text-white/50 font-medium">รายการ</span>
                </div>
              </div>
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-2xl">⏳</div>
                <span className="text-sm font-semibold text-white">กำลังดำเนินการซ่อม</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-amber-500">{loadingData ? '-' : data?.stats?.inProgress || 0}</span>
                  <span className="text-sm text-amber-500/70 font-medium">รายการ</span>
                </div>
              </div>
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform text-2xl">🛠️</div>
                <span className="text-sm font-semibold text-white">ซ่อมเสร็จสิ้นแล้ว</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-emerald-500">{loadingData ? '-' : data?.stats?.completed || 0}</span>
                  <span className="text-sm text-emerald-500/70 font-medium">รายการ</span>
                </div>
              </div>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                <div className="flex flex-wrap gap-2 p-1 bg-[#0F172A] border border-white/20/10 rounded-2xl w-full md:w-auto">
                    {(['all', 'Pending', 'InProgress', 'Completed'] as const).map((f) => (
                    <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all ${
                        filter === f 
                            ? 'bg-primary text-white shadow-sm' 
                            : 'text-white/50 hover:text-white/80'
                        }`}
                    >
                        {f === 'all' ? 'ทั้งหมด' : statusConfig[f]?.label}
                    </button>
                    ))}
                </div>
                <div className="relative w-full md:w-64">
                    <input 
                        type="text" 
                        placeholder="หาห้อง, อาการ, หรือหอพัก..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full bg-[#0F172A] border border-white/20/10 rounded-2xl px-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-white"
                    />
                    <svg className="absolute left-3.5 top-3 w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                </div>
            </div>

            {/* List */}
            <section className="bg-[#0F172A] border border-white/20/10 rounded-3xl shadow-sm overflow-hidden min-h-[400px]">
              <div className="px-7 py-5 border-b border-white/20/10 flex items-center justify-between bg-[#0F172A]/50 backdrop-blur-sm sticky top-0 z-10">
                <div>
                  <h2 className="font-display text-base font-bold text-white">ใบงานแจ้งซ่อม ({filteredJobs.length})</h2>
                  <p className="text-xs text-white/50 mt-0.5">ภาพรวมใบงานซ่อมบำรุงในหอพักที่เลือก</p>
                </div>
                <button 
                  onClick={() => fetchData(activeDormId)} 
                  disabled={loadingData}
                  className={`text-xs font-semibold hover:text-white/80 flex items-center gap-1 transition-all ${loadingData ? 'text-white/50 opacity-50 cursor-not-allowed' : 'text-muted-foreground'}`}
                >
                  <svg className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  {loadingData ? 'กำลังโหลด...' : 'รีเฟรชข้อมูล'}
                </button>
              </div>
              
              {loadingData ? (
                 <div className="p-20 text-center flex flex-col items-center gap-4">
                    <div className="w-10 h-10 border-4 border-primary/20 border-t-[#8B7355] rounded-full animate-spin"></div>
                    <p className="text-sm font-medium text-white/50">กำลังดึงข้อมูลใบงานล่าสุด...</p>
                </div>
              ) : filteredJobs.length === 0 ? (
                 <div className="p-20 text-center flex flex-col items-center gap-4">
                    <div className="text-4xl text-white/50">📦</div>
                  <p className="text-sm font-medium text-white/50">ไม่มีใบงานแจ้งซ่อมในหอพักนี้</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredJobs.map((task) => (
                    <div 
                        key={task.id} 
                        className="px-7 py-6 flex items-center gap-6 hover:bg-white/5 transition-colors cursor-pointer group"
                        onClick={() => setSelectedJob(task)}
                    >
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-indigo-500/10 flex flex-col items-center justify-center shrink-0 border-2 border-blue-500/40 group-hover:border-blue-400 group-hover:scale-105 transition-all shadow-md shadow-blue-500/10">
                        <span className="text-[10px] font-black text-blue-400 uppercase leading-none mb-1">ห้อง</span>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{task.room_number || '-'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-base font-bold text-white truncate group-hover:text-muted-foreground transition-colors">{task.issue_type || task.description}</h3>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            ห้อง {task.room_number}
                          </span>
                          {task.dorm_name && (
                            <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                              🏢 {task.dorm_name}
                            </span>
                          )}
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${statusConfig[task.status]?.bg || 'bg-white/10'}`}>
                            {statusConfig[task.status]?.label || task.status}
                          </span>
                        </div>
                        <p className="text-xs text-white/60 mt-1 truncate">{task.description}</p>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-white/50 font-medium flex items-center gap-1">
                            <svg className="w-3 h-3 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            ผู้แจ้ง: {task.tenant_name} ({task.tenant_phone}) • {new Date(task.created_at).toLocaleDateString('th-TH')}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        {(task.status === 'Pending' || task.status === 'pending') && (
                          <button 
                            onClick={() => updateStatus(task.id, 'InProgress')}
                            className="text-[11px] font-bold px-5 py-2.5 bg-primary text-white rounded-xl shadow-sm hover:focus:ring-2 hover:bg-primary/90 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
                          >
                            รับงานซ่อม
                          </button>
                        )}
                        {(task.status === 'InProgress' || task.status === 'in_progress') && (
                          <button 
                            onClick={() => {
                              setSelectedJob(task);
                              setIsFinishing(true);
                            }}
                            className="text-[11px] font-bold px-5 py-2.5 bg-emerald-600 text-white rounded-xl shadow-sm hover:focus:ring-2 hover:bg-emerald-700 transition-all transform hover:scale-105 cursor-pointer"
                          >
                            ซ่อมเสร็จแล้ว
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* Modal: Job Details & Completion */}
        {(selectedJob) && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-[#3E342B]/40 backdrop-blur-sm" onClick={() => { setSelectedJob(null); setIsFinishing(false); }}></div>
              <div className="bg-[#0F172A] rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-white/20/10 animate-in fade-in zoom-in duration-200">
                <div className="p-8">
                  {/* Enhanced Modal Header with Prominent Room Badge */}
                  <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-4">
                      <div className="h-16 w-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex flex-col items-center justify-center text-white shadow-xl shadow-blue-500/20 border border-white/20 shrink-0">
                        <span className="text-[10px] font-black uppercase tracking-wider text-white/80 leading-none">ห้อง</span>
                        <span className="text-2xl font-black leading-none mt-1">{selectedJob.room_number}</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-xl font-display font-black text-white">
                            {isFinishing ? 'ส่งมอบงานซ่อมเสร็จสิ้น' : 'รายละเอียดใบงานแจ้งซ่อม'}
                          </h3>
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                          <span className="px-3 py-1 rounded-xl text-xs font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            🚪 ห้องพัก {selectedJob.room_number}
                          </span>
                          {selectedJob.dorm_name && (
                            <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/20">
                              🏢 {selectedJob.dorm_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button onClick={() => { setSelectedJob(null); setIsFinishing(false); }} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all cursor-pointer">
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  {isFinishing ? (
                    <div className="space-y-6">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-2">บันทึกการซ่อม / รายละเอียดอะไหล่</label>
                        <textarea 
                          value={finishNotes}
                          onChange={(e) => setFinishNotes(e.target.value)}
                          placeholder="ระบุสิ่งที่ซ่อม เช่น เปลี่ยนคาปาซิเตอร์แอร์, ทำความสะอาดฟิลเตอร์..."
                          className="w-full bg-[#1E293B] border border-white/20/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 h-24"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-2">
                          📸 อัปโหลดรูปภาพหลักฐานหลังซ่อมเสร็จ
                        </label>
                        {finishPhoto ? (
                          <div className="relative rounded-2xl overflow-hidden border border-emerald-500/40 bg-black/40 p-2">
                            <img src={finishPhoto} alt="หลักฐานการซ่อม" className="h-44 w-full object-cover rounded-xl" />
                            <button
                              type="button"
                              onClick={() => setFinishPhoto('')}
                              className="absolute top-4 right-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                            >
                              ✕ ลบรูปภาพ
                            </button>
                          </div>
                        ) : (
                          <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/20 hover:border-blue-500/60 bg-white/5 hover:bg-white/10 rounded-2xl p-6 cursor-pointer transition-all group">
                            <div className="h-12 w-12 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform mb-2">
                              📷
                            </div>
                            <span className="text-sm font-bold text-white group-hover:text-blue-300 transition-colors">
                              คลิกหรือแตะเพื่อเลือกรูปภาพจากเครื่อง / ถ่ายภาพหลังซ่อม
                            </span>
                            <span className="text-xs text-white/40 mt-1">รองรับ JPG, PNG สูงสุด 5MB</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleFileChange}
                              className="hidden"
                            />
                          </label>
                        )}
                      </div>
                      <div className="flex gap-3 pt-4">
                        <button 
                          onClick={() => setIsFinishing(false)}
                          className="flex-1 px-4 py-3.5 rounded-2xl border border-white/20/10 text-white/50 text-xs font-bold hover:bg-[#1E293B] transition-all cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                        <button 
                          onClick={() => updateStatus(selectedJob.id, 'Completed', finishNotes, finishPhoto)}
                          className="flex-1 px-4 py-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                        >
                          บันทึกซ่อมเสร็จสิ้น
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      <div className="bg-[#1E293B] rounded-3xl p-6 border border-white/20/10">
                        <h4 className="text-sm font-bold text-white mb-3">{selectedJob.issue_type}</h4>
                        <dl className="grid grid-cols-2 gap-y-3 text-[13px]">
                          <dt className="text-white/50 font-medium">หมายเลขห้องพัก:</dt>
                          <dd className="text-blue-300 text-base font-black">ห้อง {selectedJob.room_number}</dd>

                          <dt className="text-white/50 font-medium">หอพัก:</dt>
                          <dd className="font-bold text-white">{selectedJob.dorm_name || 'ไม่ระบุ'}</dd>

                          <dt className="text-white/50">ผู้แจ้ง:</dt>
                          <dd className="font-bold text-white">{selectedJob.tenant_name} ({selectedJob.tenant_phone})</dd>

                          <dt className="text-white/50">สถานะงาน:</dt>
                          <dd className="font-bold text-emerald-400">{statusConfig[selectedJob.status]?.label || selectedJob.status}</dd>

                          <dt className="text-white/50">แจ้งเมื่อ:</dt>
                          <dd className="text-white">{new Date(selectedJob.created_at).toLocaleString('th-TH')}</dd>
                        </dl>
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <span className="text-xs text-white/50 font-medium block mb-1">รายละเอียดปัญหา:</span>
                          <p className="text-sm text-white bg-[#0F172A] p-3 rounded-xl">{selectedJob.description}</p>
                        </div>
                      </div>

                      {(selectedJob.notes || selectedJob.photo_url) && (
                        <div className="space-y-4">
                          {selectedJob.notes && (
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">บันทึกการซ่อม:</h4>
                              <p className="text-sm text-white bg-[#1E293B] border border-white/20/10 p-4 rounded-2xl">{selectedJob.notes}</p>
                            </div>
                          )}
                          {selectedJob.photo_url && (
                            <div>
                              <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">รูปภาพผลงานซ่อม:</h4>
                              <div className="rounded-2xl overflow-hidden border border-white/20/10 relative h-44 w-full bg-black/40">
                                <img src={selectedJob.photo_url} alt="ผลงานซ่อม" className="h-full w-full object-cover" />
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="pt-4">
                        {(selectedJob.status === 'Pending' || selectedJob.status === 'pending') && (
                          <button onClick={() => updateStatus(selectedJob.id, 'InProgress')} className="w-full px-4 py-4 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg cursor-pointer">รับงานซ่อมนี้</button>
                        )}
                        {(selectedJob.status === 'InProgress' || selectedJob.status === 'in_progress') && (
                          <button onClick={() => setIsFinishing(true)} className="w-full px-4 py-4 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-lg cursor-pointer">ดำเนินการซ่อมเสร็จสิ้น</button>
                        )}
                        {(selectedJob.status === 'Completed' || selectedJob.status === 'completed') && (
                          <button onClick={() => { setSelectedJob(null); setIsFinishing(false); }} className="w-full px-4 py-4 rounded-2xl border border-white/20/10 text-white/50 text-sm font-bold cursor-pointer">ปิดหน้าต่าง</button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
        )}

      </main>
    </div>
  );
}
