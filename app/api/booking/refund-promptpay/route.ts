import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    const { contractId, promptpayNumber, bankName, accountName } = await req.json();

    if (!promptpayNumber && !accountName) {
      return NextResponse.json({ success: false, message: 'กรุณากรอกข้อมูลเลขพร้อมเพย์หรือบัญชีธนาคาร' }, { status: 400 });
    }

    const infoString = `พร้อมเพย์: ${promptpayNumber || '-'} | ธนาคาร: ${bankName || '-'} | ชื่อบัญชี: ${accountName || '-'}`;

    // Update contract renewal_note with refund PromptPay information
    if (contractId) {
      await sql`
        UPDATE contracts 
        SET renewal_note = CONCAT(COALESCE(renewal_note, 'ถูกปฏิเสธการจอง'), ' [ข้อมูลคืนเงินมัดจำ: ', ${infoString}, ']')
        WHERE id = ${contractId}
      `;
    }

    // Insert refund request into refund_requests or notifications for owner
    try {
      const ownerRes = await sql`SELECT id FROM users WHERE role = 'owner' LIMIT 1`;
      if (ownerRes.length > 0) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${ownerRes[0].id},
            'แจ้งข้อมูลพร้อมเพย์สำหรับคืนเงินมัดจำ',
            ${`ผู้จอง (${session.user.email}) แจ้งข้อมูลรับเงินมัดจำคืน (1,000 บาท): ${infoString}`},
            'refund_promptpay',
            0,
            '/owner/refund-requests',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Refund promptpay notification warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกข้อมูลพร้อมเพย์สำหรับคืนเงินมัดจำ 1,000 บาท เรียบร้อยแล้ว เจ้าของหอพักจะดำเนินการโอนคืนให้โดยเร็ว',
    });
  } catch (error: any) {
    console.error('[PromptPay Refund Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
