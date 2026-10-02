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
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 p-6 rounded-3xl border border-white/10 shadow-2xl backdrop-blur-md">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center justify-center text-2xl shadow-lg">
              📜
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">ประวัติการอยู่อาศัย (Read-Only Archive)</span>
              <h1 className="text-xl sm:text-2xl font-black text-white">ประวัติและใบเสร็จปิดยอดย้ายออก</h1>
            </div>
          </div>

          <Link
            href="/guest"
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all text-center self-start sm:self-auto"
          >
            ← กลับแดชบอร์ดแขก
          </Link>
        </div>

        {/* Content */}
        {loading ? (
          <div className="py-20 text-center">
            <div className="w-8 h-8 border-3 border-primary/20 border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs text-slate-400 font-bold">กำลังโหลดประวัติเอกสาร...</p>
          </div>
        ) : summaryList.length === 0 ? (
          <div className="bg-slate-900/50 border border-white/10 rounded-3xl p-12 text-center space-y-3">
            <p className="text-4xl">📁</p>
            <p className="text-sm font-bold text-white">ไม่พบประวัติการย้ายออกในระบบ</p>
            <p className="text-xs text-slate-400">
              หากคุณเพิ่งดำเนินการย้ายออก เอกสารและใบเสร็จปิดยอดจะถูกเก็บไว้ที่นี่โดยอัตโนมัติ
            </p>
            <div className="pt-2">
              <Link href="/explore" className="px-5 py-2.5 bg-primary text-white rounded-xl text-xs font-black inline-block">
                สำรวจห้องพักว่าง
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {summaryList.map((item) => {
              const isEarly = item.move_out_type === 'Early';
              return (
                <div
                  key={item.id}
                  className="bg-slate-900 rounded-3xl border border-white/10 p-6 sm:p-8 space-y-6 shadow-2xl"
                >
                  {/* Badge & Room */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-5">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-2xl font-black text-white font-mono">ห้อง {item.room_number}</span>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${
                          isEarly 
                            ? 'bg-rose-500/15 text-rose-300 border-rose-500/30' 
                            : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                        }`}>
                          {isEarly ? 'ย้ายออกก่อนกำหนด (ริบประกัน)' : 'ครบกำหนดสัญญา (เงินประกัน ฿3,000)'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1">
                        ผู้เช่า: <strong className="text-white">{item.tenant_name}</strong> | วันที่ย้ายออก: <strong className="text-white">{item.desired_date ? new Date(item.desired_date).toLocaleDateString('th-TH') : '-'}</strong>
                      </p>
                    </div>

                    <div className="text-left sm:text-right">
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded-full text-[11px] font-black inline-block">
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
                  <div className="bg-slate-950 p-5 rounded-2xl border border-white/10 space-y-3">
                    <h3 className="text-xs font-black text-amber-400 uppercase tracking-wider">
                      รายละเอียดค่าใช้จ่ายปิดยอดห้องพัก (Invoice Breakdown)
                    </h3>

                    <div className="divide-y divide-white/5 font-mono text-xs">
                      <div className="flex justify-between py-2 text-slate-300">
                        <span>ค่าเช่าห้องเดือนสุดท้าย (คิดเต็มเดือน):</span>
                        <span>฿{Number(item.room_rent_amount || item.room_price || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-300">
                        <span>
                          ค่าไฟ (เลขเดิม {item.electric_prev_unit || 0} → เลขใหม่ {item.electric_new_unit || 0} = {item.electric_units_used || 0} หน่วย × 4.88 บ.):
                        </span>
                        <span className="text-primary font-bold">฿{Number(item.electric_amount || 0).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-300">
                        <span>ค่าน้ำเหมาจ่าย:</span>
                        <span>฿{Number(item.water_amount || 100).toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between py-2 text-slate-300">
                        <span>ค่าส่วนกลางเหมาจ่าย:</span>
                        <span>฿{Number(item.common_fee || 150).toLocaleString()}</span>
                      </div>
                      {Number(item.unpaid_bills_total || 0) > 0 && (
                        <div className="flex justify-between py-2 text-rose-300">
                          <span>ยอดค้างชำระจากเดือนก่อน:</span>
                          <span>฿{Number(item.unpaid_bills_total).toLocaleString()}</span>
                        </div>
                      )}
                      {Number(item.extra_damage_amount || 0) > 0 && (
                        <div className="flex justify-between py-2 text-rose-300">
                          <span>ค่าเสียหาย/ทำความสะอาดเพิ่มเติม ({item.extra_damage_note || '-'}):</span>
                          <span>฿{Number(item.extra_damage_amount).toLocaleString()}</span>
                        </div>
                      )}
                      <div className="flex justify-between py-2.5 text-white font-black text-sm border-t border-white/10">
                        <span>รวมค่าใช้จ่ายทั้งหมด:</span>
                        <span className="text-amber-400">฿{Number(item.total_expenses || 0).toLocaleString()}</span>
                      </div>

                      {/* Net Result */}
                      <div className="flex justify-between py-3 text-sm font-black border-t border-dashed border-white/20">
                        {item.settlement_type === 'OwnerRefund' ? (
                          <>
                            <span className="text-emerald-400">คืนเงินประกันส่วนต่างให้ผู้เช่า (฿3,000 - ค่าใช้จ่าย):</span>
                            <span className="text-emerald-300 text-base">฿{Number(item.net_refund_amount || 0).toLocaleString()}</span>
                          </>
                        ) : item.settlement_type === 'TenantPay' ? (
                          <>
                            <span className="text-rose-400">ผู้เช่าชำระเพิ่มเติม:</span>
                            <span className="text-rose-300 text-base">
                              ฿{(isEarly ? Number(item.total_expenses) : Math.max(0, Number(item.total_expenses) - 3000)).toLocaleString()}
                            </span>
                          </>
                        ) : (
                          <>
                            <span className="text-cyan-400">หักล้างยอดพอดี:</span>
                            <span className="text-cyan-300 text-base">฿0.00</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Refund Slip or Notes */}
                  {item.refund_slip_url && (
                    <div className="p-4 bg-slate-950 rounded-2xl border border-white/10 space-y-3">
                      <span className="text-xs font-bold text-slate-300 block">สลิปการโอนเงินคืนเงินประกันจากทางหอพัก</span>
                      <div className="w-36 h-48 relative rounded-xl overflow-hidden border border-white/10">
                        <img src={item.refund_slip_url} alt="Refund Slip" className="w-full h-full object-cover" />
                      </div>
                    </div>
                  )}

                  {item.inspection_notes && (
                    <div className="p-3.5 bg-slate-950/60 rounded-xl text-xs text-slate-400 border border-white/5">
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
