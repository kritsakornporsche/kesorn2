import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId');
    const userEmail = session?.user?.email || searchParams.get('email');

    const sql = getDb();

    let targetDormId = dormIdParam ? parseInt(dormIdParam) : null;

    if (!targetDormId && userEmail) {
      const userRes = await sql`SELECT id FROM users WHERE email = ${userEmail} LIMIT 1`;
      if (userRes.length > 0) {
        const ownerId = userRes[0].id;
        const dormRes = await sql`SELECT id FROM dormitory_registry WHERE owner_id = ${ownerId} AND status = 'Active' LIMIT 1`;
        if (dormRes.length > 0) {
          targetDormId = dormRes[0].id;
        }
      }
    }

    if (!targetDormId) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Fetch all contracts for this dormitory including signed contract_file_url and renewal fields
    const contracts = await sql`
      SELECT 
        c.id, 
        c.tenant_id,
        c.room_id,
        c.start_date, 
        c.end_date, 
        c.deposit_amount, 
        c.status, 
        c.created_at,
        c.slip_url,
        c.contract_file_url,
        c.renewal_requested,
        c.renewal_note,
        c.parent_contract_id,
        COALESCE(t.name, u.name, 'ไม่ระบุชื่อ') as tenant_name,
        COALESCE(t.email, u.email, '') as tenant_email,
        COALESCE(t.phone, u.phone, '') as tenant_phone,
        r.room_number,
        r.room_type,
        r.price as monthly_rent
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      JOIN rooms r ON c.room_id = r.id
      WHERE r.dorm_id = ${targetDormId}
      ORDER BY c.id DESC
    `;

    return NextResponse.json({ success: true, data: contracts });
  } catch (err: any) {
    console.error('[Contracts API GET] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { 
      dormId,
      tenant_name, 
      tenant_email, 
      tenant_phone, 
      room_id, 
      start_date, 
      end_date, 
      deposit_amount, 
      contract_file_url 
    } = body;

    const sql = getDb();
    let tenantName = tenant_name;
    let tenantEmail = tenant_email;
    let tenantPhone = tenant_phone;

    if (body.tenant_id && (!tenantName || !tenantEmail)) {
      const existingTenant = await sql`SELECT name, email, phone FROM tenants WHERE id = ${body.tenant_id} LIMIT 1`;
      if (existingTenant.length > 0) {
        tenantName = tenantName || existingTenant[0].name;
        tenantEmail = tenantEmail || existingTenant[0].email;
        tenantPhone = tenantPhone || existingTenant[0].phone;
      }
    }

    if (!room_id || !start_date || !end_date || !tenantName || !tenantEmail) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (ชื่อผู้เช่า, อีเมล, ห้องพัก, วันเริ่มสัญญา, วันสิ้นสุดสัญญา)' 
      }, { status: 400 });
    }
    const bcrypt = require('bcryptjs');

    // 1. Check or create User account in `users` table
    let users = await sql`SELECT id, primary_role FROM users WHERE email = ${tenantEmail.trim()} LIMIT 1`;
    let userId: number;

    if (users.length === 0) {
      const defaultPasswordHash = await bcrypt.hash('smartdom', 12);
      const userInsert = await sql`
        INSERT INTO users (name, email, password, phone, primary_role)
        VALUES (${tenantName.trim()}, ${tenantEmail.trim()}, ${defaultPasswordHash}, ${tenantPhone?.trim() || null}, 'tenant')
      `;
      userId = (userInsert as any).insertId;
    } else {
      userId = users[0].id;
      // Upgrade role to tenant if current role is guest/user
      await sql`
        UPDATE users 
        SET primary_role = 'tenant', 
            name = COALESCE(${tenantName.trim()}, name),
            phone = COALESCE(${tenantPhone?.trim() || null}, phone)
        WHERE id = ${userId}
      `;
    }

    // 2. Check or create Tenant record in `tenants` table
    let tenants = await sql`SELECT id FROM tenants WHERE email = ${tenantEmail.trim()} OR user_id = ${userId} LIMIT 1`;
    let tenantId: number;

    if (tenants.length === 0) {
      const tenantInsert = await sql`
        INSERT INTO tenants (name, email, phone, room_id, user_id)
        VALUES (${tenantName.trim()}, ${tenantEmail.trim()}, ${tenantPhone?.trim() || null}, ${room_id}, ${userId})
      `;
      tenantId = (tenantInsert as any).insertId;
    } else {
      tenantId = tenants[0].id;
      await sql`
        UPDATE tenants 
        SET room_id = ${room_id}, 
            name = ${tenantName.trim()}, 
            phone = ${tenantPhone?.trim() || null},
            user_id = ${userId}
        WHERE id = ${tenantId}
      `;
    }

    // 3. Assign role in `user_dorm_roles` table
    const targetDormId = dormId || 1;
    const existingRoles = await sql`
      SELECT id FROM user_dorm_roles WHERE user_id = ${userId} AND dorm_id = ${targetDormId} LIMIT 1
    `;
    if (existingRoles.length === 0) {
      await sql`
        INSERT INTO user_dorm_roles (user_id, dorm_id, role)
        VALUES (${userId}, ${targetDormId}, 'tenant')
      `;
    }

    // 4. Save Contract with contract_file_url and status 'Active'
    const contractInsert = await sql`
      INSERT INTO contracts (
        tenant_id, room_id, start_date, end_date, deposit_amount, status, contract_file_url
      )
      VALUES (
        ${tenantId}, ${room_id}, ${start_date}, ${end_date}, ${deposit_amount || 0}, 'Active', ${contract_file_url || null}
      )
    `;
    const contractId = (contractInsert as any).insertId;

    // 5. Update room status to 'Occupied'
    await sql`
      UPDATE rooms 
      SET status = 'Occupied' 
      WHERE id = ${room_id}
    `;

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาเช่าและปรับสถานะผู้เช่าสำเร็จเรียบร้อยแล้ว',
      contractId,
      tenantId,
      userId
    });
  } catch (err: any) {
    console.error('[Contracts API POST] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
