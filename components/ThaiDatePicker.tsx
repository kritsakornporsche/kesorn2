'use client';

// The one date picker of the site (commit 28-9): shows and picks dates in Thai with the Buddhist era (not the browser's
// mm/dd/yyyy box), days outside min / max (or refused by isDisabled) cannot be picked, works with a finger on a phone
// (large day buttons, the calendar opens as a sheet at the bottom of a narrow screen) and with the keyboard (Escape
// closes, every day is a button). Values stay 'YYYY-MM-DD' (lib/thai-date) — the server checks them again.
// The calendar is drawn on document.body next to the field (a window that scrolls would cut it off otherwise) and opens
// upward when there is no room below.
// LeaseShortcuts: "6 เดือน" / "12 เดือน" set the end date to the day before the same date (lib/thai-date leaseEnd).

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { TH_MONTHS, TH_WEEKDAYS, addMonths, fromYmd, isYmd, leaseEnd, thaiDate, toYmd, todayTh, detectLeaseMonths } from '@/lib/thai-date';

interface Props {
  value: string;
  onChange: (value: string) => void;
  /** earliest / latest day that can be picked ('YYYY-MM-DD', inclusive) */
  min?: string;
  max?: string;
  isDisabled?: (ymd: string) => boolean;
  disabled?: boolean;
  placeholder?: string;
  /** classes of the button (the field) */
  className?: string;
  id?: string;
  'aria-label'?: string;
}

export default function ThaiDatePicker({ value, onChange, min, max, isDisabled, disabled, placeholder = 'เลือกวันที่', className, id, ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const start = isYmd(value) ? value : isYmd(min) && min > todayTh() ? min : todayTh();
  const [view, setView] = useState(start.slice(0, 7));
  const box = useRef<HTMLDivElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // where the calendar goes on a wide screen (a phone gets the sheet at the bottom instead)
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r || window.innerWidth < 640) { setAt(null); return; }
      const w = 320, h = pop.current?.offsetHeight || 400;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
      const top = r.bottom + 8 + h <= window.innerHeight || r.top - 8 - h < 0 ? r.bottom + 8 : r.top - 8 - h;
      setAt({ left, top });
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [open]);

  useEffect(() => { if (open) setView((isYmd(value) ? value : start).slice(0, 7)); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent | TouchEvent) => { const n = e.target as Node; if (!box.current?.contains(n) && !pop.current?.contains(n)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); document.removeEventListener('keydown', esc); };
  }, [open]);

  const off = (ymd: string) => (isYmd(min) && ymd < min) || (isYmd(max) && ymd > max) || Boolean(isDisabled?.(ymd));
  const first = fromYmd(`${view}-01`);
  const daysIn = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: daysIn }, (_, i) => toYmd(new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1))))];
  const shift = (n: number) => setView(addMonths(`${view}-01`, n).slice(0, 7));
  const today = todayTh();

  return (
    <div ref={box} className="relative">
      <button
        type="button"
        id={id}
        aria-label={rest['aria-label']}
        aria-haspopup="dialog"
        aria-expanded={open}
        disabled={disabled}
        data-value={value}
        onClick={() => setOpen((o) => !o)}
        className={`${className || ''} text-left flex items-center justify-between gap-2 disabled:opacity-60 disabled:cursor-not-allowed`}
      >
        <span className={`whitespace-nowrap ${isYmd(value) ? '' : 'opacity-60'}`} title={isYmd(value) ? thaiDate(value, true) : undefined}>{isYmd(value) ? thaiDate(value) : placeholder}</span>
        <span aria-hidden>📅</span>
      </button>
      {open && typeof document !== 'undefined' && createPortal(
        <div
          ref={pop}
          role="dialog"
          aria-label="เลือกวันที่"
          style={at ? { left: at.left, top: at.top } : undefined}
          className="thai-date-popup fixed inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-auto z-[1000] sm:w-80 p-3 rounded-2xl border border-slate-200 bg-white text-slate-900 shadow-2xl"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-700 font-black" aria-label="เดือนก่อน">‹</button>
            <span className="font-black text-sm text-slate-900">{TH_MONTHS[first.getUTCMonth()]} {first.getUTCFullYear() + 543}</span>
            <button type="button" onClick={() => shift(1)} className="w-10 h-10 rounded-xl hover:bg-slate-100 text-slate-700 font-black" aria-label="เดือนถัดไป">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-500 font-semibold mb-1">
            {TH_WEEKDAYS.map((w) => <span key={w}>{w}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((ymd, i) => ymd === null ? <span key={`x${i}`} /> : (
              <button
                key={ymd}
                type="button"
                disabled={off(ymd)}
                aria-pressed={ymd === value}
                aria-label={thaiDate(ymd, true)}
                data-ymd={ymd}
                onClick={() => { onChange(ymd); setOpen(false); }}
                className={`h-10 rounded-xl text-sm font-bold transition-colors ${
                  ymd === value ? 'bg-primary text-white shadow-xs' : ymd === today ? 'ring-1 ring-primary text-primary font-bold hover:bg-slate-50' : 'text-slate-700 hover:bg-slate-100'
                } disabled:opacity-25 disabled:line-through disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                {Number(ymd.slice(8))}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 text-xs">
            <button type="button" disabled={off(today)} onClick={() => { onChange(today); setOpen(false); }} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 disabled:opacity-40 transition-colors">วันนี้</button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold border border-slate-200 transition-colors">ปิด</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** "สัญญา 6 เดือน" / "12 เดือน": end = the day before the same date (lib/thai-date leaseEnd) */
export function LeaseShortcuts({
  start,
  onEnd,
  className = '',
  months = [3, 6, 9, 12],
}: {
  start: string;
  onEnd: (end: string) => void;
  className?: string;
  months?: number[];
}) {
  return (
    <span className={`inline-flex gap-1 ${className}`}>
      {months.map((n) => (
        <button
          key={n}
          type="button"
          disabled={!isYmd(start)}
          onClick={() => onEnd(leaseEnd(start, n))}
          className="px-2 py-0.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[11px] font-bold disabled:opacity-40 transition-colors cursor-pointer"
        >
          {n} ด.
        </button>
      ))}
    </span>
  );
}


/**
 * Interactive Lease Month Bar (3 to 12 months)
 * Supports dragging the slider bar and tapping individual month buttons directly.
 */
export function LeaseMonthBar({
  start,
  end,
  onEnd,
  className = '',
}: {
  start: string;
  end?: string;
  onEnd: (end: string) => void;
  className?: string;
}) {
  const currentMonths = detectLeaseMonths(start, end ?? '');

  const handleChange = (m: number) => {
    if (isYmd(start)) {
      onEnd(leaseEnd(start, m));
    }
  };

  return (
    <div className={'space-y-2 ' + className}>
      {/* Slider Range Bar */}
      <div className="relative flex items-center px-1">
        <input
          type="range"
          min={3}
          max={12}
          step={1}
          value={currentMonths}
          disabled={!isYmd(start)}
          onChange={(e) => handleChange(Number(e.target.value))}
          className="w-full h-2.5 bg-secondary rounded-full appearance-none cursor-pointer accent-primary focus:outline-none border border-border/80 disabled:opacity-40"
          aria-label="แถบเลือกระยะเวลาสัญญา 3-12 เดือน"
        />
      </div>

      {/* Segmented Button Bar (3 - 12 Months) */}
      <div className="grid grid-cols-10 gap-1 bg-background/60 p-1 rounded-xl border border-border/70">
        {[3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => {
          const active = currentMonths === m;
          return (
            <button
              key={m}
              type="button"
              disabled={!isYmd(start)}
              onClick={() => handleChange(m)}
              className={
                'py-1.5 rounded-lg text-xs font-bold transition-all flex flex-col items-center justify-center cursor-pointer ' +
                (active
                  ? 'bg-primary text-white shadow-md shadow-primary/25 font-black scale-105 z-10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60') +
                ' disabled:opacity-30 disabled:cursor-not-allowed'
              }
              title={'สัญญา ' + m + ' เดือน'}
            >
              <span>{m}</span>
              <span className="text-[9px] font-medium opacity-75 scale-90 -mt-0.5">ด.</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
