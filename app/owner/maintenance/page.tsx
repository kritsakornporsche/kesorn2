'use client';

// Owner/manager: repair / cleaning board (lib/maintenance.ts). Keepers take waiting jobs themselves; staff may also assign
// or move a job until it is started, reject it with a reason, open jobs (also for a move-out), decide the charge of a job
// waiting for it (owner only, then it is closed), close older jobs by hand.

import { Suspense, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { statusText } from '@/lib/status-text';
import {
  CHARGE_REASON_TEXT, KIND_TEXT, PhotoPicker, kindAndTopic, PhotoStrip, StateBadge, baht, postJson, thaiDateTime,
  type ChargeReason, type Job, type Kind,
} from '@/components/maintenance/shared';

interface Keeper { id: number; name: string; phone: string | null }
interface LegacyCleaning { id: number; status: string; job_type: string | null; notes: string | null; created_at: string; room_number: string | null }

const COLUMNS: { id: string; label: string; match: (j: Job) => boolean }[] = [
  { id: 'Requested', label: 'รอดำเนินการ', match: (j) => j.state === 'Requested' },
  { id: 'Assigned', label: 'มอบงานแล้ว', match: (j) => j.state === 'Assigned' },
  { id: 'InProgress', label: 'กำลังดำเนินการ', match: (j) => j.state === 'InProgress' },
  { id: 'Done', label: 'รอตรวจสอบค่าใช้จ่าย', match: (j) => j.state === 'Done' },
];

const inputClass = 'bg-slate-950 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-white';

// useSearchParams needs a Suspense boundary
export default function OwnerMaintenancePage() {
  return (
    <Suspense fallback={<p className="text-sm text-slate-400 text-center py-12">กำลังโหลด...</p>}>
      <Board />
    </Suspense>
  );
}

function Board() {
  const { data: session } = useSession();
  const isOwner = (session?.user as any)?.role === 'owner';
  const search = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [keepers, setKeepers] = useState<Record<Kind, Keeper[]>>({ repair: [], cleaning: [] });
  const [legacyCleaning, setLegacyCleaning] = useState<LegacyCleaning[]>([]);
  const [rooms, setRooms] = useState<{ id: number; room_number: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [view, setView] = useState<'board' | 'closed' | 'legacy'>('board');
  const [showCreate, setShowCreate] = useState(!!search.get('new'));

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/owner/maintenance');
      const d = await res.json();
      if (!d.success) return setLoadError(d.message || 'โหลดบอร์ดงานไม่สำเร็จ');
      setJobs(d.data);
      setKeepers(d.keepers);
      setLegacyCleaning(d.legacyCleaning || []);
      setRooms(d.rooms || []);
    } catch {
      setLoadError('โหลดบอร์ดงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const current = jobs.filter((j) => !j.legacy);
  const closed = current.filter((j) => j.state === 'Closed' || j.state === 'Cancelled' || j.state === 'Rejected');
  const legacyOpen = jobs.filter((j) => j.legacy && !['completed', 'resolved'].includes(String(j.legacy_status || '').toLowerCase()));
  const legacyCleaningOpen = legacyCleaning.filter((c) => String(c.status).toLowerCase() !== 'completed');

  return (
    <div className="h-full w-full overflow-y-auto p-4 sm:p-8 max-w-7xl mx-auto space-y-6 pb-28 md:pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900/80 p-6 rounded-3xl border border-white/10">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white">🛠️ บอร์ดงานซ่อม & ทำความสะอาด</h1>
          <p className="text-xs text-slate-400">ผู้เช่าแจ้ง → ช่าง/แม่บ้านกดรับงาน (หรือมอบงานให้) → พนักงานปิดงาน → มีค่าใช้จ่ายเจ้าของหอตรวจสอบก่อนเสร็จสิ้น</p>
        </div>
        <button onClick={() => setShowCreate((v) => !v)} className="px-5 py-2.5 bg-primary text-white font-black text-xs rounded-xl">+ สร้างงาน</button>
      </div>

      {showCreate && <CreateForm rooms={rooms} initialKind={search.get('new') === 'cleaning' ? 'cleaning' : 'repair'} onDone={() => { setShowCreate(false); load(); }} />}

      <div className="flex flex-wrap gap-1.5 bg-slate-900/60 p-2 rounded-2xl border border-white/5">
        {([['board', 'งานที่เปิดอยู่'], ['closed', `เสร็จสิ้น/ยกเลิก (${closed.length})`], ['legacy', `งานแบบเดิม (${legacyOpen.length + legacyCleaningOpen.length})`]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setView(id)} className={`px-4 py-2 rounded-xl text-xs font-black ${view === id ? 'bg-primary text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>{label}</button>
        ))}
      </div>

      {loading ? <p className="text-sm text-slate-400 text-center py-12">กำลังโหลด...</p>
        : loadError ? <p className="text-sm text-rose-400 font-bold text-center py-12">✕ {loadError}</p>
        : view === 'board' ? (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {COLUMNS.map((col) => {
              const list = current.filter(col.match);
              return (
                <div key={col.id} className="bg-slate-900/60 rounded-2xl border border-white/5 p-3 space-y-3">
                  <p className="text-xs font-black text-slate-300">{col.label} <span className="text-slate-500">({list.length})</span></p>
                  {list.length === 0 && <p className="text-[11px] text-slate-500">ไม่มีงาน</p>}
                  {list.map((j) => <JobCard key={j.id} job={j} keepers={j.kind ? keepers[j.kind] : []} isOwner={isOwner} onDone={load} />)}
                </div>
              );
            })}
          </div>
        ) : view === 'closed' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {closed.length === 0 && <p className="text-sm text-slate-500">ไม่มีงานที่เสร็จสิ้นหรือยกเลิก</p>}
            {closed.map((j) => <JobCard key={j.id} job={j} keepers={[]} isOwner={isOwner} onDone={load} />)}
          </div>
        ) : (
          <LegacyList jobs={legacyOpen} cleaning={legacyCleaningOpen} isOwner={isOwner} onDone={load} />
        )}
    </div>
  );
}

function CreateForm({ rooms, initialKind, onDone }: { rooms: { id: number; room_number: string }[]; initialKind: Kind; onDone: () => void }) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [roomId, setRoomId] = useState('');
  const [issueType, setIssueType] = useState('');
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ dataUrl: string; bytes: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!roomId) return setError('กรุณาเลือกห้อง');
    if (!description.trim()) return setError('กรุณาระบุรายละเอียดงาน');
    setBusy(true);
    const r = await postJson('/api/owner/maintenance', { kind, roomId: Number(roomId), issueType, description, photos: photos.map((p) => p.dataUrl) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDone();
  };
  return (
    <div className="p-5 rounded-2xl border border-primary/30 bg-primary/5 space-y-3" onInput={() => error && setError(null)}>
      <p className="text-sm font-black text-white">สร้างงานใหม่</p>
      <p className="text-[11px] text-slate-400">งานของการย้ายออกให้สร้างจากหน้าย้ายออก เพื่อให้ค่าใช้จ่ายไปอยู่ในการหักเงินประกัน</p>
      <div className="flex flex-wrap gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value as Kind)} className={inputClass}>
          <option value="repair">งานซ่อม</option>
          <option value="cleaning">งานทำความสะอาด</option>
        </select>
        <select value={roomId} onChange={(e) => setRoomId(e.target.value)} className={inputClass}>
          <option value="">— เลือกห้อง —</option>
          {rooms.map((r) => <option key={r.id} value={r.id}>ห้อง {r.room_number}</option>)}
        </select>
        <input value={issueType} onChange={(e) => setIssueType(e.target.value)} placeholder="หัวข้อ เช่น ไฟฟ้า / ประปา" className={`${inputClass} w-48`} />
      </div>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="รายละเอียดงาน" className={`${inputClass} w-full`} />
      <PhotoPicker value={photos} onChange={setPhotos} />
      {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
      <button onClick={submit} disabled={busy} className="px-5 py-2.5 bg-primary text-white font-black text-xs rounded-xl disabled:opacity-50">{busy ? 'กำลังบันทึก...' : 'สร้างงาน'}</button>
    </div>
  );
}

function JobCard({ job, keepers, isOwner, onDone }: { job: Job; keepers: Keeper[]; isOwner: boolean; onDone: () => void }) {
  const [keeperId, setKeeperId] = useState(job.assigned_to ? String(job.assigned_to) : '');
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState(job.charge?.proposed !== null && job.charge?.proposed !== undefined ? String(job.charge.proposed) : '0');
  const [chargeReason, setChargeReason] = useState<'' | ChargeReason>('');
  const [chargeNote, setChargeNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const act = async (body: any, confirmText?: string) => {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true); setError(null); setNotice(null);
    const r = await postJson(`/api/owner/maintenance/${job.id}`, body);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setNotice(r.message);
    onDone();
  };
  const canAssign = job.state === 'Requested' || job.state === 'Assigned';

  return (
    <div className="bg-slate-950/70 border border-white/10 rounded-2xl p-3 space-y-2 text-xs" onInput={() => error && setError(null)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black text-white">#{job.id} · ห้อง {job.room_number || '-'}</p>
          <p className="text-[11px] text-slate-400">{kindAndTopic(job.kind, job.issue_type)}</p>
        </div>
        <StateBadge job={job} />
      </div>
      {job.move_out_settlement_id && <p className="text-[11px] text-amber-300 font-bold">งานของการย้ายออก (ค่าใช้จ่ายหักจากเงินประกัน)</p>}
      <p className="text-slate-300">{job.description}</p>
      <p className="text-[11px] text-slate-500">
        แจ้ง {thaiDateTime(job.requested_at)}{job.tenant_name ? ` · ${job.tenant_name}` : ''}{job.tenant_phone ? ` · ${job.tenant_phone}` : ''}
      </p>
      {job.assignee_name && <p className="text-[11px] text-sky-300">ผู้รับงาน: {job.assignee_name}</p>}
      {job.done_note && <p className="text-[11px] text-emerald-300">บันทึกปิดงาน: {job.done_note}</p>}
      {job.closed_reason && <p className="text-[11px] text-rose-300">เหตุผล: {job.closed_reason}</p>}
      <PhotoStrip photos={job.photos} />

      {canAssign && (
        <div className="flex flex-wrap gap-1.5">
          <select value={keeperId} onChange={(e) => setKeeperId(e.target.value)} className={inputClass}>
            <option value="">— {job.kind === 'cleaning' ? 'เลือกแม่บ้าน' : 'เลือกช่าง'} —</option>
            {keepers.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
          </select>
          <button onClick={() => (keeperId ? act({ action: 'assign', keeperUserId: Number(keeperId) }) : setError('กรุณาเลือกพนักงาน'))} disabled={busy}
            className="px-3 py-2 bg-sky-500 text-white font-black rounded-xl disabled:opacity-50">{job.state === 'Assigned' ? 'เปลี่ยนผู้รับงาน' : 'มอบงาน'}</button>
          <button onClick={() => setRejecting((v) => !v)} className="px-3 py-2 bg-rose-500/15 text-rose-300 border border-rose-500/40 font-black rounded-xl">ปฏิเสธ</button>
        </div>
      )}
      {canAssign && keepers.length === 0 && <p className="text-[11px] text-rose-400 font-bold">ยังไม่มี{job.kind === 'cleaning' ? 'แม่บ้าน' : 'ช่าง'}ที่ใช้งานอยู่ — เพิ่มที่หน้าพนักงาน</p>}
      {rejecting && (
        <div className="flex gap-1.5">
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="เหตุผล (บังคับ)" className={`${inputClass} flex-1`} />
          <button onClick={() => (reason.trim() ? act({ action: 'reject', reason }) : setError('กรุณาระบุเหตุผล'))} disabled={busy} className="px-3 py-2 bg-rose-500 text-white font-black rounded-xl">ยืนยัน</button>
        </div>
      )}

      {job.state === 'Done' && job.charge && !job.charge.decided && (
        // Waiting for the owner: deciding the charge closes the job
        <div className="p-2 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-1.5">
          <p className="text-amber-300 font-bold">
            พนักงานเสนอค่าใช้จ่าย {baht(job.charge.proposed)}{job.charge.proposed_note ? ` · ${job.charge.proposed_note}` : ''}
          </p>
          {isOwner ? (
            <>
              <div className="flex flex-wrap gap-1.5">
                <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={`${inputClass} w-28`} />
                <select value={chargeReason} onChange={(e) => setChargeReason(e.target.value as any)} className={inputClass}>
                  <option value="">— เหตุผล —</option>
                  {(Object.keys(CHARGE_REASON_TEXT) as ChargeReason[]).map((r) => <option key={r} value={r}>{CHARGE_REASON_TEXT[r]}</option>)}
                </select>
              </div>
              <input value={chargeNote} onChange={(e) => setChargeNote(e.target.value)} placeholder="หมายเหตุ (ถ้ามี)" className={`${inputClass} w-full`} />
              <button
                onClick={() => {
                  if (amount === '' || !(Number(amount) >= 0)) return setError('กรุณาระบุยอด (0 = ไม่เก็บเงิน)');
                  if (!chargeReason) return setError('กรุณาเลือกเหตุผลค่าใช้จ่าย');
                  const billed = Number(amount) > 0 && chargeReason !== 'wear_and_tear';
                  act({ action: 'charge', amount: Number(amount), reason: chargeReason, note: chargeNote },
                    billed ? `ยืนยันเรียกเก็บ ${baht(Number(amount))}${job.move_out_settlement_id ? ' (เพิ่มเป็นค่าเสียหายของการย้ายออก)' : ' (ออกบิลให้ผู้เช่า)'}?` : 'ยืนยันไม่เก็บเงิน?');
                }}
                disabled={busy}
                className="px-3 py-2 bg-amber-500 text-slate-950 font-black rounded-xl disabled:opacity-50"
              >
                ตัดสินค่าใช้จ่ายและปิดงาน
              </button>
            </>
          ) : (
            <p className="text-[11px] text-slate-400">เจ้าของหอเป็นผู้ตัดสินค่าใช้จ่าย</p>
          )}
        </div>
      )}
      {job.charge?.decided && (
        <p className="text-[11px] text-slate-300">
          ค่าใช้จ่าย: {baht(job.charge.amount)} · {job.charge.reason_text}
          {job.charge.to_settlement ? ' · อยู่ในค่าเสียหายของการย้ายออก' : job.charge.bill_id ? ` · บิล #${job.charge.bill_id}` : ''}
        </p>
      )}
      {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
      {notice && !error && <p className="text-xs text-emerald-400 font-bold">✓ {notice}</p>}
    </div>
  );
}

function LegacyList({ jobs, cleaning, isOwner, onDone }: { jobs: Job[]; cleaning: LegacyCleaning[]; isOwner: boolean; onDone: () => void }) {
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-400">งานที่แจ้งก่อนระบบบอร์ดใหม่ — จัดการด้วยมือแล้วปิดพร้อมบันทึก (ไม่มีการออกบิลจากที่นี่)</p>
      {jobs.length + cleaning.length === 0 && <p className="text-sm text-slate-500">ไม่มีงานแบบเดิมที่ยังเปิดอยู่</p>}
      {jobs.map((j) => (
        <LegacyRow key={`m${j.id}`} id={j.id} title={`#${j.id} ห้อง ${j.room_number || '-'} · ${j.issue_type || '-'}`} detail={`${j.description || ''} · ${j.status_text}`} table="maintenance" isOwner={isOwner} onDone={onDone} photos={j.photos} />
      ))}
      {cleaning.map((c) => (
        <LegacyRow key={`c${c.id}`} id={c.id} title={`งานทำความสะอาดเดิม #${c.id} ห้อง ${c.room_number || '-'}`} detail={`${c.job_type || ''} · ${c.notes || ''} · ${statusText('job', c.status)}`} table="cleaning_jobs" isOwner={isOwner} onDone={onDone} photos={[]} />
      ))}
    </div>
  );
}

function LegacyRow({ id, title, detail, table, isOwner, onDone, photos }: { id: number; title: string; detail: string; table: 'maintenance' | 'cleaning_jobs'; isOwner: boolean; onDone: () => void; photos: Job['photos'] }) {
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const close = async () => {
    if (!note.trim()) return setError('กรุณาระบุบันทึกการจัดการ');
    setBusy(true); setError(null);
    const r = await postJson(`/api/owner/maintenance/${id}`, { action: 'close_legacy', note, table: table === 'cleaning_jobs' ? 'cleaning_jobs' : undefined });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDone();
  };
  return (
    <div className="bg-slate-900/80 border border-slate-500/30 rounded-2xl p-4 space-y-2 text-xs" onInput={() => error && setError(null)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-black text-white">{title}</p>
        <span className="px-3 py-1 rounded-xl border border-slate-500/40 text-slate-300 text-[11px] font-black">งานแบบเดิม — จัดการด้วยมือ</span>
      </div>
      <p className="text-slate-400">{detail}</p>
      <PhotoStrip photos={photos} />
      {isOwner && (
        <div className="flex flex-wrap gap-1.5">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="บันทึกการจัดการ (บังคับ)" className={`${inputClass} flex-1 min-w-[220px]`} />
          <button onClick={close} disabled={busy} className="px-3 py-2 bg-slate-200 text-slate-900 font-black rounded-xl disabled:opacity-50">ปิดงาน</button>
        </div>
      )}
      {error && <p className="text-xs text-rose-400 font-bold">✕ {error}</p>}
    </div>
  );
}
