import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { executeLineWindowManager, getAutoPaymentConfig } from '@/lib/features/line-window-manager';

export async function GET() {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;

  try {
    const status = await executeLineWindowManager('status');
    return NextResponse.json({
      success: true,
      data: status,
      canEdit: guard.user.role === 'owner',
    });
  } catch (err: any) {
    console.error('[GET /api/owner/settings/auto-payment-line]', err);
    return NextResponse.json(
      { success: false, message: 'ไม่สามารถตรวจสอบสถานะหน้าต่าง LINE ได้: ' + err.message },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;

  try {
    const body = await req.json().catch(() => ({}));
    let action = body.action || 'status';

    if (action === 'toggle') {
      const cfg = getAutoPaymentConfig();
      action = cfg.enabled ? 'unlock' : 'lock';
    }

    if (!['status', 'lock', 'unlock', 'launch'].includes(action)) {
      return NextResponse.json({ success: false, message: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
    }

    const result = await executeLineWindowManager(action);
    return NextResponse.json({
      success: result.success,
      data: result,
      message: result.message,
    });
  } catch (err: any) {
    console.error('[POST /api/owner/settings/auto-payment-line]', err);
    return NextResponse.json(
      { success: false, message: 'ดำเนินการไม่สำเร็จ: ' + err.message },
      { status: 500 }
    );
  }
}
