'use client';

// Tenant: a room inspection of their contract (move-in, or move-out compared with move-in), with photos, and the
// "รับทราบผลตรวจห้อง" button (lib/inspections.ts). Not shown until the owner/manager has recorded the inspection.
// Redesigned in Meta / IG / Facebook multi-photo post format with photo collage, captions, and lightbox viewer.

import { useEffect, useState, useCallback } from 'react';

type Condition = 'Good' | 'Damaged' | 'Missing';
const CONDITION_TEXT: Record<Condition, string> = { Good: 'ปกติ', Damaged: 'ชำรุด', Missing: 'สูญหาย' };

interface InspectionItem {
  id: number;
  item_name: string;
  condition_status: Condition;
  quantity?: number | null;
  note: string | null;
  photo_url: string | null;
}

interface Inspection {
  status: 'pending_ack' | 'acknowledged';
  status_text: string;
  inspected_at: string;
  inspected_by_name: string | null;
  note: string | null;
  tenant_ack_at: string | null;
  items: InspectionItem[];
}

export default function TenantInspectionCard({ contractId, kind = 'move_in' }: { contractId: number; kind?: 'move_in' | 'move_out' }) {
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [moveIn, setMoveIn] = useState<Inspection | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Meta / IG Lightbox Viewer: Index of active photo in itemsWithPhotos
  const [activePhotoIdx, setActivePhotoIdx] = useState<number | null>(null);

  useEffect(() => {
    fetch(`/api/tenant/inspection?contractId=${contractId}&kind=${kind}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) {
          setInspection(d.inspection);
          setMoveIn(d.move_in || null);
        } else {
          setLoadError(d.message || 'โหลดผลตรวจห้องไม่สำเร็จ');
        }
      })
      .catch(() => setLoadError('โหลดผลตรวจห้องไม่สำเร็จ'));
  }, [contractId, kind]);

  const acknowledge = async () => {
    setError(null);
    if (!confirmed) {
      setError('กรุณาติ๊กยืนยันว่าได้ตรวจดูสภาพห้องและทรัพย์สินแล้ว ก่อนกดรับทราบ');
      return;
    }
    setSending(true);
    try {
      const res = await fetch('/api/tenant/inspection/acknowledge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, kind }),
      });
      const data = await res.json();
      if (!data.success) {
        setError(data.message || 'บันทึกการรับทราบไม่สำเร็จ');
        return;
      }
      setInspection(data.inspection);
    } catch {
      setError('บันทึกการรับทราบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setSending(false);
    }
  };

  if (loadError) return <p className="text-xs text-rose-500 font-bold">✕ {loadError}</p>;
  if (!inspection) return null;

  const acknowledged = inspection.status === 'acknowledged';

  // Filter items that actually have photos attached
  const itemsWithPhotos = inspection.items
    .map((it, originalIndex) => ({ ...it, originalIndex }))
    .filter((it): it is typeof it & { photo_url: string } => Boolean(it.photo_url));

  // Quick summary counts
  const goodCount = inspection.items.filter((it) => it.condition_status === 'Good').length;
  const damagedCount = inspection.items.filter((it) => it.condition_status === 'Damaged').length;
  const missingCount = inspection.items.filter((it) => it.condition_status === 'Missing').length;

  const currentPhotoItem = activePhotoIdx !== null ? itemsWithPhotos[activePhotoIdx] : null;

  const handlePrevPhoto = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activePhotoIdx !== null && activePhotoIdx > 0) {
      setActivePhotoIdx(activePhotoIdx - 1);
    } else if (itemsWithPhotos.length > 0) {
      setActivePhotoIdx(itemsWithPhotos.length - 1);
    }
  };

  const handleNextPhoto = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (activePhotoIdx !== null && activePhotoIdx < itemsWithPhotos.length - 1) {
      setActivePhotoIdx(activePhotoIdx + 1);
    } else if (itemsWithPhotos.length > 0) {
      setActivePhotoIdx(0);
    }
  };

  return (
    <div className="bg-white dark:bg-card rounded-3xl border border-slate-200 dark:border-border shadow-xs overflow-hidden text-slate-900 dark:text-foreground">
      {/* 1. Meta / Facebook Style Post Header */}
      <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 dark:border-border flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-purple-700 via-purple-600 to-indigo-600 text-white flex items-center justify-center font-black text-lg shadow-sm shrink-0">
            {inspection.inspected_by_name?.charAt(0) || '🏢'}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm sm:text-base font-black text-slate-900 dark:text-foreground tracking-tight">
                {kind === 'move_out' ? 'บันทึกตรวจสภาพห้องตอนย้ายออก' : 'บันทึกตรวจสภาพห้องก่อนเข้าพัก'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5">
              ตรวจโดย {inspection.inspected_by_name || 'เจ้าหน้าที่หอพัก'} · {new Date(inspection.inspected_at).toLocaleString('th-TH')}
            </p>
          </div>
        </div>

        <span
          className={`px-3.5 py-1.5 rounded-full text-xs font-bold border shrink-0 flex items-center gap-1.5 ${
            acknowledged
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
              : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300'
          }`}
        >
          <span>{acknowledged ? '✓' : '⏳'}</span>
          <span>{inspection.status_text}</span>
        </span>
      </div>

      {/* 2. Post Caption / Summary Description */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Caption summary bar */}
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1 bg-slate-100 dark:bg-muted text-slate-700 dark:text-muted-foreground font-bold rounded-lg">
            📋 ตรวจทั้งหมด {inspection.items.length} รายการ
          </span>
          <span className="px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 font-bold rounded-lg">
            ✓ ปกติ {goodCount}
          </span>
          {damagedCount > 0 && (
            <span className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800/40 font-bold rounded-lg">
              ⚠️ ชำรุด {damagedCount}
            </span>
          )}
          {missingCount > 0 && (
            <span className="px-3 py-1 bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800/40 font-bold rounded-lg">
              ✕ สูญหาย {missingCount}
            </span>
          )}
          {itemsWithPhotos.length > 0 && (
            <span className="px-3 py-1 bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40 font-bold rounded-lg ml-auto">
              📷 รูปภาพแนบ {itemsWithPhotos.length} รูป
            </span>
          )}
        </div>

        {/* Overall Inspection Note (if any) */}
        {inspection.note && (
          <div className="p-3.5 bg-slate-50 dark:bg-muted/40 rounded-2xl border border-slate-200/80 dark:border-border text-xs text-slate-700 dark:text-muted-foreground leading-relaxed">
            <span className="font-bold text-slate-900 dark:text-foreground">หมายเหตุรวม:</span> {inspection.note}
          </div>
        )}

        {/* 3. The Combined Photo Album (Facebook / Meta Collage Grid) */}
        {itemsWithPhotos.length > 0 ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-800 dark:text-foreground flex items-center gap-1.5">
                <span>📸</span>
                <span>อัลบั้มรูปตรวจห้อง ({itemsWithPhotos.length} รูป)</span>
              </span>
              <span className="text-[11px] text-slate-400 font-bold">แตะรูปเพื่อขยายและอ่านข้อความกำกับ</span>
            </div>

            {/* Collage Grid by Photo Count */}
            {itemsWithPhotos.length === 1 && (
              /* 1 Photo: Full width */
              <div
                className="relative aspect-video sm:aspect-[16/9] rounded-2xl overflow-hidden cursor-pointer group bg-slate-900 shadow-sm border border-slate-200/80 dark:border-border"
                onClick={() => setActivePhotoIdx(0)}
              >
                <img
                  src={itemsWithPhotos[0].photo_url}
                  alt={itemsWithPhotos[0].item_name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-white">
                  <span className="text-xs font-bold truncate">
                    #{itemsWithPhotos[0].originalIndex + 1} {itemsWithPhotos[0].item_name}
                  </span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 font-bold">
                    {CONDITION_TEXT[itemsWithPhotos[0].condition_status]}
                  </span>
                </div>
              </div>
            )}

            {itemsWithPhotos.length === 2 && (
              /* 2 Photos: 2-column split */
              <div className="grid grid-cols-2 gap-2 aspect-video sm:aspect-[16/9] rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 dark:border-border">
                {itemsWithPhotos.slice(0, 2).map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                    onClick={() => setActivePhotoIdx(idx)}
                  >
                    <img
                      src={item.photo_url}
                      alt={item.item_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-white">
                      <span className="text-xs font-bold truncate">
                        #{item.originalIndex + 1} {item.item_name}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 font-bold">
                        {CONDITION_TEXT[item.condition_status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {itemsWithPhotos.length === 3 && (
              /* 3 Photos: 1 big on left, 2 stacked on right */
              <div className="grid grid-cols-3 gap-2 aspect-video sm:aspect-[16/9] rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 dark:border-border">
                <div
                  className="col-span-2 relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                  onClick={() => setActivePhotoIdx(0)}
                >
                  <img
                    src={itemsWithPhotos[0].photo_url}
                    alt={itemsWithPhotos[0].item_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex items-center justify-between text-white">
                    <span className="text-xs font-bold truncate">
                      #{itemsWithPhotos[0].originalIndex + 1} {itemsWithPhotos[0].item_name}
                    </span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 font-bold">
                      {CONDITION_TEXT[itemsWithPhotos[0].condition_status]}
                    </span>
                  </div>
                </div>

                <div className="grid grid-rows-2 gap-2 h-full">
                  {itemsWithPhotos.slice(1, 3).map((item, idx) => (
                    <div
                      key={item.id}
                      className="relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                      onClick={() => setActivePhotoIdx(idx + 1)}
                    >
                      <img
                        src={item.photo_url}
                        alt={item.item_name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white">
                        <span className="text-[11px] font-bold truncate">
                          #{item.originalIndex + 1} {item.item_name}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {itemsWithPhotos.length === 4 && (
              /* 4 Photos: 2x2 grid */
              <div className="grid grid-cols-2 gap-2 aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 dark:border-border">
                {itemsWithPhotos.slice(0, 4).map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                    onClick={() => setActivePhotoIdx(idx)}
                  >
                    <img
                      src={item.photo_url}
                      alt={item.item_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white">
                      <span className="text-[11px] font-bold truncate">
                        #{item.originalIndex + 1} {item.item_name}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/60 backdrop-blur-sm border border-white/20 font-bold">
                        {CONDITION_TEXT[item.condition_status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {itemsWithPhotos.length >= 5 && (
              /* 5+ Photos: Facebook Collage Style with +N Overlay on the 4th photo */
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 aspect-[4/3] sm:aspect-video rounded-2xl overflow-hidden shadow-sm border border-slate-200/80 dark:border-border">
                {itemsWithPhotos.slice(0, 3).map((item, idx) => (
                  <div
                    key={item.id}
                    className="relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                    onClick={() => setActivePhotoIdx(idx)}
                  >
                    <img
                      src={item.photo_url}
                      alt={item.item_name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/80 to-transparent flex items-center justify-between text-white">
                      <span className="text-[11px] font-bold truncate">
                        #{item.originalIndex + 1} {item.item_name}
                      </span>
                    </div>
                  </div>
                ))}

                {/* 4th Photo with Facebook-style +N overlay */}
                <div
                  className="relative h-full cursor-pointer group bg-slate-900 overflow-hidden"
                  onClick={() => setActivePhotoIdx(3)}
                >
                  <img
                    src={itemsWithPhotos[3].photo_url}
                    alt={itemsWithPhotos[3].item_name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white p-2 text-center group-hover:bg-black/70 transition-colors">
                    <span className="text-xl sm:text-2xl font-black">+{itemsWithPhotos.length - 3}</span>
                    <span className="text-[10px] font-bold text-white/90">ดูรูปทั้งหมด</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* When NO photos are attached: clean minimal notice (does not waste vertical space) */
          <div className="p-4 bg-slate-50 dark:bg-muted/30 rounded-2xl border border-slate-200/80 dark:border-border flex items-center gap-3 text-xs text-slate-500 dark:text-muted-foreground">
            <span className="text-lg">📝</span>
            <span>บันทึกตรวจสภาพห้องพักแบบข้อความ (ไม่มีภาพถ่ายแนบ)</span>
          </div>
        )}

        {/* 4. Complete Item Checklist (Facebook Post Body) */}
        <div className="space-y-2 pt-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-black text-slate-800 dark:text-foreground">
              รายการทรัพย์สินและอุปกรณ์ในห้อง ({inspection.items.length} รายการ)
            </span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-border/60 rounded-2xl border border-slate-200/80 dark:border-border overflow-hidden bg-slate-50/50 dark:bg-muted/20">
            {inspection.items.map((it, i) => {
              const photoIndex = itemsWithPhotos.findIndex((p) => p.id === it.id);
              return (
                <div
                  key={it.id}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:bg-white dark:hover:bg-card transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3 min-w-0">
                    <span className="text-[11px] font-mono font-bold text-slate-400 dark:text-muted-foreground w-6 shrink-0">
                      #{i + 1}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs sm:text-sm font-black text-slate-900 dark:text-foreground">
                          {it.item_name}
                        </p>
                        {it.quantity !== null && it.quantity !== undefined && (
                          <span className="text-[11px] text-slate-500 dark:text-muted-foreground font-bold">
                            · จำนวน {it.quantity}
                          </span>
                        )}
                      </div>

                      {it.note && (
                        <p className="text-xs text-slate-500 dark:text-muted-foreground mt-0.5">
                          💬 {it.note}
                        </p>
                      )}

                      {/* Move-out comparison line */}
                      {kind === 'move_out' && moveIn && (() => {
                        const before = moveIn.items.find(
                          (m) => m.item_name.trim().toLowerCase() === it.item_name.trim().toLowerCase()
                        );
                        if (!before) return null;
                        const changed = before.condition_status !== it.condition_status;
                        return (
                          <p className={`text-[11px] mt-0.5 ${changed ? 'text-amber-700 dark:text-amber-400 font-bold' : 'text-slate-400'}`}>
                            ตอนเข้าอยู่: {CONDITION_TEXT[before.condition_status]}
                            {before.quantity !== null && before.quantity !== undefined ? ` · จำนวน ${before.quantity}` : ''}
                            {changed ? ' → มีการเปลี่ยนแปลง' : ''}
                          </p>
                        );
                      })()}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border flex items-center gap-1 ${
                        it.condition_status === 'Good'
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : it.condition_status === 'Damaged'
                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      <span>{it.condition_status === 'Good' ? '✓' : it.condition_status === 'Damaged' ? '⚠️' : '✕'}</span>
                      <span>{CONDITION_TEXT[it.condition_status]}</span>
                    </span>

                    {it.photo_url && photoIndex !== -1 && (
                      <button
                        type="button"
                        onClick={() => setActivePhotoIdx(photoIndex)}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 dark:bg-card dark:hover:bg-muted border border-slate-200 dark:border-border rounded-xl text-xs font-bold text-slate-700 dark:text-foreground flex items-center gap-1 shadow-xs transition-all cursor-pointer"
                        title="ดูรูปภาพแนบ"
                      >
                        <span>📷</span>
                        <span>ดูรูป</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 5. Acknowledgment Footer (Facebook Post Action Bar) */}
        <div className="pt-2">
          {acknowledged ? (
            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-2xl flex items-center gap-3">
              <span className="w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center font-bold text-sm shrink-0">✓</span>
              <div>
                <p className="text-sm font-black text-emerald-800 dark:text-emerald-300">คุณรับทราบผลตรวจห้องเรียบร้อยแล้ว</p>
                {inspection.tenant_ack_at && (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                    บันทึกเมื่อ {new Date(inspection.tenant_ack_at).toLocaleString('th-TH')}
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="p-5 bg-slate-50 dark:bg-card/80 border border-slate-200 dark:border-border rounded-2xl space-y-4">
              <label className="flex items-start gap-3 text-xs sm:text-sm font-medium text-slate-800 dark:text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => {
                    setConfirmed(e.target.checked);
                    setError(null);
                  }}
                  className="mt-0.5 w-4 h-4 rounded text-primary focus:ring-primary border-slate-300"
                />
                <span>ข้าพเจ้าได้ตรวจดูสภาพห้องและทรัพย์สินตามรายการและรูปถ่ายข้างต้นครบถ้วนแล้ว</span>
              </label>

              {error && <p className="text-xs text-rose-500 font-bold">✕ {error}</p>}

              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <button
                  onClick={acknowledge}
                  disabled={sending}
                  className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-black rounded-xl text-xs sm:text-sm shadow-md hover:scale-[1.01] active:scale-[0.99] transition-all disabled:opacity-50 cursor-pointer"
                >
                  {sending ? 'กำลังบันทึก...' : '✓ รับทราบผลตรวจห้อง'}
                </button>
                <p className="text-[11px] text-slate-400 dark:text-muted-foreground">
                  หากสภาพไม่ตรงกับความเป็นจริง กรุณาติดต่อเจ้าหน้าที่ก่อนกดรับทราบ
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 6. Meta / IG Fullscreen Lightbox Photo Viewer with Caption Sidebar */}
      {activePhotoIdx !== null && currentPhotoItem && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in"
          onClick={() => setActivePhotoIdx(null)}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => setActivePhotoIdx(null)}
            className="absolute top-4 right-4 z-50 w-10 h-10 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center text-xl font-bold transition-colors cursor-pointer"
            aria-label="ปิดการดูรูป"
          >
            ✕
          </button>

          {/* Dialog Container */}
          <div
            className="relative max-w-5xl w-full h-[85vh] max-h-[85vh] bg-slate-950 rounded-3xl overflow-hidden shadow-2xl border border-white/10 flex flex-col lg:flex-row"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Media Canvas (High-Res Image + Navigation) */}
            <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[300px] select-none">
              <img
                src={currentPhotoItem.photo_url}
                alt={currentPhotoItem.item_name}
                className="max-h-full max-w-full object-contain"
              />

              {/* Prev Photo Button */}
              {itemsWithPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handlePrevPhoto}
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg font-black transition-colors cursor-pointer border border-white/10"
                  aria-label="รูปก่อนหน้า"
                >
                  ‹
                </button>
              )}

              {/* Next Photo Button */}
              {itemsWithPhotos.length > 1 && (
                <button
                  type="button"
                  onClick={handleNextPhoto}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/60 hover:bg-black/80 text-white flex items-center justify-center text-lg font-black transition-colors cursor-pointer border border-white/10"
                  aria-label="รูปถัดไป"
                >
                  ›
                </button>
              )}

              {/* Photo Counter Pill */}
              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/70 backdrop-blur-sm rounded-full text-white text-[11px] font-bold border border-white/10">
                {activePhotoIdx + 1} / {itemsWithPhotos.length}
              </div>
            </div>

            {/* Right Meta / IG Caption & Details Sidebar */}
            <div className="w-full lg:w-80 p-5 bg-card text-foreground flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-border shrink-0 overflow-y-auto">
              <div className="space-y-4">
                {/* Header Tag */}
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-border">
                  <span className="text-[11px] font-mono font-bold text-slate-400 bg-muted px-2 py-0.5 rounded-md">
                    รายการที่ #{currentPhotoItem.originalIndex + 1}
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${
                      currentPhotoItem.condition_status === 'Good'
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                        : currentPhotoItem.condition_status === 'Damaged'
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                    }`}
                  >
                    {CONDITION_TEXT[currentPhotoItem.condition_status]}
                  </span>
                </div>

                {/* Item Name */}
                <div>
                  <h4 className="text-base font-black text-foreground">
                    {currentPhotoItem.item_name}
                  </h4>
                  {currentPhotoItem.quantity !== null && currentPhotoItem.quantity !== undefined && (
                    <p className="text-xs text-muted-foreground font-bold mt-1">
                      จำนวน: {currentPhotoItem.quantity} รายการ
                    </p>
                  )}
                </div>

                {/* Caption / Note */}
                {currentPhotoItem.note ? (
                  <div className="p-3 bg-muted/50 rounded-xl border border-border text-xs text-foreground leading-relaxed">
                    <span className="font-bold text-muted-foreground block mb-1">💬 หมายเหตุผู้ตรวจ:</span>
                    {currentPhotoItem.note}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground italic">ไม่มีหมายเหตุเพิ่มเติมสำหรับรายการนี้</p>
                )}

                {/* Move-out comparison in viewer */}
                {kind === 'move_out' && moveIn && (() => {
                  const before = moveIn.items.find(
                    (m) => m.item_name.trim().toLowerCase() === currentPhotoItem.item_name.trim().toLowerCase()
                  );
                  if (!before) return null;
                  const changed = before.condition_status !== currentPhotoItem.condition_status;
                  return (
                    <div className={`p-3 rounded-xl text-xs border ${
                      changed ? 'bg-amber-500/10 border-amber-500/30 text-amber-500 font-bold' : 'bg-muted border-border text-muted-foreground'
                    }`}>
                      <p className="font-bold mb-1">สภาพตอนเข้าอยู่:</p>
                      <p>{CONDITION_TEXT[before.condition_status]}{before.quantity ? ` · จำนวน ${before.quantity}` : ''}</p>
                      {changed && <p className="text-[11px] text-amber-400 mt-1">⚠️ มีการเปลี่ยนแปลงจากตอนเข้าอยู่</p>}
                    </div>
                  );
                })()}
              </div>

              {/* Thumbnails Strip at bottom of sidebar */}
              {itemsWithPhotos.length > 1 && (
                <div className="pt-4 border-t border-border mt-4">
                  <p className="text-[10px] font-bold text-muted-foreground mb-2">รูปถ่ายทั้งหมดในอัลบั้ม:</p>
                  <div className="flex gap-1.5 overflow-x-auto scrollbar-none py-1">
                    {itemsWithPhotos.map((p, idx) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setActivePhotoIdx(idx)}
                        className={`w-11 h-11 rounded-lg overflow-hidden shrink-0 border-2 transition-all cursor-pointer ${
                          idx === activePhotoIdx ? 'border-primary ring-2 ring-primary/40 scale-105' : 'border-transparent opacity-60 hover:opacity-100'
                        }`}
                      >
                        <img src={p.photo_url} alt={p.item_name} className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
