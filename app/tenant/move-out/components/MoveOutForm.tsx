'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function MoveOutForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date');
    const reason = formData.get('reason');
    const promptpayTarget = formData.get('promptpayTarget');
    const promptpayName = formData.get('promptpayName');
    const bankName = formData.get('bankName');

    if (!date) return alert('กรุณาระบุวันที่ต้องการย้ายออก');
    if (!promptpayTarget) return alert('กรุณาระบุเบอร์พร้อมเพย์หรือเลขบัตรประชาชนสำหรับรับเงินประกันคืน');
    
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          desiredDate: date, 
          reason,
          promptpayTarget,
          promptpayName,
          bankName
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('🎉 ส่งเรื่องแจ้งย้ายออกเรียบร้อยแล้ว ระบบได้ส่งข้อมูลให้ผู้ดูแลหอพักตรวจสอบและเตรียมการคืนเงินประกัน');
        router.refresh();
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('เกิดข้อผิดพลาดในการส่งคำร้อง');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-card rounded-3xl border border-border p-8 md:p-12 shadow-sm space-y-8">
      {/* Policy Notice */}
      <div>
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-6 text-sm text-amber-200 flex gap-4">
          <div className="shrink-0 bg-amber-500/20 h-10 w-10 rounded-full flex items-center justify-center text-amber-400 text-lg">
            📜
          </div>
          <div className="space-y-1">
            <strong className="block text-base font-bold text-amber-300">
              เงื่อนไขการคืนเงินประกันหอพักเกษร 2
            </strong>
            <p className="text-xs text-white/80 leading-relaxed">
              1. <strong>ตรวจสอบครบสัญญา:</strong> สัญญาเช่ามีกำหนด 1 ปี หากอยู่ครบกำหนดสัญญา จะได้รับเงินประกันคืนเต็มจำนวน (หักเฉพาะบิลค้างชำระ)<br />
              2. <strong>ตรวจสอบบิลค้างชำระ:</strong> ระบบจะคำนวณหักค่าน้ำ ค่าไฟ และค่าบิลคงค้างทั้งหมดโดยอัตโนมัติ<br />
              3. <strong>การโอนคืนเงินประกัน:</strong> เจ้าของหอพักจะสแกนโอนเงินประกันคืนผ่าน <strong>QR Code พร้อมเพย์</strong> ที่ระบุยอดเงินสุทธิเป๊ะตามยอดที่คำนวณ
            </p>
          </div>
        </div>
      </div>

      {/* Date & Phone */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
            วันที่ต้องการย้ายออก <span className="text-rose-500">*</span>
          </label>
          <input 
            type="date" 
            name="date"
            required
            className="w-full px-5 py-3.5 bg-secondary/50 rounded-2xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground font-bold"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
            เบอร์โทรศัพท์ติดต่อกลับ <span className="text-rose-500">*</span>
          </label>
          <input 
            type="tel" 
            name="phone"
            required
            className="w-full px-5 py-3.5 bg-secondary/50 rounded-2xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground font-bold"
            placeholder="08X-XXX-XXXX"
          />
        </div>
      </div>

      {/* PromptPay Refund Account */}
      <div className="p-6 bg-secondary/30 rounded-2xl border border-border space-y-4">
        <div className="flex items-center gap-2">
          <span className="text-lg">💳</span>
          <div>
            <h4 className="text-sm font-bold text-foreground">
              ข้อมูลบัญชีพร้อมเพย์สำหรับรับเงินประกันคืน (PromptPay)
            </h4>
            <p className="text-[11px] text-muted-foreground">
              ระบุเบอร์โทรหรือเลขบัตรประชาชนที่ผูกพร้อมเพย์ เจ้าของหอจะสแกนโอนคืนผ่านระบบ QR Code ล็อคยอดเงิน
            </p>
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
              เบอร์พร้อมเพย์ หรือ เลขบัตรประชาชน <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              name="promptpayTarget"
              required
              className="w-full px-4 py-3 bg-card rounded-xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground font-mono font-bold"
              placeholder="เช่น 0891234567 หรือ 1100201384952"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
              ชื่อ-นามสกุล เจ้าของบัญชี <span className="text-rose-500">*</span>
            </label>
            <input 
              type="text" 
              name="promptpayName"
              required
              className="w-full px-4 py-3 bg-card rounded-xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground font-bold"
              placeholder="เช่น นายสมชาย ใจดี"
            />
          </div>
        </div>

        <div>
          <label className="block text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1 font-mono">
            ธนาคาร / แอปพลิเคชัน
          </label>
          <input 
            type="text" 
            name="bankName"
            className="w-full px-4 py-3 bg-card rounded-xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground text-xs"
            placeholder="เช่น พร้อมเพย์ (ธนาคารกสิกรไทย, ไทยพาณิชย์, กรุงไทย ฯลฯ)"
            defaultValue="พร้อมเพย์"
          />
        </div>
      </div>

      {/* Reason */}
      <div>
        <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
          เหตุผลที่ต้องการย้ายออก
        </label>
        <textarea 
          name="reason"
          rows={3}
          className="w-full px-5 py-3.5 bg-secondary/50 rounded-2xl border border-border focus:ring-2 focus:ring-primary focus:border-primary outline-none transition-all text-foreground font-medium resize-none leading-relaxed"
          placeholder="ระบุเหตุผล เช่น สำเร็จการศึกษา, ย้ายสถานที่ทำงาน, ย้ายที่พัก..."
        ></textarea>
      </div>

      {/* Submit Button */}
      <div className="pt-4 border-t border-border flex gap-4">
        <button 
          disabled={loading} 
          type="submit" 
          className="flex-1 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 px-8 rounded-2xl transition-all shadow-xl shadow-primary/20 active:scale-[0.98] text-base disabled:opacity-70 flex items-center justify-center gap-2 cursor-pointer"
        >
          {loading ? 'กำลังส่งข้อมูล...' : '✓ ยืนยันการส่งเรื่องแจ้งย้ายออก & คำนวณเงินประกัน'}
        </button>
      </div>
    </form>
  );
}
