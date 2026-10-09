import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const session = await auth();
  const role = (session?.user as any)?.role;
  if (!session?.user || (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin')) {
    return NextResponse.json({ success: false, message: 'Unauthorized: เฉพาะเจ้าของหอพักหรือผู้ดูแล' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const body = await req.json();
    let rawCycle = body.billingCycle || body.billing_cycle;
    if (!rawCycle) {
      return NextResponse.json({ success: false, message: 'Missing billing cycle' }, { status: 400 });
    }

    let billingCycle = rawCycle;
    const match = String(rawCycle).match(/^(\d{4})-(\d{1,2})/);
    if (match) {
      billingCycle = `${match[1]}-${match[2].padStart(2, '0')}`;
    }

    const dormId = body.dormId || body.dorm_id || (session.user as any)?.dormId || 1;
    let defaultDueDate = new Date().toISOString().slice(0, 10);
    if (/^\d{4}-\d{2}$/.test(billingCycle)) {
      defaultDueDate = `${billingCycle}-05`;
    }
    const dueDate = body.dueDate || body.due_date || defaultDueDate;
    const title = body.title || `ค่าเช่าห้องพักประจำเดือน ${billingCycle || ''}`;

    const targetDormId = parseInt(String(dormId), 10);

    // Fetch dormitory utility rates (default water: 100 THB, electricity: 8 THB)
    const profileRes = await sql`
      SELECT water_rate, electricity_rate, common_fee 
      FROM dormitory_profile 
      WHERE dorm_id = ${targetDormId} OR id = ${targetDormId}
      LIMIT 1
    `;
    const defaultWaterRate = profileRes.length > 0 ? Number(profileRes[0].water_rate || 100) : 100.00;
    const electricUnitPrice = profileRes.length > 0 ? Number(profileRes[0].electricity_rate || 8) : 8.00;
    const defaultCommonFee = profileRes.length > 0 ? Number(profileRes[0].common_fee || 150) : 150.00;

    // 1. Find all active tenants in this dormitory via rooms/contracts
    const activeTenants = await sql`
      SELECT 
        t.id as tenant_id, 
        t.room_id,
        COALESCE(r.price, 2800) as amount,
        r.room_number,
        r.water_rate as room_water_rate,
        r.common_fee as room_common_fee,
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
        const isT01 = (tenant.room_number || '').toUpperCase() === 'T01';
        const roomRent = isT01 ? 10 : (Number(tenant.amount) || 2800);
        const roomWater = tenant.room_water_rate !== null && tenant.room_water_rate !== undefined ? Number(tenant.room_water_rate) : defaultWaterRate;
        const flatWater = isT01 ? 5 : roomWater;
        const waterUnits = 1.00;
        const activeElectricPrice = isT01 ? 1 : electricUnitPrice;
        const roomCommon = tenant.room_common_fee !== null && tenant.room_common_fee !== undefined ? Number(tenant.room_common_fee) : defaultCommonFee;
        const commonFeeAmount = isT01 ? 5 : roomCommon;

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
              electricAmount = parseFloat((units * activeElectricPrice).toFixed(2));
            }
          }
        }

        const totalAmount = parseFloat((roomRent + flatWater + electricAmount + commonFeeAmount).toFixed(2));

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
