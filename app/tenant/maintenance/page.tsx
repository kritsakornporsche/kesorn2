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
  photo_url?: string;
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
  const [selectedPhotos, setSelectedPhotos] = useState<string[]>([]);
  const [previewModalUrl, setPreviewModalUrl] = useState<string | null>(null);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    if (selectedPhotos.length + files.length > 5) {
      alert('สามารถแนบรูปภาพได้สูงสุด 5 รูปต่อหนึ่งการแจ้ง');
      return;
    }

    files.forEach((file) => {
      if (!file.type.startsWith('image/')) {
        alert(`ไฟล์ ${file.name} ไม่ใช่ไฟล์รูปภาพ`);
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`ไฟล์ ${file.name} มีขนาดเกิน 10MB`);
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setSelectedPhotos((prev) => [...prev, event.target!.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });

    e.target.value = '';
  };

  const removePhoto = (indexToRemove: number) => {
    setSelectedPhotos((prev) => prev.filter((_, idx) => idx !== indexToRemove));
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await fetch('/api/tenant/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          issue_type: issueType, 
          description,
          photos: selectedPhotos
        }),
      });
      const json = await res.json();
      if (json.success) {
        setShowForm(false);
        setDescription('');
        setSelectedPhotos([]);
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
                className="bg-primary text-white px-8 py-3.5 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 hover:scale-105 active:scale-95 transition-all cursor-pointer"
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
                    className="w-full bg-card border border-border rounded-2xl px-6 py-5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[120px]"
                    required
                />
              </div>

              {/* Multi-Photo Attachment Section */}
              <div className="space-y-3">
                <div className="flex justify-between items-center px-1">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    📸 รูปภาพประกอบปัญหา (แนบได้สูงสุด 5 รูป)
                  </label>
                  <span className="text-xs font-bold text-primary">
                    {selectedPhotos.length}/5 รูป
                  </span>
                </div>

                {/* Photo Previews */}
                {selectedPhotos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                    {selectedPhotos.map((photo, idx) => (
                      <div key={idx} className="relative aspect-square rounded-2xl overflow-hidden border-2 border-primary/40 bg-muted group shadow-md">
                        <img 
                          src={photo} 
                          alt={`Uploaded preview ${idx + 1}`} 
                          className="w-full h-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removePhoto(idx)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 bg-red-600/90 text-white rounded-full flex items-center justify-center text-xs font-black shadow-lg hover:bg-red-700 transition-all cursor-pointer"
                          title="ลบรูปนี้"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Upload Trigger Area */}
                {selectedPhotos.length < 5 && (
                  <label className="flex flex-col items-center justify-center border-2 border-dashed border-border hover:border-primary/60 bg-muted/30 hover:bg-muted/50 rounded-2xl p-6 cursor-pointer transition-all group">
                    <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-2xl group-hover:scale-110 transition-transform mb-2">
                      📷
                    </div>
                    <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">
                      คลิกเพื่อเลือกรูปภาพจากเครื่อง / ถ่ายภาพประกอบ
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      (สามารถเลือกพร้อมกันได้หลายรูป, รองรับ JPG, PNG สูงสุด 10MB/รูป)
                    </p>
                    <input 
                      type="file" 
                      accept="image/*" 
                      multiple 
                      onChange={handleFileChange} 
                      className="hidden" 
                    />
                  </label>
                )}
              </div>

              <div className="flex gap-4 pt-4">
                <button 
                  type="button" 
                  onClick={() => {
                    setShowForm(false);
                    setSelectedPhotos([]);
                  }}
                  className="flex-1 py-4 border border-border text-muted-foreground rounded-2xl font-bold text-sm hover:bg-card cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button 
                  type="submit" 
                  disabled={submitting}
                  className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 disabled:opacity-50 cursor-pointer"
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
                const photos = parsePhotos(req.photo_url);

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
                       
                       {/* Attached Photos Gallery */}
                       {photos.length > 0 && (
                         <div className="mb-4">
                           <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
                             <span>📸</span>
                             <span>รูปภาพประกอบ ({photos.length} รูป):</span>
                           </p>
                           <div className="flex flex-wrap gap-2.5">
                             {photos.map((imgUrl, pIdx) => (
                               <img 
                                 key={pIdx} 
                                 src={imgUrl} 
                                 alt={`รูปประกอบ ${pIdx + 1}`}
                                 onClick={() => setPreviewModalUrl(imgUrl)}
                                 className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-xl border border-border hover:border-primary cursor-pointer hover:scale-105 transition-all shadow-sm"
                               />
                             ))}
                           </div>
                         </div>
                       )}

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
