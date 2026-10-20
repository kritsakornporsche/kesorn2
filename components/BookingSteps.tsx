'use client';

// Booking → tenant in 7 steps (commit 28, lib/booking-steps.ts) as the owner and the booker see it: a badge with the
// step, and the checklist of the 7 steps (✓ done · ● now · ○ not yet) with who does each one. Client-safe.

import { STEP_SHORT, STEP_TITLES, WHO_TEXT, stepLabel, type BookingSteps, type StepNo } from '@/lib/booking-steps';

/** One colour per step, the same on every page (badge, tab, checklist) */
export const STEP_COLOR: Record<StepNo | 'active' | 'closed' | 'legacy', { badge: string; dot: string }> = {
  1: { badge: 'bg-orange-500/10 border-orange-500/40 text-orange-300', dot: 'bg-orange-500' },
  2: { badge: 'bg-sky-500/10 border-sky-500/40 text-sky-300', dot: 'bg-sky-500' },
  3: { badge: 'bg-violet-500/10 border-violet-500/40 text-violet-300', dot: 'bg-violet-500' },
  4: { badge: 'bg-cyan-500/10 border-cyan-500/40 text-cyan-300', dot: 'bg-cyan-500' },
  5: { badge: 'bg-fuchsia-500/10 border-fuchsia-500/40 text-fuchsia-300', dot: 'bg-fuchsia-500' },
  6: { badge: 'bg-amber-500/10 border-amber-500/40 text-amber-300', dot: 'bg-amber-500' },
  7: { badge: 'bg-blue-500/10 border-blue-500/40 text-blue-300', dot: 'bg-blue-500' },
  active: { badge: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300', dot: 'bg-emerald-500' },
  closed: { badge: 'bg-rose-500/10 border-rose-500/40 text-rose-300', dot: 'bg-rose-500' },
  legacy: { badge: 'bg-slate-500/10 border-slate-500/40 text-slate-300', dot: 'bg-slate-500' },
};

export const colorKey = (s: BookingSteps) => (s.phase === 'step' ? (s.current as StepNo) : s.phase);

/** "ขั้น 4/7 · ตรวจห้อง" badge in the step's colour */
export function StepBadge({ steps }: { steps: BookingSteps }) {
  return (
    <span className={`px-4 py-1.5 rounded-full text-xs font-black border whitespace-nowrap ${STEP_COLOR[colorKey(steps)].badge}`}>
      {stepLabel(steps)}{steps.order === 'old' ? ' · ขั้นตอนเดิม' : ''}
    </span>
  );
}

/** Colours of a checklist row: 'dark' pages (owner, /guest) or 'theme' pages that follow the site's light / dark theme */
const ROW = {
  dark: { now: 'bg-white/10 border-white/40 text-white', done: 'bg-emerald-500/5 border-emerald-500/20 text-emerald-300', todo: 'bg-slate-950/40 border-white/5 text-slate-500', sub: 'text-slate-200', subTodo: 'text-slate-500', note: 'text-amber-300', noteTodo: 'text-slate-400' },
  theme: { now: 'bg-primary/10 border-primary/50 text-foreground', done: 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300', todo: 'bg-muted/50 border-border text-muted-foreground', sub: 'text-foreground', subTodo: 'text-muted-foreground', note: 'text-amber-600 dark:text-amber-300', noteTodo: 'text-muted-foreground' },
};

/**
 * The 7 steps: done ✓ / now ● / not yet ○, who does it, and a note (e.g. "รอผู้เช่ารับทราบ").
 * Wide: one row of 7; narrow (phone): a list.
 */
export function StepChecklist({ steps, viewer = 'owner', tone = 'dark' }: { steps: BookingSteps; viewer?: 'owner' | 'booker'; tone?: 'dark' | 'theme' }) {
  const c = ROW[tone];
  const who = (w: string) => (viewer === 'booker' ? (w === 'booker' ? 'คุณ' : w === 'owner' ? 'หอพัก' : 'คุณ + หอพัก') : WHO_TEXT[w as keyof typeof WHO_TEXT]);
  return (
    <ol className="grid grid-cols-1 sm:grid-cols-7 gap-1.5" aria-label="ขั้นตอนจองจนเป็นลูกหอ">
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
export const BECOME_TENANT_TEXT = 'จะเป็นลูกหอเมื่อ: ชำระบิลค่าแรกเข้า (ขั้น 7) ครบ — สัญญามีผลทันทีและเข้าหน้าผู้เช่าได้';
