'use client';

import { use, useEffect, useState } from 'react';
import { formatBaht, formatThaiDate, formatThaiDateTime, PAYMENT_METHOD_LABEL } from '@/lib/format';

interface Receipt {
  receipt_no: string;
  dorm: { name: string; address: string; phone: string; tax_id: string };
  payment: {
    id: number; amount: number; method: string; paid_at: string; slip_ref: string | null; note: string | null;
    received_by: string; voided: boolean; voided_at: string | null; void_reason: string | null; voided_by: string | null;
  };
  bill: {
    id: number; title: string; room_number: string; billing_cycle: string; tenant_name: string;
    items: { label: string; amount: number }[];
    amount: number; late_fee: number; days_overdue: number; total_due: number; paid_through: number; remaining: number;
  };
}

// Printable receipt for one payment (owner/manager, or the tenant who owns the bill)
export default function ReceiptPage({ params }: { params: Promise<{ paymentId: string }> }) {
  const { paymentId } = use(params);
  const [data, setData] = useState<Receipt | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/receipts/${paymentId}`)
      .then(async (res) => {
        const json = await res.json();
        if (json.success) setData(json.data);
        else setError(json.message || 'ไม่พบใบเสร็จ');
      })
      .catch(() => setError('โหลดใบเสร็จไม่สำเร็จ'));
  }, [paymentId]);

  if (error) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-700 p-6">{error}</div>;
  if (!data) return <div className="min-h-screen flex items-center justify-center bg-white text-slate-500 p-6">กำลังโหลด...</div>;

  const { dorm, payment, bill } = data;

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white py-8 print:py-0 px-4 text-slate-900">
      <div className="max-w-xl mx-auto mb-4 flex justify-end gap-2 print:hidden">
        <button onClick={() => window.print()} className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold">
          🖨️ พิมพ์ใบเสร็จ
        </button>
      </div>

      <div className="relative max-w-xl mx-auto bg-white p-8 rounded-xl shadow print:shadow-none print:rounded-none">
        {payment.voided && (
          <div className="mb-4 p-3 border-2 border-red-600 text-red-700 text-sm font-bold rounded">
            ใบเสร็จนี้ถูกยกเลิกแล้ว {payment.voided_at ? `เมื่อ ${formatThaiDateTime(payment.voided_at)}` : ''}
            {payment.voided_by ? ` โดย ${payment.voided_by}` : ''}
            {payment.void_reason ? ` — ${payment.void_reason}` : ''}
          </div>
        )}

        <div className="flex justify-between items-start border-b border-slate-300 pb-4">
          <div>
            <h1 className="text-xl font-bold">{dorm.name}</h1>
            {dorm.address && <p className="text-xs text-slate-600 mt-1">{dorm.address}</p>}
            {dorm.phone && <p className="text-xs text-slate-600">โทร {dorm.phone}</p>}
            {dorm.tax_id && <p className="text-xs text-slate-600">เลขประจำตัวผู้เสียภาษี {dorm.tax_id}</p>}
          </div>
          <div className="text-right">
            <p className="text-lg font-bold">ใบเสร็จรับเงิน</p>
            <p className="text-xs text-slate-600 mt-1">เลขที่ {data.receipt_no}</p>
            <p className="text-xs text-slate-600">วันที่รับเงิน {formatThaiDateTime(payment.paid_at)}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-sm py-4 border-b border-slate-200">
          <p><span className="text-slate-500">ผู้เช่า:</span> {bill.tenant_name || '-'}</p>
          <p><span className="text-slate-500">ห้อง:</span> {bill.room_number}</p>
          <p><span className="text-slate-500">รอบบิล:</span> {bill.billing_cycle}</p>
          <p><span className="text-slate-500">บิลเลขที่:</span> #{bill.id}</p>
        </div>

        <table className="w-full text-sm my-4">
          <tbody>
            {bill.items.map((item) => (
              <tr key={item.label} className="border-b border-slate-100">
                <td className="py-1.5">{item.label}</td>
                <td className="py-1.5 text-right font-mono">{formatBaht(item.amount)}</td>
              </tr>
            ))}
            {bill.late_fee > 0 && (
              <tr className="border-b border-slate-100">
                <td className="py-1.5">ค่าปรับชำระล่าช้า ({bill.days_overdue} วัน ณ วันที่ชำระ)</td>
                <td className="py-1.5 text-right font-mono">{formatBaht(bill.late_fee)}</td>
              </tr>
            )}
            <tr className="font-bold">
              <td className="py-2">ยอดที่ต้องชำระทั้งบิล</td>
              <td className="py-2 text-right font-mono">{formatBaht(bill.total_due)}</td>
            </tr>
          </tbody>
        </table>

        <div className="bg-slate-50 rounded-lg p-4 text-sm space-y-1">
          <div className="flex justify-between text-base font-bold">
            <span>รับเงินครั้งนี้</span>
            <span className="font-mono">฿{formatBaht(payment.amount)}</span>
          </div>
          <div className="flex justify-between"><span className="text-slate-500">วิธีชำระ</span><span>{PAYMENT_METHOD_LABEL[payment.method] || payment.method}</span></div>
          {payment.slip_ref && <div className="flex justify-between"><span className="text-slate-500">อ้างอิงสลิป</span><span className="font-mono text-xs">{payment.slip_ref}</span></div>}
          <div className="flex justify-between"><span className="text-slate-500">ชำระแล้วรวม (ถึงครั้งนี้)</span><span className="font-mono">฿{formatBaht(bill.paid_through)}</span></div>
          <div className="flex justify-between font-bold">
            <span>คงเหลือ</span>
            <span className="font-mono">{bill.remaining > 0 ? `฿${formatBaht(bill.remaining)}` : 'ชำระครบแล้ว'}</span>
          </div>
          {payment.note && <p className="text-xs text-slate-500 pt-1">หมายเหตุ: {payment.note}</p>}
        </div>

        <div className="mt-10 flex justify-end text-sm">
          <div className="text-center">
            <p className="border-t border-slate-400 pt-1 px-8">{payment.received_by}</p>
            <p className="text-xs text-slate-500">ผู้รับเงิน</p>
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-6">พิมพ์เมื่อ {formatThaiDate(new Date())}</p>
      </div>
    </div>
  );
}
