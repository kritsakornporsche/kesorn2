'use client';

import React, { useRef, useState } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface PrintableContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: {
    id: number | string;
    room_number: string;
    room_type?: string;
    tenant_name: string;
    tenant_phone?: string;
    tenant_email?: string;
    id_card_number?: string;
    tenant_address?: string;
    id_card_image?: string;
    start_date: string;
    end_date: string;
    deposit_amount: number;
    monthly_rent?: number;
    created_at?: string;
  } | null;
}

export default function PrintableContractModal({ isOpen, onClose, contract }: PrintableContractModalProps) {
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  if (!isOpen || !contract) return null;

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = async () => {
    if (!printRef.current) return;
    setDownloading(true);
    try {
      const element = printRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = imgProps.width / imgProps.height;
      const displayHeight = pdfWidth / ratio;

      pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, Math.min(displayHeight, pdfHeight));
      pdf.save(`สัญญาเช่า_หอพักเกษร2_ห้อง${contract.room_number}_${contract.tenant_name}.pdf`);
    } catch (err) {
      console.error('Download PDF error:', err);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-start p-4 sm:p-6 print:p-0 print:bg-white print:static">
      {/* Container */}
      <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl my-8 print:my-0 print:border-none print:shadow-none print:w-full print:max-w-none">
        
        {/* Modal Action Bar (Hidden when printing) */}
        <div className="bg-slate-800/90 border-b border-white/10 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <h2 className="text-base font-bold text-white">เอกสารสัญญาเช่าห้องพักฉบับสมบูรณ์ (พร้อมพิมพ์)</h2>
              <p className="text-xs text-white/60">ข้อมูลดึงจากการอ่านบัตรประชาชนอัตโนมัติ • ห้อง {contract.room_number}</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              🖨️ สั่งพิมพ์ (Print A4)
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {downloading ? 'กำลังสร้างไฟล์...' : '📥 ดาวน์โหลด PDF'}
            </button>

            <button
              onClick={onClose}
              className="p-2.5 text-white/60 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              title="ปิด"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Printable Paper Preview (Target element for print and PDF generation) */}
        <div className="p-4 sm:p-8 bg-slate-950 flex justify-center overflow-x-auto print:p-0 print:bg-white">
          <div
            ref={printRef}
            id="printable-contract-sheet"
            className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-[18mm] sm:p-[20mm] font-serif shadow-xl rounded-sm print:shadow-none print:rounded-none print:p-[15mm] text-[13px] leading-relaxed relative flex flex-col justify-between"
            style={{ fontFamily: "'Sarabun', 'TH Sarabun New', 'Angsana New', sans-serif" }}
          >
            {/* Watermark / Header Seal */}
            <div className="space-y-4">
              <div className="text-center pb-4 border-b-2 border-slate-900/80">
                <div className="flex justify-center items-center gap-3 mb-1">
                  <div className="w-10 h-10 rounded-full border-2 border-slate-800 flex items-center justify-center font-bold text-slate-800 text-lg">
                    ก
                  </div>
                  <h1 className="text-2xl font-black tracking-tight text-slate-900">
                    หนังสือสัญญาเช่าห้องพัก
                  </h1>
                </div>
                <h2 className="text-base font-bold text-slate-800">
                  หอพักเกษร 2 (Kesorn 2 Dormitory)
                </h2>
                <p className="text-[11px] text-slate-600 font-sans">
                  เลขที่ 99/1 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900 • โทรศัพท์ 082-985-3519
                </p>
              </div>

              {/* Date & Location */}
              <div className="flex justify-between items-center text-xs font-semibold pt-1">
                <span>สัญญาเลขที่: <strong className="font-mono">K2-{String(contract.id).padStart(4, '0')}</strong></span>
                <span>ทำขึ้น ณ หอพักเกษร 2 เมื่อวันที่ <strong>{formatDate(contract.created_at)}</strong></span>
              </div>

              {/* Parties */}
              <div className="text-justify space-y-2.5 pt-2">
                <p className="indent-8">
                  สัญญาฉบับนี้ทำขึ้นระหว่าง <strong>หอพักเกษร 2</strong> โดยผู้มีอำนาจลงนามและผู้บริหารจัดการอาคาร ซึ่งต่อไปในสัญญานี้จะเรียกว่า <strong>“ผู้ให้เช่า”</strong> ฝ่ายหนึ่ง กับ
                </p>
                
                <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-lg space-y-1 font-sans text-xs">
                  <p>
                    <strong>ผู้เช่า:</strong> คุณ <span className="font-bold text-slate-900">{contract.tenant_name}</span>
                  </p>
                  <p>
                    <strong>เลขประจำตัวประชาชน (13 หลัก):</strong> <span className="font-mono font-bold tracking-wider">{contract.id_card_number || '1-1002-01384-95-2'}</span>
                  </p>
                  <p>
                    <strong>ที่อยู่ตามบัตรประชาชน:</strong> {contract.tenant_address || '99/50 หมู่ 3 ซอยงามวงศ์วาน 54 แขวงลาดยาว เขตจตุจักร กรุงเทพมหานคร 10900'}
                  </p>
                  <p>
                    <strong>เบอร์โทรศัพท์ติดต่อ:</strong> <span className="font-mono">{contract.tenant_phone || '082-985-3519'}</span>
                    <span className="ml-6"><strong>อีเมล:</strong> <span className="font-mono">{contract.tenant_email || '-'}</span></span>
                  </p>
                </div>

                <p className="indent-8">
                  ซึ่งต่อไปในสัญญานี้จะเรียกว่า <strong>“ผู้เช่า”</strong> อีกฝ่ายหนึ่ง ทั้งสองฝ่ายได้ตกลงทำสัญญาเช่าห้องพักโดยมีข้อความและเงื่อนไขดังต่อไปนี้:
                </p>

                {/* Terms and Conditions */}
                <div className="space-y-2 text-xs">
                  <p>
                    <strong>ข้อ 1. ทรัพย์สินที่เช่า:</strong> ผู้ให้เช่าตกลงให้เช่า และผู้เช่าตกลงเช่าห้องพัก <strong>ห้องเลขที่ {contract.room_number}</strong> {contract.room_type ? `(${contract.room_type})` : ''} ภายในอาคารหอพักเกษร 2 เพื่อใช้เป็นที่อยู่อาศัยตามปกติเท่านั้น ห้ามนำไปใช้ประกอบการค้าหรือการอันผิดกฎหมายทุกชนิด
                  </p>

                  <p>
                    <strong>ข้อ 2. กำหนดระยะเวลาการเช่า:</strong> ทั้งสองฝ่ายตกลงกำหนดระยะเวลาการเช่าเป็นเวลา <strong>1 ปี</strong> โดยเริ่มต้นตั้งแต่วันที่ <strong>{formatDate(contract.start_date)}</strong> ถึงวันที่ <strong>{formatDate(contract.end_date)}</strong>
                  </p>

                  <p>
                    <strong>ข้อ 3. อัตราค่าเช่าและการชำระเงิน:</strong> ผู้เช่าตกลงชำระค่าเช่าในอัตราเดือนละ <strong>{Number(contract.monthly_rent || 3800).toLocaleString()} บาท</strong> โดยต้องชำระล่วงหน้าภายในวันที่ 5 ของทุกเดือน ผ่านระบบบัญชีธนาคารหรือพร้อมเพย์ของหอพัก
                  </p>

                  <p>
                    <strong>ข้อ 4. เงินประกันความเสียหาย (เงินมัดจำ):</strong> ในวันทำสัญญานี้ ผู้เช่าได้วางเงินประกันสัญญาเป็นจำนวน <strong>{Number(contract.deposit_amount).toLocaleString()} บาท</strong> ไว้แก่ผู้ให้เช่าแล้ว เพื่อเป็นหลักประกันการชำระหนี้และการปฏิบัติตามสัญญา
                  </p>

                  <p>
                    <strong>ข้อ 5. ค่าน้ำประปาและค่าไฟฟ้า:</strong> ผู้เช่าตกลงชำระค่าสาธารณูปโภคตามมิเตอร์วัดจริงในแต่ละเดือน โดยคิดอัตราค่าน้ำและค่าไฟฟ้าตามระเบียบของหอพัก
                  </p>

                  <p>
                    <strong>ข้อ 6. การแจ้งย้ายออกและการคืนเงินประกัน:</strong> เมื่อครบกำหนดสัญญาเช่า 1 ปี หากผู้เช่าประสงค์จะย้ายออก จะต้องแจ้งให้ผู้ให้เช่าทราบล่วงหน้าผ่านระบบไม่น้อยกว่า <strong>30 วัน</strong> ผู้ให้เช่าจะทำการตรวจสอบห้องพักและหักลบค่าใช้จ่ายค้างชำระ (ถ้ามี) แล้วคืนเงินประกันสุทธิผ่านระบบพร้อมเพย์ของผู้เช่าตามยอดที่คำนวณได้โดยถูกต้อง หากผู้เช่าย้ายออกก่อนครบกำหนดสัญญา ผู้ให้เช่ามีสิทธิริบเงินประกันตามระเบียบ
                  </p>

                  <p>
                    <strong>ข้อ 7. การดูแลรักษาห้องพัก:</strong> ผู้เช่ามีหน้าที่ดูแลรักษาห้องพักและทรัพย์สินให้อยู่ในสภาพเรียบร้อย ห้ามดัดแปลง ต่อเติม หรือตอกตะปูผนังโดยไม่ได้รับความยินยอม
                  </p>
                </div>

                <p className="indent-8 text-xs pt-1">
                  สัญญานี้ทำขึ้นเป็นสองฉบับมีข้อความถูกต้องตรงกัน ทั้งสองฝ่ายได้อ่านและเข้าใจข้อความโดยละเอียดแล้ว จึงได้ลงลายมือชื่อไว้เป็นหลักฐานต่อหน้าพยาน
                </p>
              </div>
            </div>

            {/* Signature Area */}
            <div className="pt-8 border-t border-slate-300 mt-6">
              <div className="grid grid-cols-2 gap-8 text-center text-xs">
                {/* Lessor */}
                <div className="space-y-3">
                  <p className="font-semibold text-slate-700">ลงชื่อ .............................................................. ผู้ให้เช่า</p>
                  <p className="font-bold text-slate-900">( เจ้าของหอพักเกษร 2 / ตัวแทนผู้มีอำนาจ )</p>
                  <p className="text-[10px] text-slate-500 font-mono">วันที่ .......... / .......... / ................</p>
                </div>

                {/* Tenant */}
                <div className="space-y-3">
                  <p className="font-semibold text-slate-700">ลงชื่อ .............................................................. ผู้เช่า</p>
                  <p className="font-bold text-slate-900">( คุณ{contract.tenant_name} )</p>
                  <p className="text-[10px] text-slate-500 font-mono">วันที่ .......... / .......... / ................</p>
                </div>
              </div>

              {/* ID Card Attachment preview at bottom corner if available */}
              {contract.id_card_image && (
                <div className="mt-4 pt-3 border-t border-dashed border-slate-200 flex items-center justify-between text-[10px] text-slate-500 font-sans">
                  <div className="flex items-center gap-2">
                    <span>🪪 ข้อมูลยืนยันตัวตน: เลขบัตรประชาชน {contract.id_card_number} (ตรวจสอบผ่านระบบ Smart ID OCR)</span>
                  </div>
                  <span className="font-mono text-[9px]">ระบบบริหารจัดการหอพักเกษร 2 SmartDom</span>
                </div>
              )}
            </div>

          </div>
        </div>

      </div>
    </div>
  );
}
