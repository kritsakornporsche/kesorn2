import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { recordPayment } from '@/lib/payments';
import { formatBaht } from '@/lib/format';

const MESSAGES: Record<string, string> = {
  invalid_input: 'ข้อมูลการรับเงินไม่ถูกต้อง',
  not_found: 'ไม่พบบิล',
  already_paid: 'บิลนี้ชำระครบแล้ว',
  cancelled: 'บิลนี้ถูกยกเลิกแล้ว',
  not_sent: 'บิลยังเป็นร่าง ต้องส่งบิลก่อน',
};

// POST { billId, amount, method: 'cash' | 'transfer', paidAt: 'YYYY-MM-DDTHH:mm' (Thai time), note? }
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;

  try {
    const { billId, amount, method, paidAt, note } = await req.json();

    if (method !== 'cash' && method !== 'transfer') {
      return NextResponse.json({ success: false, message: 'เลือกวิธีรับเงิน: เงินสด หรือ โอน' }, { status: 400 });
    }
    // The form sends Thai local time without an offset
    const paidAtDate = typeof paidAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(paidAt)
      ? new Date(`${paidAt}:00+07:00`)
      : new Date(NaN);
    if (Number.isNaN(paidAtDate.getTime())) {
      return NextResponse.json({ success: false, message: 'วันเวลาที่รับเงินไม่ถูกต้อง' }, { status: 400 });
    }
    if (paidAtDate.getTime() > Date.now() + 60_000) {
      return NextResponse.json({ success: false, message: 'วันเวลาที่รับเงินต้องไม่เกินปัจจุบัน' }, { status: 400 });
    }

    const result = await recordPayment(Number(billId), {
      amount: Number(amount),
      method,
      paidAt: paidAtDate,
      recordedBy: guard.user.id,
      note: note ? String(note).slice(0, 500) : null,
      allowPartial: true,
    });

    if (!result.ok) {
      const message = result.reason === 'exceeds'
        ? `ยอดเกินยอดคงเหลือ (คงเหลือ ฿${formatBaht(result.outstanding)})`
        : result.reason === 'insufficient' ? `ต้องชำระ ฿${formatBaht(result.required)}` : MESSAGES[result.reason];
      return NextResponse.json({ success: false, message }, { status: result.reason === 'not_found' ? 404 : 400 });
    }

    // Tell the tenant who owns the bill (not every owner account)
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT COALESCE(t.user_id, u.id) AS user_id, b.room_number, b.title
        FROM bills b
        JOIN tenants t ON t.id = b.tenant_id
        LEFT JOIN users u ON LOWER(u.email) = LOWER(t.email)
        WHERE b.id = ${Number(billId)}
        LIMIT 1
      `;
      if (rows[0]?.user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${rows[0].user_id},
            'บันทึกการรับชำระเงินแล้ว',
            ${`บิล ${rows[0].title || ''} รับชำระ ฿${formatBaht(amount)}` + (result.status === 'Paid' ? ' (ชำระครบ)' : ` · คงเหลือ ฿${formatBaht(result.outstanding)}`)},
            'payment_approved',
            0,
            '/tenant/billing',
            NOW()
          )
        `;
      }
    } catch (e) {
      console.warn('[Billing receive notify]', e);
    }

    return NextResponse.json({
      success: true,
      message: result.status === 'Paid' ? 'บันทึกรับเงินแล้ว — ชำระครบ' : `บันทึกรับเงินแล้ว — คงเหลือ ฿${formatBaht(result.outstanding)}`,
      data: result,
    });
  } catch (error: any) {
    console.error('[Billing receive Error]', error);
    return NextResponse.json({ success: false, message: 'บันทึกรับเงินไม่สำเร็จ' }, { status: 500 });
  }
}
