'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/components/ConfirmModalProvider';

export default function CancelBookingButton({ contractId, roomId }: { contractId: number, roomId: number }) {
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();
  const { confirm, alert } = useConfirm();

  const handleCancel = async () => {
    const ok = await confirm({
      title: 'ยืนยันยกเลิกการจองห้องพัก?',
      description: 'ค่าจองที่ชำระแล้วจะไม่คืน (เป็นไปตามเงื่อนไขการจอง) และห้องจะเปิดให้ผู้อื่นจองทันที',
      confirmText: 'ยืนยันยกเลิก',
      cancelText: 'ย้อนกลับ',
      variant: 'danger',
    });
    if (!ok) return;

    setCancelling(true);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, roomId })
      });
      const data = await res.json();
      if (data.success) {
        await alert({
          title: 'ยกเลิกการจองแล้ว',
          description: data.message || 'ยกเลิกการจองห้องพักเรียบร้อยแล้ว',
          variant: 'success',
        });
        router.refresh();
        window.location.reload();
      } else {
        await alert({
          title: 'ยกเลิกไม่สำเร็จ',
          description: data.message || 'เกิดข้อผิดพลาดในการยกเลิก',
          variant: 'danger',
        });
      }
    } catch (e: any) {
      await alert({
        title: 'เกิดข้อผิดพลาด',
        description: e?.message || 'ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้',
        variant: 'danger',
      });
    } finally {
      setCancelling(false);
    }
  };

  return (
    <button
      onClick={handleCancel}
      disabled={cancelling}
      className="px-4 py-2.5 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 rounded-2xl text-xs font-bold transition-all hover:scale-105 active:scale-95 disabled:opacity-50 cursor-pointer"
      title="ยกเลิกคำขอจองห้องพักนี้"
    >
      {cancelling ? 'กำลังยกเลิก...' : '✕ ยกเลิกการจองนี้'}
    </button>
  );
}
