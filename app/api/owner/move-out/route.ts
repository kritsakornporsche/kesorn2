import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

export async function GET(req: Request) {
  try {
    const session = await auth();
    // Allow owner or authorized role
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const dormId = searchParams.get('dormId') || 1;

    // Fetch move-out requests with tenant, room, and contract details
    const requests = await sql`
      SELECT 
        mor.id,
        mor.tenant_id,
        mor.room_id,
        mor.move_out_date,
        mor.desired_date,
        mor.reason,
        mor.status,
        mor.promptpay_target,
        mor.promptpay_name,
        mor.bank_name,
        mor.contract_id,
        mor.deposit_amount,
        mor.unpaid_bills_total,
        mor.penalty_amount,
        mor.net_refund_amount,
        mor.is_contract_completed,
        mor.refund_qr_payload,
        mor.refund_slip_url,
        mor.refunded_at,
        mor.created_at,
        t.name as tenant_name,
        t.phone as tenant_phone,
        t.email as tenant_email,
        t.id_card_number as tenant_id_card,
        r.room_number,
        r.room_type,
        r.price as room_price,
        c.start_date as contract_start_date,
        c.end_date as contract_end_date,
        c.deposit_amount as contract_deposit_amount,
        c.status as contract_status
      FROM move_out_requests mor
      LEFT JOIN tenants t ON mor.tenant_id = t.id
      LEFT JOIN rooms r ON mor.room_id = r.id
      LEFT JOIN contracts c ON c.id = COALESCE(mor.contract_id, (SELECT id FROM contracts WHERE tenant_id = mor.tenant_id ORDER BY id DESC LIMIT 1))
      WHERE (r.dorm_id = ${dormId} OR r.dorm_id IS NULL)
      ORDER BY mor.id DESC
    `;

    // Enhance each request with real-time unpaid bills breakdown and dynamic QR image
    const enhanced = await Promise.all(requests.map(async (item: any) => {
      // 1. Fetch real-time unpaid bills for this tenant
      const unpaidBills = await sql`
        SELECT id, title, amount, billing_cycle, created_at, status
        FROM bills
        WHERE tenant_id = ${item.tenant_id} AND status != 'paid'
        ORDER BY id ASC
      `;

      const liveUnpaidTotal = unpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);
      const originalDeposit = Number(item.contract_deposit_amount || item.deposit_amount || 0);

      // Check contract completion (compare desired_date with contract_end_date)
      let isCompleted = Boolean(item.is_contract_completed);
      if (item.contract_end_date && item.desired_date) {
        const moveDate = new Date(item.desired_date);
        const endDate = new Date(item.contract_end_date);
        isCompleted = moveDate.getTime() >= (endDate.getTime() - (24 * 60 * 60 * 1000));
      }

      const penalty = Number(item.penalty_amount || 0);
      const liveNetRefund = Math.max(0, originalDeposit - liveUnpaidTotal - penalty);

      // 2. Generate PromptPay QR
      const target = (item.promptpay_target || item.tenant_phone || item.tenant_id_card || '0829853519').replace(/[\s-]/g, '');
      let qrPayload = item.refund_qr_payload;
      let qrImage = null;

      try {
        if (target && liveNetRefund > 0) {
          qrPayload = generatePayload(target, { amount: liveNetRefund });
          qrImage = await qrcode.toDataURL(qrPayload, {
            type: 'image/png',
            errorCorrectionLevel: 'H',
            margin: 2,
            scale: 6
          });
        }
      } catch (qrErr) {
        console.warn('QR generation error for move-out item:', qrErr);
      }

      return {
        ...item,
        unpaid_bills: unpaidBills,
        live_unpaid_total: liveUnpaidTotal,
        live_net_refund: liveNetRefund,
        is_completed_calculated: isCompleted,
        qr_payload: qrPayload,
        qr_image: qrImage
      };
    }));

    return NextResponse.json({ success: true, data: enhanced });
  } catch (error: any) {
    console.error('[GET /api/owner/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    // Allow owner or keeper
    const sql = getDb();
    const body = await req.json();
    const { requestId, refundSlipUrl, note, penaltyAmount } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, message: 'Missing requestId' }, { status: 400 });
    }

    // 1. Fetch move-out request
    const reqRes = await sql`
      SELECT * FROM move_out_requests WHERE id = ${requestId} LIMIT 1
    `;
    if (reqRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการคำร้องขอย้ายออก' }, { status: 404 });
    }
    const moveReq = reqRes[0];

    // Determine deposit from request or contract
    let deposit = Number(moveReq.deposit_amount || 0);
    if (!deposit && moveReq.contract_id) {
      const cRes = await sql`SELECT deposit_amount FROM contracts WHERE id = ${moveReq.contract_id} LIMIT 1`;
      if (cRes.length > 0) deposit = Number(cRes[0].deposit_amount || 0);
    }

    // Calculate live unpaid bills for this tenant at this moment
    const liveUnpaidBills = await sql`
      SELECT id, amount, title, status FROM bills 
      WHERE tenant_id = ${moveReq.tenant_id} AND status != 'paid'
      ORDER BY id ASC
    `;
    const liveUnpaidTotal = liveUnpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);

    const finalPenalty = penaltyAmount !== undefined ? parseFloat(penaltyAmount) : Number(moveReq.penalty_amount || 0);
    const finalNet = Math.max(0, deposit - liveUnpaidTotal - finalPenalty);
    const isDeficit = deposit < (liveUnpaidTotal + finalPenalty);
    const deficitAmount = isDeficit ? (liveUnpaidTotal + finalPenalty) - deposit : 0;

    // 2. Mark move_out_requests as Completed / Refunded with live calculation & audit note
    await sql`
      UPDATE move_out_requests
      SET status = 'Completed',
          refund_slip_url = ${refundSlipUrl || null},
          penalty_amount = ${finalPenalty},
          unpaid_bills_total = ${liveUnpaidTotal},
          deposit_amount = ${deposit},
          net_refund_amount = ${finalNet},
          inspection_notes = ${note || (isDeficit ? `ผู้เช่ามียอดค้างเกินเงินประกัน ฿${deficitAmount.toFixed(2)} ได้รับการตรวจสอบและเคลียร์แล้ว` : null)},
          refunded_at = NOW()
      WHERE id = ${requestId}
    `;

    // 3. Mark contract as Terminated
    if (moveReq.contract_id) {
      await sql`
        UPDATE contracts 
        SET status = 'Terminated' 
        WHERE id = ${moveReq.contract_id}
      `;
    } else {
      await sql`
        UPDATE contracts 
        SET status = 'Terminated' 
        WHERE tenant_id = ${moveReq.tenant_id} AND status IN ('Active', 'Approved')
      `;
    }

    // 4. Free the room (mark as Available)
    if (moveReq.room_id) {
      await sql`
        UPDATE rooms 
        SET status = 'Available' 
        WHERE id = ${moveReq.room_id}
      `;
    }

    // 5. Update tenant status to 'past' and clear room_id
    await sql`
      UPDATE tenants 
      SET status = 'past', 
          room_id = NULL,
          move_out_date = ${moveReq.desired_date || moveReq.move_out_date || new Date().toISOString().split('T')[0]}
      WHERE id = ${moveReq.tenant_id}
    `;

    // 6. Mark unpaid bills as paid (settled through deposit and/or owner confirmation)
    await sql`
      UPDATE bills 
      SET status = 'paid' 
      WHERE tenant_id = ${moveReq.tenant_id} AND status != 'paid'
    `;

    return NextResponse.json({
      success: true,
      message: 'ยืนยันการเคลียร์เงินประกันและปิดสัญญาเรียบร้อยแล้ว ห้องพักกลับมาเป็นสถานะว่างพร้อมปล่อยเช่า',
      data: {
        deposit,
        liveUnpaidTotal,
        finalPenalty,
        finalNet,
        isDeficit,
        deficitAmount
      }
    });

  } catch (error: any) {
    console.error('[POST /api/owner/move-out/confirm]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
