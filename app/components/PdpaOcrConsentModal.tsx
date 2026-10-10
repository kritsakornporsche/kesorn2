'use client';

import React, { useState } from 'react';

interface PdpaOcrConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConsent: () => void;
  title?: string;
  actionText?: string;
}

export const PdpaOcrConsentModal: React.FC<PdpaOcrConsentModalProps> = ({
  isOpen,
  onClose,
  onConsent,
  title = 'หนังสือยินยอมการเก็บรวบรวมและประมวลผลข้อมูลส่วนบุคคล (PDPA)',
  actionText = 'ยินยอมและส่งภาพประมวลผล OCR',
}) => {
  const [agreed, setAgreed] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-[100] flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] text-slate-100">
        
        {/* Header */}
        <div className="px-6 py-5 bg-gradient-to-r from-blue-950/60 via-slate-900 to-indigo-950/60 border-b border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-xl">
              🛡️
            </div>
            <div>
              <span className="text-[10px] font-black uppercase tracking-wider text-blue-400 block">
                PDPA & AI Vision Security Consent
              </span>
              <h3 className="text-base font-bold text-white leading-tight">
                {title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Scrollable Consent Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed custom-scrollbar">
          <div className="p-3.5 bg-blue-500/10 border border-blue-500/20 rounded-2xl flex items-start gap-2.5 text-blue-200 text-[11px]">
            <span className="text-base leading-none">💡</span>
            <p>
              เพื่อความสะดวกรวดเร็วและลดความผิดพลาดในการพิมพ์สัญญาเช่า ระบบจะใช้ระบบ <strong>Google Gemini Vision AI</strong> ในการอ่านข้อความจากภาพถ่ายบัตรประชาชนของท่านโดยอัตโนมัติ
            </p>
          </div>

          <div className="space-y-3 bg-slate-950/60 p-4 rounded-2xl border border-slate-800">
            <h4 className="font-bold text-white text-xs flex items-center gap-1.5">
              <span>📋</span> วัตถุประสงค์และมาตรฐานความปลอดภัยข้อมูลส่วนบุคคล (PDPA & AI Data Privacy):
            </h4>
            <ul className="space-y-2 list-disc list-inside text-[11px] text-slate-300">
              <li>
                <strong className="text-slate-100">ข้อมูลที่นำไปประมวลผล (Data Minimization):</strong> สกัดเฉพาะ <strong>ชื่อ-นามสกุล</strong> และ <strong>ที่อยู่ตามทะเบียนบ้าน</strong> เพื่อช่วยกรอกสัญญาเช่าอัตโนมัติ (<strong>ไม่ดึงและไม่บันทึกเลขประจำตัวประชาชน 13 หลัก หรือไฟล์ภาพบัตรลงในฐานข้อมูล</strong>)
              </li>
              <li>
                <strong className="text-slate-100">Google Gemini นำข้อมูลไปทำอะไรบ้าง:</strong>
                <div className="pl-4 pt-1 space-y-1 text-[11px] text-slate-300">
                  <p>• <strong>สกัดชื่อและที่อยู่ชั่วคราว (Stateless OCR):</strong> นำภาพมาแปลงเป็นชื่อ-นามสกุลและที่อยู่เพื่อส่งกลับมากรอกลงในแบบฟอร์มสัญญาเช่าทันที จากนั้นลบทิ้งจากหน่วยความจำ</p>
                  <p>• <strong>ไม่นำข้อมูลไปเทรนโมเดล AI (No AI Training):</strong> ภายใต้ข้อกำหนดการใช้งาน Google Cloud / Gemini Enterprise API ข้อมูลภาพและข้อความที่ส่งผ่าน API จะ<strong>ไม่ถูกนำไปใช้ฝึกฝน (Train/Fine-tune) โมเดล AI สาธารณะของ Google</strong></p>
                  <p>• <strong>ไม่เผยแพร่หรือส่งต่อบุคคลภายนอก:</strong> ข้อมูลจะถูกประมวลผลแบบชั่วคราวในหน่วยความจำของ API และไม่ถูกส่งต่อไปยังบุคคลภายนอก</p>
                </div>
              </li>
              <li>
                <strong className="text-slate-100">มาตรฐานการส่งข้อมูล (Security in Transit):</strong> ภาพจะถูกส่งผ่านช่องทางเข้ารหัสความปลอดภัยระดับสูง (HTTPS / TLS 1.3) ไปยังศูนย์ข้อมูลของ Google โดยตรง
              </li>
              <li>
                <strong className="text-slate-100">สิทธิ์ของเจ้าของข้อมูลส่วนบุคคล:</strong> ท่านมีสิทธิ์ในการตรวจสอบ แก้ไข หรือขอลบข้อมูลเอกสารสัญญาได้ตามที่กฎหมาย PDPA กำหนด
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-slate-800/80 border border-slate-700/60 cursor-pointer transition-colors select-none">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-900 cursor-pointer"
              />
              <span className="text-xs font-semibold text-slate-200">
                ข้าพเจ้ายินยอมให้ส่งภาพถ่ายบัตรประชาชนเพื่อประมวลผลด้วย Google Gemini AI และยอมรับนโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA)
              </span>
            </label>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 sm:p-6 bg-slate-950 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-slate-700 text-slate-300 hover:bg-slate-800 text-xs font-bold transition-all cursor-pointer"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={!agreed}
            onClick={() => {
              if (agreed) {
                onConsent();
              }
            }}
            className={`px-5 py-2.5 rounded-xl text-xs font-black transition-all shadow-lg flex items-center gap-1.5 cursor-pointer ${
              agreed
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-500/25 active:scale-95'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700'
            }`}
          >
            <span>✓</span>
            <span>{actionText}</span>
          </button>
        </div>

      </div>
    </div>
  );
};
