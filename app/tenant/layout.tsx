import { ReactNode } from 'react';
import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { redirect } from 'next/navigation';

import TenantSidebar from './components/TenantSidebar';
import TenantBottomNav from './components/TenantBottomNav';

export default async function TenantLayout({ children }: { children: ReactNode }) {
  const session = await auth();

  // SEC-01: Must be authenticated
  if (!session || !session.user) {
    redirect('/signin?callbackUrl=' + encodeURIComponent('/tenant'));
  }

  // Allow tenant, owner, or users with tenant/booking contracts
  let role = (session.user as any)?.role;
  let isAllowed = role === 'tenant' || role === 'owner' || role === 'guest';

  if (session.user.email) {
    try {
      const sql = getDb();
      const u = await sql`
        SELECT COALESCE(role, primary_role, 'guest') as effective_role,
               (SELECT COUNT(*) FROM contracts c JOIN tenants t ON c.tenant_id = t.id WHERE t.email = ${session.user.email}) as contract_count,
               (SELECT COUNT(*) FROM tenants WHERE email = ${session.user.email}) as tenant_count
        FROM users 
        WHERE LOWER(email) = ${session.user.email.toLowerCase()} 
        LIMIT 1
      `;
      if (u.length > 0) {
        if (u[0].effective_role === 'tenant' || u[0].effective_role === 'owner' || Number(u[0].contract_count) > 0 || Number(u[0].tenant_count) > 0) {
          isAllowed = true;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  if (!isAllowed && (role === 'keeper' || role === 'platform_admin')) {
    redirect('/signin?error=' + encodeURIComponent('คุณไม่มีสิทธิ์เข้าถึงหน้านี้ (เฉพาะลูกหอ)'));
  }

  const userName = session?.user?.name || 'ผู้ใช้งาน';
  const userEmail = session?.user?.email;

  let roomInfo = 'ยังไม่ระบุห้อง';
  if (userEmail) {
    const sql = getDb();
    const res = await sql`
      SELECT r.room_number, r.floor, dp.name as dorm_name, c.status as contract_status
      FROM tenants t
      LEFT JOIN contracts c ON t.id = c.tenant_id
      LEFT JOIN rooms r ON r.id = COALESCE(t.room_id, c.room_id)
      LEFT JOIN dormitory_profile dp ON 1=1
      WHERE t.email = ${userEmail} OR t.user_id = ${(session?.user as any)?.id || 0}
      ORDER BY c.id DESC
      LIMIT 1
    `;
    if (res.length > 0 && res[0].room_number) {
      if (res[0].contract_status === 'PendingOwnerSignature') {
        roomInfo = `ห้อง ${res[0].room_number} (รออนุมัติสัญญา)`;
      } else {
        roomInfo = `ห้อง ${res[0].room_number} • ชั้น ${res[0].floor || 1} (หอพักเกษร 2)`;
      }
    }
  }

  return (
    <div className="flex flex-col h-screen bg-background text-foreground font-sans overflow-hidden">
      <TenantSidebar roomInfo={roomInfo} userName={userName} />

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden relative">
        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <TenantBottomNav />
    </div>
  );
}
