'use client';

// Step 3 of booking → tenant (commit 28): the owner / manager fills in / checks the contract data, previews the PDF and
// confirms it (locked). After that a change needs a reason and is kept in the history; once the signed paper is
// uploaded nothing can change. Rules on the server: lib/contract-data.ts.
// Commit 28-8: title (from the list) + first name + last name, and the address in the fields of the dorm's contract
// form (lib/contract-party). An older contract's single-field name / address is shown split, to check and confirm.

import { useEffect, useState } from 'react';
import { MAX_OCCUPANTS, OCCUPANT_CHOICES } from '@/lib/occupants';
import { ADDRESS_FIELDS, NAME_PART_MAX, TITLES, type AddressParts } from '@/lib/contract-party';
import ThaiDatePicker, { LeaseShortcuts } from '@/components/ThaiDatePicker';
import { addDays, todayTh } from '@/lib/thai-date';

interface DataChange { field: string; label: string; from: string | number; to: string | number }
interface View {
  contractId: number;
  roomNumber: string;
  data: { title: string; firstName: string; lastName: string; address: AddressParts; tenantName: string; tenantAddress: string; occupants: number; startDate: string; endDate: string };
  fieldsSaved: boolean;
  confirmedAt: string | null;
  confirmedByName: string | null;
  canConfirm: boolean;
  canChange: boolean;
  lockedReason: string | null;
  history: { id: number; changes: DataChange[]; reason: string; changed_at: string; changed_by_name: string | null }[];
}

/** "ข้อมูลสัญญา" button that opens the modal (owner contract page). */
export function ContractDataButton({ contractId, label = '📝 ข้อมูลสัญญา / ประวัติการแก้' }: { contractId: number; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="px-4 py-2.5 bg-violet-500 hover:bg-violet-400 text-white font-black text-xs rounded-xl">
        {label}
      </button>
      {open && <ContractDataModal contractId={contractId} onClose={() => setOpen(false)} />}
    </>
  );
}

const thaiDate = (v: string) => (v ? new Date(`${v}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-');
const shown = (field: string, v: string | number) => (field === 'startDate' || field === 'endDate' ? thaiDate(String(v)) : field === 'occupants' ? `${v} คน` : String(v || '-'));

export default function ContractDataModal({ contractId, onClose, onSaved }: { contractId: number; onClose: () => void; onSaved?: () => void }) {
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<View['data'] | null>(null);
  const [reason, setReason] = useState('');
  const [editing, setEditing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/contract-data`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({ success: false, message: `โหลดข้อมูลสัญญาไม่สำเร็จ (HTTP ${res.status})` }));
      if (!data.success) return setLoadError(data.message || 'โหลดข้อมูลสัญญาไม่สำเร็จ');
      setView(data);
      setForm(data.data);
      setEditing(false);
      setReason('');
    } catch (e: any) {
      setLoadError(`โหลดข้อมูลสัญญาไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (${e?.message || 'network'})`);
    }
  };
  useEffect(() => { load(); }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof View['data'], v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const setAddr = (k: keyof AddressParts, v: string) => setForm((f) => (f ? { ...f, address: { ...f.address, [k]: v } } : f));
  const locked = !!view && !view.canConfirm && !(view.canChange && editing);

  const save = async (action: 'confirm' | 'change') => {
    if (!form) return;
    setError(null);
    setNotice(null);
    if (action === 'confirm' && !confirm('ยืนยันข้อมูลสัญญา? หลังยืนยันแล้ว การแก้ไขต้องระบุเหตุผลและจะถูกบันทึกประวัติ')) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/contract-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // separate fields only (the one-field tenantName / tenantAddress are for display)
        body: JSON.stringify({
          action, reason, title: form.title, firstName: form.firstName, lastName: form.lastName, ...form.address,
          occupants: form.occupants, startDate: form.startDate, endDate: form.endDate,
        }),
      });
      const data = await res.json().catch(() => ({ success: false, message: `บันทึกไม่สำเร็จ (HTTP ${res.status})` }));
      if (!data.success) return setError(data.message || 'บันทึกข้อมูลสัญญาไม่สำเร็จ');
      setNotice(data.message);
      await load();
      onSaved?.();
    } catch (e: any) {
      setError(`บันทึกไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (${e?.message || 'network'})`);
    } finally {
      setSaving(false);
    }
  };

  const input = 'w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-sm font-bold text-white focus:outline-none focus:border-primary disabled:opacity-60';

  return (
    <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="max-w-2xl w-full bg-slate-900 rounded-3xl border border-white/20 max-h-[85dvh] flex flex-col overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>
        <div className="shrink-0 flex justify-between items-start gap-3 p-5 sm:p-6 border-b border-white/10 bg-slate-950/80">
          <div>
            <p className="font-black text-white text-base">📝 ขั้น 3 · ข้อมูลสัญญา {view ? `· ห้อง ${view.roomNumber}` : ''}</p>
            <p className="text-xs text-slate-400">ตรวจกับบัตรประชาชนของผู้เช่า แล้วกดยืนยัน — ข้อมูลนี้พิมพ์ลงสัญญา</p>
          </div>
          <button type="button" onClick={onClose} className="text-white/50 hover:text-white text-lg font-bold" aria-label="ปิด">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
          {loadError ? (
            <p className="text-sm text-rose-400 font-bold py-6 text-center">✕ {loadError}</p>
          ) : !view || !form ? (
            <p className="text-sm text-slate-400 py-6 text-center">กำลังโหลด...</p>
          ) : (
            <>
              {view.confirmedAt ? (
                <p className="text-xs font-bold text-emerald-400">
                  ✓ ยืนยันข้อมูลแล้ว {new Date(view.confirmedAt).toLocaleString('th-TH')}{view.confirmedByName ? ` โดย ${view.confirmedByName}` : ''}
                </p>
              ) : (
                <p className="text-xs font-bold text-amber-400">ยังไม่ยืนยัน — สัญญาที่พิมพ์ตอนนี้มีคำว่า "ร่าง"</p>
              )}
              {view.lockedReason && <p className="text-xs font-bold text-rose-400">🔒 {view.lockedReason}</p>}

              {!view.fieldsSaved && (
                <p className="text-[11px] font-bold text-amber-300">ข้อมูลเดิมเก็บเป็นช่องเดียว — ระบบแยกให้แล้ว กรุณาตรวจทุกช่องกับบัตรประชาชนก่อนยืนยัน</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr_1fr] gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">คำนำหน้า</span>
                  <select className={input} value={form.title} disabled={locked} onChange={(e) => set('title', e.target.value)}>
                    <option value="">เลือก</option>
                    {TITLES.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">ชื่อ (ตามบัตรประชาชน)</span>
                  <input className={input} maxLength={NAME_PART_MAX} value={form.firstName} disabled={locked} onChange={(e) => set('firstName', e.target.value)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">นามสกุล</span>
                  <input className={input} maxLength={NAME_PART_MAX} value={form.lastName} disabled={locked} onChange={(e) => set('lastName', e.target.value)} />
                </label>
              </div>
              <fieldset className="space-y-2">
                <legend className="text-[11px] font-bold text-slate-300 mb-1">ที่อยู่ตามบัตรประชาชน (ช่องที่มี * ต้องกรอก)</legend>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {ADDRESS_FIELDS.map((fld) => (
                    <label key={fld.key} className="block space-y-1">
                      <span className="text-[11px] text-slate-400">{fld.label}{fld.required ? ' *' : ''}</span>
                      <input
                        className={input}
                        maxLength={fld.key === 'postcode' ? 5 : 100}
                        inputMode={fld.key === 'postcode' ? 'numeric' : undefined}
                        value={form.address[fld.key]}
                        disabled={locked}
                        onChange={(e) => setAddr(fld.key, fld.key === 'postcode' ? e.target.value.replace(/\D/g, '').slice(0, 5) : e.target.value)}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">จำนวนผู้พัก (1–{MAX_OCCUPANTS} คน)</span>
                  <select className={input} value={form.occupants} disabled={locked} onChange={(e) => set('occupants', Number(e.target.value))}>
                    {OCCUPANT_CHOICES.map((n) => <option key={n} value={n}>{n} คน</option>)}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300">วันเริ่มสัญญา</span>
                  <ThaiDatePicker aria-label="วันเริ่มสัญญา" className={input} min={todayTh()} value={form.startDate} disabled={locked} onChange={(v) => set('startDate', v)} />
                </label>
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-slate-300 flex items-center justify-between gap-1">วันสิ้นสุดสัญญา {!locked && <LeaseShortcuts start={form.startDate} onEnd={(v) => set('endDate', v)} />}</span>
                  <ThaiDatePicker aria-label="วันสิ้นสุดสัญญา" className={input} min={form.startDate ? addDays(form.startDate, 1) : todayTh()} value={form.endDate} disabled={locked} onChange={(v) => set('endDate', v)} />
                </label>
              </div>
              <p className="text-[11px] text-slate-400">ระบบไม่เก็บเลขบัตรประชาชนและรูปบัตร</p>

              {editing && (
                <label className="block space-y-1">
                  <span className="text-[11px] font-bold text-amber-300">เหตุผลที่แก้ (บังคับ · แจ้งผู้จองด้วย)</span>
                  <input className={input} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เช่น สะกดชื่อผิดตามบัตรประชาชน" />
                </label>
              )}

              <a
                href={`/contract-print/${contractId}`}
                target="_blank"
                rel="noreferrer"
                className="inline-block px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-bold"
              >
                📄 ดูตัวอย่างสัญญา (PDF) ↗
              </a>

              {error && <p role="alert" className="text-xs font-bold text-rose-400">✕ {error}</p>}
              {notice && <p className="text-xs font-bold text-emerald-400">✓ {notice}</p>}

              {view.history.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-2">
                  <p className="text-xs font-black text-white">ประวัติการแก้ข้อมูลสัญญา</p>
                  {view.history.map((h) => (
                    <div key={h.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5 text-[11px] text-slate-300 space-y-1">
                      <p className="text-slate-400">{new Date(h.changed_at).toLocaleString('th-TH')}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</p>
                      {h.changes.map((c, i) => (
                        <p key={i}>{c.label}: <span className="line-through text-slate-500">{shown(c.field, c.from)}</span> → <span className="font-bold text-white">{shown(c.field, c.to)}</span></p>
                      ))}
                      <p>เหตุผล: {h.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="shrink-0 p-4 sm:p-5 border-t border-white/10 bg-slate-950/80 flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl">ปิด</button>
          {view?.canConfirm && (
            <button type="button" disabled={saving} onClick={() => save('confirm')} className="px-6 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : '✓ ยืนยันข้อมูลสัญญา'}
            </button>
          )}
          {view?.canChange && !editing && (
            <button type="button" onClick={() => { setEditing(true); setNotice(null); }} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl">
              ✎ แก้ข้อมูลสัญญา
            </button>
          )}
          {view?.canChange && editing && (
            <>
              <button type="button" onClick={() => { setEditing(false); setForm(view.data); setReason(''); setError(null); }} className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold text-xs rounded-xl">ยกเลิกการแก้</button>
              <button type="button" disabled={saving || !reason.trim()} onClick={() => save('change')} className="px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-white font-black text-xs rounded-xl disabled:opacity-50">
                {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
