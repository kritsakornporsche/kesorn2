import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { issueMonthlyBills } from '@/lib/meters';

// Batch monthly bills (commit 29): the same path as the meter page — one Draft bill per room with an Active contract
// and a meter reading of the cycle, priced from the settings table (electricity / water per person / common fee,
// lib/billing). Nothing is sent to tenants here: the owner checks the drafts and sends them from the billing page.
// Rooms without a reading, or that already have a bill for the cycle, are listed as skipped.
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    const rawCycle = body.billingCycle || body.billing_cycle;
    if (!rawCycle) {
      return NextResponse.json({ success: false, message: 'Missing billing cycle' }, { status: 400 });
    }
    const m = String(rawCycle).match(/^(\d{4})-(\d{1,2})/);
    const billingCycle = m ? `${m[1]}-${m[2].padStart(2, '0')}` : String(rawCycle);

    const result = await issueMonthlyBills(billingCycle, { id: guard.user.id, role: guard.user.role }, new Date());
    if (!result.ok) {
      return NextResponse.json({ success: false, reason: result.reason, message: result.message }, { status: 400 });
    }
    return NextResponse.json({
      success: true,
      message: `สร้างบิลร่างรอบ ${result.cycle} แล้ว ${result.issued.length} รายการ (ข้าม ${result.skipped.length} ห้อง) — ตรวจแล้วกดส่งบิลที่หน้าบิล`,
      count: result.issued.length,
      cycle: result.cycle,
      issued: result.issued,
      skipped: result.skipped,
    });
  } catch (err: any) {
    console.error('[Billing Batch API] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
