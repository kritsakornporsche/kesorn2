import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

// GET: Fetch disputes/corrections
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const billId = searchParams.get('billId');
    const sql = getDb();

    let corrections;
    if (billId) {
      corrections = await sql`
        SELECT bc.*, b.room_number, b.billing_cycle, u.name as requester_name,
               COALESCE(mr.photo_url, (
                 SELECT mr2.photo_url 
                 FROM meter_readings mr2 
                 JOIN rooms r ON r.id = mr2.room_id 
                 WHERE r.room_number = b.room_number 
                   AND mr2.photo_url IS NOT NULL 
                   AND mr2.photo_url != '' 
                 ORDER BY mr2.id DESC 
                 LIMIT 1
               )) as meter_photo_url
        FROM bill_corrections bc
        JOIN bills b ON bc.bill_id = b.id
        LEFT JOIN rooms r ON r.room_number = b.room_number
        LEFT JOIN meter_readings mr ON mr.id = (
          SELECT mr3.id 
          FROM meter_readings mr3 
          WHERE mr3.room_id = r.id 
            AND (mr3.billing_cycle = b.billing_cycle OR mr3.billing_cycle IS NULL)
            AND (mr3.type = 'Electricity' OR mr3.type = 'Electric')
          ORDER BY mr3.id DESC 
          LIMIT 1
        )
        LEFT JOIN users u ON bc.requester_id = u.id
        WHERE bc.bill_id = ${billId}
        ORDER BY bc.id DESC
      `;
    } else {
      corrections = await sql`
        SELECT bc.*, b.room_number, b.billing_cycle, u.name as requester_name,
               COALESCE(mr.photo_url, (
                 SELECT mr2.photo_url 
                 FROM meter_readings mr2 
                 JOIN rooms r ON r.id = mr2.room_id 
                 WHERE r.room_number = b.room_number 
                   AND mr2.photo_url IS NOT NULL 
                   AND mr2.photo_url != '' 
                 ORDER BY mr2.id DESC 
                 LIMIT 1
               )) as meter_photo_url
        FROM bill_corrections bc
        JOIN bills b ON bc.bill_id = b.id
        LEFT JOIN rooms r ON r.room_number = b.room_number
        LEFT JOIN meter_readings mr ON mr.id = (
          SELECT mr3.id 
          FROM meter_readings mr3 
          WHERE mr3.room_id = r.id 
            AND (mr3.billing_cycle = b.billing_cycle OR mr3.billing_cycle IS NULL)
            AND (mr3.type = 'Electricity' OR mr3.type = 'Electric')
          ORDER BY mr3.id DESC 
          LIMIT 1
        )
        LEFT JOIN users u ON bc.requester_id = u.id
        ORDER BY bc.id DESC
        LIMIT 50
      `;
    }

    return NextResponse.json({ success: true, data: corrections });
  } catch (err: any) {
    console.error('[Dispute GET Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST: Submit a new dispute (14.1 Owner or 14.2 Tenant)
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { billId, newElectricReading, reason, evidencePhotoUrl } = body;

    const sql = getDb();

    // 1. Fetch bill details
    const billRes = await sql`
      SELECT b.*, dp.electricity_rate, dp.water_rate, dp.common_fee 
      FROM bills b
      LEFT JOIN dormitory_profile dp ON 1=1
      WHERE b.id = ${billId}
      LIMIT 1
    `;

    if (billRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลบิล' }, { status: 404 });
    }

    const bill = billRes[0];

    // Rule: Cannot edit if bill is already Paid
    if (bill.status === 'Paid') {
      return NextResponse.json({ success: false, message: 'ไม่สามารถขอแก้ไขบิลที่ชำระเงินเรียบร้อยแล้วได้' }, { status: 400 });
    }

    const userRole = (session.user as any)?.role === 'owner' ? 'owner' : 'tenant';
    const userId = (session.user as any)?.id || 1;

    // Recalculate new total
    // Support either entering units directly or absolute meter reading
    let newUnits = Number(newElectricReading || 0);
    const prevReading = Number(bill.electric_reading_prev || 0);
    if (newUnits > prevReading && prevReading > 0) {
      newUnits = Math.max(0, newUnits - prevReading);
    }
    const elecRate = 4.88;
    const newElecAmount = Number((newUnits * elecRate).toFixed(2));
    const waterAmount = Number(bill.water_amount || 100);
    const commonFee = Number(bill.common_fee || 150);
    const roomAmount = Number(bill.room_amount || 3400);
    const newTotal = Number((roomAmount + newElecAmount + waterAmount + commonFee).toFixed(2));

    // 2. Insert correction request
    const insertRes = await sql`
      INSERT INTO bill_corrections (
        bill_id, requested_by, requester_id, old_electric_reading, new_electric_reading,
        old_total_amount, new_total_amount, evidence_photo_url, reason, status
      ) VALUES (
        ${billId}, ${userRole}, ${userId}, ${bill.electric_units || 0}, ${newUnits},
        ${bill.amount}, ${newTotal}, ${evidencePhotoUrl || bill.slip_url || null}, ${reason || 'ขอแก้ไขตัวเลขมิเตอร์'}, 'Pending'
      )
    `;

    // 3. Mark bill as PendingCorrection (14.3.1: Freeze payment)
    await sql`
      UPDATE bills
      SET status = 'PendingCorrection'
      WHERE id = ${billId}
    `;

    // Notify Owner if requested by tenant
    if (userRole === 'tenant') {
      try {
        const ownerUser = await sql`
          SELECT u.id FROM users u
          JOIN dormitory_registry dr ON dr.owner_id = u.id OR LOWER(dr.owner_email) = LOWER(u.email)
          WHERE dr.id = 1
          LIMIT 1
        `;
        if (ownerUser.length > 0) {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${ownerUser[0].id},
              'มีคำขอแก้ไขบิลค่าใช้จ่าย',
              ${'ลูกหอห้อง ' + (bill.room_number || '') + ' ได้ส่งคำขอแก้ไขค่ามิเตอร์ไฟในบิล #' + bill.id + ' (' + (reason || 'ขอตรวจสอบมิเตอร์ใหม่') + ')'},
              'bill_dispute',
              0,
              '/owner/billing',
              NOW()
            )
          `;
        }
      } catch (ne) {
        console.warn('Dispute notify warn:', ne);
      }
    }

    return NextResponse.json({
      success: true,
      message: '✅ ส่งคำขอแก้ไขบิลเรียบร้อยแล้ว บิลถูกระงับการชำระชั่วคราวเพื่อรอเจ้าของหอตรวจสอบ',
      correctionId: insertRes.insertId,
    });
  } catch (err: any) {
    console.error('[Dispute POST Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// PUT: Approve or Reject dispute (14.3.2)
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { correctionId, action } = body; // action: 'approve' | 'reject'

    const sql = getDb();
    const corrRes = await sql`
      SELECT bc.*, b.room_number, b.billing_cycle, b.due_date 
      FROM bill_corrections bc
      JOIN bills b ON bc.bill_id = b.id
      WHERE bc.id = ${correctionId}
      LIMIT 1
    `;

    if (corrRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบคำขอแก้ไข' }, { status: 404 });
    }

    const role = (session.user as any)?.role;
    const isStaff = role === 'owner' || role === 'keeper' || role === 'platform_admin';

    const corr = corrRes[0];

    // Rule:
    // If requested_by === 'owner': Tenant must approve/reject. Staff cannot approve their own correction.
    // If requested_by === 'tenant': Owner/Keeper must approve/reject.
    if (corr.requested_by === 'owner' && isStaff) {
      return NextResponse.json({
        success: false,
        message: '⚠️ เนื่องจากคำขอนี้สร้างโดยเจ้าของหอพัก ต้องให้ลูกหอเป็นผู้อนุมัติหรือปฏิเสธเท่านั้น เจ้าของหอไม่สามารถอนุมัติเองได้'
      }, { status: 403 });
    }

    if (corr.requested_by === 'tenant' && !isStaff) {
      return NextResponse.json({
        success: false,
        message: '⚠️ คำขอนี้สร้างโดยลูกหอ ต้องรอให้เจ้าของหอพักเป็นผู้อนุมัติหรือปฏิเสธ'
      }, { status: 403 });
    }

    if (action === 'approve') {
      // 14.3.2: Recalculate bill and set 5 days due date (14.3.3)
      const newDueDate = new Date();
      newDueDate.setDate(newDueDate.getDate() + 5);
      newDueDate.setHours(23, 59, 59, 999);

      await sql`
        UPDATE bills
        SET amount = ${corr.new_total_amount},
            electric_units = ${corr.new_electric_reading},
            electric_amount = ${(corr.new_electric_reading * 4.88).toFixed(2)},
            due_date = ${newDueDate.toISOString().slice(0, 19).replace('T', ' ')},
            status = 'Unpaid',
            penalty_amount = 0.00,
            days_overdue = 0
        WHERE id = ${corr.bill_id}
      `;

      // Update meter_readings table
      await sql`
        UPDATE meter_readings
        SET units_used = ${corr.new_electric_reading}
        WHERE room_id = (SELECT id FROM rooms WHERE room_number = ${corr.room_number})
          AND billing_cycle = ${corr.billing_cycle}
          AND type = 'Electricity'
      `;

      await sql`
        UPDATE bill_corrections
        SET status = 'Approved', reviewed_at = NOW()
        WHERE id = ${correctionId}
      `;

      return NextResponse.json({
        success: true,
        message: '✅ อนุมัติการแก้ไขบิลเรียบร้อยแล้ว ยอดบิลถูกปรับปรุงและขยายเวลาชำระให้อีก 5 วัน',
      });
    } else {
      // Reject dispute -> return bill to Unpaid or Overdue
      await sql`
        UPDATE bills
        SET status = 'Unpaid'
        WHERE id = ${corr.bill_id}
      `;

      await sql`
        UPDATE bill_corrections
        SET status = 'Rejected', reviewed_at = NOW()
        WHERE id = ${correctionId}
      `;

      return NextResponse.json({
        success: true,
        message: 'ปฏิเสธคำขอแก้ไข บิลกลับสู่สถานะรอชำระตามยอดเดิม',
      });
    }
  } catch (err: any) {
    console.error('[Dispute PUT Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
