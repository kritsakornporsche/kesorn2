'use client';

// Owner/manager: room inspection (lib/inspections.ts) before move-in, or at move-out (kind 'move_out', compared item
// by item with the move-in result). Items start from the room's inventory, a default list, or the move-in items; each
// item has a condition, a note and one photo. Editable until the tenant acknowledges it.

import { useEffect, useState } from 'react';
import { PHOTOS_TOTAL_MAX_BYTES, preparePhoto } from '@/lib/inspection-photo-check';

type Condition = 'Good' | 'Damaged' | 'Missing';
export type InspectionKind = 'move_in' | 'move_out';
export type InspectionStatus = 'none' | 'pending_ack' | 'acknowledged';

export const INSPECTION_STATUS_TEXT: Record<InspectionStatus, string> = {
  none: 'ยังไม่ตรวจห้อง',
  pending_ack: 'รอผู้เช่ารับทราบ',
  acknowledged: 'รับทราบแล้ว',
};

export const CONDITION_TEXT: Record<Condition, string> = { Good: 'ปกติ', Damaged: 'ชำรุด', Missing: 'สูญหาย' };
export const KIND_TITLE: Record<InspectionKind, string> = { move_in: 'ตรวจห้องก่อนเข้าอยู่', move_out: 'ตรวจห้องตอนย้ายออก' };

type MoveInItem = { condition_status: Condition; note: string | null; photo_url: string | null };
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface Row {
  key: number;
  name: string;
  condition: Condition;
  note: string;
  /** photo already saved on the inspection */
  photoFile: string | null;
  photoUrl: string | null;
  /** new photo, resized, as a data URL */
  newPhoto: string | null;
  newBytes: number;
  error: string | null;
}

let nextKey = 1;
const blankRow = (name = '', note: string | null = null): Row => ({
  key: nextKey++, name, condition: 'Good', note: note || '', photoFile: null, photoUrl: null, newPhoto: null, newBytes: 0, error: null,
});

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

export function InspectionStatusBadge({ status }: { status: InspectionStatus }) {
  const style = status === 'acknowledged'
    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
    : status === 'pending_ack'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300'
      : 'bg-slate-500/10 border-slate-500/30 text-slate-300';
  return (
    <span className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold ${style}`}>
      {status === 'acknowledged' ? '✓' : status === 'pending_ack' ? '⏳' : '○'} {INSPECTION_STATUS_TEXT[status]}
    </span>
  );
}

export default function InspectionModal({ contractId, kind = 'move_in', onClose, onSaved }: {
  contractId: number;
  kind?: InspectionKind;
  onClose: () => void;
  /** called with the status after loading and after saving */
  onSaved?: (status: InspectionStatus) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [info, setInfo] = useState<{ room_number?: string; tenant_name?: string } | null>(null);
  const [status, setStatus] = useState<InspectionStatus>('none');
  const [editable, setEditable] = useState(false);
  const [maxItems, setMaxItems] = useState(30);
  const [ackAt, setAckAt] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Move-out: the move-in result by item name, to compare
  const [moveIn, setMoveIn] = useState<{ name: string; item: MoveInItem }[] | null>(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/inspection?kind=${kind}`);
      const data = await res.json();
      if (!data.success) {
        setLoadError(data.message || 'โหลดผลตรวจห้องไม่สำเร็จ');
        return;
      }
      setInfo(data.contract);
      setStatus(data.status);
      onSaved?.(data.status);
      setEditable(data.editable);
      setMaxItems(data.max_items || 30);
      setAckAt(data.inspection?.tenant_ack_at || null);
      setNote(data.inspection?.note || '');
      setMoveIn(data.move_in ? data.move_in.items.map((it: any) => ({ name: it.item_name, item: it })) : null);
      if (data.inspection) {
        setRows(data.inspection.items.map((it: any) => ({
          ...blankRow(it.item_name, it.note),
          condition: it.condition_status,
          photoFile: it.photo_file,
          photoUrl: it.photo_url,
        })));
      } else {
        setRows((data.defaults || []).map((d: any) => blankRow(d.name, d.note)));
      }
    } catch {
      setLoadError('โหลดผลตรวจห้องไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [contractId, kind]); // eslint-disable-line react-hooks/exhaustive-deps

  const moveInOf = (name: string) => moveIn?.find((m) => sameName(m.name, name))?.item || null;

  const update = (key: number, change: Partial<Row>) => setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  const pickPhoto = async (row: Row, file: File | undefined) => {
    if (!file) return;
    const prepared = await preparePhoto(file);
    if (!prepared.ok) {
      // Only this file is refused: the row keeps its previous photo (if any) and other rows are untouched
      update(row.key, { error: `รูปของ "${row.name || 'รายการนี้'}": ${prepared.message} — ไม่ได้แนบไฟล์นี้` });
      return;
    }
    update(row.key, { newPhoto: prepared.dataUrl, newBytes: prepared.bytes, error: null });
  };

  const save = async () => {
    setError(null);
    // A row left completely empty (added but not filled in) is skipped; a row with something in it needs a name
    const isBlank = (r: Row) => !r.name.trim() && !r.note.trim() && !r.newPhoto && !r.photoFile && r.condition === 'Good';
    const unnamed = rows.filter((r) => !r.name.trim() && !isBlank(r));
    if (unnamed.length > 0) {
      setRows((list) => list.map((r) => (unnamed.some((u) => u.key === r.key) ? { ...r, error: 'กรุณากรอกชื่อรายการ' } : r)));
      setError('กรุณากรอกชื่อรายการที่มีรูป/หมายเหตุ/สภาพ (รายการที่ว่างทั้งหมดจะถูกข้าม)');
      return;
    }
    const toSave = rows.filter((r) => !isBlank(r));
    if (toSave.length === 0) {
      setError('กรุณาเพิ่มรายการตรวจอย่างน้อย 1 รายการ');
      return;
    }
    const total = toSave.reduce((sum, r) => sum + (r.newPhoto ? r.newBytes : 0), 0);
    if (total > PHOTOS_TOTAL_MAX_BYTES) {
      const big = toSave.filter((r) => r.newPhoto).sort((a, b) => b.newBytes - a.newBytes).slice(0, 3)
        .map((r) => `"${r.name || '-'}" (${mb(r.newBytes)})`).join(', ');
      setError(`รูปใหม่รวมกัน ${mb(total)} เกิน 20MB ต่อการบันทึกหนึ่งครั้ง — รูปที่ใหญ่ที่สุด: ${big} · บันทึกทีละส่วน หรือลดจำนวนรูป`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/inspection`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind,
          note,
          items: toSave.map((r) => ({
            name: r.name,
            condition: r.condition,
            note: r.note,
            ...(r.newPhoto ? { photo: r.newPhoto } : r.photoFile ? { keepPhoto: r.photoFile } : {}),
          })),
        }),
      });
      const data = await res.json().catch(() => ({ success: false, message: res.status === 413 ? 'ไฟล์รวมกันใหญ่เกินไป' : 'บันทึกไม่สำเร็จ' }));
      if (!data.success) {
        setError(data.message || 'บันทึกผลตรวจห้องไม่สำเร็จ');
        if (typeof data.item === 'number' && toSave[data.item]) update(toSave[data.item].key, { error: data.message });
        return;
      }
      await load();
    } catch (e: any) {
      setError(`บันทึกผลตรวจห้องไม่สำเร็จ: ${e?.message || ''}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="max-w-3xl w-full bg-slate-900 rounded-3xl p-6 border border-white/20 space-y-4 max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex justify-between items-start gap-3 pb-2 border-b border-white/10">
          <div>
            <p className="font-black text-white text-base">🔍 {KIND_TITLE[kind]} {info?.room_number ? `· ห้อง ${info.room_number}` : ''}</p>
            {info?.tenant_name && <p className="text-xs text-slate-400">ผู้เช่า: {info.tenant_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <InspectionStatusBadge status={status} />
            <button onClick={onClose} className="text-white/50 hover:text-white text-lg font-bold">✕</button>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-slate-400 py-8 text-center">กำลังโหลด...</p>
        ) : loadError ? (
          <p className="text-sm text-rose-400 font-bold py-8 text-center">✕ {loadError}</p>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-3 pr-1">
            {status === 'acknowledged' && (
              <p className="text-xs text-emerald-400 font-bold">
                ผู้เช่ารับทราบแล้ว{ackAt ? ` เมื่อ ${new Date(ackAt).toLocaleString('th-TH')}` : ''} — แก้ไขไม่ได้
              </p>
            )}
            {!editable && status !== 'acknowledged' && (
              <p className="text-xs text-rose-400 font-bold">
                {kind === 'move_out' ? 'ตรวจห้องตอนย้ายออกได้ตั้งแต่แจ้งย้ายออกจนก่อนสรุปเงินประกันเท่านั้น' : 'สัญญานี้อยู่ในสถานะที่ตรวจห้องไม่ได้'}
              </p>
            )}
            {kind === 'move_out' && moveIn === null && (
              <p className="text-xs text-slate-400">ไม่มีผลตรวจห้องตอนเข้าอยู่ให้เทียบ</p>
            )}

            {rows.map((row, index) => (
              <div key={row.key} className={`p-3 rounded-2xl border space-y-2 ${row.error ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/10 bg-slate-950/60'}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11px] text-slate-500 w-5">{index + 1}.</span>
                  <input
                    value={row.name}
                    disabled={!editable}
                    onChange={(e) => update(row.key, { name: e.target.value, error: null })}
                    placeholder="ชื่อรายการ"
                    className="flex-1 min-w-[140px] bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  />
                  <select
                    value={row.condition}
                    disabled={!editable}
                    onChange={(e) => update(row.key, { condition: e.target.value as Condition })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  >
                    {(Object.keys(CONDITION_TEXT) as Condition[]).map((c) => <option key={c} value={c}>{CONDITION_TEXT[c]}</option>)}
                  </select>
                  {editable && (
                    <button
                      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                      className="px-2 py-1 text-rose-300 hover:text-rose-200 text-xs font-bold"
                      title="ลบรายการ"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7">
                  <input
                    value={row.note}
                    disabled={!editable}
                    onChange={(e) => update(row.key, { note: e.target.value })}
                    placeholder="หมายเหตุ (ถ้ามี)"
                    className="flex-1 min-w-[140px] bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-70"
                  />
                  {(row.newPhoto || row.photoUrl) && (
                    <button onClick={() => setPreview(row.newPhoto || row.photoUrl)} className="w-12 h-12 rounded-lg overflow-hidden border border-white/20 shrink-0">
                      <img src={row.newPhoto || row.photoUrl || ''} alt={row.name} className="w-full h-full object-cover" />
                    </button>
                  )}
                  {editable && (
                    <label className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl border border-white/10 cursor-pointer">
                      📷 {row.newPhoto || row.photoUrl ? 'เปลี่ยนรูป' : 'ถ่าย/เลือกรูป'}
                      <input
                        type="file"
                        accept="image/jpeg,image/png"
                        className="hidden"
                        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; pickPhoto(row, f); }}
                      />
                    </label>
                  )}
                  {editable && (row.newPhoto || row.photoFile) && (
                    <button
                      onClick={() => update(row.key, { newPhoto: null, newBytes: 0, photoFile: null, photoUrl: null })}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >
                      ลบรูป
                    </button>
                  )}
                </div>
                {kind === 'move_out' && moveIn && (() => {
                  const before = moveInOf(row.name);
                  if (!before) return row.name.trim() ? <p className="pl-7 text-[11px] text-slate-500">ตอนเข้าอยู่: ไม่มีรายการนี้</p> : null;
                  const changed = before.condition_status !== row.condition;
                  return (
                    <div className={`pl-7 flex items-center gap-2 text-[11px] ${changed ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                      <span>ตอนเข้าอยู่: {CONDITION_TEXT[before.condition_status]}{before.note ? ` · ${before.note}` : ''}{changed ? ' → เปลี่ยนไป' : ''}</span>
                      {before.photo_url && (
                        <button onClick={() => setPreview(before.photo_url)} className="w-8 h-8 rounded overflow-hidden border border-white/20 shrink-0">
                          <img src={before.photo_url} alt={`${row.name} ตอนเข้าอยู่`} className="w-full h-full object-cover" />
                        </button>
                      )}
                    </div>
                  );
                })()}
                {row.error && <p className="pl-7 text-xs text-rose-400 font-bold">✕ {row.error}</p>}
              </div>
            ))}

            {editable && (
              <button
                onClick={() => {
                  if (rows.length >= maxItems) {
                    setError(`รายการตรวจได้ไม่เกิน ${maxItems} รายการ`);
                    return;
                  }
                  setRows((list) => [...list, blankRow()]);
                }}
                className="w-full py-2 border border-dashed border-white/20 hover:border-white/40 text-white/70 text-xs font-bold rounded-xl"
              >
                + เพิ่มรายการ ({rows.length}/{maxItems})
              </button>
            )}

            <textarea
              value={note}
              disabled={!editable}
              onChange={(e) => setNote(e.target.value)}
              placeholder="หมายเหตุรวม (ถ้ามี)"
              rows={2}
              className="w-full bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs text-white disabled:opacity-70"
            />
          </div>
        )}

        {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-3 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold">ปิด</button>
          {editable && !loading && !loadError && (
            <button
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-xl text-xs font-black disabled:opacity-50"
            >
              {saving ? 'กำลังบันทึก...' : status === 'none' ? 'บันทึกผลตรวจห้อง' : 'บันทึกการแก้ไข'}
            </button>
          )}
        </div>
      </div>

      {preview && (
        <div className="fixed inset-0 z-[210] bg-black/90 flex items-center justify-center p-4" onClick={(e) => { e.stopPropagation(); setPreview(null); }}>
          <img src={preview} alt="รูปตรวจห้อง" className="max-h-[85vh] w-auto object-contain rounded-xl" />
        </div>
      )}
    </div>
  );
}

/** Status badge + "ตรวจห้องก่อนเข้าอยู่" / "ตรวจห้องตอนย้ายออก" button (bookings, contract and move-out pages). */
export function InspectionButton({ contractId, initialStatus, kind = 'move_in' }: { contractId: number; initialStatus?: InspectionStatus; kind?: InspectionKind }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<InspectionStatus | null>(initialStatus ?? null);

  useEffect(() => {
    if (initialStatus) return;
    fetch(`/api/owner/contracts/${contractId}/inspection?kind=${kind}`)
      .then((r) => r.json())
      .then((d) => { if (d.success) setStatus(d.status); })
      .catch(() => {});
  }, [contractId, initialStatus, kind]);

  return (
    <>
      {status && <InspectionStatusBadge status={status} />}
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 bg-sky-500/20 hover:bg-sky-500/30 text-sky-200 border border-sky-500/40 font-black text-xs rounded-xl"
      >
        🔍 {KIND_TITLE[kind]}
      </button>
      {open && (
        <InspectionModal
          contractId={contractId}
          kind={kind}
          onClose={() => setOpen(false)}
          onSaved={(s) => setStatus(s)}
        />
      )}
    </>
  );
}
