'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn, signOut } from 'next-auth/react';
import { cn } from '@/lib/utils';

export default function SignInContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Extract only the pathname from callbackUrl to avoid "cannot be parsed as URL" errors
  const rawCallbackUrl = searchParams.get('callbackUrl');
  const callbackUrl = (() => {
    if (!rawCallbackUrl) return null;
    try {
      // If it's a full URL, extract just the pathname
      const parsed = new URL(rawCallbackUrl);
      return parsed.pathname + (parsed.search || '');
    } catch {
      // It's already a relative path
      return rawCallbackUrl.startsWith('/') ? rawCallbackUrl : null;
    }
  })();

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

  const loginWithCredentials = async (loginEmail: string, loginPass: string, forceDestination?: string) => {
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
      const userRole = data.user?.role || 'guest';

      if (typeof window !== 'undefined' && data.user) {
        localStorage.setItem('userEmail', loginEmail.toLowerCase().trim());
        localStorage.setItem('userRole', userRole);
        localStorage.setItem('userSubRole', data.user.sub_role || '');
        localStorage.setItem('userName', data.user.name || '');
        localStorage.setItem('userId', String(data.user.id || ''));
      }

      // 2. Determine target route
      let targetPath = redirectUrl;
      if (forceDestination) {
        targetPath = forceDestination;
      } else if (callbackUrl) {
        const isResearcherPath = callbackUrl.startsWith('/researcher') || callbackUrl.startsWith('/sequence');
        const isOwnerPath = callbackUrl.startsWith('/owner');
        const isTenantPath = callbackUrl.startsWith('/tenant');
        const isKeeperPath = callbackUrl.startsWith('/keeper');
        const isPlatformPath = callbackUrl.startsWith('/platform');

        if (isResearcherPath && userRole !== 'researcher') {
          targetPath = redirectUrl;
        } else if (isOwnerPath && userRole !== 'owner') {
          targetPath = redirectUrl;
        } else if (isTenantPath && userRole !== 'tenant') {
          targetPath = redirectUrl;
        } else if (isKeeperPath && userRole !== 'keeper') {
          targetPath = redirectUrl;
        } else if (isPlatformPath && userRole !== 'platform_admin') {
          targetPath = redirectUrl;
        } else {
          targetPath = callbackUrl;
        }
      }

      // 3. Authenticate with NextAuth using current origin (not NEXTAUTH_URL env var)
      // Direct fetch avoids NextAuth client using wrong domain from NEXTAUTH_URL
      const csrfRes = await fetch('/api/auth/csrf', { credentials: 'include' });
      const { csrfToken } = await csrfRes.json();

      const authRes = await fetch('/api/auth/callback/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        credentials: 'include',
        body: new URLSearchParams({
          email: loginEmail.trim(),
          password: loginPass,
          csrfToken: csrfToken || '',
          callbackUrl: targetPath,
          json: 'true',
        }),
      });

      const authData = await authRes.json().catch(() => ({}));

      if (authRes.ok && !authData?.error) {
        // Ensure we navigate to a relative path only (never full URL with different host)
        let safePath = targetPath;
        try {
          const parsed = new URL(targetPath, window.location.origin);
          // Only use path if same origin
          if (parsed.origin === window.location.origin) {
            safePath = parsed.pathname + (parsed.search || '');
          } else {
            safePath = '/explore';
          }
        } catch {
          if (!safePath.startsWith('/')) safePath = '/explore';
        }
        window.location.href = safePath;
      } else {
        setError('อีเมลหรือรหัสผ่านไม่ถูกต้อง');
        setLoading(false);
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
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6 relative overflow-y-auto py-12 sm:py-16">
      {/* Decorative blobs */}
      <div className="absolute top-0 right-0 -translate-y-1/2 translate-x-1/4 w-[600px] h-[600px] bg-secondary rounded-full blur-3xl pointer-events-none opacity-50" />
      <div className="absolute bottom-0 left-0 translate-y-1/2 -translate-x-1/4 w-[500px] h-[500px] bg-accent rounded-full blur-3xl pointer-events-none opacity-30" />

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

      <div className="relative z-10 max-w-md w-full animate-reveal pt-10 sm:pt-0">
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
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              <p className="text-[11px] font-black uppercase tracking-widest text-foreground text-center">
                ⚡ เข้าสู่ระบบด่วน 1-Click (คลิกเพื่อเข้าใช้งานทันที)
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '👑 เจ้าของหอ', user: 'owner', dest: '/owner' },
                { label: '🏠 ลูกหอ', user: 'tenant', dest: '/tenant' },
                { label: '🔬 นักวิจัย', user: 'researcher', dest: '/researcher' },
                { label: '🧹 แม่บ้าน', user: 'maid', dest: '/keeper/maid' },
                { label: '🔧 ช่างซ่อม', user: 'technician', dest: '/keeper/technician' },
                { label: '🛡️ แอดมิน', user: 'admin', dest: '/platform' },
                { label: '🌐 แขก (Guest) / แดชบอร์ดการจอง', user: 'guest', dest: '/guest' },
              ].map((roleItem) => (
                <button
                  key={roleItem.user}
                  type="button"
                  disabled={loading}
                  onClick={() => {
                    setEmail(roleItem.user);
                    setPassword(roleItem.user);
                    loginWithCredentials(roleItem.user, roleItem.user, roleItem.dest);
                  }}
                  className={`py-2.5 px-2 text-[11px] font-black rounded-xl border transition-all text-center cursor-pointer select-none active:scale-95 disabled:opacity-50 shadow-sm ${
                    roleItem.user === 'guest'
                      ? 'col-span-3 bg-gradient-to-r from-cyan-900/60 to-blue-900/60 border-cyan-500/50 text-cyan-200 hover:brightness-125'
                      : 'border-white/10 bg-slate-900 hover:bg-primary hover:text-white text-slate-200 hover:border-primary/50'
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
