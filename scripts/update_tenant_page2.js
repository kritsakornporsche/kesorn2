const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

const lines = content.split(/\r?\n/);

// Replacement 1: header
const headerStart = 262; // 0-indexed: line 263
const headerEnd = 283;   // line 284
const newHeaderLines = [
  '                        <div className="flex flex-wrap justify-between items-start gap-3 mb-6">',
  '                          <div>',
  '                            <div className="flex items-center gap-2 mb-1">',
  '                              <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest block">{bill.billing_cycle || \'รอบบิล\'}</span>',
  '                              <span className="px-2.5 py-0.5 rounded-md bg-primary/15 text-primary text-[10px] font-black font-mono border border-primary/20">',
  '                                บิล #{bill.id}',
  '                              </span>',
  '                            </div>',
  '                            <h3 className="text-xl sm:text-2xl font-black text-foreground group-hover:text-primary transition-colors">{bill.title}</h3>',
  '                          </div>',
  '                          <div className="flex flex-wrap items-center gap-2">',
  '                            {isPendingCorrection ? (',
  '                              <span className="px-3.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1.5">',
  '                                <span>⏳</span>',
  '                                <span>{bill.correction_requested_by === \'owner\' ? \'รอลูกหอยืนยันยอดแก้\' : \'ระงับชำระ (รอเจ้าของหอตรวจสอบ)\'}</span>',
  '                              </span>',
  '                            ) : (',
  '                              <span className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-full border ${',
  '                                 bill.status === \'Unpaid\' || bill.status === \'Overdue\' ? \'bg-amber-500/10 text-amber-400 border-amber-500/30\' :',
  '                                 bill.status === \'Pending\' ? \'bg-blue-500/10 text-blue-400 border-blue-500/30\' :',
  '                                 \'bg-emerald-500/10 text-emerald-400 border-emerald-500/30\'',
  '                               }`}>',
  '                                {bill.status === \'Unpaid\' ? \'รอชำระเงิน\' : bill.status === \'Overdue\' ? \'เกินกำหนดชำระ\' : bill.status === \'Pending\' ? \'กำลังตรวจสอบ\' : \'ชำระเรียบร้อย\'}',
  '                              </span>',
  '                            )}',
  '                          </div>',
  '                        </div>',
  '',
  '                        {/* Owner Bill Correction Notice & Action Banner */}',
  '                        {isPendingCorrection && bill.correction_requested_by === \'owner\' && (',
  '                          <div className="mb-6 p-4 sm:p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">',
  '                            <div className="flex items-start gap-3">',
  '                              <span className="text-xl">⚠️</span>',
  '                              <div className="flex-1 text-xs sm:text-sm">',
  '                                <p className="font-black text-amber-300">',
  '                                  เจ้าของหอพักได้ส่งคำขอปรับปรุงยอดบิลใหม่',
  '                                </p>',
  '                                <p className="text-muted-foreground mt-1 text-xs">',
  '                                  {bill.correction_new_reading && (',
  '                                    <span className="mr-2">เลขมิเตอร์ใหม่: <strong className="text-foreground">{bill.correction_new_reading} หน่วย</strong></span>',
  '                                  )}',
  '                                  {bill.correction_new_total && (',
  '                                    <span>ยอดรวมใหม่: <strong className="text-emerald-400">฿{Number(bill.correction_new_total).toLocaleString()}</strong></span>',
  '                                  )}',
  '                                </p>',
  '                                {bill.correction_reason && (',
  '                                  <p className="text-muted-foreground mt-0.5 text-xs">',
  '                                    เหตุผล: <span className="italic text-foreground/80 font-medium">"{bill.correction_reason}"</span>',
  '                                  </p>',
  '                                )}',
  '                              </div>',
  '                            </div>',
  '                            <div className="flex items-center gap-2 pt-2 border-t border-amber-500/20">',
  '                              <button',
  '                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, \'approve\')}',
  '                                className="flex-1 py-2 px-3 bg-emerald-500 hover:bg-emerald-600 text-white font-black text-xs rounded-xl shadow transition-all cursor-pointer flex items-center justify-center gap-1.5"',
  '                              >',
  '                                <span>✓</span>',
  '                                <span>ยอมรับ & อนุมัติยอดใหม่</span>',
  '                              </button>',
  '                              <button',
  '                                onClick={() => bill.correction_id && handleResolveOwnerDispute(bill.correction_id, \'reject\')}',
  '                                className="flex-1 py-2 px-3 bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"',
  '                              >',
  '                                <span>✕</span>',
  '                                <span>ปฏิเสธคำขอนี้</span>',
  '                              </button',
  '                            </div>',
  '                          </div>',
  '                        )}'
];

lines.splice(headerStart, headerEnd - headerStart, ...newHeaderLines);

let updated = lines.join('\n');

// Replace footer notices
updated = updated.replace(
  `{isPendingCorrection && (
                            <span className="text-[11px] text-amber-400 font-bold italic">
                              * ส่งคำขอแก้เป็น {bill.correction_new_reading || '-'} หน่วย แล้ว อยู่ระหว่างรอเจ้าของหอพักตรวจสอบ
                            </span>
                          )}`,
  `{isPendingCorrection && bill.correction_requested_by === 'tenant' && (
                            <span className="text-[11px] text-amber-400 font-bold italic">
                              * ส่งคำขอแก้เป็น {bill.correction_new_reading || '-'} หน่วย แล้ว อยู่ระหว่างรอเจ้าของหอพักตรวจสอบ
                            </span>
                          )}`
);

updated = updated.replace(
  `<p className="font-black text-xs">ระงับการชำระชั่วคราว</p>
                           <p className="text-[10px] text-slate-400">เจ้าของหอพักกำลังตรวจสอบคำขอแก้ไขบิล</p>`,
  `<p className="font-black text-xs">
                             {bill.correction_requested_by === 'owner' ? 'รอยืนยันยอดที่เจ้าของหอส่งแก้' : 'ระงับการชำระชั่วคราว'}
                           </p>
                           <p className="text-[10px] text-slate-400">
                             {bill.correction_requested_by === 'owner' ? 'กรุณากดยอมรับหรือปฏิเสธคำขอด้านซ้าย' : 'เจ้าของหอพักกำลังตรวจสอบคำขอแก้ไขบิล'}
                           </p>`
);

fs.writeFileSync('app/tenant/billing/page.tsx', updated, 'utf8');
console.log('Successfully written updated tenant page');
