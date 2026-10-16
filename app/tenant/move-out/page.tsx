'use client';

// Tenant: give move-out notice and follow the settlement (lib/moveOut.ts through /api/tenant/move-out). Every amount
// comes from the server. Rules: notice 30 days ahead; an early move-out keeps the deposit only under สคบ. ข้อ 13
// (half of the contract, written notice >= 30 days, nothing overdue); refunds within 7 days of the return (14 when
// something is deducted).

import { useEffect, useState } from 'react';
import TenantInspectionCard from '@/components/TenantInspectionCard';

interface Settlement {
  id: number;
  contract_id: number;
  state: 'Notified' | 'Returned' | 'Settled' | 'Closed' | 'Cancelled';
  room_number: string;
  notice_date: string;
  planned_return_date: string;
  return_date: string | null;
  notice_days: number;
  contract_start: string;
  contract_end: string;
  damage_items: { amount: number; reason: string }[];
  clause13: null | { early: boolean; half: boolean; notice: boolean; noArrears: boolean; refundable: boolean; stayedDays: number; contractDays: number; noticeDays: number };
  outstanding: { id: number; title: string; outstanding: number; late_fee: number }[];
  outstanding_total: number;
  money: null | {
    deposit: number | null;
    deposit_needs_confirmation: boolean;
    offset: number;
    forfeit: number;
    refund: number;
    refund_due_date: string | null;
    refunded_at: string | null;
    has_refund_file: boolean;
    projected: boolean;
  };
}

interface Data {
  contract: { id: number; start_date: string; end_date: string; status: string; room_number: string } | null;
  settlement: Settlement | null;
  legacyRequest: { id: number; status: string; desired_date: string } | null;
}

const NOTICE_DAYS = 30;
const baht = (n: number | null | undefined) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const ymd = (v: string | null | undefined) => (v ? new Date(v).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }) : '');
const thaiDate = (v: string | null | undefined) => (v ? new Date(`${ymd(v)}T00:00:00+07:00`).toLocaleDateString('th-TH') : '-');
const todayBangkok = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

const STEPS: { state: Settlement['state']; label: string }[] = [
  { state: 'Notified', label: 'แจ้งย้ายออก' },
  { state: 'Returned', label: 'คืนห้องแล้ว' },
  { state: 'Settled', label: 'สรุปเงินประกัน' },
  { state: 'Closed', label: 'เสร็จสิ้น' },
];

export default function TenantMoveOutPage() {
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/tenant/move-out');
      const d = await res.json();
      if (!d.success) setLoadError(d.message || 'โหลดข้อมูลย้ายออกไม่สำเร็จ');
      else setData(d);
    } catch {
      setLoadError('โหลดข้อมูลย้ายออกไม่สำเร็จ');
    }
  };
  useEffect(() => { load(); }, []);

  // A closed move-out of an earlier contract gives way to the notice form of the tenant's current Active contract
  const s = data?.settlement;
  const active = s && s.state !== 'Cancelled' && !(s.state === 'Closed' && data?.contract && data.contract.id !== s.contract_id) ? s : null;

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-8 font-sans pb-28 md:pb-12">
      <div>
        <h1 className="text-3xl font-black text-white tracking-tight">🚪 แจ้งย้ายออก & เงินประกัน</h1>
        <p className="text-muted-foreground mt-2 text-sm">
          แจ้งล่วงหน้าอย่างน้อย {NOTICE_DAYS} วัน · ไม่คิดค่าเช่ารายวัน · คืนเงินประกันภายใน 7 วันหลังคืนห้อง (ตามประกาศ สคบ. พ.ศ. 2568) · 14 วันเมื่อมีรายการหัก (ตามนโยบายหอพัก)
        </p>
      </div>

      {loadError && <p className="text-sm text-rose-400 font-bold">✕ {loadError}</p>}
      {!data && !loadError && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}

      {data?.legacyRequest && (
        <div className="bg-card rounded-3xl border border-border p-8 space-y-2">
          <p className="text-lg font-black text-white">คำขอย้ายออก #{data.legacyRequest.id} (แบบเดิม)</p>
          <p className="text-sm text-muted-foreground">
            วันที่ต้องการย้ายออก {thaiDate(data.legacyRequest.desired_date)} · คำขอนี้ทำก่อนระบบใหม่ เจ้าของหอจะจัดการและแจ้งยอดเงินประกันให้ทราบโดยตรง
          </p>
        </div>
      )}

      {data && !data.legacyRequest && active && <SettlementCard s={active} onChanged={load} />}

      {data && !data.legacyRequest && !active && (data.contract?.status === 'Active'
        ? <NoticeForm contract={data.contract} onDone={load} />
        : !data.settlement && <p className="text-sm text-muted-foreground">ไม่มีสัญญาเช่าที่ใช้งานอยู่</p>)}
    </div>
  );
}

function NoticeForm({ contract, onDone }: { contract: NonNullable<Data['contract']>; onDone: () => void }) {
  const [returnDate, setReturnDate] = useState('');
  const [reason, setReason] = useState('');
  const [promptpayTarget, setPromptpayTarget] = useState('');
  const [promptpayName, setPromptpayName] = useState('');
  const [bankName, setBankName] = useState('พร้อมเพย์');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);

  const today = todayBangkok();
  const end = ymd(contract.end_date);
  const start = ymd(contract.start_date);
  const noticeDays = returnDate ? daysBetween(today, returnDate) : null;
  const early = returnDate ? daysBetween(returnDate, end) > 1 : false;
  const half = returnDate ? daysBetween(start, returnDate) * 2 >= daysBetween(start, end) : false;

  const submit = async () => {
    setError(null);
    if (!returnDate) return setError('กรุณาเลือกวันคืนห้อง');
    if (!promptpayTarget.trim()) return setError('กรุณาระบุเบอร์พร้อมเพย์หรือเลขบัญชีสำหรับรับเงินประกันคืน');
    if (!confirm(`แจ้งย้ายออก คืนห้องวันที่ ${thaiDate(returnDate)}?`)) return;
    setSending(true);
    try {
      const res = await fetch('/api/tenant/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnDate, reason, promptpayTarget, promptpayName, bankName }),
      });
      const d = await res.json();
      if (!d.success) return setError(d.message || 'ส่งเรื่องแจ้งย้ายออกไม่สำเร็จ');
      setWarnings(d.warnings || []);
      onDone();
    } catch {
      setError('ส่งเรื่องแจ้งย้ายออกไม่สำเร็จ');
    } finally {
      setSending(false);
    }
  };

  const input = 'w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-white';
  return (
    <div className="bg-card rounded-3xl border border-border p-8 space-y-5">
      <div>
        <p className="text-lg font-black text-white">แจ้งย้ายออก · ห้อง {contract.room_number}</p>
        <p className="text-xs text-muted-foreground">สัญญา {thaiDate(contract.start_date)} – {thaiDate(contract.end_date)}</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-muted-foreground">
        <label className="space-y-1">
          <span className="font-bold">วันคืนห้อง</span>
          <input type="date" min={today} value={returnDate} onChange={(e) => setReturnDate(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="font-bold">เหตุผล (ถ้ามี)</span>
          <input value={reason} onChange={(e) => setReason(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="font-bold">พร้อมเพย์ / เลขบัญชีรับเงินคืน</span>
          <input value={promptpayTarget} onChange={(e) => setPromptpayTarget(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="font-bold">ชื่อบัญชี</span>
          <input value={promptpayName} onChange={(e) => setPromptpayName(e.target.value)} className={input} />
        </label>
        <label className="space-y-1">
          <span className="font-bold">ธนาคาร</span>
          <input value={bankName} onChange={(e) => setBankName(e.target.value)} className={input} />
        </label>
      </div>

      {returnDate && (
        <div className="space-y-1 text-sm">
          <p className={noticeDays !== null && noticeDays < NOTICE_DAYS ? 'text-rose-400 font-bold' : 'text-emerald-400 font-bold'}>
            แจ้งล่วงหน้า {noticeDays} วัน{noticeDays !== null && noticeDays < NOTICE_DAYS ? ` — น้อยกว่า ${NOTICE_DAYS} วันตามกติกาของหอ` : ''}
          </p>
          {early && (
            <p className="text-amber-300 font-bold">
              ย้ายออกก่อนครบสัญญา: เงินประกันจะถูกยึดหลังหักยอดค้าง ยกเว้นเข้าเงื่อนไขตามประกาศ สคบ. พ.ศ. 2568 ครบทั้ง 3 ข้อ
              — (ก) อยู่มาแล้วอย่างน้อยครึ่งหนึ่งของสัญญา {half ? '✓' : '✕'} · (ข) แจ้งล่วงหน้าอย่างน้อย 30 วัน {noticeDays !== null && noticeDays >= NOTICE_DAYS ? '✓' : '✕'} · (ค) ไม่ค้างชำระ
            </p>
          )}
        </div>
      )}
      {warnings.map((w) => <p key={w} className="text-sm text-amber-300 font-bold">⚠️ {w}</p>)}
      {error && <p className="text-sm text-rose-400 font-bold">✕ {error}</p>}
      <button onClick={submit} disabled={sending} className="w-full sm:w-auto px-8 py-3 bg-primary text-white font-black rounded-xl disabled:opacity-50">
        {sending ? 'กำลังส่ง...' : 'ส่งเรื่องแจ้งย้ายออก'}
      </button>
    </div>
  );
}

function SettlementCard({ s, onChanged }: { s: Settlement; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const m = s.money;
  const stepIndex = STEPS.findIndex((st) => st.state === s.state);

  const cancel = async () => {
    if (!confirm('ยกเลิกการแจ้งย้ายออก?')) return;
    setCancelling(true);
    setError(null);
    try {
      const res = await fetch('/api/tenant/move-out', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlementId: s.id }),
      });
      const d = await res.json();
      if (!d.success) return setError(d.message || 'ยกเลิกไม่สำเร็จ');
      onChanged();
    } catch {
      setError('ยกเลิกไม่สำเร็จ');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-card rounded-3xl border border-border p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-2xl font-black text-white">ห้อง {s.room_number}</p>
          <div className="flex flex-wrap gap-1.5">
            {STEPS.map((st, i) => (
              <span key={st.state} className={`px-3 py-1 rounded-full text-[11px] font-black border ${
                i < stepIndex ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : i === stepIndex ? 'bg-primary/20 border-primary/40 text-white' : 'border-border text-muted-foreground'}`}>
                {i < stepIndex ? '✓ ' : ''}{st.label}
              </span>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div className="bg-secondary/30 p-4 rounded-2xl border border-border">
            <p className="text-[10px] font-black text-muted-foreground uppercase">วันที่แจ้ง</p>
            <p className="text-white font-bold">{thaiDate(s.notice_date)}</p>
          </div>
          <div className="bg-secondary/30 p-4 rounded-2xl border border-border">
            <p className="text-[10px] font-black text-muted-foreground uppercase">{s.return_date ? 'วันคืนห้อง' : 'วันคืนห้องที่แจ้ง'}</p>
            <p className="text-white font-bold">{thaiDate(s.return_date || s.planned_return_date)}</p>
          </div>
          <div className="bg-secondary/30 p-4 rounded-2xl border border-border">
            <p className="text-[10px] font-black text-muted-foreground uppercase">แจ้งล่วงหน้า</p>
            <p className={`font-bold ${s.notice_days < NOTICE_DAYS ? 'text-rose-400' : 'text-emerald-400'}`}>{s.notice_days} วัน</p>
          </div>
        </div>

        {s.clause13?.early && (
          <div className="p-4 rounded-2xl border border-border bg-secondary/20 text-sm space-y-1">
            <p className="font-black text-amber-300">ย้ายออกก่อนครบสัญญา — ตามประกาศ สคบ. พ.ศ. 2568</p>
            <p className={s.clause13.half ? 'text-emerald-400' : 'text-rose-400'}>{s.clause13.half ? '✓' : '✕'} (ก) อยู่มาแล้ว {s.clause13.stayedDays} จาก {s.clause13.contractDays} วัน</p>
            <p className={s.clause13.notice ? 'text-emerald-400' : 'text-rose-400'}>{s.clause13.notice ? '✓' : '✕'} (ข) แจ้งเป็นหนังสือล่วงหน้า {s.clause13.noticeDays} วัน</p>
            <p className={s.clause13.noArrears ? 'text-emerald-400' : 'text-rose-400'}>{s.clause13.noArrears ? '✓' : '✕'} (ค) ไม่ค้างชำระ ณ วันแจ้งและวันคืนห้อง</p>
            <p className={`font-black ${s.clause13.refundable ? 'text-emerald-400' : 'text-rose-400'}`}>
              {s.clause13.refundable ? 'เข้าเงื่อนไขครบ — ได้รับเงินประกันคืน' : 'ไม่ครบ — เงินประกันถูกยึดหลังหักยอดค้าง'}
            </p>
          </div>
        )}

        {s.outstanding.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase">ยอดค้างชำระ{s.state === 'Returned' ? ' (หักจากเงินประกัน)' : ''}</p>
            {s.outstanding.map((b) => (
              <div key={b.id} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{b.title}{b.late_fee > 0 ? ` (รวมค่าปรับ ${baht(b.late_fee)})` : ''}</span>
                <span className="font-mono text-white">{baht(b.outstanding)}</span>
              </div>
            ))}
          </div>
        )}
        {s.damage_items.length > 0 && (
          <div className="space-y-1 text-sm">
            <p className="text-[10px] font-black text-muted-foreground uppercase">ค่าเสียหายจากการตรวจห้อง</p>
            {s.damage_items.map((d, i) => (
              <div key={i} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{d.reason}</span>
                <span className="font-mono text-white">{baht(d.amount)}</span>
              </div>
            ))}
          </div>
        )}

        {m && s.state !== 'Notified' && (
          <div className="p-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/5 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
            <div><p className="text-muted-foreground text-xs">เงินประกัน</p><p className="font-mono font-black text-white">{m.deposit === null ? 'รอเจ้าของหอยืนยัน' : baht(m.deposit)}</p></div>
            <div><p className="text-muted-foreground text-xs">หักชำระยอดค้าง</p><p className="font-mono font-black text-amber-300">{baht(m.offset)}</p></div>
            <div><p className="text-muted-foreground text-xs">ยึดเงินประกัน</p><p className="font-mono font-black text-rose-300">{baht(m.forfeit)}</p></div>
            <div>
              <p className="text-muted-foreground text-xs">คืนให้คุณ{m.projected ? ' (ประมาณการ)' : ''}</p>
              <p className="font-mono font-black text-emerald-400">{baht(m.refund)}</p>
              {m.refund_due_date && !m.refunded_at && <p className="text-[11px] text-muted-foreground">ภายใน {thaiDate(m.refund_due_date)}</p>}
            </div>
          </div>
        )}
        {m && s.state === 'Settled' && s.outstanding_total > 0 && (
          <p className="text-sm text-amber-300 font-bold">ยังมียอดค้างหลังหักเงินประกัน {baht(s.outstanding_total)} — ชำระได้ที่หน้าบิลของฉัน</p>
        )}
        {s.state === 'Closed' && m && (
          <p className="text-sm text-emerald-400 font-bold">
            ✓ เสร็จสิ้น{m.refunded_at ? ` · เจ้าของหอโอนคืนเมื่อ ${new Date(m.refunded_at).toLocaleString('th-TH')}` : ''}
            {m.has_refund_file && <> · <a href={`/api/move-out/${s.id}/refund-file`} target="_blank" rel="noreferrer" className="underline">ดูสลิปคืนเงิน</a></>}
          </p>
        )}

        {s.state === 'Notified' && (
          <button onClick={cancel} disabled={cancelling} className="px-6 py-2.5 bg-rose-500/15 text-rose-300 border border-rose-500/40 font-black text-xs rounded-xl disabled:opacity-50">
            {cancelling ? 'กำลังยกเลิก...' : 'ยกเลิกการแจ้งย้ายออก'}
          </button>
        )}
        {error && <p className="text-sm text-rose-400 font-bold">✕ {error}</p>}
      </div>

      {/* Move-out inspection: shown once the owner has recorded it, compared with move-in */}
      <TenantInspectionCard key={`mo-${s.contract_id}`} contractId={s.contract_id} kind="move_out" />
    </div>
  );
}
