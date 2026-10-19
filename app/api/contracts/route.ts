import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { requestBooking } from '@/lib/bookings';

// A guest asks to book a room (approve first, then pay): no slip and no payment here.
// Accepted at any time (it waits for approval); one open request per account; the room must be free.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const userEmail = session.user.email;
  if (!userEmail) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { roomId, signature, startDate, endDate, tenantName, phone, parentPhone, idCardNumber, tenantAddress, idCardImage } = await req.json();

    if (!roomId) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    const result = await requestBooking({
      email: userEmail,
      name: tenantName || session.user.name || null,
      phone: phone || null,
      idCardNumber: idCardNumber || null,
      idCardImage: idCardImage || null,
      address: tenantAddress || null,
      parentPhone: parentPhone || null,
      roomId: Number(roomId),
      startDate,
      endDate,
      signature: signature || null,
    }, new Date());

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        reason: result.reason,
        message: result.message,
        ...(result.reason === 'has_open_contract' ? { statusUrl: '/explore/booking-status' } : {}),
      }, { status: 400 });
    }

    // Tell owners/managers there is a request to approve (it waits until they approve or reject)
    try {
      const staff = await sql`SELECT id FROM users WHERE role IN ('owner', 'manager') AND COALESCE(is_active, 1) = 1`;
      const guestDisplay = tenantName || session.user.name || 'ผู้จอง';
      for (const u of staff) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${u.id},
            '🛎️ มีคำขอจองห้องพักใหม่ (รออนุมัติ)',
            ${`คุณ ${guestDisplay} ขอจองห้อง ${result.roomNumber} — กรุณาติดต่อผู้จองแล้วอนุมัติหรือปฏิเสธ (ห้องถูกกันไว้จนกว่าจะตัดสิน)`},
            'booking',
            0,
            '/owner/bookings',
            NOW()
          )
        `.catch((err: any) => console.error('Insert notification error for user', u.id, err));
      }
    } catch (notifError) {
      console.warn('[API Contracts] Notification sending failed non-fatally:', notifError);
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอจองแล้ว รอหอพักอนุมัติ',
      contractId: result.contractId,
      expiresAt: result.expiresAt,
    });
  } catch (error: any) {
    console.error('[API Contracts POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
