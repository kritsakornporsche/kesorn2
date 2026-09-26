'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface MaintenanceRequest {
  id: number;
  issue_type: string;
  description: string;
  status: string;
  cost?: number;
  bill_id?: number;
  created_at: string;
}

export default function TenantMaintenancePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [requests, setRequests] = useState<MaintenanceRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  
  // Form states
  const [issueType, setIssueType] = useState('ทั่วไป');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    } else if (status === 'authenticated') {
      fetchRequests();
    }
  }, [status]);

  const fetchRequests = async () => {
    try {
      const apiRes = await fetch('/api/tenant/maintenance/list');
      const json = await apiRes.json();
      if (json.success) setRequests(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/tenant/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issue_type: issueType, description }),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        setDescription('');
        setIssueType('ทั่วไป');
        fetchRequests();
      } else {
        alert(json.message);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (status === 'loading') return null;

  return (
    <div className="p-8 lg:p-10">
      <div className="max-w-4xl mx-auto pb-16 space-y-12">
        <header className="flex justify-between items-end">
          <div>
            <h1 className="text-3xl font-black text-foreground mb-2">การดูแลรักษาและทำความสะอาด (Maintenance & Cleaning)</h1>
            <p className="text-muted-foreground font-medium">แจ้งปัญหา ซ่อมแซม หรือขอรับบริการทำความสะอาดภายในห้องพัก</p>
          </div>
          {!showForm && (
            <button 
                onClick={() => setShowForm(true)}
                className="bg-primary text-white px-8 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all"
            >
                + แจ้งซ่อม / ทำความสะอาด
            </button>
          )}
        </header>

        {showForm && (
          <div className="bg-card rounded-[2.5rem] border border-border p-10 shadow-2xl animate-in zoom-in-95 duration-300">
            <h2 className="text-xl font-black text-foreground mb-8">แบบฟอร์มแจ้งซ่อม / ขอรับบริการทำความสะอาด</h2>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">ประเภทปัญหา / บริการ</label>
                <select 
                    value={issueType}
                    onChange={(e) => setIssueType(e.target.value)}
                    className="w-full bg-card border border-border rounded-2xl px-6 py-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                    <option>ทั่วไป</option>
                    <option>บริการทำความสะอาด (แม่บ้าน)</option>
                    <option>ระบบไฟฟ้า</option>
                    <option>ระบบประปา</option>
                    <option>เครื่องปรับอากาศ</option>
                    <option>เฟอร์นิเจอร์</option>
                    <option>อื่นๆ</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground px-1">รายละเอียดปัญหา / งานที่ต้องการให้ดูแล</label>
                <textarea 
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="กรุณาระบุปัญหาที่พบ เช่น ไฟเพดานดวงกลางดับ, น้ำหยดใต้ซิงค์ หรือขอให้แม่บ้านทำความสะอาดห้องน้ำ..."
                    className="w-full bg-card border border-border rounded-2xl px-6 py-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[150px]"
                    required
                />
              </div>
              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-4 border border-border text-muted-foreground rounded-2xl font-bold text-sm hover:bg-card"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 disabled:opacity-50"
                >
                  {submitting ? 'กำลังส่งข้อมูล...' : 'ส่งเรื่องแจ้งซ่อม / ทำความสะอาด'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="space-y-6">
          <h2 className="text-xl font-black text-foreground flex items-center gap-3">
             ประวัติการแจ้งซ่อมและทำความสะอาด
             <span className="text-xs bg-white/5 text-muted-foreground px-2 py-0.5 rounded-lg">{requests.length}</span>
          </h2>
          
          <div className="grid gap-6">
            {loading ? (
              <div className="text-center py-20 animate-pulse text-muted-foreground">กำลังโหลดข้อมูล...</div>
            ) : requests.length === 0 ? (
              <div className="bg-card border-2 border-dashed border-border rounded-[2.5rem] p-20 text-center">
                <p className="text-muted-foreground font-bold">ยังไม่มีประวัติการแจ้งซ่อมหรือทำความสะอาด</p>
              </div>
            ) : (
              requests.map((req) => {
                const isPending = req.status === 'Pending' || req.status === 'pending';
                const isInProgress = req.status === 'InProgress' || req.status === 'in_progress' || req.status === 'In Progress';
                return (
                <div key={req.id} className="bg-card rounded-[2.5rem] border border-border shadow-sm overflow-hidden flex items-stretch hover:shadow-xl transition-all group">
                   <div className={`w-4 shrink-0 ${
                      isPending ? 'bg-[#E9C46A]' :
                      isInProgress ? 'bg-[#2196F3]' :
                      'bg-[#4CAF50]'
                   }`}></div>
                   <div className="p-8 flex-1 flex flex-col md:flex-row justify-between gap-6 md:items-center">
                     <div>
                       <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-lg font-black text-white">{req.issue_type}</h3>
                            <span className="text-[10px] font-bold text-[#C2B7A8] uppercase tracking-widest">#{req.id.toString().padStart(4, '0')}</span>
                       </div>
                       <p className="text-muted-foreground text-sm mb-4 leading-relaxed font-medium">"{req.description}"</p>
                       <div className="text-[10px] text-muted-foreground font-bold tracking-widest uppercase flex items-center gap-2">
                         <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                         {new Date(req.created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </div>
                       {(!isPending && !isInProgress) && (
                         <div className="flex items-center gap-3 mt-3 flex-wrap">
                           {Number(req.cost || 0) > 0 ? (
                             <>
                               <span className="px-3 py-1 bg-amber-500/15 border border-amber-500/30 text-amber-300 rounded-xl text-xs font-black">
                                 💰 ค่าบริการ/ซ่อม: ฿{Number(req.cost).toLocaleString()}
                               </span>
                               <Link 
                                 href="/tenant/billing" 
                                 className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
                               >
                                 ดูและชำระในหน้าระบบบิล →
                               </Link>
                             </>
                           ) : (
                             <span className="px-3 py-1 bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 rounded-xl text-xs font-black">
                               ✨ ไม่มีค่าใช้จ่าย (ฟรี)
                             </span>
                           )}
                         </div>
                       )}
                     </div>
                     
                     <div className="shrink-0">
                        <span className={`inline-block px-6 py-2.5 text-[10px] font-black uppercase tracking-[0.15em] rounded-full border-2 ${
                          isPending ? 'bg-[#FAF3E8] text-[#D4A373] border-[#E9C46A]' :
                          isInProgress ? 'bg-[#E3F2FD] text-[#2196F3] border-[#BBDEFB]' :
                          'bg-[#E8F5E9] text-[#4CAF50] border-[#C8E6C9]'
                        }`}>
                          {isPending ? 'รอดำเนินการ' : isInProgress ? 'กำลังซ่อมแซม' : 'เสร็จสิ้น'}
                        </span>
                     </div>
                   </div>
                </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
