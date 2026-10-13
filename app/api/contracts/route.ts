import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { recordPayment, slipPaidAt } from '@/lib/payments';
import { bookingFeeFor, getDormPromptPay } from '@/lib/billing';
import { createContract, CONTRACT_MESSAGES } from '@/lib/contracts';

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

    // The booking fee is set by the server (never by the client), and the slip must match it exactly
    const feeRoom = await sql`SELECT room_number FROM rooms WHERE id = ${roomId} LIMIT 1`;
    if (feeRoom.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบห้องพัก' }, { status: 404 });
    }
    const bookingFee = bookingFeeFor(feeRoom[0].room_number);
    const userEmail = session.user.email;
    if (!userEmail) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    // 1. Automated Slip Verification with SlipOK
    let isAutoApproved = false;
    let slipokRef: string | null = null;
    let slipRaw: string | null = null;
    let slipAmount = bookingFee;
    let slipTime = new Date();

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
        bookingFee, 
        {
          name: expectedDorm.promptpay_name || expectedDorm.name || 'หอพักเกษร 2',
          promptpay: (await getDormPromptPay(sql)) || '',
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
      slipRaw = JSON.stringify(verifyResult.rawData || {});
      if (verifyResult.amount !== undefined) slipAmount = Number(verifyResult.amount);
      slipTime = slipPaidAt(verifyResult);
    }

    // 2.05 Persist slip Base64 image to uploads directory (Do not store idCardImage)
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = saveBase64Image(slipUrl, 'slips', `slip_booking_${roomId}`);

    // 2.1 Contract + tenant account through the single contract service (room becomes Reserved,
    // account stays guest until the contract is active; a staff account cannot book)
    const created = await createContract({
      account: {
        email: userEmail,
        name: tenantName || session.user.name || null,
        phone: phone || null,
        idCardNumber: idCardNumber || null,
        idCardImage: idCardImage || null,
        address: tenantAddress || null,
        emergencyContact: parentPhone || null,
        role: 'guest',
      },
      roomId: Number(roomId),
      startDate,
      endDate,
      depositAmount: bookingFee,
      status: 'PendingOwnerSignature',
      signature: signature || 'CONFIRMED_E_CONTRACT',
      signedAt: isAutoApproved ? new Date() : null,
      slipUrl: storedSlipUrl || null,
      idCardNumber: idCardNumber || null,
      tenantAddress: tenantAddress || null,
      parentPhone: parentPhone || null,
    });
    if (!created.ok) {
      return NextResponse.json({ success: false, message: CONTRACT_MESSAGES[created.reason] }, { status: 400 });
    }
    const { contractId, tenantId, roomNumber, dormId } = created;

    // 2.2 Create booking fee bill in bills table
    const bookingDueDate = startDate ? new Date(startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
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
        ${bookingFee},
        ${bookingFee},
        0,
        0,
        0,
        0,
        'ค่าจองห้องพักเพื่อยืนยันสิทธิ์',
        ${bookingDueDate},
        'Unpaid',
        ${storedSlipUrl || null},
        'booking',
        0,
        ${null},
        ${slipokRef},
        ${slipRaw}
      )
    `;
    const billId = (billInsertRes as any)?.insertId;

    // A verified slip pays the booking bill through the single payment entry point (also records income)
    if (isAutoApproved && billId) {
      const payment = await recordPayment(billId, {
        amount: slipAmount,
        method: 'slip',
        paidAt: slipTime,
        slipRef: slipokRef,
        recordedBy: Number((session.user as any)?.id) || null,
      });
      if (!payment.ok) console.warn('[Booking payment not recorded]', billId, payment);
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
        const notifMsg = `คุณ ${guestDisplay} ได้ทำการจองห้อง ${room_number} (${dorm_name}) มัดจำ ฿${bookingFee.toLocaleString()} กรุณาตรวจสอบสลิปและอนุมัติการจอง`;

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
