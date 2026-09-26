import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const billId = body.billId || body.bill_id;
    const slipData = body.slipData || body.slip_url || body.slip;
    const email = body.email;
    const userEmail = session?.user?.email || email;

    if (!billId || !slipData) {
      return NextResponse.json({ success: false, message: 'Missing billId or slipData' }, { status: 400 });
    }

    const sql = getDb();
    
    // 1. Verify bill exists
    const billRes = await sql`
      SELECT b.*, t.email as tenant_email 
      FROM bills b 
      LEFT JOIN tenants t ON b.tenant_id = t.id 
      WHERE b.id = ${billId} 
      LIMIT 1
    `;

    if (billRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการบิลนี้ในระบบ' }, { status: 404 });
    }

    const bill = billRes[0];

    if (bill.status && bill.status.toLowerCase() === 'paid') {
      return NextResponse.json({ success: false, message: 'บิลนี้ได้รับการชำระเงินเรียบร้อยแล้ว' }, { status: 400 });
    }

    // 2. Update bill status to Pending with slip
    await sql`
      UPDATE bills 
      SET status = 'Pending', slip_url = ${slipData} 
      WHERE id = ${billId}
    `;

    // 3. Create notifications for owner and staff (keeper) of this dorm
    try {
      const dormId = bill.dorm_id || 1;
      const roomNumber = bill.room_number || '-';
      const billMonth = bill.billing_cycle || 'ล่าสุด';
      const amount = Number(bill.amount || 0).toLocaleString('th-TH');

      const staff = await sql`
        SELECT DISTINCT u.id as user_id
        FROM users u
        WHERE (
          u.id IN (SELECT owner_id FROM dormitory_registry WHERE id = ${dormId} AND owner_id IS NOT NULL)
          OR LOWER(u.email) IN (SELECT LOWER(owner_email) FROM dormitory_registry WHERE id = ${dormId} AND owner_email IS NOT NULL)
          OR u.id IN (SELECT user_id FROM user_dorm_roles WHERE dorm_id = ${dormId} AND role IN ('owner', 'keeper'))
          OR u.role = 'owner'
        )
      `;

      for (const person of staff as any[]) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${person.user_id},
            'มีการแจ้งชำระเงินใหม่',
            ${'ผู้เช่าห้อง ' + roomNumber + ' แจ้งชำระเงินบิลประจำเดือน ' + billMonth + ' จำนวน ' + amount + ' บาท กรุณาตรวจสอบสลิป'},
            'payment',
            0,
            '/owner/billing',
            NOW()
          )
        `;
      }
    } catch (notifErr) {
      console.error('[POST /api/tenant/billing/payment] Notification Error:', notifErr);
      // Do not block the payment response even if notification insert fails
    }

    return NextResponse.json({ 
      success: true, 
      message: 'ส่งหลักฐานการชำระเงินเรียบร้อยแล้ว รอเจ้าของหอพักตรวจสอบ' 
    });

  } catch (error: any) {
    console.error('[POST /api/tenant/billing/payment] Error:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
