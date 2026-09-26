import { ReactNode } from 'react';
import Link from 'next/link';
import Navbar from '../components/Navbar';

export default function ExploreLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf9f6] dark:bg-background text-[#2d2a26] dark:text-foreground selection:bg-primary/20 overflow-x-hidden">
      <Navbar />
      <main className="pt-20">
        {children}
      </main>
      
      <footer className="py-20 bg-white dark:bg-card border-t border-black/5 dark:border-white/5">
        <div className="max-w-7xl mx-auto px-8 flex flex-col items-center">
            <p className="text-[10px] font-black uppercase tracking-[0.4em] text-muted-foreground/40 mb-4">Kesorn 2 Dormitory • Phayao</p>
            <div className="flex items-center gap-3 mb-8 opacity-90">
               <div className="w-10 h-10 rounded-2xl bg-primary text-white flex items-center justify-center shadow-md text-lg">
                 🏢
               </div>
               <span className="font-display font-black tracking-tighter uppercase italic">หอพักเกษร 2</span>
            </div>
            <p className="text-xs text-muted-foreground font-medium text-center max-w-sm leading-relaxed">
                หอพักคุณภาพ บรรยากาศสงบ สะอาด ปลอดภัย สิ่งอำนวยความสะดวกครบครัน <br/>
                © 2026 หอพักเกษร 2 • Phayao, Thailand
            </p>
        </div>
      </footer>
    </div>
  );
}
