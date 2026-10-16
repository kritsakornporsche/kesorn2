'use client';

import { use, useEffect, useState } from 'react';
import InspectionSheetView, { type InspectionSheetData } from '@/components/InspectionSheetView';

// Printable room inspection sheet — attachment to the contract (owner/manager, or the contract's own tenant).
export default function InspectionSheetPage({ params, searchParams }: { params: Promise<{ contractId: string }>; searchParams: Promise<{ kind?: string }> }) {
  const { contractId } = use(params);
  const { kind } = use(searchParams);
  const [data, setData] = useState<InspectionSheetData | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/contracts/${contractId}/inspection-sheet?kind=${kind === 'move_out' ? 'move_out' : 'move_in'}`)
      .then(async (res) => {
        const json = await res.json();
        if (json.success) setData(json);
        else setError(json.message || 'ไม่พบใบตรวจสภาพห้อง');
      })
      .catch(() => setError('โหลดใบตรวจสภาพห้องไม่สำเร็จ'));
  }, [contractId, kind]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-700 p-6">{error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-500 p-6">กำลังโหลด...</div>;

  return (
    <div className="min-h-screen shrink-0 bg-slate-100 print:bg-white py-8 print:py-0 px-4 text-slate-900">
      <div className="max-w-3xl mx-auto mb-4 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold">
          🖨️ พิมพ์ใบตรวจสภาพห้อง
        </button>
      </div>
      <div className="max-w-3xl mx-auto bg-white p-6 sm:p-10 rounded-xl shadow print:shadow-none print:rounded-none print:p-0">
        <InspectionSheetView data={data} />
      </div>
    </div>
  );
}
