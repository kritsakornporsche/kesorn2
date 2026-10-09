import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized: เฉพาะเจ้าของหอพัก' }, { status: 401 });
    }
    const body = await req.json();
    const { contract_id, reject_reason } = body;

    if (!contract_id) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณาระบุรหัสสัญญา' 
      }, { status: 400 });
    }

    const sql = getDb();

    // 1. Fetch existing contract
    const existingContracts = await sql`
      SELECT c.*, r.room_number FROM contracts c
      JOIN rooms r ON c.room_id = r.id
      WHERE c.id = ${contract_id} 
      LIMIT 1
    `;

    if (existingContracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาในระบบ' }, { status: 404 });
    }

    const contract = existingContracts[0];

    // 2. Clear renewal request flag and record rejection
    await sql`
      UPDATE contracts 
      SET renewal_requested = 0, renewal_note = ${reject_reason ? `ปฏิเสธ: ${reject_reason}` : 'ไม่อนุมัติต่อสัญญา'} 
      WHERE id = ${contract_id}
    `;

    // 3. Notify tenant
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id 
        FROM tenants t 
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE t.id = ${contract.tenant_id} 
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'ผลการขอต่อสัญญาเช่า',
            ${'คำขอต่อสัญญาเช่าห้อง ' + contract.room_number + ' ไม่ได้รับการอนุมัติ ' + (reject_reason ? `(เหตุผล: ${reject_reason})` : '')},
            'contract_renewal_rejected',
            0,
            '/tenant/contract',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Reject renewal tenant notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'ปฏิเสธคำขอต่อสัญญาเช่าเรียบร้อยแล้ว'
    });
  } catch (err: any) {
    console.error('[Contract Renewal Reject API Error]:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
