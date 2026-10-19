import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { verifySlipWithSlipOK } from '@/lib/slipok';
import { recordPayment, slipPaidAt } from '@/lib/payments';
import { bookingFeeFor, getDormPromptPay } from '@/lib/billing';
import { createContract, contractMessage } from '@/lib/contracts';
import { voidFailedBooking } from '@/lib/bookings';
import { parseOccupants } from '@/lib/occupants';

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
 * 4. Booking fee: a PromptPay slip verified by SlipOK (anti-replay + validation), or cash received by the
 *    owner/manager on site (paymentMethod 'cash': exactly the server's booking fee, recorded with a receipt)
 * 5. Updates room status to 'Reserved'
 * 6. Creates booking bill (status = 'Paid') & logs to accounting_transactions
 * 7. Creates contract with status 'PendingOwnerSignature'
 */
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
      roomId,
      startDate,
      endDate,
      monthlyRent,
      tenantName,
      email,
      phone,
      parentPhone,
      idCardNumber,
      tenantAddress,
      slipUrl,
      paymentMethod: rawMethod,
      cashAmount,
      cashPaidAt,
    } = body;

    // How the booking fee is paid: a transfer slip (default, as before) or cash received on site
    const paymentMethod = rawMethod === undefined || rawMethod === null || rawMethod === '' ? 'slip' : rawMethod;
    if (paymentMethod !== 'slip' && paymentMethod !== 'cash') {
      return NextResponse.json({ success: false, message: 'วิธีชำระค่าจองไม่ถูกต้อง (สลิปโอน หรือ เงินสด)' }, { status: 400 });
    }
    const isCash = paymentMethod === 'cash';
    // commit 27: occupants of the room (1–MAX_OCCUPANTS, lib/occupants)
    const occ = parseOccupants(body.occupants);
    if (!occ.ok) return NextResponse.json({ success: false, message: occ.message }, { status: 400 });

    // Validation
    if (!roomId || !tenantName || !email || !phone || (!isCash && !slipUrl)) {
      return NextResponse.json({
        success: false,
        message: isCash
          ? 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (ห้องพัก, ชื่อผู้เช่า, อีเมล, เบอร์โทรศัพท์)'
          : 'กรุณากรอกข้อมูลสำคัญให้ครบถ้วน (ห้องพัก, ชื่อผู้เช่า, อีเมล, เบอร์โทรศัพท์, และสลิปการโอนเงิน)'
      }, { status: 400 });
    }

    // Cash: when it was received (Thai time 'YYYY-MM-DDTHH:mm', default now), never in the future
    const now = new Date();
    let cashPaidAtDate = now;
    if (isCash && cashPaidAt !== undefined && cashPaidAt !== null && cashPaidAt !== '') {
      cashPaidAtDate = typeof cashPaidAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(cashPaidAt)
        ? new Date(`${cashPaidAt}:00+07:00`)
        : new Date(NaN);
      if (Number.isNaN(cashPaidAtDate.getTime())) {
        return NextResponse.json({ success: false, message: 'วันเวลาที่รับเงินไม่ถูกต้อง' }, { status: 400 });
      }
      if (cashPaidAtDate.getTime() > now.getTime() + 60_000) {
        return NextResponse.json({ success: false, message: 'วันเวลาที่รับเงินต้องไม่อยู่ในอนาคต' }, { status: 400 });
      }
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
    // Booking fee set by the server (never by the page), as for self-booking; the slip must match it exactly
    const bookingFee = bookingFeeFor(room.room_number);
    // Cash: the amount the staff confirmed on the page must be exactly the booking fee (a stale page is refused)
    if (isCash && Number(cashAmount) !== bookingFee) {
      return NextResponse.json({ success: false, message: `ยอดเงินสดไม่ตรงกับค่าจอง ฿${bookingFee.toLocaleString('th-TH')}` }, { status: 400 });
    }

    let slipRaw = null;
    let slipokRef: string | null = null;
    let slipAmount: number | undefined;
    let slipPaid: Date = cashPaidAtDate;

    if (!isCash) {
    // 2. SlipOK Verification (booking fee slip)

    const dormProfiles = await sql`
      SELECT name, promptpay_name
      FROM dormitory_profile
      LIMIT 1
    `;
    const dormProfile = dormProfiles.length > 0 ? dormProfiles[0] : { name: 'หอพักเกษร 2' };

    const verifyResult = await verifySlipWithSlipOK(
      slipUrl,
      bookingFee,
      {
        name: dormProfile.promptpay_name || dormProfile.name || 'หอพักเกษร 2',
        promptpay: (await getDormPromptPay(sql)) || '',
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

    slipRaw = JSON.stringify(verifyResult.rawData || {});
    slipAmount = verifyResult.amount !== undefined ? Number(verifyResult.amount) : bookingFee;
    slipPaid = slipPaidAt(verifyResult);
    }

    // 3. Account + contract through the single contract service. A new account's password is the phone
    // number; an existing guest/tenant account keeps its password and role; staff accounts are refused.
    // One booking/contract per account until it ends (checked in the same transaction, with the user row locked).
    const formattedStartDate = startDate || new Date().toISOString().slice(0, 10);
    const formattedEndDate = endDate || new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10);
    const created = await createContract({
      account: {
        email: cleanEmail,
        name: cleanName,
        phone: cleanPhone,
        idCardNumber: cleanIdCard,
        address: tenantAddress || null,
        role: 'guest',
        newPassword: cleanPhone,
      },
      roomId: room.id,
      startDate: formattedStartDate,
      endDate: formattedEndDate,
      depositAmount: bookingFee,
      status: 'PendingOwnerSignature',
      requireRoomFree: true,
      oneOpenContract: true,
      signature: 'WALK_IN_VERIFIED',
      signedAt: new Date(),
      occupants: occ.value,
      // Staff on site counts as the approval
      approvedAt: new Date(),
      approvedBy: guard.user.id,
      idCardNumber: cleanIdCard,
      tenantAddress: tenantAddress || null,
      parentPhone: cleanParentPhone,
    });
    if (!created.ok) {
      return NextResponse.json({ success: false, message: contractMessage(created) }, { status: 400 });
    }
    const { contractId, tenantId, userId } = created;

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
        ${bookingFee},
        ${bookingFee},
        0,
        0,
        0,
        0,
        'ค่าจองห้องพักเพื่อยืนยันสิทธิ์',
        ${formattedStartDate},
        'Unpaid',
        ${null},
        'booking',
        0,
        ${null},
        ${slipokRef},
        ${slipRaw}
      )
    `;
    const billId = (billInsertRes as any)?.insertId;

    await sql`UPDATE contracts SET booking_bill_id = ${billId} WHERE id = ${contractId}`;

    // The verified slip, or the cash received, pays the booking bill through the single payment entry point
    // (also records the deposit part as a liability, and gives the receipt).
    // If it cannot be recorded, the contract and bill just created are undone and the room is released.
    const payment = isCash
      ? await recordPayment(billId, {
          amount: bookingFee,
          method: 'cash',
          paidAt: cashPaidAtDate,
          recordedBy: guard.user.id,
          note: 'รับเงินสดค่าจอง (walk-in)',
        })
      : await recordPayment(billId, {
          amount: slipAmount ?? bookingFee,
          method: 'slip',
          paidAt: slipPaid,
          slipRef: slipokRef,
          recordedBy: guard.user.id,
        });
    if (!payment.ok) {
      await voidFailedBooking(contractId, billId, new Date());
      const message = payment.reason === 'duplicate_slip' ? 'สลิปนี้ถูกใช้ชำระเงินไปแล้ว ไม่สามารถใช้ซ้ำได้'
        : payment.reason === 'amount_mismatch' ? `ยอดในสลิปไม่ตรงกับค่าจอง ฿${bookingFee.toLocaleString('th-TH')}`
        : 'บันทึกการชำระค่าจองไม่สำเร็จ';
      return NextResponse.json({ success: false, message }, { status: 400 });
    }

    // Keep the slip image only now that the walk-in succeeded (a refused walk-in leaves no file behind)
    const { saveBase64Image } = await import('@/lib/file-storage');
    const storedSlipUrl = isCash ? null : saveBase64Image(slipUrl, 'slips', `walkin_${Date.now()}_room_${room.room_number}`);
    if (storedSlipUrl) {
      await sql`UPDATE contracts SET slip_url = ${storedSlipUrl} WHERE id = ${contractId}`;
      await sql`UPDATE bills SET slip_url = ${storedSlipUrl} WHERE id = ${billId}`;
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
          ${new Date()}
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
        tenantName: cleanName,
        paymentMethod,
        paymentId: payment.paymentId,
        bookingFee,
      }
    });

  } catch (error: any) {
    console.error('[Walk-in POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
