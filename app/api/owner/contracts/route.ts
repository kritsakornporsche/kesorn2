import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createContract, temporaryPassword, contractMessage } from '@/lib/contracts';
import { issueMoveInBill, missingMessage, recordSignedPaper } from '@/lib/moveIn';
import { formDeposit, withPaperLink } from '@/lib/contract-files';
import { formatBaht, formatThaiDate } from '@/lib/format';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId');
    const userEmail = session.user.email;

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
        c.paper_signed_date,
        COALESCE(c.id_card_number, t.id_card_number, '') as id_card_number,
        COALESCE(c.tenant_address, t.address, '') as tenant_address,
        COALESCE(c.id_card_image, t.id_card_image, '') as id_card_image,
        COALESCE(t.name, u.name, 'ไม่ระบุชื่อ') as tenant_name,
        COALESCE(t.email, u.email, '') as tenant_email,
        COALESCE(t.phone, u.phone, '') as tenant_phone,
        r.room_number,
        r.room_type,
        r.price as monthly_rent,
        r.deposit_amount as room_deposit_amount
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      JOIN rooms r ON c.room_id = r.id
      WHERE r.dorm_id = ${targetDormId}
      ORDER BY c.id DESC
    `;

    return NextResponse.json({ success: true, data: contracts.map((c: any) => ({ ...withPaperLink(c), form_deposit: formDeposit(c) })) });
  } catch (err: any) {
    console.error('[Contracts API GET] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
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
      contract_file_url,
      id_card_number,
      tenant_address,
      id_card_image
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

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(tenantEmail.trim())) {
      return NextResponse.json({ 
        success: false, 
        message: 'รูปแบบอีเมลไม่ถูกต้อง กรุณาระบุอีเมลที่ใช้งานได้จริงของผู้เช่า' 
      }, { status: 400 });
    }

    // The deposit is required: a number above zero (the form fills in the room's deposit from the server)
    const depositNum = Number(deposit_amount);
    if (deposit_amount === undefined || deposit_amount === null || deposit_amount === '' || !Number.isFinite(depositNum) || depositNum <= 0) {
      return NextResponse.json({ success: false, message: 'กรุณาระบุเงินประกันเป็นตัวเลขมากกว่า 0' }, { status: 400 });
    }

    // Another deposit amount is allowed only for a tenant who lived here before the system, by the owner, with a reason
    const outsideSystem = body.deposit_outside_system === true || body.deposit_outside_system === 'true';
    if (outsideSystem && guard.user.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'กำหนดเงินประกันเอง (ผู้เช่าเดิม) ทำได้เฉพาะเจ้าของหอ' }, { status: 403 });
    }

    // Account + Active contract through the single contract service (room becomes Occupied).
    // A new account gets a random temporary password, returned once so the owner can pass it on.
    const tempPassword = temporaryPassword();
    const created = await createContract({
      account: {
        email: tenantEmail.trim(),
        name: tenantName.trim(),
        phone: tenantPhone?.trim() || null,
        idCardNumber: id_card_number?.trim() || null,
        idCardImage: id_card_image || null,
        address: tenant_address?.trim() || null,
        role: 'tenant',
        newPassword: tempPassword,
      },
      roomId: Number(room_id),
      startDate: start_date,
      endDate: end_date,
      depositAmount: depositNum,
      status: 'Active',
      contractFileUrl: contract_file_url || null,
      idCardNumber: id_card_number?.trim() || null,
      idCardImage: id_card_image || null,
      tenantAddress: tenant_address?.trim() || null,
      occupants: Number(body.occupants) || 1,
      depositOutsideSystem: outsideSystem ? { reason: String(body.deposit_note || '') } : null,
    });
    if (!created.ok) {
      return NextResponse.json({ success: false, message: contractMessage(created) }, { status: 400 });
    }
    const { contractId, tenantId, userId, createdUser } = created;

    // 6. Send welcome notification to tenant
    try {
      await sql`
        INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
        VALUES (
          ${userId},
          'สัญญาเช่าของคุณพร้อมใช้งานแล้ว',
          ${'ยินดีต้อนรับสู่หอพัก สัญญาเช่าห้องพักของคุณได้รับการบันทึกเรียบร้อยแล้ว'},
          'contract_created',
          0,
          '/tenant/contract',
          NOW()
        )
      `;
    } catch (ne) {
      console.warn('Welcome contract notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาเช่าและปรับสถานะผู้เช่าสำเร็จเรียบร้อยแล้ว',
      contractId,
      tenantId,
      userId,
      // Only for an account created now; never stored or logged
      ...(createdUser ? { tempPassword } : {}),
    });
  } catch (err: any) {
    console.error('[Contracts API POST] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PATCH { contractId, file, signedDate } — record the signed paper contract (stored outside public/) and the date it
// was signed. The contract takes effect once its move-in bill is paid too (lib/moveIn.ts).
export async function PATCH(req: Request) {
  try {
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const body = await req.json();
    const contractId = Number(body.contractId);
    if (!contractId) {
      return NextResponse.json({ success: false, message: 'ข้อมูลไม่ครบถ้วน (ต้องการ contractId)' }, { status: 400 });
    }

    const result = await recordSignedPaper(contractId, { file: body.file, signedDate: body.signedDate, by: guard.user.id }, new Date());
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.reason === 'not_found' ? 404 : 400 });
    }

    if (result.tenantUserId) {
      const sql = getDb();
      try {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${result.tenantUserId},
            ${result.activated ? 'สัญญาเช่ามีผลแล้ว' : 'บันทึกสัญญาเช่าฉบับลงนามแล้ว'},
            ${result.activated ? 'หอพักบันทึกสัญญาที่เซ็นแล้ว และบิลเข้าอยู่ชำระครบ สัญญาของคุณมีผลแล้ว' : 'หอพักบันทึกสัญญาเช่าฉบับลงนามเก็บไว้ในระบบแล้ว'},
            'contract_signed', 0, ${result.activated ? '/tenant' : '/guest'}, ${new Date()}
          )
        `;
      } catch (ne) {
        console.warn('Notify signed contract warn:', ne);
      }
    }

    return NextResponse.json({
      success: true,
      activated: result.activated,
      missing: result.missing,
      message: result.activated
        ? 'บันทึกสัญญาที่เซ็นแล้ว — สัญญามีผลแล้ว'
        : result.missing.length > 0 ? `บันทึกสัญญาที่เซ็นแล้ว — ${missingMessage(result.missing)}` : 'บันทึกสัญญาที่เซ็นแล้ว',
    });
  } catch (err: any) {
    console.error('[Contracts API PATCH] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PUT { contract_id, initial_meter_reading } — issue the move-in bill (amounts from the room on the server, never from
// the page) with the starting meter. Rules live in lib/moveIn.ts.
export async function PUT(req: Request) {
  try {
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const contractId = Number(body.contract_id);
    if (!contractId) {
      return NextResponse.json({ success: false, message: 'Missing contract_id' }, { status: 400 });
    }

    const result = await issueMoveInBill(contractId, { startMeter: body.initial_meter_reading, by: guard.user.id }, new Date());
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.reason === 'not_found' ? 404 : 400 });
    }

    if (result.tenantUserId) {
      const sql = getDb();
      try {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${result.tenantUserId},
            'ออกบิลค่าแรกเข้าแล้ว',
            ${`กรุณาชำระบิลค่าแรกเข้า ฿${formatBaht(result.dueAtMoveIn)} ภายในวันเริ่มสัญญา ${formatThaiDate(result.dueDate)} — หากไม่ชำระ สัญญาจะถูกยกเลิกและค่าจองไม่คืน`},
            'contract_ready', 0, '/guest', ${new Date()}
          )
        `;
      } catch (ne) {
        console.warn('Notify guest warn:', ne);
      }
    }

    return NextResponse.json({
      success: true,
      message: result.meterRecorded
        ? `ออกบิลค่าแรกเข้า ฿${formatBaht(result.dueAtMoveIn)} และบันทึกมิเตอร์เริ่มต้นแล้ว`
        : `ออกบิลค่าแรกเข้า ฿${formatBaht(result.dueAtMoveIn)} แล้ว · มิเตอร์เริ่มต้นเก็บในสัญญาเท่านั้น (ห้องนี้มีเลขมิเตอร์ของเดือนนี้อยู่แล้ว จึงไม่เขียนทับ — ตรวจเลขในหน้ามิเตอร์)`,
      billId: result.billId,
      amount: result.dueAtMoveIn,
      dueDate: result.dueDate,
    });
  } catch (err: any) {
    console.error('[Contracts API PUT] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
