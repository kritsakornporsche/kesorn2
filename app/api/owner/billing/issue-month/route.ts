import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { issueMonthlyBills, meterRefusalStatus } from '@/lib/meters';

// POST { cycle? } — draft monthly bills of a cycle (default: the cycle being recorded now) for every room with an Active
// contract and a reading of that cycle. Rooms without a reading, with a bill already or with a final bill are skipped.
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const body = await req.json().catch(() => ({}));
    const r = await issueMonthlyBills(typeof body?.cycle === 'string' ? body.cycle : null, guard.user, new Date());
    if (!r.ok) return NextResponse.json({ success: false, message: r.message }, { status: meterRefusalStatus(r.reason) });
    const notRecorded = r.skipped.filter((s: any) => s.skipped === 'not_recorded').map((s: any) => s.roomNumber);
    return NextResponse.json({
      success: true,
      message: `รอบ ${r.cycle}: ออกบิลร่าง ${r.issued.length} ห้อง` + (r.skipped.length ? ` · ข้าม ${r.skipped.length} ห้อง` : '')
        + (notRecorded.length ? ` (ยังไม่จด: ${notRecorded.join(', ')})` : '') + (r.issued.length ? ' — ตรวจแล้วกดส่งในแท็บ "ร่าง"' : ''),
      cycle: r.cycle,
      issued: r.issued,
      skipped: r.skipped,
    });
  } catch (error: any) {
    console.error('[POST /api/owner/billing/issue-month]', error);
    return NextResponse.json({ success: false, message: 'ออกบิลไม่สำเร็จ' }, { status: 500 });
  }
}
