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
    <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-xs space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">จำนวนผู้พักอาศัย (สูงสุด {MAX_OCCUPANTS} คน)</span>
          <span className="text-2xl font-black text-slate-900">{info.occupants} คน</span>
          <span className="text-[11px] text-slate-500 block mt-1">ค่าน้ำคิดต่อคน · มีผลกับบิลที่ออกหลังแก้เท่านั้น</span>
        </div>
        {info.editable && !open && (
          <button onClick={() => { setOpen(true); setError(null); setDone(null); }} className="px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-black text-xs rounded-xl shadow-xs transition-colors cursor-pointer">
            ✏️ แก้จำนวนผู้พัก
          </button>
        )}
      </div>

      {info.warning && (
        <p className="text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">⚠️ มีบิลร่าง {info.draftBills} ใบ — {info.warning}</p>
      )}

      {open && (
        <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนผู้พักใหม่</label>
            <select value={value} onChange={(e) => setValue(Number(e.target.value))} className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 shadow-xs focus:outline-none focus:border-primary">
              {OCCUPANT_CHOICES.map((n) => <option key={n} value={n}>{n} คน</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">เหตุผล (ถ้ามี)</label>
            <input value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} placeholder="เช่น ผู้พักร่วมย้ายเข้า" className="w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-xs text-slate-900 shadow-xs focus:outline-none focus:border-primary" />
          </div>
          {error && <p className="text-xs font-bold text-rose-600">✕ {error}</p>}
          <div className="flex gap-2 pt-1">
            <button onClick={() => setOpen(false)} className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-colors cursor-pointer">ยกเลิก</button>
            <button onClick={save} disabled={saving || value === info.occupants} className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs disabled:opacity-50 transition-colors cursor-pointer">
              {saving ? 'กำลังบันทึก...' : 'บันทึก'}
            </button>
          </div>
        </div>
      )}
      {done && <p className="text-xs font-bold text-emerald-700">✓ {done}</p>}

      {info.history.length > 0 && (
        <div className="space-y-1 pt-2 border-t border-slate-100">
          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">ประวัติการแก้</p>
          {info.history.map((h) => (
            <p key={h.id} className="text-xs text-slate-600">
              {new Date(h.changed_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · {h.old_occupants} → {h.new_occupants} คน · โดย {h.changed_by_name || '-'}{h.reason ? ` · ${h.reason}` : ''}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
