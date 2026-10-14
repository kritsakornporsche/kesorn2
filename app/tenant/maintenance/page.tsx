'use client';

// Tenant: report a repair or ask for cleaning for the room of the Active contract, follow each job, withdraw it while
// nobody is assigned (lib/maintenance.ts through /api/tenant/maintenance). Photos open through the checked route.

import { useEffect, useState } from 'react';
import { KIND_TEXT, PhotoPicker, PhotoStrip, StateBadge, baht, postJson, thaiDateTime, type Job, type Kind } from '@/components/maintenance/shared';

const ISSUE_TYPES: Record<Kind, string[]> = {
  repair: ['ระบบไฟฟ้า', 'ระบบประปา', 'เครื่องปรับอากาศ', 'เฟอร์นิเจอร์', 'ประตู/หน้าต่าง/กุญแจ', 'อื่นๆ'],
  cleaning: ['ทำความสะอาดทั่วไป', 'ทำความสะอาดห้องน้ำ', 'อื่นๆ'],
};
const STEPS = ['Requested', 'Assigned', 'InProgress', 'Done', 'Closed'] as const;
const STEP_TEXT: Record<(typeof STEPS)[number], string> = {
  Requested: 'รอดำเนินการ', Assigned: 'มอบงานแล้ว', InProgress: 'กำลังดำเนินการ', Done: 'รอตรวจสอบค่าใช้จ่าย', Closed: 'เสร็จสิ้น',
};

export default function TenantMaintenancePage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => {
    setLoadError(null);
    try {
      const res = await fetch('/api/tenant/maintenance');
      const d = await res.json();
      if (!d.success) setLoadError(d.message || 'โหลดรายการไม่สำเร็จ');
      else setJobs(d.data);
    } catch {
      setLoadError('โหลดรายการไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-6 lg:p-10 max-w-4xl mx-auto space-y-6 font-sans pb-28 md:pb-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-black text-white">🛠️ แจ้งซ่อม & ทำความสะอาด</h1>
          <p className="text-sm text-muted-foreground mt-1">แจ้งได้เฉพาะห้องตามสัญญาเช่าที่ใช้งานอยู่ · เจ้าของหอจะมอบงานให้ช่างหรือแม่บ้าน</p>
        </div>
        <button onClick={() => setShowForm((v) => !v)} className="px-6 py-3 bg-primary text-white font-black rounded-xl text-sm">+ แจ้งเรื่องใหม่</button>
      </div>

      {showForm && <ReportForm onDone={() => { setShowForm(false); load(); }} />}

      {loading ? <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
        : loadError ? <p className="text-sm text-rose-400 font-bold">✕ {loadError}</p>
        : jobs.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีรายการแจ้ง</p>
        : <div className="space-y-4">{jobs.map((j) => <JobItem key={j.id} job={j} onChanged={load} />)}</div>}
    </div>
  );
}

function ReportForm({ onDone }: { onDone: () => void }) {
  const [kind, setKind] = useState<Kind>('repair');
  const [issueType, setIssueType] = useState(ISSUE_TYPES.repair[0]);
  const [description, setDescription] = useState('');
  const [photos, setPhotos] = useState<{ dataUrl: string; bytes: number }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    setError(null);
    if (!description.trim()) return setError('กรุณาอธิบายปัญหา');
    setBusy(true);
    const r = await postJson('/api/tenant/maintenance', { kind, issueType, description, photos: photos.map((p) => p.dataUrl) });
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onDone();
  };
  const input = 'w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-white';
  return (
    <div className="bg-card rounded-3xl border border-border p-6 space-y-4">
      <div className="flex gap-2">
        {(['repair', 'cleaning'] as Kind[]).map((k) => (
          <button key={k} onClick={() => { setKind(k); setIssueType(ISSUE_TYPES[k][0]); }}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${kind === k ? 'bg-primary text-white border-primary' : 'border-border text-muted-foreground'}`}>
            {KIND_TEXT[k]}
          </button>
        ))}
      </div>
      <select value={issueType} onChange={(e) => setIssueType(e.target.value)} className={input}>
        {ISSUE_TYPES[kind].map((t) => <option key={t}>{t}</option>)}
      </select>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="อธิบายปัญหา / สิ่งที่ต้องการ" className={input} />
      <PhotoPicker value={photos} onChange={setPhotos} />
      {kind === 'cleaning' && <p className="text-[11px] text-muted-foreground">งานทำความสะอาดอาจมีค่าบริการ เจ้าของหอจะแจ้งเป็นบิลหลังงานเสร็จ</p>}
      {error && <p className="text-sm text-rose-400 font-bold">✕ {error}</p>}
      <button onClick={submit} disabled={busy} className="px-8 py-3 bg-primary text-white font-black rounded-xl disabled:opacity-50">{busy ? 'กำลังส่ง...' : 'ส่งเรื่อง'}</button>
    </div>
  );
}

function JobItem({ job, onChanged }: { job: Job; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const cancel = async () => {
    if (!confirm('ยกเลิกคำขอนี้?')) return;
    setBusy(true); setError(null);
    const r = await postJson('/api/tenant/maintenance', { id: job.id }, 'DELETE');
    setBusy(false);
    if (!r.ok) return setError(r.message);
    onChanged();
  };
  // 'รอตรวจสอบค่าใช้จ่าย' only for a job that went through it (a charge waiting or decided)
  const steps = STEPS.filter((st) => st !== 'Done' || job.state === 'Done' || !!job.charge?.decided);
  const step = job.state ? steps.indexOf(job.state as any) : -1;
  return (
    <div className="bg-card rounded-3xl border border-border p-6 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-black text-white">{job.issue_type || (job.kind ? KIND_TEXT[job.kind] : 'รายการแจ้ง')} · ห้อง {job.room_number || '-'}</p>
          <p className="text-xs text-muted-foreground">#{job.id} · แจ้งเมื่อ {thaiDateTime(job.requested_at)}</p>
        </div>
        <StateBadge job={job} />
      </div>
      {!job.legacy && step >= 0 && (
        <div className="flex flex-wrap gap-1.5">
          {steps.map((st, i) => (
            <span key={st} className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${i <= step ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'border-border text-muted-foreground'}`}>
              {i <= step ? '✓ ' : ''}{STEP_TEXT[st]}
            </span>
          ))}
        </div>
      )}
      <p className="text-sm text-white/80">{job.description}</p>
      {job.assignee_name && <p className="text-xs text-sky-300">ผู้รับผิดชอบ: {job.assignee_name}</p>}
      {job.done_note && <p className="text-xs text-emerald-300">ผลการทำงาน: {job.done_note}</p>}
      {job.closed_reason && job.state === 'Rejected' && <p className="text-xs text-rose-300">เหตุผล: {job.closed_reason}</p>}
      {job.charge?.decided && (
        <p className="text-xs text-amber-300 font-bold">
          {Number(job.charge.amount) > 0 && job.charge.reason !== 'wear_and_tear'
            ? `ค่าใช้จ่าย ${baht(job.charge.amount)} (${job.charge.reason_text})${job.charge.to_settlement ? ' · หักจากเงินประกันตอนย้ายออก' : ' · ดูบิลที่หน้าบิลของฉัน'}`
            : 'ไม่มีค่าใช้จ่าย'}
        </p>
      )}
      <PhotoStrip photos={job.photos} />
      {job.state === 'Requested' && (
        <button onClick={cancel} disabled={busy} className="px-4 py-2 bg-rose-500/15 text-rose-300 border border-rose-500/40 font-black text-xs rounded-xl disabled:opacity-50">
          {busy ? 'กำลังยกเลิก...' : 'ยกเลิกคำขอ'}
        </button>
      )}
      {error && <p className="text-sm text-rose-400 font-bold">✕ {error}</p>}
    </div>
  );
}
