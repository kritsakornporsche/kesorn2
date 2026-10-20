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

    // Not paid yet (waiting for approval / for the booking fee): cancel without forfeiting anything
    if (currentStatus === 'BookingRequested' || currentStatus === 'BookingApproved') {
      const cancelled = await cancelUnpaidBooking(Number(targetContractId), Number((session.user as any).id) || null, new Date());
      if (!cancelled.ok) {
        return NextResponse.json({ success: false, message: cancelled.message }, { status: 400 });
      }
      return NextResponse.json({ success: true, message: 'ยกเลิกคำขอจองแล้ว ห้องเปิดให้ผู้อื่นจองแล้ว' });
    }

    // Paid booking (commit 28-7): through lib/bookings — row locked, this booking's own bill only, the room released
    // only if nothing else holds it, the booking fee forfeited
    const paid = await cancelPaidBooking(Number(targetContractId), { id: Number((session.user as any).id) || null, email: session.user.email }, new Date());
    if (!paid.ok) {
      return NextResponse.json({ success: false, message: paid.message }, { status: paid.reason === 'not_found' ? 404 : 400 });
    }
    return NextResponse.json({
      success: true,
      message: 'ยกเลิกการจองเรียบร้อยแล้ว ห้องพักกลับสู่สถานะว่าง',
    });
  } catch (error: any) {
    console.error('[Cancel Booking Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
