import { Metadata } from 'next';
import { Suspense } from 'react';
import SignInContent from './SigninContent';

export const metadata: Metadata = {
  title: 'เข้าสู่ระบบ | SmartDom',
  description: 'เข้าสู่ระบบเพื่อจัดการหอพักและห้องพักของคุณกับ SmartDom ประสบการณ์ใหม่ของการอยู่อาศัยที่ง่ายและยั่งยืน',
};

export const dynamic = 'force-dynamic';

export default function SignInPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-primary/20 border-t-[#8B7355] rounded-full animate-spin" />
      </div>
    }>
      <SignInContent />
    </Suspense>
  );
}
