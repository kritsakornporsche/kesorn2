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
    const res = { ALL: results.length, FINANCIAL: 0, ENERGY: 0, LIFECYCLE: 0 };
    for (const r of results) {
      const grp = getGroupCategory(r.category);
      res[grp]++;
    }
    return res;
  }, [results]);

  const filtered = useMemo(() => {
    return results.filter((tc) => {
      const matchesGroup = filterGroup === 'ALL' || getGroupCategory(tc.category) === filterGroup;
      const query = searchQuery.trim().toLowerCase();
      const matchesQuery =
        !query ||
        tc.id.toLowerCase().includes(query) ||
        tc.roomNumber.includes(query) ||
        tc.title.toLowerCase().includes(query) ||
        tc.details.toLowerCase().includes(query);
      return matchesGroup && matchesQuery;
    });
  }, [results, filterGroup, searchQuery]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-4">
        {/* 1. Minimalist Top Navigation */}
        <ResearcherLabNavBar />

        {/* 2. Compact Page Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-blue-50 border border-blue-200 text-blue-600 flex items-center justify-center text-xl shrink-0 shadow-xs">
              🧪
            </span>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                ระบบทดสอบ 20 ห้องพัก (Test Matrix)
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                ตรวจสอบความถูกต้องของสัญญา มิเตอร์ไฟฟ้า และบิลรายเดือน
              </p>
            </div>
          </div>

          <button
            onClick={runTests}
            disabled={loading}
            className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-black text-xs shadow-xs transition-all active:scale-95 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>{loading ? '⏳' : '▶️'}</span>
            <span>{loading ? 'กำลังรัน...' : 'รันตรวจสอบทุกเคส'}</span>
          </button>
        </div>

        {/* 3. Sleek Single-Row Metric Strip */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-2xl bg-white border border-slate-200 shadow-xs text-xs">
            <div className="flex items-center gap-2.5 px-3 py-1">
              <span className="text-base">📋</span>
              <div>
                <span className="text-[10px] text-slate-500 font-bold uppercase block leading-none">เคสทั้งหมด</span>
                <span className="text-base font-black text-slate-900 font-mono mt-0.5 block">{summary.total} เคส</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-100">
              <span className="text-base">✅</span>
              <div>
                <span className="text-[10px] text-emerald-700 font-bold uppercase block leading-none">ผ่าน (Passed)</span>
                <span className="text-base font-black text-emerald-600 font-mono mt-0.5 block">
                  {summary.passed} <span className="text-[11px] font-bold text-emerald-700">({summary.integrityScore}%)</span>
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-100">
              <span className="text-base">❌</span>
              <div>
                <span className="text-[10px] text-rose-700 font-bold uppercase block leading-none">ไม่ผ่าน (Failed)</span>
                <span className="text-base font-black text-slate-500 font-mono mt-0.5 block">{summary.failed}</span>
              </div>
            </div>
            <div className="flex items-center gap-2.5 px-3 py-1 sm:border-l border-slate-100">
              <span className="text-base">⚡</span>
              <div>
                <span className="text-[10px] text-amber-700 font-bold uppercase block leading-none">ความเร็ว</span>
                <span className="text-base font-black text-amber-600 font-mono mt-0.5 block">{summary.durationMs} ms</span>
              </div>
            </div>
          </div>
        )}

        {/* 4. Streamlined Filter & Search Row (No Scrollbar) */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 p-2 rounded-2xl bg-white border border-slate-200 shadow-xs">
          <div className="flex items-center gap-1 overflow-x-auto scrollbar-none">
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
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    active
                      ? 'bg-blue-600 text-white font-black shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span className={`px-1.5 py-0.2 rounded-md text-[10px] font-mono ${
                    active ? 'bg-blue-800 text-white' : 'bg-slate-100 text-slate-600'
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
              placeholder="ค้นหาเลขห้อง หรือเคส..."
              className="w-full sm:w-56 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
        </div>

        {/* 5. Clean, High-Contrast Data Table */}
        <div className="rounded-2xl bg-white border border-slate-200 shadow-xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 uppercase tracking-wider text-[11px] font-bold">
                  <th className="py-2.5 px-4">เคส / ห้อง</th>
                  <th className="py-2.5 px-4">การทดสอบ</th>
                  <th className="py-2.5 px-4">ผลการตรวจสอบ (Details)</th>
                  <th className="py-2.5 px-3 text-right">เวลา</th>
                  <th className="py-2.5 px-4 text-center">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
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
                    <tr key={tc.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-black text-blue-600">{tc.id}</span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 font-mono text-[11px] font-bold">
                            ห้อง {tc.roomNumber}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-900 max-w-[220px]">
                        {tc.title}
                      </td>
                      <td className="py-2.5 px-4 text-slate-600 text-[11px] font-mono">
                        {tc.details}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-slate-400 text-[11px] whitespace-nowrap">
                        {tc.durationMs}ms
                      </td>
                      <td className="py-2.5 px-4 text-center whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-[10px] font-black tracking-wider ${
                            tc.status === 'PASS'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
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
    </div>
  );
}
