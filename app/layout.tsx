import type { Metadata, Viewport } from "next";
import { Outfit, Inter, Noto_Sans_Thai, Noto_Sans_Thai_Looped } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
});

const notoThaiLooped = Noto_Sans_Thai_Looped({
  variable: "--font-noto-thai-looped",
  subsets: ["thai", "latin"],
});

export const metadata: Metadata = {
  title: {
    default: "หอพักเกษร 2 | ระบบจัดการหอพัก",
    template: "%s | หอพักเกษร 2",
  },
  description: "ระบบบริหารจัดการหอพักเกษร 2 สำหรับผู้เช่าและเจ้าของหอพัก บริการห้องพักคุณภาพ สะอาด ปลอดภัย",
  keywords: ["หอพักเกษร 2", "Kesorn 2", "หอพักพะเยา", "ห้องเช่าพะเยา"],
  authors: [{ name: "หอพักเกษร 2" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

import SessionProviderWrapper from "./components/SessionProviderWrapper";
import { Toaster } from "sonner";
import AppVersionBadge from "./components/AppVersionBadge";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="th"
      className={`${outfit.variable} ${inter.variable} ${notoThai.variable} ${notoThaiLooped.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var theme = localStorage.getItem('theme');
              if (theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
            } catch (e) {}

            // Safe guarded chunk reload handler (at most once per 10 seconds)
            window.addEventListener('error', function(e) {
              try {
                var msg = e.message || (e.error && e.error.message) || '';
                if (/Loading chunk [\d]+ failed|ChunkLoadError/i.test(msg)) {
                  var lastReload = parseInt(sessionStorage.getItem('last_chunk_reload') || '0', 10);
                  var now = Date.now();
                  if (now - lastReload > 10000) {
                    sessionStorage.setItem('last_chunk_reload', String(now));
                    window.location.reload();
                  }
                }
              } catch(err) {}
            });
          })();
        ` }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans transition-colors duration-200">
        <Toaster position="top-center" expand={true} richColors />
        <SessionProviderWrapper>
          {children}
          <AppVersionBadge />
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
