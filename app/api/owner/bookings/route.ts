import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId') || searchParams.get('dormDbName');
    const userEmail = session?.user?.email || searchParams.get('email');

    const sql = getDb();

    // Single Dormitory (Kesorn 2) bookings query
    const dorms = [
      { id: 1, dorm_name: 'หอพักเกษร 2', db_name: 'kesorn_db' }
    ];

    const bookings = await sql`
      SELECT 
        c.id as contract_id,
        c.tenant_id,
        c.room_id,
        c.start_date, 
        c.end_date, 
        c.deposit_amount, 
        c.status as booking_status, 
        c.slip_url,
        c.signature_data,
        c.owner_signature_data,
        c.created_at as booking_created_at,
        COALESCE(t.name, u.name, 'ไม่ระบุชื่อ') as guest_name,
        COALESCE(t.email, u.email, '') as guest_email,
        COALESCE(t.phone, u.phone, '') as guest_phone,
        r.room_number,
        r.room_type,
        r.floor,
        r.price as monthly_rent,
        r.status as room_status,
        1 as dorm_id,
        'หอพักเกษร 2' as dorm_name
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      JOIN rooms r ON c.room_id = r.id
      ORDER BY 
        CASE 
          WHEN c.status = 'PendingOwnerSignature' THEN 1
          WHEN c.status = 'Active' THEN 2
          ELSE 3
        END ASC,
        c.id DESC
    `;

    // Fetch rooms for room reassignment or manual booking
    const availableRooms = await sql`
      SELECT id, 1 as dorm_id, room_number, floor, room_type, price, status 
      FROM rooms 
      ORDER BY room_number ASC
    `;

    return NextResponse.json({ 
      success: true, 
      data: bookings,
      availableRooms: availableRooms,
      dorms: dorms,
      selectedDormId: 1
    });
  } catch (error: any) {
    console.error('[API Owner Bookings GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { action, contractId } = body;

    const sql = getDb();

    // ==========================================
    // ACTION 1: APPROVE BOOKING (อนุมัติการจอง)
    // ==========================================
    if (action === 'approve') {
      if (!contractId) {
        return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
      }

      const { createInitialBill, initialBillAmount, customStartDate, customRoomId, contractFileUrl } = body;

      const contractRes = await sql`
        SELECT c.*, t.user_id, t.email as tenant_email, r.price as room_price, r.dorm_id, r.room_number
        FROM contracts c
        LEFT JOIN tenants t ON c.tenant_id = t.id
        LEFT JOIN rooms r ON c.room_id = r.id
        WHERE c.id = ${contractId}
      `;

      if (contractRes.length === 0) {
        return NextResponse.json({ success: false, message: 'Booking contract not found' }, { status: 404 });
      }

      const contract = contractRes[0];
      const targetRoomId = customRoomId || contract.room_id;
      const tenantId = contract.tenant_id;
      const tenantEmail = contract.tenant_email;
      const startDate = customStartDate || contract.start_date;

      // 1. Update contract to Active with optional contractFileUrl
      if (contractFileUrl) {
        await sql`
          UPDATE contracts 
          SET status = 'Active', 
              room_id = ${targetRoomId},
              start_date = ${startDate},
              contract_file_url = ${contractFileUrl},
              owner_signature_data = 'APPROVED_DIGITALLY', 
              signed_at = NOW() 
          WHERE id = ${contractId}
        `;
      } else {
        await sql`
          UPDATE contracts 
          SET status = 'Active', 
              room_id = ${targetRoomId},
              start_date = ${startDate},
              owner_signature_data = 'APPROVED_DIGITALLY', 
              signed_at = NOW() 
          WHERE id = ${contractId}
        `;
      }

      // 2. Update room to Occupied (and if changed room, free the old one)
      if (customRoomId && customRoomId !== contract.room_id) {
        await sql`UPDATE rooms SET status = 'Available' WHERE id = ${contract.room_id}`;
      }
      await sql`UPDATE rooms SET status = 'Occupied' WHERE id = ${targetRoomId}`;

      // 3. Link tenant room_id
      if (tenantId) {
        await sql`UPDATE tenants SET room_id = ${targetRoomId}, status = 'Active' WHERE id = ${tenantId}`;
      }

      // 4. Update user role to tenant
      if (tenantEmail) {
        await sql`
          UPDATE users 
          SET role = 'tenant', primary_role = 'tenant' 
          WHERE LOWER(email) = LOWER(${tenantEmail})
        `;

        // Ensure user_dorm_roles entry exists
        try {
          const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${tenantEmail}) LIMIT 1`;
          if (uRes.length > 0) {
            const uId = uRes[0].id;
            const existingRole = await sql`SELECT id FROM user_dorm_roles WHERE user_id = ${uId} AND dorm_id = ${contract.dorm_id || 1} LIMIT 1`;
            if (existingRole.length === 0) {
              await sql`INSERT INTO user_dorm_roles (user_id, dorm_id, role) VALUES (${uId}, ${contract.dorm_id || 1}, 'tenant')`;
            }
          }
        } catch (re) {
          console.warn('user_dorm_roles sync warn:', re);
        }
      }

      // 5. Optionally create first month rent invoice (ใบแจ้งหนี้ค่าเช่าเดือนแรก)
      if (createInitialBill) {
        const billAmount = initialBillAmount || contract.room_price || 0;
        const cycle = new Date(startDate).toLocaleString('th-TH', { month: 'long', year: 'numeric' });
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
            status
          ) VALUES (
            ${tenantId}, 
            ${contract.dorm_id}, 
            ${contract.room_number}, 
            ${'ค่าเช่าห้องพักเดือนแรก (รอบ ' + cycle + ')'}, 
            ${billAmount}, 
            ${billAmount}, 
            ${cycle}, 
            ${startDate}, 
            'Unpaid'
          )
        `;
      }

      // 6. Notify tenant about approval
      try {
        const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${tenantEmail}) LIMIT 1`;
        if (uRes.length > 0) {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${uRes[0].id},
              'การจองห้องพักได้รับการอนุมัติแล้ว',
              ${'การจองห้อง ' + (contract.room_number || '-') + ' ได้รับการอนุมัติแล้ว คุณสามารถเข้าสู่ระบบผู้เช่าเพื่อดูสัญญาและข้อมูลห้องพักได้ทันที'},
              'booking_approved',
              0,
              '/tenant',
              NOW()
            )
          `;
        }
      } catch (ne) {
        console.warn('Booking approve notify warn:', ne);
      }

      return NextResponse.json({ 
        success: true, 
        message: 'อนุมัติการจองห้องพักและเปิดสัญญาเช่าเรียบร้อยแล้ว' 
      });

    // ==========================================
    // ACTION: UPLOAD / UPDATE CONTRACT FILE (อัพโหลดไฟล์สัญญา)
    // ==========================================
    } else if (action === 'upload_contract') {
      if (!contractId) {
        return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
      }
      const { contractFileUrl } = body;
      if (!contractFileUrl) {
        return NextResponse.json({ success: false, message: 'Missing contractFileUrl' }, { status: 400 });
      }

      await sql`
        UPDATE contracts 
        SET contract_file_url = ${contractFileUrl},
            updated_at = NOW()
        WHERE id = ${contractId}
      `;

      return NextResponse.json({ 
        success: true, 
        message: 'บันทึกเอกสารสัญญาเข้าสู่ระบบเรียบร้อยแล้ว' 
      });

    // ==========================================
    // ACTION 2: REJECT / CANCEL BOOKING (ปฏิเสธ)
    // ==========================================
    } else if (action === 'reject') {
      if (!contractId) {
        return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
      }

      const { reason } = body;

      const contractRes = await sql`
        SELECT c.*, t.email as tenant_email 
        FROM contracts c
        LEFT JOIN tenants t ON c.tenant_id = t.id
        WHERE c.id = ${contractId}
      `;

      if (contractRes.length === 0) {
        return NextResponse.json({ success: false, message: 'Booking contract not found' }, { status: 404 });
      }

      const contract = contractRes[0];
      const roomId = contract.room_id;
      const tenantEmail = contract.tenant_email;

      // 1. Update contract to Cancelled and save reason
      const noteText = reason ? `ปฏิเสธการจอง: ${reason}` : 'ปฏิเสธการจองโดยเจ้าของหอพัก';
      await sql`
        UPDATE contracts 
        SET status = 'Cancelled', 
            renewal_note = ${noteText} 
        WHERE id = ${contractId}
      `;

      // 2. Set room back to Available
      await sql`UPDATE rooms SET status = 'Available' WHERE id = ${roomId}`;

      // 3. Remove booking progress
      if (tenantEmail) {
        await sql`DELETE FROM booking_progress WHERE user_email = ${tenantEmail} AND room_id = ${roomId}`;

        // 4. Notify guest/tenant about rejection
        try {
          const uRes = await sql`SELECT id FROM users WHERE LOWER(email) = LOWER(${tenantEmail}) LIMIT 1`;
          if (uRes.length > 0) {
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${uRes[0].id},
                'คำขอจองห้องพักไม่ผ่านการอนุมัติ',
                ${'คำขอจองห้องพักไม่ผ่านการอนุมัติ: ' + (reason || 'กรุณาติดต่อเจ้าหน้าที่หอพักเพื่อสอบถามรายละเอียดเพิ่มเติม')},
                'booking_rejected',
                0,
                '/explore',
                NOW()
              )
            `;
          }
        } catch (ne) {
          console.warn('Booking reject notify warn:', ne);
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: 'ปฏิเสธและยกเลิกคำขอจองห้องพักแล้ว ห้องพักกลับสู่สถานะว่าง' 
      });

    // ==========================================
    // ACTION 3: UPDATE BOOKING (แก้ไขข้อมูลการจอง)
    // ==========================================
    } else if (action === 'update') {
      const { 
        roomId: newRoomId, 
        startDate, 
        endDate, 
        depositAmount, 
        monthlyRent, 
        guestName, 
        guestPhone, 
        note 
      } = body;

      const contractRes = await sql`SELECT * FROM contracts WHERE id = ${contractId}`;
      if (contractRes.length === 0) {
        return NextResponse.json({ success: false, message: 'Booking not found' }, { status: 404 });
      }

      const currentContract = contractRes[0];

      // Handle room change if applicable
      if (newRoomId && newRoomId !== currentContract.room_id) {
        await sql`UPDATE rooms SET status = 'Available' WHERE id = ${currentContract.room_id}`;
        await sql`UPDATE rooms SET status = 'Reserved' WHERE id = ${newRoomId}`;
      }

      // Update contract
      await sql`
        UPDATE contracts 
        SET room_id = ${newRoomId || currentContract.room_id},
            start_date = ${startDate || currentContract.start_date},
            end_date = ${endDate || currentContract.end_date},
            deposit_amount = ${depositAmount || currentContract.deposit_amount},
            renewal_note = ${note || currentContract.renewal_note}
        WHERE id = ${contractId}
      `;

      // Update tenant info
      if (currentContract.tenant_id) {
        if (guestName || guestPhone) {
          await sql`
            UPDATE tenants 
            SET name = COALESCE(${guestName}, name),
                phone = COALESCE(${guestPhone}, phone)
            WHERE id = ${currentContract.tenant_id}
          `;
        }
      }

      return NextResponse.json({ 
        success: true, 
        message: 'บันทึกการแก้ไขข้อมูลการจองห้องพักเรียบร้อยแล้ว' 
      });

    // ==========================================
    // ACTION 4: CREATE MANUAL / WALK-IN BOOKING (สร้างการจองด้วยตนเอง)
    // ==========================================
    } else if (action === 'create') {
      const { 
        dormId, 
        roomId, 
        guestName, 
        guestEmail, 
        guestPhone, 
        startDate, 
        endDate, 
        depositAmount, 
        slipUrl, 
        notes, 
        autoApprove 
      } = body;

      if (!roomId || !guestName || !startDate) {
        return NextResponse.json({ success: false, message: 'กรุณากรอกข้อมูลห้องพัก ชื่อผู้จอง และวันที่เริ่มสัญญาให้ครบถ้วน' }, { status: 400 });
      }

      // 1. Create or find tenant
      let tenantId: number;
      const existingTenant = await sql`
        SELECT id FROM tenants WHERE email = ${guestEmail || `walkin-${Date.now()}@smartdom.local`} LIMIT 1
      `;

      if (existingTenant.length > 0) {
        tenantId = existingTenant[0].id;
        await sql`
          UPDATE tenants 
          SET name = ${guestName}, phone = ${guestPhone || ''} 
          WHERE id = ${tenantId}
        `;
      } else {
        const dummyEmail = guestEmail || `guest-${Date.now()}@smartdom.local`;
        await sql`
          INSERT INTO tenants (name, email, phone, dorm_id, room_id, status)
          VALUES (${guestName}, ${dummyEmail}, ${guestPhone || ''}, ${dormId || null}, ${roomId}, 'Active')
        `;
        const created = await sql`SELECT id FROM tenants WHERE email = ${dummyEmail} ORDER BY id DESC LIMIT 1`;
        tenantId = created[0].id;
      }

      // 2. Create contract record
      const contractStatus = autoApprove ? 'Active' : 'PendingOwnerSignature';
      const contractEndDate = endDate || new Date(new Date(startDate).setFullYear(new Date(startDate).getFullYear() + 1)).toISOString().split('T')[0];

      await sql`
        INSERT INTO contracts (
          tenant_id,
          room_id,
          start_date,
          end_date,
          deposit_amount,
          signature_data,
          owner_signature_data,
          slip_url,
          renewal_note,
          status
        ) VALUES (
          ${tenantId},
          ${roomId},
          ${startDate},
          ${contractEndDate},
          ${depositAmount || 0},
          'WALK_IN_CONFIRMED',
          ${autoApprove ? 'APPROVED_BY_OWNER' : null},
          ${slipUrl || null},
          ${notes || 'การจองโดยตรงผ่านผู้ดูแลหอพัก (Walk-in)'},
          ${contractStatus}
        )
      `;

      // 3. Update room status
      await sql`
        UPDATE rooms 
        SET status = ${autoApprove ? 'Occupied' : 'Reserved'} 
        WHERE id = ${roomId}
      `;

      return NextResponse.json({ 
        success: true, 
        message: autoApprove 
          ? 'บันทึกการจองและอนุมัติสัญญาเช่าเข้าพักเรียบร้อยแล้ว' 
          : 'บันทึกการจองห้องพักเรียบร้อยแล้ว (สถานะรอดำเนินการ)' 
      });

    // ==========================================
    // ACTION 5: DELETE BOOKING HISTORY (ลบประวัติ)
    // ==========================================
    } else if (action === 'delete') {
      if (!contractId) {
        return NextResponse.json({ success: false, message: 'Missing contractId' }, { status: 400 });
      }

      const contractRes = await sql`SELECT * FROM contracts WHERE id = ${contractId}`;
      if (contractRes.length > 0 && contractRes[0].status === 'Cancelled') {
        await sql`DELETE FROM contracts WHERE id = ${contractId}`;
        return NextResponse.json({ success: true, message: 'ลบประวัติการจองเรียบร้อยแล้ว' });
      } else {
        return NextResponse.json({ success: false, message: 'สามารถลบได้เฉพาะรายการที่ยกเลิกแล้วเท่านั้น' }, { status: 400 });
      }
    }

    return NextResponse.json({ success: false, message: 'Invalid action specified' }, { status: 400 });

  } catch (error: any) {
    console.error('[API Owner Bookings POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
