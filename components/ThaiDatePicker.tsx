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
import { TH_MONTHS, TH_WEEKDAYS, addMonths, fromYmd, isYmd, leaseEnd, thaiDate, toYmd, todayTh } from '@/lib/thai-date';

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
          className="thai-date-popup fixed inset-x-3 bottom-3 sm:inset-x-auto sm:bottom-auto z-[1000] sm:w-80 p-3 rounded-2xl border border-white/15 bg-slate-900 text-white shadow-2xl"
        >
          <div className="flex items-center justify-between mb-2">
            <button type="button" onClick={() => shift(-1)} className="w-10 h-10 rounded-xl hover:bg-white/10 font-black" aria-label="เดือนก่อน">‹</button>
            <span className="font-black text-sm">{TH_MONTHS[first.getUTCMonth()]} {first.getUTCFullYear() + 543}</span>
            <button type="button" onClick={() => shift(1)} className="w-10 h-10 rounded-xl hover:bg-white/10 font-black" aria-label="เดือนถัดไป">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-slate-400 mb-1">
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
                className={`h-10 rounded-xl text-sm font-bold ${
                  ymd === value ? 'bg-primary text-white' : ymd === today ? 'ring-1 ring-primary text-white' : 'text-slate-200 hover:bg-white/10'
                } disabled:opacity-25 disabled:line-through disabled:hover:bg-transparent disabled:cursor-not-allowed`}
              >
                {Number(ymd.slice(8))}
              </button>
            ))}
          </div>
          <div className="flex justify-between items-center mt-2 text-xs">
            <button type="button" disabled={off(today)} onClick={() => { onChange(today); setOpen(false); }} className="px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 font-bold disabled:opacity-40">วันนี้</button>
            <button type="button" onClick={() => setOpen(false)} className="px-3 py-2 rounded-xl hover:bg-white/10 font-bold">ปิด</button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** "สัญญา 6 เดือน" / "12 เดือน": end = the day before the same date (lib/thai-date leaseEnd) */
export function LeaseShortcuts({ start, onEnd, className = '' }: { start: string; onEnd: (end: string) => void; className?: string }) {
  return (
    <span className={`inline-flex gap-1 ${className}`}>
      {[6, 12].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!isYmd(start)}
          onClick={() => onEnd(leaseEnd(start, n))}
          className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[11px] font-bold disabled:opacity-40"
        >
          สัญญา {n} เดือน
        </button>
      ))}
    </span>
  );
}
