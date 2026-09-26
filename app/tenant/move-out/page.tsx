import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import MoveOutForm from './components/MoveOutForm';
import CancelRequestButton from './components/CancelRequestButton';

async function getMoveOutData() {
  const session = await auth();
  if (!session?.user?.email) return null;

  const sql = getDb();
  
  // Find tenant by email or user link
  const tenantRes = await sql`
    SELECT t.id, t.name, t.phone, t.room_id, r.room_number 
    FROM tenants t 
    LEFT JOIN users u ON t.user_id = u.id 
    LEFT JOIN rooms r ON t.room_id = r.id
    WHERE t.email = ${session.user.email} OR u.email = ${session.user.email} 
    LIMIT 1
  `;
  if (tenantRes.length === 0) return null;
  const tenant = tenantRes[0];

  const requests = await sql`
    SELECT 
      mor.*, 
      r.room_number,
      c.deposit_amount as contract_deposit,
      c.start_date as contract_start_date,
      c.end_date as contract_end_date
    FROM move_out_requests mor
    LEFT JOIN rooms r ON mor.room_id = r.id
    LEFT JOIN contracts c ON c.id = COALESCE(mor.contract_id, (SELECT id FROM contracts WHERE tenant_id = mor.tenant_id ORDER BY id DESC LIMIT 1))
    WHERE mor.tenant_id = ${tenant.id} 
    ORDER BY mor.id DESC 
    LIMIT 1
  `;

  return requests.length > 0 ? requests[0] : null;
}

export default async function TenantMoveOut() {
  const request = await getMoveOutData();

  return (
    <div className="p-6 lg:p-10 max-w-5xl mx-auto space-y-10 font-sans">
      <div className="relative">
        <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1.5 h-10 bg-primary rounded-full" />
        <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
          <span className="p-2.5 bg-card rounded-2xl border border-border text-primary text-xl">
            🚪
          </span>
          แจ้งย้ายออก & ขอคืนเงินประกัน (Move Out)
        </h1>
        <p className="text-muted-foreground mt-2 text-sm font-medium flex items-center gap-2">
          ระบบตรวจสอบเงื่อนไขสัญญา 1 ปี หักค่าใช้จ่ายค้างชำระอัตโนมัติ และโอนคืนเงินประกันผ่านพร้อมเพย์
        </p>
      </div>

      {request ? (
        <div className="space-y-8">
          {/* Card Container */}
          <div className="bg-card rounded-3xl border border-border shadow-2xl overflow-hidden">
            
            {/* Status Header Badge */}
            <div className={`p-4 text-center font-black tracking-widest uppercase text-xs border-b ${
              request.status === 'Completed' 
                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' 
                : request.status === 'Approved'
                ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                : 'bg-amber-500/15 text-amber-400 border-amber-500/30'
            }`}>
              {request.status === 'Completed' 
                ? '✓ คืนเงินประกันและเสร็จสิ้นขั้นตอนการย้ายออกเรียบร้อยแล้ว (Completed)' 
                : request.status === 'Approved'
                ? '✓ ผู้ดูแลอนุมัติคำร้องแล้ว (รอการสแกนโอนเงินประกัน)'
                : '⏳ อยู่ระหว่างการตรวจสอบโดยผู้ดูแลหอพัก (Pending Verification)'}
            </div>

            <div className="p-8 sm:p-12 space-y-8">
              
              {/* Room & Target Overview */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 pb-6 border-b border-border">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-primary">คำร้องขอย้ายออก #{request.id}</span>
                  <h2 className="text-2xl font-black text-white">ห้อง {request.room_number || '-'}</h2>
                </div>

                <div className="flex items-center gap-3 bg-secondary/50 px-5 py-3 rounded-2xl border border-border">
                  <span className="text-2xl">💳</span>
                  <div>
                    <span className="text-[10px] font-bold text-muted-foreground block">พร้อมเพย์รับเงินคืน</span>
                    <span className="font-mono font-bold text-white text-sm">{request.promptpay_target || '-'}</span>
                    <span className="text-xs text-emerald-400 ml-2">({request.promptpay_name || 'ผู้เช่า'})</span>
                  </div>
                </div>
              </div>

              {/* Dates Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="bg-secondary/30 p-5 rounded-2xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">วันที่ต้องการย้ายออก</p>
                  <p className="text-lg font-bold text-amber-300">
                    {new Date(request.desired_date || request.move_out_date).toLocaleDateString('th-TH', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>

                <div className="bg-secondary/30 p-5 rounded-2xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">วันที่ยื่นคำร้อง</p>
                  <p className="text-lg font-bold text-white">
                    {new Date(request.created_at).toLocaleDateString('th-TH', { 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })}
                  </p>
                </div>

                <div className="bg-secondary/30 p-5 rounded-2xl border border-border">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">การตรวจสอบสัญญา 1 ปี</p>
                  <span className={`inline-block mt-1 px-3 py-1 rounded-full text-xs font-bold ${
                    request.is_contract_completed 
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' 
                      : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  }`}>
                    {request.is_contract_completed ? '✓ ครบกำหนดสัญญา 1 ปี' : '⚠️ ย้ายออกก่อนครบสัญญา'}
                  </span>
                </div>
              </div>

              {/* Financial Calculation Breakdown */}
              <div className="bg-secondary/20 p-6 rounded-3xl border border-border space-y-3">
                <h4 className="text-xs font-black uppercase tracking-wider text-primary">
                  รายละเอียดการคำนวณเงินประกัน
                </h4>

                <div className="flex justify-between text-sm text-foreground/80">
                  <span>เงินประกันสัญญาเดิมที่วางไว้:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    +฿{Number(request.deposit_amount || request.contract_deposit || 0).toLocaleString()}
                  </span>
                </div>

                <div className="flex justify-between text-sm text-foreground/80">
                  <span>หักยอดค่าใช้จ่ายค้างชำระ (บิลน้ำ-ไฟ-ห้อง):</span>
                  <span className="font-mono font-bold text-rose-400">
                    -฿{Number(request.unpaid_bills_total || 0).toLocaleString()}
                  </span>
                </div>

                {Number(request.penalty_amount || 0) > 0 && (
                  <div className="flex justify-between text-sm text-foreground/80">
                    <span>หักค่าเสียหาย / ทำความสะอาดห้องเพิ่มเติม:</span>
                    <span className="font-mono font-bold text-rose-400">
                      -฿{Number(request.penalty_amount).toLocaleString()}
                    </span>
                  </div>
                )}

                <div className="pt-3 border-t border-border flex justify-between items-center">
                  <span className="font-bold text-white text-base">
                    {request.status === 'Completed' ? 'ยอดเงินประกันสุทธิที่โอนคืนแล้ว:' : 'ยอดเงินประกันสุทธิที่คาดว่าจะได้รับคืน:'}
                  </span>
                  <span className="text-2xl font-black font-mono text-emerald-400">
                    ฿{Number(request.net_refund_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* Refund Completed Section */}
              {request.status === 'Completed' && (
                <div className="p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-3xl space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">🎉</span>
                    <div>
                      <h4 className="text-base font-bold text-emerald-400">โอนเงินประกันคืนเข้าบัญชีพร้อมเพย์แล้ว</h4>
                      <p className="text-xs text-white/70">
                        ผู้ดูแลหอพักได้สแกน QR Code พร้อมเพย์ ล็อคยอดเงินโอนคืนเป๊ะ <strong>฿{Number(request.net_refund_amount || 0).toFixed(2)} บาท</strong> เรียบร้อยแล้ว
                        {request.refunded_at && ` เมื่อวันที่ ${new Date(request.refunded_at).toLocaleDateString('th-TH')} เวลา ${new Date(request.refunded_at).toLocaleTimeString('th-TH')}`}
                      </p>
                    </div>
                  </div>

                  {request.refund_slip_url && (
                    <div className="pt-2">
                      <span className="text-xs font-bold text-muted-foreground block mb-2">หลักฐานการโอนเงินคืน:</span>
                      <a href={request.refund_slip_url} target="_blank" rel="noreferrer" className="inline-block">
                        <img 
                          src={request.refund_slip_url} 
                          alt="Refund Slip" 
                          className="w-32 h-44 object-cover rounded-xl border border-white/20 hover:scale-105 transition-transform" 
                        />
                      </a>
                    </div>
                  )}

                  {request.inspection_notes && (
                    <p className="text-xs text-white/60 italic pt-1">
                      บันทึกเพิ่มเติมจากผู้ดูแล: {request.inspection_notes}
                    </p>
                  )}
                </div>
              )}

              {/* Reason */}
              {request.reason && (
                <div>
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-2 font-mono">เหตุผลการย้ายออก</p>
                  <div className="bg-secondary/40 border border-border rounded-2xl p-5 text-white/80 italic text-sm">
                    &quot;{request.reason}&quot;
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 border-t border-border pt-6">
                {request.status === 'Pending' && (
                  <CancelRequestButton requestId={request.id} />
                )}
                {request.status === 'Completed' ? (
                  <div className="w-full py-3.5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-bold rounded-xl text-center text-sm">
                    ✓ ดำเนินการเสร็จสมบูรณ์ ขอบคุณที่ร่วมพักอาศัยกับหอพักเกษร 2
                  </div>
                ) : (
                  <div className="flex-1 bg-white/5 text-white/70 font-bold py-3.5 px-4 rounded-xl text-center text-sm border border-border">
                    ผู้ดูแลกำลังตรวจสอบรายการห้องพักและเตรียมการสแกนโอนเงิน
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      ) : (
        <MoveOutForm />
      )}
    </div>
  );
}
