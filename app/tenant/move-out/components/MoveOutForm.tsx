'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface MoveOutFormProps {
  contractEndDate?: string | null;
}

export default function MoveOutForm({ contractEndDate }: MoveOutFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState('');

  // Check if requested date is early move-out (< contractEndDate)
  const isEarly = Boolean(
    contractEndDate &&
    selectedDate &&
    new Date(selectedDate).getTime() < new Date(contractEndDate).getTime() - (24 * 60 * 60 * 1000)
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const date = formData.get('date') as string;
    const phone = formData.get('phone') as string;
    const reason = formData.get('reason') as string;
    const promptpayTarget = formData.get('promptpayTarget') as string;
    const promptpayName = formData.get('promptpayName') as string;
    const bankName = formData.get('bankName') as string;

    if (!date) return alert('กรุณาระบุวันที่ต้องการย้ายออก');
    
    // Normal move-out requires promptpay target, early move-out does NOT
    if (!isEarly && !promptpayTarget) {
      return alert('กรุณาระบุเบอร์พร้อมเพย์หรือเลขบัตรประชาชนสำหรับรับเงินประกันคืน');
    }
    
    setLoading(true);
    try {
      const res = await fetch('/api/tenant/move-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          desiredDate: date, 
          phone,
          reason,
          promptpayTarget: isEarly ? (promptpayTarget || 'NONE') : promptpayTarget,
          promptpayName: isEarly ? (promptpayName || 'ผู้เช่า (ออกก่อนกำหนด)') : promptpayName,
          bankName: isEarly ? 'ไม่ต้องโอนคืน' : (bankName || 'พร้อมเพย์')
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert(
          isEarly 
            ? '🎉 ส่งเรื่องแจ้งย้ายออกเรียบร้อยแล้ว\n\n📌 เนื่องจากเป็นการย้ายออกก่อนครบสัญญา 1 ปี: ท่านไม่ต้องรับเงินประกันคืน โดยเจ้าของหอจะส่งบิลค่าใช้จ่ายรอบสุดท้ายไปที่เมนู "บิลของฉัน" เพื่อให้ท่านชำระก่อนย้ายออก' 
            : '🎉 ส่งเรื่องแจ้งย้ายออกเรียบร้อยแล้ว ระบบได้ส่งข้อมูลให้ผู้ดูแลหอพักตรวจสอบและเตรียมการคืนเงินประกัน'
        );
        router.refresh();
      } else {
        alert(data.message || 'เกิดข้อผิดพลาดในการส่งคำร้อง');
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
              เงื่อนไขการย้ายออกและเงินประกันหอพักเกษร 2
            </strong>
            <p className="text-xs text-white/80 leading-relaxed space-y-1">
              <span className="block">1. <strong>ย้ายออกตามกำหนด (ครบสัญญา 1 ปี):</strong> จะได้รับเงินประกันคืน โดยหักค่าน้ำ ค่าไฟ และบิลค้างชำระ แล้วโอนคืนผ่านพร้อมเพย์</span>
              <span className="block">2. <strong>ย้ายออกก่อนกำหนด (ไม่ครบสัญญา 1 ปี):</strong> <span className="text-amber-300 font-semibold underline">ลูกหอไม่ต้องส่งเลขบัญชี และเจ้าของหอไม่คืนเงินประกัน</span> โดยเจ้าของหอจะส่งบิลค่าใช้จ่ายรอบสุดท้าย (ค่าน้ำ-ไฟ-ค่าเช่า) ไปให้ลูกหอชำระที่เมนู <strong>"บิลของฉัน"</strong></span>
            </p>
          </div>
        </div>
      </div>

      {/* Contract Date Info if available */}
      {contractEndDate && (
        <div className="p-4 bg-secondary/30 rounded-2xl border border-border flex items-center justify-between text-xs">
          <span className="text-muted-foreground">วันสิ้นสุดสัญญาเช่าปัจจุบัน:</span>
          <span className="font-bold text-white font-mono">
            {new Date(contractEndDate).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
          </span>
        </div>
      )}

      {/* Date & Phone */}
      <div className="grid sm:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2 font-mono">
            วันที่ต้องการย้ายออก <span className="text-rose-500">*</span>
          </label>
          <input 
            type="date" 
            name="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
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

      {/* Case 1: Early Move-Out Notice (No Bank Account Needed) */}
      {isEarly ? (
        <div className="p-6 bg-rose-500/10 border border-rose-500/30 rounded-2xl space-y-3">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <h4 className="text-sm font-black text-rose-300">
                ตรวจพบ: ท่านเลือกย้ายออกก่อนครบกำหนดสัญญา 1 ปี
              </h4>
              <p className="text-xs text-rose-200/80 mt-0.5">
                (ตามเงื่อนไขสัญญา เงินประกันจะไม่ได้รับการคืน และท่าน<strong>ไม่ต้องระบุเลขบัญชี/พร้อมเพย์</strong>)
              </p>
            </div>
          </div>
          <div className="p-4 bg-slate-900/60 rounded-xl border border-rose-500/20 text-xs text-slate-300 space-y-1">
            <p className="font-semibold text-rose-400">📋 ขั้นตอนสำหรับกรณีออกก่อนกำหนด:</p>
            <ul className="list-disc pl-5 space-y-1 text-slate-300">
              <li>ไม่ต้องส่งเลขบัญชีรับเงินคืน</li>
              <li>เจ้าของหอจะเข้าตรวจเช็กห้อง จดมิเตอร์ค่าน้ำ-ไฟ และออก <strong>"บิลค่าใช้จ่ายรอบสุดท้าย"</strong></li>
              <li>บิลค่าใช้จ่ายจะส่งไปยังเมนู <strong>"บิลของฉัน"</strong> เพื่อให้ท่านตรวจสอบและสแกนชำระเงิน</li>
            </ul>
          </div>
        </div>
      ) : (
        /* Case 2: Normal Move-Out (PromptPay Refund Account Required) */
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
                required={!isEarly}
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
                required={!isEarly}
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
      )}

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
          {loading ? 'กำลังส่งข้อมูล...' : isEarly ? '✓ ยืนยันการแจ้งย้ายออกก่อนกำหนด' : '✓ ยืนยันการส่งเรื่องแจ้งย้ายออก & ขอคืนเงินประกัน'}
        </button>
      </div>
    </form>
  );
}
