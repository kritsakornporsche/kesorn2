'use client';

import React from 'react';
import Link from 'next/link';
import { ResearcherLabNavBar } from '@/components/features/ResearcherLabNavBar';
import { ContractVerificationScanner } from '@/components/features/ContractVerificationScanner';

export default function Module6EContractVerifyLabPage() {
  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      <ResearcherLabNavBar />

      <div>
        <Link href="/researcher/lab" className="text-xs font-bold text-cyan-400 hover:underline">
          ← กลับสู่ศูนย์ปฏิบัติการฟีเจอร์ใหม่ (6 MIS Modules)
        </Link>
        <h1 className="text-2xl sm:text-3xl font-black text-white mt-1">
          🔐 โมดูล 6: Cryptographic E-Contract & Receipt Verification (SHA-256)
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-0.5">
          6.1.1 ระบบสร้างรหัสรับรองดิจิทัล SHA-256 และระบบสแกนยืนยันความถูกต้องของสัญญาเช่าและใบเสร็จรับเงิน ป้องกันการปลอมแปลงเอกสาร
        </p>
      </div>

      <ContractVerificationScanner />
    </div>
  );
}
