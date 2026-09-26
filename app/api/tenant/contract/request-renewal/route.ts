import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const body = await req.json();
    const { contract_id, renewal_note } = body;

    if (!contract_id) {
      return NextResponse.json({ success: false, message: 'Missing contract_id' }, { status: 400 });
    }

    const sql = getDb();

    // Verify contract exists and belongs to tenant
    const contracts = await sql`
      SELECT c.* FROM contracts c
      JOIN tenants t ON c.tenant_id = t.id
      JOIN users u ON t.user_id = u.id OR t.email = u.email
      WHERE c.id = ${contract_id}
      LIMIT 1
    `;

    if (contracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบสัญญาเช่าที่ระบุ' }, { status: 404 });
    }

    // Flag contract as renewal_requested
    await sql`
      UPDATE contracts 
      SET renewal_requested = 1, renewal_note = ${renewal_note || 'ขอต่อสัญญาเช่า'} 
      WHERE id = ${contract_id}
    `;

    // Notify owner
    try {
      const dormId = contracts[0].dorm_id || 1;
      const ownerRes = await sql`
        SELECT u.id FROM users u
        JOIN dormitory_registry dr ON dr.owner_id = u.id OR dr.owner_email = u.email
        WHERE dr.id = ${dormId}
        LIMIT 1
      `;
      if (ownerRes.length > 0) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${ownerRes[0].id},
            'มีคำขอต่อสัญญาเช่าใหม่',
            ${'ผู้เช่าได้ส่งคำขอต่อสัญญาเช่า (สัญญา #' + contract_id + '): ' + (renewal_note || 'ขอต่อสัญญาเช่า')},
            'contract_renewal',
            0,
            '/owner/contracts',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Renewal notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'ส่งคำขอต่อสัญญาเช่าไปยังเจ้าของหอพักเรียบร้อยแล้ว'
    });
  } catch (err: any) {
    console.error('[Tenant Request Renewal Error]:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
