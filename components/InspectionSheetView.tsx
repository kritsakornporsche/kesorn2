'use client';

import { formatThaiDate, formatThaiDateTime } from '@/lib/format';
import { contractPartyText, type ContractParty } from '@/lib/settings-fields';

// Room inspection record attached to the contract (clause 11). Used alone (/inspection-sheet/[id]) and as the last
// part of the printed contract (/contract-print/[id]).

type Condition = 'Good' | 'Damaged' | 'Missing';
const CONDITION_TEXT: Record<Condition, string> = { Good: 'ปกติ', Damaged: 'ชำรุด', Missing: 'สูญหาย' };
const KIND_TITLE = { move_in: 'บันทึกการตรวจสภาพห้องก่อนเข้าอยู่', move_out: 'บันทึกการตรวจสภาพห้องตอนย้ายออก' } as const;
const DOTS = '……………………………………………';

export interface InspectionSheetData {
  kind: 'move_in' | 'move_out';
  contract: { id: number; start_date: string | null; end_date: string | null; room_number: string | null; floor: number | null; tenant_name: string | null };
  party: ContractParty | null;
  inspection: {
    inspected_at: string; inspected_by_name: string | null; note: string | null; tenant_ack_at: string | null;
    items: { id: number; item_name: string; condition_status: Condition; quantity?: number | null; note: string | null; photo_url: string | null }[];
  } | null;
}

export default function InspectionSheetView({ data }: { data: InspectionSheetData }) {
  const { contract, inspection } = data;
  const landlord = contractPartyText(data.party);
  const signers = [
    { role: 'ผู้ให้เช่า', name: data.party?.landlordName || null },
    { role: 'ผู้เช่า', name: contract.tenant_name },
    { role: 'พยาน', name: null },
    { role: 'พยาน', name: null },
  ];

  return (
    <div className="text-[15px] leading-relaxed text-slate-900">
      <div className="text-center border-b border-slate-300 pb-4">
        <p className="text-xs text-slate-500">เอกสารแนบท้ายสัญญาเช่า เลขที่ {contract.id}</p>
        <h1 className="text-xl font-bold mt-1">{KIND_TITLE[data.kind]}</h1>
        {landlord.header && <p className="text-sm text-slate-600 mt-1">{landlord.header}</p>}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 py-4 text-sm">
        <p>ห้องเลขที่ <strong>{contract.room_number || '-'}</strong> ชั้น {contract.floor ?? '........'}</p>
        <p>ผู้เช่า <strong>{contract.tenant_name || DOTS}</strong></p>
        <p>ระยะเวลาเช่า {contract.start_date ? formatThaiDate(contract.start_date) : DOTS} – {contract.end_date ? formatThaiDate(contract.end_date) : DOTS}</p>
        <p>ตรวจเมื่อ {inspection ? formatThaiDateTime(inspection.inspected_at) : DOTS}{inspection?.inspected_by_name ? ` โดย ${inspection.inspected_by_name}` : ''}</p>
      </div>

      {!inspection ? (
        <p className="py-10 text-center text-slate-500 border border-dashed border-slate-300 rounded-lg">ยังไม่ได้บันทึกผลตรวจสภาพห้องในระบบ</p>
      ) : (
        <>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-100">
                <th className="border border-slate-300 px-2 py-1.5 w-10">ลำดับ</th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">รายการทรัพย์สิน / อุปกรณ์</th>
                <th className="border border-slate-300 px-2 py-1.5 w-14">จำนวน</th>
                <th className="border border-slate-300 px-2 py-1.5 w-20">สภาพ</th>
                <th className="border border-slate-300 px-2 py-1.5 text-left">หมายเหตุ</th>
                <th className="border border-slate-300 px-2 py-1.5 w-28">รูปถ่าย</th>
              </tr>
            </thead>
            <tbody>
              {inspection.items.map((it, i) => (
                <tr key={it.id} style={{ breakInside: 'avoid' }}>
                  <td className="border border-slate-300 px-2 py-1.5 text-center">{i + 1}</td>
                  <td className="border border-slate-300 px-2 py-1.5">{it.item_name}</td>
                  <td className="border border-slate-300 px-2 py-1.5 text-center">{it.quantity ?? '-'}</td>
                  <td className={`border border-slate-300 px-2 py-1.5 text-center font-bold ${it.condition_status === 'Good' ? 'text-emerald-700' : 'text-red-700'}`}>
                    {CONDITION_TEXT[it.condition_status] || '-'}
                  </td>
                  <td className="border border-slate-300 px-2 py-1.5">{it.note || '-'}</td>
                  <td className="border border-slate-300 p-1 text-center">
                    {it.photo_url ? <img src={it.photo_url} alt={it.item_name} className="w-24 h-20 object-cover mx-auto" /> : <span className="text-slate-400">-</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {inspection.note && <p className="mt-3 text-sm"><strong>หมายเหตุรวม:</strong> {inspection.note}</p>}
          <p className="mt-2 text-xs text-slate-600">
            {inspection.tenant_ack_at
              ? `ผู้เช่ากดรับทราบผลตรวจในระบบเมื่อ ${formatThaiDateTime(inspection.tenant_ack_at)}`
              : 'ผู้เช่ายังไม่ได้กดรับทราบผลตรวจในระบบ'}
          </p>
        </>
      )}

      <p className="mt-6 text-sm">
        คู่สัญญาได้ตรวจดูสภาพห้องและทรัพย์สินตามรายการและรูปถ่ายข้างต้นร่วมกันแล้ว และให้ถือเอกสารนี้เป็นส่วนหนึ่งของสัญญาเช่า
      </p>

      <div className="grid grid-cols-2 gap-x-8 gap-y-10 mt-10 text-sm" style={{ breakInside: 'avoid' }}>
        {signers.map((s, i) => (
          <div key={i} className="text-center space-y-1">
            <p>ลงชื่อ ................................................ {s.role}</p>
            <p>( {s.name || DOTS} )</p>
          </div>
        ))}
      </div>
    </div>
  );
}
