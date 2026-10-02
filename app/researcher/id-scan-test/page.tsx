'use client';

import { useState, useRef, useEffect, DragEvent, ChangeEvent } from 'react';
import Link from 'next/link';

interface ContractFormData {
  // วันที่ทำสัญญา
  contractDay: string;
  contractMonth: string;
  contractYear: string;

  // ข้อมูลผู้เช่า
  tenantName: string;
  houseNo: string;
  village: string;
  road: string;
  subdistrict: string;
  district: string;
  province: string;
  idCardNumber: string;
  tenantPhone: string;
  parentPhone: string;

  // ห้องพักและการเงิน
  roomNumber: string;
  floor: string;
  depositAmount: string | number;
  monthlyRent: string | number;
  startMonth: string;
  photoCount: string;

  // ข้อมูลผู้ให้เช่าและพยาน (ตามสัญญาเกษรจริง)
  landlordName: string;
  landlordPhone: string;
  witness2Name: string;
}

// Smart helper to parse Thai address from OCR
function parseThaiAddress(addressStr: string) {
  let houseNo = '';
  let village = '';
  let road = '';
  let subdistrict = '';
  let district = '';
  let province = '';

  const clean = (addressStr || '').trim();
  if (!clean) {
    return { houseNo: '', village: '', road: '', subdistrict: '', district: '', province: '' };
  }

  // 1. Subdistrict (ต. / ตำบล / แขวง)
  const subMatch = clean.match(/(?:ตำบล|ต\.|แขวง)\s*([^\s,]+)/);
  if (subMatch) subdistrict = subMatch[1];

  // 2. District (อ. / อำเภอ / เขต)
  const distMatch = clean.match(/(?:อำเภอ|อ\.|เขต)\s*([^\s,]+)/);
  if (distMatch) district = distMatch[1];

  // 3. Province (จ. / จังหวัด)
  const provMatch = clean.match(/(?:จังหวัด|จ\.)\s*([^\s,\d]+)/);
  if (provMatch) province = provMatch[1];

  // 4. Road (ถ. / ถนน)
  const roadMatch = clean.match(/(?:ถนน|ถ\.)\s*([^\s,]+)/);
  if (roadMatch) road = roadMatch[1];

  // 5. Village (หมู่บ้าน / หมู่ที่ / หมู่ / ม.)
  const villMatch = clean.match(/(?:หมู่บ้าน[^\s,]+|หมู่ที่\s*\d+|หมู่\s*\d+|ม\.\s*\d+)/);
  if (villMatch) village = villMatch[0].replace(/หมู่ที่|หมู่|ม\./, '').trim();

  // 6. House number (first tokens before village or subdistrict)
  const tokens = clean.split(/\s+/);
  if (tokens.length > 0) {
    houseNo = tokens[0].replace(/^(?:บ้านเลขที่|เลขที่)/, '');
  }

  return {
    houseNo: houseNo || clean,
    village: village || '-',
    road: road || '-',
    subdistrict: subdistrict || '',
    district: district || '',
    province: province || '',
  };
}

export default function ResearcherIdScanTestPage() {
  const [idImage, setIdImage] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [ocrSuccess, setOcrSuccess] = useState<boolean>(false);
  const [exportingPdf, setExportingPdf] = useState<boolean>(false);
  const [apiKey, setApiKey] = useState<string>('');
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [ocrStats, setOcrStats] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | '1' | '2' | '3'>('all');

  // Camera state
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);

  // References for multi-page export
  const page1Ref = useRef<HTMLDivElement>(null);
  const page2Ref = useRef<HTMLDivElement>(null);
  const page3Ref = useRef<HTMLDivElement>(null);

  const today = new Date();
  const thaiMonths = [
    'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
    'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
  ];

  const [contractData, setContractData] = useState<ContractFormData>({
    contractDay: String(today.getDate()),
    contractMonth: thaiMonths[today.getMonth()],
    contractYear: String(today.getFullYear() + 543),

    tenantName: 'นาย กฤษกร บวรนันทกุล',
    houseNo: '224/12',
    village: '2',
    road: '-',
    subdistrict: 'แม่กา',
    district: 'เมืองพะเยา',
    province: 'พะเยา',
    idCardNumber: '1-5699-00213-45-8',
    tenantPhone: '082-985-3519',
    parentPhone: '081-842-4948',

    roomNumber: '5',
    floor: '2',
    depositAmount: 3000,
    monthlyRent: 3500,
    startMonth: 'ตุลาคม 2569',
    photoCount: '2',

    landlordName: 'ขันแก้ว คำบัว',
    landlordPhone: '09-3048-0607',
    witness2Name: 'นางเกษร คำบัว',
  });

  const [serverKeyInfo, setServerKeyInfo] = useState<{ hasKey: boolean; maskedKey: string; source: string } | null>(null);

  // Load saved API Key from localStorage and check Server DB/ENV
  useEffect(() => {
    const localSaved = typeof window !== 'undefined' ? localStorage.getItem('kesorn_gemini_api_key') : null;
    if (localSaved) {
      setApiKey(localSaved);
    }
    fetch('/api/researcher/id-scan-test')
      .then((r) => r.json())
      .then((data) => {
        if (data.success && data.hasKey) {
          setServerKeyInfo(data);
        }
      })
      .catch(() => {});
  }, []);

  const handleApiKeyChange = (val: string) => {
    setApiKey(val);
    if (typeof window !== 'undefined') {
      if (val.trim()) {
        localStorage.setItem('kesorn_gemini_api_key', val.trim());
      } else {
        localStorage.removeItem('kesorn_gemini_api_key');
      }
    }
  };

  // Stop camera tracks on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Clipboard paste support (Ctrl+V)
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            handleFileSelect(file);
            break;
          }
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [apiKey, serverKeyInfo]);

  const startCamera = async () => {
    try {
      setCameraError(null);
      stopCamera();

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch (err: any) {
      console.error('Camera error:', err);
      setCameraError('ไม่สามารถเปิดกล้องได้: ' + (err.message || 'โปรดอนุญาตสิทธิ์การใช้กล้อง'));
      setCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  };

  const toggleFacingMode = async () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    if (cameraActive) {
      setTimeout(() => startCamera(), 100);
    }
  };

  const optimizeImageForOcr = (dataUrl: string, maxDim = 1280): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          resolve(dataUrl);
          return;
        }
        if (width > height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.88));
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rawDataUrl = canvas.toDataURL('image/jpeg', 0.90);

    stopCamera();
    setLoading(true);
    setLoadingMessage('กำลังปรับความคมชัดของภาพ...');
    const optimized = await optimizeImageForOcr(rawDataUrl);
    setIdImage(optimized);
    setFileName(`ภาพถ่ายกล้อง_${new Date().toLocaleTimeString('th-TH').replace(/:/g, '-')}.jpg`);
    runOcr(optimized);
  };

  const handleFileSelect = async (file: File) => {
    stopCamera();
    if (!file.type.startsWith('image/')) {
      setError('กรุณาเลือกไฟล์รูปภาพเท่านั้น (.jpg, .jpeg, .png, .webp)');
      return;
    }
    setError(null);
    setFileName(file.name);
    setLoading(true);
    setLoadingMessage('กำลังโหลดและปรับขนาดภาพ...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      const dataUrl = e.target?.result as string;
      const optimized = await optimizeImageForOcr(dataUrl);
      setIdImage(optimized);
      runOcr(optimized);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const runOcr = async (imgData: string) => {
    const keyToUse = apiKey.trim();
    if (!keyToUse && !serverKeyInfo?.hasKey) {
      setError('กรุณากรอก Gemini API Key ในช่องด้านล่างก่อนเริ่มสแกนอ่านข้อมูลบัตรด้วย AI ครับ');
      return;
    }

    setLoading(true);
    setLoadingMessage('Gemini Vision AI กำลังอ่านข้อมูลบัตรประชาชน...');
    setError(null);
    setOcrStats(null);

    const t0 = Date.now();
    try {
      const payload: any = { imageBase64: imgData };
      if (keyToUse) {
        payload.apiKey = keyToUse;
      }

      const res = await fetch('/api/researcher/id-scan-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      const timeSec = ((Date.now() - t0) / 1000).toFixed(1);

      if (json.success && json.data) {
        const d: any = json.data;
        const parsedAddr = parseThaiAddress(d.address || '');

        setContractData((prev) => ({
          ...prev,
          tenantName: d.full_name_th || prev.tenantName,
          idCardNumber: d.id_card_number || prev.idCardNumber,
          houseNo: parsedAddr.houseNo || prev.houseNo,
          village: parsedAddr.village || prev.village,
          road: parsedAddr.road || prev.road,
          subdistrict: parsedAddr.subdistrict || prev.subdistrict,
          district: parsedAddr.district || prev.district,
          province: parsedAddr.province || prev.province,
        }));
        setOcrSuccess(true);
        setOcrStats(`อ่านสำเร็จใน ${timeSec} วินาที (Google Gemini AI Vision)`);
      } else {
        setError(json.message || 'Gemini AI ไม่สามารถอ่านข้อมูลบัตรได้ กรุณาตรวจทานหรือแก้ไขในแบบฟอร์ม');
      }
    } catch (err: any) {
      console.error(err);
      setError('เกิดข้อผิดพลาดในการเชื่อมต่อ Gemini Vision API กรุณาลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // Preset demo test ID card
  const loadDemoCard = (preset: 'kritsakorn' | 'somchai' | 'blank') => {
    stopCamera();

    if (preset === 'kritsakorn') {
      setContractData({
        contractDay: String(today.getDate()),
        contractMonth: thaiMonths[today.getMonth()],
        contractYear: String(today.getFullYear() + 543),
        tenantName: 'นาย กฤษกร บวรนันทกุล',
        houseNo: '224/12',
        village: '2',
        road: '-',
        subdistrict: 'แม่กา',
        district: 'เมืองพะเยา',
        province: 'พะเยา',
        idCardNumber: '1-5699-00213-45-8',
        tenantPhone: '082-985-3519',
        parentPhone: '081-842-4948',
        roomNumber: '5',
        floor: '2',
        depositAmount: 3000,
        monthlyRent: 3500,
        startMonth: 'ตุลาคม 2569',
        photoCount: '2',
        landlordName: 'ขันแก้ว คำบัว',
        landlordPhone: '09-3048-0607',
        witness2Name: 'นางเกษร คำบัว',
      });
      setOcrSuccess(true);
      setFileName('ตัวอย่างบัตร_กฤษกร.jpg');
    } else if (preset === 'somchai') {
      setContractData({
        contractDay: '5',
        contractMonth: 'ตุลาคม',
        contractYear: '2569',
        tenantName: 'นาย สมชาย ใจดี',
        houseNo: '99/12',
        village: '4',
        road: 'งามวงศ์วาน',
        subdistrict: 'บางเขน',
        district: 'เมืองนนทบุรี',
        province: 'นนทบุรี',
        idCardNumber: '1-1002-01234-56-7',
        tenantPhone: '081-234-5678',
        parentPhone: '089-876-5432',
        roomNumber: '5',
        floor: '2',
        depositAmount: 3000,
        monthlyRent: 3500,
        startMonth: 'ตุลาคม 2569',
        photoCount: '1',
        landlordName: 'ขันแก้ว คำบัว',
        landlordPhone: '09-3048-0607',
        witness2Name: 'นางเกษร คำบัว',
      });
      setOcrSuccess(true);
      setFileName('ตัวอย่างบัตร_สมชาย.jpg');
    } else if (preset === 'blank') {
      // Blank contract (paper form template with dots)
      setContractData({
        contractDay: '',
        contractMonth: '',
        contractYear: '',
        tenantName: '',
        houseNo: '',
        village: '',
        road: '',
        subdistrict: '',
        district: '',
        province: '',
        idCardNumber: '',
        tenantPhone: '',
        parentPhone: '',
        roomNumber: '',
        floor: '',
        depositAmount: '',
        monthlyRent: '',
        startMonth: '',
        photoCount: '',
        landlordName: 'ขันแก้ว คำบัว',
        landlordPhone: '09-3048-0607',
        witness2Name: 'นางเกษร คำบัว',
      });
      setOcrSuccess(false);
      setFileName('');
    }
  };

  // Export 3-Page Contract as PDF
  const handleDownloadPdf = async () => {
    setExportingPdf(true);
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

      const html2canvas = (await import('html2canvas-pro')).default;
      const { jsPDF } = await import('jspdf');

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

      const cleanFileName = `สัญญาเช่าหอพักเกษร_ห้อง${contractData.roomNumber || 'ห้องพัก'}_${(contractData.tenantName || 'ผู้เช่า').replace(/\s+/g, '_')}.pdf`;
      pdf.save(cleanFileName);
    } catch (err: any) {
      console.error('PDF export error stack:', err?.stack ? String(err.stack) : String(err?.message || err));
      alert('เกิดข้อผิดพลาดในการสร้างไฟล์ PDF: ' + err.message);
    } finally {
      if (prevTab !== 'all') {
        setActiveTab(prevTab);
      }
      setExportingPdf(false);
    }
  };

  // Browser Native Print
  const handlePrint = () => {
    window.print();
  };

  // Inline Blank Field Renderer
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
    <div className="min-h-full bg-slate-950 text-slate-100 p-4 sm:p-6 lg:p-8 space-y-8 print:p-0 print:bg-white print:text-black">
      {/* Hidden File Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          if (e.target.files && e.target.files[0]) {
            handleFileSelect(e.target.files[0]);
          }
        }}
      />

      {/* Header (Hidden in Print) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-cyan-500/20 pb-6 print:hidden">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              Researcher Sandbox · Thai Smart ID Card OCR
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black tracking-wider uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              สัญญาเช่าหอพักเกษรฉบับจริง (3 หน้า)
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <span>🪪</span>
            <span>ระบบสแกนบัตรประชาชน & สร้างสัญญาเช่าหอพักเกษร</span>
          </h1>
          <p className="text-slate-400 text-xs sm:text-sm mt-1 max-w-3xl">
            ฟังก์ชันสแกนอ่านข้อมูลบัตรประชาชนด้วย Google Gemini AI Vision พร้อมกรอกข้อมูลลงในแบบฟอร์มสัญญาเช่าหอพักเกษรฉบับจริงเป๊ะ 3 หน้า และดาวน์โหลดเป็น PDF ทันที
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/researcher"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700/60 transition-all flex items-center gap-1.5"
          >
            <span>← แดชบอร์ดวิจัย</span>
          </Link>
          <Link
            href="/researcher/slip-test"
            className="px-3.5 py-2 rounded-xl text-xs font-bold bg-cyan-950/60 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-500/30 transition-all flex items-center gap-1.5"
          >
            <span>🧾 ทดสอบ SlipOK</span>
          </Link>
        </div>
      </div>

      {/* Main Workspace (Hidden on Print) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
        
        {/* Left Column (5 Cols): Scanner & Editable Input Fields */}
        <div className="xl:col-span-5 space-y-6 print:hidden">
          
          {/* 1. OCR Camera / Uploader Card */}
          <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📸</span> 1. สแกนบัตรประชาชน (Gemini Vision AI)
              </h2>
              {idImage && (
                <button
                  type="button"
                  onClick={() => {
                    setIdImage(null);
                    setFileName('');
                    setError(null);
                  }}
                  className="text-xs text-rose-400 hover:text-rose-300 transition-colors"
                >
                  ✕ ล้างรูปภาพ
                </button>
              )}
            </div>

            {/* Mode Switcher Buttons */}
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  if (cameraActive) {
                    stopCamera();
                  } else {
                    startCamera();
                  }
                }}
                className={`py-2.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm ${
                  cameraActive
                    ? 'bg-rose-600 hover:bg-rose-500 text-white ring-2 ring-rose-400/50'
                    : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-cyan-600/20'
                }`}
              >
                <span>{cameraActive ? '✕' : '📸'}</span>
                <span>{cameraActive ? 'ปิดกล้อง' : 'เปิดกล้องสด'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  mobileCameraInputRef.current?.click();
                }}
                className="py-2.5 px-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                title="เปิดกล้องมือถือโดยตรง"
              >
                <span>📱</span>
                <span>กล้องมือถือ</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  stopCamera();
                  fileInputRef.current?.click();
                }}
                className="py-2.5 px-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <span>📁</span>
                <span>เลือกไฟล์ภาพ</span>
              </button>
            </div>

            {cameraError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-2">
                <span>⚠️</span> {cameraError}
              </div>
            )}

            {/* Display Area: Either Live Camera Feed OR Dropzone / Image Preview */}
            {cameraActive ? (
              <div className="relative rounded-2xl overflow-hidden bg-black aspect-[4/3] flex items-center justify-center border-2 border-cyan-500/50 shadow-2xl group">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* ID Card Viewfinder Guide Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center p-4">
                  <div className="w-full max-w-[320px] aspect-[8.5/5.4] border-2 border-dashed border-cyan-400/90 rounded-2xl relative shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                    <div className="absolute -top-1 -left-1 w-5 h-5 border-t-4 border-l-4 border-cyan-300 rounded-tl-lg" />
                    <div className="absolute -top-1 -right-1 w-5 h-5 border-t-4 border-r-4 border-cyan-300 rounded-tr-lg" />
                    <div className="absolute -bottom-1 -left-1 w-5 h-5 border-b-4 border-l-4 border-cyan-300 rounded-bl-lg" />
                    <div className="absolute -bottom-1 -right-1 w-5 h-5 border-b-4 border-r-4 border-cyan-300 rounded-br-lg" />
                    
                    <div className="absolute inset-x-0 bottom-2 text-center">
                      <span className="bg-black/75 text-cyan-300 text-[10px] font-bold px-2.5 py-0.5 rounded-full border border-cyan-500/30 shadow">
                        จัดวางบัตรประชาชนให้อยู่ในกรอบ
                      </span>
                    </div>
                  </div>
                </div>

                {/* Live Camera Controls */}
                <div className="absolute bottom-4 inset-x-0 flex items-center justify-center gap-3 z-10">
                  <button
                    type="button"
                    onClick={toggleFacingMode}
                    className="p-3 rounded-full bg-slate-900/80 hover:bg-slate-800 text-white border border-slate-700 shadow-lg cursor-pointer transition-transform active:scale-95"
                    title="สลับกล้องหน้า/หลัง"
                  >
                    🔄
                  </button>

                  <button
                    type="button"
                    onClick={capturePhoto}
                    className="px-6 py-3 rounded-full bg-gradient-to-r from-cyan-400 to-blue-500 hover:from-cyan-300 hover:to-blue-400 text-black font-black text-sm shadow-xl shadow-cyan-500/50 flex items-center gap-2 cursor-pointer transition-transform active:scale-90"
                  >
                    <span className="w-3 h-3 rounded-full bg-rose-600 animate-ping" />
                    <span>ถ่ายภาพและสแกน</span>
                  </button>

                  <button
                    type="button"
                    onClick={stopCamera}
                    className="p-3 rounded-full bg-slate-900/80 hover:bg-rose-900/80 text-white border border-slate-700 shadow-lg cursor-pointer transition-transform active:scale-95"
                    title="ปิดกล้อง"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              /* Drag & Drop Zone */
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-5 text-center cursor-pointer transition-all flex flex-col items-center justify-center min-h-[160px] relative overflow-hidden group ${
                  isDragging
                    ? 'border-cyan-400 bg-cyan-950/30 scale-[0.99]'
                    : 'border-slate-700/80 hover:border-cyan-500/60 bg-slate-950/50 hover:bg-slate-900/50'
                }`}
              >
                {idImage ? (
                  <div className="space-y-3 w-full">
                    <div className="w-full max-h-44 rounded-xl overflow-hidden border border-cyan-500/30 bg-black/40 flex items-center justify-center">
                      <img src={idImage} alt="ID Card Preview" className="max-h-44 object-contain mx-auto" />
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                      <span className="truncate max-w-[200px] font-mono text-cyan-300">{fileName}</span>
                      <span className="text-cyan-400 font-bold group-hover:underline">คลิกเพื่อเปลี่ยนรูป</span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 mx-auto text-2xl group-hover:scale-110 transition-transform">
                      🪪
                    </div>
                    <p className="text-xs font-bold text-slate-200">
                      ลากไฟล์รูปภาพบัตรประชาชนมาวางที่นี่ หรือ <span className="text-cyan-400 underline">คลิกเลือกไฟล์</span>
                    </p>
                    <p className="text-[11px] text-slate-500">
                      (หรือกด Ctrl+V เพื่อวางรูปภาพที่คัดลอกไว้ได้ทันที)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Quick Demo Presets */}
            <div className="pt-2">
              <p className="text-[11px] font-bold text-slate-400 mb-2 flex items-center gap-1.5">
                <span>⚡</span> หรือคลิกเลือกข้อมูลบัตรตัวอย่างสำหรับทดสอบ:
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => loadDemoCard('kritsakorn')}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 border border-cyan-500/30 transition-all text-center truncate cursor-pointer"
                >
                  กฤษกร (ผู้เช่าจริง)
                </button>
                <button
                  type="button"
                  onClick={() => loadDemoCard('somchai')}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all text-center truncate cursor-pointer"
                >
                  สมชาย (ห้อง 5)
                </button>
                <button
                  type="button"
                  onClick={() => loadDemoCard('blank')}
                  className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-amber-950/40 hover:bg-amber-900/50 text-amber-300 border border-amber-500/30 transition-all text-center truncate cursor-pointer"
                >
                  สัญญาเปล่า (กระดาษ)
                </button>
              </div>
            </div>

            {/* Gemini API Key field */}
            <div className="pt-3 border-t border-slate-800 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-200 flex items-center gap-1.5">
                  <span>🤖</span> Gemini Vision AI (Active Model: gemini-3.5/3.8-flash)
                </span>
                {apiKey.trim() || serverKeyInfo?.hasKey ? (
                  <span className="text-[11px] font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20 flex items-center gap-1">
                    <span>✓</span> พร้อมใช้งาน
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/20">
                    จำเป็นต้องระบุ
                  </span>
                )}
              </div>

              <div className="relative">
                <input
                  id="gemini-api-key-input"
                  type="password"
                  value={apiKey}
                  onChange={(e) => handleApiKeyChange(e.target.value)}
                  placeholder={serverKeyInfo?.hasKey ? `ใช้คีย์ในระบบ (${serverKeyInfo.maskedKey}) หรือวางคีย์ใหม่...` : "วาง Gemini API Key..."}
                  className="w-full bg-slate-950 border border-slate-700 focus:border-cyan-500 rounded-xl px-3 py-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none transition-all"
                />
                {apiKey && (
                  <button
                    type="button"
                    onClick={() => handleApiKeyChange('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
                    title="ล้างค่า"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>

            {/* Scan Action Button */}
            {idImage && !cameraActive && (
              <button
                type="button"
                onClick={() => runOcr(idImage)}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                    <span>{loadingMessage || 'กำลังอ่านข้อมูลบัตรด้วย AI OCR...'}</span>
                  </>
                ) : (
                  <>
                    <span>⚡ สแกนอ่านข้อมูลบัตรอีกครั้ง</span>
                  </>
                )}
              </button>
            )}

            {ocrStats && !loading && (
              <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span>⚡</span> {ocrStats}
                </span>
                <span className="text-[10px] text-cyan-400/80 font-mono">ความแม่นยำสูง</span>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs font-semibold flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span>⚠️</span>
                  <span>{error}</span>
                </div>
              </div>
            )}
          </div>

          {/* 2. Extracted Data Form (Editable & Realtime Filled) */}
          <div className="bg-slate-900/80 rounded-3xl p-6 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-black text-white uppercase tracking-wider flex items-center gap-2">
                <span>📝</span> 2. ช่องกรอกข้อมูลสัญญา (กรอกลงช่องว่างเป๊ะ)
              </h2>
              {ocrSuccess && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  ✓ ดึงข้อมูลแล้ว
                </span>
              )}
            </div>

            <div className="space-y-3 text-xs">
              {/* วันที่ทำสัญญา */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">วันที่</label>
                  <input
                    type="text"
                    value={contractData.contractDay}
                    onChange={(e) => setContractData({ ...contractData, contractDay: e.target.value })}
                    placeholder="28"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100 text-center font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">เดือน</label>
                  <input
                    type="text"
                    value={contractData.contractMonth}
                    onChange={(e) => setContractData({ ...contractData, contractMonth: e.target.value })}
                    placeholder="กันยายน"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100 text-center font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">พ.ศ.</label>
                  <input
                    type="text"
                    value={contractData.contractYear}
                    onChange={(e) => setContractData({ ...contractData, contractYear: e.target.value })}
                    placeholder="2569"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 text-slate-100 text-center font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* ชื่อผู้เช่า */}
              <div>
                <label className="block text-[11px] font-bold text-slate-400 mb-1">นาย/นางสาว (ชื่อ-นามสกุล ผู้เช่า)</label>
                <input
                  type="text"
                  value={contractData.tenantName}
                  onChange={(e) => setContractData({ ...contractData, tenantName: e.target.value })}
                  placeholder="เช่น นาย กฤษกร บวรนันทกุล"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-slate-100 font-bold focus:outline-none focus:border-cyan-500"
                />
              </div>

              {/* ที่อยู่ตามสัญญา (แยกช่องตามสัญญากระดาษเป๊ะ) */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">อยู่บ้านเลขที่</label>
                  <input
                    type="text"
                    value={contractData.houseNo}
                    onChange={(e) => setContractData({ ...contractData, houseNo: e.target.value })}
                    placeholder="224/12"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">หมู่บ้าน / หมู่ที่</label>
                  <input
                    type="text"
                    value={contractData.village}
                    onChange={(e) => setContractData({ ...contractData, village: e.target.value })}
                    placeholder="2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ถนน</label>
                  <input
                    type="text"
                    value={contractData.road}
                    onChange={(e) => setContractData({ ...contractData, road: e.target.value })}
                    placeholder="-"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ตำบล/แขวง</label>
                  <input
                    type="text"
                    value={contractData.subdistrict}
                    onChange={(e) => setContractData({ ...contractData, subdistrict: e.target.value })}
                    placeholder="แม่กา"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">อำเภอ/เขต</label>
                  <input
                    type="text"
                    value={contractData.district}
                    onChange={(e) => setContractData({ ...contractData, district: e.target.value })}
                    placeholder="เมืองพะเยา"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">จังหวัด</label>
                  <input
                    type="text"
                    value={contractData.province}
                    onChange={(e) => setContractData({ ...contractData, province: e.target.value })}
                    placeholder="พะเยา"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* เบอร์โทรผู้พัก และ ผู้ปกครอง */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">เบอร์โทรผู้พัก</label>
                  <input
                    type="text"
                    value={contractData.tenantPhone}
                    onChange={(e) => setContractData({ ...contractData, tenantPhone: e.target.value })}
                    placeholder="082-985-3519"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">เบอร์โทรผู้ปกครอง</label>
                  <input
                    type="text"
                    value={contractData.parentPhone}
                    onChange={(e) => setContractData({ ...contractData, parentPhone: e.target.value })}
                    placeholder="081-842-4948"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* ข้อ 1: ห้องพักเลขที่ และ ชั้น */}
              <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-800">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ห้องพักเลขที่</label>
                  <input
                    type="text"
                    value={contractData.roomNumber}
                    onChange={(e) => setContractData({ ...contractData, roomNumber: e.target.value })}
                    placeholder="5"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 text-center font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ชั้นที่</label>
                  <input
                    type="text"
                    value={contractData.floor}
                    onChange={(e) => setContractData({ ...contractData, floor: e.target.value })}
                    placeholder="2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 text-center font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* ข้อ 2: การเงิน */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ค่ามัดจำ (บาท)</label>
                  <input
                    type="number"
                    value={contractData.depositAmount}
                    onChange={(e) => setContractData({ ...contractData, depositAmount: e.target.value })}
                    placeholder="3000"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 text-right font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">ค่าเช่าเดือนละ (บาท)</label>
                  <input
                    type="number"
                    value={contractData.monthlyRent}
                    onChange={(e) => setContractData({ ...contractData, monthlyRent: e.target.value })}
                    placeholder="3500"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 text-right font-bold focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">เป็นค่าเช่าของเดือน</label>
                  <input
                    type="text"
                    value={contractData.startMonth}
                    onChange={(e) => setContractData({ ...contractData, startMonth: e.target.value })}
                    placeholder="ตุลาคม 2569"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-400 mb-1">พร้อมรูปถ่าย (รูป)</label>
                  <input
                    type="text"
                    value={contractData.photoCount}
                    onChange={(e) => setContractData({ ...contractData, photoCount: e.target.value })}
                    placeholder="2"
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-1.5 text-slate-100 text-center focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

            </div>
          </div>
        </div>

        {/* Right Column (7 Cols): Official 3-Page Contract Preview & PDF Export */}
        <div className="xl:col-span-7 space-y-6">
          
          {/* Action Toolbar */}
          <div className="bg-slate-900/80 rounded-3xl p-4 sm:p-5 border border-slate-800 shadow-xl flex flex-wrap items-center justify-between gap-4 print:hidden">
            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <span>📄</span> สัญญาเช่าห้องพักหอพักเกษร (ต้นฉบับทางการ 3 หน้า)
              </h2>
              <p className="text-[11px] text-slate-400">
                ตรงตามเอกสารจริงเป๊ะทุกคำ พร้อมระบบกรอกข้อมูลลงในช่องว่างอัตโนมัติ
              </p>
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
                type="button"
                onClick={handlePrint}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              >
                <span>🖨️</span> พิมพ์
              </button>

              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={exportingPdf}
                className="px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-50"
              >
                {exportingPdf ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path></svg>
                    <span>กำลังสร้าง PDF 3 หน้า...</span>
                  </>
                ) : (
                  <>
                    <span>📥</span>
                    <span>ดาวน์โหลดสัญญา PDF</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Printable Official Contract Paper (A4 Standard Container) */}
          <div className="space-y-8 bg-slate-900/40 p-2 sm:p-4 rounded-3xl border border-slate-800 overflow-x-auto shadow-2xl print:p-0 print:bg-white print:border-none print:space-y-0">
            
            {/* ── PAGE 1 ──────────────────────────────────────────────────────── */}
            {(activeTab === 'all' || activeTab === '1') && (
              <div
                ref={page1Ref}
                id="contract-page-1"
                className="bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[20mm] mx-auto shadow-2xl relative font-sarabun text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm] print:break-after-page"
                style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
              >
                <div>
                  {/* Title & Dorm Header */}
                  <div className="text-center mb-6">
                    <h1 className="text-[22px] font-bold text-slate-900 tracking-tight">
                      สัญญาเช่าห้องพักหอพักเกษร
                    </h1>
                    <p className="text-[15px] text-slate-800 mt-1">
                      หอพักเกษร 224 หมู่ 2 แม่กาห้วยเคียน เมือง พะเยา 56000 โทร 09-3048-0607
                    </p>
                  </div>

                  {/* Date */}
                  <div className="text-right text-[15px] mb-5">
                    <span>
                      วันที่ <Blank value={contractData.contractDay} dots={14} minW="min-w-[40px]" />{' '}
                      เดือน <Blank value={contractData.contractMonth} dots={28} minW="min-w-[100px]" />{' '}
                      พ.ศ. <Blank value={contractData.contractYear} dots={12} minW="min-w-[50px]" />
                    </span>
                  </div>

                  {/* Preamble */}
                  <div className="text-justify text-[15px] space-y-2 leading-[1.65]">
                    <p className="indent-8">
                      สัญญาเช่าฉบับนี้ทำขึ้นระหว่างขันแก้ว คำบัว ดังที่อยู่ข้างต้น ซึ่งต่อไปในสัญญานี้จะเรียกว่า &quot;ผู้ให้เช่า&quot; ฝ่ายหนึ่งกับ
                    </p>
                    <p>
                      นาย/นางสาว <Blank value={contractData.tenantName} dots={58} minW="min-w-[280px]" />{' '}
                      อยู่บ้านเลขที่ <Blank value={contractData.houseNo} dots={36} minW="min-w-[120px]" />{' '}
                      หมู่บ้าน <Blank value={contractData.village} dots={32} minW="min-w-[100px]" />
                    </p>
                    <p>
                      ถนน <Blank value={contractData.road} dots={28} minW="min-w-[100px]" />{' '}
                      ตำบล/แขวง <Blank value={contractData.subdistrict} dots={26} minW="min-w-[110px]" />{' '}
                      อำเภอ/เขต <Blank value={contractData.district} dots={20} minW="min-w-[110px]" />{' '}
                      จังหวัด <Blank value={contractData.province} dots={50} minW="min-w-[160px]" />
                    </p>
                    <p>
                      เบอร์โทรผู้พัก <Blank value={contractData.tenantPhone} dots={46} minW="min-w-[180px]" />{' '}
                      เบอร์โทรผู้ปกครอง <Blank value={contractData.parentPhone} dots={82} minW="min-w-[260px]" />
                    </p>
                    <p>
                      ซึ่งต่อไปในสัญญานี้จะเรียกว่า &quot;ผู้เช่า&quot; ฝ่ายหนึ่ง คู่สัญญาได้ตกลงกันดังนี้
                    </p>
                  </div>

                  {/* Clauses 1-5 */}
                  <div className="mt-4 space-y-3 text-justify text-[15px] leading-[1.65]">
                    <p className="indent-8">
                      <strong>ข้อ 1.</strong> ผู้ให้เช่าตกลงให้เช่าและผู้เช่าตกลงเช่าห้องพักเลขที่{' '}
                      <Blank value={contractData.roomNumber} dots={7} minW="min-w-[36px]" />{' '}
                      ชั้นที่ <Blank value={contractData.floor} dots={7} minW="min-w-[36px]" />{' '}
                      ในอาคารของผู้ให้เช่าเพื่อเป็น ที่อยู่อาศัยภายใต้ระเบียบที่ผู้ให้เช่ากำหนด โดยเฉพาะไม่ก่อกวน ต้องสงบในยามวิกาล ไม่ทะเลาะวิวาท ไม่ทำผิดศีลธรรมและกฎหมาย
                    </p>

                    <div className="indent-8">
                      <p>
                        <strong>ข้อ 2.</strong> ผู้เช่าตกลงชำระค่าเช่าให้แก่ผู้ให้เช่าล่วงหน้า
                      </p>
                      <div className="pl-6 pt-1 space-y-1">
                        <p>
                          • ค่ามัดจำจำนวน <Blank value={contractData.depositAmount ? Number(contractData.depositAmount).toLocaleString() : ''} dots={22} minW="min-w-[90px]" /> บาท ค่ามัดจำจะคืนให้ตอนออก เมื่อพักครบสัญญา อย่างน้อย 1 ปี หักค่าเสียหายภายในห้องและค่าทำความสะอาด
                        </p>
                        <p>
                          • ค่าเช่าจำนวน <Blank value={contractData.monthlyRent ? Number(contractData.monthlyRent).toLocaleString() : ''} dots={29} minW="min-w-[90px]" /> บาท เป็นค่าเช่าของเดือน <Blank value={contractData.startMonth} dots={52} minW="min-w-[180px]" />
                        </p>
                      </div>
                    </div>

                    <p>
                      ส่วนค่าเช่าชำระโดยกำหนดชำระค่าเช่าภายในวันที่ <span className="font-bold border-b border-dotted border-slate-600 px-1">5</span> ของทุกเดือน ในอัตราค่าเช่าเดือนละ{' '}
                      <Blank value={contractData.monthlyRent ? Number(contractData.monthlyRent).toLocaleString() : ''} dots={25} minW="min-w-[90px]" /> บาท หากผู้เช่าชำระเงินล่าช้ากว่ากำหนด ผู้ให้เช่ามีสิทธิ์เรียกขอค่าล่าช้าตามที่ได้แจ้งก่อนหน้านี้
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
                id="contract-page-2"
                className="bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[20mm] mx-auto shadow-2xl relative font-sarabun text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm] print:break-after-page"
                style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
              >
                <div>
                  {/* Clauses 6-12 */}
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
                      <strong>ข้อ 12.</strong> ผู้เช่าได้มอบสำเนาบัตรประจำตัว สำเนาทะเบียนบ้านและเอกสารแสดงตัวตามกฎหมายที่ไม่หมดอายุ พร้อมรูปถ่าย <Blank value={contractData.photoCount} dots={10} minW="min-w-[40px]" /> รูป ให้ไว้กับผู้ให้เช่า
                    </p>
                  </div>

                  {/* Confirmation text */}
                  <div className="mt-6 text-[15px]">
                    <p className="indent-8">
                      คู่สัญญาทั้งสองฝ่ายได้อ่านและทำความเข้าใจดีแล้ว จึงลงลายมือชื่อไว้เป็นหลักฐาน
                    </p>
                  </div>

                  {/* Signatures (2 columns exactly as PDF) */}
                  <div className="mt-12 space-y-10 text-[15px]">
                    {/* Row 1: ผู้เช่า & ผู้ให้เช่า */}
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-1">
                        <p>ลงชื่อ.......................................................ผู้เช่า</p>
                        <p>( {contractData.tenantName ? <span className="font-bold">{contractData.tenantName}</span> : '……………………………………………………………'} )</p>
                      </div>

                      <div className="space-y-1">
                        <p>ลงชื่อ.......................................................ผู้ให้เช่า</p>
                        <p>(……….............นายขันแก้ว คำบัว.........………….)</p>
                      </div>
                    </div>

                    {/* Row 2: พยาน & พยาน */}
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
                id="contract-page-3"
                className="bg-white text-slate-900 w-[210mm] min-h-[297mm] p-[20mm] mx-auto shadow-2xl relative font-sarabun text-[15.5px] leading-[1.65] flex flex-col justify-between print:shadow-none print:p-[15mm]"
                style={{ fontFamily: "'TH Sarabun New', 'THSarabunNew', 'Sarabun', sans-serif" }}
              >
                <div>
                  {/* Notes Header */}
                  <div className="mb-6 pt-3">
                    <h2 className="text-[19px] font-bold text-slate-900">หมายเหตุ</h2>
                  </div>

                  {/* Exact Notes List from PDF */}
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
    </div>
  );
}
