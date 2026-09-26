'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';

export default function OwnerSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    tax_id: '',
    water_rate: 100,
    electricity_rate: 7,
    promptpay_number: '',
    promptpay_name: '',
    has_wifi: false,
    has_parking: false,
    pet_friendly: true,
    has_lan: false,
    has_air_con: false,
    facilities: '',
    map_url: '',
    description: '',
    cover_image: '',
    ocr_api_key: '',
    ocr_provider: 'gemini'
  });

  const [showApiKey, setShowApiKey] = useState(false);
  const [testingKey, setTestingKey] = useState(false);
  const [keyTestResult, setKeyTestResult] = useState<{ success?: boolean; message?: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/owner/settings');
      const data = await res.json();
      if (data.success && data.data) {
        const d = data.data;
        setFormData({
          name: d.name || '',
          address: d.address || '',
          phone: d.phone || '',
          tax_id: d.tax_id || '',
          water_rate: Number(d.water_rate) || 0,
          electricity_rate: Number(d.electricity_rate) || 6,
          promptpay_number: d.promptpay_number || '',
          promptpay_name: d.promptpay_name || '',
          has_wifi: Boolean(d.has_wifi),
          has_parking: Boolean(d.has_parking),
          pet_friendly: Boolean(d.pet_friendly),
          has_lan: Boolean(d.has_lan),
          has_air_con: Boolean(d.has_air_con),
          facilities: d.facilities || '',
          map_url: d.map_url || '',
          description: d.description || '',
          cover_image: d.cover_image || '',
          ocr_api_key: d.ocr_api_key || '',
          ocr_provider: d.ocr_provider || 'gemini'
        });
      }
    } catch (e) {
      console.error('Error fetching settings:', e);
    } finally {
      setLoading(false);
    }
  };

  const handleTestKey = async () => {
    if (!formData.ocr_api_key.trim()) {
      setKeyTestResult({ success: false, message: 'กรุณากรอก API Key ก่อนทำการทดสอบ' });
      return;
    }
    setTestingKey(true);
    setKeyTestResult(null);
    try {
      const res = await fetch('/api/owner/meters/ocr/test-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: formData.ocr_api_key.trim() }),
      });
      const data = await res.json();
      setKeyTestResult({
        success: data.success,
        message: data.message || (data.success ? 'เชื่อมต่อสำเร็จ' : 'เชื่อมต่อล้มเหลว'),
      });
    } catch (e: any) {
      setKeyTestResult({ success: false, message: `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${e.message}` });
    } finally {
      setTestingKey(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      loadSettings();
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email) return;
    
    setSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      const email = session.user.email;
      const savedDb = localStorage.getItem('selectedDormDbName');
      
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          dormDbName: savedDb,
          ...formData
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: 'บันทึกข้อมูลหอพักเรียบร้อยแล้ว' });
      } else {
        setMessage({ type: 'error', text: data.message });
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-secondary/40">
      <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/40">
      <header className="h-20 bg-card/60 backdrop-blur-md border-b border-white/20 flex items-center justify-between px-10 shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">ตั้งค่าหอพัก</h1>
          <p className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest mt-0.5">Dormitory Profile & Search Settings</p>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto p-10">
        <div className="max-w-4xl mx-auto">
          {message.text && (
            <div className={`p-4 mb-6 rounded-2xl font-bold text-sm text-center ${
              message.type === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
            }`}>
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            {/* General Info */}
            <div className="bg-card border border-white/20 rounded-3xl p-8 space-y-6">
              <h2 className="text-lg font-black text-foreground border-b border-border pb-4">ข้อมูลทั่วไป (แสดงในหน้าค้นหา)</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">ชื่อหอพัก / กิจการ</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                    placeholder="เช่น SmartDom Mansion"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">เบอร์โทรศัพท์ติดต่อ</label>
                  <input
                    type="text"
                    required
                    value={formData.phone}
                    onChange={e => setFormData({ ...formData, phone: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                    placeholder="เช่น 02-XXX-XXXX"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">ลิงก์รูปภาพหน้าปกหอพัก</label>
                  <input
                    type="text"
                    value={formData.cover_image}
                    onChange={e => setFormData({ ...formData, cover_image: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                    placeholder="เช่น https://images.unsplash.com/... (เว้นว่างไว้สำหรับค่าเริ่มต้น)"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">คำอธิบายรายละเอียดหอพัก (สั้นๆ)</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary resize-none"
                    placeholder="เช่น หอพักระดับพรีเมียม ใกล้มหาวิทยาลัย เดินทางสะดวก สงบ สะอาด..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">ที่อยู่หอพัก</label>
                  <textarea
                    rows={2}
                    required
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary resize-none"
                    placeholder="ระบุเลขที่ ถนน แขวง เขต..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">
                      📍 ลิงก์ Google Maps / พิกัดปักหมุดแผนที่ (Map Location URL)
                    </label>
                    {formData.map_url && (
                      <a
                        href={formData.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-bold"
                      >
                        ทดสอบเปิดแผนที่ ↗
                      </a>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.map_url}
                    onChange={e => setFormData({ ...formData, map_url: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                    placeholder="เช่น https://maps.google.com/?q=19.0286,99.8967 หรือ ลิงก์แชร์จาก Google Maps"
                  />
                  <p className="text-[11px] text-muted-foreground pl-1">
                    * พิกัดนี้จะนำไปแสดงเป็นแผนที่แบบโต้ตอบ (Interactive Map) บนหน้ารายละเอียดหอพักใน Explore เพื่อให้นักศึกษาค้นหาและนำทางมายังหอพักได้ง่าย
                  </p>
                </div>
              </div>
            </div>

            {/* Rates & Rules */}
            <div className="bg-card border border-white/20 rounded-3xl p-8 space-y-6">
              <h2 className="text-lg font-black text-foreground border-b border-border pb-4">ค่าน้ำ/ค่าไฟ และข้อมูลกฎหมาย</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">ค่าน้ำ (บาท / เดือน เหมาจ่าย)</label>
                  <input
                    type="number"
                    value={formData.water_rate}
                    onChange={e => setFormData({ ...formData, water_rate: Number(e.target.value) })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">ค่าไฟ (บาท / ยูนิต)</label>
                  <input
                    type="number"
                    value={formData.electricity_rate}
                    onChange={e => setFormData({ ...formData, electricity_rate: Number(e.target.value) })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">เลขประจำตัวผู้เสียภาษี</label>
                  <input
                    type="text"
                    value={formData.tax_id}
                    onChange={e => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                    placeholder="เลข 13 หลัก"
                  />
                </div>
              </div>
            </div>

            {/* PromptPay Payment Settings */}
            <div className="bg-card border border-indigo-500/30 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-border pb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-black text-foreground flex items-center gap-2">
                    <span>💳</span> บัญชีพร้อมเพย์สำหรับรับเงิน (PromptPay Settings)
                  </h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    ระบบจะนำหมายเลขนี้ไปสร้าง Dynamic PromptPay QR Code ในใบแจ้งหนี้ เพื่อให้ผู้เช่าสแกนจ่ายเงินตรงเข้าบัญชีท่านทันที
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
                  รับเงินตรง 100%
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">
                      หมายเลขพร้อมเพย์ (PromptPay ID) <span className="text-destructive">*</span>
                    </label>
                    {formData.phone && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, promptpay_number: formData.phone.replace(/[^0-9]/g, '') })}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-bold cursor-pointer"
                      >
                        ใช้เบอร์ติดต่อหอพัก
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.promptpay_number}
                    onChange={e => setFormData({ ...formData, promptpay_number: e.target.value })}
                    className="w-full bg-secondary/40 border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="เบอร์มือถือ 10 หลัก หรือ เลข ปชช. 13 หลัก"
                  />
                  <p className="text-[11px] text-muted-foreground pl-1">
                    * ไม่ต้องใส่ขีด เช่น 0812345678 หรือ 1509900XXXXXX
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">
                      ชื่อบัญชีพร้อมเพย์ (Account Name) <span className="text-destructive">*</span>
                    </label>
                    {formData.name && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, promptpay_name: formData.name })}
                        className="text-[10px] text-cyan-400 hover:text-cyan-300 underline font-bold cursor-pointer"
                      >
                        ใช้ชื่อหอพัก
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.promptpay_name}
                    onChange={e => setFormData({ ...formData, promptpay_name: e.target.value })}
                    className="w-full bg-secondary/40 border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-indigo-400"
                    placeholder="เช่น นายกฤษณัย สมบูรณ์ หรือ หอพักเกษตร 2"
                  />
                  <p className="text-[11px] text-muted-foreground pl-1">
                    * ชื่อนี้จะปรากฏให้ผู้เช่าเห็นเมื่อสแกน QR Code เพื่อยืนยันความถูกต้อง
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5 bg-secondary/40/60 p-3.5 rounded-xl border border-border text-xs text-muted-foreground">
                <span className="text-indigo-400 text-sm">💡</span>
                <span>
                  <strong>ระบบ Dynamic PromptPay QR Code:</strong> ผู้เช่าจะเห็น QR Code ที่ระบุยอดเงินถูกต้องตรงเป๊ะ สแกนจ่ายได้ทุกแอปธนาคาร เงินโอนเข้าบัญชีเจ้าของหอโดยตรงแบบเรียลไทม์ ไม่มีหักเปอร์เซ็นต์
                </span>
              </div>
            </div>

            {/* Features (Checkboxes) */}
            <div className="bg-card border border-white/20 rounded-3xl p-8 space-y-6">
              <h2 className="text-lg font-black text-foreground border-b border-border pb-4">สิ่งอำนวยความสะดวกและเงื่อนไข (เพื่อการค้นหา)</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { key: 'has_wifi', label: 'มีอินเทอร์เน็ต WiFi 📶' },
                  { key: 'has_parking', label: 'มีที่จอดรถยนต์ 🚗' },
                  { key: 'pet_friendly', label: 'อนุญาตให้เลี้ยงแมว/สัตว์เลี้ยง 🐱' },
                  { key: 'has_lan', label: 'มีสาย LAN ในห้อง 🔌' },
                  { key: 'has_air_con', label: 'มีห้องแอร์ ❄️' },
                ].map(item => (
                  <label
                    key={item.key}
                    className={`flex items-center gap-3 p-4 rounded-2xl border cursor-pointer select-none transition-all ${
                      (formData as any)[item.key]
                        ? 'border-primary bg-primary/10 text-white'
                        : 'border-border bg-secondary/40/50 text-muted-foreground hover:border-white/20'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData as any)[item.key]}
                      onChange={e => setFormData({ ...formData, [item.key]: e.target.checked })}
                      className="sr-only"
                    />
                    <span className="text-sm font-black">{item.label}</span>
                  </label>
                ))}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">สิ่งอำนวยความสะดวกอื่นๆ (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
                <input
                  type="text"
                  value={formData.facilities}
                  onChange={e => setFormData({ ...formData, facilities: e.target.value })}
                  className="w-full bg-card border border-white/20 rounded-xl px-4 py-3 text-white font-bold text-sm focus:outline-none focus:border-primary"
                  placeholder="เช่น ฟิตเนส, สระว่ายน้ำ, ระบบความปลอดภัย 24 ชม., กล้องวงจรปิด"
                />
              </div>
            </div>

            {/* AI Meter OCR Configuration */}
            <div className="bg-gradient-to-br from-card via-card to-cyan-950/20 border border-cyan-500/30 rounded-3xl p-8 space-y-6 shadow-xl relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/20 pb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/30 text-cyan-400 text-xl">
                    🤖
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-white flex items-center gap-2">
                      ระบบ AI สแกนอ่านมิเตอร์น้ำ-ไฟ (Meter OCR AI Key)
                    </h2>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      เจ้าของหอพักสามารถระบุ Google Gemini API Key ส่วนตัว เพื่อใช้อ่านมิเตอร์ด้วย AI ความแม่นยำสูง
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {formData.ocr_api_key?.trim() ? (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      ใช้ Key ส่วนตัวของหอพัก
                    </span>
                  ) : (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-400"></span>
                      ใช้ Key ส่วนกลาง / Local OCR
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground block pl-1">
                      Google Gemini API Key (ฟรี ไม่มีค่าใช้จ่าย)
                    </label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 hover:underline flex items-center gap-1 transition-colors"
                    >
                      รับ API Key ฟรีที่ Google AI Studio ↗
                    </a>
                  </div>

                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={formData.ocr_api_key}
                      onChange={e => {
                        setFormData({ ...formData, ocr_api_key: e.target.value });
                        setKeyTestResult(null);
                      }}
                      className="w-full bg-secondary/40 border border-white/20 rounded-xl px-4 py-3.5 pr-28 text-white font-mono text-sm focus:outline-none focus:border-cyan-400 transition-all placeholder:text-muted-foreground/40"
                      placeholder="เช่น AIzaSy..."
                    />
                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                      {formData.ocr_api_key && (
                        <button
                          type="button"
                          onClick={() => {
                            setFormData({ ...formData, ocr_api_key: '' });
                            setKeyTestResult(null);
                          }}
                          className="px-2 py-1 text-xs text-muted-foreground hover:text-white transition-colors"
                          title="ล้างข้อมูล"
                        >
                          ✕
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="px-2.5 py-1 text-xs font-bold bg-secondary/70 hover:bg-secondary text-cyan-300 rounded-lg border border-white/10 transition-colors"
                      >
                        {showApiKey ? 'ซ่อน' : 'แสดง'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                    <p className="text-[11px] text-muted-foreground pl-1">
                      * คีย์นี้จะถูกเก็บเป็นความลับเฉพาะหอพักของคุณ ใช้ส่งภาพมิเตอร์เข้าประมวลผลผ่านโมเดล Gemini Vision ความแม่นยำสูง
                    </p>
                    <button
                      type="button"
                      disabled={testingKey || !formData.ocr_api_key?.trim()}
                      onClick={handleTestKey}
                      className="px-4 py-2 bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
                    >
                      {testingKey ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                          กำลังทดสอบการเชื่อมต่อ...
                        </>
                      ) : (
                        <>⚡ ทดสอบ API Key นี้</>
                      )}
                    </button>
                  </div>
                </div>

                {keyTestResult && (
                  <div
                    className={`p-4 rounded-2xl text-xs font-bold flex items-center gap-2.5 border transition-all ${
                      keyTestResult.success
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-rose-500/10 text-rose-300 border-rose-500/30'
                    }`}
                  >
                    <span className="text-base">{keyTestResult.success ? '✅' : '❌'}</span>
                    <span>{keyTestResult.message}</span>
                  </div>
                )}

                <div className="bg-secondary/40 p-4 rounded-2xl border border-white/10 text-xs text-muted-foreground space-y-2">
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <span>💡</span> ประโยชน์ของการใช้ API Key ของตนเอง:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-foreground/70 leading-relaxed pl-1">
                    <li>อ่านตัวเลขมิเตอร์แบบหมุน (Mechanical Wheel) และมิเตอร์ดิจิทัลได้แม่นยำถึง 99.8% แม้ภาพจะเอียงหรือมีแสงสะท้อน</li>
                    <li>โควต้าอิสระไม่จำกัด ไม่ติดคิวประมวลผลกับหอพักอื่น</li>
                    <li>Google มีโควต้าฟรี (Free Tier) รองรับการสแกนหลายพันครั้งต่อเดือนโดยไม่มีค่าใช้จ่าย</li>
                  </ul>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
            >
              {saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกการตั้งค่าหอพัก'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
