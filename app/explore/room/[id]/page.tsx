'use client';

import { useState, useEffect, use, useRef } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import ChatWidget from '@/app/components/ChatWidget';
import ContractSimulator from '@/app/components/ContractSimulator';
import PrintableContractModal from '@/components/PrintableContractModal';
import PromptPayBankSelector from '@/app/components/PromptPayBankSelector';
import { PdpaOcrConsentModal } from '@/app/components/PdpaOcrConsentModal';
import { ThaIdDigitalIdButton } from '@/components/features/ThaIdDigitalIdModal';

function getGoogleMapsEmbedUrl(mapUrl?: string, address?: string, dormName?: string) {
  if (mapUrl) {
    const trimmed = mapUrl.trim();
    if (trimmed.includes('/embed')) {
      return trimmed;
    }
    const coordMatch = trimmed.match(/(-?\d+\.\d+)\s*,\s*(-?\d+\.\d+)/);
    if (coordMatch) {
      const lat = coordMatch[1];
      const lng = coordMatch[2];
      return `https://maps.google.com/maps?q=${lat},${lng}&t=&z=16&ie=UTF8&iwloc=&output=embed`;
    }
    try {
      const url = new URL(trimmed);
      const q = url.searchParams.get('q') || url.searchParams.get('query');
      if (q) {
        return `https://maps.google.com/maps?q=${encodeURIComponent(q)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
      }
    } catch (e) {}
    if (trimmed.startsWith('http')) {
      return `https://maps.google.com/maps?q=${encodeURIComponent(trimmed)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
    }
  }
  const query = [dormName, address, 'พะเยา'].filter(Boolean).join(' ');
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&t=&z=15&ie=UTF8&iwloc=&output=embed`;
}

function getGoogleMapsDirectUrl(mapUrl?: string, address?: string, dormName?: string) {
  if (mapUrl && !mapUrl.includes('/embed') && mapUrl.startsWith('http')) {
    return mapUrl;
  }
  const query = [dormName, address, 'พะเยา'].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function RoomBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const roomId = resolvedParams.id;
  const { data: session, status: sessionStatus } = useSession();
  
  const [room, setRoom] = useState<any>(null);
  const [step, setStep] = useState(1); // 1: Info, 2: Info & Dates, 3: ID Card OCR & Contract Review, 4: QR Payment & Slip, 5: Finished
  const [loading, setLoading] = useState(true);
  const [bookingData, setBookingData] = useState({
    name: '',
    phone: '',
    parent_phone: '',
    email: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().split('T')[0],
    id_card_number: '',
    id_card_address: '',
    id_card_image: '',
    houseNo: '',
    village: '',
    road: '',
    subdistrict: '',
    district: '',
    province: '',
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  // OCR and Document States (Google Gemini Vision AI)
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const [ocrSuccessMsg, setOcrSuccessMsg] = useState<string | null>(null);
  const [ocrStats, setOcrStats] = useState<string | null>(null);
  const [ocrErrorMsg, setOcrErrorMsg] = useState<string | null>(null);
  const [createdContractId, setCreatedContractId] = useState<number | string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [downloadingDocx, setDownloadingDocx] = useState(false);

  // PDPA Consent Modal & Checkbox State
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [isPdpaModalOpen, setIsPdpaModalOpen] = useState(false);
  const [pendingOcrImage, setPendingOcrImage] = useState<string | null>(null);

  // Camera state for guest ID scan
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // QR Code & Slip Payment States
  const [qrData, setQrData] = useState<{ qrImage: string; amount: number; promptpayNumber: string; promptpayName: string } | null>(null);
  const [qrLoading, setQrLoading] = useState(false);
  const [slipData, setSlipData] = useState<string | null>(null);
  const [contractSignature, setContractSignature] = useState<string>('CONFIRMED_E_CONTRACT');

  const router = useRouter();

  const getImagesArray = (imageParam: string | null) => {
    if (!imageParam) return ['/images/kesorn/room-bed.jpg'];
    try {
      if (imageParam.startsWith('[') && imageParam.endsWith(']')) {
        return JSON.parse(imageParam);
      }
      return [imageParam];
    } catch (e) {
      return [imageParam];
    }
  };

  const handleOpenChat = () => {
    if (!session) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
      return;
    }
    if (room?.dorm_id) {
      window.dispatchEvent(new CustomEvent('open-chat', { detail: { dormId: Number(room.dorm_id) } }));
    }
    const btn = document.getElementById('open-chat-widget-btn');
    if (btn) {
      btn.click();
    }
  };

  useEffect(() => {
    async function fetchRoom() {
      try {
        const res = await fetch(`/api/rooms/${roomId}`);
        const data = await res.json();
        if (data.success) setRoom(data.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    }
    fetchRoom();
  }, [roomId]);

  const isAvailable = room?.status?.toLowerCase() === 'available' || room?.status === 'ว่าง' || room?.display_status === 'Available';
  const isMovingOut = room?.status === 'MovingOut' || room?.status === 'Moving Out' || room?.status === 'กำลังจะย้ายออก' || room?.display_status === 'MovingOut' || Boolean(room?.move_out_date);
  const isRoomAvailable = isAvailable || isMovingOut;

  useEffect(() => {
    if (sessionStatus === 'authenticated' && session?.user) {
      setBookingData((prev) => ({
        ...prev,
        name: prev.name && prev.name !== 'guest' ? prev.name : ((session.user?.name && session.user?.name !== 'guest') ? session.user.name : ''),
        email: prev.email || session.user?.email || '',
      }));
    }
  }, [sessionStatus, session]);

  useEffect(() => {
    if (sessionStatus === 'unauthenticated' && step > 1) {
      router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
    }
  }, [step, sessionStatus, router]);

  // Fetch saved progress on mount (only if room is available)
  useEffect(() => {
    async function fetchProgress() {
      if (sessionStatus === 'authenticated' && session?.user?.email && roomId && room) {
        if (!isRoomAvailable) {
          setStep(1);
          return;
        }
        try {
          const res = await fetch(`/api/booking/progress?roomId=${roomId}`);
          const data = await res.json();
          if (data.success && data.data) {
            if (data.data.current_step > 2) {
              setStep(data.data.current_step);
            } else {
              setStep(1);
            }
            setBookingData(data.data.booking_data);
          }
        } catch (e) {
          console.error('[Fetch Progress Error]', e);
        }
      }
    }
    fetchProgress();
  }, [sessionStatus, session, roomId, room, isRoomAvailable]);

  // Save progress whenever step or data changes
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (sessionStatus === 'authenticated' && step > 1 && step < 5 && roomId) {
        try {
          await fetch('/api/booking/progress', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: parseInt(roomId),
              currentStep: step,
              bookingData
            })
          });
        } catch (e) {
          console.error('[Save Progress Error]', e);
        }
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [step, bookingData, sessionStatus, roomId]);

  // Fetch QR code when reaching Step 4 (Payment)
  useEffect(() => {
    async function fetchQr() {
      if (step === 4 && room) {
        setQrLoading(true);
        try {
          const isTestRoom = (room.room_number || '').toUpperCase() === 'T01';
          const depositAmount = isTestRoom ? 1 : 1000; // T01 = 1 บาท สำหรับทดสอบการโอน
          const res = await fetch(`/api/booking/qr?roomId=${roomId}&dormId=${room.dorm_id}&amount=${depositAmount}`);
          const data = await res.json();
          if (data.success) {
            setQrData(data);
          } else {
            console.error('QR fetch error:', data.message);
          }
        } catch (e) {
          console.error('[Fetch QR Error]', e);
        } finally {
          setQrLoading(false);
        }
      }
    }
    fetchQr();
  }, [step, room, roomId]);

  // Camera controls for ID Card Scanner
  const startCamera = async (mode: 'environment' | 'user' = facingMode) => {
    setCameraError(null);
    setCameraActive(true);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('เบราว์เซอร์ไม่รองรับ WebRTC กล้องสด กรุณาใช้ปุ่ม "ถ่ายรูปด้วยกล้องมือถือ"');
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: mode,
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        videoRef.current.muted = true;
        await videoRef.current.play().catch(() => {});
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setCameraError('ไม่สามารถเปิดกล้องสดได้: ' + (err.message || 'กรุณาอนุญาตการเข้าถึงกล้อง หรือใช้ปุ่มถ่ายรูปด้วยกล้องมือถือ/อัปโหลดไฟล์'));
    }
  };

  // Ensure stream is attached when video element mounts
  useEffect(() => {
    if (cameraActive && streamRef.current && videoRef.current) {
      const videoEl = videoRef.current;
      videoEl.srcObject = streamRef.current;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.setAttribute('webkit-playsinline', 'true');
      videoEl.muted = true;
      videoEl.play().catch((err) => console.warn('Video play error:', err));
    }
  }, [cameraActive]);

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  };

  const toggleCameraFacing = async () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    if (cameraActive) {
      await startCamera(nextMode);
    }
  };

  const optimizeImageForOcr = (dataUrl: string, maxDim = 1280): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width <= maxDim && height <= maxDim) {
          // Re-encode through canvas anyway to ensure standard JPEG under 500KB and clean orientation
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', 0.85));
            return;
          }
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
        if (ctx) {
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } else {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;
    
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, 0, 0, width, height);
    const base64Data = canvas.toDataURL('image/jpeg', 0.88);
    stopCamera();

    // Immediately save image to bookingData so image is never lost
    setBookingData((prev) => ({ ...prev, id_card_image: base64Data }));

    const optimized = await optimizeImageForOcr(base64Data);
    setPendingOcrImage(optimized);
    setIsPdpaModalOpen(true);
  };

  // Google Gemini Vision AI OCR Processor
  const processIdImage = async (base64Data: string) => {
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
    setOcrStats(null);
    setOcrErrorMsg(null);

    // Save image to state
    setBookingData((prev) => ({
      ...prev,
      id_card_image: base64Data,
    }));

    const t0 = Date.now();

    try {
      const res = await fetch('/api/booking/ocr-id', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: base64Data }),
      });

      const ocrJson = await res.json();
      const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);

      if (ocrJson.success && ocrJson.data) {
        const d = ocrJson.data;
        const addrParts = d.address_parts || {};
        
        // Extract extracted name cleanly (prioritizing full_name_th)
        const extractedName = d.full_name_th || (d.first_name_th ? `${d.title_th ? d.title_th + ' ' : ''}${d.first_name_th} ${d.last_name_th || ''}`.trim() : '');

        setBookingData((prev) => ({
          ...prev,
          name: extractedName || (prev.name === 'guest' ? '' : prev.name),
          id_card_number: d.id_card_number || prev.id_card_number,
          id_card_address: d.address || prev.id_card_address,
          id_card_image: base64Data,
          houseNo: addrParts.houseNo || prev.houseNo,
          village: addrParts.village || prev.village,
          road: addrParts.road || prev.road,
          subdistrict: addrParts.subdistrict || prev.subdistrict,
          district: addrParts.district || prev.district,
          province: addrParts.province || prev.province,
        }));
        setOcrSuccessMsg(`✓ อ่านข้อมูลบัตรสำเร็จ: ${extractedName || d.id_card_number || ''}`);
        setOcrStats(`อ่านสำเร็จใน ${elapsedSec} วินาที (Google Gemini AI Vision)`);
      } else {
        const errMsg = ocrJson.message || 'ไม่สามารถอ่านตัวอักษรบนบัตรได้ชัดเจน กรุณาตรวจสอบหรือกรอกเพิ่มเติมในช่องด้านล่าง';
        setOcrErrorMsg(errMsg);
      }
    } catch (err: any) {
      console.error('OCR Error:', err);
      setOcrErrorMsg('เกิดข้อผิดพลาดในการเชื่อมต่อ AI OCR: ' + (err.message || 'กรุณาลองใหม่อีกครั้ง'));
    } finally {
      setIsOcrProcessing(false);
    }
  };

  // ID Card Smart OCR Handler
  const handleIdCardUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setOcrErrorMsg(null);
    setOcrSuccessMsg(null);

    const reader = new FileReader();
    reader.onload = async () => {
      const rawBase64 = reader.result as string;
      let imgToProcess = rawBase64;
      try {
        imgToProcess = await optimizeImageForOcr(rawBase64);
      } catch (err: any) {
        console.warn('Canvas optimization skipped/failed, using raw image:', err);
        imgToProcess = rawBase64;
      }
      setBookingData((prev) => ({ ...prev, id_card_image: imgToProcess }));
      setPendingOcrImage(imgToProcess);
      setIsPdpaModalOpen(true);
    };
    reader.onerror = () => {
      setOcrErrorMsg('ไม่สามารถอ่านไฟล์ภาพจากอุปกรณ์ได้ กรุณาลองใหม่อีกครั้ง');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleDemoIdCard = () => {
    setIsOcrProcessing(true);
    setOcrSuccessMsg(null);
    setOcrStats(null);
    setTimeout(() => {
      setBookingData((prev) => ({
        ...prev,
        name: 'นายกฤษกร บวรนันทกุล',
        phone: prev.phone || '089-123-4567',
        parent_phone: prev.parent_phone || '081-987-6543',
        id_card_number: '1-5601-00123-45-6',
        id_card_address: '224/12 หมู่ 2 ต.แม่กา อ.เมือง จ.พะเยา 56000',
        houseNo: '224/12',
        village: '2',
        road: '-',
        subdistrict: 'แม่กา',
        district: 'เมือง',
        province: 'พะเยา',
        id_card_image: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&q=80',
      }));
      setIsOcrProcessing(false);
      setOcrSuccessMsg('✓ นำเข้าข้อมูลตัวอย่างสำเร็จ (นายกฤษกร บวรนันทกุล, 1-5601-00123-45-6)');
      setOcrStats('จำลองสำเร็จใน 0.4 วินาที');
    }, 400);
  };

  // Download Word Contract
  const handleDownloadDocx = async () => {
    setDownloadingDocx(true);
    try {
      const contractPayload = {
        room_number: room?.room_number,
        floor: room?.floor,
        price: room?.price,
        monthly_rent: room?.price,
        deposit_amount: 1000,
        tenant_name: bookingData.name,
        tenant_phone: bookingData.phone,
        parent_phone: bookingData.parent_phone,
        tenant_email: bookingData.email,
        id_card_number: bookingData.id_card_number,
        tenant_address: bookingData.id_card_address,
        start_date: bookingData.start_date,
        end_date: bookingData.end_date,
        created_at: new Date().toISOString()
      };
      const res = await fetch('/api/contracts/export-docx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contract: contractPayload }),
      });
      if (!res.ok) throw new Error('Export DOCX failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `สัญญาเช่า_หอพักเกษร_ห้อง${room?.room_number}_${(bookingData.name || '').replace(/\s+/g, '_')}.docx`;
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

  // Cancel booking in progress and reset
  const handleCancelCurrentBooking = async () => {
    if (!confirm('ต้องการยกเลิกการทำรายการจองห้องนี้หรือไม่?')) return;
    try {
      if (sessionStatus === 'authenticated' && roomId) {
        await fetch('/api/booking/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: parseInt(roomId),
            currentStep: 1,
            bookingData: {}
          })
        });
      }
    } catch (e) {
      console.error(e);
    }
    setStep(1);
    setSlipData(null);
  };

  // Handle Slip Upload
  const handleSlipUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('ไฟล์มีขนาดใหญ่เกินไป (จำกัดไม่เกิน 5MB)');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setSlipData(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Final Submit with Slip, ID Card OCR, & Contract Details
  const handleFinalSubmit = async () => {
    if (!slipData) {
      alert('กรุณาแนบรูปภาพสลิปการโอนเงินก่อนส่งคำขอจอง');
      return;
    }

    setIsProcessing(true);
    try {
      const res = await fetch('/api/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomId: parseInt(roomId),
          signature: 'CONFIRMED_E_CONTRACT',
          startDate: bookingData.start_date,
          endDate: bookingData.end_date,
          depositAmount: totalDeposit, // ค่าจองห้องพักเพื่อยืนยันสิทธิ์ (T01 = 1 บาท, ห้องทั่วไป = 1,000 บาท)
          monthlyRent: Number(room.price),
          tenantName: bookingData.name,
          phone: bookingData.phone,
          parentPhone: bookingData.parent_phone,
          idCardNumber: bookingData.id_card_number,
          tenantAddress: bookingData.id_card_address,
          idCardImage: bookingData.id_card_image,
          slipUrl: slipData
        })
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.message);

      // Clear booking progress
      try {
        await fetch('/api/booking/progress', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roomId: parseInt(roomId) })
        });
      } catch (pe) {
        console.warn('Clear progress error:', pe);
      }

      if (data.contractId) {
        setCreatedContractId(data.contractId);
      }
      setStep(5);
    } catch (e: any) {
      console.error(e);
      alert(e.message || 'เกิดข้อผิดพลาดในการส่งคำขอจอง');
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary" />
      </div>
    );
  }

  if (!room) {
    return (
      <div className="p-8 max-w-4xl mx-auto text-center space-y-4">
        <h2 className="text-xl font-bold text-foreground">ไม่พบข้อมูลห้องพัก</h2>
        <Link href="/" className="px-6 py-2 bg-primary text-white rounded-xl text-xs font-bold inline-block">
          กลับไปหน้าแนะนำหอเกษร 2
        </Link>
      </div>
    );
  }

  const images = getImagesArray(room.images || room.image_url);
  const isTestRoom = (room.room_number || '').toUpperCase() === 'T01';
  const totalDeposit = isTestRoom ? 1 : 1000; // ค่าจองห้องพักเพื่อยืนยันสิทธิ์ (T01 = 1 บาท, ห้องทั่วไป = 1,000 บาท)
  const fullDeposit = isTestRoom ? 20 : (room.deposit_amount ? Number(room.deposit_amount) : 3000);
  const securityDeposit = Math.max(0, fullDeposit - totalDeposit); // เงินประกันส่วนที่เหลือชำระวันทำสัญญา
  const contractStartDate = new Date().toLocaleDateString('th-TH');
  const contractEndDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toLocaleDateString('th-TH');

  return (
    <div className="min-h-screen bg-background text-foreground pb-20">
      {/* Top Bar */}
      <div className="sticky top-0 z-30 bg-background/80 backdrop-blur-md border-b border-border">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-xs font-bold text-muted-foreground hover:text-foreground flex items-center gap-2 transition-colors">
            ← กลับไปหน้าแนะนำหอเกษร 2
          </Link>
          <div className="flex items-center gap-2 text-xs font-bold">
            <span className="text-primary">{room.dorm_name || 'หอพักเกษร 2'}</span>
            <span className="text-muted-foreground">•</span>
            <span>ห้อง {room.room_number}</span>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 pt-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
          
          {/* Left Column: Room Details & Images */}
          <div className="lg:col-span-7 space-y-8">
            
            {/* Image Gallery */}
            <div className="space-y-4">
              <div className="relative aspect-video rounded-[2.5rem] overflow-hidden bg-muted border border-border shadow-lg">
                <Image
                  src={images[activeImageIndex] || '/images/kesorn/room-bed.jpg'}
                  alt={`Room ${room.room_number}`}
                  fill
                  className="object-cover"
                  priority
                />
                <div className="absolute top-4 left-4 px-4 py-1.5 rounded-full bg-black/60 backdrop-blur-md text-white text-xs font-bold">
                  {room.room_type || 'Standard Room'}
                </div>
                <div className="absolute top-4 right-4 px-4 py-1.5 rounded-full bg-primary text-white text-xs font-black shadow-lg">
                  ฿{Number(room.price).toLocaleString()} / เดือน
                </div>
              </div>

              {images.length > 1 && (
                <div className="flex gap-3 overflow-x-auto pb-2">
                  {images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      onClick={() => setActiveImageIndex(idx)}
                      className={`relative w-20 h-16 rounded-2xl overflow-hidden border-2 transition-all shrink-0 ${
                        activeImageIndex === idx ? 'border-primary scale-105 shadow-md' : 'border-transparent opacity-60 hover:opacity-100'
                      }`}
                    >
                      <Image src={img} alt="Thumbnail" fill className="object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Room Info */}
            <div className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-6 border-b border-border">
                <div>
                  <h1 className="text-3xl font-black tracking-tight">ห้อง {room.room_number}</h1>
                  <p className="text-sm text-muted-foreground font-medium mt-1">
                    {room.dorm_name || 'SmartDom Dormitory'} • ชั้น {room.floor || 1}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-4 py-1.5 rounded-full text-xs font-bold ${
                    isRoomAvailable ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400'
                  }`}>
                    {isMovingOut ? '🟡 ว่างเร็วๆ นี้ (จองล่วงหน้าได้)' : isAvailable ? '🟢 ห้องว่างพร้อมเข้าอยู่' : '🔴 ไม่ว่าง'}
                  </span>
                </div>
              </div>

              {/* Specs */}
              <div className="grid grid-cols-3 gap-4 text-center py-2">
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ชั้น</span>
                  <span className="text-xl font-black">{room.floor || 1}</span>
                </div>
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ประเภท</span>
                  <span className="text-base font-black truncate">{room.room_type || 'Standard'}</span>
                </div>
                <div className="p-4 bg-muted/40 rounded-2xl border border-border/50">
                  <span className="block text-[10px] uppercase font-bold text-muted-foreground tracking-wider mb-1">ค่าเช่า</span>
                  <span className="text-xl font-black text-primary">฿{Number(room.price).toLocaleString()}</span>
                </div>
              </div>

              {/* Amenities */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">สิ่งอำนวยความสะดวกในห้องพัก</h3>
                <div className="flex flex-wrap gap-2">
                  {['เครื่องปรับอากาศ', 'เครื่องทำน้ำอุ่น', 'เตียงนอน & ฟูก', 'โต๊ะเขียนหนังสือ', 'ตู้เสื้อผ้า', 'ระเบียงส่วนตัว', 'Free Wi-Fi'].map((amenity, i) => (
                    <span key={i} className="px-3.5 py-1.5 bg-secondary text-secondary-foreground text-xs font-bold rounded-xl border border-border/60">
                      ✓ {amenity}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* 🏢 Dormitory Overview, Utility Rates, and Rules */}
            <div className="bg-card border border-border rounded-[2.5rem] p-8 space-y-6 shadow-sm">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-border">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ข้อมูลหอพัก & เงื่อนไขสัญญา</span>
                  <h2 className="text-2xl font-black tracking-tight">{room.dorm_name || 'ข้อมูลหอพัก'}</h2>
                  {room.dorm_address && (
                    <p className="text-xs text-muted-foreground mt-0.5">📍 {room.dorm_address}</p>
                  )}
                </div>

                {/* Quick inquiry buttons */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleOpenChat}
                    className="px-4 py-2.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  >
                    <span>💬</span>
                    <span>สอบถามหอพัก</span>
                  </button>
                  {room.dorm_phone && (
                    <a
                      href={`tel:${room.dorm_phone}`}
                      className="px-4 py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-xl text-xs font-black flex items-center gap-1.5 transition-all hover:scale-105 active:scale-95"
                    >
                      <span>📞</span>
                      <span>โทรติดต่อ</span>
                    </a>
                  )}
                </div>
              </div>

              {/* Utility Rates (ค่าน้ำ-ค่าไฟ) */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">⚡ อัตราค่าน้ำ / ค่าไฟ</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center text-xl shrink-0">
                      💧
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">ค่าน้ำประปา</span>
                      <span className="text-base font-black text-cyan-500">
                        {Number(room.water_rate) === 0 ? 'ฟรี (รวมในค่าห้อง)' : `฿${Number(room.water_rate)} / เดือน`}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl shrink-0">
                      ⚡
                    </div>
                    <div>
                      <span className="text-[10px] uppercase font-bold text-muted-foreground block">ค่าไฟฟ้า</span>
                      <span className="text-lg font-black text-amber-500">
                        ฿{room.electricity_rate !== undefined && room.electricity_rate !== null ? Number(room.electricity_rate) : 7}{' '}
                        <span className="text-xs font-bold text-muted-foreground">/ ยูนิต</span>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Rules & Policies (กฎระเบียบและเงื่อนไข) */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">📋 กฎระเบียบและเงื่อนไขของหอพัก</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">{room.pet_friendly ? '🐾' : '🚫'}</span>
                    <div className="text-xs">
                      <span className="font-bold block">นโยบายสัตว์เลี้ยง</span>
                      <span className="text-muted-foreground text-[11px]">
                        {room.pet_friendly ? 'อนุญาตให้เลี้ยงสัตว์ได้ (Pet-Friendly)' : 'ห้ามเลี้ยงสัตว์เลี้ยงทุกชนิด'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">{room.has_parking ? '🚗' : '🛵'}</span>
                    <div className="text-xs">
                      <span className="font-bold block">ที่จอดรถ</span>
                      <span className="text-muted-foreground text-[11px]">
                        {room.has_parking ? 'มีที่จอดรถยนต์ และรถจักรยานยนต์' : 'มีเฉพาะที่จอดรถจักรยานยนต์'}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">🚭</span>
                    <div className="text-xs">
                      <span className="font-bold block">การสูบบุหรี่</span>
                      <span className="text-muted-foreground text-[11px]">ห้ามสูบบุหรี่ภายในห้องพักและพื้นที่ส่วนกลาง</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">🕒</span>
                    <div className="text-xs">
                      <span className="font-bold block">เวลาเข้า-ออก</span>
                      <span className="text-muted-foreground text-[11px]">เข้า-ออกได้ตลอด 24 ชม. (ระบบคีย์การ์ด/สแกน)</span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">📶</span>
                    <div className="text-xs">
                      <span className="font-bold block">อินเทอร์เน็ต</span>
                      <span className="text-muted-foreground text-[11px]">
                        ฟรี Wi-Fi (มีกล่องเราเตอร์แยกทุกห้อง)
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 rounded-xl bg-muted/40 border border-border flex items-center gap-3">
                    <span className="text-lg">📝</span>
                    <div className="text-xs">
                      <span className="font-bold block">การจองและเงินประกัน</span>
                      <span className="text-muted-foreground text-[11px]">
                        จองเพียง {totalDeposit.toLocaleString()} บาท (เงินประกันรวม {fullDeposit.toLocaleString()} บาท ชำระส่วนที่เหลือวันทำสัญญา คืนเมื่อสิ้นสุดสัญญา)
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Description from Dorm Profile */}
              {room.dorm_description && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">ℹ️ รายละเอียดเพิ่มเติมจากหอพัก</h3>
                  <p className="text-xs text-foreground/80 leading-relaxed bg-muted/30 p-4 rounded-2xl border border-border whitespace-pre-line">
                    {room.dorm_description}
                  </p>
                </div>
              )}

              {/* Dorm Facilities */}
              {room.dorm_facilities && (
                <div className="space-y-2 pt-2">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">✨ สิ่งอำนวยความสะดวกส่วนกลาง</h3>
                  <div className="flex flex-wrap gap-2">
                    {room.dorm_facilities.split(',').map((fac: string, idx: number) => {
                      const trimmed = fac.trim();
                      if (!trimmed) return null;
                      return (
                        <span key={idx} className="px-3 py-1 bg-secondary text-xs font-semibold rounded-lg border border-border">
                          {trimmed}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 📍 Pinned Map & Location */}
              <div className="pt-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                    <span>📍</span> พิกัดตำแหน่งหอพัก
                  </span>
                  <a
                    href={getGoogleMapsDirectUrl(room.dorm_map_url, room.dorm_address, room.dorm_name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-bold text-primary hover:underline"
                  >
                    เปิดใน Google Maps ↗
                  </a>
                </div>
                <div className="w-full h-48 rounded-2xl overflow-hidden border border-border shadow-inner relative bg-muted/40">
                  <iframe
                    title={`แผนที่ ${room.dorm_name}`}
                    src={getGoogleMapsEmbedUrl(room.dorm_map_url, room.dorm_address, room.dorm_name)}
                    className="w-full h-full border-0"
                    loading="lazy"
                    allowFullScreen
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                </div>
              </div>
            </div>

          </div>

          {/* Right Column: Step-by-Step Booking Workflow */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Step 1: Summary & Calculation (1 Month Deposit Only) */}
            {step === 1 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 1 จาก 4</span>
                  <h2 className="text-2xl font-black tracking-tight">สรุปค่าใช้จ่ายการจองห้องพัก</h2>
                </div>

                <div className="space-y-4 bg-secondary/50 p-6 rounded-3xl border border-border">
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="text-muted-foreground block">ค่าเช่ารายเดือน</span>
                      <span className="text-[11px] text-cyan-500 font-semibold">
                        ค่าน้ำ ฿{Number(room.water_rate || 100).toLocaleString()}/ด. • ส่วนกลาง ฿{Number(room.common_fee || 150).toLocaleString()}/ด.
                      </span>
                    </div>
                    <span className="font-bold">฿{Number(room.price).toLocaleString()} / เดือน</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">อัตราค่าไฟฟ้า</span>
                    <span className="font-bold text-amber-500">฿{room.electricity_rate || 7} / ยูนิต</span>
                  </div>

                  <div className="flex justify-between items-center text-sm pt-2 border-t border-border/50">
                    <div>
                      <span className="font-semibold block">เงินประกันความเสียหาย</span>
                      <span className="text-[11px] text-muted-foreground">ชำระวันทำสัญญา/ย้ายเข้า (คืนเมื่อครบสัญญา)</span>
                    </div>
                    <span className="font-bold text-muted-foreground">฿{securityDeposit.toLocaleString()}</span>
                  </div>

                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold block text-primary">ค่าจองห้องพักล่วงหน้า</span>
                      <span className="text-[11px] text-emerald-500">ชำระวันนี้เพื่อล็อกสิทธิ์ห้องพัก</span>
                    </div>
                    <span className="font-bold text-primary">฿{totalDeposit.toLocaleString()}</span>
                  </div>

                  <div className="border-t border-border pt-4 flex justify-between items-center">
                    <div>
                      <span className="font-bold text-sm block">ยอดชำระเงินจองวันนี้</span>
                      <span className="text-[11px] text-muted-foreground">(เงินจองเพื่อยืนยันสิทธิ์)</span>
                    </div>
                    <span className="text-2xl font-black text-primary">฿{totalDeposit.toLocaleString()}</span>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setShowSimulator(true)}
                    className="w-full py-3.5 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-2xl text-xs transition-all border border-border"
                  >
                    🧮 จำลองคำนวณค่าสัญญาเช่า
                  </button>

                  {(session?.user as any)?.role === 'tenant' ? (
                    <div className="p-6 bg-primary/5 rounded-3xl border border-primary/20 text-center space-y-3">
                      <p className="text-xs font-bold text-primary">คุณมีสัญญาเช่าในระบบแล้ว</p>
                      <Link href="/tenant" className="inline-block px-6 py-2.5 bg-primary text-white rounded-xl text-xs font-bold shadow-lg">
                        ไปที่หน้าแดชบอร์ด
                      </Link>
                    </div>
                  ) : isRoomAvailable ? (
                    <button
                      onClick={() => {
                        if (!session) {
                          router.push(`/signin?callbackUrl=${encodeURIComponent(window.location.pathname)}`);
                          return;
                        }
                        setStep(2);
                      }}
                      className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 cursor-pointer"
                    >
                      {isMovingOut ? 'ตกลงเช่า และเริ่มจองล่วงหน้า →' : 'ตกลงเช่า และเริ่มจองห้อง →'}
                    </button>
                  ) : (
                    <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-3xl text-center space-y-3">
                      <div className="w-10 h-10 bg-red-500/20 text-red-400 rounded-full flex items-center justify-center text-lg mx-auto">
                        🔒
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-400">ห้องพักนี้มีผู้จองแล้ว / ไม่ว่างในขณะนี้</p>
                        <p className="text-[11px] text-muted-foreground mt-1">
                          คุณสามารถตรวจสอบสถานะการจองของคุณ หรือเลือกดูห้องพักอื่นที่ยังว่างอยู่ได้ครับ
                        </p>
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <Link
                          href="/explore/booking-status"
                          className="w-full py-3 bg-primary hover:bg-primary/90 text-white font-bold rounded-xl text-xs transition-all shadow-md active:scale-95"
                        >
                          📋 ตรวจสอบสถานะการจองของฉัน
                        </Link>
                        <Link
                          href="/"
                          className="w-full py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-semibold rounded-xl text-xs transition-all border border-border"
                        >
                          🔍 ดูห้องพักอื่นที่ว่าง
                        </Link>
                      </div>
                    </div>
                  )}

                  {/* 💬 Inquire Dormitory & Call Action */}
                  <div className="pt-3 border-t border-border/60 space-y-2">
                    <p className="text-[11px] font-bold text-muted-foreground text-center">มีคำถามหรือต้องการดูห้องจริง?</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleOpenChat}
                        className="flex-1 py-3.5 px-4 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 rounded-2xl font-black text-xs flex items-center justify-center gap-2 transition-all hover:scale-[1.01] active:scale-95 cursor-pointer shadow-sm"
                      >
                        <span>💬</span>
                        <span>สอบถามหอพัก / แชท</span>
                      </button>
                      {room.dorm_phone && (
                        <a
                          href={`tel:${room.dorm_phone}`}
                          className="py-3.5 px-4 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500 border border-emerald-500/20 rounded-2xl font-black text-xs flex items-center justify-center gap-1.5 transition-all hover:scale-[1.01] active:scale-95 shrink-0"
                          title={`โทรสอบถาม: ${room.dorm_phone}`}
                        >
                          <span>📞</span>
                          <span className="hidden sm:inline">โทร {room.dorm_phone}</span>
                          <span className="sm:hidden">โทร</span>
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2: Tenant Contact Info & Lease Period */}
            {step === 2 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 2 จาก 4</span>
                  <h2 className="text-2xl font-black tracking-tight">ข้อมูลผู้จองและระยะเวลาเข้าพัก</h2>
                  <p className="text-xs text-muted-foreground">ข้อมูลจะถูกนำไปใช้กรอกลงในแบบฟอร์มสัญญาเช่าหอพักเกษร 2 อัตโนมัติ</p>
                </div>

                <div className="space-y-4">
                  <div className="p-3.5 bg-primary/10 border border-primary/20 rounded-2xl text-xs text-primary flex items-center gap-2.5">
                    <span className="text-base">🪪</span>
                    <span><strong>ชื่อ-นามสกุล และเลขประจำตัวประชาชน:</strong> จะถูกอ่านและกรอกจากบัตรประชาชนอัตโนมัติในขั้นตอนถัดไป (AI OCR)</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        เบอร์โทรศัพท์ผู้เช่า <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        className="w-full px-5 py-3.5 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                        placeholder="08X-XXX-XXXX"
                        value={bookingData.phone}
                        onChange={(e) => setBookingData({ ...bookingData, phone: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        เบอร์โทรผู้ปกครอง <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="tel"
                        className="w-full px-5 py-3.5 rounded-2xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                        placeholder="08X-XXX-XXXX (ผู้ปกครอง)"
                        value={bookingData.parent_phone}
                        onChange={(e) => setBookingData({ ...bookingData, parent_phone: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Lease Period (ระยะเวลาสัญญา) */}
                  <div className="p-4 bg-secondary/50 rounded-2xl border border-border space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <span>📅</span> ระยะเวลาตามสัญญาเช่า
                      </label>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => {
                            const start = new Date(bookingData.start_date || new Date());
                            const end = new Date(start);
                            end.setFullYear(end.getFullYear() + 1);
                            setBookingData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
                          }}
                          className="px-2.5 py-1 bg-primary/10 hover:bg-primary/20 text-primary rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          สัญญา 1 ปี (12 เดือน)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const start = new Date(bookingData.start_date || new Date());
                            const end = new Date(start);
                            end.setMonth(end.getMonth() + 6);
                            setBookingData(prev => ({ ...prev, end_date: end.toISOString().split('T')[0] }));
                          }}
                          className="px-2.5 py-1 bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground rounded-lg text-[10px] font-bold transition-colors cursor-pointer"
                        >
                          6 เดือน
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground block">วัน/เดือน ที่เริ่มเข้าอยู่</span>
                        <input
                          type="date"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                          value={bookingData.start_date}
                          onChange={(e) => setBookingData({ ...bookingData, start_date: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[11px] font-semibold text-muted-foreground block">วัน/เดือน สิ้นสุดสัญญา</span>
                        <input
                          type="date"
                          className="w-full px-3.5 py-2.5 rounded-xl bg-background border border-border focus:border-primary outline-none font-bold text-xs"
                          value={bookingData.end_date}
                          onChange={(e) => setBookingData({ ...bookingData, end_date: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setStep(3)}
                    disabled={!bookingData.phone || !bookingData.parent_phone}
                    className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    ถัดไป: สแกนบัตรประชาชน (AI OCR) →
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(1)}
                      className="flex-1 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ← ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCancelCurrentBooking}
                      className="py-2.5 px-3 text-xs font-bold text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิกการจอง
                    </button>
                  </div>

                  <div className="pt-2 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
                    <span>มีข้อสงสัยก่อนทำสัญญา?</span>
                    <button
                      type="button"
                      onClick={handleOpenChat}
                      className="text-primary font-bold hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>💬</span>
                      <span>แชทสอบถามหอพัก</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Smart Thai ID Card OCR & Contract Review */}
            {step === 3 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-primary">ขั้นตอนที่ 3 จาก 4</span>
                  <h2 className="text-2xl font-black tracking-tight">สแกนบัตรประชาชนและข้อมูลสัญญา</h2>
                  <p className="text-xs text-muted-foreground">
                    ระบบ AI OCR (Google Gemini Vision AI) จะอ่านข้อมูลบัตรประชาชนและนำไปกรอกลงในแบบฟอร์มสัญญาเช่าหอพักเกษรฉบับจริงให้อัตโนมัติ
                  </p>
                </div>

                {/* Digital ID (D.DOPA ThaID OAuth 2.0) Plug-in */}
                <ThaIdDigitalIdButton
                  onVerified={(d) => {
                    const addrParts = d.address_parts || {};
                    setBookingData((prev) => ({
                      ...prev,
                      name: d.full_name_th || prev.name,
                      id_card_number: '',
                      id_card_address: d.address || prev.id_card_address,
                      houseNo: addrParts.houseNo || prev.houseNo,
                      village: addrParts.village || prev.village,
                      road: addrParts.road || prev.road,
                      subdistrict: addrParts.subdistrict || prev.subdistrict,
                      district: addrParts.district || prev.district,
                      province: addrParts.province || prev.province,
                    }));
                    setOcrSuccessMsg(`✓ ยืนยันตัวตนผ่านแอป ThaID สำเร็จ: ${d.full_name_th} (${d.ial_level})`);
                    setOcrStats(`D.DOPA OpenID Connect • KYC Ref: ${d.sub_pid_hash}`);
                  }}
                />

                {/* ID Card Scanner Banner */}
                <div className="p-5 bg-gradient-to-br from-indigo-500/10 via-purple-500/10 to-primary/10 border border-primary/20 rounded-3xl space-y-4">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🪪</span>
                      <div>
                        <span className="text-xs font-black text-primary block">
                          AI Smart OCR บัตรประชาชน (Google Gemini AI Vision)
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          สแกนอ่านข้อมูลแม่นยำ • กรอกสัญญาอัตโนมัติ
                        </span>
                      </div>
                    </div>
                  </div>

                  {ocrSuccessMsg && (
                    <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-2xl text-emerald-400 text-xs font-bold flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <span className="text-base">✓</span>
                        <span>{ocrSuccessMsg}</span>
                      </div>
                      {ocrStats && (
                        <span className="text-[10px] bg-emerald-500/20 px-2 py-0.5 rounded-full text-emerald-300 font-mono">
                          {ocrStats}
                        </span>
                      )}
                    </div>
                  )}

                  {ocrErrorMsg && (
                    <div className="p-3.5 bg-rose-500/15 border border-rose-500/30 rounded-2xl text-rose-400 text-xs font-bold flex items-center justify-between animate-in fade-in">
                      <div className="flex items-center gap-2">
                        <span className="text-base">⚠️</span>
                        <span>{ocrErrorMsg}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setOcrErrorMsg(null)}
                        className="text-[10px] text-muted-foreground hover:text-white px-2 py-1 bg-white/10 rounded-lg cursor-pointer"
                      >
                        ปิด
                      </button>
                    </div>
                  )}

                  {/* Camera Scanner View */}
                  {cameraActive && (
                    <div className="relative rounded-2xl overflow-hidden bg-black border-2 border-primary/40 shadow-2xl space-y-3 p-3">
                      <div className="relative aspect-[16/10] max-h-[360px] mx-auto rounded-xl overflow-hidden flex items-center justify-center bg-slate-950">
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          muted
                          className="w-full h-full object-cover"
                        />
                        {/* ID Card Overlay guide */}
                        <div className="absolute inset-4 sm:inset-8 border-2 border-dashed border-cyan-400/80 rounded-2xl pointer-events-none flex flex-col justify-between p-3">
                          <span className="text-[10px] font-bold text-cyan-300 bg-black/60 px-2 py-0.5 rounded self-start">
                            วางบัตรประชาชนให้อยู่ในกรอบ
                          </span>
                          <span className="text-[10px] text-cyan-300/80 bg-black/60 px-2 py-0.5 rounded self-end">
                            ให้เห็นตัวอักษรและรูปถ่ายชัดเจน
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-center gap-3 pt-1">
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="px-6 py-2.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/25 active:scale-95 cursor-pointer"
                        >
                          <span>📸</span> ถ่ายภาพบัตรทันที
                        </button>
                        <button
                          type="button"
                          onClick={toggleCameraFacing}
                          className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold transition-all border border-slate-700 cursor-pointer"
                          title="สลับกล้องหน้า/หลัง"
                        >
                          🔄
                        </button>
                        <button
                          type="button"
                          onClick={stopCamera}
                          className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white/80 hover:text-white rounded-xl text-xs font-bold transition-all cursor-pointer"
                        >
                          ยกเลิก
                        </button>
                      </div>
                    </div>
                  )}

                  {cameraError && (
                    <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-400 text-xs">
                      {cameraError}
                    </div>
                  )}

                  {/* Processing Indicator */}
                  {isOcrProcessing && (
                    <div className="py-8 flex flex-col items-center justify-center gap-3 text-primary bg-primary/5 rounded-2xl border border-primary/20">
                      <div className="relative">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                        <span className="absolute inset-0 flex items-center justify-center text-sm">🤖</span>
                      </div>
                      <div className="text-center space-y-1">
                        <span className="text-xs font-black animate-pulse block">
                          Google Gemini AI Vision กำลังอ่านข้อมูลบัตรประชาชน...
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          กำลังดึงชื่อ-นามสกุล และที่อยู่ตามทะเบียนบ้านเพื่อกรอกลงสัญญาอัตโนมัติ (ไม่เก็บเลขบัตร 13 หลัก)
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Mandatory PDPA Checkbox before scanning/uploading ID card */}
                  <div className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 space-y-2.5">
                    <label className="flex items-start gap-3 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        id="mandatory-pdpa-consent"
                        checked={pdpaConsent}
                        onChange={(e) => setPdpaConsent(e.target.checked)}
                        className="mt-1 w-4 h-4 rounded border-blue-400 text-primary focus:ring-primary cursor-pointer shrink-0"
                      />
                      <div className="space-y-1.5">
                        <span className="text-xs font-bold text-foreground leading-tight block">
                          ยินยอมให้ประมวลผลข้อมูลส่วนบุคคลและภาพถ่ายบัตรประชาชน (PDPA & AI Data Privacy) <span className="text-rose-500">*</span>
                        </span>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">
                          ข้าพเจ้ายินยอมให้ส่งภาพถ่ายบัตรประชาชนเพื่อประมวลผลด้วย <strong>Google Gemini AI Vision API</strong> สำหรับการอ่านตัวอักษรและกรอกสัญญาเช่าหอพักเกษร 2 อัตโนมัติ
                        </p>
                        <div className="p-2.5 bg-background/60 rounded-xl border border-border/80 text-[10px] text-muted-foreground space-y-1 leading-relaxed">
                          <p className="font-bold text-foreground">🛡️ มาตรฐานความปลอดภัยข้อมูลของ Google Gemini API:</p>
                          <p>• <strong>ไม่นำข้อมูลไปเทรน AI:</strong> ข้อมูลภาพและตัวอักษรจะ<strong>ไม่ถูกนำไปใช้ฝึกฝน (Train AI)</strong> โมเดลสาธารณะของ Google แต่อย่างใด</p>
                          <p>• <strong>เข้ารหัสระดับสูง:</strong> ส่งข้อมูลผ่านการเข้ารหัส HTTPS/TLS ไปยัง Google Cloud เพื่อแปลงข้อความแล้วส่งกลับมายังระบบหอพักทันที</p>
                          <p>• <strong>ไม่เผยแพร่ต่อบุคคลภายนอก:</strong> นำข้อมูลไปใช้เพื่อตรวจสอบและสร้างเอกสารสัญญาเช่าฉบับจริงเท่านั้น</p>
                        </div>
                      </div>
                    </label>
                  </div>

                  {/* Upload & Camera Actions when not active and not processing */}
                  {!cameraActive && !isOcrProcessing && (
                    <div className="space-y-3">
                      {/* If Image Already Uploaded: Preview Box */}
                      {bookingData.id_card_image ? (
                        <div className="p-4 bg-background/80 rounded-2xl border border-primary/30 flex items-center justify-between gap-4 flex-wrap">
                          <div className="flex items-center gap-3">
                            <div className="w-16 h-12 rounded-lg overflow-hidden border border-border bg-slate-900 flex-shrink-0">
                              <img
                                src={bookingData.id_card_image}
                                alt="รูปบัตรประชาชน"
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div>
                              <span className="text-xs font-bold text-foreground block">
                                บันทึกรูปบัตรประชาชนเรียบร้อยแล้ว
                              </span>
                              <span className="text-[10px] text-emerald-400 font-bold">
                                ✓ ข้อมูลถูกนำไปกรอกลงในแบบฟอร์มสัญญาเรียบร้อย
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                if (!pdpaConsent) {
                                  alert('กรุณากดยินยอม PDPA ด้านบนก่อนเปิดกล้อง');
                                  return;
                                }
                                startCamera();
                              }}
                              className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 text-foreground rounded-xl text-xs font-bold border border-border cursor-pointer"
                            >
                              📷 ถ่ายกล้องสด
                            </button>
                            <label className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              pdpaConsent
                                ? 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border-emerald-500/30 cursor-pointer'
                                : 'bg-muted/40 text-muted-foreground border-border opacity-50 cursor-not-allowed'
                            }`}>
                              📱 กล้องมือถือ
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                disabled={!pdpaConsent}
                                onChange={handleIdCardUpload}
                              />
                            </label>
                            <label className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${
                              pdpaConsent
                                ? 'bg-primary/10 hover:bg-primary/20 text-primary border-primary/20 cursor-pointer'
                                : 'bg-muted/40 text-muted-foreground border-border opacity-50 cursor-not-allowed'
                            }`}>
                              📁 อัปโหลดไฟล์
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={!pdpaConsent}
                                onChange={handleIdCardUpload}
                              />
                            </label>
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          {!pdpaConsent && (
                            <div className="mb-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-2 text-amber-400 text-xs font-semibold">
                              <span>🔒</span>
                              <span>กรุณากดทำเครื่องหมายยินยอม PDPA ด้านบนก่อน จึงจะสามารถเปิดกล้องหรืออัปโหลดรูปบัตรได้</span>
                            </div>
                          )}

                          <div className={`grid grid-cols-1 sm:grid-cols-3 gap-3 transition-opacity ${!pdpaConsent ? 'opacity-40 pointer-events-none' : ''}`}>
                            {/* Option 1: Live WebRTC Camera */}
                            <button
                              type="button"
                              disabled={!pdpaConsent}
                              onClick={() => startCamera()}
                              className="p-4 bg-primary/10 hover:bg-primary/20 border-2 border-primary/30 hover:border-primary rounded-2xl flex flex-col items-center justify-center gap-2 transition-all cursor-pointer group active:scale-98 disabled:cursor-not-allowed"
                            >
                              <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center text-lg shadow-md group-hover:scale-110 transition-transform">
                                📸
                              </div>
                              <span className="text-xs font-black text-foreground">เปิดกล้องสด (Live)</span>
                              <span className="text-[10px] text-muted-foreground text-center">
                                ส่องบัตรผ่านหน้าจอแบบเรียลไทม์
                              </span>
                            </button>

                            {/* Option 2: Mobile Native Camera */}
                            <label className={`p-4 bg-emerald-500/10 hover:bg-emerald-500/20 border-2 border-dashed border-emerald-500/30 hover:border-emerald-500/60 rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group active:scale-98 ${
                              pdpaConsent ? 'cursor-pointer' : 'cursor-not-allowed'
                            }`}>
                              <div className="w-10 h-10 rounded-2xl bg-emerald-500 text-slate-950 flex items-center justify-center text-lg shadow-md group-hover:scale-110 transition-transform">
                                📱
                              </div>
                              <span className="text-xs font-black text-emerald-400">ถ่ายรูปด้วยกล้องมือถือ</span>
                              <span className="text-[10px] text-muted-foreground text-center">
                                เปิดแอปกล้องในโทรศัพท์ทันที
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                className="hidden"
                                disabled={!pdpaConsent}
                                onChange={handleIdCardUpload}
                              />
                            </label>

                            {/* Option 3: File Upload */}
                            <label className={`p-4 bg-background/80 hover:bg-background border-2 border-dashed border-primary/30 hover:border-primary rounded-2xl flex flex-col items-center justify-center gap-2 transition-all group active:scale-98 ${
                              pdpaConsent ? 'cursor-pointer' : 'cursor-not-allowed'
                            }`}>
                              <div className="w-10 h-10 rounded-2xl bg-secondary text-primary flex items-center justify-center text-lg group-hover:scale-110 transition-transform">
                                📁
                              </div>
                              <span className="text-xs font-black text-foreground">เลือกไฟล์รูปบัตร</span>
                              <span className="text-[10px] text-muted-foreground text-center">
                                อัปโหลด JPG / PNG จากเครื่อง
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={!pdpaConsent}
                                onChange={handleIdCardUpload}
                              />
                            </label>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Extracted Fields */}
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                      ชื่อ-นามสกุล ผู้เช่า <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-bold text-sm"
                      placeholder="นาย/นางสาว..."
                      value={bookingData.name}
                      onChange={(e) => setBookingData({ ...bookingData, name: e.target.value })}
                    />
                    <p className="text-[10px] text-emerald-400 font-semibold">
                      🛡️ ระบบใช้หลักการคุ้มครองข้อมูลส่วนบุคคล (PDPA Privacy by Design) ไม่เรียกเก็บและไม่บันทึกเลขประจำตัวประชาชน 13 หลักลงในฐานข้อมูล
                    </p>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                        ที่อยู่ตามทะเบียนบ้าน / บัตรประชาชน <span className="text-rose-500">*</span>
                      </label>
                      {bookingData.subdistrict && (
                        <span className="text-[10px] font-bold text-primary">
                          ✓ แยกช่องอัตโนมัติ: ต.{bookingData.subdistrict} อ.{bookingData.district} จ.{bookingData.province}
                        </span>
                      )}
                    </div>
                    <textarea
                      rows={2}
                      className="w-full px-4 py-3 rounded-xl bg-secondary border border-border focus:border-primary outline-none font-bold text-xs"
                      placeholder="บ้านเลขที่ หมู่ ตำบล อำเภอ จังหวัด รหัสไปรษณีย์"
                      value={bookingData.id_card_address}
                      onChange={(e) => setBookingData({ ...bookingData, id_card_address: e.target.value })}
                    />
                  </div>
                </div>

                {/* Contract Summary & Terms Preview */}
                <div className="p-4 bg-muted/30 border border-border rounded-2xl space-y-3">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                      <span>📜</span> ข้อตกลงสัญญาเช่าหอพักเกษร 2
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer active:scale-95"
                    >
                      <span>📄</span> ดูร่างสัญญาฉบับทางการ 3 หน้า (ฟอนต์ TH Sarabun New)
                    </button>
                  </div>

                  <div className="text-[11px] text-muted-foreground space-y-1 bg-background/50 p-3 rounded-xl border border-border max-h-32 overflow-y-auto leading-relaxed">
                    <p>1. ค่าเช่าห้องพักเดือนละ ฿{Number(room.price).toLocaleString()} กำหนดชำระภายในวันที่ 5 ของทุกเดือน</p>
                    <p>2. ค่าน้ำประปาเหมาจ่าย ฿100/คน/เดือน • ค่าไฟฟ้าหน่วยละ ฿{room.electricity_rate || 8}/ยูนิต</p>
                    <p>3. ค่ามัดจำสัญญาเช่า ฿1,000 จะคืนให้ตอนออก เมื่อพักครบสัญญาอย่างน้อย 1 ปี</p>
                    <p>4. ห้ามส่งเสียงดังรบกวนยามวิกาล, ห้ามเสพสิ่งเสพติด, รักษาความสะอาดห้องพักสม่ำเสมอ</p>
                    <p>5. สัญญาเช่าฉบับจริงจะลงลายมือชื่อทั้งสองฝ่ายต่อหน้าในวันเข้าพักจริง</p>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl text-[11px] text-blue-400 leading-relaxed">
                    ℹ️ <strong>วิธีลงนามสัญญา:</strong> เมื่อท่านชำระเงินจองสำเร็จ ระบบจะส่งไฟล์ Word (.docx) และ PDF ที่พิมพ์ด้วยแบบฟอร์มทางการ <strong>TH Sarabun New</strong> ไปยังเจ้าของหอพัก เพื่อพิมพ์เอกสารให้ท่านและเจ้าของหอพักลงลายมือชื่อจริงร่วมกันในวันเข้าหอพัก
                  </div>
                </div>

                {/* Next & Back Actions */}
                <div className="space-y-3 pt-2">
                  <button
                    onClick={() => setStep(4)}
                    disabled={!bookingData.name || !bookingData.id_card_address}
                    className="w-full py-5 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-sm transition-all shadow-xl shadow-primary/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    ถัดไป: ชำระเงินค่าจอง ฿{totalDeposit.toLocaleString()} →
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(2)}
                      className="flex-1 py-2.5 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ← ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCancelCurrentBooking}
                      className="py-2.5 px-3 text-xs font-bold text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิกการจอง
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 4: PromptPay QR Payment & Transfer Slip Upload */}
            {step === 4 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 animate-in fade-in duration-300">
                <div className="space-y-2 text-center">
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-500">ขั้นตอนที่ 4 จาก 4</span>
                  <h2 className="text-2xl font-black tracking-tight">โอนเงินค่าจองและแนบสลิป</h2>
                  <p className="text-xs text-muted-foreground">ชำระเงินจอง {totalDeposit.toLocaleString()} บาท เพื่อล็อกห้องพักและยืนยันสิทธิ์</p>
                </div>

                {/* QR Code Container */}
                <div className="p-6 bg-slate-950/80 rounded-3xl border border-white/10 text-center space-y-4">
                  {qrLoading ? (
                    <div className="h-56 flex items-center justify-center">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                    </div>
                  ) : qrData?.qrImage ? (
                    <div className="space-y-3">
                      <div className="w-52 h-52 mx-auto bg-white p-3 rounded-2xl shadow-xl flex items-center justify-center">
                        <img src={qrData.qrImage} alt="PromptPay QR Code" className="w-full h-full object-contain" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-white">{qrData.promptpayName}</p>
                        <p className="text-xs text-white/50 font-mono">พร้อมเพย์: {qrData.promptpayNumber}</p>
                        <div className="pt-1">
                          <span className="text-[10px] uppercase font-bold text-white/50 block">ยอดชำระเงินจองห้องพัก</span>
                          <span className="text-2xl font-black text-amber-400">฿{totalDeposit.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-8 text-center text-xs text-muted-foreground">
                      ไม่สามารถโหลด QR Code ได้ กรุณาติดต่อผู้ดูแลหอพัก
                    </div>
                  )}
                </div>

                {qrData && (
                  <PromptPayBankSelector
                    qrImage={qrData.qrImage}
                    promptpayNumber={qrData.promptpayNumber}
                    promptpayName={qrData.promptpayName}
                    amount={totalDeposit}
                    fileName={`deposit-qr-room-${room.room_number}.png`}
                  />
                )}

                <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs text-amber-300 leading-relaxed">
                  💡 <strong>หมายเหตุ:</strong> ชำระเฉพาะเงินจองเพื่อยืนยันสิทธิ์ 1,000 บาท สำหรับเงินประกันความเสียหาย ฿2,000 และค่าเช่าเดือนแรก เจ้าของหอพักจะคิดคำนวณและเรียกเก็บในวันทำสัญญาเข้าพักจริง
                </div>

                {/* Slip Upload Area */}
                <div className="space-y-3">
                  <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider block">
                    แนบรูปภาพสลิปการโอนเงิน (Transfer Slip) <span className="text-rose-500">*</span>
                  </label>

                  {slipData ? (
                    <div className="p-4 bg-secondary rounded-2xl border border-border flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-16 rounded-xl overflow-hidden bg-slate-900 border border-border shrink-0">
                          <img src={slipData} alt="Slip Preview" className="w-full h-full object-cover" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-emerald-500">✓ แนบสลิปเรียบร้อยแล้ว</p>
                          <p className="text-[11px] text-muted-foreground">พร้อมส่งให้เจ้าของหอพักตรวจสอบ</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setSlipData(null)}
                        className="px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-xl text-xs font-bold transition-all cursor-pointer"
                      >
                        เปลี่ยนรูป
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center p-8 bg-secondary/60 hover:bg-secondary border-2 border-dashed border-border rounded-2xl cursor-pointer transition-all hover:border-primary group">
                      <div className="w-12 h-12 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xl mb-2 group-hover:scale-110 transition-transform">
                        📷
                      </div>
                      <span className="text-xs font-bold text-foreground">คลิกเพื่ออัปโหลดสลิปโอนเงิน</span>
                      <span className="text-[10px] text-muted-foreground mt-1">รองรับไฟล์ JPG, PNG (ไม่เกิน 5MB)</span>
                      <input type="file" accept="image/*" className="hidden" onChange={handleSlipUpload} />
                    </label>
                  )}
                </div>

                {/* Submit Actions */}
                <div className="space-y-3 pt-2">
                  <button
                    onClick={handleFinalSubmit}
                    disabled={!slipData || isProcessing}
                    className="w-full py-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-2xl text-sm transition-all shadow-xl shadow-emerald-500/25 hover:scale-[1.02] active:scale-95 disabled:opacity-40 cursor-pointer"
                  >
                    {isProcessing ? 'กำลังส่งคำขอจองและสร้างสัญญา...' : '✓ ยืนยันการโอนเงินและส่งคำขอจอง'}
                  </button>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setStep(3)}
                      disabled={isProcessing}
                      className="flex-1 py-3 text-xs font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                    >
                      ← ย้อนกลับ
                    </button>
                    <button
                      onClick={handleCancelCurrentBooking}
                      disabled={isProcessing}
                      className="py-3 px-3 text-xs font-bold text-rose-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-xl transition-all cursor-pointer"
                    >
                      ยกเลิกการจอง
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 5: Finished & Contract Documents Ready */}
            {step === 5 && (
              <div className="bg-card border border-border rounded-[2.5rem] p-8 shadow-xl space-y-6 text-center animate-in fade-in duration-300">
                <div className="w-16 h-16 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full flex items-center justify-center text-3xl mx-auto shadow-lg shadow-emerald-500/10">
                  ✓
                </div>
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-500">จองห้องพักสำเร็จ</span>
                  <h3 className="text-2xl font-black tracking-tight">ส่งคำขอจองและจัดทำสัญญาเช่าสำเร็จ</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    ระบบได้กรอกข้อมูลของคุณลงในฟอร์มสัญญาเช่าหอพักเกษร 2 เรียบร้อยแล้ว พร้อมส่งสลิปและร่างสัญญาให้เจ้าของหอพักตรวจสอบ
                  </p>
                </div>

                {/* Contract Download Box */}
                <div className="p-5 bg-secondary/50 rounded-3xl border border-border space-y-3 text-left">
                  <span className="text-xs font-black text-foreground flex items-center gap-2">
                    <span>📄</span> เอกสารสัญญาเช่าของคุณ (พร้อมพิมพ์/แก้ไข)
                  </span>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    คุณสามารถดาวน์โหลดเอกสารสัญญาเช่าที่กรอกข้อมูลครบถ้วนแล้วเก็บไว้เป็นหลักฐาน หรือเจ้าของหอจะพิมพ์ฉบับจริงให้เซ็นชื่อเมื่อเข้าหอพัก
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    <button
                      type="button"
                      onClick={handleDownloadDocx}
                      disabled={downloadingDocx}
                      className="py-3 px-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer disabled:opacity-50"
                    >
                      <span>{downloadingDocx ? '⏳ กำลังสร้างไฟล์ Word...' : '📄 ดาวน์โหลด Word (.docx)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsPrintModalOpen(true)}
                      className="py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-md active:scale-95 cursor-pointer"
                    >
                      <span>🖨️ ดู / พิมพ์สัญญา (PDF)</span>
                    </button>
                  </div>
                </div>

                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl text-[11px] text-amber-400 text-left leading-relaxed">
                  📌 <strong>ขั้นตอนถัดไปในวันเข้าพัก:</strong> เมื่อเจ้าของหอพักตรวจสอบยอดเงินจอง ฿1,000 เรียบร้อย จะพิมพ์สัญญาเช่ากระดาษฉบับนี้เพื่อลงลายมือชื่อจริงร่วมกับท่านในวันรับกุญแจเข้าพัก และถ่ายรูปสัญญาตัวจริงบันทึกลงระบบเป็นหลักฐาน
                </div>

                <div className="pt-2 space-y-2.5">
                  <Link
                    href="/explore/booking-status"
                    className="w-full inline-flex justify-center items-center py-4 bg-primary hover:bg-primary/90 text-white font-black rounded-2xl text-xs uppercase tracking-widest hover:scale-[1.02] active:scale-95 shadow-xl shadow-primary/20 transition-all cursor-pointer"
                  >
                    📋 ดูสถานะการจองของฉัน
                  </Link>
                  <Link
                    href="/"
                    className="w-full inline-flex justify-center items-center py-3 bg-secondary hover:bg-secondary/80 text-foreground font-bold rounded-2xl text-xs uppercase tracking-wider transition-all cursor-pointer"
                  >
                    กลับไปหน้าแนะนำหอเกษร 2
                  </Link>
                </div>
              </div>
            )}

          </div>

        </div>
      </div>

      {/* Printable Contract Modal (Word/PDF/Print) */}
      <PrintableContractModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        contract={{
          id: createdContractId || 'DRAFT',
          room_number: room?.room_number || '',
          room_type: room?.room_type,
          tenant_name: bookingData.name,
          tenant_phone: bookingData.phone,
          parent_phone: bookingData.parent_phone,
          tenant_email: bookingData.email,
          id_card_number: bookingData.id_card_number,
          tenant_address: bookingData.id_card_address,
          houseNo: bookingData.houseNo,
          village: bookingData.village,
          road: bookingData.road,
          subdistrict: bookingData.subdistrict,
          district: bookingData.district,
          province: bookingData.province,
          id_card_image: bookingData.id_card_image,
          start_date: bookingData.start_date,
          end_date: bookingData.end_date,
          deposit_amount: 1000,
          monthly_rent: Number(room?.price || 0),
          created_at: new Date().toISOString(),
        } as any}
      />

      {/* Contract Simulator Modal */}
      {showSimulator && room && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center p-4 sm:p-6 lg:p-8 overflow-y-auto bg-black/60 backdrop-blur-xl animate-in fade-in duration-300">
          <div className="max-w-4xl w-full my-auto">
            <ContractSimulator
              initialPrice={Number(room.price)}
              roomNumber={room.room_number}
              onClose={() => setShowSimulator(false)}
            />
          </div>
        </div>
      )}

      {/* Chat Widget */}
      {room && <ChatWidget dormId={room.dorm_id} ownerName={room.owner_name} />}

      {/* PDPA OCR Consent Modal */}
      <PdpaOcrConsentModal
        isOpen={isPdpaModalOpen}
        onClose={() => {
          setIsPdpaModalOpen(false);
          setPendingOcrImage(null);
        }}
        onConsent={() => {
          setIsPdpaModalOpen(false);
          if (pendingOcrImage) {
            processIdImage(pendingOcrImage);
            setPendingOcrImage(null);
          }
        }}
      />
    </div>
  );
}
