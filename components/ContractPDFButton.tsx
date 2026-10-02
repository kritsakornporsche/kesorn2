'use client';

import React from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas-pro';
import { toast } from 'sonner';

interface ContractPDFButtonProps {
  contractId: string;
  targetId: string;
  signatureData?: string | null;
}

export default function ContractPDFButton({ contractId, targetId, signatureData }: ContractPDFButtonProps) {
  const [isGenerating, setIsGenerating] = React.useState(false);

  const generatePDF = async () => {
    const element = document.getElementById(targetId);
    if (!element) {
      toast.error('ไม่พบข้อมูลสัญญาสำหรับการสร้าง PDF');
      return;
    }

    setIsGenerating(true);
    toast.info('กำลังเตรียมไฟล์ PDF กรุณารอสักครู่...');

    try {
      // Ensure all images are loaded
      const images = element.getElementsByTagName('img');
      const imagePromises = Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise(resolve => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      });
      await Promise.all(imagePromises);

      // Brief stability pause
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: false,
        onclone: (clonedDoc) => {
          // Hide buttons
          const buttons = clonedDoc.getElementById('action-buttons');
          if (buttons) buttons.style.display = 'none';

          // Fix the element in the clone to be perfectly captureable
          const target = clonedDoc.getElementById(targetId);
          if (target) {
            target.style.maxHeight = 'none';
            target.style.overflow = 'visible';
            target.style.width = element.offsetWidth + 'px';
            target.style.margin = '0';
            target.style.padding = '40px';
          }

        }
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      
      const pdf = new jsPDF({
        orientation: 'p',
        unit: 'mm',
        format: 'a4',
        compress: true
      });

      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgProps = pdf.getImageProperties(imgData);
      const ratio = imgProps.width / imgProps.height;
      
      // Calculate adjusted image dimensions to fit/fill A4
      const displayWidth = pdfWidth;
      const displayHeight = pdfWidth / ratio;

      // If it's too long, it will be clipped (which is normal for single page capture)
      // To support multi-page, we'd need a more complex loop. 
      // For now, let's just make it fit high-quality.
      pdf.addImage(imgData, 'JPEG', 0, 0, displayWidth, displayHeight);
      pdf.save(`Contract-SD-${contractId.padStart(4, '0')}.pdf`);
      
      toast.success('ดาวน์โหลดสัญญา PDF เรียบร้อยแล้ว');
    } catch (error) {
      console.error('PDF Generation Detail Error:', error);
      toast.error('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF (ดูรายละเอียดใน Console)');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <button 
      onClick={generatePDF}
      disabled={isGenerating}
      className={`flex-1 bg-white hover:bg-[#F2EFE9] text-[#5A4D41] border border-[#DCD3C6] font-bold py-3.5 px-4 rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 ${isGenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      {isGenerating ? (
        <>
          <svg className="animate-spin h-5 w-5 text-[#8B7355]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          กำลังสร้าง PDF...
        </>
      ) : (
        <>
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          ดาวน์โหลดสัญญา (PDF)
        </>
      )}
    </button>
  );
}
