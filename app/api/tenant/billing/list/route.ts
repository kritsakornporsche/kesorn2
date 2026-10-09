import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, data: [], message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const role = (session.user as any)?.role;
    const isStaff = role === 'owner' || role === 'keeper' || role === 'platform_admin';
    const emailParam = searchParams.get('email');

    if (emailParam && emailParam.toLowerCase() !== session.user.email.toLowerCase() && !isStaff) {
      return NextResponse.json({ success: false, message: 'Forbidden: คุณไม่มีสิทธิ์เข้าถึงบิลของผู้ใช้อื่น' }, { status: 403 });
    }

    const userEmail = (isStaff && emailParam) ? emailParam : session.user.email;
    const userId = (session.user as any)?.id || null;

    const sql = getDb();
    
    // Find all bills associated with this user/tenant across any dorms, including meter evidence photo
    const bills = await sql`
      SELECT 
        b.*,
        COALESCE(b.water_units, 0) as water_units,
        COALESCE(b.electric_units, 0) as electric_units,
        COALESCE(b.water_amount, 0) as water_amount,
        COALESCE(b.electric_amount, 0) as electric_amount,
        COALESCE(b.room_amount, 0) as room_amount,
        COALESCE(b.common_fee, 0) as common_fee,
        dp.water_rate,
        dp.electricity_rate,
        dp.name as dorm_name,
        dp.promptpay_number,
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
        mr.current_reading as meter_current_reading,
        bc.id as correction_id,
        bc.status as correction_status,
        bc.reason as correction_reason,
        bc.new_electric_reading as correction_new_reading,
        bc.new_total_amount as correction_new_total,
        bc.requested_by as correction_requested_by
      FROM bills b
      LEFT JOIN dormitory_profile dp ON 1=1
      LEFT JOIN rooms r ON r.room_number = b.room_number
      LEFT JOIN meter_readings mr ON mr.id = (
        SELECT mr3.id 
        FROM meter_readings mr3 
        WHERE mr3.room_id = r.id 
          AND (mr3.billing_cycle = b.billing_cycle OR mr3.billing_cycle IS NULL)
          AND (mr3.type = 'Electricity' OR mr3.type = 'Electric')
        ORDER BY mr3.id DESC 
        LIMIT 1
      )
      LEFT JOIN (
        SELECT bc1.*
        FROM bill_corrections bc1
        INNER JOIN (
          SELECT bill_id, MAX(id) as max_id
          FROM bill_corrections
          GROUP BY bill_id
        ) bc2 ON bc1.id = bc2.max_id
      ) bc ON bc.bill_id = b.id
      WHERE b.tenant_id IN (
        SELECT t.id FROM tenants t 
        WHERE t.email = ${userEmail || ''} 
           OR t.user_id = ${userId || 0}
           OR t.user_id IN (SELECT u.id FROM users u WHERE u.email = ${userEmail || ''})
      )
      ORDER BY b.id DESC
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
  } catch (error: any) {
    console.error('[GET /api/tenant/billing/list] Error:', error);
    return NextResponse.json({ success: false, data: [], message: error.message }, { status: 500 });
  }
}
