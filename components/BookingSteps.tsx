'use client';

// Booking → tenant in 4 steps (lib/booking-steps.ts) as the owner and the booker see it: a badge with the
// step, and the checklist of the 4 steps (✓ done · ● now · ○ not yet) with who does each one. Client-safe.

import { STEP_SHORT, STEP_TITLES, WHO_TEXT, stepLabel, type BookingSteps, type StepNo } from '@/lib/booking-steps';

/** One colour per step, the same on every page (badge, tab, checklist) */
export const STEP_COLOR: Record<StepNo | 'active' | 'closed' | 'legacy', { badge: string; dot: string }> = {
  1: { badge: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500' },
  2: { badge: 'bg-sky-50 border-sky-200 text-sky-700', dot: 'bg-sky-500' },
  3: { badge: 'bg-violet-50 border-violet-200 text-violet-700', dot: 'bg-violet-500' },
  4: { badge: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500' },
  active: { badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' },
  closed: { badge: 'bg-rose-50 border-rose-200 text-rose-700', dot: 'bg-rose-500' },
  legacy: { badge: 'bg-slate-100 border-slate-200 text-slate-700', dot: 'bg-slate-500' },
};

export const colorKey = (s: BookingSteps) => (s.phase === 'step' ? (s.current as StepNo) : s.phase);

/** "ขั้น 3/5 · ตรวจรับ & สัญญา" badge in the step's colour */
export function StepBadge({ steps }: { steps: BookingSteps }) {
  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-black border whitespace-nowrap ${STEP_COLOR[colorKey(steps)].badge}`}>
      {stepLabel(steps)}{steps.order === 'old' ? ' · ขั้นตอนเดิม' : ''}
    </span>
  );
}

/** Colours of a checklist row: clean white theme */
const ROW = {
  dark: { now: 'bg-primary/10 border-primary/40 text-primary font-bold shadow-xs', done: 'bg-emerald-50 border-emerald-200 text-emerald-800', todo: 'bg-slate-50 border-slate-200 text-slate-400', sub: 'text-slate-700', subTodo: 'text-slate-400', note: 'text-amber-700', noteTodo: 'text-slate-400' },
  theme: { now: 'bg-primary/10 border-primary/40 text-primary font-bold shadow-xs', done: 'bg-emerald-50 border-emerald-200 text-emerald-800', todo: 'bg-slate-50 border-slate-200 text-slate-400', sub: 'text-slate-700', subTodo: 'text-slate-400', note: 'text-amber-700', noteTodo: 'text-slate-400' },
};

/**
 * The 4 steps: done ✓ / now ● / not yet ○, who does it, and a note (e.g. "รอยืนยันข้อมูลสัญญาและตรวจห้อง").
 * Wide: one row of 4; narrow (phone): a list.
 */
export function StepChecklist({ steps, viewer = 'owner', tone = 'dark' }: { steps: BookingSteps; viewer?: 'owner' | 'booker'; tone?: 'dark' | 'theme' }) {
  const c = ROW[tone];
  const who = (w: string) => (viewer === 'booker' ? (w === 'booker' ? 'คุณ' : w === 'owner' ? 'หอพัก' : 'คุณ + หอพัก') : WHO_TEXT[w as keyof typeof WHO_TEXT]);
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-4 gap-1.5" aria-label="ขั้นตอนจองจนเป็นลูกหอ">
      {steps.items.map((it) => {
        const now = it.state === 'current';
        const done = it.state === 'done';
        return (
          <li
            key={it.no}
            aria-current={now ? 'step' : undefined}
            className={`flex sm:flex-col items-start gap-2 sm:gap-0.5 px-2.5 py-2 rounded-xl border text-[11px] leading-snug ${
              now ? c.now : done ? c.done : c.todo
            }`}
          >
            <span className="font-black whitespace-nowrap">
              {done ? '✓' : now ? '●' : '○'} {it.no}. <span className="sm:hidden">{STEP_TITLES[it.no]}</span><span className="hidden sm:inline">{STEP_SHORT[it.no]}</span>
            </span>
            <span className={now ? c.sub : c.subTodo}>{who(it.who)}</span>
            {it.note && <span className={`${now ? c.note : c.noteTodo} font-bold`}>{it.note}</span>}
          </li>
        );
      })}
    </ol>
  );
}

/** "ขั้นถัดไป: …" line (who + what) */
export function NextStepLine({ steps, viewer = 'owner', tone = 'dark' }: { steps: BookingSteps; viewer?: 'owner' | 'booker'; tone?: 'dark' | 'theme' }) {
  if (!steps.next) return null;
  const mine = (viewer === 'owner' && steps.next.who === 'owner') || (viewer === 'booker' && steps.next.who === 'booker');
  const c = ROW[tone];
  return (
    <p className={`text-xs font-bold ${mine ? c.note : c.noteTodo}`}>
      {mine ? '👉 ' : '⏳ '}ขั้นถัดไป: {steps.next.text}{viewer === 'booker' ? (mine ? ' (คุณทำ)' : ' (หอพักทำ)') : ''}
    </p>
  );
}

/** For the booker: when they become a tenant */
export const BECOME_TENANT_TEXT = 'จะเป็นลูกหอเมื่อ: ชำระบิลค่าแรกเข้า (ขั้น 4) ครบ — สัญญามีผลทันทีและเข้าหน้าผู้เช่าได้';
