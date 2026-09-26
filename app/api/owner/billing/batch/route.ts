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
    const billingCycle = body.billingCycle || body.billing_cycle;
    const dormId = body.dormId || body.dorm_id || (session.user as any)?.dormId || 1;
    const dueDate = body.dueDate || body.due_date || new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
    const title = body.title || `ค่าเช่าห้องพักประจำเดือน ${billingCycle || ''}`;

    if (!billingCycle) {
      return NextResponse.json({ success: false, message: 'Missing billing cycle' }, { status: 400 });
    }

    const targetDormId = parseInt(String(dormId), 10);

    // 1. Find all active tenants in this dormitory via rooms/contracts
    const activeTenants = await sql`
      SELECT 
        t.id as tenant_id, 
        t.room_id,
        COALESCE(r.price, 2800) as amount,
        r.room_number,
        COALESCE(r.dorm_id, t.dorm_id, 1) as dorm_id
      FROM tenants t
      LEFT JOIN rooms r ON t.room_id = r.id
      WHERE (r.dorm_id = ${targetDormId} OR t.dorm_id = ${targetDormId})
      AND t.status IN ('Active', 'active')
    `;

    if (activeTenants.length === 0) {
      return NextResponse.json({ success: true, message: 'ไม่พบผู้เช่าที่มีสถานะ Active ในหอพักนี้', count: 0 });
    }

    let createdCount = 0;
    for (const tenant of activeTenants) {
      const existing = await sql`
        SELECT id FROM bills 
        WHERE tenant_id = ${tenant.tenant_id} AND billing_cycle = ${billingCycle}
        LIMIT 1
      `;
      
      if (existing.length === 0) {
        const roomRent = Number(tenant.amount) || 2800;
        // In Kesorn 2: flat water rate 100 THB/month
        const flatWater = 100.00;
        const waterUnits = 1.00;

        // Auto-fetch electricity meter reading for this room
        let electricUnits = 0.00;
        let electricAmount = 0.00;

        if (tenant.room_id) {
          const meters = await sql`
            SELECT previous_reading, current_reading, units_used 
            FROM meter_readings 
            WHERE room_id = ${tenant.room_id} 
              AND (type = 'Electricity' OR type = 'Electric')
            ORDER BY id DESC 
            LIMIT 1
          `;
          if (meters.length > 0) {
            const m = meters[0];
            const units = Number(m.units_used) || (Number(m.current_reading) - Number(m.previous_reading)) || 0;
            if (units > 0) {
              electricUnits = units;
              electricAmount = units * 7.00;
            }
          }
        }

        const totalAmount = roomRent + flatWater + electricAmount;

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
            ${waterUnits},
            ${electricUnits},
            ${flatWater},
            ${electricAmount}
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

