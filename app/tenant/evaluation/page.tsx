'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';

// ─── Types ────────────────────────────────────────────────────────────────────
type TaskKey =
  | 'task_login' | 'task_qr_payment' | 'task_view_contract' | 'task_maintenance'
  | 'task_services' | 'task_chat' | 'task_submit_slip' | 'task_billing_history'
  | 'task_contract_check' | 'task_announcements' | 'task_move_out';

type SatKey =
  | 'sat_usability' | 'sat_design' | 'sat_reliability' | 'sat_performance'
  | 'sat_communication' | 'sat_qr_payment' | 'sat_notifications'
  | 'sat_maintenance' | 'sat_billing' | 'sat_overall';

// ─── Constants ────────────────────────────────────────────────────────────────
const TASKS: { key: TaskKey; label: string; desc: string }[] = [
  { key: 'task_login',           label: 'เข้าสู่ระบบและดูข้อมูลห้องพัก',        desc: 'เปิดแอป ล็อกอิน แล้วตรวจสอบข้อมูลห้องของตนเอง' },
  { key: 'task_qr_payment',      label: 'ชำระเงินผ่าน QR Code',                 desc: 'เปิดหน้าชำระเงิน สแกน QR แล้วชำระค่าเช่า' },
  { key: 'task_view_contract',   label: 'ดูสัญญาเช่าออนไลน์',                   desc: 'เปิดสัญญาเช่าในระบบและตรวจสอบข้อมูล' },
  { key: 'task_maintenance',     label: 'แจ้งซ่อมแซม',                          desc: 'กรอกแบบฟอร์มแจ้งปัญหาห้องพักในระบบ' },
  { key: 'task_services',        label: 'ขอรับบริการต่างๆ',                      desc: 'ใช้งานฟีเจอร์ขอบริการ เช่น แม่บ้าน/ช่าง' },
  { key: 'task_chat',            label: 'สื่อสารผ่านแชทกับเจ้าของ',              desc: 'ส่งข้อความหาเจ้าของหอผ่านระบบแชท' },
  { key: 'task_submit_slip',     label: 'ส่งสลิปการชำระเงิน',                    desc: 'อัปโหลดสลิปโอนเงินเพื่อยืนยันการชำระ' },
  { key: 'task_billing_history', label: 'ตรวจสอบประวัติบิล',                    desc: 'ดูรายการบิลย้อนหลังทั้งหมด' },
  { key: 'task_contract_check',  label: 'ตรวจสอบสัญญาเช่า',                     desc: 'ดูรายละเอียดสัญญาและวันหมดอายุ' },
  { key: 'task_announcements',   label: 'ดูประกาศข่าวสาร',                       desc: 'เปิดอ่านประกาศจากเจ้าของหอพัก' },
  { key: 'task_move_out',        label: 'ขอแจ้งย้ายออก',                         desc: 'กรอกแบบฟอร์มแจ้งความประสงค์ย้ายออก' },
];

const SATISFACTION_ITEMS: { key: SatKey; label: string }[] = [
  { key: 'sat_usability',      label: 'ความง่ายในการใช้งานระบบโดยรวม' },
  { key: 'sat_design',         label: 'ความสวยงามและการออกแบบหน้าจอ' },
  { key: 'sat_reliability',    label: 'ความเสถียรและความน่าเชื่อถือ' },
  { key: 'sat_performance',    label: 'ความเร็วและประสิทธิภาพการตอบสนอง' },
  { key: 'sat_communication',  label: 'ระบบการสื่อสารระหว่างผู้เช่า-เจ้าของ' },
  { key: 'sat_qr_payment',     label: 'ความสะดวกในการชำระเงินผ่าน QR Code' },
  { key: 'sat_notifications',  label: 'ระบบแจ้งเตือนและการรับข่าวสาร' },
  { key: 'sat_maintenance',    label: 'ระบบแจ้งซ่อมแซมและติดตามสถานะ' },
  { key: 'sat_billing',        label: 'ระบบบิลและประวัติการชำระเงิน' },
  { key: 'sat_overall',        label: 'ความพึงพอใจโดยรวมต่อระบบ SmartDom' },
];

const SAT_LABELS = ['', 'น้อยที่สุด', 'น้อย', 'ปานกลาง', 'มาก', 'มากที่สุด'];

// ─── Component ────────────────────────────────────────────────────────────────
export default function TenantEvaluationPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  // Section 1 - Personal info
  const [respondentCode, setRespondentCode] = useState('');
  const [gender, setGender] = useState('');
  const [stayDuration, setStayDuration] = useState('');
  const [major, setMajor] = useState('');
  const [accommodationType, setAccommodationType] = useState('');

  // Section 2 - Tasks (null = not answered, true = pass, false = fail)
  const [tasks, setTasks] = useState<Record<TaskKey, boolean | null>>(
    Object.fromEntries(TASKS.map(t => [t.key, null])) as Record<TaskKey, boolean | null>
  );

  // Section 3 - Satisfaction (0 = not rated, 1-5)
  const [satisfaction, setSatisfaction] = useState<Record<SatKey, number>>(
    Object.fromEntries(SATISFACTION_ITEMS.map(s => [s.key, 0])) as Record<SatKey, number>
  );

  // Section 4 - Suggestions
  const [suggestionLike, setSuggestionLike] = useState('');
  const [suggestionImprove, setSuggestionImprove] = useState('');
  const [suggestionOther, setSuggestionOther] = useState('');

  const totalSteps = 4;
  const progress = (step / totalSteps) * 100;

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');
    try {
      const res = await fetch('/api/tenant/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          respondent_code: respondentCode,
          gender,
          stay_duration: stayDuration,
          major,
          accommodation_type: accommodationType,
          ...tasks,
          ...satisfaction,
          suggestion_like: suggestionLike,
          suggestion_improve: suggestionImprove,
          suggestion_other: suggestionOther,
          dorm_id: 1,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSubmitted(true);
      } else {
        setError(data.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
      }
    } catch (e: any) {
      setError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Success screen ────────────────────────────────────────────────────────
  if (submitted) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="w-24 h-24 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto border-2 border-emerald-500/40">
            <svg className="w-12 h-12 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-black text-foreground">ขอบคุณสำหรับการตอบแบบสอบถาม!</h1>
          <p className="text-slate-400 text-sm">ข้อมูลของคุณถูกบันทึกเรียบร้อยแล้ว ความคิดเห็นของคุณมีประโยชน์มากสำหรับการพัฒนาระบบ SmartDom ให้ดียิ่งขึ้น</p>
          <button
            onClick={() => router.push('/tenant')}
            className="px-8 py-3 bg-primary text-white font-bold rounded-2xl hover:bg-primary/90 transition-all cursor-pointer"
          >
            กลับหน้าหลัก
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-44 md:pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-card/80 backdrop-blur-xl border-b border-border px-4 py-4">
        <div className="max-w-2xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[10px] font-black text-primary uppercase tracking-widest">แบบประเมินผู้เช่า · ชุดที่ 2</p>
              <h1 className="text-lg font-black text-foreground">SmartDom Evaluation Form</h1>
            </div>
            <span className="text-xs font-bold text-slate-400">{step}/{totalSteps}</span>
          </div>
          {/* Progress bar */}
          <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-violet-500 rounded-full transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2">
            {['ข้อมูลส่วนตัว', 'ความสามารถ', 'ความพึงพอใจ', 'ข้อเสนอแนะ'].map((label, i) => (
              <span
                key={i}
                className={cn('text-[9px] font-bold uppercase tracking-wide', step > i ? 'text-primary' : 'text-slate-500')}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 pb-32">

        {/* ── STEP 1: Personal Info ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black mb-1">ส่วนที่ 1: ข้อมูลส่วนตัว</h2>
              <p className="text-slate-400 text-sm">กรอกข้อมูลเบื้องต้นเพื่อจำแนกกลุ่มผู้ตอบแบบสอบถาม</p>
            </div>

            <div className="bg-card border border-border rounded-3xl p-6 space-y-5">
              {/* Respondent code */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">รหัสผู้ตอบ (T-____)</label>
                <input
                  type="text"
                  value={respondentCode}
                  onChange={e => setRespondentCode(e.target.value)}
                  placeholder="เช่น T-001"
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">เพศ</label>
                <div className="flex gap-3">
                  {['ชาย', 'หญิง'].map(g => (
                    <button
                      key={g}
                      onClick={() => setGender(g)}
                      className={cn(
                        'flex-1 py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer',
                        gender === g
                          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                          : 'bg-secondary/40 text-slate-400 border-border hover:border-primary/50'
                      )}
                    >
                      {g === 'ชาย' ? '👨 ชาย' : '👩 หญิง'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Stay duration */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ระยะเวลาการเช่า</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 'less_than_1', label: 'น้อยกว่า 1 ปี' },
                    { val: '1_to_2', label: '1–2 ปี' },
                    { val: 'more_than_2', label: 'มากกว่า 2 ปี' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setStayDuration(opt.val)}
                      className={cn(
                        'py-3 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer',
                        stayDuration === opt.val
                          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                          : 'bg-secondary/40 text-slate-400 border-border hover:border-primary/50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Major/Faculty */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">สาขา/คณะ</label>
                <input
                  type="text"
                  value={major}
                  onChange={e => setMajor(e.target.value)}
                  placeholder="เช่น วิทยาการคอมพิวเตอร์, วิศวกรรมศาสตร์"
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm font-bold text-foreground placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all"
                />
              </div>

              {/* Accommodation type */}
              <div>
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-2">ประเภทที่พัก</label>
                <div className="flex gap-3">
                  {[
                    { val: 'dormitory', label: '🏢 หอพัก' },
                    { val: 'apartment', label: '🏙️ อพาร์ทเมนต์' },
                  ].map(opt => (
                    <button
                      key={opt.val}
                      onClick={() => setAccommodationType(opt.val)}
                      className={cn(
                        'flex-1 py-3 rounded-xl text-sm font-bold border transition-all cursor-pointer',
                        accommodationType === opt.val
                          ? 'bg-primary text-white border-primary shadow-lg shadow-primary/20'
                          : 'bg-secondary/40 text-slate-400 border-border hover:border-primary/50'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 2: Task Completion ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black mb-1">ส่วนที่ 2: ความสามารถในการใช้งาน</h2>
              <p className="text-slate-400 text-sm">ทดสอบทำงานแต่ละอย่างแล้วระบุว่า <span className="text-emerald-400 font-bold">ทำได้</span> หรือ <span className="text-rose-400 font-bold">ทำไม่ได้</span></p>
            </div>

            <div className="space-y-3">
              {TASKS.map((task, idx) => (
                <div
                  key={task.key}
                  className={cn(
                    'bg-card border rounded-2xl p-4 transition-all',
                    tasks[task.key] === true ? 'border-emerald-500/50 bg-emerald-500/5' :
                    tasks[task.key] === false ? 'border-rose-500/50 bg-rose-500/5' :
                    'border-border'
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-black text-slate-500 shrink-0">ข้อ {idx + 1}</span>
                        <p className="text-sm font-bold text-foreground">{task.label}</p>
                      </div>
                      <p className="text-xs text-slate-400 line-clamp-1">{task.desc}</p>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => setTasks(prev => ({ ...prev, [task.key]: true }))}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer',
                          tasks[task.key] === true
                            ? 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                            : 'bg-secondary/40 text-slate-400 border-border hover:border-emerald-500/50 hover:text-emerald-400'
                        )}
                      >
                        ✓ ทำได้
                      </button>
                      <button
                        onClick={() => setTasks(prev => ({ ...prev, [task.key]: false }))}
                        className={cn(
                          'px-4 py-2 rounded-xl text-xs font-black border transition-all cursor-pointer',
                          tasks[task.key] === false
                            ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/20'
                            : 'bg-secondary/40 text-slate-400 border-border hover:border-rose-500/50 hover:text-rose-400'
                        )}
                      >
                        ✗ ทำไม่ได้
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Task summary */}
            <div className="bg-card border border-border rounded-2xl p-4 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-400">ตอบแล้ว {Object.values(tasks).filter(v => v !== null).length}/{TASKS.length} ข้อ</span>
              <div className="flex gap-3 text-xs font-black">
                <span className="text-emerald-400">✓ ทำได้ {Object.values(tasks).filter(v => v === true).length}</span>
                <span className="text-rose-400">✗ ทำไม่ได้ {Object.values(tasks).filter(v => v === false).length}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: Satisfaction ─────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black mb-1">ส่วนที่ 3: ความพึงพอใจ</h2>
              <p className="text-slate-400 text-sm">ให้คะแนนความพึงพอใจ <span className="font-bold text-foreground">1 = น้อยที่สุด</span> ถึง <span className="font-bold text-foreground">5 = มากที่สุด</span></p>
            </div>

            <div className="space-y-4">
              {SATISFACTION_ITEMS.map((item, idx) => (
                <div key={item.key} className="bg-card border border-border rounded-2xl p-4">
                  <div className="mb-3">
                    <span className="text-[10px] font-black text-slate-500">ข้อ {idx + 1}</span>
                    <p className="text-sm font-bold text-foreground">{item.label}</p>
                  </div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map(val => (
                      <button
                        key={val}
                        onClick={() => setSatisfaction(prev => ({ ...prev, [item.key]: val }))}
                        className={cn(
                          'flex-1 py-3 rounded-xl text-sm font-black border transition-all cursor-pointer flex flex-col items-center gap-1',
                          satisfaction[item.key] === val
                            ? val <= 2 ? 'bg-rose-500 text-white border-rose-500 shadow-lg shadow-rose-500/20'
                              : val === 3 ? 'bg-amber-500 text-slate-900 border-amber-500 shadow-lg shadow-amber-500/20'
                              : 'bg-emerald-500 text-white border-emerald-500 shadow-lg shadow-emerald-500/20'
                            : 'bg-secondary/40 text-slate-400 border-border hover:border-primary/50'
                        )}
                      >
                        <span>{val}</span>
                        <span className="text-[8px] font-bold leading-none opacity-70 hidden sm:block">{SAT_LABELS[val]}</span>
                      </button>
                    ))}
                  </div>
                  {satisfaction[item.key] > 0 && (
                    <p className="text-[10px] text-slate-400 mt-2 text-right font-bold">
                      เลือก: {SAT_LABELS[satisfaction[item.key]]} ({satisfaction[item.key]}/5)
                    </p>
                  )}
                </div>
              ))}
            </div>

            {/* Average so far */}
            {Object.values(satisfaction).some(v => v > 0) && (
              <div className="bg-primary/10 border border-primary/30 rounded-2xl p-4 text-center">
                <p className="text-xs text-primary font-bold uppercase tracking-widest mb-1">คะแนนเฉลี่ยเบื้องต้น</p>
                <p className="text-3xl font-black text-foreground">
                  {(Object.values(satisfaction).filter(v => v > 0).reduce((a, b) => a + b, 0) /
                    Object.values(satisfaction).filter(v => v > 0).length).toFixed(2)}
                  <span className="text-base text-slate-400 font-bold"> / 5.00</span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── STEP 4: Suggestions ──────────────────────────────────────────── */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-black mb-1">ส่วนที่ 4: ข้อเสนอแนะ</h2>
              <p className="text-slate-400 text-sm">แสดงความคิดเห็นเพื่อช่วยพัฒนาระบบให้ดียิ่งขึ้น (ไม่บังคับ)</p>
            </div>

            <div className="space-y-4">
              <div className="bg-card border border-border rounded-2xl p-4">
                <label className="block text-xs font-black text-emerald-400 uppercase tracking-widest mb-3">
                  💚 จุดเด่นที่ชอบในระบบ
                </label>
                <textarea
                  value={suggestionLike}
                  onChange={e => setSuggestionLike(e.target.value)}
                  rows={3}
                  placeholder="ระบบส่วนไหนที่คุณชอบและคิดว่าทำได้ดี..."
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-emerald-500 transition-all resize-none"
                />
              </div>

              <div className="bg-card border border-border rounded-2xl p-4">
                <label className="block text-xs font-black text-amber-400 uppercase tracking-widest mb-3">
                  🔧 ส่วนที่ควรปรับปรุง
                </label>
                <textarea
                  value={suggestionImprove}
                  onChange={e => setSuggestionImprove(e.target.value)}
                  rows={3}
                  placeholder="ส่วนไหนที่ยังมีปัญหาหรือควรพัฒนาเพิ่มเติม..."
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-amber-500 transition-all resize-none"
                />
              </div>

              <div className="bg-card border border-border rounded-2xl p-4">
                <label className="block text-xs font-black text-slate-400 uppercase tracking-widest mb-3">
                  💡 ข้อเสนอแนะอื่นๆ
                </label>
                <textarea
                  value={suggestionOther}
                  onChange={e => setSuggestionOther(e.target.value)}
                  rows={3}
                  placeholder="ความคิดเห็นเพิ่มเติมหรือฟีเจอร์ที่อยากให้มีในอนาคต..."
                  className="w-full bg-secondary/40 border border-border rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-slate-500 focus:outline-none focus:border-primary transition-all resize-none"
                />
              </div>
            </div>

            {/* Summary before submit */}
            <div className="bg-card border border-border rounded-2xl p-5 space-y-3">
              <h3 className="text-sm font-black text-foreground">สรุปก่อนส่ง</h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-400">งานที่ทำสำเร็จ: </span>
                  <span className="font-black text-emerald-400">
                    {Object.values(tasks).filter(v => v === true).length}/{TASKS.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400">คะแนนเฉลี่ย: </span>
                  <span className="font-black text-primary">
                    {Object.values(satisfaction).some(v => v > 0)
                      ? (Object.values(satisfaction).filter(v => v > 0).reduce((a, b) => a + b, 0) /
                          Object.values(satisfaction).filter(v => v > 0).length).toFixed(2)
                      : '-'
                    }/5.00
                  </span>
                </div>
              </div>
            </div>

            {error && (
              <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-4 text-rose-400 text-sm font-bold">
                ⚠️ {error}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fixed bottom navigation */}
      <div className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] md:bottom-0 left-0 right-0 bg-card/95 backdrop-blur-xl border-t border-border p-3.5 sm:p-4 z-40 safe-area-bottom">
        <div className="max-w-2xl mx-auto flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(s => s - 1)}
              className="px-6 py-3.5 bg-secondary/60 hover:bg-secondary text-foreground font-bold rounded-2xl border border-border transition-all cursor-pointer"
            >
              ← ย้อนกลับ
            </button>
          )}
          {step < totalSteps ? (
            <button
              onClick={() => setStep(s => s + 1)}
              className="flex-1 py-3.5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl shadow-xl shadow-primary/20 transition-all cursor-pointer active:scale-95"
            >
              ถัดไป →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 transition-all cursor-pointer active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  กำลังส่ง...
                </>
              ) : (
                '✓ ส่งแบบประเมิน'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
