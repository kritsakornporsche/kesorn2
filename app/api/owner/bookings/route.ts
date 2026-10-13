import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId') || searchParams.get('dormDbName');
    const userEmail = session.user.email;

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
        c.contract_file_url,
        c.id_card_number,
        c.tenant_address,
        c.id_card_image,
        c.parent_phone,
        c.created_at as booking_created_at,
        COALESCE(t.name, u.name, 'ไม่ระบุชื่อ') as guest_name,
        COALESCE(t.email, u.email, '') as guest_email,
        COALESCE(t.phone, u.phone, '') as guest_phone,
        r.room_number,
        r.room_type,
        r.floor,
        r.price as monthly_rent,
        r.status as room_status,
        b.id as first_bill_id,
        b.title as first_bill_title,
        b.amount as first_bill_amount,
        b.status as first_bill_status,
        b.due_date as first_bill_due_date,
        b.created_at as first_bill_created_at,
        1 as dorm_id,
        'หอพักเกษร 2' as dorm_name
      FROM contracts c
      LEFT JOIN tenants t ON c.tenant_id = t.id
      LEFT JOIN users u ON t.user_id = u.id OR t.email = u.email
      JOIN rooms r ON c.room_id = r.id
      LEFT JOIN bills b ON (b.tenant_id = c.tenant_id AND (b.is_first_bill = 1 OR b.bill_type = 'booking') AND b.status != 'Cancelled')
      ORDER BY 
        CASE 
          WHEN c.status = 'PendingOwnerSignature' THEN 1
          WHEN c.status = 'PendingFirstBill' THEN 2
          WHEN c.status = 'Active' THEN 3
          ELSE 4
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
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { action, contractId } = body;

    const sql = getDb();

    // ==========================================
    // ACTION: UPLOAD / UPDATE CONTRACT FILE (อัพโหลดไฟล์สัญญา)
    // ==========================================
    if (action === 'upload_contract') {
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

      // 2.1 Update booking fee bill to Cancelled
      if (contract.tenant_id) {
        await sql`
          UPDATE bills 
          SET status = 'Cancelled' 
          WHERE tenant_id = ${contract.tenant_id} 
            AND bill_type = 'booking' 
            AND status IN ('Pending', 'Unpaid')
        `;
      }

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
