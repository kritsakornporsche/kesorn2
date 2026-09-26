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

    // Fetch dormitory utility rates (default water: 100 THB, electricity: 7 THB)
    const profileRes = await sql`
      SELECT water_rate, electricity_rate 
      FROM dormitory_profile 
      WHERE dorm_id = ${targetDormId} OR id = ${targetDormId}
      LIMIT 1
    `;
    const flatWaterRate = profileRes.length > 0 ? Number(profileRes[0].water_rate || 100) : 100.00;
    const electricUnitPrice = profileRes.length > 0 ? Number(profileRes[0].electricity_rate || 7) : 7.00;

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
        const flatWater = flatWaterRate;
        const waterUnits = 1.00;

        // Auto-fetch electricity meter reading for this room
        let electricUnits = 0.00;
        let electricAmount = 0.00;

        if (tenant.room_id) {
          const meters = await sql`
            SELECT previous_reading, current_reading, COALESCE(units_used, current_reading - previous_reading, 0) as units_used 
            FROM meter_readings 
            WHERE room_id = ${tenant.room_id} 
              AND (type = 'Electricity' OR type = 'Electric')
            ORDER BY id DESC 
            LIMIT 1
          `;
          if (meters.length > 0) {
            const m = meters[0];
            const units = Math.max(0, Number(m.units_used) || (Number(m.current_reading) - Number(m.previous_reading)) || 0);
            if (units > 0) {
              electricUnits = units;
              electricAmount = parseFloat((units * electricUnitPrice).toFixed(2));
            }
          }
        }

        const totalAmount = parseFloat((roomRent + flatWater + electricAmount).toFixed(2));

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

        // Notify tenant about new bill
        try {
          const tenantUser = await sql`
            SELECT COALESCE(t.user_id, u.id) as user_id
            FROM tenants t
            LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
            WHERE t.id = ${tenant.tenant_id}
            LIMIT 1
          `;
          if (tenantUser.length > 0 && tenantUser[0].user_id) {
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${tenantUser[0].user_id},
                'ใบแจ้งหนี้ใหม่ประจำรอบบิล',
                ${'มีใบแจ้งหนี้รอบบิล ' + billingCycle + ' จำนวน ฿' + totalAmount.toLocaleString('th-TH') + ' กำหนดชำระภายใน ' + new Date(dueDate).toLocaleDateString('th-TH')},
                'billing',
                0,
                '/tenant/billing',
                NOW()
              )
            `;
          }
        } catch (ne) {
          console.warn('Batch bill notify warn:', ne);
        }
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
