import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { cancelPaidBooking, cancelUnpaidBooking } from '@/lib/bookings';

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }

  const sql = getDb();

  try {
    const { contractId, roomId } = await req.json();

    // 1. Find the pending contract
    let targetContractId = contractId;

    if (!targetContractId && !roomId) {
      // Find latest contract in PendingContract state for this user
      const userContracts = await sql`
        SELECT c.id, c.room_id, c.status
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.id
        WHERE (t.email = ${session.user.email} OR t.user_id = ${(session.user as any).id || 0})
        AND c.status IN ('BookingRequested', 'BookingApproved', 'PendingContract', 'PendingOwnerSignature')
        ORDER BY c.id DESC
        LIMIT 1
      `;
      if (userContracts.length > 0) {
        targetContractId = userContracts[0].id;
      }
    }

    if (!targetContractId) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการจองที่สามารถยกเลิกได้' }, { status: 404 });
    }

    // 2. Check if the contract is strictly in PendingContract state (Can only cancel at 2.1.1)
    const contractData = await sql`SELECT room_id, tenant_id, status FROM contracts WHERE id = ${targetContractId}`;
    if (contractData.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบสัญญาที่ระบุ' }, { status: 404 });
    }

    const currentStatus = contractData[0].status;

    // Only the booker can cancel their own booking (paid or not)
    const owner = await sql`
      SELECT t.id FROM tenants t
      WHERE t.id = ${contractData[0].tenant_id}
        AND (LOWER(t.email) = LOWER(${session.user.email}) OR t.user_id = ${(session.user as any).id || 0})
      LIMIT 1
    `;
    if (owner.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการจองที่สามารถยกเลิกได้' }, { status: 404 });
    }

    // Get room & user details for notifications before cancel
    const roomInfo = (await sql`
      SELECT r.room_number, COALESCE(t.name, u.name, 'ผู้จอง') as guest_name
      FROM contracts c
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      WHERE c.id = ${targetContractId}
    `)[0] || { room_number: '-', guest_name: 'ผู้จอง' };

    const sendCancellationNotifications = async () => {
      try {
        const staff = await sql`SELECT id FROM users WHERE role IN ('owner', 'manager') AND COALESCE(is_active, 1) = 1`;
        for (const u of staff) {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${u.id},
              '❌ มีการยกเลิกการจองห้องพัก',
              ${`คุณ ${roomInfo.guest_name} ได้ยกเลิกการจองห้อง ${roomInfo.room_number} (ห้องกลับสู่สถานะว่าง)`},
              'booking_cancelled',
              0,
              '/owner/bookings',
              NOW()
            )
          `.catch((e: any) => console.warn('[Cancel in-app notif error]', e));
        }

        const { sendWebPushToRole, sendWebPushToEmail } = await import('@/lib/features/web-push-server');
        await sendWebPushToRole('owner', {
          title: '❌ มีการยกเลิกการจองห้องพัก',
          body: `คุณ ${roomInfo.guest_name} ได้ยกเลิกการจองห้อง ${roomInfo.room_number} (ห้องกลับสู่สถานะว่าง)`,
          url: '/owner/bookings',
          tag: `booking-cancelled-${targetContractId}`,
        });

        if (session?.user?.email) {
          await sendWebPushToEmail(session.user.email, {
            title: '❌ ยกเลิกการจองห้องพักเรียบร้อย',
            body: `การจองห้อง ${roomInfo.room_number} ถูกยกเลิกเรียบร้อยแล้ว`,
            url: '/explore',
            tag: `guest-cancelled-${targetContractId}`,
          });
        }
      } catch (err) {
        console.warn('[Cancellation notifications error]', err);
      }
    };

    // Not paid yet: cancel without forfeiting anything
    if (currentStatus === 'BookingRequested' || currentStatus === 'BookingApproved') {
      const cancelled = await cancelUnpaidBooking(Number(targetContractId), Number((session.user as any).id) || null, new Date());
      if (!cancelled.ok) {
        return NextResponse.json({ success: false, message: cancelled.message }, { status: 400 });
      }
      await sendCancellationNotifications();
      return NextResponse.json({ success: true, message: 'ยกเลิกคำขอจองแล้ว ห้องเปิดให้ผู้อื่นจองแล้ว' });
    }

    // Paid booking: through lib/bookings
    const paid = await cancelPaidBooking(Number(targetContractId), { id: Number((session.user as any).id) || null, email: session.user.email }, new Date());
    if (!paid.ok) {
      return NextResponse.json({ success: false, message: paid.message }, { status: paid.reason === 'not_found' ? 404 : 400 });
    }
    await sendCancellationNotifications();
    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการจองเรียบร้อยแล้ว ห้องพักกลับสู่สถานะว่าง',
    });
  } catch (error: any) {
    console.error('[Cancel Booking Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
