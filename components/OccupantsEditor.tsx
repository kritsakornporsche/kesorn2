'use client';

// Owner / manager: number of occupants of a contract during the lease (commit 27, /api/owner/contracts/[id]/occupants).
// Shows the number and its change history; "แก้จำนวนผู้พัก" opens a form (1–MAX_OCCUPANTS + reason). Draft bills keep
// the number they were made with — the page says so before and after saving.

import { useEffect, useState } from 'react';
import { MAX_OCCUPANTS, OCCUPANT_CHOICES } from '@/lib/occupants';

type Change = { id: number; old_occupants: number; new_occupants: number; changed_by_name: string | null; changed_at: string; reason: string | null };
type Info = { occupants: number; max: number; editable: boolean; draftBills: number; warning: string | null; history: Change[] };

export default function OccupantsEditor({ contractId, onChanged }: { contractId: number; onChanged?: (n: number) => void }) {
  const [info, setInfo] = useState<Info | null>(null);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(1);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const load = async () => {
    const res = await fetch(`/api/owner/contracts/${contractId}/occupants`);
    const json = await res.json().catch(() => null);
    if (json?.success) { setInfo(json.data); setValue(json.data.occupants); }
  };
  useEffect(() => { load(); }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    setSaving(true); setError(null); setDone(null);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/occupants`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ occupants: value, reason }),
      });
      const json = await res.json().catch(() => null);
      if (!json?.success) { setError(json?.message || 'บันทึกไม่สำเร็จ'); return; }
      setDone(`เปลี่ยนจาก ${json.data.oldOccupants} เป็น ${json.data.newOccupants} คนแล้ว · แจ้งผู้เช่าแล้ว${json.data.warning ? ` · ${json.data.warning}` : ''}`);
      setOpen(false); setReason('');
      onChanged?.(json.data.newOccupants);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!info) return null;
  return (
    <div className="bg-slate-900/60 p-6 rounded-3xl border border-white/10 space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[10px] text-white/40 font-bold uppercase tracking-wider block mb-1">จำนวนผู้พักอาศัย (สูงสุด {MAX_OCCUPANTS} คน)</span>
          <span className="text-2xl font-black text-white">{info.occupants} คน</span>
          <span className="text-[11px] text-white/50 block mt-1">ค่าน้ำคิดต่อคน · มีผลกับบิลที่ออกหลังแก้เท่านั้น</span>
        </div>
        {info.editable && !open && (
          <button onClick={() => { setOpen(true); setError(null); setDone(null); }} className="px-4 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 font-black text-xs rounded-xl">
            ✏️ แก้จำนวนผู้พัก
          </button>
        )}
      </div>

      {info.warning && (
        <p className="text-xs font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-xl px-3 py-2">⚠️ มีบิลร่าง {info.draftBills} ใบ — {info.warning}</p>
      )}

      {open && (
        <div className="space-y-2 bg-slate-950/60 p-4 rounded-2xl border border-white/10">
          <label className="block text-xs font-bold text-slate-300">จำนวนผู้พักใหม่</label>
          <select value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white">
            {OCCUPANT_CHOICES.map((n) => <option key={n} value={n}>{n} คน</option>)}
          </select>
          <label className="block text-xs font-bold text-slate-300">เหตุผล (ถ้ามี)</label>
          <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ผู้พักร่วมย้ายเข้า" className="w-full bg-slate-900 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white" />
          {error && <p className="text-xs font-bold text-rose-400">✕ {error}</p>}
          <div className="flex gap-2">
            <button onClick={() => setOpen(false)} className="flex-1 py-2.5 bg-white/10 text-white rounded-xl text-xs font-bold">ยกเลิก</button>
            <button onClick={save} disabled={saving || value === info.occupants} className="flex-1 py-2.5 bg-emerald-500 text-slate-950 rounded-xl text-xs font-black disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
      {done && <p className="text-xs font-bold text-emerald-400">✓ {done}</p>}

      {info.history.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] text-white/40 font-bold uppercase tracking-wider">ประวัติการแก้</p>
          {info.history.map((h) => (
            <p key={h.id} className="text-xs text-white/70">
              {new Date(h.changed_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · {h.old_occupants} → {h.new_occupants} คน · โดย {h.changed_by_name || '-'}{h.reason ? ` · ${h.reason}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
