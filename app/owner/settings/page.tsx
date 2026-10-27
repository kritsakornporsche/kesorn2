'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import { FIELD_LABELS, LANDLORD_LABELS, RATE_FIELDS, RATE_NOTES } from '@/lib/settings-fields';
import { PHONE_INPUT_PROPS, phoneDigits } from '@/lib/phone';
import { NUMBER_INPUT_PROPS } from '@/lib/number-input';

// The one place for rates and payment details (lib/settings.ts). Owner edits; manager sees it read-only.
// Bills already sent or paid keep their amounts and late fee; draft monthly bills are re-priced on save.
type HistoryRow = { id: number; field: keyof typeof FIELD_LABELS; old_value: string | null; new_value: string | null; changed_at: string; changed_by_name: string | null };

const RATE_HINTS: Record<(typeof RATE_FIELDS)[number], string> = {
  electricity_rate: 'คิดตามหน่วยมิเตอร์ของรอบบิล',
  water_rate: 'เหมาจ่ายต่อผู้พักอาศัย 1 คน / เดือน',
  common_fee: 'เหมาจ่ายต่อห้อง / เดือน',
  late_fee_per_day: 'เฉพาะบิลค่าเช่ารายเดือน นับจากวันครบกำหนด',
  cleaning_fee: 'ค่าเริ่มต้นที่แม่บ้านเสนอเมื่อปิดงานทำความสะอาด (เจ้าของหอตัดสิน)',
};

export default function OwnerSettings() {
  const { data: session } = useSession();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [canEdit, setCanEdit] = useState(false);
  const [notConfigured, setNotConfigured] = useState(false);
  const [history, setHistory] = useState<HistoryRow[]>([]);

  // Rates are kept as typed text; the server checks them (no made-up defaults)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    phone: '',
    landlord_name: '',
    landlord_phone: '',
    tax_id: '',
    electricity_rate: '',
    water_rate: '',
    common_fee: '',
    late_fee_per_day: '',
    cleaning_fee: '',
    promptpay_number: '',
    promptpay_name: '',
    bank_name: '',
    bank_account: '',
    bank_account_name: '',
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

  const [autoPaymentState, setAutoPaymentState] = useState<{
    enabled: boolean;
    isLineRunning: boolean;
    found: boolean;
    targetTitle?: string;
    isLocked?: boolean;
    isTopMost?: boolean;
    message?: string;
    error?: string;
  }>({
    enabled: false,
    isLineRunning: false,
    found: false,
  });
  const [autoPaymentLoading, setAutoPaymentLoading] = useState(false);
  const [autoPaymentMsg, setAutoPaymentMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/owner/settings');
      const data = await res.json();
      setCanEdit(Boolean(data.canEdit));
      setNotConfigured(Boolean(data.success && !data.data));
      if (data.success && data.data) {
        const d = data.data;
        const rate = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(Number(v)));
        setFormData({
          name: d.name || '',
          address: d.address || '',
          phone: d.phone || '',
          landlord_name: d.landlord_name || '',
          landlord_phone: d.landlord_phone || '',
          tax_id: d.tax_id || '',
          electricity_rate: rate(d.electricity_rate),
          water_rate: rate(d.water_rate),
          common_fee: rate(d.common_fee),
          late_fee_per_day: rate(d.late_fee_per_day),
          cleaning_fee: rate(d.cleaning_fee),
          promptpay_number: d.promptpay_number || '',
          promptpay_name: d.promptpay_name || '',
          bank_name: d.bank_name || '',
          bank_account: d.bank_account || '',
          bank_account_name: d.bank_account_name || '',
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
    loadHistory();
  };

  const loadHistory = async () => {
    try {
      const res = await fetch('/api/owner/settings/history');
      const data = await res.json();
      if (data.success) setHistory(data.data || []);
    } catch (e) {
      console.error('Error fetching rate history:', e);
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

  const loadAutoPaymentStatus = async () => {
    try {
      const res = await fetch('/api/owner/settings/auto-payment-line');
      const data = await res.json();
      if (data.success && data.data) {
        setAutoPaymentState(data.data);
      }
    } catch (err) {
      console.error('Error loading auto-payment status:', err);
    }
  };

  const handleToggleAutoPayment = async () => {
    setAutoPaymentLoading(true);
    setAutoPaymentMsg(null);
    try {
      const res = await fetch('/api/owner/settings/auto-payment-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'toggle' }),
      });
      const data = await res.json();
      if (data.data) {
        setAutoPaymentState(data.data);
      }
      if (data.success) {
        setAutoPaymentMsg({ type: 'success', text: data.message || 'บันทึกสถานะเรียบร้อยแล้ว' });
      } else {
        setAutoPaymentMsg({ type: 'error', text: data.message || 'ดำเนินการไม่สำเร็จ' });
      }
    } catch {
      setAutoPaymentMsg({ type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setAutoPaymentLoading(false);
    }
  };

  const handleCheckOrLockWindow = async (action: 'lock' | 'unlock' | 'launch') => {
    setAutoPaymentLoading(true);
    setAutoPaymentMsg(null);
    try {
      const res = await fetch('/api/owner/settings/auto-payment-line', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.data) {
        setAutoPaymentState(data.data);
      }
      if (data.success) {
        setAutoPaymentMsg({ type: 'success', text: data.message || 'สำเร็จ' });
      } else {
        setAutoPaymentMsg({ type: 'error', text: data.message || 'ดำเนินการไม่สำเร็จ' });
      }
    } catch {
      setAutoPaymentMsg({ type: 'error', text: 'เกิดข้อผิดพลาดในการเชื่อมต่อ' });
    } finally {
      setAutoPaymentLoading(false);
    }
  };

  useEffect(() => {
    if (session?.user?.email) {
      loadSettings();
      loadAutoPaymentStatus();
    }
  }, [session]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !canEdit) return;
    
    setSaving(true);
    setMessage({ type: '', text: '' });
    
    try {
      const res = await fetch('/api/owner/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || 'บันทึกข้อมูลหอพักเรียบร้อยแล้ว' });
        setNotConfigured(false);
        loadHistory();
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
    <div className="flex-1 flex items-center justify-center bg-slate-50">
      <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
      <header className="h-20 bg-white/90 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-10 shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight text-slate-900">ตั้งค่าหอพัก</h1>
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-0.5">Dormitory Profile & Search Settings</p>
        </div>
        {!canEdit && (
          <span className="text-[11px] font-black px-3 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">👁 ดูอย่างเดียว (แก้ได้เฉพาะเจ้าของหอ)</span>
        )}
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

          {notConfigured && (
            <div className="p-4 mb-6 rounded-2xl font-bold text-sm bg-amber-500/10 text-amber-300 border border-amber-500/30">
              ⚠️ ยังไม่ตั้งค่าหอพัก — {canEdit ? 'กรอกข้อมูลและอัตราค่าบริการด้านล่างแล้วกดบันทึก' : 'รอเจ้าของหอตั้งค่า'} (ระหว่างนี้ระบบใช้อัตราเริ่มต้นและสร้าง QR ชำระเงินไม่ได้)
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-8">
            <fieldset disabled={!canEdit} className="space-y-8 min-w-0">
            {/* General Info */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6 shadow-xs">
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-4">ข้อมูลทั่วไป (แสดงในหน้าค้นหา)</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">ชื่อหอพัก / กิจการ</label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="เช่น SmartDom Mansion"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">เบอร์โทรศัพท์ติดต่อ</label>
                  <input
                    required
                    value={formData.phone}
                    {...PHONE_INPUT_PROPS}
                    onChange={e => setFormData({ ...formData, phone: phoneDigits(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="เช่น 02-XXX-XXXX"
                  />
                </div>

                {/* Landlord on the contract (Word / print); empty = dotted line. Address = dorm address above. */}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">{LANDLORD_LABELS.landlord_name} (ใช้ในสัญญา)</label>
                  <input
                    type="text"
                    value={formData.landlord_name}
                    onChange={e => setFormData({ ...formData, landlord_name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="ชื่อ-นามสกุล (ว่างได้ — สัญญาจะเว้นเส้นประให้เขียนเอง)"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">{LANDLORD_LABELS.landlord_phone} (ใช้ในสัญญา)</label>
                  <input
                    value={formData.landlord_phone}
                    {...PHONE_INPUT_PROPS}
                    onChange={e => setFormData({ ...formData, landlord_phone: phoneDigits(e.target.value) })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="เช่น 08X-XXX-XXXX (ว่างได้)"
                  />
                  <p className="text-[11px] text-slate-500 pl-1">ที่อยู่ผู้ให้เช่าในสัญญาใช้ที่อยู่หอพัก</p>
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">ลิงก์รูปภาพหน้าปกหอพัก</label>
                  <input
                    type="text"
                    value={formData.cover_image}
                    onChange={e => setFormData({ ...formData, cover_image: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="เช่น https://images.unsplash.com/... (เว้นว่างไว้สำหรับค่าเริ่มต้น)"
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">คำอธิบายรายละเอียดหอพัก (สั้นๆ)</label>
                  <textarea
                    rows={3}
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary resize-none shadow-xs"
                    placeholder="เช่น หอพักระดับพรีเมียม ใกล้มหาวิทยาลัย เดินทางสะดวก สงบ สะอาด..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">ที่อยู่หอพัก</label>
                  <textarea
                    rows={2}
                    required
                    value={formData.address}
                    onChange={e => setFormData({ ...formData, address: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary resize-none shadow-xs"
                    placeholder="ระบุเลขที่ ถนน แขวง เขต..."
                  />
                </div>

                <div className="space-y-2 md:col-span-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">
                      📍 ลิงก์ Google Maps / พิกัดปักหมุดแผนที่ (Map Location URL)
                    </label>
                    {formData.map_url && (
                      <a
                        href={formData.map_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-cyan-700 hover:text-cyan-800 underline font-bold"
                      >
                        ทดสอบเปิดแผนที่ ↗
                      </a>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.map_url}
                    onChange={e => setFormData({ ...formData, map_url: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                    placeholder="เช่น https://maps.google.com/?q=19.0286,99.8967 หรือ ลิงก์แชร์จาก Google Maps"
                  />
                  <p className="text-[11px] text-slate-500 pl-1">
                    * พิกัดนี้จะนำไปแสดงเป็นแผนที่แบบโต้ตอบ (Interactive Map) บนหน้ารายละเอียดหอพักใน Explore เพื่อให้นักศึกษาค้นหาและนำทางมายังหอพักได้ง่าย
                  </p>
                </div>
              </div>
            </div>

            {/* Rates: the only place they are set (every bill reads them from here) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6 shadow-xs">
              <div className="border-b border-slate-200 pb-4">
                <h2 className="text-lg font-black text-slate-900">อัตราค่าบริการ</h2>
                <p className="text-xs text-slate-500 mt-1">
                  ทุกบิลคิดจากอัตราในหน้านี้ · บิลที่ส่งหรือชำระแล้วไม่เปลี่ยน (ค่าปรับใช้อัตรา ณ วันที่ส่งบิล) · ร่างบิลรายเดือนคิดใหม่อัตโนมัติเมื่อแก้ค่าไฟ / ค่าน้ำ / ค่าส่วนกลาง
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {RATE_FIELDS.map((f) => (
                  <div key={f} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">{FIELD_LABELS[f]}</label>
                    <input
                      type="number" {...NUMBER_INPUT_PROPS}
                      step="0.01"
                      min="0"
                      required
                      value={formData[f]}
                      onChange={e => setFormData({ ...formData, [f]: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary disabled:opacity-60 shadow-xs"
                    />
                    <p className="text-[11px] text-slate-500 pl-1">{RATE_HINTS[f]}</p>
                    {RATE_NOTES[f] && <p className="text-[11px] text-amber-700 pl-1">⚖️ {RATE_NOTES[f]}</p>}
                  </div>
                ))}
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">{FIELD_LABELS.tax_id}</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={formData.tax_id}
                    onChange={e => setFormData({ ...formData, tax_id: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary disabled:opacity-60 shadow-xs"
                    placeholder="เลข 13 หลัก (ว่างได้)"
                  />
                  <p className="text-[11px] text-slate-500 pl-1">แสดงในใบเสร็จเฉพาะเมื่อกรอกไว้</p>
                </div>
              </div>
            </div>

            {/* PromptPay Payment Settings */}
            <div className="bg-white border border-indigo-200 rounded-3xl p-8 space-y-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-2">
                <div>
                  <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <span>💳</span> บัญชีพร้อมเพย์สำหรับรับเงิน (PromptPay Settings)
                  </h2>
                  <p className="text-xs text-slate-500 mt-1">
                    ระบบจะนำหมายเลขนี้ไปสร้าง Dynamic PromptPay QR Code ในใบแจ้งหนี้ เพื่อให้ผู้เช่าสแกนจ่ายเงินตรงเข้าบัญชีท่านทันที
                  </p>
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 shrink-0">
                  รับเงินตรง 100%
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">
                      หมายเลขพร้อมเพย์ (PromptPay ID) <span className="text-destructive">*</span>
                    </label>
                    {formData.phone && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, promptpay_number: formData.phone.replace(/[^0-9]/g, '') })}
                        className="text-[10px] text-cyan-700 hover:text-cyan-800 underline font-bold cursor-pointer"
                      >
                        ใช้เบอร์ติดต่อหอพัก
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.promptpay_number}
                    onChange={e => setFormData({ ...formData, promptpay_number: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-indigo-500 shadow-xs"
                    placeholder="เบอร์มือถือ 10 หลัก หรือ เลข ปชช. 13 หลัก"
                  />
                  <p className="text-[11px] text-slate-500 pl-1">
                    * ไม่ต้องใส่ขีด เช่น 0812345678 หรือ 1509900XXXXXX
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">
                      ชื่อบัญชีพร้อมเพย์ (Account Name) <span className="text-destructive">*</span>
                    </label>
                    {formData.name && (
                      <button
                        type="button"
                        onClick={() => setFormData({ ...formData, promptpay_name: formData.name })}
                        className="text-[10px] text-cyan-700 hover:text-cyan-800 underline font-bold cursor-pointer"
                      >
                        ใช้ชื่อหอพัก
                      </button>
                    )}
                  </div>
                  <input
                    type="text"
                    value={formData.promptpay_name}
                    onChange={e => setFormData({ ...formData, promptpay_name: e.target.value })}
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-indigo-500 shadow-xs"
                    placeholder="เช่น นายกฤษณัย สมบูรณ์ หรือ หอพักเกษตร 2"
                  />
                  <p className="text-[11px] text-slate-500 pl-1">
                    * ชื่อนี้จะปรากฏให้ผู้เช่าเห็นเมื่อสแกน QR Code เพื่อยืนยันความถูกต้อง
                  </p>
                </div>
              </div>

              {!formData.promptpay_number.trim() && (
                <p className="text-sm font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl p-3">
                  ⛔ ยังไม่ได้ตั้งหมายเลขพร้อมเพย์ — ผู้เช่าและผู้จองจะสร้าง QR ชำระเงินและตรวจสลิปไม่ได้
                </p>
              )}

              {/* Bank account for transfers (printed on the contract form with PromptPay) */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {(['bank_name', 'bank_account', 'bank_account_name'] as const).map((f) => (
                  <div key={f} className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">{FIELD_LABELS[f]}</label>
                    <input
                      type="text"
                      value={formData[f]}
                      onChange={e => setFormData({ ...formData, [f]: e.target.value })}
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-60 shadow-xs"
                      placeholder={f === 'bank_name' ? 'เช่น ธนาคารกสิกรไทย สาขา… ออมทรัพย์' : f === 'bank_account' ? 'เช่น 123-4-56789-0' : 'ชื่อเจ้าของบัญชี'}
                    />
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 pl-1">* พร้อมเพย์และบัญชีธนาคารพิมพ์ลงในแบบฟอร์มสัญญาเช่า (ว่าง = ไม่พิมพ์บรรทัดนั้น)</p>

              <div className="flex items-start gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs text-slate-600">
                <span className="text-indigo-600 text-sm">💡</span>
                <span>
                  <strong>ระบบ Dynamic PromptPay QR Code:</strong> ผู้เช่าจะเห็น QR Code ที่ระบุยอดเงินถูกต้องตรงเป๊ะ สแกนจ่ายได้ทุกแอปธนาคาร เงินโอนเข้าบัญชีเจ้าของหอโดยตรงแบบเรียลไทม์ ไม่มีหักเปอร์เซ็นต์
                </span>
              </div>
            </div>

            {/* Auto-Payment & LINE Krungthai Connext Window Lock */}
            <div className="bg-white border border-emerald-200 rounded-3xl p-8 space-y-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-emerald-50 rounded-2xl border border-emerald-200 text-emerald-600 text-xl">
                    ⚡
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      ระบบชำระเงินอัตโนมัติ (LINE Krungthai Connext)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      ตรวจจับยอดโอนเงินอัตโนมัติผ่านการตรึงหน้าต่างแชท Krungthai Connext
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {autoPaymentState.enabled ? (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      ระบบเปิดใช้งาน
                    </span>
                  ) : (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                      ระบบปิดอยู่
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold text-slate-700">สถานะหน้าต่าง:</span>
                    {autoPaymentState.isLocked ? (
                      <span className="text-xs font-black text-emerald-700 bg-emerald-100/70 px-2.5 py-0.5 rounded-lg border border-emerald-300">
                        🔒 ล็อกอยู่บนสุด (ห้ามพับ)
                      </span>
                    ) : autoPaymentState.found ? (
                      <span className="text-xs font-bold text-amber-700 bg-amber-100/70 px-2.5 py-0.5 rounded-lg border border-amber-300">
                        ⚠️ เปิดอยู่แต่ยังไม่ได้ล็อก
                      </span>
                    ) : autoPaymentState.isLineRunning ? (
                      <span className="text-xs font-bold text-slate-600 bg-slate-200/70 px-2.5 py-0.5 rounded-lg">
                        ยังไม่พบหน้าต่างแชท Krungthai Connext
                      </span>
                    ) : (
                      <span className="text-xs font-bold text-rose-600 bg-rose-50 px-2.5 py-0.5 rounded-lg border border-rose-200">
                        ยังไม่ได้เปิดโปรแกรม LINE
                      </span>
                    )}
                  </div>
                  {autoPaymentState.targetTitle && (
                    <p className="text-[11px] text-slate-500 font-mono">
                      ชื่อหน้าต่าง: {autoPaymentState.targetTitle}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {canEdit && (
                    <>
                      <button
                        type="button"
                        disabled={autoPaymentLoading}
                        onClick={handleToggleAutoPayment}
                        className={`px-4 py-2.5 text-xs font-black rounded-xl transition-all shadow-xs cursor-pointer flex items-center gap-1.5 ${
                          autoPaymentState.enabled
                            ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        {autoPaymentLoading ? (
                          <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        ) : autoPaymentState.enabled ? (
                          'ปิดระบบชำระเงินอัตโนมัติ'
                        ) : (
                          'เปิดระบบชำระเงินอัตโนมัติ'
                        )}
                      </button>

                      {!autoPaymentState.isLineRunning && (
                        <button
                          type="button"
                          disabled={autoPaymentLoading}
                          onClick={() => handleCheckOrLockWindow('launch')}
                          className="px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer shadow-xs"
                        >
                          เปิด LINE
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={autoPaymentLoading}
                        onClick={() => handleCheckOrLockWindow(autoPaymentState.isLocked ? 'unlock' : 'lock')}
                        className="px-3 py-2 text-xs font-bold rounded-xl bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 transition-all cursor-pointer shadow-xs"
                      >
                        {autoPaymentState.isLocked ? 'ปลดล็อกหน้าต่าง' : 'ล็อกหน้าต่างแชท'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {autoPaymentMsg && (
                <div
                  className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
                    autoPaymentMsg.type === 'success'
                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      : 'bg-rose-50 text-rose-800 border-rose-200'
                  }`}
                >
                  <span>{autoPaymentMsg.type === 'success' ? '✅' : '⚠️'}</span>
                  <span>{autoPaymentMsg.text}</span>
                </div>
              )}
            </div>

            {/* Features (Checkboxes) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-6 shadow-xs">
              <h2 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-4">สิ่งอำนวยความสะดวกและเงื่อนไข (เพื่อการค้นหา)</h2>
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
                    className={`flex items-center gap-3 p-4 rounded-2xl border select-none transition-all ${
                      canEdit ? 'cursor-pointer' : 'cursor-default opacity-60'
                    } ${
                      (formData as any)[item.key]
                        ? 'border-primary bg-primary/10 text-primary'
                        : `border-slate-200 bg-slate-50 text-slate-700 ${canEdit ? 'hover:border-slate-300' : ''}`
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
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">สิ่งอำนวยความสะดวกอื่นๆ (คั่นด้วยเครื่องหมายจุลภาค ,)</label>
                <input
                  type="text"
                  value={formData.facilities}
                  onChange={e => setFormData({ ...formData, facilities: e.target.value })}
                  className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-slate-900 font-bold text-sm focus:outline-none focus:border-primary shadow-xs"
                  placeholder="เช่น ฟิตเนส, สระว่ายน้ำ, ระบบความปลอดภัย 24 ชม., กล้องวงจรปิด"
                />
              </div>
            </div>

            {/* AI Meter OCR Configuration (owner only: managers do not get the key) */}
            {canEdit && (
            <div className="bg-white border border-cyan-200 rounded-3xl p-8 space-y-6 shadow-xs relative overflow-hidden">
              <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-3">
                <div className="flex items-center gap-3">
                  <span className="p-3 bg-cyan-50 rounded-2xl border border-cyan-200 text-cyan-700 text-xl">
                    🤖
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      ระบบ AI สแกนอ่านมิเตอร์น้ำ-ไฟ (Meter OCR AI Key)
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      เจ้าของหอพักสามารถระบุ Google Gemini API Key ส่วนตัว เพื่อใช้อ่านมิเตอร์ด้วย AI ความแม่นยำสูง
                    </p>
                    {/* commit 24c: ID card OCR removed — the key is for meter photos only */}
                    <p className="text-xs font-bold text-cyan-700 mt-1">
                      ใช้สำหรับอ่านค่ามิเตอร์เท่านั้น (ภาพหน้าปัดมิเตอร์ไม่มีข้อมูลส่วนบุคคล)
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {formData.ocr_api_key?.trim() ? (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1.5 shadow-xs">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                      ใช้ Key ส่วนตัวของหอพัก
                    </span>
                  ) : (
                    <span className="text-[11px] font-black uppercase tracking-wider px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                      ใช้ Key ส่วนกลาง / Local OCR
                    </span>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block pl-1">
                      Google Gemini API Key (ฟรี ไม่มีค่าใช้จ่าย)
                    </label>
                    <a
                      href="https://aistudio.google.com/app/apikey"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[11px] font-bold text-cyan-700 hover:text-cyan-800 hover:underline flex items-center gap-1 transition-colors"
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
                      className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3.5 pr-28 text-slate-900 font-mono text-sm focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-400 shadow-xs"
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
                          className="px-2 py-1 text-xs text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                          title="ล้างข้อมูล"
                        >
                          ✕
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="px-2.5 py-1 text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 transition-colors cursor-pointer"
                      >
                        {showApiKey ? 'ซ่อน' : 'แสดง'}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1 gap-2 flex-wrap">
                    <p className="text-[11px] text-slate-500 pl-1">
                      * คีย์นี้จะถูกเก็บเป็นความลับเฉพาะหอพักของคุณ ใช้ส่งภาพมิเตอร์เข้าประมวลผลผ่านโมเดล Gemini Vision ความแม่นยำสูง
                    </p>
                    <button
                      type="button"
                      disabled={testingKey || !formData.ocr_api_key?.trim()}
                      onClick={handleTestKey}
                      className="px-4 py-2 bg-cyan-50 hover:bg-cyan-100 border border-cyan-200 text-cyan-800 text-xs font-bold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 shadow-xs cursor-pointer"
                    >
                      {testingKey ? (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-cyan-600 border-t-transparent rounded-full animate-spin"></div>
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
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : 'bg-rose-50 text-rose-800 border-rose-200'
                    }`}
                  >
                    <span className="text-base">{keyTestResult.success ? '✅' : '❌'}</span>
                    <span>{keyTestResult.message}</span>
                  </div>
                )}

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 text-xs text-slate-600 space-y-2">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <span>💡</span> ประโยชน์ของการใช้ API Key ของตนเอง:
                  </div>
                  <ul className="list-disc list-inside space-y-1 text-[11px] text-slate-600 leading-relaxed pl-1">
                    <li>อ่านตัวเลขมิเตอร์แบบหมุน (Mechanical Wheel) และมิเตอร์ดิจิทัลได้แม่นยำถึง 99.8% แม้ภาพจะเอียงหรือมีแสงสะท้อน</li>
                    <li>โควต้าอิสระไม่จำกัด ไม่ติดคิวประมวลผลกับหอพักอื่น</li>
                    <li>Google มีโควต้าฟรี (Free Tier) รองรับการสแกนหลายพันครั้งต่อเดือนโดยไม่มีค่าใช้จ่าย</li>
                  </ul>
                </div>
              </div>
            </div>
            )}
            </fieldset>

            {canEdit && message.text && (
              <div role="alert" className={`p-4 rounded-2xl font-bold text-sm text-center ${
                message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'
              }`}>
                {message.type === 'error' ? '⛔ บันทึกไม่สำเร็จ: ' : '✓ '}{message.text}
              </div>
            )}
            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="w-full py-4 bg-primary text-white rounded-2xl font-black text-sm uppercase tracking-widest hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 cursor-pointer"
              >
                {saving ? 'กำลังบันทึกข้อมูล...' : 'บันทึกการตั้งค่าหอพัก'}
              </button>
            )}
          </form>

          {/* Who changed which rate / payment detail, and when */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 space-y-4 mt-8 shadow-xs">
            <h2 className="text-lg font-black text-slate-900 border-b border-slate-200 pb-4">ประวัติการแก้อัตราและข้อมูลรับเงิน</h2>
            {history.length === 0 ? (
              <p className="text-sm text-slate-500">ยังไม่มีการแก้ไข</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs min-w-[560px]">
                  <thead>
                    <tr className="text-slate-500 border-b border-slate-200">
                      <th className="py-2 pr-3">เมื่อ</th>
                      <th className="py-2 pr-3">รายการ</th>
                      <th className="py-2 pr-3">จาก</th>
                      <th className="py-2 pr-3">เป็น</th>
                      <th className="py-2">โดย</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((h) => (
                      <tr key={h.id} className="text-slate-800">
                        <td className="py-2 pr-3 whitespace-nowrap">{new Date(h.changed_at).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td className="py-2 pr-3">{FIELD_LABELS[h.field] || h.field}</td>
                        <td className="py-2 pr-3 font-mono text-slate-500">{h.old_value ?? '—'}</td>
                        <td className="py-2 pr-3 font-mono font-bold text-slate-900">{h.new_value ?? '—'}</td>
                        <td className="py-2">{h.changed_by_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
