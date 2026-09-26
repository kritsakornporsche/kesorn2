'use client';

import { useState, useEffect } from 'react';

interface Rule {
  id: number;
  dorm_id: number;
  title: string;
  description: string;
  category: string;
  fine_amount: number;
  sort_order: number;
}

export default function DormRulesCard({ dormId }: { dormId?: number }) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRule, setSelectedRule] = useState<Rule | null>(null);

  useEffect(() => {
    const fetchRules = async () => {
      try {
        const url = dormId ? `/api/tenant/rules?dormId=${dormId}` : '/api/tenant/rules';
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && Array.isArray(data.data) && data.data.length > 0) {
          setRules(data.data);
        } else {
          // Fallback defaults if not set in DB
          setRules([
            { id: 1, dorm_id: 1, title: 'การเข้า-ออกอาคาร', description: 'ประตูทางเข้าหลักปิดเวลา 23:00 น. หลังจากนั้นต้องใช้คีย์การ์ดสแกนเท่านั้น', category: 'การเข้า-ออก', fine_amount: 0, sort_order: 1 },
            { id: 2, dorm_id: 1, title: 'การรักษาความสะอาดและสัตว์เลี้ยง', description: 'อนุญาตให้เลี้ยงสัตว์เลี้ยงขนาดเล็กได้ (Pet-Friendly) โดยต้องดูแลไม่ให้ส่งเสียงรบกวนผู้อื่น และรักษาความสะอาดบริเวณทางเดินส่วนกลาง', category: 'สัตว์เลี้ยง', fine_amount: 0, sort_order: 2 },
            { id: 3, dorm_id: 1, title: 'ความปลอดภัยและอัคคีภัย', description: 'ห้ามสูบบุหรี่ภายในห้องพักและพื้นที่ส่วนกลาง ยกเว้นบริเวณที่จัดไว้ให้ภายนอกอาคาร', category: 'ความปลอดภัย', fine_amount: 1000, sort_order: 3 },
            { id: 4, dorm_id: 1, title: 'ผู้มาติดต่อและบุคคลภายนอก', description: 'ไม่อนุญาตให้บุคคลภายนอกพักค้างคืนโดยไม่ได้แจ้งเจ้าหน้าที่ล่วงหน้า', category: 'ทั่วไป', fine_amount: 500, sort_order: 4 },
          ]);
        }
      } catch (err) {
        console.error('Fetch rules error:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRules();
  }, [dormId]);

  return (
    <div className="bg-[#0F172A] rounded-[2.5rem] p-6 sm:p-10 border border-white/10 shadow-inner">
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-3">
          <span className="w-8 h-8 rounded-xl bg-primary text-white flex items-center justify-center text-sm shadow-md">⚖️</span>
          ระเบียบและข้อควรปฏิบัติ
        </h3>
        <span className="text-[11px] font-bold text-muted-foreground bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
          {rules.length} ข้อ
        </span>
      </div>

      <div className="space-y-4 sm:space-y-6">
        {rules.slice(0, 4).map((rule, idx) => (
          <div 
            key={rule.id || idx} 
            onClick={() => setSelectedRule(rule)}
            className="flex gap-3 sm:gap-4 group p-2.5 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer"
          >
            <div className="text-primary font-black text-xs pt-0.5 shrink-0 w-5">
              {idx + 1}.
            </div>
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-xs sm:text-sm font-bold text-white group-hover:text-primary transition-colors">
                  {rule.title}
                </h4>
                {rule.category && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-white/10 text-white/70 rounded-md border border-white/10">
                    {rule.category}
                  </span>
                )}
                {Number(rule.fine_amount) > 0 && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 bg-rose-500/15 text-rose-300 rounded-md border border-rose-500/20">
                    ปรับ ฿{Number(rule.fine_amount).toLocaleString()}
                  </span>
                )}
              </div>
              <p className="text-[11px] sm:text-xs text-muted-foreground leading-relaxed line-clamp-2">
                {rule.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {rules.length > 4 && (
        <button 
          onClick={() => setSelectedRule(rules[0])}
          className="w-full mt-6 sm:mt-8 py-3 border border-primary/30 text-primary rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-primary hover:text-white transition-all cursor-pointer"
        >
          ดูระเบียบทั้งหมด ({rules.length} ข้อ)
        </button>
      )}

      {/* Full Rule Detail Modal */}
      {selectedRule && (
        <div 
          onClick={() => setSelectedRule(null)}
          className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 cursor-pointer animate-in fade-in duration-150"
        >
          <div 
            onClick={(e) => e.stopPropagation()}
            className="max-w-md w-full bg-slate-900 rounded-[2rem] p-6 border border-white/20 space-y-4 cursor-default shadow-2xl"
          >
            <div className="flex justify-between items-start border-b border-white/10 pb-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-primary">{selectedRule.category || 'กฎระเบียบ'}</span>
                <h3 className="text-base sm:text-lg font-black text-white">{selectedRule.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedRule(null)} 
                className="text-muted-foreground hover:text-white text-xl p-1 font-bold"
              >
                ✕
              </button>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {selectedRule.description}
            </p>
            {Number(selectedRule.fine_amount) > 0 && (
              <div className="p-3 bg-rose-500/10 rounded-xl border border-rose-500/20 text-xs text-rose-300 font-bold flex items-center justify-between">
                <span>อัตราค่าปรับหากฝ่าฝืน:</span>
                <span className="text-sm font-black text-rose-400">฿{Number(selectedRule.fine_amount).toLocaleString()}</span>
              </div>
            )}
            <button
              onClick={() => setSelectedRule(null)}
              className="w-full py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold transition-all"
            >
              รับทราบ
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
