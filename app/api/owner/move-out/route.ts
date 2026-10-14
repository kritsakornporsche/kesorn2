import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { listMoveOuts } from '@/lib/moveOut';

// GET — every move-out request, newest first (lib/moveOut.ts). Managers do not see deposit, forfeit or refund
// amounts. Requests from before commit 12 come with legacy: true ("คำขอแบบเดิม — จัดการด้วยมือ").
export async function GET() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    return NextResponse.json({ success: true, data: await listMoveOuts(guard.user, new Date()) });
  } catch (error: any) {
    console.error('[GET /api/owner/move-out]', error);
    return NextResponse.json({ success: false, message: 'โหลดรายการย้ายออกไม่สำเร็จ' }, { status: 500 });
  }
}

// The earlier one-step calculation (hard-coded rates and deposit) is replaced by /api/owner/move-out/[id]
const GONE = () => NextResponse.json(
  { success: false, message: 'ขั้นตอนย้ายออกเปลี่ยนแล้ว — ใช้หน้าย้ายออกใหม่ (บันทึกคืนห้อง → หักเงินประกัน → คืนเงิน)' },
  { status: 410 }
);
export async function POST() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  return GONE();
}
export async function PUT() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  return GONE();
}
