import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { bookingDeadlines, expireDueBookings } from '@/lib/bookings';
import { bookingFeeFor, moveInAmounts } from '@/lib/billing';
import { expireDueMoveIns } from '@/lib/moveIn';
import { isPaper, withPaperLink } from '@/lib/contract-files';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    const now = new Date();
    // No scheduler: bookings past their deadline, and move-in bills not paid by the start date, are expired when read
    await expireDueBookings(now);
    await expireDueMoveIns(now);

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
        c.move_in_bill_id,
        c.paper_signed_date,
        r.deposit_amount AS room_deposit_amount,
        dp.phone AS dorm_contact_phone,
        c.start_meter_reading AS initial_meter_reading
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN dormitory_registry dr ON r.dorm_id = dr.id
      LEFT JOIN dormitory_profile dp ON dp.id = 1
      LEFT JOIN bills b ON b.id = c.move_in_bill_id
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
        ...withPaperLink(b, 'contract_id'),
        booking_fee: bookingFeeFor(b.room_number),
        // Move-in amounts from the room on the server; contracts waiting without move_in_bill_id are older ones
        move_in: moveInAmounts({ room_number: b.room_number, price: b.price, deposit_amount: b.room_deposit_amount }),
        legacy: b.status === 'PendingFirstBill' && !b.move_in_bill_id,
        move_in_bill_paid: String(b.first_bill_status || '').toLowerCase() === 'paid',
        paper_uploaded: isPaper(b.contract_file_url) && Boolean(b.paper_signed_date),
        print_url: `/api/contracts/export-docx?id=${b.contract_id}`, // Word form until the PDF template is available
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
