const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

// Normalize CRLF to LF temporarily for reliable replacement if needed
const isCRLF = content.includes('\r\n');
if (isCRLF) {
  content = content.replace(/\r\n/g, '\n');
}

const target1 = `                          <div>
                            <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest mb-1 block">{bill.billing_cycle || 'รอบบิล'}</span>
                            <h3 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{bill.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isPendingCorrection ? (
                              <span className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                <span>⏳</span>
                                <span>ระงับชำระ (อยู่ระหว่างขอแก้บิล)</span>
                              </span>
                            ) : (`;

const replace1 = `                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">{bill.billing_cycle || 'รอบบิล'}</span>
                              <span className="px-2.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-black font-mono border border-primary/20">
                                บิล #{bill.id}
                              </span>
                            </div>
                            <h3 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{bill.title}</h3>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isPendingCorrection ? (
                              <span className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">
                                <span>⏳</span>
                                <span>{bill.correction_requested_by === 'owner' ? 'รอลูกหอยืนยันยอดแก้' : 'ระงับชำระ (รอเจ้าของหอตรวจสอบ)'}</span>
                              </span>
                            ) : (`;

const target2 = `                        </div>
                        
                        {/* Line-by-line detailed breakdown */}`;

const replace2 = `                        </div>

                        {/* Owner Bill Correction Notice & Action Banner */}
                        {isPendingCorrection && bill.correction_requested_by === 'owner' && (
                          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                            <div className="flex items-start gap-3">
                              <span className="text-xl">⚠️</span>
                              <div className="flex-1 text-xs sm:text-sm">
                                <p className="font-black text-amber-300">
                                  เจ้าของหอพักได้ส่งคำขอปรับปรุงยอดบิลใหม่
                                </p>
                                <p className="text-muted-foreground mt-1 text-xs">
                                  {bill.correction_new_reading && (
                                    <span className="mr-2">เลขมิเตอร์ใหม่: <strong className="text-foreground">{bill.correction_new_reading} หน่วย</strong></span>
                                  )}
                                  {bill.correction_new_total && (
                                    <span>ยอดรวมใหม่: <strong className="text-emerald-400">฿{Number(bill.correction_new_total).toLocaleString()}</strong></span>
                                  )}
                                </p>
                                {bill.correction_reason && (
                                  <p className="text-muted-foreground mt-0.5 text-xs">
                                    เหตุผล: <span className="italic text-foreground/80 font-medium">"{bill.correction_reason}"</span>
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">
                              <button
                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, 'approve')}
                                className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>✓</span>
                                <span>ยอมรับ & อนุมัติยอดใหม่</span>
                              </button>
                              <button
                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, 'reject')}
                                className="flex-1 py-2 px-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
                              >
                                <span>✕</span>
                                <span>ปฏิเสธคำขอนี้</span>
                              </button>
                            </div>
                          </div>
                        )}
                        
                        {/* Line-by-line detailed breakdown */}`;

const target3 = `                          {isPendingCorrection && (
                            <span className="text-[11px] text-amber-400 font-bold italic">
                              * ส่งคำขอแก้เป็น {bill.correction_new_reading || '-'} หน่วย แล้ว อยู่ระหว่างรอเจ้าของหอพักตรวจสอบ
                            </span>
                          )}`;

const replace3 = `                          {isPendingCorrection && bill.correction_requested_by === 'tenant' && (
                            <span className="text-[11px] text-amber-400 font-bold italic">
                              * ส่งคำขอแก้เป็น {bill.correction_new_reading || '-'} หน่วย แล้ว อยู่ระหว่างรอเจ้าของหอพักตรวจสอบ
                            </span>
                          )}`;

const target4 = `                       ) : isPendingCorrection ? (
                         <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1 text-amber-300">
                           <p className="font-black text-xs">ระงับการชำระชั่วคราว</p>
                           <p className="text-[10px] text-slate-400">เจ้าของหอพักกำลังตรวจสอบคำขอแก้ไขบิล</p>
                         </div>`;

const replace4 = `                       ) : isPendingCorrection ? (
                         <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-center space-y-1 text-amber-300">
                           <p className="font-black text-xs">
                             {bill.correction_requested_by === 'owner' ? 'รอยืนยันยอดที่เจ้าของหอส่งแก้' : 'ระงับการชำระชั่วคราว'}
                           </p>
                           <p className="text-[10px] text-slate-400">
                             {bill.correction_requested_by === 'owner' ? 'กรุณากดยอมรับหรือปฏิเสธคำขอด้านซ้าย' : 'เจ้าของหอพักกำลังตรวจสอบคำขอแก้ไขบิล'}
                           </p>
                         </div>`;

if (!content.includes(target1)) console.error('target1 not found');
if (!content.includes(target2)) console.error('target2 not found');
if (!content.includes(target3)) console.error('target3 not found');
if (!content.includes(target4)) console.error('target4 not found');

content = content.replace(target1, replace1);
content = content.replace(target2, replace2);
content = content.replace(target3, replace3);
content = content.replace(target4, replace4);

if (isCRLF) {
  content = content.replace(/\n/g, '\r\n');
}

fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
console.log('Done updating tenant billing page!');
