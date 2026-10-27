import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { parseOccupants } from '@/lib/occupants';
import { parsePhone } from '@/lib/phone';
import { requestBooking } from '@/lib/bookings';
import { checkParty, hasPartyFields, type Party } from '@/lib/contract-party';

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
    const body = await req.json();
    const { roomId, signature, startDate, endDate, phone, parentPhone, idCardNumber, idCardImage, occupants } = body;
    let { tenantName, tenantAddress } = body;
    
    let party: Party | null = null;
    if (hasPartyFields(body)) {
      const p = checkParty(body);
      if (!p.ok) return NextResponse.json({ success: false, reason: p.reason, message: p.message }, { status: 400 });
      party = p.party;
      tenantName = party.fullName;
      tenantAddress = party.addressText;
    }

    // Fallback: If party data or phones were not provided in body, load from user profile
    let userRow: any = null;
    if (!party || !phone || !parentPhone) {
      const userRows = await sql`
        SELECT name, phone, parent_phone, party_data FROM users WHERE email = ${userEmail} LIMIT 1
      `;
      if (userRows.length > 0) {
        userRow = userRows[0];
      }
    }

    if (!party && userRow?.party_data) {
      try {
        const parsed = typeof userRow.party_data === 'string' ? JSON.parse(userRow.party_data) : userRow.party_data;
        const p = checkParty(parsed);
        if (p.ok) {
          party = p.party;
          tenantName = party.fullName;
          tenantAddress = party.addressText;
        }
      } catch (e) {
        console.error('Failed to parse user party_data in /api/contracts:', e);
      }
    }

    if (!roomId) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    const effectivePhone = phone || userRow?.phone;
    const effectiveParentPhone = parentPhone || userRow?.parent_phone;

    // commit 28a: phones digits only, 9–10 digits (lib/phone)
    const ph = parsePhone(effectivePhone, true);
    if (!ph.ok) return NextResponse.json({ success: false, message: ph.message }, { status: 400 });
    const pph = parsePhone(effectiveParentPhone);
    if (!pph.ok) return NextResponse.json({ success: false, message: pph.message }, { status: 400 });
    const occ = parseOccupants(occupants);
    if (!occ.ok) return NextResponse.json({ success: false, message: occ.message }, { status: 400 });

    const result = await requestBooking({
      email: userEmail,
      name: tenantName || session.user.name || null,
      phone: ph.value,
      idCardNumber: idCardNumber || null,
      idCardImage: idCardImage || null,
      address: tenantAddress || null,
      parentPhone: pph.value,
      roomId: Number(roomId),
      startDate,
      endDate,
      signature: signature || null,
      occupants: occ.value,
      party,
    }, new Date());

    if (!result.ok) {
      return NextResponse.json({
        success: false,
        reason: result.reason,
        message: result.message,
        ...(result.reason === 'has_open_contract' ? { statusUrl: '/explore/booking-status' } : {}),
      }, { status: 400 });
    }

    // Tell owners/managers there is a request to approve (in-app & WebPush)
    try {
      const staff = await sql`SELECT id, email FROM users WHERE role IN ('owner', 'manager') AND COALESCE(is_active, 1) = 1`;
      const guestDisplay = tenantName || session.user.name || 'ผู้จอง';
      for (const u of staff) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${u.id},
            '🛎️ มีคำขอจองห้องพักใหม่ (รออนุมัติ)',
            ${`คุณ ${guestDisplay} ขอจองห้อง ${result.roomNumber} — กรุณาตรวจสอบและอนุมัติ`},
            'booking',
            0,
            '/owner/bookings',
            NOW()
          )
        `.catch((err: any) => console.error('Insert notification error for user', u.id, err));
      }

      // Send WebPush notification to owners & guest
      const { sendWebPushToRole, sendWebPushToEmail } = await import('@/lib/features/web-push-server');
      await sendWebPushToRole('owner', {
        title: '🛎️ มีคำขอจองห้องพักใหม่ (รออนุมัติ)',
        body: `คุณ ${guestDisplay} ขอจองห้อง ${result.roomNumber} — กรุณาตรวจสอบและอนุมัติ`,
        url: '/owner/bookings',
        tag: `booking-new-${result.contractId}`,
      });

      // Confirm to guest
      await sendWebPushToEmail(userEmail, {
        title: '🛎️ ส่งคำขอจองห้องพักสำเร็จ',
        body: `คำขอจองห้อง ${result.roomNumber} อยู่ระหว่างรอหอพักตรวจสอบและอนุมัติ`,
        url: '/explore/booking-status',
        tag: `booking-requested-${result.contractId}`,
      });
    } catch (notifErr) {
      console.error('[WebPush / Notification error on booking request]', notifErr);
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอจองสำเร็จ รอหอพักตรวจสอบและอนุมัติ',
      contractId: result.contractId,
      bookingNumber: (result as any).bookingNumber,
    });

  } catch (error: any) {
    console.error('Error requesting booking:', error);
    return NextResponse.json({
      success: false,
      message: error.message || 'Failed to request booking',
    }, { status: 500 });
  }
}
