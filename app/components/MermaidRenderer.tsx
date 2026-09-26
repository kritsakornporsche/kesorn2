'use client';

import React, { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';

interface MermaidRendererProps {
  chart: string;
  id: string;
  className?: string;
  title?: string;
  subtitle?: string;
}

export default function MermaidRenderer({
  chart,
  id,
  className = '',
  title = 'Visual Diagram (Rendered)',
  subtitle = 'Vector SVG Representation',
}: MermaidRendererProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgContent, setSvgContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [isRendering, setIsRendering] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  useEffect(() => {
    // Initialize Mermaid with clean multi-diagram settings
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'loose',
      theme: 'neutral',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      flowchart: {
        htmlLabels: true,
        curve: 'basis',
        useMaxWidth: true,
      },
      er: {
        useMaxWidth: true,
      },
      sequence: {
        diagramMarginX: 40,
        diagramMarginY: 30,
        actorMargin: 70,
        width: 160,
        height: 55,
        boxMargin: 12,
        boxTextMargin: 6,
        noteMargin: 12,
        messageMargin: 40,
        mirrorActors: true,
        bottomMarginAdj: 10,
        useMaxWidth: true,
        rightAngles: false,
        showSequenceNumbers: true,
        actorFontSize: 13,
        messageFontSize: 12,
        noteFontSize: 12,
      },
    });

    let isMounted = true;
    setIsRendering(true);
    setError(null);

    const render = async () => {
      try {
        const uniqueId = `mermaid-${id.replace(/[^a-zA-Z0-9]/g, '_')}-${Math.random().toString(36).slice(2, 7)}`;
        const { svg } = await mermaid.render(uniqueId, chart);
        if (isMounted) {
          setSvgContent(svg);
          setIsRendering(false);
        }
      } catch (err: any) {
        console.error('Mermaid render error:', err);
        // Remove rogue error SVGs that Mermaid v10+ appends to document.body
        const rogueSvgs = document.querySelectorAll('svg[id^="dmermaid"], svg[id^="mermaid-"]');
        rogueSvgs.forEach((svg) => {
          if (!containerRef.current?.contains(svg)) {
            svg.remove();
          }
        });

        if (isMounted) {
          setError(err?.message || 'เกิดข้อผิดพลาดในการวาดแผนภาพ');
          setIsRendering(false);
        }
      }
    };

    render();

    return () => {
      isMounted = false;
    };
  }, [chart, id]);

  // Handle ESC key to exit fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  const handleDownloadSVG = () => {
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `sequence-diagram-${id}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(prev => !prev);
    if (!isFullscreen) {
      setZoomLevel(1.15); // slightly zoom in on fullscreen entry
    } else {
      setZoomLevel(1);
    }
  };

  return (
    <>
      <div className={`flex flex-col rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden ${className}`}>
        {/* Visual Controls Toolbar */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-bold text-slate-700">{title}</span>
            <span className="text-[11px] text-slate-400">{subtitle}</span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.15))}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
              title="ย่อขนาดแผนภาพ"
            >
              - ย่อ
            </button>
            <button
              onClick={() => setZoomLevel(1)}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
              title="รีเซ็ตขนาด 100%"
            >
              {Math.round(zoomLevel * 100)}%
            </button>
            <button
              onClick={() => setZoomLevel(prev => Math.min(2.5, prev + 0.15))}
              className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-100 transition-colors shadow-sm cursor-pointer"
              title="ขยายขนาดแผนภาพ"
            >
              + ขยาย
            </button>

            {/* Fullscreen Toggle Button */}
            <button
              onClick={toggleFullscreen}
              className="px-3 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer ml-1"
              title="เปิดดูแบบเต็มหน้าจอ (Fullscreen)"
            >
              <span>⤢</span>
              <span>เต็มจอ (Fullscreen)</span>
            </button>

            <button
              onClick={handleDownloadSVG}
              className="ml-1 px-3 py-1 rounded-lg bg-slate-900 text-white font-bold hover:bg-slate-800 transition-colors shadow-sm flex items-center gap-1.5 cursor-pointer"
              title="ดาวน์โหลดภาพ Vector SVG"
            >
              <span>📥</span>
              <span className="hidden sm:inline">บันทึก SVG</span>
            </button>
          </div>
        </div>

        {/* SVG Canvas Area */}
        <div className="relative p-6 overflow-x-auto min-h-[380px] flex items-center justify-center bg-gradient-to-b from-white to-slate-50/50">
          {isRendering ? (
            <div className="flex flex-col items-center gap-3 text-slate-400">
              <div className="w-8 h-8 rounded-full border-4 border-cyan-500 border-t-transparent animate-spin" />
              <p className="text-xs font-semibold">กำลังวาดแผนภาพ UML Sequence...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs max-w-lg">
              <p className="font-bold mb-1">ไม่สามารถประมวลผลผังไดอะแกรมได้:</p>
              <p className="font-mono text-[11px] break-all">{error}</p>
            </div>
          ) : (
            <div
              ref={containerRef}
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
              className="w-full max-w-none flex justify-center [&_svg]:max-w-none [&_svg]:mx-auto text-slate-900"
            />
          )}
        </div>
      </div>

      {/* Fullscreen Modal View */}
      {isFullscreen && (
        <div className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden animate-in fade-in duration-200">
          {/* Fullscreen Header Toolbar */}
          <div className="h-16 px-6 bg-slate-900 border-b border-white/10 flex items-center justify-between shrink-0 shadow-lg text-white">
            <div className="flex items-center gap-3">
              <span className="text-xl">📐</span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                  <span>UML Sequence Diagram Viewer</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    FULLSCREEN
                  </span>
                </h3>
                <p className="text-[11px] text-slate-400">กดปุ่ม Esc หรือกดปิดเพื่อกลับสู่หน้าปกติ</p>
              </div>
            </div>

            {/* Toolbar Controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setZoomLevel(prev => Math.max(0.6, prev - 0.2))}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
                title="ย่อขนาด"
              >
                - ย่อ
              </button>
              <button
                onClick={() => setZoomLevel(1)}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
                title="รีเซ็ตขนาด 100%"
              >
                {Math.round(zoomLevel * 100)}%
              </button>
              <button
                onClick={() => setZoomLevel(prev => Math.min(3.0, prev + 0.2))}
                className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs transition-colors cursor-pointer"
                title="ขยายขนาด"
              >
                + ขยาย
              </button>

              <button
                onClick={handleDownloadSVG}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs transition-colors shadow flex items-center gap-1.5 cursor-pointer ml-1"
                title="บันทึกไฟล์ภาพ SVG"
              >
                <span>📥</span>
                <span className="hidden sm:inline">บันทึก SVG</span>
              </button>

              {/* Close Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="px-4 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs transition-colors shadow flex items-center gap-1.5 cursor-pointer ml-2"
                title="ออกจากเต็มจอ (Esc)"
              >
                <span>✕</span>
                <span>ออกจากเต็มจอ (Esc)</span>
              </button>
            </div>
          </div>

          {/* Fullscreen Canvas */}
          <div className="flex-1 overflow-auto p-8 flex items-start justify-center bg-slate-50 cursor-grab active:cursor-grabbing">
            <div
              style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top center', transition: 'transform 0.15s ease-out' }}
              dangerouslySetInnerHTML={{ __html: svgContent }}
              className="w-full max-w-none flex justify-center [&_svg]:max-w-none [&_svg]:mx-auto text-slate-900 py-6"
            />
          </div>
        </div>
      )}
    </>
  );
}
