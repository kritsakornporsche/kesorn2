'use client';

// Tenant: a room inspection of their contract (move-in, or move-out compared with move-in), with photos, and the
// "รับทราบผลตรวจห้อง" button (lib/inspections.ts). Not shown until the owner/manager has recorded the inspection.

import { useEffect, useState } from 'react';

type Condition = 'Good' | 'Damaged' | 'Missing';
const CONDITION_TEXT: Record<Condition, string> = { Good: 'ปกติ', Damaged: 'ชำรุด', Missing: 'สูญหาย' };
const CONDITION_STYLE: Record<Condition, string> = {
  Good: 'text-emerald-400',
  Damaged: 'text-amber-300',
  Missing: 'text-rose-400',
};

interface Inspection {
  status: 'pending_ack' | 'acknowledged';
  status_text: string;
  inspected_at: string;
  inspected_by_name: string | null;
  note: string | null;
  tenant_ack_at: string | null;
  items: { id: number; item_name: string; condition_status: Condition; note: string | null; photo_url: string | null }[];
}

export default function TenantInspectionCard({ contractId, kind = 'move_in' }: { contractId: number; kind?: 'move_in' | 'move_out' }) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [moveIn, setMoveIn] = useState<Inspection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/tenant/inspection?contractId=${contractId}&kind=${kind}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setInspection(d.inspection); setMoveIn(d.move_in || null); }
        else setLoadError(d.message || 'โหลดผลตรวจห้องไม่สำเร็จ');
      })
      .catch(() => setLoadError('โหลดผลตรวจห้องไม่สำเร็จ'));
  }, [contractId, kind]);

  const acknowledge = async () => {
    setError(null);
    if (!confirmed) {
      setError('กรุณาติ๊กยืนยันว่าได้ตรวจดูสภาพห้องและทรัพย์สินแล้ว ก่อนกดรับทราบ');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/tenant/inspection/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, kind }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'บันทึกการรับทราบไม่สำเร็จ');
        return;
      }
      setInspection(data.inspection);
    } catch {
      setError('บันทึกการรับทราบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSending(false);
    }
  };

  if (loadError) return <p className="text-xs text-rose-400 font-bold">✕ {loadError}</p>;
  if (!inspection) return null;
  const acknowledged = inspection.status === 'acknowledged';

  return (
    <div className="p-8 bg-white/5 rounded-3xl border border-border space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-black text-white">🔍 {kind === 'move_out' ? 'ผลตรวจสภาพห้องตอนย้ายออก' : 'ผลตรวจสภาพห้องก่อนเข้าอยู่'}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            ตรวจเมื่อ {new Date(inspection.inspected_at).toLocaleString('th-TH')}
            {inspection.inspected_by_name ? ` · โดย ${inspection.inspected_by_name}` : ''}
          </p>
        </div>
        <span className={`px-4 py-1.5 rounded-full text-xs font-bold border self-start sm:self-auto ${
          acknowledged ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-amber-500/10 border-amber-500/30 text-amber-300'
        }`}>
          {acknowledged ? '✓' : '⏳'} {inspection.status_text}
        </span>
      </div>

      <div className="divide-y divide-white/5 rounded-2xl border border-white/10 overflow-hidden">
        {inspection.items.map((it, i) => (
          <div key={it.id} className="flex items-center gap-3 p-3 bg-black/20">
            <span className="text-[11px] text-muted-foreground w-5">{i + 1}.</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white">{it.item_name}</p>
              {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
              {kind === 'move_out' && moveIn && (() => {
                const before = moveIn.items.find((m) => m.item_name.trim().toLowerCase() === it.item_name.trim().toLowerCase());
                if (!before) return <p className="text-[11px] text-muted-foreground">ตอนเข้าอยู่: ไม่มีรายการนี้</p>;
                const changed = before.condition_status !== it.condition_status;
                return (
                  <p className={`text-[11px] ${changed ? 'text-amber-300 font-bold' : 'text-muted-foreground'}`}>
                    ตอนเข้าอยู่: {CONDITION_TEXT[before.condition_status]}{changed ? ' → เปลี่ยนไป' : ''}
                  </p>
                );
              })()}
            </div>
            <span className={`text-xs font-bold ${CONDITION_STYLE[it.condition_status]}`}>{CONDITION_TEXT[it.condition_status]}</span>
            {it.photo_url ? (
              <button onClick={() => setPreview(it.photo_url)} className="w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0">
                <img src={it.photo_url} alt={it.item_name} className="w-full h-full object-cover" />
              </button>
            ) : (
              <span className="w-12 text-center text-[10px] text-muted-foreground shrink-0">ไม่มีรูป</span>
            )}
          </div>
        ))}
      </div>
      {inspection.note && <p className="text-xs text-muted-foreground">หมายเหตุ: {inspection.note}</p>}

      {acknowledged ? (
        <p className="text-sm text-emerald-400 font-bold">
          ✓ คุณรับทราบผลตรวจห้องแล้ว{inspection.tenant_ack_at ? ` เมื่อ ${new Date(inspection.tenant_ack_at).toLocaleString('th-TH')}` : ''}
        </p>
      ) : (
        <div className="space-y-3">
          <label className="flex items-start gap-3 text-sm text-white cursor-pointer">
            <input type="checkbox" checked={confirmed} onChange={(e) => { setConfirmed(e.target.checked); setError(null); }} className="mt-1" />
            <span>ข้าพเจ้าได้ตรวจดูสภาพห้องและทรัพย์สินตามรายการและรูปถ่ายข้างต้นแล้ว</span>
          </label>
          {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
          <button
            onClick={acknowledge}
            disabled={sending}
            className="w-full sm:w-auto px-8 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-sm disabled:opacity-50"
          >
            {sending ? 'กำลังบันทึก...' : '✓ รับทราบผลตรวจห้อง'}
          </button>
          <p className="text-[11px] text-muted-foreground">หากสภาพไม่ตรงกับรายการ กรุณาแจ้งเจ้าของหอพักก่อนกดรับทราบ (รับทราบแล้วแก้ไขไม่ได้)</p>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4 cursor-pointer" onClick={() => setPreview(null)}>
          <img src={preview} alt="รูปตรวจห้อง" className="max-h-[85vh] w-auto object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}
