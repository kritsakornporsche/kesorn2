import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { bookingDeadlines, expireDueBookings } from '@/lib/bookings';
import { bookingFeeFor } from '@/lib/billing';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    const now = new Date();
    // No scheduler: bookings past their deadline are expired whenever they are read
    await expireDueBookings(now);

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
        COALESCE(c.cancel_reason, c.renewal_note) AS rejection_reason,
        c.approved_at,
        c.expires_at,
        c.cancelled_at,
        dp.phone AS dorm_contact_phone,
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
      LEFT JOIN bills b ON b.id = (
        SELECT b2.id FROM bills b2
        WHERE b2.tenant_id = c.tenant_id AND (b2.is_first_bill = 1 OR b2.bill_type = 'booking') AND b2.status != 'Cancelled'
        ORDER BY b2.id DESC
        LIMIT 1
      )
      WHERE (t.email = ${session.user.email} 
         OR t.user_id = ${(session.user as any).id || 0}
         OR c.id_card_number IN (SELECT id_card_number FROM contracts WHERE tenant_id IN (SELECT id FROM tenants WHERE email = ${session.user.email}))
         OR c.tenant_id IN (SELECT id FROM tenants WHERE email = ${session.user.email}))
        AND c.status IN ('BookingRequested', 'BookingApproved', 'PendingContract', 'PendingFirstBill', 'PendingOwnerSignature', 'Active', 'Cancelled', 'Rejected', 'Expired')
      GROUP BY c.id
      ORDER BY c.id DESC
      LIMIT 10
    `;

    // Time left, computed with the server clock: the page counts down from these values, not the browser clock
    const secondsTo = (d: Date) => Math.max(0, Math.floor((d.getTime() - now.getTime()) / 1000));
    const data = bookings.map((b: any) => {
      const deadlines = b.approved_at ? bookingDeadlines(new Date(b.approved_at)) : null;
      return {
        ...b,
        booking_fee: bookingFeeFor(b.room_number),
        seconds_to_expire: b.expires_at ? secondsTo(new Date(b.expires_at)) : null,
        seconds_to_pay: b.status === 'BookingApproved' && deadlines ? secondsTo(deadlines.payBy) : null,
        seconds_to_upload: b.status === 'BookingApproved' && deadlines ? secondsTo(deadlines.uploadBy) : null,
      };
    });

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error: any) {
    console.error('[Booking Status Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
