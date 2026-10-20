'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

interface DormRule {
  id: number;
  dorm_id: number;
  title: string;
  description: string;
  category: string;
  fine_amount: number;
  is_active: number;
  sort_order: number;
}

interface DormItem {
  id: number;
  dorm_name: string;
}

const CATEGORIES = [
  'ทั้งหมด',
  'ความปลอดภัย',
  'การเข้า-ออก',
  'ความสะอาด',
  'สัตว์เลี้ยง',
  'การใช้เสียง',
  'ทั่วไป'
];

export default function OwnerRulesPage() {
  const { data: session, status: authStatus } = useSession();
  const router = useRouter();

  const [dorms, setDorms] = useState<DormItem[]>([]);
  const [selectedDormId, setSelectedDormId] = useState<number | null>(null);
  const [rules, setRules] = useState<DormRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCategory, setSelectedCategory] = useState<string>('ทั้งหมด');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<DormRule | null>(null);
  const [isCloneModalOpen, setIsCloneModalOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<number | null>(null);
  const [cloneReplace, setCloneReplace] = useState(false);

  // Form State
  const [form, setForm] = useState({
    title: '',
    description: '',
    category: 'ทั่วไป',
    fine_amount: 0,
    is_active: true
  });
  const [submitting, setSubmitting] = useState(false);

  // Fetch Owner Dorms
  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin');
      return;
    }
    if (authStatus === 'authenticated' && session?.user?.email) {
      fetch(`/api/owner/onboarding?email=${session.user.email}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && Array.isArray(data.dorms) && data.dorms.length > 0) {
            setDorms(data.dorms);
            setSelectedDormId(data.dorms[0].id);
          } else {
            setLoading(false);
          }
        })
        .catch(err => {
          console.error('Error fetching dorms:', err);
          setLoading(false);
        });
    }
  }, [authStatus, session, router]);

  // Fetch Rules for selected dorm
  const fetchRules = async (dId: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/owner/rules?dormId=${dId}`);
      const data = await res.json();
      if (data.success) {
        setRules(data.data || []);
      }
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedDormId) {
      fetchRules(selectedDormId);
    }
  }, [selectedDormId]);

  // Handle Add Rule
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDormId || !form.title.trim() || !form.description.trim()) {
      alert('กรุณากรอกหัวข้อและรายละเอียดกฎระเบียบ');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dormId: selectedDormId,
          title: form.title,
          description: form.description,
          category: form.category,
          fineAmount: Number(form.fine_amount) || 0,
          isActive: form.is_active
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✓ เพิ่มกฎระเบียบเรียบร้อยแล้ว');
        setIsAddModalOpen(false);
        setForm({ title: '', description: '', category: 'ทั่วไป', fine_amount: 0, is_active: true });
        fetchRules(selectedDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการเพิ่มกฎ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit Rule
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule || !form.title.trim() || !form.description.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingRule.id,
          title: form.title,
          description: form.description,
          category: form.category,
          fineAmount: Number(form.fine_amount) || 0,
          isActive: form.is_active
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('✓ บันทึกการแก้ไขเรียบร้อยแล้ว');
        setEditingRule(null);
        if (selectedDormId) fetchRules(selectedDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการแก้ไข');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Delete Rule
  const handleDeleteRule = async (ruleId: number) => {
    if (!confirm('คุณแน่ใจหรือไม่ว่าต้องการลบกฎระเบียบข้อนี้?')) return;
    try {
      const res = await fetch(`/api/owner/rules?id=${ruleId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        alert('✓ ลบกฎระเบียบเรียบร้อยแล้ว');
        if (selectedDormId) fetchRules(selectedDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการลบ');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    }
  };

  // Handle Toggle Active
  const handleToggleActive = async (rule: DormRule) => {
    try {
      await fetch('/api/owner/rules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: rule.id,
          isActive: rule.is_active === 1 ? false : true
        })
      });
      if (selectedDormId) fetchRules(selectedDormId);
    } catch (err) {
      console.error(err);
    }
  };

  // Handle Clone Rules
  const handleCloneSubmit = async () => {
    if (!cloneSourceId || !selectedDormId) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/owner/rules/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceDormId: cloneSourceId,
          targetDormId: selectedDormId,
          replaceExisting: cloneReplace
        })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || '✓ คัดลอกกฎระเบียบสำเร็จ');
        setIsCloneModalOpen(false);
        fetchRules(selectedDormId);
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการคัดลอก');
      }
    } catch (err: any) {
      alert('เกิดข้อผิดพลาด: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filtered Rules
  const filteredRules = rules.filter(r => {
    if (selectedCategory !== 'ทั้งหมด' && r.category !== selectedCategory) return false;
    return true;
  });

  const selectedDormName = dorms.find(d => d.id === selectedDormId)?.dorm_name || 'หอพัก';

  return (
    <div className="flex-1 w-full overflow-y-auto bg-background min-h-0 pb-32 sm:pb-16 -webkit-overflow-scrolling-touch">
      <div className="p-4 sm:p-8 max-w-7xl mx-auto space-y-6 sm:space-y-8 font-sans">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-2 sm:pt-0">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-primary/10 text-primary border border-primary/20 rounded-full text-[11px] font-bold mb-2">
              <span>⚖️</span>
              <span>Dormitory Rules Hub</span>
            </div>
            <h1 className="text-2xl sm:text-4xl font-black text-foreground tracking-tight">กฎและระเบียบหอพัก</h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-1">
              กำหนดข้อบังคับ อัตราค่าปรับ และระเบียบการอยู่อาศัยของลูกหอในแต่ละหอพัก
            </p>
          </div>

          {/* Dorm Selector & Actions */}
          <div className="flex items-center gap-2 sm:gap-3 w-full md:w-auto flex-wrap sm:flex-nowrap">
            {dorms.length > 1 && (
              <select
                value={selectedDormId || ''}
                onChange={(e) => setSelectedDormId(Number(e.target.value))}
                className="flex-1 sm:flex-none min-h-[44px] px-4 py-2.5 bg-card border border-border rounded-2xl text-xs font-bold text-foreground cursor-pointer"
              >
                {dorms.map(d => (
                  <option key={d.id} value={d.id}>{d.dorm_name}</option>
                ))}
              </select>
            )}

            {dorms.length > 1 && (
              <button
                onClick={() => {
                  const otherDorm = dorms.find(d => d.id !== selectedDormId);
                  setCloneSourceId(otherDorm ? otherDorm.id : null);
                  setIsCloneModalOpen(true);
                }}
                className="min-h-[44px] px-4 py-2.5 bg-white/5 hover:bg-white/10 text-foreground border border-border rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <span>📋</span>
                <span>คัดลอกกฎจากหออื่น</span>
              </button>
            )}

            <button
              onClick={() => {
                setForm({ title: '', description: '', category: 'ทั่วไป', fine_amount: 0, is_active: true });
                setIsAddModalOpen(true);
              }}
              className="flex-1 sm:flex-none min-h-[44px] px-5 py-2.5 bg-primary hover:brightness-110 text-white rounded-2xl text-xs font-black transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>+</span>
              <span>เพิ่มกฎใหม่</span>
            </button>
          </div>
        </div>

        {/* Category Pill Filters */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-2xl text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-primary text-white shadow-md'
                  : 'bg-card text-muted-foreground border border-border hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Rules Grid List */}
        {loading ? (
          <div className="p-12 text-center text-muted-foreground text-sm">
            กำลังโหลดกฎระเบียบของ {selectedDormName}...
          </div>
        ) : filteredRules.length === 0 ? (
          <div className="p-12 text-center bg-card rounded-[2.5rem] border border-border space-y-4">
            <span className="text-4xl">📜</span>
            <h3 className="text-lg font-bold text-foreground">ยังไม่มีกฎระเบียบในหมวดหมู่นี้</h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              คุณสามารถกดปุ่ม &quot;เพิ่มกฎใหม่&quot; หรือคัดลอกระเบียบมาตรฐานจากหอพักเดิมเพื่อแสดงให้ลูกหอทราบได้
            </p>
            <button
              onClick={() => {
                setForm({ title: '', description: '', category: selectedCategory === 'ทั้งหมด' ? 'ทั่วไป' : selectedCategory, fine_amount: 0, is_active: true });
                setIsAddModalOpen(true);
              }}
              className="px-5 py-2.5 bg-primary text-white rounded-2xl text-xs font-bold hover:brightness-110 cursor-pointer"
            >
              + เพิ่มกฎระเบียบข้อแรก
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            {filteredRules.map((rule, idx) => (
              <div
                key={rule.id}
                className={`bg-card rounded-[2rem] border p-6 space-y-4 transition-all shadow-lg ${
                  rule.is_active === 1 ? 'border-border' : 'border-rose-500/20 opacity-60 bg-slate-950/40'
                }`}
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-primary font-mono text-xs font-bold">#{idx + 1}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-primary/10 text-primary rounded-full border border-primary/20">
                        {rule.category || 'ทั่วไป'}
                      </span>
                      {Number(rule.fine_amount) > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500/15 text-rose-400 rounded-full border border-rose-500/20">
                          ค่าปรับ ฿{Number(rule.fine_amount).toLocaleString()}
                        </span>
                      )}
                      {rule.is_active === 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-500/20 text-rose-300 rounded-full">
                          ปิดใช้งาน
                        </span>
                      )}
                    </div>
                    <h3 className="text-base sm:text-lg font-bold text-foreground pt-1">{rule.title}</h3>
                  </div>

                  {/* Toggle Active Button */}
                  <button
                    onClick={() => handleToggleActive(rule)}
                    className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold transition-all cursor-pointer shrink-0 ${
                      rule.is_active === 1 ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-white/5 text-muted-foreground border border-white/10'
                    }`}
                    title={rule.is_active === 1 ? 'คลิกเพื่อปิดใช้งาน' : 'คลิกเพื่อเปิดใช้งาน'}
                  >
                    {rule.is_active === 1 ? '✓' : '✕'}
                  </button>
                </div>

                <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                  {rule.description}
                </p>

                <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                  <button
                    onClick={() => {
                      setEditingRule(rule);
                      setForm({
                        title: rule.title,
                        description: rule.description,
                        category: rule.category || 'ทั่วไป',
                        fine_amount: Number(rule.fine_amount) || 0,
                        is_active: rule.is_active === 1
                      });
                    }}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-foreground text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    ✏️ แก้ไข
                  </button>
                  <button
                    onClick={() => handleDeleteRule(rule.id)}
                    className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 text-xs font-bold rounded-xl transition-all cursor-pointer"
                  >
                    🗑️ ลบ
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal: Add Rule */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="max-w-md w-full bg-slate-900 rounded-[2rem] p-6 sm:p-8 border border-primary/30 space-y-5 shadow-2xl my-auto">
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">เพิ่มระเบียบหอพัก</span>
                  <h3 className="text-xl font-black text-foreground">{selectedDormName}</h3>
                </div>
                <button onClick={() => setIsAddModalOpen(false)} className="text-muted-foreground hover:text-white text-2xl p-1">✕</button>
              </div>

              <form onSubmit={handleAddSubmit} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">หมวดหมู่กฎระเบียบ</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white font-bold"
                  >
                    {CATEGORIES.filter(c => c !== 'ทั้งหมด').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">หัวข้อกฎระเบียบ</label>
                  <input
                    type="text"
                    required
                    placeholder="เช่น การนำสัตว์เลี้ยงเข้าพัก, งดส่งเสียงดัง"
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">รายละเอียดข้อบังคับ</label>
                  <textarea
                    rows={3}
                    required
                    placeholder="ระบุเงื่อนไขและข้อปฏิบัติต่างๆ..."
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full p-3 bg-slate-950 border border-border rounded-xl text-white resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">อัตราค่าปรับเมื่อฝ่าฝืน (บาท) - หากไม่มีใส่ 0</label>
                  <input
                    type="number" {...NUMBER_INPUT_PROPS}
                    min="0"
                    step="50"
                    value={form.fine_amount}
                    onChange={(e) => setForm({ ...form, fine_amount: Number(e.target.value) })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white font-mono"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="flex-1 min-h-[44px] py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] min-h-[44px] py-2.5 bg-primary hover:brightness-110 text-white rounded-xl font-black shadow-lg disabled:opacity-50"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกกฎระเบียบ'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Edit Rule */}
        {editingRule && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="max-w-md w-full bg-slate-900 rounded-[2rem] p-6 sm:p-8 border border-white/20 space-y-5 shadow-2xl my-auto">
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">แก้ไขกฎระเบียบ</span>
                  <h3 className="text-xl font-black text-foreground">#{editingRule.id}</h3>
                </div>
                <button onClick={() => setEditingRule(null)} className="text-muted-foreground hover:text-white text-2xl p-1">✕</button>
              </div>

              <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">หมวดหมู่</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white font-bold"
                  >
                    {CATEGORIES.filter(c => c !== 'ทั้งหมด').map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">หัวข้อ</label>
                  <input
                    type="text"
                    required
                    value={form.title}
                    onChange={(e) => setForm({ ...form, title: e.target.value })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">รายละเอียด</label>
                  <textarea
                    rows={3}
                    required
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="w-full p-3 bg-slate-950 border border-border rounded-xl text-white resize-none"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">อัตราค่าปรับ (บาท)</label>
                  <input
                    type="number" {...NUMBER_INPUT_PROPS}
                    min="0"
                    step="50"
                    value={form.fine_amount}
                    onChange={(e) => setForm({ ...form, fine_amount: Number(e.target.value) })}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white font-mono"
                  />
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setEditingRule(null)}
                    className="flex-1 min-h-[44px] py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-[2] min-h-[44px] py-2.5 bg-primary hover:brightness-110 text-white rounded-xl font-black shadow-lg disabled:opacity-50"
                  >
                    {submitting ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal: Clone from Another Dorm */}
        {isCloneModalOpen && (
          <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-200">
            <div className="max-w-md w-full bg-slate-900 rounded-[2rem] p-6 sm:p-8 border border-primary/30 space-y-5 shadow-2xl my-auto">
              <div className="flex justify-between items-start border-b border-border pb-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">คัดลอกกฎระเบียบ (Template)</span>
                  <h3 className="text-lg font-black text-foreground">คัดลอกไปยัง {selectedDormName}</h3>
                </div>
                <button onClick={() => setIsCloneModalOpen(false)} className="text-muted-foreground hover:text-white text-2xl p-1">✕</button>
              </div>

              <div className="space-y-4 text-xs">
                <div className="space-y-1.5">
                  <label className="text-white/80 font-bold uppercase">เลือกหอพักต้นทาง</label>
                  <select
                    value={cloneSourceId || ''}
                    onChange={(e) => setCloneSourceId(Number(e.target.value))}
                    className="w-full min-h-[44px] px-3.5 bg-slate-950 border border-border rounded-xl text-white font-bold"
                  >
                    {dorms.filter(d => d.id !== selectedDormId).map(d => (
                      <option key={d.id} value={d.id}>{d.dorm_name}</option>
                    ))}
                  </select>
                </div>

                <div className="p-3 bg-slate-950 rounded-xl border border-white/10 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={cloneReplace}
                      onChange={(e) => setCloneReplace(e.target.checked)}
                      className="w-4 h-4 rounded accent-primary cursor-pointer"
                    />
                    <span className="text-white font-bold">ลบกฎเดิมของ {selectedDormName} ออกทั้งหมดก่อนคัดลอก</span>
                  </label>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsCloneModalOpen(false)}
                    className="flex-1 min-h-[44px] py-2.5 bg-white/5 hover:bg-white/10 text-white rounded-xl font-bold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="button"
                    onClick={handleCloneSubmit}
                    disabled={submitting || !cloneSourceId}
                    className="flex-[2] min-h-[44px] py-2.5 bg-primary hover:brightness-110 text-white rounded-xl font-black shadow-lg disabled:opacity-50 cursor-pointer"
                  >
                    {submitting ? 'กำลังคัดลอก...' : 'เริ่มคัดลอกกฎระเบียบ'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
