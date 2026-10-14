import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { unpayBill } from '@/lib/bill-status';

const MESSAGES = {
  reason_required: 'กรุณาระบุเหตุผลในการยกเลิกการชำระ',
  not_found: 'ไม่พบบิล',
  not_paid: 'บิลนี้ยังไม่ได้ชำระ',
  deposit_offset: 'บิลนี้ชำระด้วยเงินประกันตอนย้ายออก ยกเลิกการชำระไม่ได้',
};

// POST { billId, reason } — reverse a payment (owner only, reason required, history kept)
export async function POST(req: Request) {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;

  try {
    const { billId, reason } = await req.json();
    const result = await unpayBill(Number(billId), reason, guard.user.id);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: MESSAGES[result.reason] }, { status: result.reason === 'not_found' ? 404 : 400 });
    }
    return NextResponse.json({ success: true, message: 'ยกเลิกการชำระแล้ว', data: result });
  } catch (error: any) {
    console.error('[Billing unpay Error]', error);
    return NextResponse.json({ success: false, message: 'ยกเลิกการชำระไม่สำเร็จ' }, { status: 500 });
  }
}
