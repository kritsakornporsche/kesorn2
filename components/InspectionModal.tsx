'use client';

// Owner/manager: room inspection (lib/inspections.ts) before move-in, or at move-out (kind 'move_out', compared item
// by item with the move-in result). Items start from the dorm's item list for the room type (lib/room-items.ts) or the
// move-in items; each item has a condition, a note and one photo, countable items a quantity (commit 26). Editable until
// the tenant acknowledges it.
// commit 28-10: a checklist — every item starts "ปกติ" and only what is not gets tapped. PC (md and up): one table
// (รายการ | จำนวน | ปกติ / ชำรุด / สูญหาย | หมายเหตุ | รูป). Phone: a card per item with 3 large condition buttons; the
// note and photo open only for an item that is not "ปกติ" (or with "+ หมายเหตุ / รูป").

import { Fragment, useEffect, useState } from 'react';
import { PHOTOS_TOTAL_MAX_BYTES, preparePhoto } from '@/lib/inspection-photo-check';
import { QUANTITY_MAX, isCountableName, quantityMin } from '@/lib/room-items';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';
import { useConfirm } from '@/components/ConfirmModalProvider';

type Condition = 'Good' | 'Damaged' | 'Missing';
export type InspectionKind = 'move_in' | 'move_out';
export type InspectionStatus = 'none' | 'pending_ack' | 'acknowledged';

export const INSPECTION_STATUS_TEXT: Record<InspectionStatus, string> = {
  none: 'ยังไม่ตรวจห้อง',
  pending_ack: 'รอผู้เช่ารับทราบ',
  acknowledged: 'รับทราบแล้ว',
};

export const CONDITION_TEXT: Record<Condition, string> = { Good: 'ปกติ', Damaged: 'ชำรุด', Missing: 'สูญหาย' };
const CONDITIONS = Object.keys(CONDITION_TEXT) as Condition[];
/** the chosen condition button */
const CONDITION_ON: Record<Condition, string> = {
  Good: 'bg-emerald-50 text-emerald-700 border-emerald-400 font-black shadow-xs',
  Damaged: 'bg-amber-50 text-amber-800 border-amber-400 font-black shadow-xs',
  Missing: 'bg-rose-50 text-rose-700 border-rose-400 font-black shadow-xs',
};
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
  /** phone: note and photo opened on an item that is still "ปกติ" */
  more?: boolean;
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
    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
    : status === 'pending_ack'
      ? 'bg-amber-50 border-amber-200 text-amber-800'
      : 'bg-slate-100 border-slate-200 text-slate-700';
  return (
    <span className={`px-3 py-1.5 rounded-xl border text-[11px] font-bold ${style}`}>
      {status === 'acknowledged' ? '✓' : status === 'pending_ack' ? '⏳' : '○'} {INSPECTION_STATUS_TEXT[status]}
    </span>
  );
}

export function InspectionPanel({ contractId, kind = 'move_in', onClose, onSaved, showHeader = true, onLoaded }: {
  contractId: number;
  kind?: InspectionKind;
  onClose?: () => void;
  showHeader?: boolean;
  onLoaded?: (data: { status: InspectionStatus; roomNumber?: string; tenantName?: string }) => void;
  /** called with the status after loading and after saving */
  onSaved?: (status: InspectionStatus) => void;
}) {
  const { confirm } = useConfirm();
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
  const [viewLayout, setViewLayout] = useState<'table' | 'posts'>('table');
  // Move-out: the move-in result by item name, to compare
  const [moveIn, setMoveIn] = useState<{ name: string; item: MoveInItem }[] | null>(null);

  /** Staff record that the tenant signed the printed inspection record (who / when kept on the server). */
  const recordPaperAck = async () => {
    const ok = await confirm({
      title: 'บันทึกการรับทราบสภาพห้อง?',
      description: 'ยืนยันว่าผู้เช่าลงชื่อรับทราบในใบตรวจสภาพห้องแล้ว\nระบบจะบันทึกชื่อผู้ดำเนินการ และผลตรวจจะไม่สามารถแก้ไขได้อีก',
      confirmText: 'ยืนยันบันทึก',
      cancelText: 'ย้อนกลับ',
      variant: 'info',
    });
    if (!ok) return;
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
      onLoaded?.({
        status: data.status,
        roomNumber: data.contract?.room_number,
        tenantName: data.contract?.tenant_name,
      });
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

  // ── pieces of a row, the same in the PC table and the phone cards ──
  const nameInput = (row: Row) => (
    <input
      value={row.name}
      disabled={!editable}
      onChange={(e) => update(row.key, { name: e.target.value, error: null })}
      placeholder="ชื่อรายการ"
      aria-label={`ชื่อรายการที่ ${rows.indexOf(row) + 1}`}
      className="flex-1 w-full min-w-0 bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary disabled:opacity-70 disabled:bg-slate-50"
    />
  );
  const removeButton = (row: Row) => editable && (
    <button
      type="button"
      onClick={() => setRows((list) => list.filter((r) => r.key !== row.key))}
      className="px-2 py-1 text-rose-500 hover:text-rose-700 text-xs font-bold shrink-0"
      title="ลบรายการ"
    >
      ✕
    </button>
  );
  /** ปกติ / ชำรุด / สูญหาย as 3 buttons (large on a phone) */
  const conditionButtons = (row: Row, large: boolean) => (
    <div role="radiogroup" aria-label={`สภาพ ${row.name || 'รายการ'}`} className="grid grid-cols-3 gap-1">
      {CONDITIONS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={row.condition === c}
          data-condition={c}
          disabled={!editable}
          onClick={() => update(row.key, { condition: c, error: null })}
          className={`${large ? 'py-3 text-sm' : 'py-1.5 text-[11px]'} rounded-xl font-black border transition-colors ${
            row.condition === c ? CONDITION_ON[c] : 'border-slate-200 text-slate-600 hover:bg-slate-100'
          } disabled:cursor-not-allowed`}
        >
          {CONDITION_TEXT[c]}
        </button>
      ))}
    </div>
  );
  const quantityInput = (row: Row) => (
    <input
      type="number" {...NUMBER_INPUT_PROPS}
      min={quantityMin(kind)}
      max={QUANTITY_MAX}
      step={1}
      inputMode="numeric"
      aria-label={`จำนวน ${row.name}`}
      value={row.quantity}
      disabled={!editable}
      onChange={(e) => update(row.key, { quantity: e.target.value, error: null })}
      className="w-16 bg-white border border-slate-300 rounded-xl px-2 py-2 text-xs font-bold text-slate-900 text-center disabled:opacity-70 disabled:bg-slate-50"
    />
  );
  const noteInput = (row: Row) => (
    <input
      value={row.note}
      disabled={!editable}
      onChange={(e) => update(row.key, { note: e.target.value })}
      placeholder={row.condition === 'Good' ? 'หมายเหตุ (ถ้ามี)' : `${CONDITION_TEXT[row.condition]}อย่างไร (ถ้ามี)`}
      className="flex-1 w-full min-w-[140px] bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-primary disabled:opacity-70 disabled:bg-slate-50"
    />
  );
  const photoCell = (row: Row) => (
    <div className="flex items-center gap-1.5">
      {(row.newPhoto || row.photoUrl) && (
        <button type="button" onClick={() => setPreview(row.newPhoto || row.photoUrl)} className="w-10 h-10 rounded-lg overflow-hidden border border-slate-300 shrink-0 shadow-xs">
          <img src={row.newPhoto || row.photoUrl || ''} alt={row.name} className="w-full h-full object-cover" />
        </button>
      )}
      {editable && (
        <label className="px-2.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-[11px] font-bold rounded-xl border border-slate-300 cursor-pointer whitespace-nowrap shadow-xs">
          📷 {row.newPhoto || row.photoUrl ? 'เปลี่ยน' : 'ถ่าย/เลือกรูป'}
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
          type="button"
          onClick={() => update(row.key, { newPhoto: null, newBytes: 0, photoFile: null, photoUrl: null })}
          className="text-[11px] text-slate-500 hover:text-rose-600 font-bold"
        >
          ลบรูป
        </button>
      )}
      {!editable && !row.newPhoto && !row.photoUrl && <span className="text-slate-400">–</span>}
    </div>
  );
  /** Move-out: the move-in result of the same item */
  const compareLine = (row: Row) => {
    if (kind !== 'move_out' || !moveIn) return null;
    const before = moveInOf(row.name);
    if (!before) return row.name.trim() ? <p className="text-[11px] text-slate-500">ตอนเข้าอยู่: ไม่มีรายการนี้</p> : null;
    const changed = before.condition_status !== row.condition;
    // commit 26: a counted item with fewer than at move-in is a missing item → damage charges at the deposit step
    const short = before.quantity !== null && row.quantity.trim() !== '' && Number(row.quantity) < Number(before.quantity)
      ? Number(before.quantity) - Number(row.quantity) : 0;
    return (
      <div className={`flex flex-wrap items-center gap-2 text-[11px] ${changed || short ? 'text-amber-700 font-bold' : 'text-slate-600'}`}>
        <span>ตอนเข้าอยู่: {CONDITION_TEXT[before.condition_status]}{before.quantity !== null ? ` · จำนวน ${before.quantity}` : ''}{before.note ? ` · ${before.note}` : ''}{changed ? ' → เปลี่ยนไป' : ''}</span>
        {short > 0 && <span>ขาด {short} — เลือก "สูญหาย" แล้วคิดค่าเสียหายที่ขั้นสรุปเงินประกัน</span>}
        {before.photo_url && (
          <button onClick={() => setPreview(before.photo_url)} className="w-8 h-8 rounded overflow-hidden border border-slate-300 shrink-0">
            <img src={before.photo_url} alt={`${row.name} ตอนเข้าอยู่`} className="w-full h-full object-cover" />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white text-slate-900">
      {showHeader && (
        <div className="shrink-0 flex justify-between items-start gap-3 p-5 sm:p-6 pb-3 border-b border-slate-200 bg-slate-50/80">
          <div>
            <p className="font-black text-slate-900 text-base">🔍 {KIND_TITLE[kind]} {info?.room_number ? `· ห้อง ${info.room_number}` : ''}</p>
            {info?.tenant_name && <p className="text-xs text-slate-600">ผู้เช่า: {info.tenant_name}</p>}
          </div>
          <div className="flex items-center gap-2">
            <InspectionStatusBadge status={status} />
            {onClose && <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg font-bold">✕</button>}
          </div>
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
        {loading ? (
          <p className="text-sm text-slate-500 py-8 text-center">กำลังโหลด...</p>
        ) : loadError ? (
          <p className="text-sm text-rose-500 font-bold py-8 text-center">✕ {loadError}</p>
        ) : (
          <>
            {status === 'acknowledged' && (
              <p className="text-xs text-emerald-700 font-bold">
                ผู้เช่ารับทราบแล้ว{ackAt ? ` เมื่อ ${new Date(ackAt).toLocaleString('th-TH')}` : ''}{ackPaperBy ? ` (รับทราบบนกระดาษ · บันทึกโดย ${ackPaperBy})` : ''} — แก้ไขไม่ได้
              </p>
            )}
            {!editable && status !== 'acknowledged' && (
              <p className="text-xs text-rose-600 font-bold">
                {blockedReason || (kind === 'move_out' ? 'ตรวจห้องตอนย้ายออกได้ตั้งแต่แจ้งย้ายออกจนก่อนสรุปเงินประกันเท่านั้น' : 'สัญญานี้อยู่ในสถานะที่ตรวจห้องไม่ได้')}
              </p>
            )}
            {kind === 'move_out' && moveIn === null && (
              <p className="text-xs text-slate-500">ไม่มีผลตรวจห้องตอนเข้าอยู่ให้เทียบ</p>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              {rows.length > 0 && (
                <p className="text-[11px] text-slate-500" data-summary>
                  ทุกข้อเริ่มเป็น &quot;ปกติ&quot; — แตะเฉพาะข้อที่ผิดปกติ ·{' '}
                  {CONDITIONS.map((c) => `${CONDITION_TEXT[c]} ${rows.filter((r) => r.condition === c).length}`).join(' · ')}
                </p>
              )}
              <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-xl border border-slate-200 self-start sm:self-auto shrink-0">
                <button
                  type="button"
                  onClick={() => setViewLayout('table')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    viewLayout === 'table' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📑 ตาราง
                </button>
                <button
                  type="button"
                  onClick={() => setViewLayout('posts')}
                  className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all ${
                    viewLayout === 'posts' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  📱 โพสต์
                </button>
              </div>
            </div>

            {viewLayout === 'posts' ? (
              /* Post Format View (รูปแบบโพสต์) */
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" data-layout="posts">
                {rows.map((row, index) => {
                  const photoSrc = row.newPhoto || row.photoUrl;
                  return (
                    <div
                      key={row.key}
                      className={`rounded-2xl border overflow-hidden flex flex-col justify-between transition-all shadow-xs hover:shadow-md ${
                        row.error ? 'border-rose-300 bg-rose-50/50' : 'border-slate-200 bg-slate-50/70'
                      }`}
                    >
                      {/* Post Photo Banner */}
                      {photoSrc ? (
                        <div
                          className="relative aspect-video bg-slate-100 cursor-pointer overflow-hidden group/img"
                          onClick={() => setPreview(photoSrc)}
                        >
                          <img
                            src={photoSrc}
                            alt={row.name}
                            className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-black/30 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center">
                            <span className="px-3 py-1.5 bg-black/70 backdrop-blur-md text-white text-xs font-bold rounded-full flex items-center gap-1.5 shadow-lg">
                              🔍 ดูรูปขนาดเต็ม
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="aspect-[3/1] bg-slate-100/70 border-b border-slate-200/60 flex items-center justify-center text-slate-400 text-xs font-bold gap-1.5">
                          <span>📷</span>
                          <span>ไม่มีภาพถ่ายแนบ</span>
                        </div>
                      )}

                      {/* Post Content */}
                      <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                        <div>
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <span className="text-[11px] font-mono font-bold text-slate-400 bg-slate-200/60 px-2 py-0.5 rounded-md">
                              #{index + 1}
                            </span>
                            {removeButton(row)}
                          </div>

                          <div className="mb-2">
                            {nameInput(row)}
                          </div>

                          <div className="mb-2">
                            {conditionButtons(row, true)}
                          </div>

                          {counted(row) && (
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-700 my-2">
                              <span>จำนวน:</span>
                              {quantityInput(row)}
                            </label>
                          )}

                          <div className="mt-2 space-y-2">
                            {noteInput(row)}
                            <div className="flex items-center justify-between pt-1">
                              {photoCell(row)}
                            </div>
                          </div>

                          {compareLine(row) && <div className="mt-2">{compareLine(row)}</div>}
                          {row.error && <p className="mt-2 text-xs text-rose-600 font-bold">✕ {row.error}</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <>
            {/* PC: one table */}
            <table className="hidden md:table w-full text-xs border-separate border-spacing-y-1" data-layout="pc">
              <thead>
                <tr className="text-[11px] text-slate-500 text-left">
                  <th className="w-6 font-bold">#</th>
                  <th className="font-bold">รายการ</th>
                  <th className="w-[4.5rem] font-bold text-center">จำนวน</th>
                  <th className="w-[13.5rem] font-bold text-center">สภาพ</th>
                  <th className="font-bold">หมายเหตุ</th>
                  <th className="w-[7.5rem] font-bold">รูป</th>
                  <th className="w-7" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <Fragment key={row.key}>
                    <tr className={row.error ? 'bg-rose-50' : ''}>
                      <td className="text-[11px] text-slate-500 align-middle">{index + 1}.</td>
                      <td className="pr-2">{nameInput(row)}</td>
                      <td className="text-center">{counted(row) ? quantityInput(row) : <span className="text-slate-400">–</span>}</td>
                      <td className="px-1">{conditionButtons(row, false)}</td>
                      <td className="pr-2">{noteInput(row)}</td>
                      <td>{photoCell(row)}</td>
                      <td className="text-right">{removeButton(row)}</td>
                    </tr>
                    {(compareLine(row) || row.error) && (
                      <tr>
                        <td />
                        <td colSpan={6} className="pb-1">
                          {compareLine(row)}
                          {row.error && <p className="text-xs text-rose-600 font-bold">✕ {row.error}</p>}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>

            {/* phone: a card per item */}
            <div className="md:hidden space-y-2" data-layout="mobile">
              {rows.map((row, index) => {
                const more = row.condition !== 'Good' || row.more || !!row.note.trim() || !!row.newPhoto || !!row.photoUrl;
                return (
                  <div key={row.key} className={`p-3 rounded-2xl border space-y-2 ${row.error ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-slate-50/70'}`}>
                    {/* commit 26b: number, name and ✕ on one line */}
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-slate-500 w-5 shrink-0">{index + 1}.</span>
                      {nameInput(row)}
                      {removeButton(row)}
                    </div>
                    <div className="pl-7">{conditionButtons(row, true)}</div>
                    {counted(row) && (
                      <label className="pl-7 flex items-center gap-2 text-[11px] font-bold text-slate-700">จำนวน {quantityInput(row)}</label>
                    )}
                    {more ? (
                      <div className="flex flex-wrap items-center gap-2 pl-7">
                        {noteInput(row)}
                        {photoCell(row)}
                      </div>
                    ) : editable && (
                      <button type="button" onClick={() => update(row.key, { more: true })} className="ml-7 text-[11px] font-bold text-slate-500 hover:text-slate-800">
                        + หมายเหตุ / รูป
                      </button>
                    )}
                    {compareLine(row) && <div className="pl-7">{compareLine(row)}</div>}
                    {row.error && <p className="pl-7 text-xs text-rose-600 font-bold">✕ {row.error}</p>}
                  </div>
                );
              })}
            </div>
            </>
            )}

            {editable && (
              <button
                onClick={() => {
                  if (rows.length >= maxItems) {
                    setError(`รายการตรวจได้ไม่เกิน ${maxItems} รายการ`);
                    return;
                  }
                  setRows((list) => [...list, blankRow()]);
                }}
                className="w-full py-2 border border-dashed border-slate-300 hover:border-slate-400 text-slate-700 hover:bg-slate-50 text-xs font-bold rounded-xl"
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
              className="w-full bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-900 disabled:opacity-70 focus:outline-none focus:border-primary"
            />
          </>
        )}
      </div>

      <div className="shrink-0 p-4 sm:p-5 border-t border-slate-200 bg-slate-50/90 space-y-2">
        {error && <p className="text-xs text-rose-600 font-bold">✕ {error}</p>}

        <div className="flex gap-2">
          {onClose && (
            <button type="button" onClick={onClose} className="flex-1 py-3 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-xl text-xs font-bold">
              ปิด
            </button>
          )}
          {editable && !loading && !loadError && (
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black disabled:opacity-50"
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

export function InspectionModal({
  contractId,
  kind = 'move_in',
  onClose,
  onSaved,
}: {
  contractId: number;
  kind?: InspectionKind;
  onClose: () => void;
  onSaved?: (status: InspectionStatus) => void;
}) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="max-w-3xl md:max-w-4xl w-full bg-white rounded-3xl border border-slate-200 shadow-2xl h-[85dvh] max-h-[85dvh] flex flex-col overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>
        <InspectionPanel contractId={contractId} kind={kind} onClose={onClose} onSaved={onSaved} showHeader={true} />
      </div>
    </div>
  );
}

export default InspectionModal;

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
        className="px-4 py-2.5 bg-sky-50 hover:bg-sky-100 text-sky-700 border border-sky-200 font-black text-xs rounded-xl"
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
