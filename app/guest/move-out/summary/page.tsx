'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';

interface MoveOutSummaryData {
  id: number;
  room_number: string;
  floor: number;
  room_price: number;
  tenant_name: string;
  desired_date: string;
  move_out_type: 'Early' | 'Normal';
  settlement_type: 'OwnerRefund' | 'TenantPay' | 'ZeroBalance';
  settlement_status: string;
  electric_prev_unit: number;
  electric_new_unit: number;
  electric_units_used: number;
  electric_amount: number;
  water_amount: number;
  common_fee: number;
  room_rent_amount: number;
  extra_damage_amount: number;
  extra_damage_note: string;
  total_expenses: number;
  net_refund_amount: number;
  unpaid_bills_total: number;
  refund_slip_url: string | null;
  refunded_at: string | null;
  inspection_notes: string | null;
  created_at: string;
  /** commit 12 on: amounts from lib/moveOut.ts; null for older move-outs */
  settlement: null | {
    id: number;
    return_date: string | null;
    final_bill: null | { id: number; amount: number; room_amount: number; electric_amount: number; electric_units: number; water_amount: number; common_fee: number };
    damage_bill: null | { id: number; amount: number };
    damage_items: { amount: number; reason: string }[];
    prev_meter: number | null;
    final_meter: number | null;
    outstanding: { id: number; title: string; outstanding: number }[];
    outstanding_total: number;
    money: null | { deposit: number | null; offset: number; forfeit: number; refund: number; refunded_at: string | null; has_refund_file: boolean };
  };
}

const baht = (n: number | null | undefined) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** A move-out from commit 12 on: every figure from its settlement (lib/moveOut.ts) — the bills it issued, the deposit and what is still owed. */
function SettlementBreakdown({ s }: { s: NonNullable<MoveOutSummaryData['settlement']> }) {
  const fb = s.final_bill;
  const damageTotal = s.damage_bill ? s.damage_bill.amount : 0;
  const total = (fb ? fb.amount : 0) + damageTotal;
  const money = s.money;
  const row = (label: string, amount: number, cls = 'text-slate-600') => (
    <div className={`flex justify-between py-2 ${cls}`}><span>{label}</span><span>{baht(amount)}</span></div>
  );
  return (
    <div className="divide-y divide-slate-200 font-mono text-xs">
      {fb && fb.room_amount > 0 && row('ค่าเช่าเดือนที่คืนห้อง:', fb.room_amount)}
      {fb && row(`ค่าไฟ (เลขเดิม ${s.prev_meter ?? '-'} → วันคืนห้อง ${s.final_meter ?? '-'} = ${fb.electric_units} หน่วย):`, fb.electric_amount)}
      {fb && fb.water_amount > 0 && row('ค่าน้ำ:', fb.water_amount)}
      {fb && fb.common_fee > 0 && row('ค่าส่วนกลาง:', fb.common_fee)}
      {s.damage_items.length > 0
        ? s.damage_items.map((d, i) => <div key={i}>{row(`ค่าเสียหาย: ${d.reason}`, d.amount, 'text-rose-700')}</div>)
        : damageTotal > 0 && row('ค่าเสียหาย:', damageTotal, 'text-rose-700')}
      <div className="flex justify-between py-2.5 text-slate-900 font-black text-sm border-t border-slate-200">
        <span>รวมค่าใช้จ่ายตอนย้ายออก:</span><span className="text-primary">{baht(total)}</span>
      </div>
      {money && (
        <div className="py-3 text-sm font-black border-t border-dashed border-slate-200 space-y-1">
          <div className="flex justify-between text-slate-600"><span>เงินประกัน:</span><span>{baht(money.deposit)}</span></div>
          <div className="flex justify-between text-amber-800"><span>หักชำระจากเงินประกัน:</span><span>{baht(money.offset)}</span></div>
          {money.forfeit > 0 && <div className="flex justify-between text-rose-700"><span>ยึดเงินประกัน (ย้ายออกก่อนครบสัญญา):</span><span>{baht(money.forfeit)}</span></div>}
          <div className="flex justify-between text-emerald-700"><span>คืนเงินประกัน:</span><span className="text-base">{baht(money.refund)}</span></div>
        </div>
      )}
      {s.outstanding_total > 0 && (
        <div className="py-3 text-sm font-black border-t border-dashed border-slate-200 space-y-1">
          <div className="flex justify-between text-rose-700"><span>ยอดที่ยังค้างชำระ:</span><span className="text-base">{baht(s.outstanding_total)}</span></div>
          {s.outstanding.map((b) => (
            <div key={b.id} className="flex justify-between text-[11px] font-normal text-rose-700/80"><span>บิล #{b.id} {b.title}</span><span>{baht(b.outstanding)}</span></div>
          ))}
          <p className="text-[11px] font-normal text-slate-500">ชำระได้ที่หน้าบิลของฉัน</p>
        </div>
      )}
    </div>
  );
}

export default function GuestMoveOutSummaryPage() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [summaryList, setSummaryList] = useState<MoveOutSummaryData[]>([]);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/guest/move-out-history');
        const data = await res.json();
        if (data.success) {
          setSummaryList(data.data || []);
        }
      } catch (e) {
        console.error('Fetch move-out history error:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-200 shadow-xs">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-50 text-amber-800 border border-amber-200 flex items-center justify-center text-2xl shadow-xs">
              📜
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">ประวัติการอยู่อาศัย (Read-Only Archive)</span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900">ประวัติและใบเสร็จปิดยอดย้ายออก</h1>
            </div>
          </div>

          <Link
            href="/guest"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all text-center self-start sm:self-auto border border-slate-200"
          >
            ← กลับแดชบอร์ดแขก
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-500 font-bold">กำลังโหลดประวัติเอกสาร...</p>
          </div>
        ) : summaryList.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-3xl p-12 text-center space-y-3 shadow-xs">
            <p className="text-4xl">📁</p>
            <p className="text-sm font-bold text-slate-900">ไม่พบประวัติการย้ายออกในระบบ</p>
            <p className="text-xs text-slate-500">
              หากคุณเพิ่งดำเนินการย้ายออก เอกสารและใบเสร็จปิดยอดจะถูกเก็บไว้ที่นี่โดยอัตโนมัติ
            </p>
            <div className="pt-2">
              <Link href="/explore" className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-black inline-block shadow-xs">
                สำรวจห้องพักว่าง
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {summaryList.map((item) => {
              const isEarly = item.move_out_type === 'Early';
              const money = item.settlement?.money || null;
              return (
                <div
                  key={item.id}
                  className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 space-y-6 shadow-xs"
                >
                  {/* Badge & Room */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-slate-900 font-mono">ห้อง {item.room_number}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          isEarly 
                            ? 'bg-rose-50 text-rose-700 border-rose-200' 
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {isEarly ? 'ย้ายออกก่อนครบสัญญา' : 'ครบกำหนดสัญญา'}{item.settlement ? '' : ' · คำขอแบบเดิม'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        ผู้เช่า: <strong className="text-slate-900">{item.tenant_name}</strong> | วันที่ย้ายออก: <strong className="text-slate-900">{(() => { const d = item.settlement ? item.settlement.return_date : item.desired_date; return d ? new Date(d).toLocaleDateString('th-TH') : '-'; })()}</strong>
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[11px] font-black inline-block">
                        ✓ เสร็จสิ้นขั้นตอนการย้ายออก
                      </span>
                      {item.refunded_at && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          ปิดยอดเมื่อ: {new Date(item.refunded_at).toLocaleDateString('th-TH')}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Financial Breakdown Table */}
                  <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-3">
                    <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                      รายละเอียดค่าใช้จ่ายปิดยอดห้องพัก (Invoice Breakdown)
                    </h3>

                    {item.settlement ? <SettlementBreakdown s={item.settlement} /> : (
                    <div className="divide-y divide-slate-200 font-mono text-xs">
                      <div className="flex justify-between py-2 text-slate-600">
                        <span>ค่าเช่าเดือนที่คืนห้อง (เฉพาะที่ยังไม่ถูกเรียกเก็บ):</span>
                        <span>฿{Number(item.room_rent_amount || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-600">
                        <span>
                          ค่าไฟ (เลขเดิม {item.electric_prev_unit || 0} → เลขใหม่ {item.electric_new_unit || 0} = {item.electric_units_used || 0} หน่วย{Number(item.electric_units_used) > 0 ? ` × ${Number((Number(item.electric_amount || 0) / Number(item.electric_units_used)).toFixed(2))} บ.` : ''}):
                        </span>
                        <span className="text-primary font-bold">฿{Number(item.electric_amount || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-600">
                        <span>ค่าน้ำเหมาจ่าย:</span>
                        <span>฿{Number(item.water_amount || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-600">
                        <span>ค่าส่วนกลางเหมาจ่าย:</span>
                        <span>฿{Number(item.common_fee || 0).toLocaleString()}</span>
                      </div>
                      {Number(item.unpaid_bills_total || 0) > 0 && (
                        <div className="flex justify-between py-2 text-rose-700">
                          <span>ยอดค้างชำระจากเดือนก่อน:</span>
                          <span>฿{Number(item.unpaid_bills_total).toLocaleString()}</span>
                        </div>
                      )}
                      {Number(item.extra_damage_amount || 0) > 0 && (
                        <div className="flex justify-between py-2 text-rose-700">
                          <span>ค่าเสียหาย/ทำความสะอาดเพิ่มเติม ({item.extra_damage_note || '-'}):</span>
                          <span>฿{Number(item.extra_damage_amount).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2.5 text-slate-900 font-black text-sm border-t border-slate-200">
                        <span>รวมค่าใช้จ่ายทั้งหมด:</span>
                        <span className="text-primary">฿{Number(item.total_expenses || 0).toLocaleString()}</span>
                      </div>

                      {/* Net Result (older move-out: its own columns) */}
                      <div className="flex justify-between py-3 text-sm font-black border-t border-dashed border-slate-200">
                        {item.settlement_type === 'OwnerRefund' ? (
                          <>
                            <span className="text-emerald-700">คืนเงินประกันส่วนต่างให้ผู้เช่า:</span>
                            <span className="text-emerald-700 text-base">฿{Number(item.net_refund_amount || 0).toLocaleString()}</span>
                          </>
                        ) : item.settlement_type === 'TenantPay' ? (
                          <>
                            <span className="text-rose-700">ผู้เช่าชำระเพิ่มเติม:</span>
                            <span className="text-rose-700 text-base">ตามบิลในหน้าบิลของฉัน</span>
                          </>
                        ) : (
                          <>
                            <span className="text-sky-700">หักล้างยอดพอดี:</span>
                            <span className="text-sky-700 text-base">฿0.00</span>
                          </>
                        )}
                      </div>
                    </div>
                    )}
                  </div>

                  {/* Refund Slip or Notes */}
                  {money?.has_refund_file && item.settlement && (
                    <a href={`/api/move-out/${item.settlement.id}/refund-file`} target="_blank" rel="noreferrer" className="inline-block px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl border border-slate-200 text-xs font-bold text-slate-700 underline">
                      ดูสลิปการโอนคืนเงินประกัน
                    </a>
                  )}
                  {!item.settlement && item.refund_slip_url && (
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                      <span className="text-xs font-bold text-slate-700 block">สลิปการโอนเงินคืนเงินประกันจากทางหอพัก</span>
                      <div className="w-36 h-48 relative rounded-xl overflow-hidden border border-slate-200">
                        <img src={item.refund_slip_url} alt="Refund Slip" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}

                  {item.inspection_notes && (
                    <div className="p-3.5 bg-slate-100 rounded-xl text-xs text-slate-600 border border-slate-200">
                      บันทึกจากเจ้าของหอ: {item.inspection_notes}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}
