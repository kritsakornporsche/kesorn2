import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifySlipWithSlipOK } from '@/lib/slipok';
import bcrypt from 'bcryptjs';

/**
 * POST /api/owner/tenants/walk-in
 * Endpoint for owners/keepers to create a walk-in tenant booking:
 * 1. Takes tenant OCR info (name, id_card_number, address, email, phone, parent_phone, room_id, start_date, end_date)
 * 2. Creates/updates user account with:
 *    - name = full name from ID card
 *    - role = 'guest', primary_role = 'guest'
 *    - email = entered email
 *    - password = phone number hash (e.g. 0636040550)
 * 3. Creates tenant record with status 'Pending'
 * 4. Verifies ฿1,000 PromptPay slip via SlipOK (anti-replay + validation)
 * 5. Updates room status to 'Reserved'
 * 6. Creates booking bill (status = 'Paid') & logs to accounting_transactions
 * 7. Creates contract with status 'PendingOwnerSignature'
 */
export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;

    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin') {
      return NextResponse.json({ success: false, message: 'Forbidden: เฉพาะเจ้าของหอพักและผู้ดูแล' }, { status: 403 });
    }

    const body = await req.json();
    const {
      roomId,
      startDate,
      endDate,
      depositAmount = 1000,
      monthlyRent,
      tenantName,
      email,
      phone,
      parentPhone,
      idCardNumber,
      tenantAddress,
      slipUrl
    } = body;

    // Validation
    if (!roomId || !tenantName || !email || !phone || !slipUrl) {
      return NextResponse.json({
        success: false,
        message: 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (ห้องพัก, ชื่อผู้เช่า, อีเมล, เบอร์โทรศัพท์, และสลิปการโอนเงิน)'
      }, { status: 400 });
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim().replace(/[\s-]/g, '');
    const cleanName = tenantName.trim();
    const cleanParentPhone = parentPhone ? parentPhone.trim().replace(/[\s-]/g, '') : null;
    const cleanIdCard = idCardNumber ? idCardNumber.trim().replace(/[\s-]/g, '') : null;

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      return NextResponse.json({
        success: false,
        message: 'รูปแบบอีเมลไม่ถูกต้อง'
      }, { status: 400 });
    }

    const sql = getDb();

    // 1. Verify Room availability
    const roomCheck = await sql`
      SELECT id, room_number, price, status, dorm_id 
      FROM rooms 
      WHERE id = ${parseInt(roomId)}
      LIMIT 1
    `;
    if (roomCheck.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลห้องพักที่เลือก' }, { status: 404 });
    }

    const room = roomCheck[0];
    const roomStatus = (room.status || '').toLowerCase();
    if (roomStatus === 'occupied' || roomStatus === 'reserved' || roomStatus === 'ไม่ว่าง') {
      return NextResponse.json({
        success: false,
        message: `ห้องพัก ${room.room_number} ไม่ว่างในขณะนี้ (สถานะ: ${room.status})`
      }, { status: 400 });
    }

    const targetDormId = room.dorm_id || 1;

    // 2. SlipOK Verification (Verify ฿1,000 booking slip)
    let isAutoApproved = false;
    let slipVerified = 0;
    let slipRaw = null;
    let slipokRef: string | null = null;

    const dormProfiles = await sql`
      SELECT name, promptpay_number, promptpay_name 
      FROM dormitory_profile 
      LIMIT 1
    `;
    const dormProfile = dormProfiles.length > 0 ? dormProfiles[0] : { name: 'หอพักเกษร 2', promptpay_number: '0636040550' };

    const verifyResult = await verifySlipWithSlipOK(
      slipUrl,
      Number(depositAmount || 1000),
      {
        name: dormProfile.promptpay_name || dormProfile.name || 'หอพักเกษร 2',
        promptpay: dormProfile.promptpay_number || '0636040550',
        dormName: dormProfile.name || 'หอพักเกษร 2',
        isBooking: true,
        checkPromptPayOnly: true
      }
    );

    if (!verifyResult.success) {
      return NextResponse.json({
        success: false,
        message: `สลิปไม่ผ่านการตรวจสอบ: ${verifyResult.message || 'หมายเลขพร้อมเพย์ผู้รับหรือยอดเงินในสลิปไม่ถูกต้อง'}`
      }, { status: 400 });
    }

    slipokRef = verifyResult.transRef || null;

    // Anti-Replay Guard: Reject if this slip transaction reference has ever been used before
    if (slipokRef && !slipokRef.startsWith('MOCK-')) {
      const usedSlipCheck = await sql`
        SELECT id, room_number, created_at FROM bills 
        WHERE slipok_trans_ref = ${slipokRef}
        LIMIT 1
      `;
      if (usedSlipCheck.length > 0) {
        return NextResponse.json({
          success: false,
          message: `สลิปนี้เคยถูกส่งเข้ามาในระบบแล้ว (รหัสอ้างอิง: ${slipokRef}) ไม่สามารถนำสลิปเดิมมาใช้ใหม่ได้`
        }, { status: 400 });
      }
    }

    isAutoApproved = true;
    slipVerified = 1;
    slipRaw = JSON.stringify(verifyResult.rawData || {});

    // Save slip image to disk
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = saveBase64Image(slipUrl, 'slips', `walkin_${Date.now()}_room_${room.room_number}`);

    // 3. User Account Creation / Update (Username = Full Name from ID card, Password = Phone)
    const passwordHash = await bcrypt.hash(cleanPhone, 12);
    let userId: number;

    const existingUsers = await sql`
      SELECT id, role FROM users 
      WHERE LOWER(email) = ${cleanEmail}
      LIMIT 1
    `;

    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      // Update info and set password to phone
      await sql`
        UPDATE users 
        SET name = ${cleanName},
            phone = ${cleanPhone},
            password = ${passwordHash},
            role = 'guest',
            primary_role = 'guest'
        WHERE id = ${userId}
      `;
    } else {
      const userInsert = await sql`
        INSERT INTO users (name, email, password, phone, role, primary_role)
        VALUES (${cleanName}, ${cleanEmail}, ${passwordHash}, ${cleanPhone}, 'guest', 'guest')
      `;
      userId = (userInsert as any).insertId;
    }

    // Assign dorm role
    try {
      const existingRole = await sql`
        SELECT id FROM user_dorm_roles 
        WHERE user_id = ${userId} AND dorm_id = ${targetDormId} 
        LIMIT 1
      `;
      if (existingRole.length === 0) {
        await sql`INSERT INTO user_dorm_roles (user_id, dorm_id, role) VALUES (${userId}, ${targetDormId}, 'guest')`;
      }
    } catch (e) {}

    // 4. Tenant record creation / update
    let tenantId: number;
    const existingTenants = await sql`
      SELECT id FROM tenants 
      WHERE user_id = ${userId} OR LOWER(email) = ${cleanEmail}
      LIMIT 1
    `;

    const formattedStartDate = startDate || new Date().toISOString().slice(0, 10);
    const formattedEndDate = endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);

    if (existingTenants.length > 0) {
      tenantId = existingTenants[0].id;
      await sql`
        UPDATE tenants 
        SET name = ${cleanName},
            phone = ${cleanPhone},
            room_id = ${room.id},
            user_id = ${userId},
            id_card_number = ${cleanIdCard},
            address = ${tenantAddress || null},
            status = 'Pending',
            move_in_date = ${formattedStartDate},
            dorm_id = ${targetDormId}
        WHERE id = ${tenantId}
      `;
    } else {
      const tenantInsert = await sql`
        INSERT INTO tenants (
          name, email, phone, room_id, user_id, id_card_number, address, status, move_in_date, dorm_id
        ) VALUES (
          ${cleanName}, ${cleanEmail}, ${cleanPhone}, ${room.id}, ${userId}, ${cleanIdCard}, ${tenantAddress || null}, 'Pending', ${formattedStartDate}, ${targetDormId}
        )
      `;
      tenantId = (tenantInsert as any).insertId;
    }

    // 5. Contract Record Creation (Status = PendingOwnerSignature)
    const contractInsert = await sql`
      INSERT INTO contracts (
        tenant_id, 
        room_id, 
        start_date, 
        end_date, 
        deposit_amount, 
        signature_data, 
        owner_signature_data,
        signed_at,
        slip_url,
        id_card_number,
        tenant_address,
        id_card_image,
        parent_phone,
        status
      ) VALUES (
        ${tenantId}, 
        ${room.id}, 
        ${formattedStartDate}, 
        ${formattedEndDate}, 
        ${depositAmount || 1000}, 
        'WALK_IN_VERIFIED', 
        NULL,
        ${new Date()},
        ${storedSlipUrl || null},
        ${cleanIdCard},
        ${tenantAddress || null},
        NULL,
        ${cleanParentPhone},
        'PendingOwnerSignature'
      )
    `;
    const contractId = (contractInsert as any).insertId;

    // 6. Create Booking Bill (Status = Paid)
    const bookingTitle = `ค่าจองห้องพัก Walk-in (ห้อง ${room.room_number})`;
    const billInsertRes = await sql`
      INSERT INTO bills (
        tenant_id,
        dorm_id,
        room_number,
        title,
        amount,
        room_amount,
        water_amount,
        electric_amount,
        water_units,
        electric_units,
        billing_cycle,
        due_date,
        status,
        slip_url,
        bill_type,
        slip_verified,
        slip_verified_at,
        slipok_trans_ref,
        slip_data
      ) VALUES (
        ${tenantId},
        ${targetDormId},
        ${room.room_number},
        ${bookingTitle},
        ${depositAmount || 1000},
        ${depositAmount || 1000},
        0,
        0,
        0,
        0,
        'ค่าจองห้องพักเพื่อยืนยันสิทธิ์',
        ${formattedStartDate},
        'Paid',
        ${storedSlipUrl || null},
        'booking',
        ${slipVerified},
        ${new Date()},
        ${slipokRef},
        ${slipRaw}
      )
    `;
    const billId = (billInsertRes as any)?.insertId;

    // 7. Update Room status to 'Reserved'
    await sql`UPDATE rooms SET status = 'Reserved' WHERE id = ${room.id}`;

    // 8. Log Accounting Transaction
    try {
      await sql`
        INSERT INTO accounting_transactions (
          dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date
        ) VALUES (
          ${targetDormId},
          'Income',
          'Deposit',
          ${depositAmount || 1000},
          ${'ชำระค่าจองห้อง Walk-in ' + room.room_number + ' (Ref: ' + (slipokRef || '-') + ') [SlipOK อนุมัติอัตโนมัติ]'},
          ${billId || contractId},
          'bill',
          ${new Date().toISOString().slice(0, 10)}
        )
      `;
    } catch (accErr) {
      console.warn('[Walk-in Accounting Sync Error]', accErr);
    }

    // 9. Send notification to tenant
    try {
      await sql`
        INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
        VALUES (
          ${userId},
          'จองห้องพัก Walk-in สำเร็จ',
          ${`การจองห้อง ${room.room_number} สำเร็จแล้ว เจ้าของหอพักกำลังจัดทำร่างสัญญาและบิลแรกเข้า`},
          'booking',
          0,
          '/guest',
          NOW()
        )
      `;
    } catch (ne) {}

    return NextResponse.json({
      success: true,
      message: 'บันทึกข้อมูลผู้เช่า Walk-in และล็อกห้องพักสำเร็จเรียบร้อยแล้ว',
      data: {
        userId,
        tenantId,
        contractId,
        roomNumber: room.room_number,
        email: cleanEmail,
        defaultPassword: cleanPhone,
        tenantName: cleanName
      }
    });

  } catch (error: any) {
    console.error('[Walk-in POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
