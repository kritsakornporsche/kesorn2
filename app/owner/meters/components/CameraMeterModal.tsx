'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface CameraMeterModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomNumber: string;
  meterType: 'Water' | 'Electricity';
  previousReading: number;
  onConfirmReading: (reading: number, photoUrl: string) => void;
}

/**
 * Grayscale & contrast enhancement on canvas to make mechanical meter digits pop for OCR
 */
function enhanceDialCanvas(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  try {
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imgData.data;
    const factor = 1.65; // contrast boost
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = Math.min(255, Math.max(0, factor * (gray - 128) + 128));
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imgData, 0, 0);
  } catch {
    // Ignore if tainted or unreadable
  }
}

export default function CameraMeterModal({
  isOpen,
  onClose,
  roomNumber,
  meterType,
  previousReading,
  onConfirmReading,
}: CameraMeterModalProps) {
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [detectedReading, setDetectedReading] = useState<string>('');
  const [candidates, setCandidates] = useState<number[]>([]);
  const [warning, setWarning] = useState<string | null>(null);
  const [engineUsed, setEngineUsed] = useState<string | null>(null);
  const [liveStreamActive, setLiveStreamActive] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const readingInputRef = useRef<HTMLInputElement>(null);

  const handleUploadGallery = () => {
    stopLiveStream();
    galleryInputRef.current?.click();
  };

  const handleNativeCamera = () => {
    stopLiveStream();
    cameraInputRef.current?.click();
  };

  const stopLiveStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch {
          // ignore
        }
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setLiveStreamActive(false);
    setTorchOn(false);
  }, []);

  const startLiveStream = useCallback(async (preferredFacing: 'environment' | 'user' = facingMode) => {
    stopLiveStream();
    setStreamError(null);

    // Guard if mediaDevices not supported
    if (!navigator?.mediaDevices?.getUserMedia) {
      setStreamError('เบราว์เซอร์นี้ไม่รองรับการสตรีมกล้องสด กรุณาใช้กล้องมือถือถ่ายภาพ');
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: preferredFacing },
          width: { ideal: 1920, min: 640 },
          height: { ideal: 1080, min: 480 },
        },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;

      // Check for torch capability
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && typeof (videoTrack as any).getCapabilities === 'function') {
        const capabilities = (videoTrack as any).getCapabilities() || {};
        setHasTorch(Boolean(capabilities.torch));
      } else {
        setHasTorch(false);
      }

      const videoEl = videoRef.current;
      if (videoEl) {
        videoEl.srcObject = stream;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('webkit-playsinline', 'true');
        videoEl.muted = true;
        
        videoEl.onloadedmetadata = () => {
          videoEl.play().catch((err) => {
            console.warn('Auto-play blocked or error:', err);
          });
        };
        
        // Immediate play attempt
        videoEl.play().catch(() => {});
      }

      setLiveStreamActive(true);
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      let errorMsg = 'ไม่สามารถเปิดกล้องสดได้';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        errorMsg = 'ท่านปฏิเสธการเข้าถึงกล้อง กรุณาอนุญาตหรือใช้ปุ่มเปิดกล้องมือถือ (Native Camera)';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        errorMsg = 'ไม่พบอุปกรณ์กล้องบนเครื่องนี้';
      }
      setStreamError(errorMsg);
      setLiveStreamActive(false);
    }
  }, [facingMode, stopLiveStream]);

  // Handle modal open/close lifecycle
  useEffect(() => {
    if (isOpen) {
      setCapturedImage(null);
      setDetectedReading(previousReading !== undefined && previousReading !== null ? String(previousReading) : '');
      setWarning(null);
      setAnalyzing(false);
      setZoomLevel(1);
      // Auto start live stream on open
      startLiveStream('environment');
    } else {
      stopLiveStream();
    }

    return () => {
      stopLiveStream();
    };
  }, [isOpen, startLiveStream, stopLiveStream]);

  const toggleTorch = async () => {
    if (!streamRef.current || !hasTorch) return;
    const track = streamRef.current.getVideoTracks()[0];
    if (track) {
      try {
        const nextState = !torchOn;
        await (track as any).applyConstraints({
          advanced: [{ torch: nextState }],
        });
        setTorchOn(nextState);
      } catch (err) {
        console.warn('Failed to toggle torch:', err);
      }
    }
  };

  const toggleFacingMode = () => {
    const nextMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(nextMode);
    startLiveStream(nextMode);
  };

  const captureLiveFrame = () => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth || 1280;
    const height = video.videoHeight || 720;

    // 1. Scaled Evidence Photo (max 1280px dimension, high visual quality)
    const evidenceCanvas = document.createElement('canvas');
    const maxDim = 1280;
    let targetW = width;
    let targetH = height;
    if (targetW > maxDim || targetH > maxDim) {
      if (targetW > targetH) {
        targetH = Math.round((targetH * maxDim) / targetW);
        targetW = maxDim;
      } else {
        targetW = Math.round((targetW * maxDim) / targetH);
        targetH = maxDim;
      }
    }
    evidenceCanvas.width = targetW;
    evidenceCanvas.height = targetH;
    const evCtx = evidenceCanvas.getContext('2d');
    if (evCtx) {
      if (zoomLevel > 1) {
        const cropW = width / zoomLevel;
        const cropH = height / zoomLevel;
        const cropX = (width - cropW) / 2;
        const cropY = (height - cropH) / 2;
        evCtx.drawImage(video, cropX, cropY, cropW, cropH, 0, 0, targetW, targetH);
      } else {
        evCtx.drawImage(video, 0, 0, targetW, targetH);
      }
    }
    const fullDataUrl = evidenceCanvas.toDataURL('image/jpeg', 0.85);

    // 2. Zoomed Central Dial Crop (Matches reticle box: 70% width, 35% height)
    let cropDataUrl: string | undefined = undefined;
    try {
      const dialCanvas = document.createElement('canvas');
      const effZoom = zoomLevel > 1 ? zoomLevel : 1;
      const dialCropW = Math.round((width * 0.70) / effZoom);
      const dialCropH = Math.round((height * 0.35) / effZoom);
      const dialCropX = Math.round((width - dialCropW) / 2);
      const dialCropY = Math.round((height - dialCropH) / 2);

      dialCanvas.width = 720;
      dialCanvas.height = 360;
      const dialCtx = dialCanvas.getContext('2d');
      if (dialCtx) {
        dialCtx.drawImage(video, dialCropX, dialCropY, dialCropW, dialCropH, 0, 0, 720, 360);
        enhanceDialCanvas(dialCanvas);
        cropDataUrl = dialCanvas.toDataURL('image/jpeg', 0.90);
      }
    } catch (cropErr) {
      console.warn('Dial crop failed:', cropErr);
    }

    stopLiveStream();
    setCapturedImage(fullDataUrl);
    analyzeMeterImage(fullDataUrl, cropDataUrl);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      stopLiveStream();

      const img = new Image();
      img.onload = () => {
        let fullUrl = dataUrl;
        let cropUrl: string | undefined = undefined;

        try {
          // 1. Evidence full photo (max 1280px)
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) {
              h = Math.round((h * maxDim) / w);
              w = maxDim;
            } else {
              w = Math.round((w * maxDim) / h);
              h = maxDim;
            }
          }
          const c = document.createElement('canvas');
          c.width = w;
          c.height = h;
          const cx = c.getContext('2d');
          if (cx) {
            cx.drawImage(img, 0, 0, w, h);
            fullUrl = c.toDataURL('image/jpeg', 0.85);
          }

          // 2. Central dial crop (center 75% width, 40% height)
          const dialC = document.createElement('canvas');
          const cropW = Math.round(img.width * 0.75);
          const cropH = Math.round(img.height * 0.40);
          const cropX = Math.round((img.width - cropW) / 2);
          const cropY = Math.round((img.height - cropH) / 2);

          dialC.width = 720;
          dialC.height = 360;
          const dialCx = dialC.getContext('2d');
          if (dialCx) {
            dialCx.drawImage(img, cropX, cropY, cropW, cropH, 0, 0, 720, 360);
            enhanceDialCanvas(dialC);
            cropUrl = dialC.toDataURL('image/jpeg', 0.90);
          }
        } catch (err) {
          console.warn('Canvas file processing error:', err);
        }

        setCapturedImage(fullUrl);
        analyzeMeterImage(fullUrl, cropUrl);
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const analyzeMeterImage = async (dataUrl: string, cropDataUrl?: string) => {
    setAnalyzing(true);
    setWarning(null);
    setCandidates([]);
    // Ensure baseline is never blank while analyzing
    if (!detectedReading && previousReading) {
      setDetectedReading(String(previousReading));
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch('/api/owner/meters/ocr', {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: dataUrl,
          cropImage: cropDataUrl,
          type: meterType,
          previous_reading: previousReading,
        }),
      });
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.success && data.data?.reading !== null && data.data?.reading !== undefined) {
        const detectedStr = String(data.data.reading);
        setDetectedReading(detectedStr);
        setCandidates(data.data.candidates || []);
        setWarning(data.data.warning || null);
        setEngineUsed(data.data.engine);
      } else if (data.data?.candidates && data.data.candidates.length > 0) {
        setCandidates(data.data.candidates);
        setDetectedReading(String(data.data.candidates[0]));
        setWarning('AI เลือกตัวเลขที่ใกล้เคียงที่สุด กรุณายืนยันความถูกต้อง');
      } else {
        // Fallback: If OCR didn't catch, keep previous reading as baseline
        if (previousReading !== undefined && previousReading !== null) {
          setDetectedReading(String(previousReading));
        }
        setWarning('AI อ่านตัวเลขยังไม่ชัดเจน ระบบตั้งต้นด้วยเลขงวดก่อนไว้ให้ สามารถแตะปุ่ม +1, +5 หรือแก้ไขได้ทันที');
      }
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        setWarning('การประมวลผลใช้เวลานาน ระบบตั้งต้นด้วยเลขงวดก่อนไว้ให้');
      } else {
        console.error('OCR analyze error:', err);
        setWarning('ไม่สามารถเชื่อมต่อระบบอ่านตัวเลขได้ ระบบตั้งต้นด้วยเลขงวดก่อนไว้ให้');
      }
      if (previousReading !== undefined && previousReading !== null) {
        setDetectedReading(String(previousReading));
      }
    } finally {
      setAnalyzing(false);
      setTimeout(() => {
        readingInputRef.current?.focus();
        readingInputRef.current?.select();
      }, 150);
    }
  };

  const handleSave = () => {
    const num = parseFloat(detectedReading);
    if (isNaN(num)) {
      alert('กรุณาระบุตัวเลขมิเตอร์ที่ถูกต้อง');
      return;
    }
    onConfirmReading(num, capturedImage || '');
    onClose();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setDetectedReading('');
    setCandidates([]);
    setWarning(null);
    setAnalyzing(false);
    startLiveStream(facingMode);
  };

  const handleRetakeNative = () => {
    setCapturedImage(null);
    setDetectedReading('');
    setCandidates([]);
    setWarning(null);
    setAnalyzing(false);
    cameraInputRef.current?.click();
  };

  const handleRetakeGallery = () => {
    setCapturedImage(null);
    setDetectedReading('');
    setCandidates([]);
    setWarning(null);
    setAnalyzing(false);
    galleryInputRef.current?.click();
  };

  if (!isOpen) return null;

  const isWater = meterType === 'Water';
  const typeLabel = isWater ? 'มิเตอร์น้ำ' : 'มิเตอร์ไฟ';
  const unitsDelta = detectedReading ? Number(detectedReading) - previousReading : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 sm:backdrop-blur-md animate-in fade-in p-0 sm:p-4">
      {/* Hidden Native Camera Input */}
      <input
        type="file"
        ref={cameraInputRef}
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Hidden Gallery / File Upload Input (No capture constraint so user can pick from files/photos) */}
      <input
        type="file"
        ref={galleryInputRef}
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />

      {/* Main Container: Guaranteed never to overflow viewport */}
      <div className="flex flex-col w-full h-[100dvh] sm:h-[88vh] sm:max-h-[720px] sm:max-w-lg bg-[#0E071D] sm:border sm:border-purple-500/25 sm:rounded-3xl shadow-2xl overflow-hidden relative">
        
        {/* 1. Clean, Compact Header Bar */}
        <div className="h-14 px-4 bg-[#180D2F] border-b border-purple-500/20 flex items-center justify-between shrink-0 z-20">
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shadow-sm ${
              isWater 
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30' 
                : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
            }`}>
              {isWater ? '💧' : '⚡'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-black text-white">
                  สแกน{typeLabel} <span className="text-amber-400 font-mono">ห้อง {roomNumber}</span>
                </h3>
              </div>
              <p className="text-[10px] text-purple-300/70 font-mono leading-none">
                งวดก่อน: <span className="text-amber-300 font-bold">{previousReading}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Quick Upload Button in Top Bar */}
            <button
              type="button"
              onClick={handleUploadGallery}
              title="อัพโหลดรูปภาพจากคลังรูปภาพหรือไฟล์ในเครื่อง"
              className="px-2.5 py-1.5 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white border border-purple-400/40 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer active:scale-95 shadow-xs"
            >
              <span>🖼️</span>
              <span className="text-[11px]">อัพรูป</span>
            </button>

            {/* Torch button */}
            {liveStreamActive && !capturedImage && hasTorch && (
              <button
                type="button"
                onClick={toggleTorch}
                title={torchOn ? 'ปิดไฟฉาย' : 'เปิดไฟฉาย'}
                className={`p-2 rounded-xl text-xs flex items-center transition-all cursor-pointer ${
                  torchOn
                    ? 'bg-amber-400 text-slate-950 font-bold shadow-[0_0_12px_rgba(251,191,36,0.6)]'
                    : 'bg-white/5 hover:bg-white/10 text-white/70'
                }`}
              >
                🔦
              </button>
            )}

            {/* Camera Switch button */}
            {liveStreamActive && !capturedImage && (
              <button
                type="button"
                onClick={toggleFacingMode}
                title="สลับกล้องหน้า/หลัง"
                className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/70 text-xs transition-all cursor-pointer"
              >
                🔄
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={() => {
                stopLiveStream();
                onClose();
              }}
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer ml-1"
            >
              ✕
            </button>
          </div>
        </div>

        {/* 2. Camera Viewfinder Area (flex-1 min-h-0 guarantees it shrinks properly) */}
        <div className="flex-1 min-h-0 relative w-full bg-black flex items-center justify-center overflow-hidden">
          
          {/* Always-mounted Video Element */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: 'center center',
              transition: 'transform 0.2s ease-out',
            }}
            className={`w-full h-full object-cover select-none ${
              liveStreamActive && !capturedImage ? 'block' : 'hidden'
            }`}
          />

          {/* Clean, Sleek Aiming Reticle */}
          {liveStreamActive && !capturedImage && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center p-4">
              
              {/* Minimal Hint Pill */}
              <div className="mb-3 px-3 py-1 rounded-full bg-[#180D2F]/80 backdrop-blur-sm border border-purple-400/30 shadow flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                <span className="text-[11px] font-bold text-purple-200">
                  วางตัวเลขมิเตอร์ในกรอบ
                </span>
              </div>

              {/* Viewfinder Aim Box */}
              <div className="w-[85%] max-w-sm h-36 sm:h-44 relative rounded-xl border border-purple-400/40 shadow-[0_0_20px_rgba(168,85,247,0.25)] bg-purple-950/10 overflow-hidden">
                {/* 4 Corner Brackets */}
                <div className="absolute top-0 left-0 w-5 h-5 border-t-3 border-l-3 border-purple-400 rounded-tl-lg" />
                <div className="absolute top-0 right-0 w-5 h-5 border-t-3 border-r-3 border-amber-400 rounded-tr-lg" />
                <div className="absolute bottom-0 left-0 w-5 h-5 border-b-3 border-l-3 border-amber-400 rounded-bl-lg" />
                <div className="absolute bottom-0 right-0 w-5 h-5 border-b-3 border-r-3 border-purple-400 rounded-br-lg" />

                {/* Laser scan animation */}
                <div 
                  className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-purple-400 to-amber-300 shadow-[0_0_10px_#c084fc]"
                  style={{ animation: 'meterScan 2s ease-in-out infinite' }}
                />
              </div>

              {/* Minimal Zoom Toggle */}
              <div className="pointer-events-auto mt-3 flex items-center bg-[#180D2F]/85 backdrop-blur-sm rounded-full p-0.5 border border-purple-500/30 gap-1">
                {[1, 1.5, 2].map((lvl) => (
                  <button
                    key={lvl}
                    type="button"
                    onClick={() => setZoomLevel(lvl)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold transition-all cursor-pointer ${
                      zoomLevel === lvl
                        ? 'bg-purple-600 text-white shadow-sm'
                        : 'text-purple-200/70 hover:text-white'
                    }`}
                  >
                    {lvl}x
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Captured Image Review */}
          {capturedImage && (
            <div className="relative w-full h-full flex items-center justify-center bg-black">
              <img
                src={capturedImage}
                alt="Captured Meter"
                className="w-full h-full object-contain"
              />

              {analyzing && (
                <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center gap-2.5">
                  <div className="w-10 h-10 rounded-full border-3 border-purple-400 border-t-transparent animate-spin" />
                  <p className="text-xs font-bold text-white tracking-wide">
                    AI กำลังอ่านตัวเลขหน้าปัด...
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Stream Error or Fallback State */}
          {!liveStreamActive && !capturedImage && (
            <div className="p-4 max-w-sm text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-2xl mx-auto">
                📸
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">
                  ถ่ายภาพมิเตอร์ห้อง {roomNumber}
                </h4>
                {streamError && (
                  <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 p-2 rounded-xl mt-1.5">
                    {streamError}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleUploadGallery}
                  className="w-full py-3 px-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-black text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/25 active:scale-98 transition-all"
                >
                  <span className="text-base">🖼️</span>
                  <span>อัพโหลดรูปภาพ (เลือกจากเครื่อง/คลังรูป)</span>
                </button>

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleNativeCamera}
                    className="py-2.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold text-xs flex items-center justify-center gap-1.5 cursor-pointer border border-white/15 transition-all active:scale-98"
                  >
                    <span>📷</span>
                    <span>กล้องมือถือ</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => startLiveStream('environment')}
                    className="py-2.5 px-3 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-200 font-bold text-xs border border-purple-500/30 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-98"
                  >
                    <span>🎥</span>
                    <span>เปิดกล้องสด</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 3. Clean, Non-Overflowing Bottom Controls Panel */}
        <div className="p-3 sm:p-4 bg-[#180D2F] border-t border-purple-500/20 shrink-0 z-20">
          
          {/* A. Live Stream Controls: 4 actions */}
          {liveStreamActive && !capturedImage && (
            <div className="flex items-center justify-between gap-2 sm:gap-3">
              {/* Upload from Gallery / Device */}
              <button
                type="button"
                onClick={handleUploadGallery}
                className="flex-1 py-2.5 px-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 hover:text-white font-bold text-xs border border-purple-400/40 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 shadow-sm"
                title="เลือกรูปภาพจากคลังรูปภาพหรือไฟล์ในเครื่อง"
              >
                <span className="text-sm">🖼️</span>
                <span>อัพรูป</span>
              </button>

              {/* Shutter Button (Live Capture) */}
              <button
                type="button"
                onClick={captureLiveFrame}
                title="กดถ่ายภาพและอ่านตัวเลข"
                className="w-14 h-14 sm:w-15 sm:h-15 rounded-full border-3 border-white/90 flex items-center justify-center p-1 cursor-pointer transition-transform active:scale-90 shrink-0 shadow-[0_0_15px_rgba(168,85,247,0.4)]"
              >
                <div className="w-full h-full rounded-full bg-white hover:bg-purple-200 transition-colors flex items-center justify-center text-slate-950 text-lg">
                  📸
                </div>
              </button>

              {/* Native Camera */}
              <button
                type="button"
                onClick={handleNativeCamera}
                className="flex-1 py-2.5 px-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 font-bold text-xs border border-white/10 flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95"
                title="เปิดกล้องมือถือถ่ายภาพ"
              >
                <span className="text-sm">📷</span>
                <span>กล้อง</span>
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  stopLiveStream();
                  onClose();
                }}
                className="py-2.5 px-3 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white font-bold text-xs border border-white/10 flex items-center justify-center cursor-pointer transition-all"
                title="ปิดหน้าต่าง"
              >
                ✕
              </button>
            </div>
          )}

          {/* B. Review & Result Controls */}
          {capturedImage && (
            <div className="space-y-2.5">
              {/* Header row: Retake / Upload buttons & cycle info */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="px-2.5 py-1 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1 cursor-pointer transition-all shadow-sm active:scale-95"
                  >
                    <span>🔄 ถ่ายใหม่</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRetakeGallery}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600/40 hover:bg-indigo-600/60 text-indigo-200 hover:text-white font-bold text-xs flex items-center gap-1 cursor-pointer border border-indigo-400/40 transition-all active:scale-95 shadow-sm"
                    title="เลือกรูปภาพอื่นจากเครื่อง"
                  >
                    <span>🖼️ อัพรูปใหม่</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleRetakeNative}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 font-bold text-xs flex items-center gap-1 cursor-pointer border border-white/10 transition-all active:scale-95"
                  >
                    <span>📷 กล้องมือถือ</span>
                  </button>
                </div>

                <span className="text-xs text-purple-300/80 font-mono shrink-0">
                  งวดก่อน: <strong className="text-amber-400 font-black">{previousReading}</strong>
                </span>
              </div>

              {/* OCR Engine Indicator Badge */}
              {engineUsed && (
                <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-purple-950/40 border border-purple-500/20 text-[10px]">
                  <span className="text-purple-300/80 font-medium">ระบบอ่านค่า:</span>
                  {engineUsed === 'gemini-custom-key' ? (
                    <span className="text-emerald-300 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      ⚡ Google Gemini Vision (API Key ของคุณ)
                    </span>
                  ) : engineUsed === 'gemini-system-key' ? (
                    <span className="text-indigo-300 font-bold flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
                      ✨ Google Gemini Vision (ระบบกลาง)
                    </span>
                  ) : (
                    <span className="text-amber-300 font-bold flex items-center gap-1">
                      <span>⚙️</span>
                      Tesseract OCR (ออฟไลน์ในเครื่อง)
                    </span>
                  )}
                </div>
              )}

              {/* Input & Units delta row */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={readingInputRef}
                    type="number"
                    step="any"
                    value={detectedReading}
                    onChange={(e) => setDetectedReading(e.target.value)}
                    placeholder="กรอกเลขหน้าปัด"
                    className="w-full px-3.5 py-2.5 bg-[#0E071D] border border-purple-400/50 focus:border-amber-400 rounded-xl text-xl font-black text-amber-300 font-mono outline-none shadow-inner"
                  />
                  {detectedReading && !warning && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-500/30 font-bold">
                      พร้อมบันทึก
                    </span>
                  )}
                </div>

                <div className="shrink-0 bg-[#0E071D] px-3 py-2 rounded-xl border border-purple-500/20 text-right min-w-[80px]">
                  <span className="text-[9px] text-purple-300/70 block font-bold">ใช้ไปงวดนี้</span>
                  <span className={`text-sm font-black font-mono ${
                    unitsDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                  }`}>
                    {unitsDelta >= 0 ? `+${unitsDelta.toFixed(1)}` : unitsDelta.toFixed(1)}
                  </span>
                  <span className="text-[9px] text-purple-300/70 ml-0.5">หน.</span>
                </div>
              </div>

              {/* AI Candidates Pills if multiple found */}
              {candidates.length > 1 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-purple-300/70 font-medium">AI ตรวจพบ:</span>
                  {candidates.slice(0, 4).map((c, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setDetectedReading(String(c))}
                      className={`px-2 py-0.5 rounded-lg text-xs font-mono font-bold transition-all cursor-pointer border ${
                        detectedReading === String(c)
                          ? 'bg-amber-400 text-slate-950 border-amber-300 shadow-sm'
                          : 'bg-purple-600/20 hover:bg-purple-600/40 text-purple-200 border-purple-400/30'
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}

              {/* Quick Fill suggestions to ensure user is never blocked */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDetectedReading(String(previousReading))}
                  className="px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-purple-200 hover:text-white text-[10px] sm:text-[11px] font-bold border border-purple-500/20 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span>📌</span>
                  <span>ใช้เลขเดิม ({previousReading})</span>
                </button>
                {[1, 5, 10].map((add) => (
                  <button
                    key={add}
                    type="button"
                    onClick={() => {
                      const base = parseFloat(detectedReading) || previousReading || 0;
                      const next = (base + add).toFixed(2).replace(/\.00$/, '');
                      setDetectedReading(next);
                    }}
                    className="px-2 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/25 text-amber-300 text-[10px] sm:text-[11px] font-mono font-bold border border-amber-500/30 transition-all cursor-pointer"
                  >
                    +{add}
                  </button>
                ))}
              </div>

              {/* Warning if any */}
              {warning && (
                <p className="text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/20 px-2.5 py-1.5 rounded-lg leading-tight">
                  ⚠️ {warning}
                </p>
              )}

              {/* Evidence photo confirmation pill */}
              <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-[#0E071D] border border-emerald-500/20 text-[10px] text-emerald-300">
                <span className="flex items-center gap-1">
                  <span>📸</span>
                  <span>บันทึกภาพถ่ายเป็นหลักฐานในระบบอัตโนมัติ</span>
                </span>
                <span className="font-mono text-white/50 font-bold">หลักฐานพร้อมแนบ</span>
              </div>

              {/* Big Confirm Save Button */}
              <button
                type="button"
                onClick={handleSave}
                disabled={analyzing || !detectedReading}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 via-emerald-500 to-teal-500 hover:from-emerald-500 hover:to-teal-400 disabled:opacity-40 text-white font-black text-xs sm:text-sm rounded-xl shadow-lg shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 active:scale-98"
              >
                <span>💾</span>
                <span>กรอกค่า {detectedReading ? `[ ${detectedReading} ]` : ''} ลงในช่องห้อง {roomNumber}</span>
              </button>
            </div>
          )}

        </div>

      </div>

      <style jsx>{`
        @keyframes meterScan {
          0% {
            top: 6%;
            opacity: 0.3;
          }
          50% {
            opacity: 1;
          }
          100% {
            top: 92%;
            opacity: 0.3;
          }
        }
      `}</style>
    </div>
  );
}
