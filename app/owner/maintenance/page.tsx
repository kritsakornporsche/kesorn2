'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

interface MaintenanceRequest {
  id: number;
  tenant_name: string;
  tenant_phone: string;
  room_number: string;
  issue_type: string;
  description: string;
  status: string;
  cost?: number;
  bill_id?: number;
  created_at: string;
}

export default function OwnerMaintenancePage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();
  
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [ownerDormId, setOwnerDormId] = useState<number | null>(null);

  const fetchRequests = async (dormId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/maintenance?dormId=${dormId}`);
      const data = await res.json();
      if (data.success) {
        setRequests(data.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin');
    } else if (authStatus === 'authenticated' && session?.user?.email) {
      fetch(`/api/owner/onboarding?email=${session.user.email}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.hasDorm) {
            setOwnerDormId(data.dorm.id);
            fetchRequests(data.dorm.id);
          } else {
            setLoading(false);
          }
        });
    }
  }, [authStatus, session, router]);

  const updateStatus = async (id: number, newStatus: string) => {
    try {
      const res = await fetch(`/api/owner/maintenance/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (data.success && ownerDormId) {
        fetchRequests(ownerDormId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);

  const parsePhotos = (photoUrl?: string): string[] => {
    if (!photoUrl) return [];
    if (photoUrl.startsWith('[') && photoUrl.endsWith(']')) {
      try {
        const parsed = JSON.parse(photoUrl);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // fallback
      }
    }
    return [photoUrl];
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending':
      case 'pending': return 'bg-amber-50 text-amber-600 border border-amber-200';
      case 'In Progress':
      case 'InProgress':
      case 'in_progress': return 'bg-blue-50 text-blue-600 border border-blue-200';
      case 'Resolved':
      case 'Completed':
      case 'completed': return 'bg-emerald-50 text-emerald-600 border border-emerald-200';
      default: return 'bg-gray-50 text-gray-600 border border-gray-200';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'Pending':
      case 'pending': return 'รอรับเรื่อง';
      case 'In Progress':
      case 'InProgress':
      case 'in_progress': return 'กำลังดำเนินการ';
      case 'Resolved':
      case 'Completed':
      case 'completed': return 'แก้ไขเรียบร้อย';
      default: return status;
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-secondary/40 overflow-y-auto p-8 lg:p-12">
      <div className="max-w-6xl mx-auto w-full space-y-10">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-white/20/10 pb-8">
           <div>
             <h1 className="text-4xl font-black text-foreground tracking-tight">การจัดการแจ้งซ่อมและทำความสะอาด</h1>
             <p className="text-muted-foreground mt-2 font-medium">ติดตามและอัปเดตสถานะปัญหาการใช้งานและงานบริการของผู้เช่า</p>
           </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
           <div className="bg-card p-6 rounded-3xl border border-white/20/10 shadow-sm flex items-center gap-6">
              <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-500 text-2xl font-bold">!</div>
              <div>
                 <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">รอดำเนินการ</p>
                 <p className="text-2xl font-black text-foreground">{requests.filter(r => r.status === 'Pending' || r.status === 'pending').length}</p>
              </div>
           </div>
           <div className="bg-card p-6 rounded-3xl border border-white/20/10 shadow-sm flex items-center gap-6">
              <div className="w-14 h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-blue-500 text-2xl font-bold">⚙</div>
              <div>
                 <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">กำลังดำเนินการ</p>
                 <p className="text-2xl font-black text-foreground">{requests.filter(r => r.status === 'In Progress' || r.status === 'InProgress' || r.status === 'in_progress').length}</p>
              </div>
           </div>
           <div className="bg-card p-6 rounded-3xl border border-white/20/10 shadow-sm flex items-center gap-6">
              <div className="w-14 h-14 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-500 text-2xl font-bold">✓</div>
              <div>
                 <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ดำเนินการเสร็จสิ้น</p>
                 <p className="text-2xl font-black text-foreground">{requests.filter(r => r.status === 'Resolved' || r.status === 'Completed' || r.status === 'completed').length}</p>
              </div>
           </div>
        </div>

        <div className="bg-card border border-white/20/10 rounded-[2.5rem] shadow-sm overflow-hidden">
           <div className="overflow-x-auto p-4 sm:p-0">
             <table className="w-full text-left border-collapse">
                <thead className="bg-card hidden sm:table-header-group border-b border-[#F3EFE9]">
                   <tr>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ห้อง</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ข้อมูลผู้แจ้ง</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">รายละเอียดปัญหา</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest">ค่าบริการ/บิล</th>
                      <th className="px-8 py-5 text-[10px] font-black text-foreground/50 uppercase tracking-widest w-48">สถานะ / อัปเดต</th>
                   </tr>
                </thead>
                <tbody className="divide-y divide-[#F3EFE9] flex flex-col sm:table-row-group">
                   {loading ? (
                      <tr className="animate-pulse">
                         <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground">กำลังโหลด...</td>
                      </tr>
                   ) : requests.length === 0 ? (
                      <tr>
                         <td colSpan={5} className="px-8 py-20 text-center text-muted-foreground font-bold">ไม่มีการแจ้งซ่อมในขณะนี้</td>
                      </tr>
                   ) : requests.map((req) => (
                      <tr key={req.id} className="hover:bg-card transition-colors flex flex-col sm:table-row p-6 sm:p-0">
                         <td className="px-0 sm:px-8 py-2 sm:py-6 align-top">
                            <span className="inline-flex sm:hidden text-[10px] font-black text-foreground/50 uppercase tracking-widest mb-1">ห้อง</span>
                            <div className="w-12 h-12 bg-white/5 rounded-xl flex items-center justify-center text-white font-black text-lg">
                               {req.room_number || '-'}
                            </div>
                         </td>
                         <td className="px-0 sm:px-8 py-3 sm:py-6 align-top">
                            <span className="inline-flex sm:hidden text-[10px] font-black text-foreground/50 uppercase tracking-widest mb-1">ข้อมูลผู้แจ้ง</span>
                            <p className="font-bold text-foreground">{req.tenant_name || 'ไม่ระบุชื่อ'}</p>
                            <p className="text-[10px] font-bold text-foreground/50">{new Date(req.created_at).toLocaleDateString('th-TH')}</p>
                         </td>
                         <td className="px-0 sm:px-8 py-3 sm:py-6 align-top">
                            <span className="inline-flex sm:hidden text-[10px] font-black text-foreground/50 uppercase tracking-widest mb-1">รายละเอียดปัญหา</span>
                            <div className="bg-rose-50 border border-rose-100 text-rose-800 px-3 py-1 rounded-lg text-xs font-bold inline-block mb-2">
                               {req.issue_type}
                            </div>
                            <p className="text-sm font-medium text-white/80 whitespace-pre-line leading-relaxed mb-3">{req.description}</p>
                            
                            {/* Attached Photos (if any) */}
                            {parsePhotos((req as any).photo_url).length > 0 && (
                              <div className="flex flex-wrap gap-2 pt-1">
                                {parsePhotos((req as any).photo_url).map((url, pIdx) => (
                                  <img 
                                    key={pIdx} 
                                    src={url} 
                                    alt={`รูปประกอบ ${pIdx + 1}`} 
                                    onClick={() => setPreviewModalUrl(url)}
                                    className="w-12 h-12 object-cover rounded-xl border border-white/20 hover:border-primary cursor-pointer hover:scale-110 transition-all shadow-sm"
                                  />
                                ))}
                              </div>
                            )}
                         </td>
                         <td className="px-0 sm:px-8 py-3 sm:py-6 align-top">
                            <span className="inline-flex sm:hidden text-[10px] font-black text-foreground/50 uppercase tracking-widest mb-1">ค่าบริการ/บิล</span>
                            {req.cost && Number(req.cost) > 0 ? (
                              <div className="space-y-1">
                                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                  💰 ฿{Number(req.cost).toLocaleString()}
                                </span>
                                {req.bill_id && (
                                  <p className="text-[11px] text-muted-foreground font-medium">
                                    ออกบิล #{req.bill_id} แล้ว
                                  </p>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold bg-white/5 text-muted-foreground border border-white/10">
                                ✨ ไม่มีค่าใช้จ่าย
                              </span>
                            )}
                         </td>
                         <td className="px-0 sm:px-8 py-4 sm:py-6 align-top">
                            <span className="inline-flex sm:hidden text-[10px] font-black text-foreground/50 uppercase tracking-widest mb-3">สถานะ</span>
                            <select 
                               value={
                                 req.status === 'In Progress' || req.status === 'in_progress' || req.status === 'InProgress' ? 'InProgress' :
                                 req.status === 'Resolved' || req.status === 'completed' || req.status === 'Completed' ? 'Completed' :
                                 'Pending'
                               }
                               onChange={(e) => updateStatus(req.id, e.target.value)}
                               className={cn(
                                  "w-full text-xs font-black uppercase tracking-widest px-4 py-3 rounded-xl border-2 outline-none cursor-pointer",
                                  getStatusColor(req.status)
                               )}
                            >
                               <option value="Pending">รอรับเรื่อง</option>
                               <option value="InProgress">กำลังดำเนินการ</option>
                               <option value="Completed">แก้ไขเรียบร้อย</option>
                            </select>
                         </td>
                      </tr>
                   ))}
                </tbody>
             </table>
           </div>
        </div>
      </div>

      {/* Lightbox / Image Preview Modal */}
      {previewModalUrl && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setPreviewModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center">
            <button
              onClick={() => setPreviewModalUrl(null)}
              className="absolute -top-10 right-0 text-white text-sm font-bold bg-white/20 hover:bg-white/40 px-3 py-1 rounded-full cursor-pointer"
            >
              ปิด (✕)
            </button>
            <img 
              src={previewModalUrl} 
              alt="Expanded Preview" 
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl border border-white/20"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        </div>
      )}
    </div>
  );
}
