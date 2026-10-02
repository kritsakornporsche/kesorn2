'use client';

import { useState, useRef, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { cn } from '@/lib/utils';
import CloudflareTurnstile from '@/app/components/CloudflareTurnstile';

type Role = 'guest' | 'owner';

const roleConfig: Record<Role, { label: string; desc: string; icon: string }> = {
  guest: {
    label: 'แขก',
    desc: 'เลือกดูและจองห้องพัก',
    icon: '🏠',
  },
  owner: {
    label: 'เจ้าของหอพัก',
    desc: 'ควบคุมระบบทั้งหมด วิเคราะห์ข้อมูล และจัดการหอพัก',
    icon: '👑',
  }
};

type FormState = 'idle' | 'loading' | 'success' | 'error';

interface CreatedUser {
  id: number;
  full_name: string;
  email: string;
  role: Role;
}

export default function SignupContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [selectedRole, setSelectedRole] = useState<Role>('guest');
  const [formState, setFormState] = useState<FormState>('idle');
  const [message, setMessage] = useState('');
  const [createdUser, setCreatedUser] = useState<CreatedUser | null>(null);
  const [emailAvailable, setEmailAvailable] = useState<boolean | null>(null);
  const [checkingEmail, setCheckingEmail] = useState(false);
  const emailCheckTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cloudflare Turnstile & OTP States ──
  const [turnstileToken, setTurnstileToken] = useState<string>('');
  const [isOtpSent, setIsOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifyingOtp, setVerifyingOtp] = useState(false);
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpMessage, setOtpMessage] = useState('');

  // Countdown timer for resending OTP
  useEffect(() => {
    if (otpCooldown <= 0) return;
    const interval = setInterval(() => {
      setOtpCooldown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [otpCooldown]);

  const [fields, setFields] = useState({
    username: '',
    email: '',
    password: '',
    confirm_password: '',
  });
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
      setIsEmailVerified(false);
      setIsOtpSent(false);
      setOtpCode('');
      setOtpMessage('');
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

  // ── Send Email OTP with Cloudflare Turnstile ──
  const handleSendOtp = async () => {
    if (!fields.email || !fields.email.includes('@')) {
      setOtpMessage('กรุณากรอกอีเมลให้ถูกต้องก่อนรับรหัส OTP');
      return;
    }
    if (emailAvailable === false) {
      setOtpMessage('อีเมลนี้ถูกใช้งานแล้ว กรุณาใช้อีเมลอื่น');
      return;
    }
    if (!turnstileToken) {
      setOtpMessage('กรุณายืนยัน Cloudflare Turnstile ว่าไม่ใช่บอทก่อนขอรับรหัส OTP');
      return;
    }

    setSendingOtp(true);
    setOtpMessage('');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send_otp',
          email: fields.email,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsOtpSent(true);
        setOtpCooldown(60);
        setOtpMessage('✓ ส่งรหัส OTP เรียบร้อยแล้ว โปรดตรวจสอบกล่องข้อความในอีเมลของคุณ');
        if (data.devOtp) {
          // Helpful auto-fill in development
          setOtpCode(data.devOtp);
        }
      } else {
        setOtpMessage(data.message || 'ไม่สามารถส่งรหัส OTP ได้');
      }
    } catch {
      setOtpMessage('เกิดข้อผิดพลาดในการเชื่อมต่อ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSendingOtp(false);
    }
  };

  // ── Verify Email OTP ──
  const handleVerifyOtp = async () => {
    if (!otpCode || otpCode.trim().length !== 6) {
      setOtpMessage('กรุณากรอกรหัส OTP 6 หลัก');
      return;
    }

    setVerifyingOtp(true);
    setOtpMessage('');
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          email: fields.email,
          otp: otpCode.trim(),
        }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEmailVerified(true);
        setOtpMessage('✓ ยืนยันอีเมลสำเร็จเรียบร้อยแล้ว');
      } else {
        setOtpMessage(data.message || 'รหัส OTP ไม่ถูกต้อง');
      }
    } catch {
      setOtpMessage('เกิดข้อผิดพลาดในการตรวจสอบรหัส OTP');
    } finally {
      setVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formState === 'loading') return;
    setMessage('');

    if (!fields.username.trim() || !fields.email.trim()) {
      setMessage('กรุณากรอกข้อมูลให้ครบถ้วน');
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

    if (!isEmailVerified) {
      setMessage('กรุณายืนยันรหัส OTP ทางอีเมลให้เรียบร้อยก่อนสมัครสมาชิก');
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
          role: selectedRole,
        }),
      });

      const data = await res.json();

      if (data.success) {
        try {
          await signIn('credentials', {
             email: fields.email,
             password: fields.password,
             redirect: false
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
        
        let redirectPath = selectedRole === 'owner' ? '/owner' : '/explore';
        if (callbackUrl && selectedRole === 'guest') {
          redirectPath = callbackUrl;
        }

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

      <div className="relative z-10 w-full max-w-lg mx-auto my-auto animate-reveal pt-12 sm:pt-4 pb-8">
        <div className="text-center mb-6 sm:mb-8">
          <div className="mx-auto flex h-11 w-11 sm:h-13 sm:w-13 items-center justify-center rounded-2xl bg-primary font-display font-bold text-primary-foreground text-lg shadow-2xl shadow-primary/20 mb-4 sm:mb-5">
            S
          </div>
          <h1 className="text-2xl sm:text-3xl font-display tracking-tight text-foreground font-black italic ornament">
            สร้างบัญชีใหม่
          </h1>
          <p className="mt-2 text-muted-foreground font-black uppercase text-[10px] tracking-widest">
            เข้าร่วมคอมมูนิตี้ SmartDom เพื่อชีวิตที่จัดการง่ายขึ้น
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
            <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-5">
              
              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ชื่อผู้ใช้งาน (Username)</label>
                <div className="relative">
                  <input
                    name="username"
                    required
                    minLength={3}
                    value={fields.username}
                    onChange={handleChange}
                    className={cn(
                      "w-full rounded-2xl border bg-[#0F172A] px-5 py-3 text-sm font-bold text-white focus:bg-[#0F172A] outline-none transition-all placeholder:text-white/30 pr-12",
                      usernameAvailable === false ? 'border-destructive' : usernameAvailable === true ? 'border-emerald-400 font-black' : 'border-white/10 focus:border-primary'
                    )}
                    placeholder="เช่น smartowner99"
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    {checkingName && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                    {!checkingName && usernameAvailable === true && <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    {!checkingName && usernameAvailable === false && <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>}
                  </div>
                </div>
                {usernameAvailable === false && (
                  <p className="text-[11px] font-bold text-destructive mt-1">⚠️ ชื่อผู้ใช้งานนี้ถูกใช้งานแล้วในระบบ กรุณาใช้ชื่อผู้ใช้งานอื่น</p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">อีเมล</label>
                  {isEmailVerified && (
                    <span className="text-[10px] font-bold text-emerald-400 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> ยืนยันแล้ว
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    name="email"
                    type="email"
                    required
                    disabled={isEmailVerified}
                    value={fields.email}
                    onChange={handleChange}
                    className={cn(
                      "w-full rounded-2xl border bg-[#0F172A] px-5 py-3 text-sm font-bold text-white focus:bg-[#0F172A] outline-none transition-all placeholder:text-white/30 pr-12",
                      isEmailVerified ? 'border-emerald-500 bg-emerald-950/20' :
                      emailAvailable === false ? 'border-destructive' : emailAvailable === true ? 'border-emerald-400 font-black' : 'border-white/10 focus:border-primary'
                    )}
                    placeholder="you@example.com"
                  />
                  <div className="absolute inset-y-0 right-4 flex items-center pointer-events-none">
                    {checkingEmail && <div className="w-4 h-4 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />}
                    {!checkingEmail && isEmailVerified && <span className="text-emerald-400 font-bold">✓</span>}
                    {!checkingEmail && !isEmailVerified && emailAvailable === true && <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7"/></svg>}
                    {!checkingEmail && emailAvailable === false && <svg className="w-4 h-4 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12"/></svg>}
                  </div>
                </div>

                {/* Cloudflare Turnstile & OTP Section */}
                {!isEmailVerified && fields.email.includes('@') && emailAvailable !== false && (
                  <div className="mt-3 p-3.5 rounded-2xl bg-secondary/30 border border-border/80 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground flex items-center gap-1.5">
                        🛡️ ยืนยันอีเมลด้วย Cloudflare OTP
                      </span>
                      {turnstileToken && (
                        <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-2 py-0.5 rounded-md border border-emerald-500/20">
                          ผ่าน CAPTCHA แล้ว
                        </span>
                      )}
                    </div>

                    {/* Turnstile Widget */}
                    {!turnstileToken && (
                      <CloudflareTurnstile
                        onVerify={(token) => setTurnstileToken(token)}
                        onError={() => setOtpMessage('Cloudflare Turnstile ตรวจสอบไม่ผ่าน')}
                        onExpire={() => setTurnstileToken('')}
                      />
                    )}

                    {/* Request OTP Button */}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSendOtp}
                        disabled={sendingOtp || otpCooldown > 0 || !turnstileToken}
                        className="flex-1 py-2.5 px-4 rounded-xl text-xs font-bold bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 transition-all active:scale-95 disabled:opacity-40 disabled:pointer-events-none cursor-pointer"
                      >
                        {sendingOtp ? 'กำลังส่งรหัส OTP...' :
                         otpCooldown > 0 ? `ส่งรหัสใหม่ได้ใน (${otpCooldown}s)` :
                         isOtpSent ? 'ส่งรหัส OTP ใหม่อีกครั้ง' : 'ขอรับรหัส OTP เพื่อยืนยันอีเมล'}
                      </button>
                    </div>

                    {/* OTP 6-Digit Input */}
                    {isOtpSent && (
                      <div className="space-y-2 pt-1 border-t border-border/40">
                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                          กรอกรหัส OTP 6 หลักที่ได้รับในอีเมล
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            maxLength={6}
                            value={otpCode}
                            onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="123456"
                            className="flex-1 rounded-xl border border-white/10 bg-[#0F172A] px-4 py-2 text-center text-base tracking-[0.3em] font-mono font-black text-white focus:border-emerald-400 outline-none"
                          />
                          <button
                            type="button"
                            onClick={handleVerifyOtp}
                            disabled={verifyingOtp || otpCode.length !== 6}
                            className="py-2 px-5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs transition-all active:scale-95 disabled:opacity-40 cursor-pointer shadow-sm"
                          >
                            {verifyingOtp ? 'ตรวจสอบ...' : 'ยืนยันรหัส'}
                          </button>
                        </div>
                      </div>
                    )}

                    {otpMessage && (
                      <p className={cn(
                        "text-[11px] font-bold text-center",
                        otpMessage.startsWith('✓') ? 'text-emerald-400' : 'text-amber-400'
                      )}>
                        {otpMessage}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">รหัสผ่าน</label>
                  <input
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={8}
                    value={fields.password}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-white/10 bg-[#0F172A] px-5 py-3 text-sm font-bold text-white focus:bg-[#0F172A] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-white/30"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ยืนยันรหัสผ่าน</label>
                  <input
                    name="confirm_password"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={fields.confirm_password}
                    onChange={handleChange}
                    className="w-full rounded-2xl border border-white/10 bg-[#0F172A] px-5 py-3 text-sm font-bold text-white focus:bg-[#0F172A] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-white/30"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">ฉันคือ...</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(Object.keys(roleConfig) as Role[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setSelectedRole(role)}
                      className={cn(
                        "flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border transition-all text-center h-full cursor-pointer",
                        selectedRole === role ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary" : "border-border hover:bg-secondary"
                      )}
                    >
                      <span className="text-2xl">{roleConfig[role].icon}</span>
                      <div>
                        <p className="text-xs font-black text-foreground leading-tight">{roleConfig[role].label}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* PDPA Consent Checkbox */}
              <div className="flex items-start gap-3 p-3 bg-muted/40 rounded-2xl border border-border mt-3">
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
                disabled={formState === 'loading' || emailAvailable === false || usernameAvailable === false || !isEmailVerified}
                className="w-full rounded-full bg-primary py-4 text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground shadow-2xl shadow-primary/20 hover:-translate-y-0.5 transition-all active:scale-95 disabled:opacity-50 cursor-pointer mt-2"
              >
                {formState === 'loading' ? 'กำลังดำเนินการ...' : !isEmailVerified ? 'กรุณายืนยันอีเมลด้วย OTP ก่อนสมัคร' : 'สมัครสมาชิก →'}
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
