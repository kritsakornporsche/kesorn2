'use client';

import { useEffect, useState } from 'react';
import ContractDocument, { CONTRACT_PRINT_CSS } from '@/components/ContractDocument';
import { ratesForRoom, type PaymentInfo, type Rates } from '@/lib/billing';
import { buildContractText, contractAddress, type ContractParty, type ContractTextInput } from '@/lib/settings-fields';

// Preview of the contract in a modal (same text as the print page: lib/settings-fields).
// A saved contract: "ดาวน์โหลดสัญญา (PDF)" opens /contract-print/[id] (print dialog, Save as PDF).
// A draft (booking page, not saved yet): the button prints this preview (commit 28-6: the PDF is the only contract file).

interface PrintableContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: {
    id: number | string;
    room_number: string;
    room_type?: string;
    tenant_name: string;
    tenant_phone?: string;
    parent_phone?: string;
    tenant_email?: string;
    tenant_address?: string;
    occupants?: number | null;
    houseNo?: string; village?: string; road?: string; subdistrict?: string; district?: string; province?: string;
    floor?: number | null;
    start_date: string;
    end_date: string;
    deposit_amount: number;
    form_deposit?: number;
    monthly_rent?: number;
    created_at?: string;
  } | null;
  // Rates of this room from the server (lib/billing ratesForRoom); the dorm's rates are loaded too
  rates?: Partial<Rates> | null;
}

const savedId = (id: unknown) => (Number(id) > 0 ? Number(id) : null);

export default function PrintableContractModal({ isOpen, onClose, contract, rates: ratesProp }: PrintableContractModalProps) {
  const [savedInput, setSavedInput] = useState<ContractTextInput | null>(null);
  const [dorm, setDorm] = useState<{ rates: Rates | null; payment: PaymentInfo | null; party: ContractParty | null }>({ rates: null, payment: null, party: null });
  const id = savedId(contract?.id);

  useEffect(() => {
    if (!isOpen) return;
    if (id) {
      fetch(`/api/contracts/${id}/print-data`)
        .then((res) => res.json())
        .then((data) => { if (data.success) setSavedInput(data.input); })
        .catch(() => {});
    } else {
      fetch('/api/rates')
        .then((res) => res.json())
        .then((data) => { if (data.success) setDorm({ rates: data.data || null, payment: data.payment || null, party: data.party || null }); })
        .catch(() => {});
    }
  }, [isOpen, id]);

  if (!isOpen || !contract) return null;

  const parts = [contract.houseNo, contract.village, contract.road, contract.subdistrict, contract.district, contract.province];
  const draftInput: ContractTextInput = {
    createdAt: contract.created_at || new Date(),
    roomNumber: contract.room_number,
    floor: contract.floor ?? null,
    tenantName: contract.tenant_name,
    tenantPhone: contract.tenant_phone,
    parentPhone: contract.parent_phone,
    occupants: contract.occupants ?? null,
    address: parts.some(Boolean)
      ? { houseNo: contract.houseNo, village: contract.village, road: contract.road, subdistrict: contract.subdistrict, district: contract.district, province: contract.province }
      : contractAddress(contract.tenant_address),
    startDate: contract.start_date,
    endDate: contract.end_date,
    deposit: Number(contract.form_deposit ?? contract.deposit_amount ?? 0) || null,
    firstRent: Number(contract.monthly_rent || 0) || null,
    monthlyRent: Number(contract.monthly_rent || 0) || null,
    rates: { ...(dorm.rates ? ratesForRoom(dorm.rates, contract.room_number) : {}), ...(ratesProp || {}) },
    payment: dorm.payment,
    party: dorm.party,
  };
  const input = id ? savedInput : draftInput;

  const handlePdf = () => {
    if (id) window.open(`/contract-print/${id}?print=1`, '_blank', 'noopener');
    else window.print();
  };

  return (
    <div className="contract-modal fixed inset-0 z-[100] bg-black/50 backdrop-blur-xs flex items-start justify-center overflow-y-auto p-2 sm:p-6">
      <style>{CONTRACT_PRINT_CSS + `
        @media print {
          body * { visibility: hidden !important; }
          .contract-modal, .contract-modal .contract-sheet, .contract-modal .contract-sheet * { visibility: visible !important; }
          .contract-modal { position: absolute !important; inset: 0 !important; background: #fff !important; padding: 0 !important; overflow: visible !important; }
        }`}</style>
      <div className="w-full max-w-[230mm] space-y-3">
        <div className="no-print sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 bg-white/95 border border-slate-200 shadow-md rounded-2xl px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-900">สัญญาเช่าห้องพัก {id ? `เลขที่ ${id}` : '(ร่าง)'}</p>
            <p className="text-[11px] text-slate-500 truncate">ห้อง {contract.room_number} · ผู้เช่า {contract.tenant_name || '-'}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handlePdf} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs cursor-pointer">
              📥 ดาวน์โหลดสัญญา (PDF)
            </button>
            <button onClick={onClose} className="px-3 py-2 text-slate-600 hover:text-slate-900 rounded-xl bg-slate-100 hover:bg-slate-200 border border-slate-200 text-xs font-bold cursor-pointer" title="ปิด">✕</button>
          </div>
        </div>
        <div className="contract-sheet">
          {input ? <ContractDocument text={buildContractText(input)} /> : <p className="text-center text-slate-500 py-20">กำลังโหลด...</p>}
        </div>
      </div>
    </div>
  );
}
