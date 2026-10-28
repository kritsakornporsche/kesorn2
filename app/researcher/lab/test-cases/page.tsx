'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';

interface TestCaseResult {
  id: string;
  roomNumber: string;
  category: string;
  title: string;
  status: 'PASS' | 'FAIL';
  details: string;
  durationMs: number;
}

interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  integrityScore: number;
  durationMs: number;
}

type GroupFilter = 'ALL' | 'FINANCIAL' | 'ENERGY' | 'LIFECYCLE';

function getGroupCategory(cat: string): 'FINANCIAL' | 'ENERGY' | 'LIFECYCLE' {
  if (['Billing & MIS', 'FinTech Payment', 'Receivables', 'Rate Calculation'].includes(cat)) return 'FINANCIAL';
  if (['Energy IoT', 'Energy Analytics', 'Energy Protection', 'Smart Grid Protection', 'Hardware Lifecycle'].includes(cat)) return 'ENERGY';
  return 'LIFECYCLE';
}

export default function ResearcherTestCasesPage() {
  const [results, setResults] = useState<TestCaseResult[]>([]);
  const [summary, setSummary] = useState<TestSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterGroup, setFilterGroup] = useState<GroupFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const runTests = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/researcher/test-cases', { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setResults(data.results || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Run test cases error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runTests();
  }, []);

  const counts = useMemo(() => {
    return {
      ALL: results.length,
      FINANCIAL: results.filter((r) => getGroupCategory(r.category) === 'FINANCIAL').length,
      ENERGY: results.filter((r) => getGroupCategory(r.category) === 'ENERGY').length,
      LIFECYCLE: results.filter((r) => getGroupCategory(r.category) === 'LIFECYCLE').length,
    };
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter((r) => {
      const group = getGroupCategory(r.category);
      const matchesGroup = filterGroup === 'ALL' || group === filterGroup;
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        r.id.toLowerCase().includes(query) ||
        r.roomNumber.toLowerCase().includes(query) ||
        r.title.toLowerCase().includes(query) ||
        r.details.toLowerCase().includes(query);
      return matchesGroup && matchesQuery;
    });
  }, [results, filterGroup, searchQuery]);

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4">
      {/* 1. Minimalist Top Navigation */}
      <ResearcherLabNavBar />

      {/* 2. Compact Page Header */}
      <div className="flex items-center justify-between gap-4 pt-1">
        <div className="flex items-center gap-3">
          <span className="w-10 h-10 rounded-2xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-xl shrink-0">
            🧪
          </span>
          <div>
            <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">
              ระบบทดสอบ 20 ห้องพัก (Test Matrix)
            </h1>
            <p className="text-xs text-slate-400 font-medium">
              ตรวจสอบความถูกต้องของสัญญา มิเตอร์ไฟฟ้า และบิลรายเดือน
            </p>
          </div>
        </div>

        <button
          onClick={runTests}
          disabled={loading}
          className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs shadow-md shadow-cyan-500/20 transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
        >
          <span>{loading ? '⏳' : '▶️'}</span>
          <span>{loading ? 'กำลังรัน...' : 'รันตรวจสอบทุกเคส'}</span>
        </button>
      </div>

      {/* 3. Sleek Single-Row Metric Strip */}
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-2xl bg-slate-900/80 border border-slate-800 backdrop-blur-md text-xs">
          <div className="flex items-center gap-2.5 px-3 py-1">
            <span className="text-base">📋</span>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase block leading-none">เคสทั้งหมด</span>
              <span className="text-base font-black text-white font-mono mt-0.5 block">{summary.total} เคส</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-800">
            <span className="text-base">✅</span>
            <div>
              <span className="text-[10px] text-emerald-400 font-bold uppercase block leading-none">ผ่าน (Passed)</span>
              <span className="text-base font-black text-emerald-400 font-mono mt-0.5 block">
                {summary.passed} <span className="text-[11px] font-semibold text-emerald-500/80">({summary.integrityScore}%)</span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-800">
            <span className="text-base">❌</span>
            <div>
              <span className="text-[10px] text-rose-400 font-bold uppercase block leading-none">ไม่ผ่าน (Failed)</span>
              <span className="text-base font-black text-slate-400 font-mono mt-0.5 block">{summary.failed}</span>
            </div>
          </div>
          <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-800">
            <span className="text-base">⚡</span>
            <div>
              <span className="text-[10px] text-amber-400 font-bold uppercase block leading-none">ความเร็ว</span>
              <span className="text-base font-black text-amber-300 font-mono mt-0.5 block">{summary.durationMs} ms</span>
            </div>
          </div>
        </div>
      )}

      {/* 4. Streamlined Filter & Search Row (No Scrollbar) */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2 rounded-2xl bg-slate-900/70 border border-slate-800">
        <div className="flex items-center gap-1">
          {(
            [
              { key: 'ALL', label: 'ทั้งหมด', count: counts.ALL },
              { key: 'FINANCIAL', label: 'บิล & การเงิน', count: counts.FINANCIAL },
              { key: 'ENERGY', label: 'มิเตอร์ & พลังงาน', count: counts.ENERGY },
              { key: 'LIFECYCLE', label: 'สัญญา & ห้องพัก', count: counts.LIFECYCLE },
            ] as const
          ).map((tab) => {
            const active = filterGroup === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setFilterGroup(tab.key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  active
                    ? 'bg-cyan-500 text-slate-950 font-black shadow-xs'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                }`}
              >
                <span>{tab.label}</span>
                <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                  active ? 'bg-slate-950/20 text-slate-950' : 'bg-slate-800 text-slate-400'
                }`}>
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="ค้นหาเลขห้อง หรือผลลัพธ์..."
            className="w-full sm:w-56 bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-cyan-400 transition-colors"
          />
        </div>
      </div>

      {/* 5. Clean, High-Contrast Data Table */}
      <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 uppercase tracking-wider text-[11px] font-bold">
                <th className="py-2.5 px-4">เคส / ห้อง</th>
                <th className="py-2.5 px-4">การทดสอบ</th>
                <th className="py-2.5 px-4">ผลการตรวจสอบ (Details)</th>
                <th className="py-2.5 px-3 text-right">เวลา</th>
                <th className="py-2.5 px-4 text-center">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-medium">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-10 text-center text-slate-400">
                    <div className="inline-block animate-spin text-xl mb-1.5">⏳</div>
                    <p className="font-bold text-xs">กำลังตรวจสอบข้อมูลทั้ง 20 ห้องพัก...</p>
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-500 text-xs">
                    ไม่พบข้อมูลที่ตรงกับเงื่อนไขการค้นหา
                  </td>
                </tr>
              ) : (
                filtered.map((tc) => (
                  <tr key={tc.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-cyan-400">{tc.id}</span>
                        <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/80 text-slate-200 font-mono text-[11px] font-bold">
                          ห้อง {tc.roomNumber}
                        </span>
                      </div>
                    </td>
                    <td className="py-2.5 px-4 font-bold text-white max-w-[220px]">
                      {tc.title}
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 text-[11px] font-mono">
                      {tc.details}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px] whitespace-nowrap">
                      {tc.durationMs}ms
                    </td>
                    <td className="py-2.5 px-4 text-center whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black tracking-wider ${
                          tc.status === 'PASS'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                        }`}
                      >
                        <span>{tc.status === 'PASS' ? '✓' : '✕'}</span>
                        <span>{tc.status}</span>
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
