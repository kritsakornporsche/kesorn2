'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { cn } from '@/lib/utils';

export default function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const err = urlParams.get('error');
      if (err) {
        if (err === 'Google_OAuth_Not_Configured') {
          setError('ระบบยังไม่ได้ตั้งค่า Google OAuth (Client ID)');
        } else {
          setError(decodeURIComponent(err));
        }
        window.history.replaceState(null, '', '/signin');
      }
    }
  }, []);

  const loginWithCredentials = async (loginEmail: string, loginPass: string) => {
    if (loading) return;
    setLoading(true);
    setError('');

    try {
      // 1. Verify credentials and get user metadata first via direct API endpoint
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPass }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || 'อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
        return;
      }

      // Store user metadata in localStorage
      let redirectUrl = data.redirectUrl || '/explore';
      if (typeof window !== 'undefined' && data.user) {
        localStorage.setItem('userEmail', loginEmail.toLowerCase().trim());
        localStorage.setItem('userRole', data.user.role || 'guest');
        localStorage.setItem('userSubRole', data.user.sub_role || '');
        localStorage.setItem('userName', data.user.name || '');
        localStorage.setItem('userId', String(data.user.id || ''));
      }

      // 2. Authenticate with NextAuth to create HTTP-only session cookie
      try {
        const origin = typeof window !== 'undefined' ? window.location.origin : '';
        await signIn('credentials', {
          redirect: false,
          email: loginEmail.trim(),
          password: loginPass,
          callbackUrl: origin || undefined,
        });
      } catch (authErr) {
        console.warn('NextAuth signIn non-fatal notice:', authErr);
      }

      const targetPath = callbackUrl || redirectUrl;
      if (typeof window !== 'undefined') {
        window.location.href = targetPath;
      }
    } catch (err: any) {
      console.error('Signin error:', err);
      setError(err?.message || 'เกิดข้อผิดพลาดในการเชื่อมต่อเซิร์ฟเวอร์ กรุณาลองใหม่อีกครั้ง');
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await loginWithCredentials(email, password);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[600px] h-[600px] bg-secondary rounded-full blur-3xl pointer-events-none opacity-50" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[500px] h-[500px] bg-accent rounded-full blur-3xl pointer-events-none opacity-30" />

      <Link
        href="/"
        className="absolute top-10 left-10 flex items-center gap-3 text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary transition-colors group"
      >
        <span className="h-px w-8 bg-border group-hover:bg-primary transition-colors" />
        กลับหน้าหลัก
      </Link>

      <div className="relative z-10 max-w-md w-full animate-reveal">
        <div className="text-center mb-8 sm:mb-10">
          <div className="mx-auto flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl bg-primary font-display font-bold text-primary-foreground text-lg sm:text-xl shadow-2xl shadow-primary/20 mb-6 sm:mb-8">
            S
          </div>
          <h1 className="text-3xl sm:text-4xl font-display tracking-tight text-foreground font-black italic ornament">
            พบกันอีกครั้ง
          </h1>
          <p className="mt-3 text-muted-foreground font-black uppercase text-[10px] tracking-widest px-2">
            เข้าสู่ระบบ SmartDom เพื่อจัดการทุกเรื่องให้เป็นเรื่องง่าย
          </p>
        </div>

        <div className="bg-card rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 border border-border shadow-xl">
          {error && (
            <div className="mb-8 p-4 bg-destructive/10 border border-destructive/20 text-destructive rounded-2xl text-xs font-black text-center">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">อีเมล หรือ ชื่อผู้ใช้</label>
              <input
                id="signin-email-input"
                name="email"
                type="text"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#0F172A] px-6 py-4 text-sm font-bold text-white focus:bg-[#0F172A] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-white/30"
                placeholder="you@example.com หรือ admin"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">รหัสผ่าน</label>
                <Link href="#" className="text-[10px] font-black text-primary hover:underline uppercase tracking-widest">ลืมรหัสผ่าน?</Link>
              </div>
              <div className="relative">
                <input
                  id="signin-password-input"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#0F172A] px-6 py-4 text-sm font-bold text-white focus:bg-[#0F172A] focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all placeholder:text-white/30 pr-12"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors p-1"
                >
                  {showPassword ? (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l18 18" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full rounded-full py-5 text-[10px] font-black uppercase tracking-[0.2em] text-primary-foreground transition-all active:scale-95",
                loading ? "bg-muted cursor-not-allowed" : "bg-primary hover:-translate-y-1 shadow-2xl shadow-primary/20"
              )}
            >
              {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ →'}
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground text-center mb-3">
              ⚡ เข้าสู่ระบบด่วน 1-Click (คลิกเพื่อเข้าใช้งานทันที)
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '👑 เจ้าของหอ', user: 'owner' },
                { label: '🏠 ลูกหอ', user: 'tenant' },
                { label: '🔬 นักวิจัย', user: 'researcher' },
                { label: '🧹 แม่บ้าน', user: 'maid' },
                { label: '🔧 ช่างซ่อม', user: 'technician' },
                { label: '🛡️ แอดมิน', user: 'admin' },
                { label: '🌐 แขก (Guest)', user: 'guest' },
              ].map((roleItem) => (
                <button
                  key={roleItem.user}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmail(roleItem.user);
                    setPassword(roleItem.user);
                    loginWithCredentials(roleItem.user, roleItem.user);
                  }}
                  className={`px-2 py-2 text-[10px] font-bold rounded-xl border border-white/10 bg-slate-900/60 hover:bg-primary hover:text-white text-slate-300 transition-all text-center cursor-pointer select-none active:scale-95 disabled:opacity-50 ${
                    roleItem.user === 'guest' ? 'col-span-3 bg-cyan-950/40 border-cyan-500/30 text-cyan-300 hover:bg-cyan-900/60' : ''
                  }`}
                >
                  {roleItem.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-6 text-center">
             <Link 
               href={`/signup${callbackUrl ? `?callbackUrl=${encodeURIComponent(callbackUrl)}` : ''}`} 
               className="text-[10px] font-black text-muted-foreground hover:text-primary uppercase tracking-[0.2em]"
             >
               ยังไม่มีบัญชี? <span className="text-primary border-b border-primary/20">สมัครสมาชิกที่นี่</span>
             </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
