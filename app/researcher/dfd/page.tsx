'use client';

import { useState } from 'react';
import Link from 'next/link';
import { dfdData, DfdLevel } from '@/lib/diagramsData';
import MermaidRenderer from '@/app/components/MermaidRenderer';

export default function ResearcherDfdPage() {
  const [selectedId, setSelectedId] = useState<string>('dfd-context');
  const [viewMode, setViewMode] = useState<'both' | 'diagram' | 'details'>('both');
  const [copied, setCopied] = useState<boolean>(false);

  const currentDfd = dfdData.find((d) => d.id === selectedId) || dfdData[0];

  const handleCopyMermaid = () => {
    navigator.clipboard.writeText(currentDfd.mermaidCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-slate-950 text-slate-100">
      {/* Sub Header */}
      <div className="h-16 bg-slate-900/90 border-b border-white/10 flex items-center justify-between px-6 shrink-0 z-10 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Link
            href="/researcher"
            className="text-xs font-bold text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <span>← ภาพรวม</span>
          </Link>
          <span className="text-white/20">|</span>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔄</span>
            <h1 className="font-bold text-sm sm:text-base text-white">
              Data Flow Diagrams (แผนภาพกระแสข้อมูล DFD)
            </h1>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex items-center bg-slate-950 p-1 rounded-xl border border-white/10 text-xs">
          <button
            onClick={() => setViewMode('both')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              viewMode === 'both' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            ทั้งหมด
          </button>
          <button
            onClick={() => setViewMode('diagram')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              viewMode === 'diagram' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            เฉพาะผัง
          </button>
          <button
            onClick={() => setViewMode('details')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer ${
              viewMode === 'details' ? 'bg-cyan-500 text-slate-950 shadow' : 'text-slate-400 hover:text-white'
            }`}
          >
            รายละเอียดกระแสข้อมูล
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Diagram Selector Sidebar */}
        <div className="w-full md:w-80 bg-slate-900/60 border-b md:border-b-0 md:border-r border-white/10 flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10">
            <h2 className="text-xs font-bold uppercase tracking-wider text-white/50">
              เลือกระดับผัง DFD ({dfdData.length} แผนภาพ)
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {dfdData.map((item) => (
              <button
                key={item.id}
                onClick={() => setSelectedId(item.id)}
                className={`w-full text-left p-3.5 rounded-xl border transition-all cursor-pointer ${
                  selectedId === item.id
                    ? 'bg-gradient-to-r from-cyan-950/80 to-blue-950/80 border-cyan-500/60 shadow-lg shadow-cyan-950/50'
                    : 'bg-slate-900/40 border-white/5 hover:border-white/20 hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {item.level}
                  </span>
                  <span className="text-[10px] font-bold text-white/40">
                    {item.badge}
                  </span>
                </div>
                <h3 className={`text-xs font-bold ${selectedId === item.id ? 'text-white' : 'text-slate-300'}`}>
                  {item.title}
                </h3>
                <p className="text-[11px] text-white/50 mt-1 line-clamp-2 leading-relaxed">
                  {item.description}
                </p>
              </button>
            ))}
          </div>

          {/* DFD Symbols Legend */}
          <div className="p-4 border-t border-white/10 bg-slate-950/40 text-[11px] text-slate-400 space-y-2">
            <span className="font-bold text-white text-xs block mb-1">สัญลักษณ์มาตรฐาน DFD (Gane & Sarson):</span>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-cyan-400 bg-slate-900 flex items-center justify-center text-[10px]">■</span>
              <span><b>External Entity:</b> แหล่งกำเนิด/ผู้รับข้อมูลภายนอก</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border border-sky-400 bg-sky-700/50 flex items-center justify-center text-[10px]">●</span>
              <span><b>Process:</b> กระบวนการประมวลผลข้อมูล</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 rounded border border-indigo-400 bg-indigo-950 flex items-center justify-center text-[10px]">≡</span>
              <span><b>Data Store:</b> แหล่งจัดเก็บข้อมูล (Table/DB)</span>
            </div>
          </div>
        </div>

        {/* Right Preview & Details Panel */}
        <div className="flex-1 flex flex-col overflow-y-auto bg-slate-950 p-4 md:p-6 space-y-6">
          {/* Header Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-900/60 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  {currentDfd.level}
                </span>
                <span className="text-xs text-white/50 font-bold">• {currentDfd.badge}</span>
              </div>
              <h2 className="text-lg font-black text-white">{currentDfd.title}</h2>
              <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
                {currentDfd.description}
              </p>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              <button
                onClick={handleCopyMermaid}
                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white border border-white/10 flex items-center gap-2 transition-all cursor-pointer shadow-sm"
              >
                <span>{copied ? '✓ คัดลอกสำเร็จ' : '📋 คัดลอก Mermaid'}</span>
              </button>
            </div>
          </div>

          {/* Diagram Render Box */}
          {(viewMode === 'both' || viewMode === 'diagram') && (
            <div className="rounded-2xl bg-slate-900/90 border border-white/10 p-5 shadow-2xl flex flex-col space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base">📊</span>
                  <span className="text-xs font-bold text-white uppercase tracking-wider">
                    Interactive Data Flow Diagram Canvas
                  </span>
                </div>
                <span className="text-[11px] text-cyan-400 font-mono">Mermaid.js Vector Graph</span>
              </div>

              <div className="min-h-[380px] bg-slate-950/80 rounded-xl p-4 flex items-center justify-center overflow-x-auto border border-white/5">
                <MermaidRenderer
                  id={currentDfd.id}
                  chart={currentDfd.mermaidCode}
                  className="w-full flex justify-center py-2"
                  title={`DFD (${currentDfd.level}): ${currentDfd.title}`}
                  subtitle="Data Flow Diagram (Gane & Sarson / Flowchart Vector)"
                />
              </div>
            </div>
          )}

          {/* Detailed Specifications Box */}
          {(viewMode === 'both' || viewMode === 'details') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Processes & Entities */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                  <span className="text-base">⚙️</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    กระบวนการประมวลผล (Processes: {currentDfd.processes.length})
                  </h3>
                </div>

                <div className="space-y-2.5">
                  {currentDfd.processes.map((proc) => (
                    <div key={proc.id} className="p-3 rounded-xl bg-slate-950/60 border border-white/5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-[10px] font-black rounded bg-sky-500/20 text-sky-300 font-mono border border-sky-500/30">
                          {proc.id}
                        </span>
                        <h4 className="text-xs font-bold text-white">{proc.name}</h4>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1 pl-8 leading-relaxed">
                        {proc.desc}
                      </p>
                    </div>
                  ))}
                </div>

                {/* External Entities List */}
                <div className="pt-3 border-t border-white/10">
                  <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                    <span>👥</span>
                    <span>ผู้เกี่ยวข้องภายนอก (External Entities):</span>
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {currentDfd.entities.map((ent, idx) => (
                      <span
                        key={idx}
                        className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-slate-800/80 text-cyan-200 border border-cyan-800/40"
                      >
                        {ent}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Data Stores & Key Data Flows */}
              <div className="p-5 rounded-2xl bg-slate-900/80 border border-white/10 space-y-4 shadow-xl">
                <div className="flex items-center gap-2 border-b border-white/10 pb-3">
                  <span className="text-base">🗄️</span>
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider">
                    แหล่งเก็บข้อมูล (Data Stores: {currentDfd.dataStores.length})
                  </h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {currentDfd.dataStores.map((ds) => (
                    <div key={ds.id} className="p-2.5 rounded-xl bg-slate-950/60 border border-indigo-500/20">
                      <span className="text-[10px] font-mono font-bold text-indigo-400 bg-indigo-950 px-1.5 py-0.5 rounded border border-indigo-800/40">
                        {ds.id}
                      </span>
                      <h4 className="text-xs font-bold text-white mt-1">{ds.name}</h4>
                      <p className="text-[10px] text-slate-400 font-mono mt-0.5 truncate">
                        Table: {ds.table}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Data Flow Table */}
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <h4 className="text-xs font-bold text-white flex items-center gap-1.5">
                    <span>➡️</span>
                    <span>กระแสการไหลของข้อมูลหลัก (Key Data Flows):</span>
                  </h4>

                  <div className="max-h-60 overflow-y-auto rounded-xl border border-white/10">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-950 text-white/50 border-b border-white/10 font-bold sticky top-0">
                        <tr>
                          <th className="p-2.5">จาก (Source)</th>
                          <th className="p-2.5">ถึง (Target)</th>
                          <th className="p-2.5">ข้อมูลที่ส่ง (Data Flow)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 bg-slate-900/40">
                        {currentDfd.keyDataFlows.map((flow, i) => (
                          <tr key={i} className="hover:bg-white/5 transition-colors">
                            <td className="p-2.5 font-semibold text-cyan-300 whitespace-nowrap">{flow.from}</td>
                            <td className="p-2.5 font-semibold text-amber-300 whitespace-nowrap">{flow.to}</td>
                            <td className="p-2.5 text-slate-300">{flow.flow}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
