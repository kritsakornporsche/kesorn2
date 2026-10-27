'use client';

// Step 3 of booking → tenant: Combined Contract Data & Room Inspection
// Tab 1: ข้อมูลสัญญา (ContractDataPanel)
// Tab 2: ตรวจสภาพห้อง (InspectionPanel)

import { useState } from 'react';
import { ContractDataPanel } from '@/components/ContractDataModal';
import { InspectionPanel, type InspectionStatus } from '@/components/InspectionModal';

export function ContractInspectionCombinedModal({
  contractId,
  onClose,
  onSaved,
  initialTab = 'contract',
}: {
  contractId: number;
  onClose: () => void;
  onSaved?: () => void;
  initialTab?: 'contract' | 'inspection';
}) {
  const [activeTab, setActiveTab] = useState<'contract' | 'inspection'>(initialTab);
  const [roomNumber, setRoomNumber] = useState<string | null>(null);
  const [tenantName, setTenantName] = useState<string | null>(null);

  // Status indicators for badges
  const [contractConfirmed, setContractConfirmed] = useState<boolean | null>(null);
  const [inspectionStatus, setInspectionStatus] = useState<InspectionStatus | null>(null);

  return (
    <div
      className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto overscroll-contain"
      onClick={onClose}
    >
      <div
        className="max-w-3xl md:max-w-4xl w-full bg-white text-slate-900 rounded-3xl border border-slate-200 h-[88dvh] max-h-[88dvh] flex flex-col overflow-hidden my-auto shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 p-5 sm:p-6 pb-3 border-b border-slate-100 space-y-3 bg-slate-50/70">
          <div className="flex justify-between items-start gap-3">
            <div>
              <h2 className="font-black text-slate-900 text-base sm:text-lg flex items-center gap-2">
                <span>📋 ตรวจรับห้องและทำสัญญา</span>
                {roomNumber && <span className="text-primary font-bold">· ห้อง {roomNumber}</span>}
              </h2>
              {tenantName && <p className="text-xs text-slate-500 mt-0.5">ผู้เช่า: {tenantName}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-lg font-bold p-1 rounded-lg hover:bg-slate-100 transition"
              aria-label="ปิด"
            >
              ✕
            </button>
          </div>

          {/* Tab Navigation */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-slate-100 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('contract')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition ${
                activeTab === 'contract'
                  ? 'bg-white text-violet-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>📝 1. ข้อมูลสัญญา</span>
              {contractConfirmed !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    contractConfirmed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}
                >
                  {contractConfirmed ? '✓ ยืนยันแล้ว' : '⏳ รอยืนยัน'}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('inspection')}
              className={`flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-black transition ${
                activeTab === 'inspection'
                  ? 'bg-white text-sky-700 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
              }`}
            >
              <span>🔍 2. ตรวจสภาพห้อง</span>
              {inspectionStatus !== null && (
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    inspectionStatus === 'acknowledged'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : inspectionStatus === 'pending_ack'
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : 'bg-slate-200/80 text-slate-700 border border-slate-300'
                  }`}
                >
                  {inspectionStatus === 'acknowledged'
                    ? '✓ รับทราบแล้ว'
                    : inspectionStatus === 'pending_ack'
                    ? '⏳ รอรับทราบ'
                    : '○ รอตรวจ'}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Tab Body */}
        <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
          {activeTab === 'contract' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <ContractDataPanel
                contractId={contractId}
                showHeader={false}
                onClose={onClose}
                onSaved={onSaved}
                onLoaded={(data) => {
                  setContractConfirmed(data.confirmed);
                  if (data.roomNumber) setRoomNumber(data.roomNumber);
                  if (data.tenantName) setTenantName(data.tenantName);
                }}
              />
            </div>
          )}

          {activeTab === 'inspection' && (
            <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
              <InspectionPanel
                contractId={contractId}
                kind="move_in"
                showHeader={false}
                onClose={onClose}
                onSaved={(s) => {
                  setInspectionStatus(s);
                  onSaved?.();
                }}
                onLoaded={(data) => {
                  setInspectionStatus(data.status);
                  if (data.roomNumber) setRoomNumber(data.roomNumber);
                  if (data.tenantName) setTenantName(data.tenantName);
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ContractInspectionCombinedModal;
