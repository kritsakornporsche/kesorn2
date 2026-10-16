import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { approveBooking, bookingDeadlines, cancelNoShow, expireDueBookings, rejectBooking } from '@/lib/bookings';
import { bangkokDate, bookingFeeFor, capCheck, moveInAmounts } from '@/lib/billing';
import { expireDueMoveIns } from '@/lib/moveIn';
import { isPaper, withPaperLink } from '@/lib/contract-files';
import { formatBaht } from '@/lib/format';
import { INSPECTABLE, inspectionStatuses, type InspectionStatus } from '@/lib/inspections';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId') || searchParams.get('dormDbName');
    const userEmail = session.user.email;

    const sql = getDb();
    const now = new Date();
    // No scheduler: bookings past their deadline, and move-in bills not paid by the start date, are expired when read
    await expireDueBookings(now);
    await expireDueMoveIns(now);

    // Single Dormitory (Kesorn 2) bookings query
    const dorms = [
      { id: 1, dorm_name: 'หอพักเกษร 2', db_name: 'kesorn_db' }
    ];

    const bookings = await sql`
      SELECT 
        c.id as contract_id,
        c.tenant_id,
        c.room_id,
        c.start_date, 
        c.end_date, 
        c.deposit_amount, 
        c.status as booking_status, 
        c.slip_url,
        c.signature_data,
        c.owner_signature_data,
        c.contract_file_url,
        c.id_card_number,
        c.tenant_address,
        c.id_card_image,
        c.parent_phone,
        c.created_at as booking_created_at,
        c.approved_at,
        c.expires_at,
        c.cancelled_at,
        c.cancel_reason,
        c.booking_bill_id,
        c.move_in_bill_id,
        c.start_meter_reading,
        c.paper_signed_date,
        c.paper_uploaded_at,
        COALESCE(t.name, u.name, 'ไม่ระบุชื่อ') as guest_name,
        COALESCE(t.email, u.email, '') as guest_email,
        COALESCE(t.phone, u.phone, '') as guest_phone,
        r.room_number,
        r.room_type,
        r.floor,
        r.price as monthly_rent,
        r.deposit_amount as room_deposit_amount,
        r.status as room_status,
        b.id as first_bill_id,
        b.title as first_bill_title,
        b.amount as first_bill_amount,
        b.status as first_bill_status,
        b.due_date as first_bill_due_date,
        b.created_at as first_bill_created_at,
        (SELECT COUNT(*) FROM bill_payments p WHERE p.bill_id = b.id AND p.voided_at IS NULL) as first_bill_payments,
        1 as dorm_id,
        'หอพักเกษร 2' as dorm_name
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN bills b ON b.id = c.move_in_bill_id
      ORDER BY 
        CASE 
          WHEN c.status = 'BookingRequested' THEN 0
          WHEN c.status = 'BookingApproved' THEN 0
          WHEN c.status = 'PendingOwnerSignature' THEN 1
          WHEN c.status = 'PendingFirstBill' THEN 2
          WHEN c.status = 'Active' THEN 3
          ELSE 4
        END ASC,
        c.id DESC
    `;

    // Fetch rooms for room reassignment or manual booking
    const availableRooms = await sql`
      SELECT id, 1 as dorm_id, room_number, floor, room_type, price, status 
      FROM rooms 
      ORDER BY room_number ASC
    `;

    // Move-in inspection status (lib/inspections.ts); left out when migration 011 has not been run
    let inspections: Record<number, InspectionStatus> | null = null;
    try {
      inspections = await inspectionStatuses(bookings.filter((b: any) => INSPECTABLE.includes(b.booking_status)).map((b: any) => Number(b.contract_id)));
    } catch (e) {
      console.warn('[Owner bookings inspection status]', e);
    }

    // Time left, computed with the server clock (the page counts down from these, not from the browser clock)
    const withTimers = bookings.map((b: any) => {
      const deadlines = b.approved_at ? bookingDeadlines(new Date(b.approved_at)) : null;
      const secondsTo = (d: Date | null) => (d ? Math.max(0, Math.floor((d.getTime() - now.getTime()) / 1000)) : null);
      const moveIn = moveInAmounts({ room_number: b.room_number, price: b.monthly_rent, deposit_amount: b.room_deposit_amount });
      const cap = capCheck(moveIn.rent, moveIn.deposit);
      const pastStart = Boolean(b.start_date) && bangkokDate(now) > bangkokDate(b.start_date);
      const firstBillPaid = String(b.first_bill_status || '').toLowerCase() === 'paid';
      return {
        ...withPaperLink(b, 'contract_id'),
        booking_fee: bookingFeeFor(b.room_number),
        inspection_status: inspections?.[Number(b.contract_id)] ?? null,
        // Move-in (lib/moveIn.ts): amounts from the room on the server; contracts without move_in_bill_id are older ones
        move_in: { ...moveIn, cap_ok: cap.ok, cap_message: cap.ok ? null : cap.message },
        legacy: b.booking_status === 'PendingFirstBill' && !b.move_in_bill_id,
        move_in_bill_paid: firstBillPaid,
        paper_uploaded: isPaper(b.contract_file_url) && Boolean(b.paper_signed_date),
        move_in_overdue_partial: b.booking_status === 'PendingFirstBill' && pastStart && !firstBillPaid && Number(b.first_bill_payments || 0) > 0,
        can_issue_move_in: ['PendingOwnerSignature', 'PendingContract'].includes(b.booking_status) && !b.move_in_bill_id && !pastStart,
        seconds_to_expire: b.expires_at ? secondsTo(new Date(b.expires_at)) : null,
        seconds_to_pay: b.booking_status === 'BookingApproved' ? secondsTo(deadlines?.payBy || null) : null,
        // No-show cancel is possible from the day after the move-in date (Thai date); never for older contracts
        // (their move-in payment cannot be checked — lib/bookings cancelNoShow refuses them too)
        no_show_allowed: ['PendingOwnerSignature', 'PendingContract', 'PendingFirstBill'].includes(b.booking_status)
          && !(b.booking_status === 'PendingFirstBill' && !b.move_in_bill_id)
          && Boolean(b.start_date) && bangkokDate(now) > bangkokDate(b.start_date),
      };
    });

    return NextResponse.json({ 
      success: true, 
      data: withTimers,
      availableRooms: availableRooms,
      dorms: dorms,
      selectedDormId: 1
    });
  } catch (error: any) {
    console.error('[API Owner Bookings GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST { action, contractId, reason? } — approve / reject a booking request, or cancel a paid booking whose
// guest did not come (forfeits the booking fee). All booking rules live in lib/bookings.ts.
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { action } = body;
    const contractId = Number(body.contractId);
    if (!contractId) {
      return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
    }
    const sql = getDb();
    const now = new Date();
    const notify = async (userId: number | null, title: string, message: string, type: string) => {
      if (!userId) return;
      await sql`
        INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
        VALUES (${userId}, ${title}, ${message}, ${type}, 0, '/explore/booking-status', NOW())
      `.catch((e: any) => console.warn('[Owner bookings notify]', e));
    };

    if (action === 'approve') {
      const result = await approveBooking(contractId, guard.user.id, now);
      if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: 400 });
      await notify(result.tenantUserId, '✅ หอพักอนุมัติการจองแล้ว',
        `ห้อง ${result.roomNumber}: กรุณาโอนค่าจอง ฿${formatBaht(result.fee)} และอัปโหลดสลิปภายใน 10 นาที`, 'booking_approved');
      return NextResponse.json({ success: true, message: 'อนุมัติการจองแล้ว ผู้จองมีเวลาชำระค่าจอง 10 นาที', data: result });
    }

    if (action === 'reject') {
      const result = await rejectBooking(contractId, guard.user.id, String(body.reason || ''), now);
      if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: 400 });
      await notify(result.tenantUserId, 'คำขอจองไม่ได้รับการอนุมัติ',
        `คำขอจองห้อง ${result.roomNumber} ไม่ได้รับการอนุมัติ${body.reason ? `: ${String(body.reason).slice(0, 200)}` : ''}`, 'booking_rejected');
      return NextResponse.json({ success: true, message: 'ปฏิเสธคำขอจองแล้ว ห้องกลับเป็นว่าง' });
    }

    if (action === 'cancel') {
      const result = await cancelNoShow(contractId, guard.user.id, now);
      if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: 400 });
      return NextResponse.json({
        success: true,
        message: `ยกเลิกการจอง (ไม่มาตามนัด) แล้ว ริบค่าจอง ฿${formatBaht(result.forfeited)} เป็นรายได้`,
        data: result,
      });
    }

    return NextResponse.json({ success: false, message: 'Invalid action specified' }, { status: 400 });
  } catch (error: any) {
    console.error('[API Owner Bookings POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
