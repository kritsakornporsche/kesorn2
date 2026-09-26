import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const body = await req.json();
    const { dormId, billingCycle, dueDate, title } = body;

    if (!dormId || !billingCycle || !dueDate) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const targetDormId = parseInt(dormId, 10);

    // 1. Find all active tenants in this dormitory via rooms/contracts
    const activeTenants = await sql`
      SELECT 
        t.id as tenant_id, 
        COALESCE(r.price, 0) as amount,
        r.room_number,
        r.dorm_id
      FROM tenants t
      LEFT JOIN rooms r ON t.room_id = r.id
      WHERE (r.dorm_id = ${targetDormId} OR t.dorm_id = ${targetDormId})
      AND t.status = 'Active'
    `;

    if (activeTenants.length === 0) {
      return NextResponse.json({ success: true, message: 'ไม่พบผู้เช่าที่มีสถานะ Active ในหอพักนี้', count: 0 });
    }

    let createdCount = 0;
    for (const tenant of activeTenants) {
      const existing = await sql`
        SELECT id FROM bills 
        WHERE tenant_id = ${tenant.tenant_id} AND billing_cycle = ${billingCycle} AND title = ${title}
      `;
      
      if (existing.length === 0) {
        const roomRent = Number(tenant.amount) || 0;
        const flatWater = 100.00;
        const totalAmount = roomRent + flatWater;

        await sql`
          INSERT INTO bills (
            tenant_id, 
            title, 
            amount, 
            billing_cycle, 
            due_date, 
            status, 
            dorm_id, 
            room_number, 
            room_amount,
            water_units,
            electric_units,
            water_amount,
            electric_amount
          )
          VALUES (
            ${tenant.tenant_id}, 
            ${title}, 
            ${totalAmount}, 
            ${billingCycle}, 
            ${dueDate}, 
            'Unpaid', 
            ${targetDormId}, 
            ${tenant.room_number || null}, 
            ${roomRent},
            1,
            0,
            ${flatWater},
            0
          )
        `;
        createdCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: `สร้างใบแจ้งหนี้อัตโนมัติสำเร็จ ${createdCount} รายการ`,
      count: createdCount 
    });

  } catch (err: any) {
    console.error('[Billing Batch API] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

