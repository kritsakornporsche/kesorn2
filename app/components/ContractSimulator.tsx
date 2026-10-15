'use client';

import { useEffect, useState } from 'react';
import { formatBaht } from '@/lib/format';

interface SimulatorProps {
  roomNumber: string;
  onClose?: () => void;
}

interface RoomCosts {
  roomNumber: string;
  rent: number;
  deposit: number;
  bookingFee: number;
  dueAtMoveIn: number;
  rates: { electricityPerUnit: number; waterPerPerson: number; commonFee: number };
}

// Cost calculator for a room. Every amount comes from the server (/api/rates?roomNumber=), nothing is computed
// from user input except the number of occupants for the water estimate. Booking happens through the booking form.
export default function ContractSimulator({ roomNumber, onClose }: SimulatorProps) {
  const [costs, setCosts] = useState<RoomCosts | null>(null);
  const [error, setError] = useState('');
  const [occupants, setOccupants] = useState(1);

  useEffect(() => {
    fetch(`/api/rates?roomNumber=${encodeURIComponent(roomNumber)}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.room) setCosts(json.room);
        else setError('ไม่พบข้อมูลค่าใช้จ่ายของห้องนี้');
      })
      .catch(() => setError('โหลดข้อมูลค่าใช้จ่ายไม่สำเร็จ'));
  }, [roomNumber]);

  const monthly = costs ? costs.rent + costs.rates.commonFee + costs.rates.waterPerPerson * occupants : 0;

  const Row = ({ label, value, note }: { label: string; value: string; note?: string }) => (
    <div className="flex justify-between items-start gap-3">
      <div>
        <p className="text-xs font-semibold text-slate-600">{label}</p>
        {note && <p className="text-[10px] text-slate-400">{note}</p>}
      </div>
      <span className="font-bold text-slate-900 whitespace-nowrap">{value}</span>
    </div>
  );

  return (
    <div className="bg-card text-foreground rounded-[2.5rem] sm:rounded-[3rem] p-6 sm:p-8 lg:p-10 border border-border shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
      <div className="flex justify-between items-start border-b border-border pb-4">
        <div className="space-y-1">
          <h2 className="text-2xl sm:text-3xl font-display font-black tracking-tight italic text-foreground">คำนวณค่าใช้จ่าย</h2>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-primary">ห้อง {roomNumber}</p>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-2xl transition-all duration-300 hover:scale-105 active:scale-95 cursor-pointer"
          >
            <svg className="w-5 h-5 text-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {error ? (
        <p className="text-sm text-muted-foreground">{error}</p>
      ) : !costs ? (
        <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
      ) : (
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white text-slate-900 rounded-[2rem] p-6 border border-slate-200 space-y-4">
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">ชำระตอนจอง</p>
              <p className="text-3xl font-display font-black tracking-tight">฿{formatBaht(costs.bookingFee)}</p>
              <p className="text-[11px] text-slate-500 mt-1">ค่าจองเป็นส่วนหนึ่งของเงินประกัน · ไม่คืนกรณียกเลิกการจอง</p>
            </div>
            <div className="pt-4 border-t border-slate-200 space-y-3 text-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">ชำระวันเข้าอยู่ ฿{formatBaht(costs.dueAtMoveIn)}</p>
              <Row label="ค่าเช่าเดือนแรก" note="เต็มเดือน ไม่คิดตามวัน" value={`฿${formatBaht(costs.rent)}`} />
              <Row label="เงินประกันส่วนที่เหลือ" note={`เงินประกันรวม ฿${formatBaht(costs.deposit)} − ค่าจอง`} value={`฿${formatBaht(Math.max(0, costs.deposit - costs.bookingFee))}`} />
            </div>
          </div>

          <div className="bg-white text-slate-900 rounded-[2rem] p-6 border border-slate-200 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-500">ค่าใช้จ่ายรายเดือนโดยประมาณ</p>
              <select
                value={occupants}
                onChange={(e) => setOccupants(Number(e.target.value))}
                className="px-3 py-1.5 rounded-xl bg-slate-100 border border-slate-200 text-xs font-bold cursor-pointer"
              >
                {[1, 2].map((n) => <option key={n} value={n}>{n} คน</option>)}
              </select>
            </div>
            <p className="text-3xl font-display font-black tracking-tight">฿{formatBaht(monthly)}</p>
            <div className="space-y-3 text-sm pt-2 border-t border-slate-200">
              <Row label="ค่าเช่า" value={`฿${formatBaht(costs.rent)}`} />
              <Row label="ค่าส่วนกลาง" value={`฿${formatBaht(costs.rates.commonFee)}`} />
              <Row label="ค่าน้ำ (เหมาจ่ายต่อคน)" note={`฿${formatBaht(costs.rates.waterPerPerson)} × ${occupants} คน`} value={`฿${formatBaht(costs.rates.waterPerPerson * occupants)}`} />
              <Row label="ค่าไฟ" note="ตามมิเตอร์ ไม่รวมในยอดประมาณ" value={`฿${formatBaht(costs.rates.electricityPerUnit)} / หน่วย`} />
            </div>
          </div>

          <p className="lg:col-span-2 text-xs text-muted-foreground">
            * ยอดคำนวณจากอัตราปัจจุบันของหอพัก · จองห้องได้ที่ปุ่ม "จองห้องพัก" ในหน้านี้
          </p>
        </div>
      )}
    </div>
  );
}
