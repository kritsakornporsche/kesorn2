'use client';

// Keeper (maid / technician): "งานของฉัน" and the waiting jobs of their kind (lib/maintenance.ts through /api/keeper/jobs).
// A waiting job can be taken ("รับงาน", started at once); the owner/manager may also assign one. Finishing takes a note,
// photos and an optional proposed charge: none → เสร็จสิ้น; with one → รอตรวจสอบค่าใช้จ่าย (the owner decides).
// Waiting jobs are shown without the tenant's name / phone until taken.

import { useEffect, useState } from 'react';
import { useRates } from '@/lib/use-rates';
import KeeperSidebar from '@/app/keeper/components/KeeperSidebar';
import { KIND_TEXT, PhotoPicker, PhotoStrip, StateBadge, baht, postJson, thaiDateTime, type Job, type Kind } from '@/components/maintenance/shared';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

const inputClass = 'bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 shadow-xs focus:outline-none focus:border-primary';

export default function KeeperJobs({ kind }: { kind: Kind }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [subRole, setSubRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<'mine' | 'open' | 'done'>('mine');

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/keeper/jobs');
      const d = await res.json();
      if (!d.success) setLoadError(d.message || 'โหลดงานไม่สำเร็จ');
      else { setJobs(d.data); setSubRole(d.subRole || null); }
    } catch {
      setLoadError('โหลดงานไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const expected = kind === 'repair' ? 'technician' : 'maid';
  const wrongPage = subRole !== null && subRole !== expected;
  const mine = jobs.filter((j) => j.assigned_to !== null && ['Assigned', 'InProgress'].includes(String(j.state)));
  // Finished jobs: waiting for the owner to check the charge (Done) or closed
  const open = jobs.filter((j) => j.state === 'Requested');
  const done = jobs.filter((j) => j.assigned_to !== null && !['Assigned', 'InProgress', 'Requested'].includes(String(j.state)));
  const shown = tab === 'mine' ? mine : tab === 'open' ? open : done;

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <KeeperSidebar />
      <main className="flex-1 overflow-y-auto p-4 sm:p-8 max-w-4xl w-full mx-auto space-y-5 pb-28 md:pb-12">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900">{kind === 'repair' ? '🔧 งานซ่อมของฉัน' : '🧹 งานทำความสะอาดของฉัน'}</h1>
          <p className="text-xs text-slate-500">กดรับงานที่รอดำเนินการได้เอง หรือรองานที่เจ้าของหอ/ผู้จัดการมอบให้ · เริ่มงานและปิดงานได้เฉพาะงานของคุณ</p>
        </div>
        {wrongPage && (
          <p className="text-sm text-rose-600 font-bold">✕ บัญชีของคุณเป็น{subRole === 'maid' ? 'แม่บ้าน' : subRole === 'technician' ? 'ช่าง' : 'พนักงานที่ยังไม่กำหนดประเภท'} — หน้านี้สำหรับ{KIND_TEXT[kind]}</p>
        )}
        <div className="flex flex-wrap gap-1.5 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-xs">
          {([['mine', `งานของฉัน (${mine.length})`], ['open', `รอดำเนินการ (${open.length})`], ['done', `เสร็จแล้ว (${done.length})`]] as const).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 rounded-xl text-xs font-black transition-colors ${tab === id ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'}`}>{label}</button>
          ))}
        </div>
        {loading ? <p className="text-sm text-slate-500 text-center py-12">กำลังโหลด...</p>
          : loadError ? <p className="text-sm text-rose-600 font-bold text-center py-12">✕ {loadError}</p>
          : shown.length === 0 ? <p className="text-sm text-slate-500 text-center py-12">ไม่มีงานในแท็บนี้</p>
          : <div className="space-y-3">{shown.map((j) => <KeeperJobCard key={j.id} job={j} onDone={load} />)}</div>}
      </main>
    </div>
  );
}

function KeeperJobCard({ job, onDone }: { job: Job; onDone: () => void }) {
  // Cleaning jobs propose the dorm's cleaning fee (settings page) by default; the keeper may clear it, the owner decides
  const { cleaningFee } = useRates();
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<{ dataUrl: string; bytes: number }[]>([]);
  const [charge, setCharge] = useState('');
  const [chargeNote, setChargeNote] = useState('');
  const [finishing, setFinishing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (body: any) => {
    setBusy(true); setError(null);
    const r = await postJson('/api/keeper/jobs', body);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDone();
  };
  const finish = () => {
    if (charge !== '' && !(Number(charge) >= 0)) return setError('ยอดค่าใช้จ่ายที่เสนอไม่ถูกต้อง');
    if (Number(charge) > 0 && !chargeNote.trim()) return setError('กรุณาระบุเหตุผลของค่าใช้จ่ายที่เสนอ');
    if (Number(charge) > 0 && !note.trim() && photos.length === 0) return setError('เสนอค่าใช้จ่ายต้องมีบันทึกสิ่งที่ทำหรือรูปอย่างน้อย 1 อย่าง');
    act({ action: 'finish', id: job.id, note, photos: photos.map((p) => p.dataUrl), chargeProposed: charge === '' ? 0 : Number(charge), chargeNote });
  };

  return (
    <div className="bg-white border border-slate-200 shadow-xs rounded-2xl p-4 space-y-2 text-xs" onInput={() => error && setError(null)}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-black text-slate-900 text-sm">#{job.id} · ห้อง {job.room_number || '-'}</p>
          <p className="text-[11px] text-slate-500">{job.issue_type || '-'} · แจ้ง {thaiDateTime(job.requested_at)}</p>
        </div>
        <StateBadge job={job} />
      </div>
      {job.move_out_settlement_id && <p className="text-[11px] text-amber-800 font-bold">งานตอนผู้เช่าย้ายออก</p>}
      <p className="text-slate-700">{job.description}</p>
      {(job.tenant_name || job.tenant_phone) && <p className="text-[11px] text-slate-600">ผู้เช่า: {job.tenant_name || '-'} {job.tenant_phone ? `· 📞 ${job.tenant_phone}` : ''}</p>}
      {job.state === 'Requested' && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => act({ action: 'claim', id: job.id })} disabled={busy} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 transition-colors cursor-pointer">
            {busy ? 'กำลังบันทึก...' : '✋ รับงาน'}
          </button>
          <span className="text-[11px] text-slate-500">รับแล้วเริ่มงานทันที · ชื่อและเบอร์ผู้เช่าจะแสดงหลังรับงาน</span>
        </div>
      )}
      <PhotoStrip photos={job.photos} />
      {job.done_note && <p className="text-[11px] text-emerald-700">บันทึกปิดงาน: {job.done_note}</p>}
      {job.charge && job.charge.proposed !== null && job.charge.proposed > 0 && ['Done', 'Closed'].includes(String(job.state)) && (
        <p className="text-[11px] text-amber-800">เสนอค่าใช้จ่าย {baht(job.charge.proposed)}{job.charge.decided ? ` · เจ้าของหอตัดสินแล้ว ${baht(job.charge.amount)}` : ' · รอเจ้าของหอตรวจสอบค่าใช้จ่าย'}</p>
      )}

      {job.state === 'Assigned' && (
        <button onClick={() => act({ action: 'start', id: job.id })} disabled={busy} className="px-4 py-2 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 transition-colors cursor-pointer">
          {busy ? 'กำลังบันทึก...' : '▶ เริ่มงาน'}
        </button>
      )}
      {job.state === 'InProgress' && !finishing && (
        <button onClick={() => {
          if (job.kind === 'cleaning' && charge === '' && cleaningFee > 0) { setCharge(String(cleaningFee)); setChargeNote('ค่าทำความสะอาด'); }
          setFinishing(true);
        }} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs transition-colors cursor-pointer">✓ ปิดงาน</button>
      )}
      {job.state === 'InProgress' && finishing && (
        <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="บันทึกสิ่งที่ทำ" className={`${inputClass} w-full`} />
          <PhotoPicker value={photos} onChange={setPhotos} />
          <div className="flex flex-wrap gap-1.5">
            <input type="number" {...NUMBER_INPUT_PROPS} min="0" step="0.01" value={charge} onChange={(e) => setCharge(e.target.value)} placeholder="เสนอค่าใช้จ่าย (ว่าง = ไม่มี)" className={`${inputClass} w-48`} />
            <input value={chargeNote} onChange={(e) => setChargeNote(e.target.value)} placeholder="เหตุผล เช่น ผู้เช่าทำแตก / ค่าอะไหล่" className={`${inputClass} flex-1 min-w-[200px]`} />
          </div>
          <p className="text-[11px] text-slate-500">ไม่เสนอค่าใช้จ่าย → งานเสร็จสิ้นทันที · เสนอค่าใช้จ่าย → รอเจ้าของหอตรวจสอบและตัดสินว่าจะเรียกเก็บผู้เช่าหรือไม่</p>
          <div className="flex gap-2">
            <button onClick={() => setFinishing(false)} className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 font-bold rounded-xl transition-colors cursor-pointer">ยกเลิก</button>
            <button onClick={finish} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs disabled:opacity-50 transition-colors cursor-pointer">{busy ? 'กำลังบันทึก...' : 'ยืนยันปิดงาน'}</button>
          </div>
        </div>
      )}
      {error && <p className="text-xs text-rose-600 font-bold">✕ {error}</p>}
    </div>
  );
}
