import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { 
      roomId, 
      signature, 
      startDate, 
      endDate, 
      depositAmount, 
      monthlyRent, 
      tenantName,
      slipUrl 
    } = await req.json();

    if (!roomId) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    // 1. Resolve tenant identity (find existing or create new)
    const userEmail = session.user.email;
    let tenants = await sql`SELECT id FROM tenants WHERE email = ${userEmail} LIMIT 1`;
    let tenantId: number;

    if (tenants.length > 0) {
      tenantId = tenants[0].id;
      if (tenantName) {
        await sql`UPDATE tenants SET name = ${tenantName} WHERE id = ${tenantId}`;
      }
    } else {
      await sql`
        INSERT INTO tenants (name, email, status)
        VALUES (${tenantName || session.user.name || 'Tenant'}, ${userEmail}, 'Active')
      `;
      const created = await sql`SELECT id FROM tenants WHERE email = ${userEmail} ORDER BY id DESC LIMIT 1`;
      if (!created || created.length === 0) {
        return NextResponse.json({ success: false, message: 'Failed to create tenant record' }, { status: 500 });
      }
      tenantId = created[0].id;
    }

    // 2. Create Contract record with slipUrl
    await sql`
      INSERT INTO contracts (
        tenant_id, 
        room_id, 
        start_date, 
        end_date, 
        deposit_amount, 
        signature_data, 
        slip_url,
        status
      ) VALUES (
        ${tenantId}, 
        ${roomId}, 
        ${startDate}, 
        ${endDate}, 
        ${depositAmount}, 
        ${signature || 'CONFIRMED_E_CONTRACT'}, 
        ${slipUrl || null},
        'PendingOwnerSignature'
      )
    `;

    const contracts = await sql`
      SELECT id FROM contracts 
      WHERE tenant_id = ${tenantId} AND room_id = ${roomId} 
      ORDER BY id DESC LIMIT 1
    `;
    const contractId = contracts.length > 0 ? contracts[0].id : null;

    // 3. Update room status to Reserved
    await sql`UPDATE rooms SET status = 'Reserved' WHERE id = ${roomId}`;

    // 4. Send Notification to Dorm Owner and staff
    try {
      const dormInfo = await sql`
        SELECT 1 as dorm_id, dp.name as dorm_name, r.room_number
        FROM rooms r
        CROSS JOIN dormitory_profile dp
        WHERE r.id = ${roomId}
        LIMIT 1
      `;

      if (dormInfo.length > 0) {
        const { dorm_id, dorm_name, room_number } = dormInfo[0];
        const recipientUserIds = new Set<number>();

        const ownerUsers = await sql`SELECT id FROM users WHERE role IN ('owner', 'keeper')`;
        for (const u of ownerUsers) {
          recipientUserIds.add(u.id);
        }

        // Also notify assigned staff/keepers for this dorm
        const staff = await sql`
          SELECT DISTINCT user_id FROM user_dorm_roles
          WHERE dorm_id = ${dorm_id} AND role IN ('owner', 'keeper')
        `.catch(() => []);
        for (const s of staff as any[]) {
          if (s.user_id) recipientUserIds.add(s.user_id);
        }

        const guestDisplay = tenantName || session.user.name || 'ผู้เช่า';
        const notifTitle = '🛎️ มีรายการจองห้องพักใหม่!';
        const notifMsg = `คุณ ${guestDisplay} ได้ทำการจองห้อง ${room_number} (${dorm_name}) มัดจำ ฿${Number(depositAmount || 0).toLocaleString()} กรุณาตรวจสอบสลิปและอนุมัติการจอง`;

        for (const targetUserId of Array.from(recipientUserIds)) {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${targetUserId},
              ${notifTitle},
              ${notifMsg},
              'booking',
              0,
              '/owner/bookings',
              NOW()
            )
          `.catch((err: any) => console.error('Insert notification error for user', targetUserId, err));
        }
      }
    } catch (notifError) {
      console.warn('[API Contracts] Notification sending failed non-fatally:', notifError);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Contract and payment slip submitted successfully',
      contractId: contractId
    });

  } catch (error: any) {
    console.error('[API Contracts POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
