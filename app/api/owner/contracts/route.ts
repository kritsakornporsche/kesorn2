import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { createContract, temporaryPassword, contractMessage } from '@/lib/contracts';

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
        COALESCE(c.id_card_number, t.id_card_number, '') as id_card_number,
        COALESCE(c.tenant_address, t.address, '') as tenant_address,
        COALESCE(c.id_card_image, t.id_card_image, '') as id_card_image,
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

export async function PATCH(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const body = await req.json();
    const { contractId, contract_file_url } = body;

    if (!contractId || !contract_file_url) {
      return NextResponse.json({ success: false, message: 'ข้อมูลไม่ครบถ้วน (ต้องการ contractId และ contract_file_url)' }, { status: 400 });
    }

    const sql = getDb();
    await sql`
      UPDATE contracts 
      SET contract_file_url = ${contract_file_url} 
      WHERE id = ${contractId}
    `;

    // Also notify tenant that the physically signed contract has been recorded
    try {
      const contractRows = await sql`
        SELECT c.tenant_id, t.user_id 
        FROM contracts c 
        JOIN tenants t ON c.tenant_id = t.id 
        WHERE c.id = ${contractId} 
        LIMIT 1
      `;
      if (contractRows.length > 0 && contractRows[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${contractRows[0].user_id},
            'บันทึกรูปสัญญาเช่าฉบับลงนามจริงแล้ว',
            'เจ้าของหอพักได้อัปโหลดรูปภาพสัญญาเช่าฉบับลงนามจริงเก็บไว้ในระบบเรียบร้อยแล้ว',
            'contract_signed',
            0,
            '/tenant/contract',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Notify signed contract warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกรูปภาพสัญญาเช่าฉบับลงนามจริงเข้าระบบเรียบร้อยแล้ว'
    });
  } catch (err: any) {
    console.error('[Contracts API PATCH] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { contract_id, contract_file_url, status, create_first_bill, monthly_rent, deposit_extra } = body;

    if (!contract_id) {
      return NextResponse.json({ success: false, message: 'Missing contract_id' }, { status: 400 });
    }

    const sql = getDb();

    // 1. Check existing contract
    const contracts = await sql`
      SELECT c.*, t.id as tenant_id, t.user_id, t.email as tenant_email, r.room_number, r.dorm_id
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN rooms r ON c.room_id = r.id
      WHERE c.id = ${contract_id}
      LIMIT 1
    `;

    if (contracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    }

    const contract = contracts[0];
    let savedFileUrl = contract_file_url;

    // If Base64 string was sent, save it to disk in public/uploads/contracts
    if (contract_file_url && contract_file_url.startsWith('data:')) {
      try {
        const fs = require('fs');
        const path = require('path');
        const match = contract_file_url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          const mimeType = match[1];
          const base64Data = match[2];
          const ext = mimeType.includes('pdf') ? 'pdf' : mimeType.includes('png') ? 'png' : 'jpg';
          const filename = `contract_${contract_id}_${Date.now()}.${ext}`;
          const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'contracts');
          if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
          }
          const filePath = path.join(uploadDir, filename);
          fs.writeFileSync(filePath, Buffer.from(base64Data, 'base64'));
          savedFileUrl = `/uploads/contracts/${filename}`;
        }
      } catch (err) {
        console.error('[Save Contract File Error]', err);
      }
    }

    // Only the move to "waiting for the first bill" is allowed here; activating a contract goes through signContract
    if (status && status !== 'PendingFirstBill') {
      return NextResponse.json({ success: false, message: 'เปลี่ยนสถานะสัญญาผ่านช่องทางนี้ได้เฉพาะ PendingFirstBill' }, { status: 400 });
    }
    const nextStatus = 'PendingFirstBill';

    // 2. Update Contract status and file url
    await sql`
      UPDATE contracts 
      SET 
        contract_file_url = COALESCE(${savedFileUrl || null}, contract_file_url),
        status = ${nextStatus}
      WHERE id = ${contract_id}
    `;

    // 3. Create First Bill if requested
    if (create_first_bill && contract.tenant_id) {
      const rentAmount = Number(monthly_rent || 3400);
      const extraDeposit = Number(deposit_extra || 2000);
      const totalAmount = rentAmount + extraDeposit;
      const now = new Date();
      const cycleStr = `${now.getMonth() + 1}/${now.getFullYear()}`;
      
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      const dueDateStr = dueDate.toISOString().split('T')[0];

      // Record initial electric meter reading if provided (anti-cheat base)
      const { initial_meter_reading } = body;
      if (initial_meter_reading !== undefined && initial_meter_reading !== null && contract.room_id) {
        const initVal = parseFloat(initial_meter_reading) || 0;
        const currentMonthCycle = new Date().toISOString().substring(0, 7);
        try {
          // Check if meter reading exists for this cycle or insert new base reading
          const existingMeter = await sql`
            SELECT id FROM meter_readings 
            WHERE room_id = ${contract.room_id} AND type = 'Electricity' AND billing_cycle = ${currentMonthCycle}
            LIMIT 1
          `;
          if (existingMeter.length > 0) {
            await sql`
              UPDATE meter_readings
              SET previous_reading = ${initVal}, current_reading = ${initVal}, units_used = 0
              WHERE id = ${existingMeter[0].id}
            `;
          } else {
            await sql`
              INSERT INTO meter_readings (
                dorm_id, room_id, type, previous_reading, current_reading, units_used, billing_cycle
              ) VALUES (
                ${contract.dorm_id || 1}, ${contract.room_id}, 'Electricity', ${initVal}, ${initVal}, 0, ${currentMonthCycle}
              )
            `;
          }
        } catch (mErr) {
          console.error('[Record Initial Meter Error]', mErr);
        }
      }

      // Check if first bill already exists
      const existingBills = await sql`
        SELECT id FROM bills 
        WHERE tenant_id = ${contract.tenant_id} AND (is_first_bill = 1 OR bill_type = 'booking')
          AND LOWER(status) NOT IN ('paid', 'partial', 'cancelled')
        LIMIT 1
      `;

      if (existingBills.length === 0) {
        await sql`
          INSERT INTO bills (
            tenant_id,
            dorm_id,
            room_number,
            title,
            amount,
            room_amount,
            billing_cycle,
            due_date,
            status,
            is_first_bill,
            bill_type,
            created_at
          ) VALUES (
            ${contract.tenant_id},
            ${contract.dorm_id || 1},
            ${contract.room_number || '-'},
            ${'บิลค่าแรกเข้า (ค่าห้องเดือนแรก ฿' + rentAmount.toLocaleString() + ' + เงินประกันเพิ่ม ฿' + extraDeposit.toLocaleString() + ')'},
            ${totalAmount},
            ${rentAmount},
            ${cycleStr},
            ${dueDateStr},
            'Unpaid',
            1,
            'booking',
            NOW()
          )
        `;
      } else {
        // Update existing bill with new amount and Unpaid status
        await sql`
          UPDATE bills 
          SET 
            amount = ${totalAmount},
            room_amount = ${rentAmount},
            title = ${'บิลค่าแรกเข้า (ค่าห้องเดือนแรก ฿' + rentAmount.toLocaleString() + ' + เงินประกันเพิ่ม ฿' + extraDeposit.toLocaleString() + ')'},
            due_date = ${dueDateStr},
            status = 'Unpaid'
          WHERE id = ${existingBills[0].id}
        `;
      }
    }

    // 4. Send notification to guest/tenant
    if (contract.user_id) {
      try {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${contract.user_id},
            'เจ้าของหอพักอัปโหลดสัญญาเช่าและออกบิลแรกเข้าแล้ว',
            'กรุณาตรวจสอบเอกสารสัญญาเช่าและชำระบิลค่าแรกเข้าเพื่อเข้าสู่ขั้นตอนการเข้าพัก',
            'contract_ready',
            0,
            '/guest',
            NOW()
          )
        `;
      } catch (ne) {
        console.warn('Notify guest warn:', ne);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกสัญญาและส่งบิลค่าแรกเข้าไปยัง Guest เรียบร้อยแล้ว',
      fileUrl: savedFileUrl
    });
  } catch (err: any) {
    console.error('[Contracts API PUT] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}


