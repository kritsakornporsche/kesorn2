'use client';

import { use, useEffect, useState } from 'react';
import ContractDocument, { CONTRACT_PRINT_CSS } from '@/components/ContractDocument';
import InspectionSheetView, { type InspectionSheetData } from '@/components/InspectionSheetView';
import { buildContractText, type ContractTextInput } from '@/lib/settings-fields';

// Printed contract: the contract, then (new page) the move-in inspection record attached to it.
// "ดาวน์โหลดสัญญา (PDF)" opens this page with ?print=1 → the browser's print dialog (Save as PDF).
// Owner/manager, or the contract's own tenant (/api/contracts/[id]/print-data checks).
export default function ContractPrintPage({ params, searchParams }: { params: Promise<{ contractId: string }>; searchParams: Promise<{ print?: string }> }) {
  const { contractId } = use(params);
  const { print } = use(searchParams);
  const [data, setData] = useState<{ input: ContractTextInput; inspectionSheet: InspectionSheetData; draft?: boolean } | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/contracts/${contractId}/print-data`)
      .then(async (res) => {
        const json = await res.json();
        if (json.success) setData(json);
        else setError(json.message || 'ไม่พบสัญญา');
      })
      .catch(() => setError('โหลดสัญญาไม่สำเร็จ'));
  }, [contractId]);

  // Open the print dialog once the document (fonts and photos) is ready
  useEffect(() => {
    if (!data || print !== '1' || data.draft) return;
    let cancelled = false;
    const run = async () => {
      await document.fonts?.ready;
      await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
      if (!cancelled) window.print();
    };
    const t = setTimeout(run, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [data, print]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-700 p-6">{error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-500 p-6">กำลังโหลด...</div>;

  return (
    <div className="min-h-screen shrink-0 bg-slate-200 print:bg-white py-6 print:py-0 px-2 sm:px-4">
      <style>{CONTRACT_PRINT_CSS}</style>
      {data.draft && (
        <>
          {/* commit 28-2: printed anyway (Ctrl+P) → every page says it is a draft */}
          <style>{'@media print { .contract-draft-mark { display: flex !important; } }'}</style>
          <div className="contract-draft-mark hidden fixed inset-0 items-center justify-center pointer-events-none z-50">
            <span style={{ transform: 'rotate(-30deg)', fontSize: '64pt', color: 'rgba(220,38,38,.25)', fontWeight: 700, fontFamily: 'THSarabunNew, sans-serif' }}>ร่าง — ห้ามใช้ลงนาม</span>
          </div>
          <div className="no-print max-w-[210mm] mx-auto mb-4 p-4 rounded-xl bg-amber-100 border border-amber-300 text-amber-900 text-sm font-bold">
            ร่างสัญญา — หอพักยังไม่ยืนยันข้อมูลสัญญา (ขั้น 3) · ดูได้ แต่ยังพิมพ์เพื่อลงนามไม่ได้ ข้อมูลอาจเปลี่ยนก่อนยืนยัน
          </div>
        </>
      )}
      <div className="no-print max-w-[210mm] mx-auto mb-4 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-slate-700">สัญญาเช่า เลขที่ {contractId} · กด “บันทึกเป็น PDF” ในหน้าต่างพิมพ์</p>
        <button onClick={() => window.print()} disabled={data.draft} title={data.draft ? 'พิมพ์ได้หลังหอพักยืนยันข้อมูลสัญญา' : undefined} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold disabled:opacity-40 disabled:cursor-not-allowed">
          🖨️ พิมพ์ / บันทึกเป็น PDF
        </button>
      </div>
      <div className="contract-sheet">
        <ContractDocument text={buildContractText(data.input)} />
      </div>
      <div className="contract-sheet contract-page-break mt-6 print:mt-0">
        <InspectionSheetView data={data.inspectionSheet} />
      </div>
    </div>
  );
}
