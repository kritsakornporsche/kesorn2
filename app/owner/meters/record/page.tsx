'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function MeterRecordRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    // Automatically redirect to the dedicated billing record page
    const timer = setTimeout(() => {
      router.replace('/owner/billing/record');
    }, 800);
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl border border-slate-200 shadow-sm text-center space-y-4">
        <span className="text-4xl block animate-bounce">🧾</span>
        <h2 className="text-lg font-black text-slate-900">กำลังย้ายไปหน้าระบบจดบิลรายเดือน...</h2>
        <p className="text-xs text-slate-500">
          ระบบได้แยกขั้นตอนการจดเลขมิเตอร์เพื่อออกบิลไปไว้ในส่วนงาน <strong>Monthly Billing</strong> เรียบร้อยแล้ว
        </p>
        <div className="pt-2">
          <Link
            href="/owner/billing/record"
            className="inline-block px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-white text-xs font-bold shadow-xs"
          >
            กดที่นี่หากระบบไม่เปลี่ยนหน้าอัตโนมัติ →
          </Link>
        </div>
      </div>
    </div>
  );
}
