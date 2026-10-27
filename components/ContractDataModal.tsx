'use client';

// Step 3 of booking → tenant (commit 28): the owner / manager fills in / checks the contract data, previews the PDF and
// confirms it (locked). After that a change needs a reason and is kept in the history; once the signed paper is
// uploaded nothing can change. Rules on the server: lib/contract-data.ts.
// Commit 28-8: title (from the list) + first name + last name, and the address in the fields of the dorm's contract
// form (lib/contract-party). An older contract's single-field name / address is shown split, to check and confirm.

import { useEffect, useState } from 'react';
import { MAX_OCCUPANTS, OCCUPANT_CHOICES } from '@/lib/occupants';
import { ADDRESS_FIELDS, type AddressParts, type PartyValue } from '@/lib/contract-party';
import PartyFields from '@/components/PartyFields';
import ThaiDatePicker, { LeaseShortcuts } from '@/components/ThaiDatePicker';
import { addDays, todayTh } from '@/lib/thai-date';
import { useConfirm } from '@/components/ConfirmModalProvider';

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

export function ContractDataPanel({
  contractId,
  onClose,
  onSaved,
  showHeader = true,
  onLoaded,
}: {
  contractId: number;
  onClose?: () => void;
  onSaved?: () => void;
  showHeader?: boolean;
  onLoaded?: (data: { confirmed: boolean; roomNumber?: string; tenantName?: string }) => void;
}) {
  const { confirm } = useConfirm();
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
      onLoaded?.({
        confirmed: Boolean(data.confirmedAt),
        roomNumber: data.roomNumber,
        tenantName: data.data?.tenantName,
      });
    } catch (e: any) {
      setLoadError(`โหลดข้อมูลสัญญาไม่สำเร็จ: เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ (${e?.message || 'network'})`);
    }
  };
  useEffect(() => { load(); }, [contractId]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof View['data'], v: string | number) => setForm((f) => (f ? { ...f, [k]: v } : f));

  const save = async (action: 'confirm' | 'change') => {
    if (!form) return;
    setError(null);
    setNotice(null);
    if (action === 'confirm') {
      const ok = await confirm({
        title: 'ยืนยันข้อมูลสัญญา?',
        description: 'หลังยืนยันแล้ว การแก้ไขข้อมูลจะต้องระบุเหตุผลและระบบจะบันทึกประวัติการเปลี่ยนแปลงไว้',
        confirmText: 'ยืนยันข้อมูล',
        cancelText: 'ย้อนกลับ',
        variant: 'info',
      });
      if (!ok) return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/owner/contracts/${contractId}/contract-data`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

  const input = 'w-full bg-white border border-slate-300 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-900 focus:outline-none focus:border-primary disabled:opacity-60 disabled:bg-slate-50';

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden bg-white text-slate-900">
      {showHeader && (
        <div className="shrink-0 flex justify-between items-start gap-3 p-5 sm:p-6 border-b border-slate-200 bg-slate-50/80">
          <div>
            <p className="font-black text-slate-900 text-base">📝 ข้อมูลสัญญา {view ? `· ห้อง ${view.roomNumber}` : ''}</p>
            <p className="text-xs text-slate-500">ตรวจกับบัตรประชาชนของผู้เช่า แล้วกดยืนยัน — ข้อมูลนี้พิมพ์ลงสัญญา</p>
          </div>
          {onClose && (
            <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg font-bold" aria-label="ปิด">✕</button>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6 space-y-4">
        {loadError ? (
          <p className="text-sm text-rose-600 font-bold py-6 text-center">✕ {loadError}</p>
        ) : !view || !form ? (
          <p className="text-sm text-slate-500 py-6 text-center">กำลังโหลด...</p>
        ) : (
          <>
            {view.confirmedAt ? (
              <p className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200 inline-block">
                ✓ ยืนยันข้อมูลแล้ว {new Date(view.confirmedAt).toLocaleString('th-TH')}{view.confirmedByName ? ` โดย ${view.confirmedByName}` : ''}
              </p>
            ) : (
              <p className="text-xs font-bold text-amber-800 bg-amber-50 px-3 py-1.5 rounded-lg border border-amber-200 inline-block">
                ยังไม่ยืนยัน — สัญญาที่พิมพ์ตอนนี้มีคำว่า &quot;ร่าง&quot;
              </p>
            )}

            <div className="space-y-3">
              <PartyFields
                inputClass={input}
                value={{
                  title: form.title,
                  firstName: form.firstName,
                  lastName: form.lastName,
                  ...form.address,
                }}
                disabled={!editing && !view.canConfirm}
                onChange={(p: PartyValue) => {
                  setForm((prev) => (prev ? {
                    ...prev,
                    title: p.title,
                    firstName: p.firstName,
                    lastName: p.lastName,
                    address: {
                      houseNo: p.houseNo,
                      moo: p.moo,
                      soi: p.soi,
                      road: p.road,
                      subdistrict: p.subdistrict,
                      district: p.district,
                      province: p.province,
                      postcode: p.postcode,
                    },
                  } : prev));
                }}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">วันเริ่มสัญญา</label>
                  <ThaiDatePicker
                    value={form.startDate}
                    onChange={(d) => set('startDate', d)}
                    disabled={!editing && !view.canConfirm}
                    className={input}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">วันสิ้นสุดสัญญา</label>
                  <ThaiDatePicker
                    value={form.endDate}
                    onChange={(d) => set('endDate', d)}
                    disabled={!editing && !view.canConfirm}
                    className={input}
                  />
                  {editing && (
                    <LeaseShortcuts
                      start={form.startDate}
                      onEnd={(end: string) => set('endDate', end)}
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">จำนวนผู้พักอาศัย</label>
                <select
                  value={form.occupants}
                  disabled={!editing && !view.canConfirm}
                  onChange={(e) => set('occupants', Number(e.target.value))}
                  className={input}
                >
                  {OCCUPANT_CHOICES.map((n) => (
                    <option key={n} value={n}>{n} คน</option>
                  ))}
                </select>
              </div>

              {editing && (
                <div className="pt-2">
                  <label className="block text-xs font-bold text-amber-800 mb-1">เหตุผลในการแก้ไขข้อมูลสัญญา (จำเป็น)</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="ระบุเหตุผล เช่น สะกดชื่อผิด, เปลี่ยนแปลงระยะเวลา..."
                    className={input}
                  />
                </div>
              )}
            </div>

            {error && <p role="alert" className="text-xs font-bold text-rose-600">✕ {error}</p>}
            {notice && <p className="text-xs font-bold text-emerald-700">✓ {notice}</p>}

            {view.history.length > 0 && (
              <div className="pt-2 border-t border-slate-200 space-y-2">
                <p className="text-xs font-black text-slate-900">ประวัติการแก้ข้อมูลสัญญา</p>
                {view.history.map((h) => (
                  <div key={h.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 space-y-1">
                    <p className="text-slate-500">{new Date(h.changed_at).toLocaleString('th-TH')}{h.changed_by_name ? ` · ${h.changed_by_name}` : ''}</p>
                    {h.changes.map((c, i) => (
                      <p key={i}>{c.label}: <span className="line-through text-slate-400">{shown(c.field, c.from)}</span> → <span className="font-bold text-slate-900">{shown(c.field, c.to)}</span></p>
                    ))}
                    <p>เหตุผล: {h.reason}</p>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="shrink-0 p-4 sm:p-5 border-t border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-end gap-3">
        {onClose && (
          <button type="button" onClick={onClose} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl">ปิด</button>
        )}
        {view?.canConfirm && (
          <button type="button" disabled={saving} onClick={() => save('confirm')} className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs rounded-xl disabled:opacity-50">
            {saving ? 'กำลังบันทึก...' : '✓ ยืนยันข้อมูลสัญญา'}
          </button>
        )}
        {view?.canChange && !editing && (
          <button type="button" onClick={() => { setEditing(true); setNotice(null); }} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs rounded-xl">
            ✎ แก้ข้อมูลสัญญา
          </button>
        )}
        {view?.canChange && editing && (
          <>
            <button type="button" onClick={() => { setEditing(false); setForm(view.data); setReason(''); setError(null); }} className="px-5 py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-xs rounded-xl">ยกเลิกการแก้</button>
            <button type="button" disabled={saving || !reason.trim()} onClick={() => save('change')} className="px-6 py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-black text-xs rounded-xl disabled:opacity-50">
              {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default function ContractDataModal({ contractId, onClose, onSaved }: { contractId: number; onClose: () => void; onSaved?: () => void }) {
  return (
    <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain" onClick={onClose}>
      <div className="max-w-2xl w-full bg-white rounded-3xl border border-slate-200 shadow-2xl max-h-[85dvh] flex flex-col overflow-hidden my-auto" onClick={(e) => e.stopPropagation()}>
        <ContractDataPanel contractId={contractId} onClose={onClose} onSaved={onSaved} showHeader={true} />
      </div>
    </div>
  );
}
