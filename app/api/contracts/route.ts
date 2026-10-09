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
      phone,
      parentPhone,
      idCardNumber,
      tenantAddress,
      idCardImage,
      slipUrl 
    } = await req.json();

    if (!roomId) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    // Check if room already has an active contract
    const existingActiveContract = await sql`
      SELECT id FROM contracts WHERE room_id = ${roomId} AND status = 'Active' LIMIT 1
    `;
    if (existingActiveContract.length > 0) {
      return NextResponse.json({ 
        success: false, 
        message: 'ห้องพักนี้มีสัญญาที่มีสถานะ Active อยู่แล้ว ไม่สามารถสร้างสัญญาใหม่ได้' 
      }, { status: 400 });
    }

    // 1. Resolve tenant identity (find existing or create new)
    const userEmail = session.user.email;
    let tenants = await sql`SELECT id FROM tenants WHERE email = ${userEmail} LIMIT 1`;
    let tenantId: number;

    if (tenants.length > 0) {
      tenantId = tenants[0].id;
      await sql`
        UPDATE tenants 
        SET 
          name = COALESCE(${tenantName}, name),
          phone = COALESCE(${phone}, phone),
          emergency_contact = COALESCE(${parentPhone}, emergency_contact),
          id_card_number = COALESCE(${idCardNumber}, id_card_number),
          address = COALESCE(${tenantAddress}, address),
          id_card_image = COALESCE(${idCardImage}, id_card_image)
        WHERE id = ${tenantId}
      `;
    } else {
      await sql`
        INSERT INTO tenants (name, email, phone, emergency_contact, id_card_number, address, id_card_image, status)
        VALUES (
          ${tenantName || session.user.name || 'Tenant'}, 
          ${userEmail}, 
          ${phone || null},
          ${parentPhone || null},
          ${idCardNumber || null},
          ${tenantAddress || null},
          ${idCardImage || null},
          'Active'
        )
      `;
      const created = await sql`SELECT id FROM tenants WHERE email = ${userEmail} ORDER BY id DESC LIMIT 1`;
      if (!created || created.length === 0) {
        return NextResponse.json({ success: false, message: 'Failed to create tenant record' }, { status: 500 });
      }
      tenantId = created[0].id;
    }

    // 2. Automated Slip Verification with SlipOK
    let isAutoApproved = false;
    let slipVerified = 0;
    let slipokRef: string | null = null;
    let slipRaw: string | null = null;

    if (slipUrl) {
      const { verifySlipWithSlipOK } = await import('@/lib/slipok');
      const dormProfileRes = await sql`
        SELECT name, promptpay_name, promptpay_number 
        FROM dormitory_profile 
        LIMIT 1
      `;
      const expectedDorm = dormProfileRes[0] || {};

      const verifyResult = await verifySlipWithSlipOK(
        slipUrl, 
        Number(depositAmount || 1000), 
        {
          name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
          promptpay: expectedDorm.promptpay_number || '0636040550',
          dormName: expectedDorm.name || 'หอพักเกษร 2',
          isBooking: true,
          checkPromptPayOnly: true
        }
      );

      // "แต่ถ้าไม่ตรง ไม่ว่าชื่อหรือยอดเงินให้ปฎิเสธ"
      if (!verifyResult.success) {
        return NextResponse.json({
          success: false,
          message: `สลิปไม่ผ่านการตรวจสอบ: ${verifyResult.message || 'หมายเลขพร้อมเพย์ผู้รับหรือยอดเงินในสลิปไม่ถูกต้อง'}`
        }, { status: 400 });
      }

      slipokRef = verifyResult.transRef || null;

      // 🛡️ Anti-Replay Guard: Reject if this slip transaction reference has ever been used before anywhere
      if (slipokRef && !slipokRef.startsWith('MOCK-')) {
        const usedSlipCheck = await sql`
          SELECT id, room_number, created_at FROM bills 
          WHERE slipok_trans_ref = ${slipokRef}
          LIMIT 1
        `;
        if (usedSlipCheck.length > 0) {
          return NextResponse.json({
            success: false,
            message: `สลิปนี้เคยถูกส่งเข้ามาในระบบแล้ว (รหัสอ้างอิง: ${slipokRef}) ไม่สามารถนำสลิปเดิมมาใช้จองห้องพักใหม่ได้`
          }, { status: 400 });
        }
      }

      isAutoApproved = true;
      slipVerified = 1;
      slipRaw = JSON.stringify(verifyResult.rawData || {});
    }

    // 2.05 Persist slip Base64 image to uploads directory (Do not store idCardImage)
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = saveBase64Image(slipUrl, 'slips', `slip_${tenantId}_${roomId}`);

    // 2.1 Create Contract record (Booking deposit only reserves the room, Rule 2.1.1)
    // Contract status stays PendingOwnerSignature / PendingContract until owner uploads lease contract
    const contractStatus = 'PendingOwnerSignature';
    const ownerSig = null;

    await sql`
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
        ${roomId}, 
        ${startDate}, 
        ${endDate}, 
        ${depositAmount || 1000}, 
        ${signature || 'CONFIRMED_E_CONTRACT'}, 
        ${ownerSig},
        ${isAutoApproved ? new Date() : null},
        ${storedSlipUrl || null},
        ${idCardNumber || null},
        ${tenantAddress || null},
        NULL,
        ${parentPhone || null},
        ${contractStatus}
      )
    `;

    const contracts = await sql`
      SELECT id FROM contracts 
      WHERE tenant_id = ${tenantId} AND room_id = ${roomId} 
      ORDER BY id DESC LIMIT 1
    `;
    const contractId = contracts.length > 0 ? contracts[0].id : null;

    // 2.2 Create booking fee bill in bills table (Deposit 1,000 THB)
    const roomInfo = await sql`
      SELECT r.room_number, COALESCE(r.dorm_id, 1) as dorm_id 
      FROM rooms r 
      WHERE r.id = ${roomId} 
      LIMIT 1
    `;
    const roomNumber = roomInfo.length > 0 ? roomInfo[0].room_number : String(roomId);
    const dormId = roomInfo.length > 0 ? (roomInfo[0].dorm_id || 1) : 1;
    const bookingDueDate = startDate ? new Date(startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const initialBillStatus = isAutoApproved ? 'Paid' : 'Unpaid';
    const bookingTitle = `ค่าจองห้องพัก (ห้อง ${roomNumber})`;

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
        ${dormId},
        ${roomNumber},
        ${bookingTitle},
        ${depositAmount || 1000},
        ${depositAmount || 1000},
        0,
        0,
        0,
        0,
        'ค่าจองห้องพักเพื่อยืนยันสิทธิ์',
        ${bookingDueDate},
        ${initialBillStatus},
        ${storedSlipUrl || null},
        'booking',
        ${slipVerified},
        ${isAutoApproved ? new Date() : null},
        ${slipokRef},
        ${slipRaw}
      )
    `;
    const billId = (billInsertRes as any)?.insertId;

    // 3. Update room and tenant status for 2.1.1 (Room becomes Reserved/Pending, user remains guest until 2.1.3)
    if (isAutoApproved) {
      await sql`UPDATE rooms SET status = 'Reserved' WHERE id = ${roomId}`;
      await sql`UPDATE tenants SET room_id = ${roomId}, status = 'Pending' WHERE id = ${tenantId}`;
      await sql`UPDATE users SET role = 'guest', primary_role = 'guest' WHERE LOWER(email) = LOWER(${userEmail})`;

      // Link user_dorm_roles
      try {
        const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${userEmail}) LIMIT 1`;
        if (uRes.length > 0) {
          const uId = uRes[0].id;
          const existingRole = await sql`SELECT id FROM user_dorm_roles WHERE user_id = ${uId} AND dorm_id = ${dormId} LIMIT 1`;
          if (existingRole.length === 0) {
            await sql`INSERT INTO user_dorm_roles (user_id, dorm_id, role) VALUES (${uId}, ${dormId}, 'guest')`;
          }
        }
      } catch (re) {
        console.warn('user_dorm_roles sync error:', re);
      }

      // Sync to accounting
      try {
        await sql`
          INSERT INTO accounting_transactions (
            dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date
          ) VALUES (
            ${dormId},
            'Income',
            'Deposit',
            ${depositAmount || 1000},
            ${'ชำระค่าจองห้อง ' + roomNumber + ' (Ref: ' + (slipokRef || '-') + ') [SlipOK อนุมัติอัตโนมัติ]'},
            ${billId || contractId},
            'bill',
            ${new Date().toISOString().slice(0, 10)}
          )
        `;
      } catch (txErr) {
        console.warn('Accounting sync error:', txErr);
      }
    } else {
      await sql`UPDATE rooms SET status = 'Reserved' WHERE id = ${roomId}`;
    }

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
