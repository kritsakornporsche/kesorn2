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
      // Find latest contract in PendingContract state for this user
      const userContracts = await sql`
        SELECT c.id, c.room_id, c.status
        FROM contracts c
        JOIN tenants t ON c.tenant_id = t.id
        WHERE (t.email = ${session.user.email} OR t.user_id = ${(session.user as any).id || 0})
        AND c.status IN ('PendingContract', 'PendingOwnerSignature')
        ORDER BY c.id DESC
        LIMIT 1
      `;
      if (userContracts.length > 0) {
        targetContractId = userContracts[0].id;
        targetRoomId = userContracts[0].room_id;
      }
    }

    if (!targetContractId) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการจองที่สามารถยกเลิกได้' }, { status: 404 });
    }

    // 2. Check if the contract is strictly in PendingContract state (Can only cancel at 2.1.1)
    const contractData = await sql`SELECT room_id, status FROM contracts WHERE id = ${targetContractId}`;
    if (contractData.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบสัญญาที่ระบุ' }, { status: 404 });
    }

    const currentStatus = contractData[0].status;
    if (currentStatus !== 'PendingContract' && currentStatus !== 'PendingOwnerSignature') {
      return NextResponse.json({
        success: false,
        message: 'ไม่สามารถยกเลิกการจองได้ เนื่องจากอยู่ในขั้นตอนทำสัญญา/ชำระค่าแรกเข้าแล้ว'
      }, { status: 400 });
    }

    targetRoomId = targetRoomId || contractData[0].room_id;

    // 3. Mark contract as Cancelled (deposit non-refundable)
    await sql`
      UPDATE contracts 
      SET status = 'Cancelled', renewal_note = 'ผู้จองกดยกเลิกการจอง (ไม่คืนเงินมัดจำ)'
      WHERE id = ${targetContractId}
    `;

    // 3.1 Cancel any associated booking bills
    try {
      await sql`
        UPDATE bills 
        SET status = 'Cancelled' 
        WHERE (tenant_id IN (SELECT tenant_id FROM contracts WHERE id = ${targetContractId}) OR room_number IN (SELECT room_number FROM rooms WHERE id = ${targetRoomId}))
          AND bill_type = 'booking'
          AND status != 'Cancelled'
      `;
    } catch (bErr) {
      console.warn('Could not cancel booking bill:', bErr);
    }

    // 4. Reset room status to Available immediately
    if (targetRoomId) {
      await sql`
        UPDATE rooms 
        SET status = 'Available' 
        WHERE id = ${targetRoomId}
      `;
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
