import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { bangkokDate, getRates } from '@/lib/billing';
import { issueMonthlyBill, meterRefusalStatus } from '@/lib/meters';
import { getPaymentSummaries, outstandingFor } from '@/lib/payments';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
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
        b.paid_at,
        b.payment_method,
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
        dp.electricity_rate,
        COALESCE(mr.photo_url, (
          SELECT mr2.photo_url 
          FROM meter_readings mr2 
          WHERE mr2.room_id = r.id 
            AND mr2.photo_url IS NOT NULL 
            AND mr2.photo_url != '' 
          ORDER BY mr2.id DESC 
          LIMIT 1
        )) as meter_photo_url,
        mr.previous_reading as meter_prev_reading,
        mr.current_reading as meter_current_reading
      FROM bills b
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN rooms r ON r.id = t.room_id OR r.room_number = b.room_number
      LEFT JOIN dormitory_profile dp ON 1=1
      LEFT JOIN meter_readings mr ON mr.id = (
        SELECT mr3.id 
        FROM meter_readings mr3 
        WHERE mr3.room_id = r.id 
          AND (mr3.billing_cycle = b.billing_cycle OR mr3.billing_cycle IS NULL)
          AND (mr3.type = 'Electricity' OR mr3.type = 'Electric')
        ORDER BY (mr3.kind = 'cycle') DESC, mr3.id DESC 
        LIMIT 1
      )
      ORDER BY b.due_date DESC, b.created_at DESC
    `;
    
    const rates = await getRates(sql);
    const now = new Date();

    const summaries = await getPaymentSummaries(sql, bills.map((b: any) => b.id));
    const enrichedBills = bills.map((b: any) => {
      const s = summaries.get(b.id) || { paid_total: 0, payments: [] };
      const owed = outstandingFor(b, s.paid_total, now, rates);
      return {
        ...b,
        days_overdue: owed.daysOverdue,
        late_fee: owed.lateFee,
        base_amount: Number(b.amount),
        total_amount: owed.due,
        paid_total: s.paid_total,
        outstanding: owed.outstanding,
        payments: s.payments,
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
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  const sql = getDb();

  try {
    const body = await req.json();
    let {
      tenant_id,
      title,
      amount,
      due_date,
      water_units,
      electric_units,
      water_amount,
      electric_amount,
      room_amount,
      common_fee,
    } = body;
    const { billing_cycle, room_number } = body;

    // Normalize billing_cycle to YYYY-MM format
    let normalizedCycle = billing_cycle;
    if (normalizedCycle) {
      const match = String(normalizedCycle).match(/^(\d{4})-(\d{1,2})/);
      if (match) {
        normalizedCycle = `${match[1]}-${match[2].padStart(2, '0')}`;
      }
    } else {
      normalizedCycle = bangkokDate(new Date()).slice(0, 7);
    }

    // Monthly bills: lib/meters.ts — priced on the server from the cycle's reading, Draft, one per tenant and cycle
    // (amounts and due date from the client are ignored). Sent later, which notifies the tenant.
    if (body.bill_type === 'monthly') {
      const r = await issueMonthlyBill(String(room_number || ''), normalizedCycle, guard.user, new Date(), title);
      if (!r.ok) return NextResponse.json({ success: false, message: r.message }, { status: meterRefusalStatus(r.reason) });
      if (!r.issued) return NextResponse.json({ success: false, message: r.message, skipped: r.skipped, billId: r.billId }, { status: r.skipped === 'exists' || r.skipped === 'final_bill' ? 409 : 400 });
      return NextResponse.json({
        success: true,
        data: { id: r.billId, tenant_id: r.tenantId, amount: r.amount, due_date: r.dueDate, billing_cycle: normalizedCycle, room_number: r.roomNumber, status: 'Draft' },
      });
    }

    if (!tenant_id || !title || !amount || !due_date) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const isDraft = false;
    const billType = body.bill_type || (title.includes('จอง') || title.includes('มัดจำ') ? 'booking' : (title.includes('ซ่อม') || title.includes('ทำความสะอาด') ? 'service' : 'monthly'));
    if (billType === 'monthly') {
      return NextResponse.json({ success: false, message: 'บิลรายเดือนออกได้จากเลขมิเตอร์เท่านั้น (bill_type: monthly + room_number)' }, { status: 400 });
    }

    // Same tenant, cycle and bill type only (a month also has repair / service / final bills)
    if (normalizedCycle) {
      const existing = await sql`
        SELECT id FROM bills
        WHERE tenant_id = ${tenant_id} AND billing_cycle = ${normalizedCycle} AND COALESCE(bill_type, 'monthly') = ${billType}
          AND LOWER(status) NOT IN ('cancelled', 'canceled')
        LIMIT 1
      `;
      if (existing.length > 0) {
        return NextResponse.json({ 
          success: false, 
          message: `มีใบแจ้งหนี้ประเภทนี้รอบบิล "${normalizedCycle}" สำหรับผู้เช่ารายนี้แล้ว ไม่สามารถออกบิลซ้ำได้` 
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
        common_fee,
        bill_type
      )
      VALUES (
        ${tenant_id}, 
        ${title}, 
        ${amount}, 
        ${normalizedCycle}, 
        ${due_date},
        ${isDraft ? 'Draft' : 'Unpaid'},
        ${room_number || null}, 
        ${water_units || 0}, 
        ${electric_units || 0}, 
        ${water_amount || 0}, 
        ${electric_amount || 0}, 
        ${room_amount || 0},
        ${common_fee || 0},
        ${billType}
      )
    `;

    // Notify tenant about new bill (drafts are notified when sent)
    if (!isDraft) try {
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
            ${'มีใบแจ้งหนี้รอบบิล ' + (normalizedCycle || '-') + ' จำนวน ฿' + Number(amount || 0).toLocaleString('th-TH') + ' กำหนดชำระภายใน ' + new Date(due_date).toLocaleDateString('th-TH')},
            'billing',
            0,
            '/tenant/billing',
            ${new Date()}
          )
        `;
      }
    } catch (ne) {
      console.warn('Bill create notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      data: { id: (result as any).insertId, ...body, tenant_id, title, amount, due_date, billing_cycle: normalizedCycle, electric_units, electric_amount, water_amount, room_amount, common_fee },
    });
  } catch (err: any) {
    console.error('[Billing API POST] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

