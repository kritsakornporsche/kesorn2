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
        SELECT bc.*, b.room_number, b.billing_cycle, u.name as requester_name
        FROM bill_corrections bc
        JOIN bills b ON bc.bill_id = b.id
        LEFT JOIN users u ON bc.requester_id = u.id
        WHERE bc.bill_id = ${billId}
        ORDER BY bc.id DESC
      `;
    } else {
      corrections = await sql`
        SELECT bc.*, b.room_number, b.billing_cycle, u.name as requester_name
        FROM bill_corrections bc
        JOIN bills b ON bc.bill_id = b.id
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
    const prevReading = Number(bill.electric_reading_prev || 0);
    const newReading = Number(newElectricReading);
    const newUnits = Math.max(0, newReading - prevReading);
    const elecRate = 4.88;
    const newElecAmount = newUnits * elecRate;
    const waterAmount = Number(bill.water_amount || 100);
    const commonFee = Number(bill.common_fee || 150);
    const roomAmount = Number(bill.room_amount || 3400);
    const newTotal = roomAmount + newElecAmount + waterAmount + commonFee;

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

    return NextResponse.json({
      success: true,
      message: '✅ ส่งคำขอแก้ไขบิลเรียบร้อยแล้ว บิลถูกระงับการชำระชั่วคราวเพื่อรอการยืนยัน',
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

    const corr = corrRes[0];

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
