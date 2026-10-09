const fs = require('fs');
let content = fs.readFileSync('app/tenant/billing/page.tsx', 'utf8');

// Replace handleOpenQR to pass amount = totalToPay
content = content.replace(
  "const res = await fetch(`/api/tenant/billing/qr?billId=${bill.id}${email ? `&email=${encodeURIComponent(email)}` : ''}`);",
  "const totalAmt = bill.total_amount ?? (Number(bill.amount) + (bill.late_fee || 0));\n      const res = await fetch(`/api/tenant/billing/qr?billId=${bill.id}&amount=${totalAmt}${email ? `&email=${encodeURIComponent(email)}` : ''}`);"
);

// Replace QR Modal amount display
content = content.replace(
  `<div className="text-center space-y-0.5 mb-4">
               <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ยอดที่ต้องชำระ</p>
               <p className="text-2xl font-black text-emerald-400">฿{Number(selectedBill.amount).toLocaleString()}</p>
             </div>`,
  `<div className="text-center space-y-0.5 mb-4">
               <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest">ยอดที่ต้องชำระ (รวมค่าปรับถ้ามี)</p>
               <p className="text-2xl font-black text-emerald-400">฿{Number(qrData?.amount ?? selectedBill.total_amount ?? selectedBill.amount).toLocaleString()}</p>
             </div>`
);

// Replace PromptPayBankSelector amount prop
content = content.replace(
  "amount={Number(selectedBill.amount)}",
  "amount={Number(qrData?.amount ?? selectedBill.total_amount ?? selectedBill.amount)}"
);

fs.writeFileSync('app/tenant/billing/page.tsx', content, 'utf8');
console.log('Successfully updated tenant billing QR amount handling');
