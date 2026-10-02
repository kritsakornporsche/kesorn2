'use client';

import React, { useRef, useState } from 'react';
import { parseThaiAddress } from '@/lib/address-parser';

interface PrintableContractModalProps {
  isOpen: boolean;
  onClose: () => void;
  contract: {
    id: number | string;
    room_number: string;
    room_type?: string;
    tenant_name: string;
    tenant_phone?: string;
    parent_phone?: string;
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
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);

  const [downloading, setDownloading] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);
  const [activeTab, setActiveTab] = useState<'all' | '1' | '2' | '3'>('all');

  if (!isOpen || !contract) return null;

  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  const createdDate = contract.created_at ? new Date(contract.created_at) : new Date();
  const dayStr = createdDate.getDate().toString();
  const monthStr = thaiMonths[createdDate.getMonth()];
  const yearStr = (createdDate.getFullYear() + 543).toString();

  const startMonthStr = contract.start_date
    ? `${thaiMonths[new Date(contract.start_date).getMonth()]} ${new Date(contract.start_date).getFullYear() + 543}`
    : '....................................................';

  const depositStr = Number(contract.deposit_amount || 0) > 0 ? Number(contract.deposit_amount).toLocaleString() : '';
  const rentStr = Number(contract.monthly_rent || 0) > 0 ? Number(contract.monthly_rent).toLocaleString() : '';
  const floorStr = (contract as any).floor || (contract.room_number?.length >= 2 ? contract.room_number[0] : '1');

  const parsedAddress = parseThaiAddress(contract.tenant_address || '');
  const houseNoStr = (contract as any).houseNo || parsedAddress.houseNo || contract.tenant_address || '';
  const villageStr = (contract as any).village || parsedAddress.village || '-';
  const roadStr = (contract as any).road || parsedAddress.road || '-';
  const subdistrictStr = (contract as any).subdistrict || parsedAddress.subdistrict || 'แม่กา';
  const districtStr = (contract as any).district || parsedAddress.district || 'เมืองพะเยา';
  const provinceStr = (contract as any).province || parsedAddress.province || 'พะเยา';

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadDocx = async () => {
    if (!contract) return;
    setDownloadingDocx(true);
    try {
      const res = await fetch('/api/contracts/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract }),
      });
      if (!res.ok) throw new Error('Export DOCX failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `สัญญาเช่า_หอพักเกษร_ห้อง${contract.room_number}_${(contract.tenant_name || '').replace(/\s+/g, '_')}.docx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error(e);
      alert('เกิดข้อผิดพลาดในการดาวน์โหลดไฟล์ Word');
    } finally {
      setDownloadingDocx(false);
    }
  };

  const handleDownloadPDF = async () => {
    setDownloading(true);
    const prevTab = activeTab;
    try {
      if (activeTab !== 'all') {
        setActiveTab('all');
        await new Promise((r) => setTimeout(r, 150));
      }

      const pages = [page1Ref.current, page2Ref.current, page3Ref.current].filter(Boolean) as HTMLElement[];
      if (pages.length === 0) {
        alert('ไม่พบเนื้อหาสัญญาสำหรับสร้างไฟล์ PDF');
        return;
      }

      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas-pro')).default;

      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true,
      });

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i], {
          scale: 2,
          useCORS: true,
          logging: false,
          backgroundColor: '#ffffff',
        });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        if (i > 0) {
          pdf.addPage();
        }
        pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
      }

      const tenantClean = (contract.tenant_name || 'ผู้เช่า').replace(/\s+/g, '_');
      pdf.save(`สัญญาเช่า_หอพักเกษร_ห้อง${contract.room_number || 'ห้องพัก'}_${tenantClean}.pdf`);
    } catch (err: any) {
      console.error('Download PDF error:', err);
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' + (err?.message || ''));
    } finally {
      if (prevTab !== 'all') {
        setActiveTab(prevTab);
      }
      setDownloading(false);
    }
  };

  const Blank = ({ value, dots = 20, minW = '' }: { value?: string | number; dots?: number; minW?: string }) => {
    const valStr = value !== undefined && value !== null && String(value).trim() !== '' ? String(value).trim() : '';
    if (!valStr) {
      return <span className="font-mono text-slate-400 select-none">{".".repeat(dots)}</span>;
    }
    return (
      <span className={`font-bold text-slate-900 border-b border-dotted border-slate-600 px-1 inline-block ${minW}`}>
        {valStr}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/80 backdrop-blur-sm flex justify-center items-start p-4 sm:p-6 print:p-0 print:bg-white print:static">
      <div className="bg-slate-900 border border-white/20 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl my-8 print:my-0 print:border-none print:shadow-none print:w-full print:max-w-none">
        
        {/* Modal Action Bar */}
        <div className="bg-slate-800/90 border-b border-white/10 px-6 py-4 flex flex-wrap items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📄</span>
            <div>
              <h2 className="text-base font-bold text-white">เอกสารสัญญาเช่าห้องพักหอพักเกษร (ต้นฉบับทางการ 3 หน้า)</h2>
              <p className="text-xs text-white/60">ห้องพักเลขที่ {contract.room_number} • ผู้เช่า: {contract.tenant_name || '-'}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Tab Selector */}
            <div className="inline-flex p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs font-bold text-slate-400 mr-2">
              <button
                type="button"
                onClick={() => setActiveTab('all')}
                className={`px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${activeTab === 'all' ? 'bg-cyan-500 text-slate-950 font-black' : 'hover:text-white'}`}
              >
                ทุกหน้า (3 หน้า)
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('1')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${activeTab === '1' ? 'bg-cyan-500 text-slate-950 font-black' : 'hover:text-white'}`}
              >
                หน้า 1
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('2')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${activeTab === '2' ? 'bg-cyan-500 text-slate-950 font-black' : 'hover:text-white'}`}
              >
                หน้า 2
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('3')}
                className={`px-2 py-1 rounded-lg transition-colors cursor-pointer ${activeTab === '3' ? 'bg-cyan-500 text-slate-950 font-black' : 'hover:text-white'}`}
              >
                หน้า 3
              </button>
            </div>

            <button
              onClick={handlePrint}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>🖨️</span> พิมพ์
            </button>

            <button
              onClick={handleDownloadDocx}
              disabled={downloadingDocx}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>📄</span> {downloadingDocx ? 'กำลังสร้าง Word...' : 'ดาวน์โหลด Word'}
            </button>

            <button
              onClick={handleDownloadPDF}
              disabled={downloading}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer active:scale-95"
            >
              <span>📥</span> {downloading ? 'กำลังสร้าง PDF...' : 'ดาวน์โหลด PDF (3 หน้า)'}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-white/60 hover:text-white rounded-xl bg-white/5 hover:bg-white/10 transition-colors ml-2"
              title="ปิด"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 3-Page Contract Viewport */}
        <div className="p-4 sm:p-8 bg-slate-950 flex flex-col items-center gap-8 overflow-x-auto print:p-0 print:bg-white print:gap-0">
          
          {/* ── PAGE 1 ──────────────────────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === '1') && (
            <div
              ref={page1Ref}
              id="printable-contract-page-1"
              className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-[20mm] font-sarabun shadow-2xl relative text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm] print:break-after-page"
              style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
            >
              <div>
                <div className="text-center mb-6">
                  <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
                    สัญญาเช่าห้องพักหอพักเกษร
                  </h1>
                  <p className="text-[15px] text-slate-800 mt-1">
                    หอพักเกษร 224 หมู่ 2 แม่กาห้วยเคียน เมือง พะเยา 56000 โทร 09-3048-0607
                  </p>
                </div>

                <div className="text-right text-[15px] mb-5">
                  <span>
                    วันที่ <Blank value={dayStr} dots={14} minW="min-w-[40px]" />{' '}
                    เดือน <Blank value={monthStr} dots={28} minW="min-w-[100px]" />{' '}
                    พ.ศ. <Blank value={yearStr} dots={12} minW="min-w-[50px]" />
                  </span>
                </div>

                <div className="text-justify text-[15px] space-y-2 leading-[1.65]">
                  <p className="indent-8">
                    สัญญาเช่าฉบับนี้ทำขึ้นระหว่างขันแก้ว คำบัว ดังที่อยู่ข้างต้น ซึ่งต่อไปในสัญญานี้จะเรียกว่า &quot;ผู้ให้เช่า&quot; ฝ่ายหนึ่งกับ
                  </p>
                  <p>
                    นาย/นางสาว <Blank value={contract.tenant_name} dots={58} minW="min-w-[280px]" />{' '}
                    อยู่บ้านเลขที่ <Blank value={houseNoStr} dots={36} minW="min-w-[120px]" />{' '}
                    หมู่บ้าน <Blank value={villageStr} dots={32} minW="min-w-[80px]" />
                  </p>
                  <p>
                    ถนน <Blank value={roadStr} dots={28} minW="min-w-[80px]" />{' '}
                    ตำบล/แขวง <Blank value={subdistrictStr} dots={26} minW="min-w-[90px]" />{' '}
                    อำเภอ/เขต <Blank value={districtStr} dots={20} minW="min-w-[90px]" />{' '}
                    จังหวัด <Blank value={provinceStr} dots={50} minW="min-w-[120px]" />
                  </p>
                  <p>
                    เบอร์โทรผู้พัก <Blank value={contract.tenant_phone} dots={46} minW="min-w-[180px]" />{' '}
                    เบอร์โทรผู้ปกครอง <Blank value={(contract as any).parent_phone} dots={82} minW="min-w-[240px]" />
                  </p>
                  <p>
                    ซึ่งต่อไปในสัญญานี้จะเรียกว่า &quot;ผู้เช่า&quot; ฝ่ายหนึ่ง คู่สัญญาได้ตกลงกันดังนี้
                  </p>
                </div>

                <div className="mt-4 space-y-3 text-justify text-[15px] leading-[1.65]">
                  <p className="indent-8">
                    <strong>ข้อ 1.</strong> ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องพักเลขที่{' '}
                    <Blank value={contract.room_number} dots={7} minW="min-w-[36px]" />{' '}
                    ชั้นที่ <Blank value={floorStr} dots={7} minW="min-w-[36px]" />{' '}
                    ในอาคารของผู้ให้เช่าเพื่อเป็น ที่อยู่อาศัยภายใต้ระเบียบที่ผู้ให้เช่ากำหนด โดยเฉพาะไม่ก่อกวน ต้องสงบในยามวิกาล ไม่ทะเลาะวิวาท ไม่ทำผิดศีลธรรมและกฎหมาย
                  </p>

                  <div className="indent-8">
                    <p>
                      <strong>ข้อ 2.</strong> ผู้เช่าตกลงชำระค่าเช่าให้แก่ผู้ให้เช่าล่วงหน้า
                    </p>
                    <div className="pl-6 pt-1 space-y-1">
                      <p>
                        • ค่ามัดจำจำนวน <Blank value={depositStr} dots={22} minW="min-w-[90px]" /> บาท ค่ามัดจำจะคืนให้ตอนออก เมื่อพักครบสัญญา อย่างน้อย 1 ปี หักค่าเสียหายภายในห้องและค่าทำความสะอาด
                      </p>
                      <p>
                        • ค่าเช่าจำนวน <Blank value={rentStr} dots={29} minW="min-w-[90px]" /> บาท เป็นค่าเช่าของเดือน <Blank value={startMonthStr} dots={52} minW="min-w-[180px]" />
                      </p>
                    </div>
                  </div>

                  <p>
                    ส่วนค่าเช่าชำระโดยกำหนดชำระค่าเช่าภายในวันที่ <span className="font-bold border-b border-dotted border-slate-600 px-1">5</span> ของทุกเดือน ในอัตราค่าเช่าเดือนละ{' '}
                    <Blank value={rentStr} dots={25} minW="min-w-[90px]" /> บาท หากผู้เช่าชำระเงินล่าช้ากว่ากำหนด ผู้ให้เช่ามีสิทธิ์เรียกขอค่าล่าช้าตามที่ได้แจ้งก่อนหน้านี้
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 3.</strong> ผู้เช่าตกลงจะนำค่าเช่ามาชำระให้ ณ ที่ทำการของผู้ให้เช่าหรือตัวแทนภายกำหนด
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 4.</strong> ห้ามเช่าช่วงเป็นอันขาด เว้นแต่ผู้ให้เช่าตกลงยินยอมด้วยเป็นลายลักษณ์อักษร
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 5.</strong> ค่าน้ำประปา ค่าไฟฟ้า และค่าใช้จ่ายอื่น ถ้ามิให้เรียกเก็บตามอัตราในมิเตอร์หรือโดยเฉลี่ยจากผู้เช่า
                  </p>
                </div>
              </div>

              <div className="text-right text-[12px] text-slate-400 pt-3 print:hidden">
                หน้า 1 / 3
              </div>
            </div>
          )}

          {/* ── PAGE 2 ──────────────────────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === '2') && (
            <div
              ref={page2Ref}
              id="printable-contract-page-2"
              className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-[20mm] font-sarabun shadow-2xl relative text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm] print:break-after-page"
              style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
            >
              <div>
                <div className="space-y-3.5 text-justify text-[15px] leading-[1.65] pt-1">
                  <p className="indent-8">
                    <strong>ข้อ 6.</strong> ผู้เช่าต้องบำรุงรักษาห้องเช่ารวมถึงอุปกรณ์ไฟฟ้า มุ้งลวด กระจกบานเกล็ด กุญแจห้อง กลอนประตู พัดลม หลอดไฟ เสื่อ ฝาผนัง และอื่น ๆ ให้อยู่ในสภาพที่ดีอยู่เสมอ หากเกิดชำรุดเสียหายไม่ว่าด้วยเหตุใดก็ตาม ผู้เช่าต้องทำให้กลับคืนสู่สภาพเดิมทันทีด้วยค่าใช้จ่ายของผู้เช่า
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 7.</strong> ผู้เช่ามีหน้าที่รักษาความสะอาดตามกฎหมาย ไม่เก็บวัตถุไวไฟหรือสิ่งอันตรายหรือสิ่งต้องห้ามตามกฎหมาย ผู้เช่ายินยอมให้ผู้ให้เช่าเข้าตรวจความถูกต้องเรียบร้อยในห้อง
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 8.</strong> ผู้เช่าจะดัดแปลงต่อเติมหรือรื้อถอนทรัพย์สินที่เช่าทั้งหมดหรือบางส่วนได้ต่อเมื่อได้รับความยินยอมเป็นหนังสือจากผู้ให้เช่า
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 9.</strong> ถ้าผู้เช่าผิดสัญญาไม่ชำระค่าเช่าตามกำหนดไว้ในข้อ 2. ผู้ให้เช่าต้องทวงสิทธิไว้ในการกลับเข้าครอบครองทรัพย์สินที่เช่าตามสัญญานี้โดยฉับพลัน และผู้เช่ายอมให้ผู้ให้เช่าย้ายบุคคลหรือทรัพย์สินของผู้เช่าออกไปจากทรัพย์ที่เช่าตามสัญญานี้
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 10.</strong> ผู้เช่ามีหน้าที่แจ้งให้ผู้ให้เช่าทราบล่วงหน้าในการเลิกเช่าไม่น้อยกว่าสามสิบวันจึงจะได้รับเงินล่วงหน้าคืนหรืออยู่อาศัยโดยหักจากการชำระล่วงหน้าตามข้อ 2.
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 11.</strong> ในวันทำสัญญานี้ผู้เช่าได้ตรวจตราทรัพย์สินที่เช่าแล้วเห็นว่ามีสภาพปกติดีทุกประการและผู้ให้เช่าได้ส่งมอบทรัพย์สินที่เช่าให้แก่ผู้เช่าแล้ว
                  </p>

                  <p className="indent-8">
                    <strong>ข้อ 12.</strong> ผู้เช่าได้มอบสำเนาบัตรประจำตัว สำเนาทะเบียนบ้านและเอกสารแสดงตัวตามกฎหมายที่ไม่หมดอายุ พร้อมรูปถ่าย <Blank value="1" dots={10} minW="min-w-[40px]" /> รูป ให้ไว้กับผู้ให้เช่า
                  </p>
                </div>

                <div className="mt-6 text-[15px]">
                  <p className="indent-8">
                    คู่สัญญาทั้งสองฝ่ายได้อ่านและทำความเข้าใจดีแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน
                  </p>
                </div>

                {/* Signatures */}
                <div className="mt-12 space-y-10 text-[15px]">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p>ลงชื่อ.......................................................ผู้เช่า</p>
                      <p>( {contract.tenant_name ? <span className="font-bold">{contract.tenant_name}</span> : '……………………………………………………………'} )</p>
                    </div>

                    <div className="space-y-1">
                      <p>ลงชื่อ.......................................................ผู้ให้เช่า</p>
                      <p>(……….............นายขันแก้ว คำบัว.........………….)</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-8">
                    <div className="space-y-1">
                      <p>ลงชื่อ.......................................................พยาน</p>
                      <p>(…………………………………………………………….)</p>
                    </div>

                    <div className="space-y-1">
                      <p>ลงชื่อ.......................................................พยาน</p>
                      <p>(………...............นางเกษร คำบัว..........………….)</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="text-right text-[12px] text-slate-400 pt-3 print:hidden">
                หน้า 2 / 3
              </div>
            </div>
          )}

          {/* ── PAGE 3 ──────────────────────────────────────────────────────── */}
          {(activeTab === 'all' || activeTab === '3') && (
            <div
              ref={page3Ref}
              id="printable-contract-page-3"
              className="w-[210mm] min-h-[297mm] bg-white text-slate-900 p-[20mm] font-sarabun shadow-2xl relative text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm]"
              style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
            >
              <div>
                <div className="mb-6 pt-3">
                  <h2 className="text-[19px] font-bold text-slate-900">หมายเหตุ</h2>
                </div>

                <div className="space-y-4 text-[15px] leading-[1.7] text-slate-900">
                  <p>• ค่าน้ำคนละ 100 บาท</p>
                  <p>• ค่าไฟหน่วยละ 8 บาท</p>
                  <p>• ติดต่อเจ้าของหอพัก นายขันแก้ว คำบัว 09-3048-0607</p>
                  <p>• ติดต่อเจ้าของหอพัก นายวรรธนันท์ คำบัว 081-842-4948</p>
                  <p>• หากพักไม่ ครบ 12 เดือน ผู้เช่าขอสงวนสิทธิ์ไม่คืนเงินมัดจำ</p>
                  <p>• ห้ามทิ้งขยะลงโถชักโครก</p>
                  <p>• ห้ามเสียงดัง ห้ามดื่มเหล้า สูบบุหรี่ ให้รักษาความสะอาดห้องพักสม่ำเสมอ</p>
                  <p>• โปรดแยกขยะและทิ้งขยะบริเวณที่เตรียมไว้</p>
                  <div className="space-y-1 pt-1">
                    <p>• หอพักเกษร กรณีโอนเงิน หมายเลขบัญชีธนาคารกสิกรไทย วรรธนันท์ คำบัว ออมทรัพย์บางซื่อ 020-2-56417-8</p>
                    <p className="pl-3 font-semibold text-emerald-800">
                      หรือ พร้อมเพย์ <span className="font-bold underline">0636040550</span> วรรธนันท์ คำบัว
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-right text-[12px] text-slate-400 pt-3 print:hidden">
                หน้า 3 / 3
              </div>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
