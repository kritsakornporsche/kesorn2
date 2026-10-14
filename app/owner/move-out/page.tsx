'use client';

// Owner/manager: move-outs (lib/moveOut.ts). Every amount comes from the server; nothing is calculated here.
// Notified -> record the room return (final meter, final bill) -> damages / deposit -> settle -> refund slip -> closed.
// Managers record returns and inspections and see bills; the deposit, forfeits and refunds are the owner's.
// Requests from before commit 12 are shown as "คำขอแบบเดิม — จัดการด้วยมือ".

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { InspectionButton } from '@/components/InspectionModal';
import { checkPaperFile } from '@/lib/paper-file-check';
import { kindAndTopic } from '@/components/maintenance/shared';

type State = 'Notified' | 'Returned' | 'Settled' | 'Closed' | 'Cancelled';

interface Settlement {
  id: number;
  contract_id: number;
  state: State;
  room_number: string;
  notice_date: string;
  paper_notice_date: string | null;
  planned_return_date: string;
  return_date: string | null;
  notice_days: number;
  contract_start: string;
  contract_end: string;
  final_bill_id: number | null;
  damage_items: { amount: number; reason: string; job_id?: number }[];
  jobs: { id: number; kind: string | null; issue_type: string | null; state: string | null; charge_proposed: number | null; charge_amount: number | null; charge_reason: string | null; charge_decided: boolean }[];
  clause13: null | { early: boolean; half: boolean; notice: boolean; noArrears: boolean; refundable: boolean; stayedDays: number; contractDays: number; noticeDays: number };
  outstanding: { id: number; title: string; bill_type: string; outstanding: number; late_fee: number }[];
  outstanding_total: number;
  money: null | {
    deposit_source: 'system' | 'outside' | 'legacy_income' | 'legacy_outside' | null;
    deposit_needs_confirmation: boolean;
    suggested_deposit: number | null;
    deposit: number | null;
    offset: number;
    forfeit: number;
    refund: number;
    refund_due_date: string | null;
    refund_due_status: 'ok' | 'soon' | 'overdue' | null;
    refunded_at: string | null;
    has_refund_file: boolean;
    projected: boolean;
  };
}

interface Row {
  request_id: number;
  request_status: string;
  desired_date: string | null;
  reason: string | null;
  promptpay_target: string | null;
  promptpay_name: string | null;
  bank_name: string | null;
  contract_id: number | null;
  room_number: string;
  tenant_name: string | null;
  tenant_phone: string | null;
  contract_status: string | null;
  legacy: boolean;
  legacy_open: boolean;
  settlement: Settlement | null;
}

type Tab = 'Notified' | 'Returned' | 'Settled' | 'Closed' | 'Legacy';
const TABS: { id: Tab; label: string }[] = [
  { id: 'Notified', label: 'แจ้งย้ายออก' },
  { id: 'Returned', label: 'คืนห้องแล้ว รอสรุปเงินประกัน' },
  { id: 'Settled', label: 'รอคืนเงินประกัน' },
  { id: 'Closed', label: 'ปิดแล้ว' },
  { id: 'Legacy', label: 'คำขอแบบเดิม' },
];

const SOURCE_TEXT: Record<string, string> = {
  system: 'รับผ่านระบบ (ค่าจอง + บิลแรกเข้า)',
  outside: 'รับนอกระบบ (ตามสัญญา)',
  legacy_income: 'สัญญาแบบเดิม — เคยบันทึกเป็นรายรับ (ยืนยันโดยเจ้าของหอ)',
  legacy_outside: 'สัญญาแบบเดิม — รับนอกระบบ (ยืนยันโดยเจ้าของหอ)',
};

const baht = (n: number | null | undefined) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const thaiDate = (ymd: string | null | undefined) => (ymd ? new Date(`${String(ymd).slice(0, 10)}T00:00:00+07:00`).toLocaleDateString('th-TH') : '-');
const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const tabOf = (r: Row): Tab | null => (r.legacy ? (r.legacy_open ? 'Legacy' : 'Closed') : r.settlement && r.settlement.state !== 'Cancelled' ? r.settlement.state : null);

function Check({ ok, label }: { ok: boolean; label: string }) {
  return <span className={`text-[11px] font-bold ${ok ? 'text-emerald-400' : 'text-rose-400'}`}>{ok ? '✓' : '✕'} {label}</span>;
}

function RefundDueBadge({ status, date }: { status: 'ok' | 'soon' | 'overdue' | null; date: string | null }) {
  if (!status || !date) return null;
  const style = status === 'overdue' ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
    : status === 'soon' ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
      : 'bg-slate-500/10 border-slate-500/30 text-slate-300';
  const text = status === 'overdue' ? 'เลยกำหนดคืนเงินประกัน' : status === 'soon' ? 'ใกล้ครบกำหนดคืนเงินประกัน' : 'กำหนดคืนเงินประกัน';
  return <span className={`px-3 py-1 rounded-xl border text-[11px] font-black ${style}`}>{status === 'overdue' ? '⚠️' : '⏰'} {text} {thaiDate(date)}</span>;
}

export default function OwnerMoveOutPage() {
  const { data: session } = useSession();
  const isOwner = (session?.user as any)?.role === 'owner';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('Notified');

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/owner/move-out');
      const data = await res.json();
      if (!data.success) setLoadError(data.message || 'โหลดรายการย้ายออกไม่สำเร็จ');
      else setRows(data.data);
    } catch {
      setLoadError('โหลดรายการย้ายออกไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const counts = Object.fromEntries(TABS.map((t) => [t.id, rows.filter((r) => tabOf(r) === t.id).length])) as Record<Tab, number>;
  const dueAlerts = rows.filter((r) => r.settlement?.money?.refund_due_status === 'overdue' || r.settlement?.money?.refund_due_status === 'soon');
  const shown = rows.filter((r) => tabOf(r) === tab);

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-8 max-w-6xl mx-auto space-y-6 pb-28 md:pb-12">
      <div className="bg-slate-900/80 p-6 rounded-3xl border border-white/10 shadow-xl space-y-1">
        <h1 className="text-xl sm:text-2xl font-black text-white">📦 ย้ายออก & เงินประกัน</h1>
        <p className="text-xs text-slate-400">
          แจ้งย้ายออก → บันทึกคืนห้อง (มิเตอร์วันคืนห้อง + บิลสุดท้าย) → ตรวจห้อง / ค่าเสียหาย → หักเงินประกัน → คืนเงิน
        </p>
      </div>

      {dueAlerts.length > 0 && (
        <div className="p-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 space-y-1">
          <p className="text-sm font-black text-amber-300">⏰ เงินประกันที่ต้องคืนใกล้ครบกำหนด / เลยกำหนด (สคบ. ข้อ 10)</p>
          {dueAlerts.map((r) => (
            <p key={r.request_id} className={`text-xs font-bold ${r.settlement!.money!.refund_due_status === 'overdue' ? 'text-rose-300' : 'text-amber-200'}`}>
              ห้อง {r.room_number} · {r.tenant_name || '-'} · {baht(r.settlement!.money!.refund)} · ภายใน {thaiDate(r.settlement!.money!.refund_due_date)}
              {r.settlement!.money!.refund_due_status === 'overdue' ? ' (เลยกำหนดแล้ว)' : ''}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-2 rounded-2xl border border-white/5">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 rounded-xl text-xs font-black ${tab === t.id ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
          >
            {t.label} {counts[t.id] > 0 && <span className="ml-1 px-1.5 py-0.5 rounded-md bg-white/10 text-[10px]">{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-slate-400 text-center py-12">กำลังโหลด...</p>
      ) : loadError ? (
        <p className="text-sm text-rose-400 font-bold text-center py-12">✕ {loadError}</p>
      ) : shown.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-12">ไม่มีรายการในแท็บนี้</p>
      ) : (
        <div className="space-y-4">
          {shown.map((r) => (r.legacy
            ? <LegacyCard key={r.request_id} row={r} isOwner={isOwner} onDone={load} />
            : <MoveOutCard key={r.request_id} row={r} onDone={load} />))}
        </div>
      )}
    </div>
  );
}

function useAction(onDone: () => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const run = async (url: string, body: any) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => ({ success: false, message: 'ทำรายการไม่สำเร็จ' }));
      if (!data.success) {
        setError(data.message || 'ทำรายการไม่สำเร็จ');
        return false;
      }
      setNotice(data.message || 'บันทึกแล้ว');
      onDone();
      return true;
    } catch (e: any) {
      setError(`ทำรายการไม่สำเร็จ: ${e?.message || ''}`);
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, notice, setError, run };
}

function Messages({ error, notice }: { error: string | null; notice: string | null }) {
  return (
    <>
      {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
      {notice && !error && <p className="text-xs text-emerald-400 font-bold">✓ {notice}</p>}
    </>
  );
}

const inputClass = 'bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white';

function MoveOutCard({ row, onDone }: { row: Row; onDone: () => void }) {
  const s = row.settlement!;
  const money = s.money;
  const act = useAction(onDone);
  const url = `/api/owner/move-out/${s.id}`;
  const c13 = s.clause13;

  return (
    <div className="bg-slate-900/90 border border-white/10 rounded-3xl p-6 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/10">
        <div>
          <h3 className="text-lg font-black text-white">ห้อง {s.room_number} · {row.tenant_name || '-'}</h3>
          <p className="text-[11px] text-slate-400">
            📞 {row.tenant_phone || '-'} · สัญญา {thaiDate(s.contract_start)} – {thaiDate(s.contract_end)} · คำขอ #{row.request_id}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {money && <RefundDueBadge status={money.refund_due_status} date={money.refund_due_date} />}
          <InspectionButton contractId={s.contract_id} kind="move_out" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">การแจ้งย้ายออก</p>
          <p className="text-white">แจ้งในระบบ: {thaiDate(s.notice_date)}{s.paper_notice_date ? ` · หนังสือกระดาษ: ${thaiDate(s.paper_notice_date)}` : ''}</p>
          <p className="text-white">วันคืนห้อง{s.return_date ? '' : 'ที่แจ้ง'}: {thaiDate(s.return_date || s.planned_return_date)}</p>
          <p className={s.notice_days < 30 ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
            แจ้งล่วงหน้า {s.notice_days} วัน {s.notice_days < 30 ? '(น้อยกว่า 30 วัน)' : ''}
          </p>
          {row.reason && <p className="text-slate-400">เหตุผล: {row.reason}</p>}
        </div>
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">สคบ. ข้อ 13</p>
          {!c13 ? (
            <p className="text-slate-400">ตรวจตอนบันทึกการคืนห้อง</p>
          ) : !c13.early ? (
            <p className="text-emerald-400 font-bold">อยู่ครบสัญญา — คืนเงินประกันตามปกติ</p>
          ) : (
            <>
              <p className="text-amber-300 font-bold">ย้ายออกก่อนครบสัญญา</p>
              <Check ok={c13.half} label={`(ก) อยู่ ${c13.stayedDays} จาก ${c13.contractDays} วัน (≥ ครึ่งหนึ่ง)`} />
              <br /><Check ok={c13.notice} label={`(ข) แจ้งเป็นหนังสือล่วงหน้า ${c13.noticeDays} วัน (≥ 30)`} />
              <br /><Check ok={c13.noArrears} label="(ค) ไม่ค้างชำระ ณ วันแจ้งและวันคืนห้อง" />
              <p className={`font-black ${c13.refundable ? 'text-emerald-400' : 'text-rose-400'}`}>
                {c13.refundable ? 'เข้าเงื่อนไขครบ — คืนเงินประกัน' : 'ไม่ครบ — ยึดเงินประกันหลังหักยอดค้าง'}
              </p>
            </>
          )}
        </div>
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">บัญชีรับเงินคืน</p>
          <p className="text-white">{row.promptpay_name || '-'}</p>
          <p className="text-white font-mono">{row.bank_name || '-'} {row.promptpay_target || ''}</p>
        </div>
      </div>

      {s.outstanding.length > 0 && (
        <div className="bg-slate-950/60 p-3 rounded-2xl border border-white/5 space-y-1 text-xs">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            ยอดค้างชำระ{s.state === 'Returned' ? ' (ค่าปรับล่าช้าคิดถึงวันคืนห้อง)' : ''}
          </p>
          {s.outstanding.map((b) => (
            <div key={b.id} className="flex justify-between gap-3">
              <span className="text-slate-300">#{b.id} {b.title}{b.late_fee > 0 ? ` (รวมค่าปรับ ${baht(b.late_fee)})` : ''}</span>
              <span className="font-mono font-bold text-white">{baht(b.outstanding)}</span>
            </div>
          ))}
          <div className="flex justify-between border-t border-white/10 pt-1">
            <span className="text-slate-400 font-bold">รวม</span>
            <span className="font-mono font-black text-amber-300">{baht(s.outstanding_total)}</span>
          </div>
        </div>
      )}

      {s.state === 'Notified' && <ReturnForm s={s} act={act} url={url} />}
      <MoveOutJobs s={s} onDone={onDone} />
      {s.state === 'Returned' && money && <DamagesForm s={s} act={act} url={url} />}
      {s.state !== 'Notified' && money && <MoneyBlock s={s} act={act} url={url} />}
      {!money && s.state !== 'Notified' && (
        <p className="text-xs text-slate-400">ส่วนเงินประกัน ค่าเสียหาย และการคืนเงิน เจ้าของหอเป็นผู้ดำเนินการ</p>
      )}
      <Messages error={act.error} notice={act.notice} />
    </div>
  );
}

function ReturnForm({ s, act, url }: { s: Settlement; act: ReturnType<typeof useAction>; url: string }) {
  const [returnDate, setReturnDate] = useState(s.planned_return_date <= todayBangkok() ? s.planned_return_date : todayBangkok());
  const [finalMeter, setFinalMeter] = useState('');
  const [prevMeter, setPrevMeter] = useState('');
  const [paperNoticeDate, setPaperNoticeDate] = useState('');
  const submit = () => {
    if (finalMeter.trim() === '') {
      act.setError('กรุณากรอกเลขมิเตอร์ไฟฟ้าวันคืนห้อง');
      return;
    }
    if (!confirm(`บันทึกการคืนห้องวันที่ ${thaiDate(returnDate)}? สัญญาจะสิ้นสุดและออกบิลสุดท้ายทันที`)) return;
    act.run(url, { action: 'return', returnDate, finalMeter, prevMeter: prevMeter || undefined, paperNoticeDate: paperNoticeDate || undefined });
  };
  return (
    <div className="p-4 rounded-2xl border border-primary/30 bg-primary/5 space-y-3">
      <p className="text-sm font-black text-white">บันทึกการคืนห้อง</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs text-slate-300">
        <label className="space-y-1">
          <span className="block font-bold">วันคืนห้อง</span>
          <input type="date" max={todayBangkok()} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={`${inputClass} w-full`} />
        </label>
        <label className="space-y-1">
          <span className="block font-bold">เลขมิเตอร์ไฟวันคืนห้อง (บังคับ)</span>
          <input type="number" min="0" step="0.01" value={finalMeter} onChange={(e) => setFinalMeter(e.target.value)} className={`${inputClass} w-full`} />
        </label>
        <label className="space-y-1">
          <span className="block font-bold">เลขมิเตอร์ก่อนหน้า</span>
          <input type="number" min="0" step="0.01" value={prevMeter} onChange={(e) => setPrevMeter(e.target.value)} placeholder="เฉพาะเมื่อระบบไม่มี" className={`${inputClass} w-full`} />
        </label>
        <label className="space-y-1">
          <span className="block font-bold">วันที่ได้รับหนังสือแจ้ง (กระดาษ)</span>
          <input type="date" max={returnDate} value={paperNoticeDate} onChange={(e) => setPaperNoticeDate(e.target.value)} className={`${inputClass} w-full`} />
        </label>
      </div>
      <p className="text-[11px] text-slate-400">
        บิลสุดท้าย: ถ้าเดือนที่คืนห้องยังไม่มีบิลรายเดือน = ค่าเช่าเต็มเดือน + ค่าไฟถึงวันคืนห้อง + ค่าน้ำ + ส่วนกลาง · ถ้ามีแล้ว = ค่าไฟส่วนต่างเท่านั้น (ไม่คิดค่าเช่ารายวัน)
      </p>
      <button onClick={submit} disabled={act.busy} className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-black text-xs rounded-xl disabled:opacity-50">
        {act.busy ? 'กำลังบันทึก...' : '✓ บันทึกการคืนห้อง'}
      </button>
    </div>
  );
}

const JOB_STATE_TEXT: Record<string, string> = {
  Requested: 'รอดำเนินการ', Assigned: 'มอบงานแล้ว', InProgress: 'กำลังดำเนินการ', Done: 'รอตรวจสอบค่าใช้จ่าย', Closed: 'เสร็จสิ้น',
  Cancelled: 'ยกเลิก', Rejected: 'ปฏิเสธ',
};

/**
 * Repair / cleaning jobs of this move-out (lib/maintenance.ts): their proposed and decided charges, so the same damage
 * is not entered again from the inspection. A decided charge becomes a damage item of this settlement by itself.
 */
function MoveOutJobs({ s, onDone }: { s: Settlement; onDone: () => void }) {
  const [kind, setKind] = useState<'cleaning' | 'repair'>('cleaning');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = s.state === 'Notified' || s.state === 'Returned';
  const create = async () => {
    setError(null);
    if (!description.trim()) return setError('กรุณาระบุรายละเอียดงาน');
    setBusy(true);
    try {
      const res = await fetch('/api/owner/maintenance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, description, settlementId: s.id }),
      });
      const d = await res.json();
      if (!d.success) return setError(d.message || 'สร้างงานไม่สำเร็จ');
      setDescription('');
      onDone();
    } catch {
      setError('สร้างงานไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };
  if (!canCreate && s.jobs.length === 0) return null;
  const open = s.jobs.filter((j) => ['Requested', 'Assigned', 'InProgress'].includes(String(j.state)));
  return (
    <div className="p-4 rounded-2xl border border-sky-500/30 bg-sky-500/5 space-y-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-white">งานซ่อม / ทำความสะอาดของการย้ายออกนี้</p>
        <a href="/owner/maintenance" className="text-[11px] text-sky-300 underline">ไปบอร์ดงาน</a>
      </div>
      {s.jobs.length === 0 && <p className="text-slate-500">ยังไม่มีงาน</p>}
      {s.jobs.map((j) => (
        <div key={j.id} className="flex flex-wrap justify-between gap-2">
          <span className="text-slate-300">#{j.id} {kindAndTopic(j.kind, j.issue_type)} · {JOB_STATE_TEXT[String(j.state)] || '-'}</span>
          <span className="font-mono text-white">
            {j.charge_decided ? `ตัดสินแล้ว ${baht(j.charge_amount)}${j.charge_reason === 'wear_and_tear' ? ' (ไม่เก็บ)' : ''}`
              : j.charge_proposed !== null ? `เสนอ ${baht(j.charge_proposed)} · รอตัดสิน` : '-'}
          </span>
        </div>
      ))}
      {open.length > 0 && <p className="text-amber-300 font-bold">มีงานที่ยังไม่เสร็จ {open.length} งาน — ค่าใช้จ่ายของงานจะเข้าค่าเสียหายเมื่อเจ้าของหอตัดสินหลังงานเสร็จ (หักเงินประกันได้แม้งานยังไม่เสร็จ)</p>}
      {canCreate && (
        <div className="flex flex-wrap gap-1.5">
          <select value={kind} onChange={(e) => setKind(e.target.value as any)} className={inputClass}>
            <option value="cleaning">งานทำความสะอาด</option>
            <option value="repair">งานซ่อม</option>
          </select>
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="รายละเอียดงาน" className={`${inputClass} flex-1 min-w-[200px]`} />
          <button onClick={create} disabled={busy} className="px-3 py-2 bg-sky-500 text-white font-black rounded-xl disabled:opacity-50">{busy ? 'กำลังสร้าง...' : '+ สร้างงานของการย้ายออก'}</button>
        </div>
      )}
      {error && <p className="text-rose-400 font-bold">✕ {error}</p>}
    </div>
  );
}

function DamagesForm({ s, act, url }: { s: Settlement; act: ReturnType<typeof useAction>; url: string }) {
  const [items, setItems] = useState<{ amount: string; reason: string }[]>(
    // Items from repair / cleaning jobs are kept by the server and shown below, not edited here
    s.damage_items.filter((d) => !d.job_id).map((d) => ({ amount: String(d.amount), reason: d.reason }))
  );
  const [pullError, setPullError] = useState<string | null>(null);
  const pull = async () => {
    setPullError(null);
    try {
      const res = await fetch(`/api/owner/contracts/${s.contract_id}/inspection?kind=move_out`);
      const data = await res.json();
      if (!data.success) return setPullError(data.message || 'โหลดผลตรวจห้องไม่สำเร็จ');
      const bad = (data.inspection?.items || []).filter((it: any) => it.condition_status !== 'Good');
      if (bad.length === 0) return setPullError(data.inspection ? 'ผลตรวจห้องตอนย้ายออกไม่มีรายการชำรุด/สูญหาย' : 'ยังไม่ได้ตรวจห้องตอนย้ายออก');
      setItems((list) => [...list, ...bad
        .filter((it: any) => !list.some((l) => l.reason.startsWith(it.item_name)))
        .map((it: any) => ({ amount: '', reason: `${it.item_name} (${it.condition_status === 'Missing' ? 'สูญหาย' : 'ชำรุด'})${it.note ? ` ${it.note}` : ''}` }))]);
    } catch {
      setPullError('โหลดผลตรวจห้องไม่สำเร็จ');
    }
  };
  const save = () => {
    const bad = items.findIndex((it) => !(Number(it.amount) > 0) || !it.reason.trim());
    if (bad !== -1) {
      act.setError(`ค่าเสียหายรายการที่ ${bad + 1}: กรุณาระบุยอดมากกว่า 0 และเหตุผล`);
      return;
    }
    act.run(url, { action: 'damages', items: items.map((it) => ({ amount: Number(it.amount), reason: it.reason })) });
  };
  return (
    <div className="p-4 rounded-2xl border border-white/10 bg-slate-950/40 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-black text-white">ค่าเสียหายจากการตรวจห้อง (เจ้าของหอระบุยอด + เหตุผล)</p>
        <button onClick={pull} className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white text-[11px] font-bold rounded-xl">ดึงรายการชำรุด/สูญหายจากผลตรวจห้อง</button>
      </div>
      {pullError && <p className="text-xs text-rose-400 font-bold">✕ {pullError}</p>}
      {s.damage_items.filter((d) => d.job_id).map((d) => (
        <div key={`job-${d.job_id}`} className="flex flex-wrap justify-between gap-2 text-xs text-sky-200">
          <span>🔧 {d.reason} (จากงาน #{d.job_id} — แก้ที่บอร์ดงานไม่ได้หลังตัดสิน)</span>
          <span className="font-mono">{baht(d.amount)}</span>
        </div>
      ))}
      {items.length === 0 && <p className="text-xs text-slate-500">ไม่มีค่าเสียหายที่ระบุเอง</p>}
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input value={it.reason} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} placeholder="เหตุผล" className={`${inputClass} flex-1 min-w-[200px]`} />
          <input type="number" min="0" step="0.01" value={it.amount} onChange={(e) => setItems((l) => l.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} placeholder="ยอด (บาท)" className={`${inputClass} w-32`} />
          <button onClick={() => setItems((l) => l.filter((_, j) => j !== i))} className="text-rose-300 text-xs font-bold px-2">✕</button>
        </div>
      ))}
      <div className="flex gap-2">
        <button onClick={() => setItems((l) => [...l, { amount: '', reason: '' }])} className="px-3 py-2 border border-dashed border-white/20 text-white/70 text-xs font-bold rounded-xl">+ เพิ่มรายการ</button>
        <button onClick={save} disabled={act.busy} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl disabled:opacity-50">บันทึกค่าเสียหาย</button>
      </div>
    </div>
  );
}

function MoneyBlock({ s, act, url }: { s: Settlement; act: ReturnType<typeof useAction>; url: string }) {
  const m = s.money!;
  // Contract deposit as the starting value only; the owner checks and confirms it
  const [amount, setAmount] = useState(m.suggested_deposit !== null ? String(m.suggested_deposit) : '');
  const [recordedAs, setRecordedAs] = useState<'' | 'income' | 'outside'>('');
  const [note, setNote] = useState('');
  const [fileError, setFileError] = useState<string | null>(null);

  const confirmDeposit = () => {
    if (!(Number(amount) >= 0) || amount === '') return act.setError('กรุณาระบุยอดเงินประกันที่รับไว้');
    if (!recordedAs) return act.setError('กรุณาเลือกว่าเงินประกันนี้เคยบันทึกเป็นรายรับในระบบ หรือรับนอกระบบ');
    if (!note.trim()) return act.setError('กรุณาระบุที่มาของยอด');
    act.run(url, { action: 'confirm_deposit', amount: Number(amount), recordedAs, note });
  };
  const settle = () => {
    if (!confirm('หักยอดค้างจากเงินประกันตามสรุปนี้? ทำแล้วย้อนกลับไม่ได้')) return;
    act.run(url, { action: 'settle' });
  };
  const uploadSlip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const problem = await checkPaperFile(file);
    setFileError(problem);
    if (problem) return;
    const reader = new FileReader();
    reader.onloadend = () => act.run(url, { action: 'refund', file: reader.result });
    reader.onerror = () => setFileError('อ่านไฟล์ไม่สำเร็จ');
    reader.readAsDataURL(file);
  };

  return (
    <div className="p-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 space-y-3 text-xs">
      <p className="text-sm font-black text-white">เงินประกัน {m.projected ? '(ประมาณการก่อนหัก)' : ''}</p>
      {m.deposit_needs_confirmation ? (
        <div className="space-y-2">
          <p className="text-rose-300 font-bold">สัญญานี้ไม่มีบิลค่าจอง/บิลเข้าอยู่ในระบบ — กรุณาตรวจและยืนยันยอดเงินประกันที่รับไว้จริง{m.suggested_deposit !== null ? ` (ค่าตั้งต้นจากสัญญา ${baht(m.suggested_deposit)})` : ''}</p>
          <div className="flex flex-wrap items-center gap-2">
            <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="ยอดเงินประกัน" className={`${inputClass} w-36`} />
            <select value={recordedAs} onChange={(e) => setRecordedAs(e.target.value as any)} className={inputClass}>
              <option value="">— เงินนี้บันทึกไว้อย่างไร —</option>
              <option value="income">เคยบันทึกเป็นรายรับในระบบ (ปรับประเภท)</option>
              <option value="outside">รับนอกระบบ (ไม่เคยบันทึก)</option>
            </select>
            <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="ที่มาของยอด เช่น ใบเสร็จเลขที่" className={`${inputClass} flex-1 min-w-[200px]`} />
            <button onClick={confirmDeposit} disabled={act.busy} className="px-4 py-2 bg-sky-500 text-white font-black rounded-xl disabled:opacity-50">ยืนยันยอด</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div><p className="text-slate-400">เงินประกัน</p><p className="font-mono font-black text-white">{baht(m.deposit)}</p><p className="text-[10px] text-slate-500">{SOURCE_TEXT[m.deposit_source || ''] || ''}</p></div>
          <div><p className="text-slate-400">หักชำระยอดค้าง</p><p className="font-mono font-black text-amber-300">{baht(m.offset)}</p></div>
          <div><p className="text-slate-400">ยึดเงินประกัน</p><p className="font-mono font-black text-rose-300">{baht(m.forfeit)}</p></div>
          <div><p className="text-slate-400">คืนผู้เช่า</p><p className="font-mono font-black text-emerald-400">{baht(m.refund)}</p>
            {m.refund_due_date && <p className="text-[10px] text-slate-400">ภายใน {thaiDate(m.refund_due_date)}</p>}</div>
        </div>
      )}
      {m.projected && s.outstanding_total > (m.deposit || 0) && m.deposit !== null && (
        <p className="text-amber-300 font-bold">ยอดค้างมากกว่าเงินประกัน — ผู้เช่าต้องชำระส่วนที่เหลือ {baht(s.outstanding_total - (m.deposit || 0))} เอง</p>
      )}

      {s.state === 'Returned' && !m.deposit_needs_confirmation && (
        <button onClick={settle} disabled={act.busy} className="px-5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl disabled:opacity-50">
          {act.busy ? 'กำลังบันทึก...' : '✓ หักเงินประกันตามสรุปนี้'}
        </button>
      )}
      {s.state === 'Settled' && m.refund > 0 && (
        <div className="space-y-1">
          <label className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-black rounded-xl cursor-pointer">
            {act.busy ? '⏳ กำลังบันทึก...' : `📤 แนบสลิปโอนคืน ${baht(m.refund)} และปิดเรื่อง`}
            <input type="file" accept="image/jpeg,image/png,application/pdf" className="hidden" disabled={act.busy} onChange={uploadSlip} />
          </label>
          {fileError && <p className="text-rose-400 font-bold">✕ {fileError}</p>}
        </div>
      )}
      {s.state === 'Closed' && (
        <p className="text-emerald-400 font-bold">
          ✓ ปิดเรื่องแล้ว{m.refunded_at ? ` · คืนเงินเมื่อ ${new Date(m.refunded_at).toLocaleString('th-TH')}` : ''}
          {m.has_refund_file && <> · <a href={`/api/move-out/${s.id}/refund-file`} target="_blank" rel="noreferrer" className="underline">ดูสลิปคืนเงิน</a></>}
        </p>
      )}
    </div>
  );
}

function LegacyCard({ row, isOwner, onDone }: { row: Row; isOwner: boolean; onDone: () => void }) {
  const act = useAction(onDone);
  const [note, setNote] = useState('');
  const [returnDate, setReturnDate] = useState(row.desired_date ? String(row.desired_date).slice(0, 10) : '');
  const close = () => {
    if (!note.trim()) return act.setError('กรุณาระบุบันทึกการจัดการ (เช่น คืนเงินประกันด้วยมือแล้ว ยอด… วันที่…)');
    if (!confirm('ปิดคำขอแบบเดิม? สัญญาจะสิ้นสุดและห้องจะว่าง (ระบบไม่บันทึกการเงินให้)')) return;
    act.run(`/api/owner/move-out/${row.request_id}`, { action: 'close_legacy', note, returnDate: returnDate || undefined });
  };
  return (
    <div className="bg-slate-900/90 border border-slate-500/30 rounded-3xl p-6 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-black text-white">ห้อง {row.room_number} · {row.tenant_name || '-'}</h3>
        <span className="px-3 py-1 rounded-xl border border-slate-500/40 text-slate-300 text-[11px] font-black">คำขอแบบเดิม — จัดการด้วยมือ</span>
      </div>
      <p className="text-xs text-slate-400">
        คำขอ #{row.request_id} · วันที่ต้องการย้ายออก {thaiDate(row.desired_date)} · สถานะคำขอ {row.request_status} · สถานะสัญญา {row.contract_status || '-'}
      </p>
      <p className="text-xs text-slate-400">
        คำขอนี้ทำก่อนระบบย้ายออกใหม่ ยอดเงินประกันและบิลต้องจัดการด้วยมือ (รับเงินผ่านหน้าบิล / บันทึกบัญชีเอง) แล้วจึงปิดคำขอ
      </p>
      {row.legacy_open && isOwner && (
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={inputClass} />
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="บันทึกการจัดการ (บังคับ)" className={`${inputClass} flex-1 min-w-[240px]`} />
          <button onClick={close} disabled={act.busy} className="px-4 py-2 bg-slate-200 text-slate-900 font-black text-xs rounded-xl disabled:opacity-50">ปิดคำขอแบบเดิม</button>
        </div>
      )}
      <Messages error={act.error} notice={act.notice} />
    </div>
  );
}
