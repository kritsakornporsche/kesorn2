'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { PHONE_INPUT_PROPS, phoneDigits } from '@/lib/phone';

interface Keeper {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  position: 'Maid' | 'Technician' | 'Manager';
  is_active: number;
}

const POSITION_LABEL: Record<Keeper['position'], string> = {
  Manager: 'ผู้จัดการ',
  Maid: 'แม่บ้าน',
  Technician: 'ช่างซ่อม',
};

export default function KeepersManagement() {
  const router = useRouter();
  const [keepers, setKeepers] = useState<Keeper[]>([]);
  const [loading, setLoading] = useState(true);
  const [dormId, setDormId] = useState<number | null>(null);
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingKeeper, setEditingKeeper] = useState<Keeper | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    position: 'Maid',
    password: '',
  });
  const [formError, setFormError] = useState('');

  // Cleaning Job Assignment states


  useEffect(() => {
    const fetchDormData = async () => {
      const email = localStorage.getItem('userEmail') || 'owner@kaset2.com';
      try {
        const res = await fetch(`/api/owner/onboarding?email=${email}`);
        const data = await res.json();
        if (data.success && data.hasDorm) {
          setDormId(data.dorm.id);
        } else {
          setDormId(1);
        }
      } catch (err) {
        setDormId(1);
      }
      fetchKeepers();
    };
    fetchDormData();
  }, [router]);

  const fetchKeepers = async () => {
    try {
      const res = await fetch('/api/owner/staff');
      const data = await res.json();
      if (data.success) {
        setKeepers(data.data.map((u: any) => ({
          id: u.id,
          name: u.name,
          email: u.email,
          phone: u.phone,
          position: u.role === 'manager' ? 'Manager' : u.sub_role === 'maid' ? 'Maid' : 'Technician',
          is_active: u.is_active,
        })));
      }
    } catch (err) {
      console.error('Error fetching keepers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (keeper: Keeper | null = null) => {
    if (keeper) {
      setEditingKeeper(keeper);
      setFormData({
        name: keeper.name,
        email: keeper.email || '',
        phone: keeper.phone || '',
        position: keeper.position,
        password: '',
      });
    } else {
      setEditingKeeper(null);
      setFormData({
        name: '',
        email: '',
        phone: '',
        position: 'Maid',
        password: '',
      });
    }
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    // Email and position are fixed after creation; edits only change name/phone/password
    const body = editingKeeper
      ? { id: editingKeeper.id, name: formData.name, phone: formData.phone, password: formData.password }
      : {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          role: formData.position === 'Manager' ? 'manager' : 'keeper',
          sub_role: formData.position === 'Maid' ? 'maid' : formData.position === 'Technician' ? 'technician' : null,
        };

    try {
      const res = await fetch('/api/owner/staff', {
        method: editingKeeper ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        setIsModalOpen(false);
        fetchKeepers();
      } else {
        setFormError(data.message || 'บันทึกไม่สำเร็จ');
      }
    } catch (err) {
      console.error('Error saving keeper:', err);
      setFormError('บันทึกไม่สำเร็จ');
    }
  };

  const handleToggleActive = async (keeper: Keeper) => {
    const closing = !!keeper.is_active;
    if (closing && !confirm(`ปิดบัญชีของ ${keeper.name}? คนนี้จะเข้าสู่ระบบไม่ได้ทันที`)) return;
    try {
      const res = await fetch('/api/owner/staff', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: keeper.id, is_active: !closing }),
      });
      if (res.ok) fetchKeepers();
    } catch (err) {
      console.error('Error updating keeper status:', err);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-secondary/40 p-8 text-white">
      <div className="max-w-6xl mx-auto">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-3xl font-black mb-2">พนักงาน</h1>
            <p className="text-muted-foreground font-medium">สร้างบัญชีผู้จัดการ แม่บ้าน และช่างซ่อม · เปิด/ปิดบัญชีได้</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              // Jobs are opened and assigned on the board (/owner/maintenance, lib/maintenance.ts)
              onClick={() => { window.location.href = '/owner/maintenance?new=cleaning'; }}
              className="px-5 py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-2xl font-black flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer text-sm"
            >
              <span>🧹</span>
              <span>มอบหมายงานทำความสะอาด</span>
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="px-6 py-3 bg-primary text-white rounded-2xl font-bold flex items-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all cursor-pointer text-sm"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              เพิ่มพนักงาน
            </button>
          </div>
        </header>

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <div key={i} className="h-48 bg-card rounded-3xl animate-pulse" />)}
          </div>
        ) : keepers.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-[40px] border-2 border-dashed border-white/20/10">
            <p className="text-muted-foreground font-bold">ยังไม่มีบัญชีพนักงาน</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {keepers.map((keeper) => (
              <div key={keeper.id} className={`bg-card rounded-[32px] p-6 shadow-sm border border-white/20/10 hover:shadow-xl hover:shadow-[#DCD3C6]/30 transition-all group ${keeper.is_active ? '' : 'opacity-60'}`}>
                <div className="flex justify-between items-start mb-6">
                  <div className={`p-3 rounded-2xl ${keeper.position === 'Maid' ? 'bg-rose-50 text-rose-600' : keeper.position === 'Manager' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                    {keeper.position === 'Maid' ? (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                      </svg>
                    ) : (
                      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleOpenModal(keeper)} className="p-2 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleToggleActive(keeper)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${keeper.is_active ? 'hover:bg-rose-50 text-rose-600' : 'hover:bg-emerald-50 text-emerald-600'}`}
                    >
                      {keeper.is_active ? 'ปิดบัญชี' : 'เปิดบัญชี'}
                    </button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-black">{keeper.name}</h3>
                    <p className="text-xs font-bold text-foreground/50 uppercase tracking-wider">
                      {POSITION_LABEL[keeper.position]}
                      {!keeper.is_active && <span className="ml-2 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-400 normal-case">ปิดใช้งาน</span>}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 text-sm text-white/80">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                      {keeper.email || 'ไม่มีข้อมูลอีเมล'}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-white/80">
                      <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 .948.684V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      {keeper.phone || 'ไม่มีข้อมูลติดต่อ'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Tooltip */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-[#3E342B]/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-card rounded-[40px] w-full max-w-lg shadow-2xl border border-white/20/10 overflow-hidden animate-in zoom-in duration-300">
            <div className="p-10">
              <h2 className="text-2xl font-black mb-6">{editingKeeper ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</h2>
              
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase text-muted-foreground">ชื่อ-นามสกุล</label>
                  <input 
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-6 py-4 bg-card border border-border rounded-2xl focus:bg-card focus:border-primary outline-none"
                    placeholder="เช่น สมศรี รักสบาย"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">เบอร์โทรศัพท์</label>
                    <input 
                      value={formData.phone}
                      {...PHONE_INPUT_PROPS}
                      onChange={(e) => setFormData({...formData, phone: phoneDigits(e.target.value)})}
                      className="w-full px-6 py-4 bg-card border border-border rounded-2xl focus:bg-card focus:border-primary outline-none"
                      placeholder="081-XXX-XXXX"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">ตำแหน่ง</label>
                    <select
                      value={formData.position}
                      disabled={!!editingKeeper}
                      onChange={(e) => setFormData({...formData, position: e.target.value})}
                      className="w-full px-6 py-4 bg-card border border-border rounded-2xl focus:bg-card focus:border-primary outline-none disabled:opacity-60"
                    >
                      <option value="Manager">ผู้จัดการ (Manager)</option>
                      <option value="Maid">แม่บ้าน (Maid)</option>
                      <option value="Technician">ช่างซ่อม (Technician)</option>
                    </select>
                  </div>
                </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-muted-foreground">อีเมล (ใช้เป็น Username)</label>
                    <input 
                      type="email"
                      required
                      disabled={!!editingKeeper}
                      value={formData.email}
                      onChange={(e) => setFormData({...formData, email: e.target.value})}
                      className="w-full px-6 py-4 bg-card border border-border rounded-2xl focus:bg-card focus:border-primary outline-none disabled:opacity-60"
                      placeholder="email@example.com"
                    />
                  </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase text-muted-foreground">
                        {editingKeeper ? 'ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)' : 'รหัสผ่านสำหรับพนักงาน'}
                      </label>
                      <input
                        type="password"
                        required={!editingKeeper}
                        minLength={6}
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="w-full px-6 py-4 bg-card border border-border rounded-2xl focus:bg-card focus:border-primary outline-none"
                        placeholder="••••••••"
                      />
                      <p className="text-[9px] text-muted-foreground ml-1">* พนักงานใช้อีเมลและรหัสผ่านนี้เข้าสู่ระบบ (อย่างน้อย 6 ตัวอักษร)</p>
                    </div>

                {formError && <p className="text-sm font-bold text-rose-400">{formError}</p>}


                <div className="flex gap-4 pt-4">
                  <button 
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 py-4 bg-card text-muted-foreground rounded-2xl font-bold hover:bg-white/10 transition-all"
                  >
                    ยกเลิก
                  </button>
                  <button 
                    type="submit"
                    className="flex-[2] py-4 bg-[#3E342B] text-white rounded-2xl font-bold shadow-lg hover:-translate-y-1 transition-all"
                  >
                    {editingKeeper ? 'บันทึกการแก้ไข' : 'สร้างบัญชี'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
