'use client';

import { useState, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { cn } from '@/lib/utils';
import PartyFields from '@/components/PartyFields';
import { EMPTY_PARTY, checkParty, type PartyValue } from '@/lib/contract-party';
import { PHONE_INPUT_PROPS, phoneDigits } from '@/lib/phone';

type Role = 'guest';

type FormState = 'idle' | 'loading' | 'success' | 'error';

interface CreatedUser {
  id: number;
  name: string;
  email: string;
  role: Role;
}

export default function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [formState, setFormState] = useState<FormState>('idle');
  const [message, setMessage] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [fields, setFields] = useState({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
  });

  // Tenant Profile Fields
  const [party, setParty] = useState<PartyValue>({ ...EMPTY_PARTY });
  const [phone, setPhone] = useState('');
  const [parentPhone, setParentPhone] = useState('');

  const partyCheck = checkParty(party);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [pdpaConsent, setPdpaConsent] = useState(false);
  const [usernameAvailable, setUsernameAvailable] = useState<boolean | null>(null);
  const [checkingName, setCheckingName] = useState(false);
  const nameCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsernameAvailability = (val: string) => {
    setUsernameAvailable(null);
    if (nameCheckTimer.current) clearTimeout(nameCheckTimer.current);
    if (val.trim().length >= 3) {
      setCheckingName(true);
      nameCheckTimer.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/auth/signup?username=${encodeURIComponent(val.trim())}`);
          const data = await res.json();
          setUsernameAvailable(data.usernameAvailable ?? data.available);
        } catch {
          setUsernameAvailable(null);
        } finally {
          setCheckingName(false);
        }
      }, 600);
    } else {
      setCheckingName(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFields(prev => {
      const next = { ...prev, [name]: value };
      if (name === 'username') {
        checkUsernameAvailability(value);
      }
      return next;
    });

    if (name === 'email') {
      setEmailAvailable(null);
      if (emailCheckTimer.current) clearTimeout(emailCheckTimer.current);
      if (value.includes('@') && value.includes('.')) {
        setCheckingEmail(true);
        emailCheckTimer.current = setTimeout(async () => {
          try {
            const res = await fetch(`/api/auth/signup?email=${encodeURIComponent(value)}`);
            const data = await res.json();
            setEmailAvailable(data.emailAvailable ?? data.available);
          } catch {
            setEmailAvailable(null);
          } finally {
            setCheckingEmail(false);
          }
        }, 600);
      } else {
        setCheckingEmail(false);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formState === 'loading') return;
    setMessage('');

    if (!fields.username.trim() || !fields.email.trim()) {
      setMessage('กรุณากรอกชื่อผู้ใช้งานและอีเมล');
      return;
    }

    if (emailAvailable === false) {
      setMessage('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น');
      return;
    }

    if (usernameAvailable === false) {
      setMessage('ชื่อผู้ใช้งานนี้ถูกใช้งานแล้ว กรุณาใช้ชื่ออื่น');
      return;
    }

    if (fields.password !== fields.confirm_password) {
      setMessage('รหัสผ่านไม่ตรงกัน กรุณากรอกใหม่อีกครั้ง');
      return;
    }

    if (fields.password.length < 8) {
      setMessage('รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร');
      return;
    }

    // Validate phone numbers
    if (!phone || phone.length < 9) {
      setMessage('กรุณากรอกเบอร์โทรศัพท์ผู้เช่าให้ถูกต้อง (9-10 หลัก)');
      return;
    }
    if (!parentPhone || parentPhone.length < 9) {
      setMessage('กรุณากรอกเบอร์โทรผู้ปกครองให้ถูกต้อง (9-10 หลัก)');
      return;
    }

    // Validate party details
    if (!partyCheck.ok) {
      setMessage(partyCheck.message);
      return;
    }

    if (!pdpaConsent) {
      setMessage('กรุณากดยินยอมเปิดเผยข้อมูลและยอมรับข้อตกลงการใช้งาน (PDPA)');
      return;
    }

    setFormState('loading');

    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: fields.username,
          email: fields.email,
          password: fields.password,
          phone,
          parentPhone,
          party,
        }),
      });

      const data = await res.json();

      if (data.success) {
        try {
          await signIn('credentials', {
            email: fields.email,
            password: fields.password,
            redirect: false,
          });
        } catch (e) {
          console.warn('[NextAuth signIn error ignored]', e);
        }

        if (typeof window !== 'undefined') {
          localStorage.setItem('userEmail', fields.email.toLowerCase().trim());
        }

        setFormState('success');
        setMessage(data.message);
        setCreatedUser(data.data);

        const redirectPath = callbackUrl || '/explore';

        setTimeout(() => {
          if (typeof window !== 'undefined') {
            window.location.href = redirectPath;
          } else {
            router.push(redirectPath);
          }
        }, 1500);
      } else {
        setFormState('error');
        setMessage(data.message);
      }
    } catch (err: any) {
      console.error('[Signup submit error]', err);
      setFormState('error');
      setMessage(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่');
    }
  };

  const inputClass =
    'w-full rounded-2xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-900 focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-xs';

  return (
    <div className="relative flex min-h-screen flex-col bg-background px-4 sm:px-6 py-6 sm:py-10 overflow-x-hidden overflow-y-auto">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[600px] h-[600px] bg-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[500px] h-[500px] bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      <Link
        href="/"
        className="absolute top-4 left-4 sm:top-8 sm:left-8 z-30 inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-card/90 sm:bg-transparent backdrop-blur-md sm:backdrop-blur-none border border-border/70 sm:border-transparent text-xs sm:text-[11px] font-bold text-muted-foreground hover:text-primary hover:border-primary/40 transition-all shadow-sm sm:shadow-none active:scale-95 group cursor-pointer"
        aria-label="กลับหน้าหลัก"
      >
        <svg className="w-4 h-4 transition-transform group-hover:-translate-x-0.5 text-muted-foreground group-hover:text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>กลับหน้าหลัก</span>
      </Link>

      <div className="relative z-10 w-full max-w-2xl mx-auto my-auto animate-reveal pt-12 sm:pt-4 pb-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="mx-auto flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-primary font-display font-bold text-primary-foreground text-lg shadow-2xl shadow-primary/20 mb-4 sm:mb-5">
            S
          </div>
          <h1 className="text-2xl sm:text-3xl font-display tracking-tight text-foreground font-black italic ornament">
            สร้างบัญชีผู้ใช้งาน
          </h1>
          <p className="mt-2 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
            กรอกข้อมูลผู้เช่าเพื่อใช้ในการทำสัญญาและจองห้องพัก
          </p>
        </div>

        {formState === 'success' && createdUser ? (
          <div className="space-y-6 sm:space-y-8 bg-card rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 border border-border shadow-xl text-center">
            <div className="w-16 h-16 sm:w-20 sm:h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4 sm:mb-6">
              <svg className="w-10 h-10 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-3xl font-display font-black text-foreground">ยินดีต้อนรับ!</h2>
            <p className="text-muted-foreground font-black uppercase text-[10px] tracking-widest">{message}</p>
            <p className="text-xs text-muted-foreground font-bold">ระบบกำลังพาคุณไปยังหน้าหลัก...</p>
          </div>
        ) : (
          <div className="bg-card rounded-[2rem] sm:rounded-[2.5rem] p-5 sm:p-8 border border-border shadow-2xl">
            <form onSubmit={handleSubmit} className="space-y-6">
              
              {/* ส่วนที่ 1: บัญชีผู้ใช้ */}
              <div className="space-y-4">
                <div className="border-b border-border/60 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-primary">1. ข้อมูลบัญชี</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ชื่อผู้ใช้งาน (Username) <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <input
                        name="username"
                        required
                        minLength={3}
                        value={fields.username}
                        onChange={handleChange}
                        className={cn(
                          "w-full rounded-2xl border bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-xs pr-12",
                          usernameAvailable === false ? 'border-destructive' : usernameAvailable === true ? 'border-emerald-500 font-black' : 'border-slate-300 focus:border-primary'
                        )}
                        placeholder="เช่น smartuser99"
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        {checkingName && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                        {!checkingName && usernameAvailable === true && <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        {!checkingName && usernameAvailable === false && <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">อีเมล <span className="text-rose-500">*</span></label>
                    <div className="relative">
                      <input
                        name="email"
                        type="email"
                        required
                        value={fields.email}
                        onChange={handleChange}
                        className={cn(
                          "w-full rounded-2xl border bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white outline-none transition-all placeholder:text-slate-400 shadow-xs pr-12",
                          emailAvailable === false ? 'border-destructive' : emailAvailable === true ? 'border-emerald-500 font-black' : 'border-slate-300 focus:border-primary'
                        )}
                        placeholder="you@example.com"
                      />
                      <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                        {checkingEmail && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                        {!checkingEmail && emailAvailable === true && <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                        {!checkingEmail && emailAvailable === false && <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">รหัสผ่าน <span className="text-rose-500">*</span></label>
                    <input
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={8}
                      value={fields.password}
                      onChange={handleChange}
                      placeholder="อย่างน้อย 8 ตัวอักษร"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-xs"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ยืนยันรหัสผ่าน <span className="text-rose-500">*</span></label>
                    <input
                      name="confirm_password"
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={fields.confirm_password}
                      onChange={handleChange}
                      placeholder="กรอกรหัสผ่านซ้ำอีกครั้ง"
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* ส่วนที่ 2: ข้อมูลติดต่อ */}
              <div className="space-y-4">
                <div className="border-b border-border/60 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-primary">2. ข้อมูลติดต่อ</h3>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      เบอร์โทรศัพท์ผู้เช่า <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={phone}
                      onChange={(e) => setPhone(phoneDigits(e.target.value))}
                      placeholder="08X-XXX-XXXX"
                      {...PHONE_INPUT_PROPS}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      เบอร์โทรผู้ปกครอง <span className="text-rose-500">*</span>
                    </label>
                    <input
                      value={parentPhone}
                      onChange={(e) => setParentPhone(phoneDigits(e.target.value))}
                      placeholder="08X-XXX-XXXX (ผู้ปกครอง)"
                      {...PHONE_INPUT_PROPS}
                      className="w-full rounded-2xl border border-slate-300 bg-white px-5 py-3 text-sm font-bold text-slate-900 focus:bg-white focus:border-primary outline-none transition-all placeholder:text-slate-400 shadow-xs"
                    />
                  </div>
                </div>
              </div>

              {/* ส่วนที่ 3: ข้อมูลผู้เช่าและที่อยู่ตามบัตรประชาชน */}
              <div className="space-y-4">
                <div className="border-b border-border/60 pb-2">
                  <h3 className="text-xs font-black uppercase tracking-wider text-primary">3. ข้อมูลผู้เช่าและที่อยู่ตามบัตรประชาชน</h3>
                </div>

                <PartyFields
                  value={party}
                  onChange={setParty}
                  inputClass={inputClass}
                  labelClass="text-xs font-bold text-muted-foreground block"
                  hintClass="text-[11px] font-bold text-muted-foreground block"
                />

                {!partyCheck.ok && party.houseNo && (
                  <p className="text-[11px] font-bold text-rose-500 bg-rose-500/10 p-2.5 rounded-xl border border-rose-500/20">
                    {partyCheck.message}
                  </p>
                )}
              </div>

              {/* PDPA Consent Checkbox */}
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-2xl border border-border">
                <input
                  type="checkbox"
                  id="pdpa-consent"
                  checked={pdpaConsent}
                  onChange={(e) => setPdpaConsent(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded text-primary border-border focus:ring-primary focus:ring-1 cursor-pointer bg-background"
                />
                <label htmlFor="pdpa-consent" className="text-xs text-muted-foreground font-semibold leading-relaxed cursor-pointer select-none">
                  ฉันยินยอมให้รวบรวม ใช้ และเปิดเผยข้อมูลส่วนบุคคล ตาม{' '}
                  <span className="text-primary hover:underline font-bold">นโยบายความเป็นส่วนตัว (PDPA)</span>{' '}
                  และ{' '}
                  <span className="text-primary hover:underline font-bold">ข้อตกลงการใช้บริการ</span>
                </label>
              </div>

              {message && <p className="text-center text-xs text-destructive font-black">{message}</p>}

              <button
                type="submit"
                disabled={formState === 'loading' || emailAvailable === false || usernameAvailable === false}
                className="w-full rounded-full bg-primary py-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground shadow-2xl shadow-primary/20 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer mt-2"
              >
                {formState === 'loading' ? 'กำลังดำเนินการ...' : 'สมัครสมาชิก →'}
              </button>
            </form>
          </div>
        )}

        <p className="text-center text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground mt-6">
          มีบัญชีอยู่แล้ว?{' '}
          <Link href="/signin" className="text-primary border-b border-primary/20 font-bold">เข้าสู่ระบบที่นี่</Link>
        </p>
      </div>
    </div>
  );
}
