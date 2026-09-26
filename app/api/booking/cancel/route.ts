import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

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
    let targetRoomId = roomId;

    if (!targetContractId && !targetRoomId) {
      // Find latest pending contract for this user
      const userContracts = await sql`
        SELECT c.id, c.room_id 
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.id
        WHERE (t.email = ${session.user.email} OR t.user_id = ${(session.user as any).id || 0})
        AND c.status = 'PendingOwnerSignature'
        ORDER BY c.id DESC
        LIMIT 1
      `;
      if (userContracts.length > 0) {
        targetContractId = userContracts[0].id;
        targetRoomId = userContracts[0].room_id;
      }
    }

    if (!targetContractId && !targetRoomId) {
      return NextResponse.json({ success: false, message: 'No pending booking found to cancel' }, { status: 404 });
    }

    // 2. Delete or cancel contract
    if (targetContractId) {
      const contractData = await sql`SELECT room_id FROM contracts WHERE id = ${targetContractId}`;
      if (contractData.length > 0) {
        targetRoomId = targetRoomId || contractData[0].room_id;
      }
      await sql`
        UPDATE contracts 
        SET status = 'Cancelled', renewal_note = 'ผู้เช่ายกเลิกการจองผ่านระบบ'
        WHERE id = ${targetContractId} AND status = 'PendingOwnerSignature'
      `;
    }

    // 3. Set room back to Available
    if (targetRoomId) {
      await sql`UPDATE rooms SET status = 'Available' WHERE id = ${targetRoomId}`;
      await sql`DELETE FROM booking_progress WHERE user_email = ${session.user.email} AND room_id = ${targetRoomId}`;
    }

    return NextResponse.json({ 
      success: true, 
      message: 'ยกเลิกการจองห้องพักเรียบร้อยแล้ว ห้องพักกลับสู่สถานะว่าง' 
    });

  } catch (error: any) {
    console.error('[Cancel Booking Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
