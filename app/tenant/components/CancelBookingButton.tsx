'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CancelBookingButton({ contractId, roomId }: { contractId: number, roomId: number }) {
  const [cancelling, setCancelling] = useState(false);
  const router = useRouter();

  const handleCancel = async () => {
    if (!confirm('ยืนยันยกเลิกการจอง? ค่าจองที่ชำระแล้วจะไม่คืน (เป็นไปตามเงื่อนไขการจอง) และห้องจะเปิดให้ผู้อื่นจองทันที')) {
      return;
    }

    setCancelling(true);
    try {
      const res = await fetch('/api/booking/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contractId, roomId })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message || 'ยกเลิกการจองเรียบร้อยแล้ว');
        router.refresh();
        window.location.reload();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการยกเลิก');
      }
    } catch (e) {
      alert('เกิดข้อผิดพลาดในการยกเลิกการจอง');
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
