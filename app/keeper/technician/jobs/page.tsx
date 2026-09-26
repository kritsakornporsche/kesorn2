'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import KeeperSidebar from '../../components/KeeperSidebar';

interface TechnicianJob {
    id: number;
    issue: string;
    urgency: string;
    status: string;
    created_at: string;
    completed_at?: string;
    room_number: string;
    notes?: string;
    photo_url?: string;
    tenant_notes?: string;
}

interface TechnicianData {
    stats: {
        total: number;
        rush: number;
        completed: number;
    };
    jobs: TechnicianJob[];
}

const statusConfig: Record<string, { label: string; bg: string; icon: string }> = {
    pending: { label: 'ยังไม่ได้รับงาน', bg: 'bg-rose-100 text-rose-700', icon: '📋' },
    in_progress: { label: 'กำลังดำเนินการ', bg: 'bg-amber-100 text-amber-700', icon: '🛠️' },
    waiting_parts: { label: 'รออะไหล่', bg: 'bg-blue-100 text-blue-700', icon: '⚙️' },
    completed: { label: 'ซ่อมเสร็จแล้ว', bg: 'bg-green-100 text-green-700', icon: '✅' },
};

export default function TechnicianJobsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [data, setData] = useState<TechnicianData | null>(null);
    const [loadingData, setLoadingData] = useState(true);

    const [filter, setFilter] = useState<'all' | 'pending' | 'in_progress' | 'waiting_parts' | 'completed'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedJob, setSelectedJob] = useState<TechnicianJob | null>(null);

    useEffect(() => {
        if (status === 'unauthenticated') {
            router.push('/signin');
        } else if (status === 'authenticated') {
            const user = session?.user as any;
            if (user?.role !== 'keeper' || user?.sub_role !== 'technician') {
                router.push('/');
            } else {
                fetchData();
            }
        }
    }, [status, session, router]);

    const fetchData = async () => {
        setLoadingData(true);
        try {
            const res = await fetch('/api/keeper/technician/jobs');
            const json = await res.json();
            if (json.success) setData(json.data);
        } catch (err) {
            console.error('Error fetching technician jobs:', err);
        } finally {
            setTimeout(() => setLoadingData(false), 300);
        }
    };

    const filteredJobs = useMemo(() => {
        if (!data?.jobs) return [];
        return data.jobs.filter(job => {
            const matchesFilter = filter === 'all' || job.status === filter;
            const matchesSearch = job.room_number.toLowerCase().includes(searchQuery.toLowerCase()) || 
                                  job.issue.toLowerCase().includes(searchQuery.toLowerCase());
            return matchesFilter && matchesSearch;
        });
    }, [data, filter, searchQuery]);

    if (status === 'loading') {
        return <div className="flex h-screen items-center justify-center bg-[#080F1E] font-display text-white/50 tracking-wider">กำลังโหลดระบบ...</div>;
    }

    return (
        <div className="flex h-screen bg-[#080F1E]">
            <KeeperSidebar />

            <main className="flex-1 flex flex-col h-screen min-w-0">
                <header className="h-20 bg-[#0F172A] border-b border-white/20/10 flex items-center justify-between px-10 shrink-0">
                    <div>
                        <h1 className="font-display text-xl font-bold tracking-tight text-white">รายการใบงานช่าง</h1>
                        <p className="text-xs text-white/50 font-medium mt-0.5">ประวัติและใบงานการซ่อมทั้งหมด</p>
                    </div>
                    <div className="flex items-center gap-4">
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
                            <Image width={40} height={40} src={`https://ui-avatars.com/api/?name=${session?.user?.name || 'Tech'}&background=4f46e5&color=fff`} alt="ช่าง" />
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-y-auto p-8 lg:p-10">
                    <div className="max-w-5xl mx-auto space-y-8">
                        
                        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                            <div className="flex bg-[#0F172A]/50 p-1 rounded-2xl border border-white/20/10 flex-wrap justify-center">
                                {(['all', 'pending', 'in_progress', 'waiting_parts', 'completed'] as const).map(f => (
                                    <button 
                                        key={f} 
                                        onClick={() => setFilter(f)}
                                        className={`px-3 py-2 rounded-xl text-[11px] font-bold transition-all ${filter === f ? 'bg-primary text-white shadow-sm' : 'text-white/50 hover:text-white/80'}`}
                                    >
                                        {f === 'all' ? 'งานทั้งหมด' : statusConfig[f]?.label}
                                    </button>
                                ))}
                            </div>
                            <div className="relative w-full md:w-64">
                                <input 
                                    type="text" 
                                    placeholder="หาเลขห้อง หรือปัญหา..." 
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    className="w-full bg-[#0F172A] border border-white/20/10 rounded-2xl px-10 py-2.5 text-sm focus:outline-none"
                                />
                                <svg className="absolute left-3.5 top-3 w-4 h-4 text-white/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                </svg>
                            </div>
                        </div>

                        <section className="bg-[#0F172A] border border-white/20/10 rounded-3xl shadow-sm overflow-hidden">
                            <div className="px-7 py-5 border-b border-white/20/10 flex items-center justify-between bg-[#0F172A]/50">
                                <div>
                                    <h2 className="font-display text-base font-bold text-white">ประวัติใบงาน ({filteredJobs.length})</h2>
                                    <p className="text-xs text-white/50 mt-0.5">รายการแจ้งซ่อมที่เกิดขึ้นในระบบ</p>
                                </div>
                                <button onClick={fetchData} className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                                    <svg className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    รีเฟรช
                                </button>
                            </div>

                            {loadingData ? (
                                <div className="p-20 text-center text-white/50 animate-pulse">กำลังโหลดข้อมูลช่าง...</div>
                            ) : filteredJobs.length === 0 ? (
                                <div className="p-20 text-center text-white/50">ไม่พบใบงานที่ค้นหา</div>
                            ) : (
                                <div className="divide-y divide-[#E5DFD3]">
                                    {filteredJobs.map((task) => (
                                        <div key={task.id} className="px-7 py-5 flex items-center gap-6 hover:bg-[#0F172A] transition-all cursor-pointer group" onClick={() => setSelectedJob(task)}>
                                            <div className="h-14 w-14 rounded-2xl bg-white/5 flex flex-col items-center justify-center shrink-0 border border-white/20/10 transition-transform group-hover:scale-105">
                                                <span className="text-[10px] font-bold text-white/50 uppercase mb-1">ห้อง</span>
                                                <span className="text-lg font-black text-white">{task.room_number || '-'}</span>
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="text-sm font-bold text-white truncate group-hover:text-muted-foreground transition-colors">{task.issue}</h3>
                                                    {task.urgency === 'rush' && (
                                                        <span className="px-1.5 py-0.5 rounded text-[8px] font-black bg-rose-500 text-white">ด่วน</span>
                                                    )}
                                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${statusConfig[task.status]?.bg}`}>
                                                        {statusConfig[task.status]?.label}
                                                    </span>
                                                </div>
                                                <p className="text-[10px] text-white/50 mt-1 font-medium italic">
                                                    รับแจ้งเมื่อ {new Date(task.created_at).toLocaleString('th-TH')}
                                                </p>
                                            </div>
                                            <div className="text-[#E5DFD3] group-hover:text-muted-foreground transition-colors">
                                                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                                </svg>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </section>
                    </div>
                </div>

                {/* Detail Modal */}
                {selectedJob && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setSelectedJob(null)}></div>
                        <div className="bg-[#0F172A] rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 p-8 border border-white/20/10">
                            <h3 className="text-xl font-display font-bold text-white mb-6 flex items-center gap-3">
                                <span className="text-2xl">{statusConfig[selectedJob.status]?.icon}</span>
                                รายละเอียดงานห้อง {selectedJob.room_number}
                            </h3>
                            
                            <div className="space-y-4 text-sm">
                                <div className="bg-[#0F172A] p-6 rounded-3xl border border-white/20/10 space-y-3">
                                    <h4 className="font-bold text-white">{selectedJob.issue}</h4>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-white/50">ความสำคัญ</span>
                                        <span className={`font-bold ${selectedJob.urgency === 'rush' ? 'text-rose-600' : 'text-emerald-600'}`}>
                                            {selectedJob.urgency === 'rush' ? '🆘 ด่วนพิเศษ' : '✅ ปกติ'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                        <span className="text-white/50">สถานะ</span>
                                        <span className={`px-2 py-0.5 rounded-md font-bold ${statusConfig[selectedJob.status]?.bg}`}>
                                            {statusConfig[selectedJob.status]?.label}
                                        </span>
                                    </div>
                                    <div className="border-t border-white/20/10 pt-3 flex flex-col gap-2">
                                       <div className="flex justify-between items-center text-[11px]">
                                          <span className="text-white/50">วันเวลาที่รับเรื่อง</span>
                                          <span className="font-medium">{new Date(selectedJob.created_at).toLocaleString('th-TH')}</span>
                                       </div>
                                       {selectedJob.completed_at && (
                                          <div className="flex justify-between items-center text-[11px] text-emerald-600 font-bold">
                                             <span>วันเวลาที่ปิดงาน</span>
                                             <span>{new Date(selectedJob.completed_at).toLocaleString('th-TH')}</span>
                                          </div>
                                       )}
                                    </div>
                                </div>

                                {selectedJob.tenant_notes && (
                                    <div className="bg-amber-50 border border-amber-100 p-4 rounded-2xl text-[11px] text-amber-800 italic">
                                        "หมายเหตุจากห้องพัก: {selectedJob.tenant_notes}"
                                    </div>
                                )}

                                {selectedJob.notes && (
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold uppercase text-white/50">บันทึกจากช่าง</h4>
                                        <p className="bg-[#0F172A] border border-white/20/10 p-4 rounded-2xl text-xs">{selectedJob.notes}</p>
                                    </div>
                                )}

                                {selectedJob.photo_url && (
                                    <div className="space-y-2">
                                        <h4 className="text-[10px] font-bold uppercase text-white/50">หลักฐานงานซ่อม</h4>
                                        <div className="relative h-44 w-full rounded-2xl overflow-hidden border border-white/20/10">
                                            {selectedJob.photo_url.startsWith('http') ? (
                                                <Image src={selectedJob.photo_url} alt="Proof" fill className="object-cover" />
                                            ) : (
                                                <div className="flex items-center justify-center h-full bg-[#0F172A] text-[10px] text-blue-600">
                                                    {selectedJob.photo_url}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <button onClick={() => setSelectedJob(null)} className="w-full mt-8 py-4 bg-[#3E342B] text-white rounded-2xl font-bold">ปิดหน้าต่างนี้</button>
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
