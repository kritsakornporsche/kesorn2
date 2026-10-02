const fs = require('fs');

let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

// 1. Add late fee badge right after SlipOK badge
content = content.replace(
  /(\{bill\.slip_verified === 1 && \([^)]+\)\s*\}\s*<\/div>)/,
  `$1\n                      {Number(bill.days_overdue || 0) > 0 && bill.status === 'Unpaid' && (
                        <div className="mt-2 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                          ⚠️ เลยกำหนดชำระ {bill.days_overdue} วัน (คิดค่าปรับวันละ 100 บาท)
                        </div>
                      )}`
);

// 2. Replace the Amount Due box with the detailed breakdown
content = content.replace(
  /<p className="text-4xl font-black text-foreground">฿\{Number\(bill\.amount\)\.toLocaleString\(\)\}<\/p>/,
  `{Number(bill.days_overdue || 0) > 0 && bill.status === 'Unpaid' ? (
                          <div className="space-y-1.5 pt-1">
                            <div className="flex justify-between text-xs text-muted-foreground">
                              <span>ค่าบิลหลัก:</span>
                              <span className="font-bold text-white">฿{Number(bill.base_amount || bill.amount).toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between text-xs text-rose-400 font-bold">
                              <span>ค่าปรับชำระล่าช้า ({bill.days_overdue} วัน × ฿100):</span>
                              <span>+฿{Number(bill.late_fee || 0).toLocaleString()}</span>
                            </div>
                            <div className="pt-2 border-t border-white/10 flex justify-between items-baseline">
                              <span className="text-xs font-black text-white uppercase tracking-wider">ยอดรวมที่ต้องชำระ:</span>
                              <span className="text-3xl font-black text-rose-400">฿{Number(bill.total_amount || bill.amount).toLocaleString()}</span>
                            </div>
                          </div>
                        ) : (
                          <p className="text-4xl font-black text-foreground">฿{Number(bill.amount).toLocaleString()}</p>
                        )}`
);

fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
console.log('Successfully patched app/tenant/billing/page.tsx with regex!');
