'use client';

// Owner/manager: room inspection (lib/inspections.ts) before move-in, or at move-out (kind 'move_out', compared item
// by item with the move-in result). Items start from the dorm's item list for the room type (lib/room-items.ts) or the
// move-in items; each item has a condition, a note and one photo, countable items a quantity (commit 26). Editable until
// the tenant acknowledges it.

import { useEffect, useState } from 'react';
import { PHOTOS_TOTAL_MAX_BYTES, preparePhoto } from '@/lib/inspection-photo-check';
import { QUANTITY_MAX, isCountableName, quantityMin } from '@/lib/room-items';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

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

type MoveInItem = { condition_status: Condition; quantity: number | null; note: string | null; photo_url: string | null };
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

interface Row {
  key: number;
  name: string;
  condition: Condition;
  /** countable item (keys, remote): quantity as typed ('' = not entered) */
  countable: boolean;
  quantity: string;
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
const blankRow = (name = '', note: string | null = null, countable = false): Row => ({
  key: nextKey++, name, condition: 'Good', countable, quantity: '', note: note || '', photoFile: null, photoUrl: null, newPhoto: null, newBytes: 0, error: null,
});
/** A row is counted when it came counted, or its name is one of the list's countable items */
const counted = (r: Row) => r.countable || isCountableName(r.name);

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
  // commit 28-3: acknowledged on paper (recorded by staff — who) · why it cannot be edited yet
  const [ackPaperBy, setAckPaperBy] = useState<string | null>(null);
  const [blockedReason, setBlockedReason] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  // Move-out: the move-in result by item name, to compare
  const [moveIn, setMoveIn] = useState<{ name: string; item: MoveInItem }[] | null>(null);

  /** Staff record that the tenant signed the printed inspection record (who / when kept on the server). */
  const recordPaperAck = async () => {
    if (!confirm('ยืนยันว่าผู้เช่าลงชื่อรับทราบในใบตรวจสภาพห้องที่พิมพ์แล้ว? ระบบจะบันทึกว่าคุณเป็นผู้บันทึก และผลตรวจจะแก้ไม่ได้อีก')) return;
    setRecording(true);
    setError(null);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/inspection`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'ack_paper' }),
      });
      const data = await res.json().catch(() => ({ success: false, message: `บันทึกไม่สำเร็จ (HTTP ${res.status})` }));
      if (!data.success) return setError(data.message || 'บันทึกการรับทราบไม่สำเร็จ');
      await load();
    } catch (e: any) {
      setError(`บันทึกไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (${e?.message || 'network'})`);
    } finally {
      setRecording(false);
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/inspection?kind=${kind}`);
      const data = await res.json().catch(() => ({ success: false, message: `โหลดผลตรวจห้องไม่สำเร็จ: เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status})` }));
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
      setAckPaperBy(data.inspection?.ack_on_paper ? (data.inspection.ack_paper_by_name || 'เจ้าหน้าที่') : null);
      setBlockedReason(data.blocked_reason || null);
      setNote(data.inspection?.note || '');
      setMoveIn(data.move_in ? data.move_in.items.map((it: any) => ({ name: it.item_name, item: it })) : null);
      if (data.inspection) {
        setRows(data.inspection.items.map((it: any) => ({
          ...blankRow(it.item_name, it.note, it.quantity !== null && it.quantity !== undefined),
          quantity: it.quantity === null || it.quantity === undefined ? '' : String(it.quantity),
          condition: it.condition_status,
          photoFile: it.photo_file,
          photoUrl: it.photo_url,
        })));
      } else {
        setRows((data.defaults || []).map((d: any) => blankRow(d.name, d.note, !!d.countable)));
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
    const isBlank = (r: Row) => !r.name.trim() && !r.note.trim() && !r.quantity.trim() && !r.newPhoto && !r.photoFile && r.condition === 'Good';
    const unnamed = rows.filter((r) => !r.name.trim() && !isBlank(r));
    if (unnamed.length > 0) {
      setRows((list) => list.map((r) => (unnamed.some((u) => u.key === r.key) ? { ...r, error: 'กรุณากรอกชื่อรายการ' } : r)));
      setError('กรุณากรอกชื่อรายการที่มีรูป/หมายเหตุ/สภาพ (รายการที่ว่างทั้งหมดจะถูกข้าม)');
      return;
    }
    const toSave = rows.filter((r) => !isBlank(r));
    const badQty = toSave.filter((r) => counted(r) && (!/^\d+$/.test(r.quantity.trim()) || Number(r.quantity) < quantityMin(kind) || Number(r.quantity) > QUANTITY_MAX));
    if (badQty.length > 0) {
      setRows((list) => list.map((r) => (badQty.some((b) => b.key === r.key) ? { ...r, error: `กรุณาระบุจำนวนเป็นจำนวนเต็ม ${quantityMin(kind)}–${QUANTITY_MAX}` } : r)));
      setError(`กรุณาระบุจำนวนของ: ${badQty.map((r) => r.name).join(', ')}`);
      return;
    }
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
            ...(counted(r) ? { quantity: Number(r.quantity) } : {}),
            note: r.note,
            ...(r.newPhoto ? { photo: r.newPhoto } : r.photoFile ? { keepPhoto: r.photoFile } : {}),
          })),
        }),
      });
      // commit 28a: the server message says the real reason (e.g. "ฐานข้อมูลยังไม่ได้อัปเดต (migration 019)");
      // a reply that is not JSON (an error page in front of the app) is named by its HTTP status
      const data = await res.json().catch(() => ({
        success: false,
        message: res.status === 413
          ? 'บันทึกผลตรวจห้องไม่สำเร็จ: ไฟล์รวมกันใหญ่เกินกว่าที่เซิร์ฟเวอร์รับได้ (HTTP 413)'
          : `บันทึกผลตรวจห้องไม่สำเร็จ: เซิร์ฟเวอร์ตอบกลับผิดรูปแบบ (HTTP ${res.status})`,
      }));
      if (!data.success) {
        setError(data.message || `บันทึกผลตรวจห้องไม่สำเร็จ (HTTP ${res.status})`);
        if (typeof data.item === 'number' && toSave[data.item]) update(toSave[data.item].key, { error: data.message });
        return;
      }
      await load();
    } catch (e: any) {
      setError(`บันทึกผลตรวจห้องไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (${e?.message || 'network'})`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="max-w-3xl w-full bg-slate-900 rounded-3xl p-5 sm:p-6 border border-white/20 space-y-4 max-h-[85dvh] flex flex-col my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex justify-between items-start gap-3 pb-2 border-b border-white/10">
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
          <div className="flex-1 overflow-y-auto overscroll-contain space-y-3 pr-1">
            {status === 'acknowledged' && (
              <p className="text-xs text-emerald-400 font-bold">
                ผู้เช่ารับทราบแล้ว{ackAt ? ` เมื่อ ${new Date(ackAt).toLocaleString('th-TH')}` : ''}{ackPaperBy ? ` (รับทราบบนกระดาษ · บันทึกโดย ${ackPaperBy})` : ''} — แก้ไขไม่ได้
              </p>
            )}
            {!editable && status !== 'acknowledged' && (
              <p className="text-xs text-rose-400 font-bold">
                {blockedReason || (kind === 'move_out' ? 'ตรวจห้องตอนย้ายออกได้ตั้งแต่แจ้งย้ายออกจนก่อนสรุปเงินประกันเท่านั้น' : 'สัญญานี้อยู่ในสถานะที่ตรวจห้องไม่ได้')}
              </p>
            )}
            {kind === 'move_out' && moveIn === null && (
              <p className="text-xs text-slate-400">ไม่มีผลตรวจห้องตอนเข้าอยู่ให้เทียบ</p>
            )}

            {rows.map((row, index) => (
              <div key={row.key} className={`p-3 rounded-2xl border space-y-2 ${row.error ? 'border-rose-500/60 bg-rose-500/5' : 'border-white/10 bg-slate-950/60'}`}>
                {/* commit 26b: number, name and ✕ on one line (also on phones); condition / quantity on the next */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-slate-500 w-5 shrink-0">{index + 1}.</span>
                  <input
                    value={row.name}
                    disabled={!editable}
                    onChange={(e) => update(row.key, { name: e.target.value, error: null })}
                    placeholder="ชื่อรายการ"
                    className="flex-1 min-w-0 bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  />
                  {editable && (
                    <button
                      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
                      className="px-2 py-1 text-rose-300 hover:text-rose-200 text-xs font-bold shrink-0"
                      title="ลบรายการ"
                    >
                      ✕
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2 pl-7">
                  <select
                    value={row.condition}
                    disabled={!editable}
                    onChange={(e) => update(row.key, { condition: e.target.value as Condition })}
                    className="bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white disabled:opacity-70"
                  >
                    {(Object.keys(CONDITION_TEXT) as Condition[]).map((c) => <option key={c} value={c}>{CONDITION_TEXT[c]}</option>)}
                  </select>
                  {counted(row) && (
                    <label className="flex items-center gap-1 text-[11px] font-bold text-slate-300">
                      จำนวน
                      <input
                        type="number" {...NUMBER_INPUT_PROPS}
                        min={quantityMin(kind)}
                        max={QUANTITY_MAX}
                        step={1}
                        inputMode="numeric"
                        value={row.quantity}
                        disabled={!editable}
                        onChange={(e) => update(row.key, { quantity: e.target.value, error: null })}
                        className="w-16 bg-slate-950 border border-white/10 rounded-xl px-2 py-2 text-xs font-bold text-white text-center disabled:opacity-70"
                      />
                    </label>
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
                  // commit 26: a counted item with fewer than at move-in is a missing item → damage charges at the deposit step
                  const short = before.quantity !== null && row.quantity.trim() !== '' && Number(row.quantity) < Number(before.quantity)
                    ? Number(before.quantity) - Number(row.quantity) : 0;
                  return (
                    <div className={`pl-7 flex flex-wrap items-center gap-2 text-[11px] ${changed || short ? 'text-amber-300 font-bold' : 'text-slate-400'}`}>
                      <span>ตอนเข้าอยู่: {CONDITION_TEXT[before.condition_status]}{before.quantity !== null ? ` · จำนวน ${before.quantity}` : ''}{before.note ? ` · ${before.note}` : ''}{changed ? ' → เปลี่ยนไป' : ''}</span>
                      {short > 0 && <span>ขาด {short} — เลือก "สูญหาย" แล้วคิดค่าเสียหายที่ขั้นสรุปเงินประกัน</span>}
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

        {kind === 'move_in' && status === 'pending_ack' && !loading && !loadError && (
          <div className="p-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 space-y-2">
            <p className="text-[11px] text-amber-200">
              รอผู้เช่ากดรับทราบในหน้าของผู้จอง · ถ้าผู้เช่าใช้แอปไม่ได้ ให้พิมพ์ใบตรวจสภาพห้อง ให้ผู้เช่าลงชื่อ แล้วบันทึกที่นี่
              (ใบที่ลงชื่อจะอยู่ในสัญญาที่ลงนามซึ่งต้องอัปโหลดก่อนออกบิลค่าแรกเข้า)
            </p>
            <button
              type="button"
              disabled={recording}
              onClick={recordPaperAck}
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-white rounded-xl text-xs font-black disabled:opacity-50"
            >
              {recording ? 'กำลังบันทึก...' : '✍️ ผู้เช่ารับทราบบนกระดาษ'}
            </button>
          </div>
        )}

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
