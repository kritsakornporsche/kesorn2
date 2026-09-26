'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import AdminSidebar from '../components/AdminSidebar';

interface Announcement {
  id: number;
  title: string;
  content: string;
  category: string;
  created_at: string;
  author_name: string;
}

export default function AdminNewsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  
  const [news, setNews] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  
  const [formData, setFormData] = useState({
    title: '',
    content: '',
    category: 'info'
  });

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    } else if (status === 'authenticated') {
      const role = (session?.user as any)?.role;
      if (role !== 'owner' && role !== 'admin' && role !== 'platform_admin') {
        router.push('/');
      } else {
        fetchNews();
      }
    }
  }, [status, session, router]);

  const fetchNews = async () => {
    try {
      const res = await fetch('/api/announcements');
      const json = await res.json();
      if (json.success) setNews(json.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch('/api/announcements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setShowModal(false);
        setFormData({ title: '', content: '', category: 'info' });
        fetchNews();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const getCategoryColor = (cat: string) => {
    switch(cat) {
      case 'urgent': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'maintenance': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'activity': return 'bg-emerald-100 text-emerald-700 border-emerald-200';
      default: return 'bg-blue-100 text-blue-700 border-blue-200';
    }
  };

  if (status === 'loading') return null;

  return (
    <div className="flex h-screen bg-background">
      <AdminSidebar />
      
      <main className="flex-1 flex flex-col h-screen min-w-0">
        <header className="h-20 bg-white border-b border-border flex items-center justify-between px-10 shrink-0">
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">ประกาศข่าวสาร</h1>
            <p className="text-xs text-[#A08D74] mt-0.5">จัดการข้อมูลข่าวสารสําหรับผู้เช่าและพนักงาน</p>
          </div>
          <button 
            onClick={() => setShowModal(true)}
            className="bg-primary text-white px-5 py-2.5 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:scale-105 transition-all"
          >
            + สร้างประกาศใหม่
          </button>
        </header>

        <div className="flex-1 overflow-y-auto p-8 lg:p-10">
          <div className="max-w-4xl mx-auto space-y-6">
            {loading ? (
              <div className="text-center py-20 animate-pulse text-[#A08D74]">กําลังโหลดข่าวสาร...</div>
            ) : news.length === 0 ? (
              <div className="bg-white border border-border rounded-[40px] p-20 text-center space-y-4">
                <div className="text-4xl">📢</div>
                <p className="text-[#A08D74] font-medium">ยังไม่มีประกาศข่าวสารในขณะนี้</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-6">
                {news.map((item) => (
                  <div key={item.id} className="bg-white border border-border rounded-[32px] p-8 shadow-sm hover:shadow-md transition-shadow relative group">
                    <div className="flex justify-between items-start mb-4">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${getCategoryColor(item.category)}`}>
                        {item.category}
                      </span>
                      <span className="text-[10px] font-bold text-[#A08D74]">
                        {new Date(item.created_at).toLocaleDateString('th-TH', { 
                          year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                        })} โดย {item.author_name}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-foreground mb-3">{item.title}</h3>
                    <p className="text-[#5A4D41] text-sm leading-relaxed whitespace-pre-wrap">{item.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Modal สำหรับสร้างข่าวสาร */}
        {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-[#3E342B]/30 backdrop-blur-sm" onClick={() => setShowModal(false)}></div>
            <div className="bg-white rounded-[40px] shadow-2xl w-full max-w-lg relative z-10 p-10 border border-border animate-in fade-in zoom-in duration-200">
              <h2 className="text-2xl font-display font-bold text-foreground mb-8">สร้างข่าวสารใหม่</h2>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#A08D74]">หัวข้อประกาศ</label>
                  <input 
                    type="text" 
                    value={formData.title}
                    onChange={e => setFormData({...formData, title: e.target.value})}
                    placeholder="ระบุหัวข้อที่น่าสนใจ..."
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#A08D74]">หมวดหมู่</label>
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none"
                  >
                    <option value="info">ทั่วไป (info)</option>
                    <option value="urgent">ด่วน (urgent)</option>
                    <option value="maintenance">แจ้งซ่อม/ปิดปรับปรุง (maintenance)</option>
                    <option value="activity">กิจกรรม (activity)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-wider text-[#A08D74]">เนื้อหาประกาศ</label>
                  <textarea 
                    value={formData.content}
                    onChange={e => setFormData({...formData, content: e.target.value})}
                    placeholder="รายละเอียดประกาศ..."
                    className="w-full bg-background border border-border rounded-2xl p-5 text-sm focus:outline-none h-40"
                    required
                  />
                </div>
                <div className="flex gap-4 pt-4">
                  <button 
                    type="button" 
                    onClick={() => setShowModal(false)}
                    className="flex-1 py-4 border border-border text-[#A08D74] rounded-2xl font-bold text-xs"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit" 
                    disabled={saving}
                    className="flex-1 py-4 bg-primary text-white rounded-2xl font-bold text-xs shadow-lg shadow-primary/20 disabled:opacity-50"
                  >
                    {saving ? 'กําลังบันทึก...' : 'ประกาศข่าวสาร'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
