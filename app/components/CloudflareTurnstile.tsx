'use client';

import { useEffect, useRef, useState } from 'react';
import { TURNSTILE_MOCK_TOKEN, turnstileSiteKey } from '@/lib/turnstile';

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        params: {
          sitekey: string;
          theme?: 'light' | 'dark' | 'auto';
          callback?: (token: string) => void;
          'error-callback'?: (error: any) => void;
          'expired-callback'?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
    onTurnstileLoaded?: () => void;
  }
}

interface CloudflareTurnstileProps {
  onVerify: (token: string) => void;
  onError?: (err: any) => void;
  onExpire?: () => void;
  className?: string;
}

export default function CloudflareTurnstile({
  onVerify,
  onError,
  onExpire,
  className = '',
}: CloudflareTurnstileProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [loadError, setLoadError] = useState(false);

  // commit 26d: site key from the environment; Cloudflare's test key only in development (lib/turnstile)
  const siteKey = turnstileSiteKey(process.env.NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY, process.env.NODE_ENV);
  const devMode = process.env.NODE_ENV === 'development';

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || !containerRef.current || !siteKey) return;

    // Check if script is already present
    const existingScript = document.getElementById('cf-turnstile-script');

    const renderWidget = () => {
      if (window.turnstile && containerRef.current && !widgetIdRef.current) {
        try {
          const id = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            theme: 'dark',
            callback: (token: string) => {
              onVerify(token);
            },
            'error-callback': (err: any) => {
              console.warn('[Cloudflare Turnstile error]:', err);
              if (onError) onError(err);
            },
            'expired-callback': () => {
              if (onExpire) onExpire();
            },
          });
          widgetIdRef.current = id;
        } catch (e) {
          console.error('[Failed to render Turnstile widget]:', e);
          setLoadError(true);
        }
      }
    };

    if (!existingScript) {
      const script = document.createElement('script');
      script.id = 'cf-turnstile-script';
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      script.async = true;
      script.defer = true;
      script.onload = () => {
        renderWidget();
      };
      script.onerror = () => {
        console.warn('[Could not load Cloudflare Turnstile script, enabling fallback]');
        setLoadError(true);
      };
      document.head.appendChild(script);
    } else {
      if (window.turnstile) {
        renderWidget();
      } else {
        const checkInterval = setInterval(() => {
          if (window.turnstile) {
            clearInterval(checkInterval);
            renderWidget();
          }
        }, 100);
        return () => clearInterval(checkInterval);
      }
    }

    return () => {
      if (window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {}
        widgetIdRef.current = null;
      }
    };
  }, [isClient, siteKey, onVerify, onError, onExpire]);

  // Fallback demo simulator button if script cannot be reached (offline or intranet)
  if (!siteKey) {
    return (
      <div className={`p-3 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-xs font-bold text-rose-400 ${className}`}>
        ระบบยืนยันว่าไม่ใช่บอท (Cloudflare Turnstile) ยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบ
      </div>
    );
  }

  // The script could not load: a mock button on a development machine only; elsewhere ask to try again
  if (loadError && !devMode) {
    return (
      <div className={`p-3 bg-amber-500/10 border border-amber-500/30 rounded-2xl text-xs font-bold text-amber-500 ${className}`}>
        โหลดระบบยืนยันว่าไม่ใช่บอทไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่
      </div>
    );
  }

  if (loadError) {
    return (
      <div className={`p-3 bg-secondary/50 border border-border/80 rounded-2xl flex items-center justify-between gap-3 text-xs ${className}`}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
          <span>Cloudflare Turnstile (Dev Mode)</span>
        </div>
        <button
          type="button"
          onClick={() => onVerify(TURNSTILE_MOCK_TOKEN)}
          className="px-3 py-1.5 bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 rounded-xl font-bold cursor-pointer transition-all active:scale-95 text-xs"
        >
          ✓ คลิกเพื่อยืนยันว่าไม่ใช่บอท
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col items-center justify-center p-2 rounded-2xl bg-secondary/20 border border-border/50 min-h-[70px] ${className}`}>
      <div ref={containerRef} className="cf-turnstile" />
      <div className="flex items-center gap-1.5 mt-1 text-[10px] text-muted-foreground/60 font-medium">
        <svg className="w-3 h-3 text-amber-500/80" viewBox="0 0 24 24" fill="currentColor">
          <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z"/>
        </svg>
        <span>Protected by Cloudflare Turnstile</span>
      </div>
    </div>
  );
}
