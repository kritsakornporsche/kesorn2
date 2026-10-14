'use client';

// Shared pieces of the repair / cleaning board screens (lib/maintenance.ts): job type, state badge, photos.

import { useState } from 'react';
import { PHOTOS_TOTAL_MAX_BYTES, preparePhoto } from '@/lib/inspection-photo-check';

export type Kind = 'repair' | 'cleaning';
export type State = 'Requested' | 'Assigned' | 'InProgress' | 'Done' | 'Closed' | 'Cancelled' | 'Rejected';
export type ChargeReason = 'tenant_damage' | 'wear_and_tear' | 'service';

export interface Job {
  id: number;
  legacy: boolean;
  kind: Kind | null;
  state: State | null;
  status_text: string;
  legacy_status: string | null;
  issue_type: string | null;
  description: string | null;
  room_number: string | null;
  contract_id: number | null;
  move_out_settlement_id: number | null;
  requested_at: string | null;
  tenant_name: string | null;
  tenant_phone: string | null;
  assigned_to: number | null;
  assignee_name: string | null;
  assigned_at: string | null;
  started_at: string | null;
  done_at: string | null;
  done_note: string | null;
  closed_reason: string | null;
  photos: { url: string; stage: 'report' | 'done' }[];
  charge: null | {
    proposed: number | null; proposed_note: string | null;
    decided: boolean; amount: number | null; reason: ChargeReason | null; reason_text: string | null; bill_id: number | null; to_settlement: boolean;
  };
}

export const KIND_TEXT: Record<Kind, string> = { repair: 'งานซ่อม', cleaning: 'งานทำความสะอาด' };
export const CHARGE_REASON_TEXT: Record<ChargeReason, string> = {
  tenant_damage: 'ผู้เช่าทำเสียหาย (บิลค่าเสียหาย)', wear_and_tear: 'เสื่อมตามสภาพ (ไม่เก็บเงิน)', service: 'ค่าบริการ (บิลค่าบริการ)',
};
const STATE_STYLE: Record<State, string> = {
  Requested: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
  Assigned: 'bg-sky-500/10 border-sky-500/40 text-sky-300',
  InProgress: 'bg-blue-500/10 border-blue-500/40 text-blue-300',
  Done: 'bg-orange-500/10 border-orange-500/40 text-orange-300',
  Closed: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
  Cancelled: 'bg-slate-500/10 border-slate-500/40 text-slate-300',
  Rejected: 'bg-rose-500/10 border-rose-500/40 text-rose-300',
};

export const baht = (n: number | null | undefined) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const thaiDateTime = (v: string | null | undefined) => (v ? new Date(v).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' }) : '-');

export function StateBadge({ job }: { job: Job }) {
  const style = job.state ? STATE_STYLE[job.state] : 'bg-slate-500/10 border-slate-500/40 text-slate-300';
  return <span className={`px-3 py-1 rounded-full border text-[11px] font-black ${style}`}>{job.status_text}</span>;
}

/** Photos of a job (report / done), opened in a preview. */
export function PhotoStrip({ photos }: { photos: Job['photos'] }) {
  const [preview, setPreview] = useState<string | null>(null);
  if (photos.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => (
        <button key={p.url} onClick={() => setPreview(p.url)} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/20">
          <img src={p.url} alt={p.stage === 'done' ? 'รูปหลังทำงาน' : 'รูปที่แจ้ง'} className="w-full h-full object-cover" />
          <span className="absolute bottom-0 inset-x-0 bg-black/60 text-[9px] text-white text-center">{p.stage === 'done' ? 'หลังทำ' : 'ที่แจ้ง'}</span>
        </button>
      ))}
      {preview && (
        <div className="fixed inset-0 z-[210] bg-black/90 flex items-center justify-center p-4" onClick={() => setPreview(null)}>
          <img src={preview} alt="รูปงาน" className="max-h-[85vh] w-auto object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}

export const MAX_PHOTOS = 5;

/** Pick up to 5 photos; each is checked by content and resized in the browser. Errors are shown in red. */
export function PhotoPicker({ value, onChange }: { value: { dataUrl: string; bytes: number }[]; onChange: (v: { dataUrl: string; bytes: number }[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const pick = async (files: FileList | null) => {
    setError(null);
    if (!files) return;
    const next = [...value];
    for (const file of Array.from(files)) {
      if (next.length >= MAX_PHOTOS) {
        setError(`แนบรูปได้ไม่เกิน ${MAX_PHOTOS} รูป`);
        break;
      }
      const prepared = await preparePhoto(file);
      if (!prepared.ok) {
        setError(`${file.name}: ${prepared.message} — ไม่ได้แนบไฟล์นี้`);
        continue;
      }
      next.push({ dataUrl: prepared.dataUrl, bytes: prepared.bytes });
    }
    if (next.reduce((s, p) => s + p.bytes, 0) > PHOTOS_TOTAL_MAX_BYTES) {
      setError('รูปรวมกันเกิน 20MB — ลดจำนวนรูป');
      return;
    }
    onChange(next);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {value.map((p, i) => (
          <div key={i} className="relative w-14 h-14 rounded-lg overflow-hidden border border-white/20">
            <img src={p.dataUrl} alt={`รูปที่ ${i + 1}`} className="w-full h-full object-cover" />
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="absolute top-0 right-0 bg-black/70 text-white text-[10px] px-1">✕</button>
          </div>
        ))}
        {value.length < MAX_PHOTOS && (
          <label className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl border border-white/10 cursor-pointer">
            📷 แนบรูป ({value.length}/{MAX_PHOTOS})
            <input type="file" accept="image/jpeg,image/png" multiple className="hidden" onChange={(e) => { const f = e.target.files; pick(f); e.target.value = ''; }} />
          </label>
        )}
      </div>
      {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
    </div>
  );
}

/** POST helper with the server's message on failure. */
export async function postJson(url: string, body: any, method = 'POST'): Promise<{ ok: boolean; message: string; data?: any }> {
  try {
    const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const d = await res.json().catch(() => ({ success: false, message: res.status === 413 ? 'ไฟล์รวมกันใหญ่เกินไป' : 'ทำรายการไม่สำเร็จ' }));
    return { ok: !!d.success, message: d.message || (d.success ? 'บันทึกแล้ว' : 'ทำรายการไม่สำเร็จ'), data: d.data };
  } catch (e: any) {
    return { ok: false, message: `ทำรายการไม่สำเร็จ: ${e?.message || ''}` };
  }
}
