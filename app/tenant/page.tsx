import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import Link from 'next/link';
import AnnouncementsSection from '../components/AnnouncementsSection';
import DormRulesCard from './components/DormRulesCard';
import CancelBookingButton from './components/CancelBookingButton';

async function getDashboardData() {
  const session = await auth();
  if (!session?.user?.email) {
    return { unpaidBills: [], recentMaintenance: [], roomInfo: null, pendingContract: null };
  }

  const sql = getDb();
  const userEmail = session.user.email;
  const userId = (session.user as any)?.id || 0;
  
  // Find tenant, room info and contract status
  const contractRes = await sql`
    SELECT 
      t.id as tenant_id,
      t.name as tenant_name,
      r.id as room_id,
      r.room_number,
      r.room_type,
      r.floor,
      r.price,
      c.id as contract_id,
      c.start_date,
      c.end_date,
      c.deposit_amount,
      c.status as contract_status,
      c.created_at as contract_created_at,
      dp.id as dorm_id,
      dp.name as dorm_name,
      dp.address as dorm_address,
      dp.phone as owner_phone,
      'เจ้าของหอพักเกษร 2' as owner_name
    FROM tenants t
    LEFT JOIN contracts c ON t.id = c.tenant_id
    LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, c.room_id)
    LEFT JOIN dormitory_profile dp ON 1=1
    WHERE (t.email = ${userEmail} OR t.user_id = ${userId} OR t.user_id IN (SELECT id FROM users WHERE email = ${userEmail}))
    ORDER BY c.id DESC
    LIMIT 1
  `;

  if (contractRes.length === 0) {
    return { unpaidBills: [], recentMaintenance: [], roomInfo: null, pendingContract: null };
  }

  const latestRecord = contractRes[0];
  const isPending = latestRecord.contract_status === 'PendingOwnerSignature';
  const hasRoom = Boolean(latestRecord.room_number || latestRecord.room_id);
  const isActive = latestRecord.contract_status === 'Active' || (!latestRecord.contract_id && hasRoom);

  // Find all unpaid bills for this tenant
  const unpaidBills = await sql`
    SELECT * FROM bills 
    WHERE tenant_id IN (
      SELECT id FROM tenants 
      WHERE email = ${userEmail} 
         OR user_id = ${userId}
         OR user_id IN (SELECT id FROM users WHERE email = ${userEmail})
    ) 
    AND status NOT IN ('Paid', 'paid') 
    ORDER BY due_date ASC
  `;

  // Find recent maintenance requests
  const recentMaintenance = await sql`
    SELECT * FROM maintenance_requests 
    WHERE tenant_id IN (
      SELECT id FROM tenants 
      WHERE email = ${userEmail} 
         OR user_id = ${userId}
         OR user_id IN (SELECT id FROM users WHERE email = ${userEmail})
    ) 
    ORDER BY created_at DESC 
    LIMIT 3
  `;

  return { 
    unpaidBills, 
    recentMaintenance, 
    roomInfo: (isActive || hasRoom) ? latestRecord : null,
    pendingContract: isPending ? latestRecord : null
  };
}

export default async function TenantDashboard() {
  const { unpaidBills, recentMaintenance, roomInfo, pendingContract } = await getDashboardData();

  return (
    <div className="p-6 sm:p-8 lg:p-10 hidden-scrollbar">
      <div className="max-w-6xl mx-auto pb-16 space-y-10">
        
        {/* ========================================================================= */}
        {/* 1. GUEST PENDING BOOKING STATUS BANNER (เมื่อจองแล้วและรอเจ้าของหออนุมัติ) */}
        {/* ========================================================================= */}
        {pendingContract && (
          <section className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-slate-800 to-amber-950/40 rounded-[3rem] border border-amber-500/30 p-8 sm:p-10 lg:p-12 shadow-2xl space-y-8 animate-in fade-in slide-in-from-top-4 duration-700">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-96 h-96 bg-amber-500/10 rounded-full -mr-32 -mt-32 blur-3xl pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-border pb-8">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-full text-xs font-bold">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  สถานะการจองห้องพัก
                </div>
                <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                  กำลังรอการตรวจสอบและอนุมัติสัญญา
                </h1>
                <p className="text-sm text-slate-300">
                  คุณได้ส่งคำขอจองและยืนยันสัญญาเช่าเรียบร้อยแล้ว เจ้าของหอพักกำลังดำเนินการตรวจสอบ
                </p>
              </div>

              <div className="px-5 py-3 bg-amber-500/15 border border-amber-500/30 rounded-2xl text-amber-300 text-xs font-bold flex items-center gap-2.5">
                <span className="text-xl">⏳</span>
                <span>รอเจ้าของหอพักอนุมัติ</span>
              </div>
            </div>

            {/* Stepper Progress */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="p-4 bg-white/5 border border-emerald-500/30 rounded-2xl flex items-center gap-3.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center justify-center font-bold text-sm shrink-0">
                  ✓
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">ขั้นตอนที่ 1</p>
                  <p className="text-xs font-bold text-white">ยืนยันสัญญาเช่าออนไลน์</p>
                </div>
              </div>

              <div className="p-4 bg-amber-500/10 border border-amber-500/40 rounded-2xl flex items-center gap-3.5 shadow-lg shadow-amber-500/5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 text-slate-900 flex items-center justify-center font-bold text-sm shrink-0 animate-pulse">
                  2
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-amber-300">ขั้นตอนที่ 2 (ปัจจุบัน)</p>
                  <p className="text-xs font-bold text-white">เจ้าของหอพักตรวจสอบ & อนุมัติ</p>
                </div>
              </div>

              <div className="p-4 bg-white/5 border border-border rounded-2xl flex items-center gap-3.5 opacity-60">
                <div className="w-9 h-9 rounded-xl bg-white/10 text-white/60 flex items-center justify-center font-bold text-sm shrink-0">
                  3
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-white/50">ขั้นตอนที่ 3</p>
                  <p className="text-xs font-bold text-white">ปลดล็อกสิทธิ์ผู้เช่า & เข้าอยู่</p>
                </div>
              </div>
            </div>

            {/* Booked Room Details Card */}
            <div className="bg-slate-950/60 rounded-[2.5rem] border border-border p-6 sm:p-8 grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">หอพัก</span>
                <p className="text-lg font-bold text-white truncate">{pendingContract.dorm_name || 'SmartDom Dormitory'}</p>
                {pendingContract.dorm_address && (
                  <p className="text-[11px] text-white/40 truncate">{pendingContract.dorm_address}</p>
                )}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">ห้องพักที่จอง</span>
                <p className="text-2xl font-black text-amber-300">
                  ห้อง {pendingContract.room_number} <span className="text-xs font-normal text-white/60">({pendingContract.room_type})</span>
                </p>
                <p className="text-[11px] text-white/40">ชั้น {pendingContract.floor || 1}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">ค่าเช่า / ประกันสัญญา</span>
                <p className="text-lg font-bold text-white">฿{Number(pendingContract.price || 0).toLocaleString()} <span className="text-xs font-normal text-white/50">/เดือน</span></p>
                <p className="text-[11px] text-emerald-400 font-semibold">เงินประกัน: ฿{Number(pendingContract.deposit_amount || 0).toLocaleString()}</p>
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-white/50 uppercase tracking-widest">วันที่ทำรายการ</span>
                <p className="text-sm font-bold text-white">
                  {pendingContract.contract_created_at ? new Date(pendingContract.contract_created_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'}
                </p>
                <p className="text-[11px] text-white/40">
                  เริ่มสัญญา: {new Date(pendingContract.start_date).toLocaleDateString('th-TH')}
                </p>
              </div>
            </div>

            {/* Actions & Contact */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-2">
              <p className="text-xs text-slate-300 text-center sm:text-left">
                💡 เมื่อเจ้าของหอพักกดอนุมัติสัญญา ระบบจะเปิดการใช้งานแดชบอร์ดเต็มรูปแบบให้คุณโดยอัตโนมัติ
              </p>
              <div className="flex items-center gap-3 flex-wrap justify-center sm:justify-end">
                <CancelBookingButton 
                  contractId={pendingContract.contract_id} 
                  roomId={pendingContract.room_id} 
                />
                {pendingContract.deposit_amount > 0 && (
                  <Link
                    href="/tenant/refund-request"
                    className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-xs transition-all border border-rose-500/40 hover:border-rose-400/60 hover:scale-105 active:scale-95 flex items-center gap-2"
                  >
                    <span>💰</span>
                    <span>ขอคืนเงินมัดจำ</span>
                  </Link>
                )}
                <Link
                  href="/tenant/chat"
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-2xl text-xs transition-all shadow-lg hover:scale-105 active:scale-95 flex items-center gap-2"
                >
                  <span>💬</span>
                  <span>แชทสอบถามเจ้าของหอ</span>
                </Link>
                <Link
                  href="/explore"
                  className="px-5 py-2.5 bg-white/10 hover:bg-white/20 text-white font-bold rounded-2xl text-xs transition-all border border-border hover:scale-105 active:scale-95"
                >
                  สำรวจห้องอื่น
                </Link>
              </div>
            </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* 2. ACTIVE TENANT WELCOME SECTION (เมื่อมีสัญญา Active) */}
        {/* ========================================================================= */}
        {roomInfo && (
          <section className="relative overflow-hidden bg-card rounded-[3rem] border border-border p-8 sm:p-12 shadow-2xl shadow-[#3E342B]/5">
              <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -mr-32 -mt-32 blur-3xl" />
              <div className="relative z-10 flex flex-col lg:flex-row justify-between items-center gap-8">
                  <div className="text-center lg:text-left">
                      <h1 className="text-4xl md:text-5xl font-black text-foreground tracking-tight mb-3">
                          ยินดีต้อนรับสู่บ้านใหม่
                      </h1>
                      <p className="text-base text-muted-foreground font-medium max-w-md">
                          {roomInfo.dorm_name || 'SmartDom Dormitory'} พร้อมดูแลความสุขและการใช้ชีวิตของคุณในทุกวัน
                      </p>
                  </div>
                  
                  <div className="flex gap-4 md:gap-6 flex-wrap justify-center">
                      <div className="bg-card px-8 py-5 rounded-3xl border border-border text-center min-w-[130px] transform hover:scale-105 transition-transform">
                          <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Room</span>
                          <span className="text-3xl font-black text-foreground">{roomInfo.room_number}</span>
                      </div>
                      <div className="bg-card px-8 py-5 rounded-3xl border border-border text-center min-w-[130px] transform hover:scale-105 transition-transform">
                          <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Floor</span>
                          <span className="text-3xl font-black text-foreground">{roomInfo.floor}</span>
                      </div>
                      <div className="bg-card px-8 py-5 rounded-3xl border border-border text-center min-w-[130px] transform hover:scale-105 transition-transform">
                          <span className="block text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mb-1">Type</span>
                          <span className="text-lg font-black text-foreground truncate max-w-[120px]">{roomInfo.room_type}</span>
                      </div>
                  </div>
              </div>
          </section>
        )}

        {/* ========================================================================= */}
        {/* 3. NO BOOKING OR ROOM (เมื่อเป็น Guest ที่ยังไม่ได้จองห้องพักใดๆ) */}
        {/* ========================================================================= */}
        {!roomInfo && !pendingContract && (
          <section className="bg-card rounded-[3rem] border border-border p-10 sm:p-14 text-center shadow-xl space-y-6">
            <div className="w-20 h-20 rounded-full bg-primary/10 border border-primary/20 text-primary flex items-center justify-center text-4xl mx-auto">
              🏠
            </div>
            <div className="space-y-2 max-w-md mx-auto">
              <h2 className="text-2xl sm:text-3xl font-black text-foreground tracking-tight">คุณยังไม่มีรายการห้องพักหรือการจอง</h2>
              <p className="text-sm text-slate-300">
                เลือกชมห้องพักที่ว่างพร้อมเข้าอยู่ของหอพักเกษร 2 แล้วเริ่มต้นจองห้องพักออนไลน์ได้ทันที
              </p>
            </div>
            <div className="pt-2">
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold rounded-full text-sm shadow-xl shadow-primary/20 transition-all hover:scale-105 active:scale-95"
              >
                <span>🔍 สำรวจหอพักและห้องว่างทันที</span>
              </Link>
            </div>
          </section>
        )}

        {/* Unpaid Bills Alert - Full Width (Active Tenants Only) */}
        {unpaidBills.length > 0 && (
          <div className="bg-[#FAF3E8] border border-[#E9C46A] rounded-[2.5rem] p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8 transition-all hover:shadow-md animate-in fade-in slide-in-from-top-4 duration-1000">
            <div className="flex gap-6 items-start">
              <div className="h-14 w-14 bg-[#E9C46A] text-white rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-[#E9C46A]/20">
                <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              </div>
              <div>
                <h2 className="text-xl font-black text-primary mb-1.5">คุณมียอดค้างชำระ ({unpaidBills.length} รายการ)</h2>
                <p className="text-primary/80 font-medium max-w-xl">
                    กรุณาชำระยอดรวม ฿{unpaidBills.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0).toLocaleString()} 
                    ภายในวันที่ {new Date(unpaidBills[0].due_date).toLocaleDateString('th-TH')}
                </p>
              </div>
            </div>
            <Link href="/tenant/billing" className="bg-primary hover:bg-primary/90 text-white font-bold py-4 px-10 rounded-2xl transition-all shadow-xl shadow-primary/20 active:scale-95 whitespace-nowrap text-lg">
              ชำระเงินทันที
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10 items-start">
          {/* Main Column */}
          <div className="lg:col-span-2 space-y-10">
            
            {/* Maintenance Status Quick View */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-white flex items-center gap-4">
                  <div className="w-3 h-8 bg-primary rounded-full" />
                  สถานะการดูแลแจ้งซ่อม & ทำความสะอาด
                </h2>
                <Link href="/tenant/maintenance" className="text-sm font-black text-muted-foreground hover:text-white/80 uppercase tracking-widest border-b-2 border-transparent hover:border-primary transition-all pb-1">ดูประวัติทั้งหมด</Link>
              </div>
              
              <div className="grid gap-6">
                {recentMaintenance.length === 0 ? (
                    <div className="bg-card border-2 border-dashed border-border rounded-[2rem] p-10 text-center">
                      <div className="w-14 h-14 bg-card rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-7 h-7 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                      </div>
                      <p className="text-white/50 font-bold text-sm">ยังไม่มีรายการแจ้งซ่อมหรือทำความสะอาดในขณะนี้</p>
                      <Link href="/tenant/maintenance" className="mt-3 inline-block text-primary font-bold text-xs">แจ้งซ่อม / ทำความสะอาด →</Link>
                    </div>
                ) : recentMaintenance.map((maint: any) => {
                    const isPending = maint.status === 'Pending' || maint.status === 'pending';
                    const isInProgress = maint.status === 'InProgress' || maint.status === 'in_progress' || maint.status === 'In Progress';
                    return (
                    <div key={maint.id} className="bg-card rounded-[2rem] border border-border p-6 sm:p-8 shadow-sm hover:shadow-lg transition-all group">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4">
                        <div className="flex gap-4 items-start">
                            <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
                                isPending ? 'bg-[#FAF3E8]' :
                                isInProgress ? 'bg-[#E3F2FD]' : 'bg-[#E8F5E9]'
                            }`}>
                                <svg className={`w-5 h-5 ${
                                    isPending ? 'text-[#D4A373]' :
                                    isInProgress ? 'text-[#2196F3]' : 'text-[#4CAF50]'
                                }`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /></svg>
                            </div>
                            <div>
                                <h4 className="font-bold text-white text-base">{maint.issue_type || 'รายการแจ้งซ่อม'}</h4>
                                <p className="text-xs text-white/50 font-medium flex items-center gap-1.5 mt-0.5">
                                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                    {new Date(maint.created_at).toLocaleDateString('th-TH')}
                                </p>
                            </div>
                        </div>
                        <span className={`px-3.5 py-1 text-[10px] font-black uppercase tracking-widest rounded-full border ${
                            isPending ? 'bg-[#FAF3E8] text-[#D4A373] border-[#E9C46A]' :
                            isInProgress ? 'bg-[#E3F2FD] text-[#2196F3] border-[#BBDEFB]' :
                            'bg-[#E8F5E9] text-[#4CAF50] border-[#C8E6C9]'
                        }`}>
                            {isPending ? 'รอดำเนินการ' : isInProgress ? 'กำลังดำเนินการ' : 'เสร็จสิ้น'}
                        </span>
                      </div>
                      <p className="text-white/80 leading-relaxed text-sm italic border-l-4 border-white/20 pl-4">"{maint.description}"</p>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Premium Tools Section */}
            <section>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-2xl font-black text-white flex items-center gap-4">
                  <div className="w-3 h-8 bg-primary rounded-full" />
                  เครื่องมือและบริการ
                </h2>
              </div>
              
              <div className="grid gap-6 md:grid-cols-2">
                <Link href="/tenant/contract/simulate" className="group bg-card rounded-[2.5rem] border border-border p-8 shadow-sm hover:border-primary/30 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300 overflow-hidden relative">
                  <div className="flex items-start gap-5 relative z-10">
                    <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center text-primary group-hover:bg-primary group-hover:text-white transition-all shadow-inner shrink-0">
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M11 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground mb-1.5">จำลองสัญญาเช่า</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">คำนวณเงินประกันและค่างวดล่วงหน้า เพื่อวางแผนการย้ายเข้าหรืออาศัยอยู่ต่อ</p>
                    </div>
                  </div>
                </Link>
                
                <Link href="/tenant/maintenance" className="group bg-card rounded-[2.5rem] border border-border p-8 shadow-sm hover:border-accent/30 hover:shadow-2xl hover:-translate-y-1 transition-all duration-300">
                  <div className="flex items-start gap-5 relative z-10">
                    <div className="w-14 h-14 bg-accent/10 rounded-2xl flex items-center justify-center text-accent group-hover:bg-accent group-hover:text-white transition-all shrink-0">
                      <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                    </div>
                    <div>
                      <h3 className="text-lg font-black text-foreground mb-1.5">แจ้งปัญหาการใช้งาน</h3>
                      <p className="text-xs text-muted-foreground leading-relaxed font-medium">พบปัญหาอุปกรณ์ชำรุด หรือไฟดับ? แจ้งเจ้าหน้าที่ได้ทันทีผ่านระบบออนไลน์</p>
                    </div>
                  </div>
                </Link>
              </div>
            </section>
          </div>

          {/* Sidebar Column */}
          <div className="space-y-10 h-fit lg:sticky lg:top-24">
              {/* Announcements Component */}
              <AnnouncementsSection />

              {/* Dormitory Rules Card */}
              <DormRulesCard />


          </div>
        </div>
      </div>
    </div>
  );
}
