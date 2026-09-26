import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function POST(req: Request) {
  const session = await auth();
  const sql = getDb();

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
    if (session?.user) {
      const userEmail = session.user.email;
      const tenants = await sql`SELECT id FROM tenants WHERE email = ${userEmail} LIMIT 1`;
      
      if (tenants.length > 0) {
        tenantId = tenants[0].id;
      } else {
        const insertResult: any = await sql`
          INSERT INTO tenants (name, email, status)
          VALUES (${session.user.name || 'User'}, ${userEmail}, 'Active')
        `;
        tenantId = insertResult.insertId || null;
        if (!tenantId) {
          const fetchAgain = await sql`SELECT id FROM tenants WHERE email = ${userEmail} LIMIT 1`;
          if (fetchAgain.length > 0) tenantId = fetchAgain[0].id;
        }
      }
    } else {
      const fallbackTenants = await sql`SELECT id FROM tenants LIMIT 1`;
      tenantId = fallbackTenants.length > 0 ? fallbackTenants[0].id : null;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'Tenant context could not be resolved' }, { status: 400 });
    }

    // 3. Persist contract with 'PendingOwnerSignature' status.
    await sql`
      INSERT INTO contracts (tenant_id, room_id, start_date, end_date, deposit_amount, signature_data, status)
      VALUES (${tenantId}, ${roomId}, ${startDate}, ${endDate}, ${depositAmount}, ${signatureData || 'CONFIRMED_E_CONTRACT'}, 'PendingOwnerSignature')
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'Contract signed. pending owner approval.' 
    });
  } catch (dbError: any) {
    console.error('[DB Transaction Error]', dbError);
    return NextResponse.json({ error: 'Failed to complete signing process', message: dbError.message }, { status: 500 });
  }
}
