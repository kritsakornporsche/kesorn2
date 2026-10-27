import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { notifyUser, ownerUserId } from '@/lib/move-out-notify';

// A tenant asks to renew their own Active contract. Anyone else's contract id gets 404 so ids cannot be probed.
export async function POST(req: Request) {
  try {
    const guard = await requireRole(['tenant']);
    if ('response' in guard) return guard.response;
    const { user } = guard;

    const body = await req.json().catch(() => ({}));
    const contractId = Number(body?.contract_id);
    const note = String(body?.renewal_note || '').trim().slice(0, 500) || 'ขอต่อสัญญาเช่า';
    if (!Number.isInteger(contractId) || contractId <= 0) {
      return NextResponse.json({ success: false, message: 'ไม่ได้ระบุสัญญา' }, { status: 400 });
    }

    const sql = getDb();
    const contracts = await sql`
      SELECT c.id, c.status FROM contracts c JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = ${contractId} AND (t.user_id = ${user.id} OR LOWER(t.email) = LOWER(${user.email}))
      LIMIT 1
    `;
    if (contracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' }, { status: 404 });
    }
    if (contracts[0].status !== 'Active') {
      return NextResponse.json({ success: false, message: 'ขอต่อสัญญาได้เฉพาะสัญญาที่มีผลอยู่' }, { status: 409 });
    }

    await sql`UPDATE contracts SET renewal_requested = 1, renewal_note = ${note} WHERE id = ${contractId}`;

    await notifyUser(
      await ownerUserId(),
      'มีคำขอต่อสัญญาเช่าใหม่',
      `ผู้เช่าได้ส่งคำขอต่อสัญญาเช่า (สัญญา #${contractId}): ${note}`,
      '/owner/contracts',
      new Date(),
      'contract_renewal'
    );

    return NextResponse.json({ success: true, message: 'ส่งคำขอต่อสัญญาเช่าไปยังเจ้าของหอพักเรียบร้อยแล้ว' });
  } catch (err) {
    console.error('[Tenant Request Renewal Error]:', err);
    return NextResponse.json({ success: false, message: 'ส่งคำขอไม่สำเร็จ' }, { status: 500 });
  }
}
