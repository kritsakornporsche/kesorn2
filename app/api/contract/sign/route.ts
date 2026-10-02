import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: Request) {
  const session = await auth();
  const sql = getDb();

  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized: กรุณาเข้าสู่ระบบก่อนลงนามสัญญา' }, { status: 401 });
  }

  try {
    const data = await req.json();
    const { roomNumber, monthlyRent, depositAmount, startDate, endDate, signatureData } = data;

    // 1. Get room details from roomNumber
    const rooms = await sql`
      SELECT id, status 
      FROM rooms 
      WHERE room_number = ${roomNumber} 
      LIMIT 1
    `;
    
    if (rooms.length === 0) {
      return NextResponse.json({ error: 'Room not found' }, { status: 404 });
    }
    const roomId = rooms[0].id;

    // 2. Resolve tenant identity
    let tenantId;
    let tenantUserId: number | null = null;
    const userEmail = session.user.email;
    const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
    if (uRes.length > 0) tenantUserId = uRes[0].id;

    const tenants = await sql`SELECT id, user_id FROM tenants WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
    
    if (tenants.length > 0) {
      tenantId = tenants[0].id;
      if (!tenants[0].user_id && tenantUserId) {
        await sql`UPDATE tenants SET user_id = ${tenantUserId} WHERE id = ${tenantId}`;
      }
    } else {
      const insertResult: any = await sql`
        INSERT INTO tenants (name, email, user_id, status)
        VALUES (${session.user.name || 'User'}, ${userEmail}, ${tenantUserId}, 'Active')
      `;
      tenantId = insertResult.insertId || null;
      if (!tenantId) {
        const fetchAgain = await sql`SELECT id FROM tenants WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
        if (fetchAgain.length > 0) tenantId = fetchAgain[0].id;
      }
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context could not be resolved' }, { status: 400 });
    }

    // 3. Persist contract with 'PendingOwnerSignature' status.
    const contractInsert: any = await sql`
      INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, signature_data, status)
      VALUES (${tenantId}, ${roomId}, ${startDate}, ${endDate}, ${depositAmount}, ${signatureData || 'CONFIRMED_E_CONTRACT'}, 'PendingOwnerSignature')
    `;
    const contractId = contractInsert?.insertId;

    // 4. Notify owner about new signed contract awaiting approval
    try {
      const dormOwners = await sql`
        SELECT u.id FROM users u
        JOIN dormitory_registry dr ON dr.owner_id = u.id OR LOWER(dr.owner_email) = LOWER(u.email)
        WHERE dr.id = 1
        LIMIT 1
      `;
      if (dormOwners.length > 0) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${dormOwners[0].id},
            'มีสัญญาเช่าใหม่รอการอนุมัติ',
            ${'ผู้เช่าได้ลงนามสัญญาเช่าห้อง ' + roomNumber + ' เรียบร้อยแล้ว กรุณาตรวจสอบและอนุมัติสัญญา'},
            'contract_pending_owner',
            0,
            '/owner/contracts',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Contract sign owner notify warn:', ne);
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Contract signed. pending owner approval.',
      contractId
    });
  } catch (dbError: any) {
    console.error('[DB Transaction Error]', dbError);
    return NextResponse.json({ error: 'Failed to complete signing process', message: dbError.message }, { status: 500 });
  }
}
