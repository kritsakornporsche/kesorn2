'use client';

import { useSession, signOut } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Image from 'next/image';

export default function ProfilePage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    bio: '',
    image_url: '',
    password: '',
    role: ''
  });

  const [message, setMessage] = useState({ text: '', type: '' });

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/signin');
    } else if (status === 'authenticated') {
      fetchProfile();
    }
  }, [status, router]);

  const fetchProfile = async () => {
    try {
      const res = await fetch('/api/user/profile');
      const json = await res.json();
      if (json.success) {
        setFormData({
          ...json.data,
          password: '' // Don't show password
        });
      }
    } catch (err) {
      console.error('Fetch profile error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ text: '', type: '' });

    try {
      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const json = await res.json();
      if (json.success) {
        setMessage({ text: 'บันทึกข้อมูลส่วนตัวเรียบร้อยแล้ว', type: 'success' });
        // Update session name if it changed
        await update({ name: formData.name });
      } else {
        setMessage({ text: json.message, type: 'error' });
      }
    } catch (err) {
      setMessage({ text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ', type: 'error' });
    } finally {
      setSaving(false);
      // Clear message after 3 seconds
      setTimeout(() => setMessage({ text: '', type: '' }), 3000);
    }
  };

  if (loading || status === 'loading') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-primary/20 border-t-[#8B7355] rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-2xl mx-auto">
        {/* Breadcrumb / Back */}
        <button 
          onClick={() => router.back()}
          className="mb-8 flex items-center gap-2 text-[#A08D74] hover:text-foreground transition-colors font-bold text-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          กลับไปหน้าที่แล้ว
        </button>

        <div className="bg-white rounded-[40px] shadow-xl shadow-[#3E342B]/5 border border-border overflow-hidden">
          {/* Header Section */}
          <div className="h-32 bg-background relative">
            <div className="absolute -bottom-12 left-10">
              <div className="relative h-24 w-24 rounded-3xl overflow-hidden border-4 border-white shadow-lg bg-white">
                <Image 
                  src={formData.image_url || `https://ui-avatars.com/api/?name=${formData.name}&background=6366F1&color=fff&size=100`} 
                  alt="Profile" 
                  fill 
                  className="object-cover"
                />
              </div>
            </div>
          </div>

          <div className="pt-16 pb-10 px-10">
            <div className="flex justify-between items-start mb-10">
              <div>
                <h1 className="text-2xl font-display font-bold text-foreground">{formData.name}</h1>
                <p className="text-sm text-[#A08D74] font-medium flex items-center gap-2 mt-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                  บทบาท: <span className={`uppercase tracking-widest text-[10px] px-2 py-0.5 rounded-md border font-black ${
                    formData.role === 'tenant' ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-700' :
                    formData.role === 'owner' ? 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700' :
                    formData.role === 'platform_admin' ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-700' :
                    formData.role === 'keeper' ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700' :
                    'bg-background text-muted-foreground border-border'
                  }`}>
                    {formData.role === 'tenant' ? '🏠 ลูกหอ / ผู้เช่า' :
                     formData.role === 'owner' ? '🏢 เจ้าของหอพัก' :
                     formData.role === 'platform_admin' ? '⚙️ แพลตฟอร์ม Admin' :
                     formData.role === 'keeper' ? '🔑 ผู้ดูแลหอพัก' :
                     formData.role === 'researcher' ? '🔬 นักวิจัย' :
                     formData.role === 'guest' ? '👤 แขก (ยังไม่ได้เช่าห้อง)' :
                     formData.role || 'ไม่ระบุ'}
                  </span>
                </p>

              </div>
            </div>

            {message.text && (
              <div className={`mb-8 p-4 rounded-2xl text-sm font-bold animate-in fade-in slide-in-from-top-2 ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'
              }`}>
                {message.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-[#A08D74] px-1">ชื่อ-นามสกุล</label>
                  <input 
                    type="text" 
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-[#A08D74] px-1">อีเมล (ไม่สามารถเปลี่ยนได้)</label>
                  <input 
                    type="email" 
                    value={formData.email}
                    disabled
                    className="w-full bg-background/50 border border-border/50 rounded-2xl px-5 py-3 text-sm text-[#A08D74] cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-[#A08D74] px-1">เบอร์โทรศัพท์</label>
                  <input 
                    type="tel" 
                    value={formData.phone || ''}
                    onChange={(e) => setFormData({...formData, phone: e.target.value})}
                    placeholder="08X-XXX-XXXX"
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-[#A08D74] px-1">รูปโปรไฟล์ (URL)</label>
                  <input 
                    type="text" 
                    value={formData.image_url || ''}
                    onChange={(e) => setFormData({...formData, image_url: e.target.value})}
                    placeholder="https://example.com/photo.jpg"
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-[0.1em] text-[#A08D74] px-1">เกี่ยวกับฉัน (Bio)</label>
                <textarea 
                  value={formData.bio || ''}
                  onChange={(e) => setFormData({...formData, bio: e.target.value})}
                  className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 text-foreground h-24"
                  placeholder="เขียนอะไรบางอย่างเกี่ยวกับคุณ..."
                />
              </div>

              <div className="pt-4 border-t border-border">
                <div className="space-y-2 mb-6">
                  <label className="text-[10px] font-black uppercase tracking-[0.1em] text-rose-500 px-1">เปลี่ยนรหัสผ่าน (เว้นว่างไว้หากไม่ต้องการเปลี่ยน)</label>
                  <input 
                    type="password" 
                    value={formData.password}
                    onChange={(e) => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-background border border-border rounded-2xl px-5 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/20 text-foreground"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <div className="flex gap-4">
                <button 
                  type="submit" 
                  disabled={saving}
                  className="flex-1 bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/20 hover:bg-primary/90 transition-all transform active:scale-[0.98] disabled:opacity-50"
                >
                  {saving ? 'กำลังบันทึก...' : 'บันทึกการเปลี่ยนแปลง'}
                </button>
                <button 
                  type="button" 
                  onClick={() => {
                    if (typeof window !== 'undefined') {
                      localStorage.removeItem('userRole');
                      localStorage.removeItem('userEmail');
                      localStorage.removeItem('userName');
                    }
                    signOut({ callbackUrl: '/' });
                  }}
                  className="px-6 border border-rose-100 bg-rose-50 text-rose-600 rounded-2xl font-bold text-sm hover:bg-rose-100 transition-all"
                >
                  ออกจากระบบ
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
