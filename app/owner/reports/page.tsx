'use client';

import { useEffect, useRef, useState } from 'react';
import { formatBaht } from '@/lib/format';
import { INCOME_SPLIT_NOTE, TODAY_NOTE } from '@/lib/report-text';
import type { OwnerReport } from '@/lib/reports';

// Owner report (lib/reports.ts): a month of income / expense from the accounts, the 6-month chart, deposits held,
// and today's occupancy and unpaid bills. Managers see occupancy and unpaid bills only (the server leaves money out).

const SHORT_MONTH = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const shortMonth = (m: string) => { const [y, mm] = m.split('-').map(Number); return `${SHORT_MONTH[mm - 1]} ${String(y + 543).slice(2)}`; };
const longMonth = (m: string) => { const [y, mm] = m.split('-').map(Number); return new Date(Date.UTC(y, mm - 1, 15)).toLocaleDateString('th-TH', { month: 'long', year: 'numeric', timeZone: 'UTC' }); };
const thisMonth = () => new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 7);

// Chart colors (validated: dataviz validate_palette — light on #FFFFFF, dark on #111827)
const CHART_CSS = `
.report-chart { --series-income: #2a78d6; --series-expense: #eb6834; --chart-grid: #e2e8f0; --chart-axis: #64748b; }
.dark .report-chart { --series-income: #3987e5; --series-expense: #d95926; --chart-grid: #1f2937; --chart-axis: #94a3b8; }
.report-chart .bar { transition: opacity .15s; }
.report-chart g.month:hover .bar { opacity: .8; }
`;

function niceMax(v: number) {
  if (v <= 0) return 1000;
  const p = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / p) * p;
}

/** Top-rounded bar (4px) anchored on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  if (h <= 0) return '';
  const r = Math.min(4, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function IncomeExpenseChart({ months }: { months: { month: string; income: number; expense: number }[] }) {
  // Drawn at the container's real width so labels stay ~11px on a phone and on a wide screen
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 480 ? 200 : 260, L = 44, R = 4, T = 12, B = 26;
  const max = niceMax(Math.max(...months.flatMap((m) => [m.income, m.expense])));
  const plotH = H - T - B;
  const slot = (W - L - R) / months.length;
  const barW = Math.min(26, (slot - 18) / 2);
  const y = (v: number) => T + plotH - (Math.max(0, v) / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return (
    <div className="report-chart" ref={box}>
      <style>{CHART_CSS}</style>
      <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground mb-2" aria-hidden="true">
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--series-income)' }} />รายรับ</span>
        <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm" style={{ background: 'var(--series-expense)' }} />รายจ่าย</span>
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="block max-w-full" role="img" aria-label={`กราฟแท่งรายรับและรายจ่าย 6 เดือน ${months.map((m) => `${shortMonth(m.month)} รายรับ ${formatBaht(m.income)} รายจ่าย ${formatBaht(m.expense)}`).join(' · ')}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth={1} />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize={11} fill="var(--chart-axis)">{t >= 1000 ? `${(t / 1000).toLocaleString('th-TH', { maximumFractionDigits: 1 })}k` : t.toLocaleString('th-TH')}</text>
          </g>
        ))}
        {months.map((m, i) => {
          const cx = L + slot * i + slot / 2;
          const x1 = cx - barW - 1;
          const x2 = cx + 1;
          return (
            <g key={m.month} className="month">
              {/* larger hover target than the bars */}
              <rect x={L + slot * i} y={T} width={slot} height={plotH} fill="transparent">
                <title>{`${longMonth(m.month)}\nรายรับ ${formatBaht(m.income)}\nรายจ่าย ${formatBaht(m.expense)}`}</title>
              </rect>
              <path className="bar" d={barPath(x1, y(m.income), barW, T + plotH - y(m.income))} fill="var(--series-income)" pointerEvents="none" />
              <path className="bar" d={barPath(x2, y(m.expense), barW, T + plotH - y(m.expense))} fill="var(--series-expense)" pointerEvents="none" />
              <text x={cx} y={H - 8} textAnchor="middle" fontSize={W < 420 ? 10 : 11} fill="var(--chart-axis)">{shortMonth(m.month)}</text>
            </g>
          );
        })}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} stroke="var(--chart-axis)" strokeWidth={1} />
      </svg>
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer text-muted-foreground">ดูเป็นตาราง</summary>
        <table className="w-full mt-2">
          <thead><tr className="text-muted-foreground"><th className="text-left py-1">เดือน</th><th className="text-right">รายรับ</th><th className="text-right">รายจ่าย</th></tr></thead>
          <tbody>
            {months.map((m) => (
              <tr key={m.month} className="border-t border-border"><td className="py-1">{longMonth(m.month)}</td><td className="text-right">{formatBaht(m.income)}</td><td className="text-right">{formatBaht(m.expense)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}

const Card = ({ title, children, className = '' }: { title: string; children: React.ReactNode; className?: string }) => (
  <section className={`bg-card border border-border rounded-2xl p-4 sm:p-6 ${className}`}>
    <h2 className="text-sm font-black text-foreground mb-3">{title}</h2>
    {children}
  </section>
);

const Tile = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
  <div className="bg-card border border-border rounded-2xl p-4">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-xl sm:text-2xl font-black text-foreground mt-1 tabular-nums">{value}</p>
    {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
  </div>
);

export default function OwnerReportsPage() {
  const [month, setMonth] = useState(thisMonth());
  const [report, setReport] = useState<OwnerReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/owner/reports?month=${month}`)
      .then(async (r) => {
        const d = await r.json();
        if (d.success) setReport(d.data);
        else setError(d.message || 'โหลดรายงานไม่สำเร็จ');
      })
      .catch(() => setError('โหลดรายงานไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [month]);

  const money = report?.money;

  return (
    <div className="p-4 sm:p-8 max-w-6xl w-full mx-auto space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-foreground">รายงานหอพัก</h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">สรุปรายเดือนจากบัญชีรายรับ-จ่าย · {longMonth(month)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-xs text-muted-foreground flex items-center gap-2">
            เดือน
            <input type="month" value={month} max={thisMonth()} onChange={(e) => e.target.value && setMonth(e.target.value)}
              className="px-3 py-2 bg-card border border-border rounded-xl text-sm text-foreground" />
          </label>
          <a href={`/api/owner/reports?month=${month}&format=csv`} className="px-4 py-2 bg-primary text-white rounded-xl text-sm font-bold hover:opacity-90">
            ⬇ ส่งออก CSV
          </a>
        </div>
      </div>

      {error && <p className="p-4 rounded-xl border border-red-500/40 text-red-400 text-sm">{error}</p>}
      {loading && !report && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}

      {report && (
        <>
          {money && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Tile label="รายรับ" value={formatBaht(money.incomeTotal)} sub={longMonth(report.month)} />
                <Tile label="รายจ่าย" value={formatBaht(money.expenseTotal)} sub={longMonth(report.month)} />
                <Tile label="กำไรสุทธิ" value={formatBaht(money.profit)} sub="รายรับ − รายจ่าย" />
                <Tile label="เงินประกันที่ถืออยู่" value={formatBaht(money.depositsHeld)} sub="ณ วันนี้ (หนี้สิน ไม่ใช่รายรับ)" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card title={`รายรับแยกประเภท · ${longMonth(report.month)}`}>
                  <table className="w-full text-sm">
                    <tbody>
                      {money.income.map((i) => (
                        <tr key={i.group} className="border-b border-border/60">
                          <td className="py-1.5 text-foreground">{i.label}</td>
                          <td className={`py-1.5 text-right tabular-nums ${i.amount === 0 ? 'text-muted-foreground' : 'text-foreground'}`}>{formatBaht(i.amount)}</td>
                        </tr>
                      ))}
                      <tr><td className="pt-2 font-black text-foreground">รวมรายรับ</td><td className="pt-2 text-right font-black text-foreground tabular-nums">{formatBaht(money.incomeTotal)}</td></tr>
                    </tbody>
                  </table>
                  <p className="text-[11px] text-muted-foreground mt-3">{INCOME_SPLIT_NOTE}</p>
                </Card>

                <Card title={`รายจ่าย · ${longMonth(report.month)}`}>
                  {money.expense.length === 0 ? (
                    <p className="text-sm text-muted-foreground">ไม่มีรายจ่ายในเดือนนี้</p>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {money.expense.map((e) => (
                          <tr key={e.category} className="border-b border-border/60">
                            <td className="py-1.5 text-foreground">{e.label}</td>
                            <td className="py-1.5 text-right text-foreground tabular-nums">{formatBaht(e.amount)}</td>
                          </tr>
                        ))}
                        <tr><td className="pt-2 font-black text-foreground">รวมรายจ่าย</td><td className="pt-2 text-right font-black text-foreground tabular-nums">{formatBaht(money.expenseTotal)}</td></tr>
                      </tbody>
                    </table>
                  )}
                  <div className="mt-4 pt-3 border-t border-border flex justify-between text-sm">
                    <span className="font-black text-foreground">กำไรสุทธิ</span>
                    <span className="font-black text-foreground tabular-nums">{formatBaht(money.profit)}</span>
                  </div>
                </Card>
              </div>

              <Card title="รายรับ / รายจ่าย 6 เดือนล่าสุด">
                <IncomeExpenseChart months={money.months} />
              </Card>
            </>
          )}

          <p className="text-xs font-bold text-amber-400">ⓘ {TODAY_NOTE}</p>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="อัตราการเข้าพัก">
              <p className="text-3xl font-black text-foreground tabular-nums">{report.occupancy.rate}%</p>
              <p className="text-sm text-muted-foreground mt-1">มีผู้เช่า {report.occupancy.occupied} ห้อง จากทั้งหมด {report.occupancy.total} ห้อง</p>
              <div className="h-2 rounded-full bg-border mt-3 overflow-hidden" aria-hidden="true">
                <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, report.occupancy.rate)}%` }} />
              </div>
            </Card>
            <Card title={`บิลค้างชำระ ${report.unpaid.count} บิล · ${formatBaht(report.unpaid.total)}`} className="lg:col-span-2">
              {report.unpaid.bills.length === 0 ? (
                <p className="text-sm text-muted-foreground">ไม่มีบิลค้างชำระ</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[420px]">
                    <thead><tr className="text-xs text-muted-foreground text-left"><th className="py-1">ห้อง</th><th>รายการ</th><th>ครบกำหนด</th><th className="text-right">ค้างชำระ</th></tr></thead>
                    <tbody>
                      {report.unpaid.bills.map((b) => (
                        <tr key={b.id} className="border-t border-border/60">
                          <td className="py-1.5 font-bold text-foreground">{b.room_number}</td>
                          <td className="py-1.5 text-foreground">{b.title || b.billing_cycle}</td>
                          <td className="py-1.5 text-muted-foreground">{b.due_date ? new Date(`${b.due_date}T00:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' }) : '-'}</td>
                          <td className="py-1.5 text-right tabular-nums text-foreground">{formatBaht(b.outstanding)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground mt-2">ยอดค้างไม่รวมค่าปรับ (ค่าปรับแสดงในหน้าบิลแต่ละใบ) — ตรงกับหน้าภาพรวม</p>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
