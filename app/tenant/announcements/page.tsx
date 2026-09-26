import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import AcknowledgeButton from './components/AcknowledgeButton';

async function getAnnouncements() {
  const session = await auth();
  const sql = getDb();
  
  let tenantId = 1;
  let userId = (session?.user as any)?.id || null;
  if (session?.user?.email) {
    const tenantRes = await sql`
      SELECT t.id, COALESCE(t.user_id, u.id) as user_id 
      FROM tenants t 
      LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
      WHERE LOWER(t.email) = LOWER(${session.user.email}) 
      LIMIT 1
    `;
    if (tenantRes.length > 0) {
      tenantId = tenantRes[0].id;
      if (!userId) userId = tenantRes[0].user_id;
    }
    if (!userId) {
      const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${session.user.email}) LIMIT 1`;
      if (uRes.length > 0) userId = uRes[0].id;
    }
  }

  // Retrieve announcements and their read status for this tenant
  const announcements = await sql`
    SELECT 
      a.id, 
      a.title, 
      a.content, 
      a.is_important, 
      a.created_at,
      CASE WHEN ar.id IS NOT NULL THEN true ELSE false END as is_read,
      ar.read_at
    FROM announcements a
    LEFT JOIN announcement_reads ar ON a.id = ar.announcement_id AND (ar.tenant_id = ${tenantId} OR (ar.user_id = ${userId || 0} AND ${userId || 0} > 0))
    WHERE a.is_active = 1 OR a.is_active IS NULL
    ORDER BY a.is_important DESC, a.created_at DESC
  `;

  return announcements;
}

export default async function TenantAnnouncements() {
  const announcements = await getAnnouncements();

  return (
    <div className="p-8 lg:p-10 max-w-5xl mx-auto hidden-scrollbar">
      <div className="space-y-12 pb-16">
        
        <header className="relative">
          <div className="absolute -left-4 top-1/2 -translate-y-1/2 w-1 h-12 bg-primary rounded-full opacity-20"></div>
          <h1 className="text-3xl font-bold text-white tracking-tight flex items-center gap-3">
             <span className="p-2 bg-[#0F172A] rounded-xl border border-white/20/10 text-muted-foreground">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" /></svg>
             </span>
             ประกาศข่าวสารส่วนกลาง
          </h1>
          <p className="text-muted-foreground mt-2 font-medium text-lg">ติดตามอัปเดตและประกาศสำคัญจากทางหอพัก</p>
        </header>

        {announcements.length === 0 ? (
          <div className="bg-[#0F172A] rounded-3xl border border-white/20/10 p-16 text-center shadow-sm">
            <div className="w-20 h-20 bg-[#0F172A] rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 text-muted-foreground/60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
            </div>
            <h3 className="text-xl font-black tracking-tight text-white mb-2">ยังไม่มีประกาศข่าวสารใดๆ</h3>
            <p className="text-white/50 font-medium">คุณติดตามข้อมูลครบถ้วนแล้วในขณะนี้</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {announcements.map((ann: any) => (
              <div 
                key={ann.id} 
                className={`group relative overflow-hidden bg-[#0F172A] rounded-[2.5rem] border shadow-sm transition-all duration-300 ${
                  ann.is_important && !ann.is_read 
                    ? 'border-rose-200 hover:border-rose-300 shadow-rose-100/50' 
                    : 'border-white/20/10 hover:border-border'
                } ${ann.is_read ? 'opacity-70 grayscale-[20%]' : ''}`}
              >
                {/* Decoration */}
                {ann.is_important && !ann.is_read && (
                  <div className="absolute top-0 right-0 w-32 h-32 bg-rose-50 rounded-full blur-3xl opacity-50 -mr-10 -mt-10 pointer-events-none"></div>
                )}
                
                <div className="p-8 md:p-10 relative z-10 flex flex-col md:flex-row gap-8 items-start md:items-center justify-between">
                  
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-4">
                      {ann.is_important ? (
                        <div className="inline-flex items-center gap-1.5 bg-rose-50 text-rose-600 px-3 py-1 rounded-lg border border-rose-100 text-[10px] font-black uppercase tracking-widest">
                          <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                          ประกาศสำคัญ
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 bg-[#0F172A] text-muted-foreground px-3 py-1 rounded-lg border border-white/20/10 text-[10px] font-black uppercase tracking-widest">
                          อัปเดตทั่วไป
                        </div>
                      )}
                      
                      <div className="text-[10px] font-bold text-white/50 uppercase tracking-widest font-mono">
                        {new Date(ann.created_at).toLocaleDateString('th-TH', { 
                          year: 'numeric', month: 'long', day: 'numeric' 
                        })}
                      </div>
                    </div>
                    
                    <h2 className="text-xl md:text-2xl font-bold text-white tracking-tight mb-3">
                      {ann.title}
                    </h2>
                    <p className={`leading-relaxed text-sm ${ann.is_read ? 'text-muted-foreground' : 'text-white/80'}`}>
                      {ann.content}
                    </p>
                  </div>

                  <div className="shrink-0 flex flex-col items-start md:items-end w-full md:w-auto mt-4 md:mt-0 pt-6 md:pt-0 border-t md:border-t-0 border-white/20/10 gap-3">
                    {ann.is_read ? (
                      <div className="flex items-center gap-2 text-emerald-600 font-bold text-[10px] uppercase tracking-widest bg-emerald-50 px-4 py-2.5 rounded-xl border border-emerald-100">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                        รับทราบเมื่อ {new Date(ann.read_at).toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
                      </div>
                    ) : (
                      <AcknowledgeButton id={ann.id} isImportant={ann.is_important} />
                    )}
                  </div>
                  
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
