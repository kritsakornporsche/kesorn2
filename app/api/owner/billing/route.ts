import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if ((session.user as any)?.role !== 'owner') {
    return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
  }
  const sql = getDb();

  try {
    const bills = await sql`
      SELECT 
        b.id, 
        b.dorm_id,
        b.title, 
        b.amount, 
        b.billing_cycle, 
        b.due_date, 
        b.status, 
        b.slip_url,
        b.created_at,
        b.slip_data,
        COALESCE(b.bill_type, 'monthly') as bill_type,
        COALESCE(b.slip_verified, 0) as slip_verified,
        b.slipok_trans_ref,
        COALESCE(b.room_number, r.room_number, '-') as room_number,
        COALESCE(b.water_units, 0) as water_units,
        COALESCE(b.electric_units, 0) as electric_units,
        COALESCE(b.water_amount, 0) as water_amount,
        COALESCE(b.electric_amount, 0) as electric_amount,
        COALESCE(b.room_amount, 0) as room_amount,
        t.id as tenant_id,
        COALESCE(t.name, 'ไม่ระบุผู้เช่า') as tenant_name,
        t.phone as tenant_phone,
        t.email as tenant_email,
        dp.name as dorm_name,
        dp.address as dorm_address,
        dp.phone as dorm_phone,
        dp.promptpay_number,
        dp.promptpay_name,
        dp.water_rate,
        dp.electricity_rate
      FROM bills b
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN rooms r ON r.id = t.room_id
      LEFT JOIN dormitory_profile dp ON 1=1
      ORDER BY b.due_date DESC, b.created_at DESC
    `;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const enrichedBills = bills.map((b: any) => {
      let daysOverdue = 0;
      let lateFee = 0;
      if (b.status === 'Unpaid' && b.due_date) {
        const due = new Date(b.due_date);
        due.setHours(0, 0, 0, 0);
        const diffTime = today.getTime() - due.getTime();
        if (diffTime > 0) {
          daysOverdue = Math.floor(diffTime / (1000 * 60 * 60 * 24));
          lateFee = daysOverdue * 50;
        }
      }
      return {
        ...b,
        days_overdue: daysOverdue,
        late_fee: lateFee,
        base_amount: Number(b.amount),
        total_amount: Number(b.amount) + lateFee
      };
    });

    return NextResponse.json({ success: true, data: enrichedBills });
  } catch (err: any) {
    console.error('[Billing API] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  if ((session.user as any)?.role !== 'owner') {
    return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
  }
  const sql = getDb();

  try {
    const body = await req.json();
    const { 
      tenant_id, 
      title, 
      amount, 
      billing_cycle, 
      due_date, 
      room_number, 
      water_units, 
      electric_units, 
      water_amount, 
      electric_amount, 
      room_amount 
    } = body;

    if (!tenant_id || !title || !amount || !due_date) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    // Normalize billing_cycle to YYYY-MM format
    let normalizedCycle = billing_cycle;
    if (normalizedCycle) {
      const match = String(normalizedCycle).match(/^(\d{4})-(\d{1,2})/);
      if (match) {
        normalizedCycle = `${match[1]}-${match[2].padStart(2, '0')}`;
      }
    } else {
      normalizedCycle = new Date().toISOString().slice(0, 7);
    }

    // Prevent duplicate bill for same tenant in same billing cycle
    if (normalizedCycle) {
      const existing = await sql`
        SELECT id FROM bills 
        WHERE tenant_id = ${tenant_id} 
        AND billing_cycle = ${normalizedCycle}
        LIMIT 1
      `;
      if (existing.length > 0) {
        return NextResponse.json({ 
          success: false, 
          message: `มีใบแจ้งหนี้รอบบิล "${normalizedCycle}" สำหรับผู้เช่ารายนี้แล้ว ไม่สามารถออกบิลซ้ำได้` 
        }, { status: 400 });
      }
    }

    const result = await sql`
      INSERT INTO bills (
        tenant_id, 
        title, 
        amount, 
        billing_cycle, 
        due_date, 
        status, 
        room_number, 
        water_units, 
        electric_units, 
        water_amount, 
        electric_amount, 
        room_amount,
        bill_type
      )
      VALUES (
        ${tenant_id}, 
        ${title}, 
        ${amount}, 
        ${normalizedCycle}, 
        ${due_date}, 
        'Unpaid', 
        ${room_number || null}, 
        ${water_units || 0}, 
        ${electric_units || 0}, 
        ${water_amount || 0}, 
        ${electric_amount || 0}, 
        ${room_amount || 0},
        ${body.bill_type || (title.includes('จอง') || title.includes('มัดจำ') ? 'booking' : (title.includes('ซ่อม') || title.includes('ทำความสะอาด') ? 'service' : 'monthly'))}
      )
    `;

    // Notify tenant about new bill
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id
        FROM tenants t
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE t.id = ${tenant_id}
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'ใบแจ้งหนี้ใหม่ประจำรอบบิล',
            ${'มีใบแจ้งหนี้รอบบิล ' + (billing_cycle || '-') + ' จำนวน ฿' + Number(amount || 0).toLocaleString('th-TH') + ' กำหนดชำระภายใน ' + new Date(due_date).toLocaleDateString('th-TH')},
            'billing',
            0,
            '/tenant/billing',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Bill create notify warn:', ne);
    }

    return NextResponse.json({ success: true, data: { id: (result as any).insertId, ...body } });
  } catch (err: any) {
    console.error('[Billing API POST] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

