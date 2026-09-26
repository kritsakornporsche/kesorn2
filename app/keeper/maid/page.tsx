'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo, useCallback } from 'react';
import Image from 'next/image';
import KeeperSidebar from '../components/KeeperSidebar';

interface MaidJob {
  id: number;
  dorm_id?: number;
  dorm_name?: string;
  status: string;
  job_type: string;
  cost?: number;
  bill_id?: number;
  created_at: string;
  completed_at?: string;
  room_number: string;
  notes?: string;
  photo_url?: string;
}

interface MaidData {
  stats: {
    total: number;
    inProgress: number;
    completed: number;
  };
  jobs: MaidJob[];
}

const statusConfig: Record<string, { label: string; bg: string; icon: string }> = {
  pending: { label: 'รอทำความสะอาด', bg: 'bg-amber-100 text-amber-700', icon: '🧹' },
  in_progress: { label: 'กำลังดำเนินการ', bg: 'bg-primary/10 text-primary', icon: '✨' },
  completed: { label: 'เสร็จสิ้น', bg: 'bg-green-100 text-green-700', icon: '✅' },
};

const jobTypeConfig: Record<string, string> = {
  move_out: 'ย้ายออก',
  weekly: 'ทำความสะอาดรายสัปดาห์',
  requested: 'ร้องขอพิเศษ',
};

export default function MaidDashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [currentTime, setCurrentTime] = useState<string>('');
  const [data, setData] = useState<MaidData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [activeDormId, setActiveDormId] = useState<string>('all');
  
  // Filtering & Search
  const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Modal states
  const [selectedJob, setSelectedJob] = useState<MaidJob | null>(null);
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishPhoto, setFinishPhoto] = useState('');
  const [finishCost, setFinishCost] = useState('0');

  // Create Job Modal states
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newRoomNumber, setNewRoomNumber] = useState('5');
  const [newJobType, setNewJobType] = useState('ทำความสะอาดทั่วไป');
  const [newNotes, setNewNotes] = useState('');
  const [creatingJob, setCreatingJob] = useState(false);

  const fetchData = useCallback(async (dormId = activeDormId, showLoading = true) => {
    if (showLoading) setLoadingData(true);
    try {
      const res = await fetch(`/api/keeper/maid/jobs?dormId=${dormId}`);
      const json = await res.json();
      if (json.success) setData(json.data);
    } catch (err) {
      console.error('Error fetching maid jobs:', err);
    } finally {
      if (showLoading) setTimeout(() => setLoadingData(false), 200);
    }
  }, [activeDormId]);

  useEffect(() => {
    const localEmail = typeof window !== 'undefined' ? localStorage.getItem('userEmail') : null;
    
    if (status === 'authenticated') {
      const user = session?.user as any;
      if (user?.role !== 'keeper' || user?.sub_role !== 'maid') {
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

  // Polling every 30 seconds
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

  const updateStatus = async (id: number, newStatus: string, notes?: string, photo?: string, cost?: number) => {
    try {
      const res = await fetch('/api/keeper/maid/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status: newStatus, notes, photo_url: photo, cost }),
      });
      const json = await res.json();
      if (json.success) {
        if (newStatus === 'in_progress' && selectedJob && selectedJob.id === id) {
          setSelectedJob({ ...selectedJob, status: 'in_progress' });
        } else {
          setIsFinishing(false);
          setFinishNotes('');
          setFinishPhoto('');
          setFinishCost('0');
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
      const matchesFilter = filter === 'all' || job.status === filter;
      const matchesSearch = job.room_number.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (jobTypeConfig[job.job_type] || job.job_type || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
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
              <h1 className="font-display text-xl font-bold tracking-tight text-white">ภาพรวมงานแม่บ้าน</h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/30">
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
              <Image width={40} height={40} src={`https://ui-avatars.com/api/?name=${session?.user?.name || 'Maid'}&background=e2aba1&color=fff`} alt="แม่บ้าน" />
            </div>
          </div>
        </header>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-8 lg:p-10 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-10">
          <div className="max-w-5xl mx-auto space-y-8">

            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">🧹</div>
                <span className="text-sm font-semibold text-white">งานทั้งหมดในระบบ</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-muted-foreground">{loadingData ? '-' : data?.stats?.total || 0}</span>
                  <span className="text-sm text-white/50 font-medium">ห้อง</span>
                </div>
              </div>
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">⏳</div>
                <span className="text-sm font-semibold text-white">กำลังทำความสะอาด</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-amber-500">{loadingData ? '-' : data?.stats?.inProgress || 0}</span>
                  <span className="text-sm text-amber-500/70 font-medium">ห้อง</span>
                </div>
              </div>
              <div className="bg-[#0F172A] border border-white/20/10 shadow-sm p-6 rounded-3xl flex flex-col relative overflow-hidden group">
                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-110 transition-transform">✨</div>
                <span className="text-sm font-semibold text-white">เสร็จสมบูรณ์แล้ว</span>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-display font-semibold text-emerald-500">{loadingData ? '-' : data?.stats?.completed || 0}</span>
                  <span className="text-sm text-emerald-500/70 font-medium">ห้อง</span>
                </div>
              </div>
            </div>

            {/* Search & Filter Bar */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
              <div className="flex gap-2 p-1 bg-[#0F172A] border border-white/20/10 rounded-2xl w-full md:w-auto">
                {(['all', 'pending', 'in_progress', 'completed'] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
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
                  placeholder="ค้นหาเลขห้อง หรือ หอพัก..."
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
                  <h2 className="font-display text-base font-bold text-white">คิวงานทำความสะอาด ({filteredJobs.length})</h2>
                  <p className="text-xs text-white/50 mt-0.5">รายการงานที่ตรงตามเงื่อนไขหอพักที่เลือก</p>
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
                  >
                    <span>➕</span>
                    <span>บันทึกงานใหม่</span>
                  </button>
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
              </div>
              
              {loadingData ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="w-10 h-10 border-4 border-primary/20 border-t-[#8B7355] rounded-full animate-spin"></div>
                  <p className="text-sm font-medium text-white/50">กำลังดึงข้อมูลงานล่าสุด...</p>
                </div>
              ) : filteredJobs.length === 0 ? (
                <div className="p-20 text-center flex flex-col items-center gap-4">
                  <div className="text-4xl">📭</div>
                  <p className="text-sm font-medium text-white/50">ไม่พบรายการงานในหอพักนี้</p>
                </div>
              ) : (
                <div className="divide-y divide-white/5">
                  {filteredJobs.map((task) => (
                    <div 
                      key={task.id} 
                      className="px-7 py-6 flex items-center gap-6 hover:bg-white/5 transition-colors cursor-pointer group"
                      onClick={() => setSelectedJob(task)}
                    >
                      <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-amber-500/10 flex flex-col items-center justify-center shrink-0 border-2 border-orange-500/40 group-hover:border-orange-400 group-hover:scale-105 transition-all shadow-md shadow-orange-500/10">
                        <span className="text-[10px] font-black text-orange-400 uppercase leading-none mb-1">ห้อง</span>
                        <span className="text-2xl font-black text-white leading-none tracking-tight">{task.room_number || '-'}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3">
                           <h3 className="text-base font-bold text-white truncate">{jobTypeConfig[task.job_type] || task.job_type}</h3>
                           <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-orange-500/20 text-orange-300 border border-orange-500/30">
                             ห้อง {task.room_number}
                           </span>
                           {task.dorm_name && (
                             <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                               🏢 {task.dorm_name}
                             </span>
                           )}
                           <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-wider uppercase ${statusConfig[task.status]?.bg || 'bg-white/10 text-white/80'}`}>
                            {statusConfig[task.status]?.label || task.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1.5 flex-wrap">
                          <span className="text-[10px] text-white/50 flex items-center gap-1 font-medium">
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            มอบหมายเมื่อ {new Date(task.created_at).toLocaleDateString('th-TH')}
                          </span>
                          {task.completed_at && (
                            <span className="text-[10px] text-emerald-400 flex items-center gap-1 font-bold italic">
                              สำเร็จเมื่อ {new Date(task.completed_at).toLocaleTimeString('th-TH')}
                            </span>
                          )}
                          {(task.status === 'completed') && (
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                              Number(task.cost || 0) > 0 
                                ? 'bg-orange-500/20 text-orange-300 border border-orange-500/30' 
                                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            }`}>
                              {Number(task.cost || 0) > 0 ? `💰 ค่าบริการ ฿${Number(task.cost).toLocaleString()} (ออกบิลแล้ว)` : '✨ ไม่มีค่าใช้จ่าย'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                        {task.status === 'pending' && (
                          <button 
                            onClick={() => updateStatus(task.id, 'in_progress')}
                            className="text-[11px] font-bold px-5 py-2.5 bg-primary text-white rounded-xl shadow-sm hover:focus:ring-2 hover:bg-primary/90 transition-all transform hover:scale-105 active:scale-95"
                          >
                            รับงาน
                          </button>
                        )}
                        {task.status === 'in_progress' && (
                          <button 
                            onClick={() => {
                              setSelectedJob(task);
                              setIsFinishing(true);
                            }}
                            className="text-[11px] font-bold px-5 py-2.5 bg-emerald-600 text-white rounded-xl shadow-sm hover:focus:ring-2 hover:bg-emerald-700 transition-all transform hover:scale-105 active:scale-95"
                          >
                            งานเสร็จสิ้น
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

        {/* Modal: Job Details & Completion Form */}
        {(selectedJob) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#3E342B]/40 backdrop-blur-sm" onClick={() => { setSelectedJob(null); setIsFinishing(false); }}></div>
            <div className="bg-[#0F172A] rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 overflow-hidden border border-white/20/10 animate-in fade-in zoom-in duration-200">
              <div className="p-8">
                {/* Enhanced Modal Header with Prominent Room Badge */}
                <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/10">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl flex flex-col items-center justify-center text-white shadow-xl shadow-orange-500/20 border border-white/20 shrink-0">
                            <span className="text-[10px] font-black uppercase tracking-wider text-white/80 leading-none">ห้อง</span>
                            <span className="text-2xl font-black leading-none mt-1">{selectedJob.room_number}</span>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-xl font-display font-black text-white">
                                    {isFinishing ? 'ยืนยันงานเสร็จสิ้น' : 'รายละเอียดงาน'}
                                </h3>
                            </div>
                            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                <span className="px-3 py-1 rounded-xl text-xs font-black bg-orange-500/20 text-orange-300 border border-orange-500/30">
                                    🚪 ห้องพัก {selectedJob.room_number}
                                </span>
                                {selectedJob.dorm_name && (
                                    <span className="px-2.5 py-1 rounded-xl text-xs font-medium bg-blue-500/10 text-blue-300 border border-blue-500/20">
                                        🏢 {selectedJob.dorm_name}
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>
                    <button onClick={() => { setSelectedJob(null); setIsFinishing(false); }} className="p-2 text-white/50 hover:text-white hover:bg-white/10 rounded-xl transition-all">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {isFinishing ? (
                  <div className="space-y-6">
                      <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-white/50 mb-2">บันทึกเพิ่มเติม (ถ้ามี)</label>
                      <textarea 
                        value={finishNotes}
                        onChange={(e) => setFinishNotes(e.target.value)}
                        placeholder="ระบุสิ่งที่ทำลงไป หรือสิ่งที่พบล่าสุด..."
                        className="w-full bg-[#1E293B] border border-white/20/10 rounded-2xl p-4 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 h-24"
                      />
                    </div>

                    {/* Cost / Fee Input */}
                    <div className="bg-[#0F172A] border border-orange-500/30 p-4 rounded-2xl space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="block text-xs font-bold uppercase tracking-wider text-orange-300">
                          🧹 ค่าบริการทำความสะอาด (บาท)
                        </label>
                        <span className="text-[11px] text-orange-400/80 font-medium">ใส่ 0 หากไม่มีค่าใช้จ่าย</span>
                      </div>
                      <div className="relative">
                        <input 
                          type="number"
                          min="0"
                          step="any"
                          value={finishCost}
                          onChange={(e) => setFinishCost(e.target.value)}
                          placeholder="0 (ไม่มีค่าใช้จ่าย)"
                          className="w-full bg-[#1E293B] border border-white/20/20 rounded-xl px-4 py-3 text-base font-bold text-white focus:outline-none focus:ring-2 focus:ring-orange-500/40"
                        />
                        <span className="absolute right-4 top-3 text-xs font-bold text-white/40">บาท</span>
                      </div>
                      <div className="flex flex-wrap gap-2 pt-1">
                        {['0', '100', '150', '200', '300'].map((val) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() => setFinishCost(val)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                              finishCost === val 
                                ? 'bg-orange-500 text-slate-950 font-black shadow-md shadow-orange-500/20' 
                                : 'bg-white/5 text-white/60 border border-white/10 hover:text-white'
                            }`}
                          >
                            {val === '0' ? '✨ ฟรี (0 บาท)' : `฿${val}`}
                          </button>
                        ))}
                      </div>
                      <p className="text-[11px] text-white/50 pt-1 leading-relaxed">
                        💡 หากระบุยอดเงินมากกว่า 0 ระบบจะสร้างบิลเรียกเก็บเงินไปยังห้องพักของผู้เช่าโดยอัตโนมัติ (หากไม่มีค่าใช้จ่ายให้ใส่ 0)
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-white/70 mb-2">
                        📸 อัปโหลดรูปภาพหลักฐานการทำงาน
                      </label>
                      {finishPhoto ? (
                        <div className="relative rounded-2xl overflow-hidden border border-emerald-500/40 bg-black/40 p-2">
                          <img src={finishPhoto} alt="หลักฐานการทำงาน" className="h-44 w-full object-cover rounded-xl" />
                          <button
                            type="button"
                            onClick={() => setFinishPhoto('')}
                            className="absolute top-4 right-4 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl shadow-lg transition-all flex items-center gap-1 cursor-pointer"
                          >
                            ✕ ลบรูปภาพ
                          </button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center border-2 border-dashed border-white/20 hover:border-orange-500/60 bg-white/5 hover:bg-white/10 rounded-2xl p-6 cursor-pointer transition-all group">
                          <div className="h-12 w-12 rounded-full bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform mb-2">
                            📷
                          </div>
                          <span className="text-sm font-bold text-white group-hover:text-orange-300 transition-colors">
                            คลิกหรือแตะเพื่อเลือกรูปภาพจากเครื่อง / ถ่ายภาพ
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
                        className="flex-1 px-4 py-3.5 rounded-2xl border border-white/20/10 text-white/50 text-xs font-bold hover:bg-[#1E293B] transition-all"
                       >
                         ยกเลิก
                       </button>
                       <button 
                        onClick={() => updateStatus(selectedJob.id, 'completed', finishNotes, finishPhoto, parseFloat(finishCost) || 0)}
                        className="flex-1 px-4 py-3.5 rounded-2xl bg-emerald-600 text-white text-xs font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                       >
                         ส่งงานเสร็จสิ้น {Number(finishCost) > 0 ? `(ยอดเรียกเก็บ ฿${Number(finishCost).toLocaleString()})` : '(ไม่มีค่าใช้จ่าย)'}
                       </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="bg-[#1E293B] rounded-3xl p-6 border border-white/20/10">
                        <dl className="grid grid-cols-2 gap-y-4 text-sm">
                            <dt className="text-white/50 font-medium">หมายเลขห้องพัก:</dt>
                            <dd className="text-orange-300 text-base font-black">ห้อง {selectedJob.room_number}</dd>

                            <dt className="text-white/50 font-medium">หอพัก:</dt>
                            <dd className="text-white font-bold">{selectedJob.dorm_name || 'ไม่ระบุ'}</dd>

                            <dt className="text-white/50 font-medium">ประเภทงาน:</dt>
                            <dd className="text-white font-bold">{jobTypeConfig[selectedJob.job_type] || selectedJob.job_type}</dd>
                            
                            <dt className="text-white/50 font-medium">สถานะ:</dt>
                            <dd className="font-bold">
                                <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase ${statusConfig[selectedJob.status]?.bg}`}>
                                    {statusConfig[selectedJob.status]?.label}
                                </span>
                            </dd>

                            <dt className="text-white/50 font-medium">เวลาเริ่มงาน:</dt>
                            <dd className="text-white font-bold">{new Date(selectedJob.created_at).toLocaleString('th-TH')}</dd>
                            
                            {selectedJob.completed_at && (
                                <>
                                    <dt className="text-white/50 font-medium">เวลาเสร็จสิ้น:</dt>
                                    <dd className="text-emerald-400 font-bold">{new Date(selectedJob.completed_at).toLocaleString('th-TH')}</dd>
                                </>
                            )}

                            <dt className="text-white/50 font-medium">ค่าบริการ:</dt>
                            <dd className={Number(selectedJob.cost || 0) > 0 ? "font-bold text-orange-400" : "font-semibold text-emerald-400"}>
                              {Number(selectedJob.cost || 0) > 0 ? `฿${Number(selectedJob.cost).toLocaleString()} (ออกบิลแล้ว)` : 'ไม่มีค่าใช้จ่าย (ฟรี)'}
                            </dd>
                        </dl>
                    </div>

                    {(selectedJob.notes || selectedJob.photo_url) && (
                         <div className="space-y-4">
                            {selectedJob.notes && (
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">บันทึกจากผู้ทำ:</h4>
                                    <p className="text-sm text-white bg-[#1E293B] border border-white/20/10 p-4 rounded-2xl">{selectedJob.notes}</p>
                                </div>
                            )}
                            {selectedJob.photo_url && (
                                <div>
                                    <h4 className="text-xs font-bold uppercase tracking-wider text-white/50 mb-2">หลักฐานงาน:</h4>
                                    {selectedJob.photo_url.startsWith('http') ? (
                                        <div className="rounded-2xl overflow-hidden border border-white/20/10 relative h-40 w-full">
                                            <Image src={selectedJob.photo_url} alt="Evidence" fill className="object-cover" />
                                        </div>
                                    ) : (
                                        <p className="text-sm text-white italic">{selectedJob.photo_url}</p>
                                    )}
                                </div>
                            )}
                         </div>
                    )}

                    <div className="pt-4">
                        {selectedJob.status === 'pending' && (
                            <button 
                                onClick={() => updateStatus(selectedJob.id, 'in_progress')}
                                className="w-full px-4 py-4 rounded-2xl bg-primary text-white text-sm font-bold shadow-lg shadow-primary/20"
                            >
                                เริ่มดำเนินการทันที
                            </button>
                        )}
                        {selectedJob.status === 'in_progress' && (
                            <button 
                                onClick={() => setIsFinishing(true)}
                                className="w-full px-4 py-4 rounded-2xl bg-emerald-600 text-white text-sm font-bold shadow-lg shadow-emerald-600/20"
                            >
                                ดำเนินการเสร็จสิ้น
                            </button>
                        )}
                        {selectedJob.status === 'completed' && (
                            <button 
                                onClick={() => setSelectedJob(null)}
                                className="w-full px-4 py-4 rounded-2xl border border-white/20/10 text-white/50 text-sm font-bold hover:bg-[#1E293B]"
                            >
                                ปิดหน้าต่าง
                            </button>
                        )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Create Job Modal */}
        {isCreateModalOpen && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0F172A] border border-white/10 rounded-[2.5rem] w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
              <div className="p-8">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-orange-500/20 text-orange-400 flex items-center justify-center text-xl">
                      🧹
                    </div>
                    <div>
                      <h2 className="text-xl font-black text-white">บันทึกงานทำความสะอาด</h2>
                      <p className="text-xs text-orange-400 font-bold">New Cleaning Task</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => setIsCreateModalOpen(false)}
                    className="text-white/50 hover:text-white text-sm font-bold"
                  >
                    ✕
                  </button>
                </div>

                <form 
                  onSubmit={async (e) => {
                    e.preventDefault();
                    setCreatingJob(true);
                    try {
                      const res = await fetch('/api/keeper/maid/jobs', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          room_number: newRoomNumber,
                          job_type: newJobType,
                          notes: newNotes,
                          dorm_id: activeDormId === 'all' ? 1 : Number(activeDormId),
                        }),
                      });
                      const d = await res.json();
                      if (d.success) {
                        setIsCreateModalOpen(false);
                        setNewNotes('');
                        fetchData(activeDormId);
                      } else {
                        alert(d.message || 'เกิดข้อผิดพลาด');
                      }
                    } catch (err: any) {
                      alert(err.message);
                    } finally {
                      setCreatingJob(false);
                    }
                  }}
                  className="space-y-4 text-xs font-bold"
                >
                  <div>
                    <label className="text-[10px] uppercase text-white/50 block mb-1">เลือกห้องพัก</label>
                    <select
                      value={newRoomNumber}
                      onChange={(e) => setNewRoomNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-[#080F1E] border border-white/10 rounded-xl text-white font-bold outline-none"
                    >
                      {Array.from({ length: 20 }, (_, i) => String(i + 1)).map(num => (
                        <option key={num} value={num} className="bg-[#0F172A] text-white">
                          ห้อง {num} (หอพักเกษร 2)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-white/50 block mb-1">ประเภทงาน</label>
                    <select
                      value={newJobType}
                      onChange={(e) => setNewJobType(e.target.value)}
                      className="w-full px-4 py-3 bg-[#080F1E] border border-white/10 rounded-xl text-white font-bold outline-none"
                    >
                      <option value="ทำความสะอาดทั่วไป">ทำความสะอาดทั่วไป</option>
                      <option value="move_out">เตรียมห้องย้ายออก / ย้ายเข้า</option>
                      <option value="weekly">ทำความสะอาดประจำสัปดาห์</option>
                      <option value="requested">คำขอพิเศษ</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase text-white/50 block mb-1">รายละเอียด / บันทึกเพิ่มเติม</label>
                    <textarea
                      rows={3}
                      value={newNotes}
                      onChange={(e) => setNewNotes(e.target.value)}
                      placeholder="ระบุจุดที่ต้องเน้น เช่น ระเบียง ห้องน้ำ..."
                      className="w-full px-4 py-3 bg-[#080F1E] border border-white/10 rounded-xl text-white font-medium outline-none resize-none"
                    />
                  </div>

                  <div className="flex gap-3 pt-3">
                    <button
                      type="button"
                      onClick={() => setIsCreateModalOpen(false)}
                      className="flex-1 py-3 bg-white/5 hover:bg-white/10 text-white/50 rounded-xl transition-all"
                    >
                      ยกเลิก
                    </button>
                    <button
                      type="submit"
                      disabled={creatingJob}
                      className="flex-[2] py-3 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 text-slate-950 rounded-xl font-black shadow-lg shadow-orange-500/20 transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {creatingJob ? 'กำลังบันทึก...' : 'บันทึกงาน'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
