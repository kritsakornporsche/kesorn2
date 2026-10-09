import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    // Find the user's booking & contract status
    const bookings = await sql`
      SELECT 
        c.id AS contract_id,
        c.status,
        c.start_date,
        c.end_date,
        c.deposit_amount,
        r.price AS monthly_rent,
        c.created_at,
        c.room_id,
        c.contract_file_url,
        c.slip_url,
        r.room_number,
        r.floor,
        r.price,
        r.room_type,
        COALESCE(dr.dorm_name, dp.name, 'หอพักเกษร 2') AS dorm_name,
        COALESCE(dr.address, dp.address, 'พะเยา') AS dorm_address,
        COALESCE(dr.phone, dp.phone, '081-234-5678') AS dorm_phone,
        b.id AS first_bill_id,
        b.amount AS first_bill_amount,
        b.status AS first_bill_status,
        b.due_date AS first_bill_due_date,
        b.slip_url AS first_bill_slip_url,
        b.room_amount AS first_bill_room_amount,
        c.renewal_note AS rejection_reason,
        (
          SELECT mr.current_reading 
          FROM meter_readings mr 
          WHERE mr.room_id = c.room_id AND mr.type = 'Electricity' 
          ORDER BY mr.id DESC 
          LIMIT 1
        ) AS initial_meter_reading
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN dormitory_registry dr ON r.dorm_id = dr.id
      LEFT JOIN dormitory_profile dp ON dp.id = 1
      LEFT JOIN (
        SELECT id, tenant_id, room_number, amount, status, due_date, slip_url, room_amount
        FROM bills
        WHERE (is_first_bill = 1 OR bill_type = 'booking') AND status != 'Cancelled'
        ORDER BY id DESC
        LIMIT 1
      ) b ON (b.tenant_id = c.tenant_id)
      WHERE (t.email = ${session.user.email} 
         OR t.user_id = ${(session.user as any).id || 0}
         OR c.id_card_number IN (SELECT id_card_number FROM contracts WHERE tenant_id IN (SELECT id FROM tenants WHERE email = ${session.user.email}))
         OR c.tenant_id IN (SELECT id FROM tenants WHERE email = ${session.user.email}))
        AND c.status IN ('PendingContract', 'PendingFirstBill', 'PendingOwnerSignature', 'Active', 'Cancelled', 'Rejected')
      GROUP BY c.id
      ORDER BY c.id DESC
      LIMIT 10
    `;

    return NextResponse.json({
      success: true,
      data: bookings,
    });
  } catch (error: any) {
    console.error('[Booking Status Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
