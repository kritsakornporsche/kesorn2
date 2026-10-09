import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import generatePayload from 'promptpay-qr';
import qrcode from 'qrcode';

// GET: Fetch move-out requests with latest meter readings, contract info, and settlement breakdown
export async function GET(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin') {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    const sql = getDb();
    const { searchParams } = new URL(req.url);
    const dormId = searchParams.get('dormId') || (session?.user as any)?.dormId || 1;

    // Fetch move-out requests with tenant, room, and contract details
    // Fetch move-out requests with tenant, room, and contract details
    const requests = await sql`
      SELECT 
        mor.*,
        t.name as tenant_name,
        t.phone as tenant_phone,
        t.email as tenant_email,
        t.id_card_number as tenant_id_card,
        t.user_id,
        COALESCE(r.id, c.room_id, t.room_id) as resolved_room_id,
        COALESCE(r.room_number, cr.room_number, tr.room_number, '-') as room_number,
        COALESCE(r.room_type, cr.room_type, tr.room_type, 'ห้องพักมาตรฐาน') as room_type,
        COALESCE(r.price, cr.price, tr.price, 3400.00) as room_price,
        COALESCE(r.floor, cr.floor, tr.floor, 1) as floor,
        COALESCE(r.status, cr.status, tr.status, 'Occupied') as current_room_status,
        c.start_date as contract_start_date,
        c.end_date as contract_end_date,
        c.deposit_amount as contract_deposit_amount,
        c.status as contract_status
      FROM move_out_requests mor
      LEFT JOIN tenants t ON mor.tenant_id = t.id
      LEFT JOIN contracts c ON c.id = COALESCE(mor.contract_id, (SELECT id FROM contracts WHERE tenant_id = mor.tenant_id ORDER BY id DESC LIMIT 1))
      LEFT JOIN rooms r ON mor.room_id = r.id
      LEFT JOIN rooms cr ON c.room_id = cr.id
      LEFT JOIN rooms tr ON t.room_id = tr.id
      ORDER BY mor.id DESC
    `;

    // Process each request with latest meter reading and dynamic QR
    const enhanced = await Promise.all(requests.map(async (item: any) => {
      const targetRoomId = item.resolved_room_id || item.room_id;

      // 1. Fetch previous electricity meter reading for this room
      let prevMeterReading = 0;
      if (targetRoomId) {
        const lastMeter = await sql`
          SELECT current_reading, billing_cycle, created_at 
          FROM meter_readings 
          WHERE room_id = ${targetRoomId} AND type = 'Electricity'
          ORDER BY billing_cycle DESC, id DESC 
          LIMIT 1
        `;
        if (lastMeter.length > 0 && lastMeter[0].current_reading !== null) {
          prevMeterReading = Number(lastMeter[0].current_reading);
        }
      }

      // 2. Fetch unpaid bills (excluding first bills if any)
      const unpaidBills = await sql`
        SELECT id, title, amount, billing_cycle, created_at, status
        FROM bills
        WHERE tenant_id = ${item.tenant_id} AND status NOT IN ('Paid', 'paid', 'Cancelled')
        ORDER BY id ASC
      `;
      const liveUnpaidTotal = unpaidBills.reduce((sum: number, b: any) => sum + Number(b.amount || 0), 0);

      // Check if early move out
      const contractEndDate = item.contract_end_date ? new Date(item.contract_end_date) : null;
      const desiredDate = item.desired_date ? new Date(item.desired_date) : (item.move_out_date ? new Date(item.move_out_date) : new Date());
      const isEarly = contractEndDate ? (desiredDate.getTime() < contractEndDate.getTime() - (24 * 60 * 60 * 1000)) : false;

      // Calculate PromptPay QR for tenant payment or owner refund
      let qrImage = null;
      if (item.settlement_type === 'OwnerRefund' && item.net_refund_amount > 0) {
        const target = (item.promptpay_target || item.tenant_phone || item.tenant_id_card || '').replace(/[\s-]/g, '');
        if (target) {
          try {
            const payload = generatePayload(target, { amount: Number(item.net_refund_amount) });
            qrImage = await qrcode.toDataURL(payload, { type: 'image/png', margin: 2, scale: 6 });
          } catch (e) {}
        }
      } else if ((item.settlement_type === 'TenantPay' || item.move_out_type === 'Early') && item.total_expenses > 0) {
        const ownerPhone = '0812345678';
        try {
          const payAmt = item.move_out_type === 'Early' ? Number(item.total_expenses) : Math.max(0, Number(item.total_expenses) - 3000);
          if (payAmt > 0) {
            const payload = generatePayload(ownerPhone, { amount: payAmt });
            qrImage = await qrcode.toDataURL(payload, { type: 'image/png', margin: 2, scale: 6 });
          }
        } catch (e) {}
      }

      return {
        ...item,
        is_early_calculated: isEarly,
        prev_meter_reading: prevMeterReading,
        unpaid_bills: unpaidBills,
        live_unpaid_total: liveUnpaidTotal,
        qr_image: qrImage
      };
    }));

    return NextResponse.json({ success: true, data: enhanced });
  } catch (error: any) {
    console.error('[GET /api/owner/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST: Process Meter Inspection & Move-Out Calculation (Rule 16.1)
export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin') {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    const sql = getDb();
    const body = await req.json();

    const {
      requestId,
      electricPrevUnit,
      electricNewUnit,
      extraDamageAmount,
      extraDamageNote,
      readyToOccupyDate,
      forceComplete
    } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, message: 'Missing requestId' }, { status: 400 });
    }

    // 1. Fetch move-out request
    const reqRes = await sql`
      SELECT mor.*, c.start_date, c.end_date, c.deposit_amount as c_deposit, r.price as room_price, r.dorm_id, r.room_number, t.user_id, t.email as t_email, t.name as tenant_name
      FROM move_out_requests mor
      LEFT JOIN contracts c ON c.id = COALESCE(mor.contract_id, (SELECT id FROM contracts WHERE tenant_id = mor.tenant_id ORDER BY id DESC LIMIT 1))
      LEFT JOIN rooms r ON mor.room_id = r.id
      LEFT JOIN tenants t ON mor.tenant_id = t.id
      WHERE mor.id = ${requestId} LIMIT 1
    `;
    if (reqRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการคำร้องขอย้ายออก' }, { status: 404 });
    }
    const moveReq = reqRes[0];

    // 2. Determine Move-out Type (Early vs Normal)
    const desiredDate = moveReq.desired_date ? new Date(moveReq.desired_date) : (moveReq.move_out_date ? new Date(moveReq.move_out_date) : new Date());
    const contractEndDate = moveReq.end_date ? new Date(moveReq.end_date) : null;
    const isEarly = contractEndDate ? (desiredDate.getTime() < contractEndDate.getTime() - (24 * 60 * 60 * 1000)) : false;
    const moveOutType = isEarly ? 'Early' : 'Normal';

    // 3. Calculate Utilities & Expenses (Full Month Rent Rule)
    const prevUnit = parseFloat(electricPrevUnit || 0);
    const newUnit = parseFloat(electricNewUnit || 0);
    const unitsUsed = Math.max(0, newUnit - prevUnit);
    const electricAmount = Number((unitsUsed * 4.88).toFixed(2));
    const waterAmount = 100.00; // Flat 100 THB
    const commonFee = 150.00;   // Flat 150 THB
    const roomRentAmount = Number(moveReq.room_price || 0); // Full month rent
    const extraDamage = parseFloat(extraDamageAmount || 0);

    // Fetch unpaid bills total
    const unpaidBillsRes = await sql`
      SELECT COALESCE(SUM(amount), 0) as total 
      FROM bills 
      WHERE tenant_id = ${moveReq.tenant_id} AND status NOT IN ('Paid', 'paid', 'Cancelled')
    `;
    const unpaidBillsTotal = Number(unpaidBillsRes[0]?.total || 0);

    // Total Expenses
    const totalExpenses = Number((roomRentAmount + electricAmount + waterAmount + commonFee + extraDamage + unpaidBillsTotal).toFixed(2));

    // 4. Financial Settlement Strategy (Rule 16.1.1 vs 16.1.2)
    let settlementType: 'OwnerRefund' | 'TenantPay' | 'ZeroBalance' = 'ZeroBalance';
    let netRefundAmount = 0;
    let newSettlementStatus: 'PendingMeter' | 'PendingPayment' | 'Completed' = 'PendingPayment';
    let newReqStatus = 'Approved';

    if (moveOutType === 'Early') {
      // 16.1.1: No deposit refund (deposit seized), tenant pays final expense bill
      settlementType = 'TenantPay';
      netRefundAmount = 0;
      newSettlementStatus = totalExpenses === 0 ? 'Completed' : 'PendingPayment';
    } else {
      // 16.1.2: Deposit 3,000 THB applied against total expenses
      const depositBase = 3000.00;
      if (totalExpenses < depositBase) {
        // Owner must refund remaining deposit
        settlementType = 'OwnerRefund';
        netRefundAmount = Number((depositBase - totalExpenses).toFixed(2));
        newSettlementStatus = 'PendingPayment';
      } else if (totalExpenses > depositBase) {
        // Tenant must pay extra amount
        settlementType = 'TenantPay';
        netRefundAmount = 0;
        newSettlementStatus = 'PendingPayment';
      } else {
        // Exactly 0 balance -> Jump straight to 16.3 Completed
        settlementType = 'ZeroBalance';
        netRefundAmount = 0;
        newSettlementStatus = 'Completed';
        newReqStatus = 'Completed';
      }
    }

    if (forceComplete) {
      newSettlementStatus = 'Completed';
      newReqStatus = 'Completed';
    }

    // 5. Update Move Out Request
    await sql`
      UPDATE move_out_requests
      SET 
        move_out_type = ${moveOutType},
        electric_prev_unit = ${prevUnit},
        electric_new_unit = ${newUnit},
        electric_units_used = ${unitsUsed},
        electric_amount = ${electricAmount},
        water_amount = ${waterAmount},
        common_fee = ${commonFee},
        room_rent_amount = ${roomRentAmount},
        extra_damage_amount = ${extraDamage},
        extra_damage_note = ${extraDamageNote || null},
        total_expenses = ${totalExpenses},
        unpaid_bills_total = ${unpaidBillsTotal},
        net_refund_amount = ${netRefundAmount},
        ready_to_occupy_date = ${readyToOccupyDate || null},
        settlement_type = ${settlementType},
        settlement_status = ${newSettlementStatus},
        status = ${newReqStatus}
      WHERE id = ${requestId}
    `;

    // 6. If Tenant Must Pay (Early Move-Out OR Normal Move-Out with insufficient deposit), auto-generate final settlement bill in bills table
    const tenantMustPayAmount = moveOutType === 'Early' ? totalExpenses : Math.max(0, totalExpenses - 3000.00);
    if ((settlementType === 'TenantPay' || moveOutType === 'Early') && tenantMustPayAmount > 0) {
      const currentCycle = new Date().toISOString().substring(0, 7);
      const billTitle = moveOutType === 'Early' 
        ? `บิลค่าใช้จ่ายรอบสุดท้ายก่อนย้ายออก (ย้ายออกก่อนกำหนด)` 
        : `บิลค่าใช้จ่ายส่วนต่างหลังหักเงินประกัน (ย้ายออกตามกำหนด)`;
      
      // Give tenant 3-5 days grace period to pay the final move-out bill
      const gracePeriod = new Date();
      gracePeriod.setDate(gracePeriod.getDate() + 3);
      const dueDateStr = readyToOccupyDate ? new Date(readyToOccupyDate).toISOString().slice(0, 10) : gracePeriod.toISOString().slice(0, 10);

      // Check if an unpaid move_out bill already exists for this tenant
      const existingMoveOutBill = await sql`
        SELECT id FROM bills 
        WHERE tenant_id = ${moveReq.tenant_id} 
          AND bill_type = 'move_out_settlement' 
          AND status NOT IN ('Paid', 'paid', 'Cancelled')
        LIMIT 1
      `;

      if (existingMoveOutBill.length > 0) {
        // Update the existing bill
        await sql`
          UPDATE bills 
          SET 
            amount = ${tenantMustPayAmount},
            title = ${billTitle},
            room_amount = ${roomRentAmount},
            water_amount = ${waterAmount},
            electric_amount = ${electricAmount},
            water_units = 1.00,
            electric_units = ${unitsUsed},
            common_fee = ${commonFee},
            due_date = ${dueDateStr}
          WHERE id = ${existingMoveOutBill[0].id}
        `;
      } else {
        // Create a new move_out settlement bill
        await sql`
          INSERT INTO bills (
            tenant_id, dorm_id, room_number, title, amount, billing_cycle,
            due_date, status, bill_type, room_amount, water_units,
            electric_units, water_amount, electric_amount, common_fee, created_at
          )
          VALUES (
            ${moveReq.tenant_id}, ${moveReq.dorm_id || 1}, ${moveReq.room_number || '-'}, ${billTitle}, ${tenantMustPayAmount}, ${currentCycle},
            ${dueDateStr}, 'Unpaid', 'move_out_settlement', ${roomRentAmount}, 1.00,
            ${unitsUsed}, ${waterAmount}, ${electricAmount}, ${commonFee}, NOW()
          )
        `;
      }

      // Send notification to tenant
      if (moveReq.user_id) {
        try {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${moveReq.user_id},
              'เจ้าของหอพักได้ส่งบิลค่าใช้จ่ายรอบสุดท้ายให้ท่านแล้ว',
              ${`บิลค่าใช้จ่ายปิดห้องพัก (${billTitle}) ยอดรวม ฿${tenantMustPayAmount.toLocaleString()} บาท กรุณาตรวจสอบและชำระเงิน`},
              'bill_created',
              0,
              '/tenant/billing',
              NOW()
            )
          `;
        } catch (notifErr) {
          console.warn('Tenant bill notification warn:', notifErr);
        }
      }
    }

    // 7. Mark contract as 'MoveOutPending' to prevent regular billing portal duplication (Rule 16.1)
    if (moveReq.contract_id) {
      await sql`
        UPDATE contracts 
        SET status = ${newReqStatus === 'Completed' ? 'Completed' : 'MoveOutPending'}
        WHERE id = ${moveReq.contract_id}
      `;
    }

    // 7. Record final meter reading to meter_readings table
    const targetRoomId = moveReq.room_id || moveReq.resolved_room_id;
    if (newUnit > 0 && targetRoomId) {
      try {
        const currentCycle = new Date().toISOString().substring(0, 7);
        await sql`
          INSERT INTO meter_readings (dorm_id, room_id, type, billing_cycle, previous_reading, current_reading, units_used, created_at)
          VALUES (1, ${targetRoomId}, 'Electricity', ${currentCycle}, ${prevUnit}, ${newUnit}, ${unitsUsed}, NOW())
        `;
      } catch (mErr) {
        console.warn('Final meter recording warn:', mErr);
      }
    }

    // 8. If Auto-Completed or ZeroBalance, execute Rule 16.3 / 16.4 / 16.5 lifecycle
    if (newReqStatus === 'Completed') {
      await executeMoveOutCompletion(sql, moveReq, readyToOccupyDate);
    }

    return NextResponse.json({
      success: true,
      message: 'บันทึกการจดมิเตอร์และคำนวณยอดปิดการย้ายออกเรียบร้อยแล้ว',
      data: {
        moveOutType,
        settlementType,
        settlementStatus: newSettlementStatus,
        totalExpenses,
        netRefundAmount
      }
    });
  } catch (error: any) {
    console.error('[POST /api/owner/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT: Owner Uploads Refund Slip or Confirms Tenant Payment (Rule 16.2 -> 16.3)
export async function PUT(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin') {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }
    const sql = getDb();
    const body = await req.json();
    const { requestId, refundSlipUrl, note, readyToOccupyDate } = body;

    if (!requestId) {
      return NextResponse.json({ success: false, message: 'Missing requestId' }, { status: 400 });
    }

    const reqRes = await sql`
      SELECT mor.*, t.user_id, t.email as t_email
      FROM move_out_requests mor
      LEFT JOIN tenants t ON mor.tenant_id = t.id
      WHERE mor.id = ${requestId} LIMIT 1
    `;
    if (reqRes.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบรายการคำร้องขอย้ายออก' }, { status: 404 });
    }
    const moveReq = reqRes[0];

    const targetReadyDate = readyToOccupyDate || moveReq.ready_to_occupy_date || null;

    // Mark as Completed
    await sql`
      UPDATE move_out_requests
      SET 
        status = 'Completed',
        settlement_status = 'Completed',
        refund_slip_url = ${refundSlipUrl || moveReq.refund_slip_url || null},
        inspection_notes = ${note || moveReq.inspection_notes || null},
        refunded_at = NOW(),
        ready_to_occupy_date = ${targetReadyDate}
      WHERE id = ${requestId}
    `;

    // Execute complete teardown & role downgrade (Rule 16.3, 16.4, 16.5)
    await executeMoveOutCompletion(sql, moveReq, targetReadyDate);

    return NextResponse.json({
      success: true,
      message: 'ปิดจบขั้นตอนการย้ายออกสมบูรณ์แล้ว'
    });
  } catch (error: any) {
    console.error('[PUT /api/owner/move-out]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Helper: Execute Move-Out Finalization (Rule 16.3, 16.4, 16.5)
async function executeMoveOutCompletion(sql: any, moveReq: any, readyDate: string | null) {
  // 1. Contract marked as Completed / Terminated
  if (moveReq.contract_id) {
    await sql`UPDATE contracts SET status = 'Completed' WHERE id = ${moveReq.contract_id}`;
  } else {
    await sql`UPDATE contracts SET status = 'Completed' WHERE tenant_id = ${moveReq.tenant_id} AND status IN ('Active', 'MoveOutPending')`;
  }

  // 2. Room status set to 'Maintenance' with ready_to_occupy_date (Rule 16.3, 16.4)
  if (moveReq.room_id) {
    await sql`
      UPDATE rooms 
      SET status = 'Maintenance', 
          ready_to_occupy_date = ${readyDate || null},
          tenant_id = NULL
      WHERE id = ${moveReq.room_id}
    `;
  }

  // 3. Mark existing unpaid bills as Paid / Settled
  await sql`
    UPDATE bills 
    SET status = 'Paid' 
    WHERE tenant_id = ${moveReq.tenant_id} AND status NOT IN ('Paid', 'paid', 'Cancelled')
  `;

  // 4. Update tenant status to 'past'
  await sql`
    UPDATE tenants 
    SET status = 'past', 
        room_id = NULL,
        move_out_date = ${moveReq.desired_date || moveReq.move_out_date || new Date().toISOString().split('T')[0]}
    WHERE id = ${moveReq.tenant_id}
  `;

  // 5. Downgrade user role to 'guest' in MySQL (Rule 16.5)
  if (moveReq.user_id) {
    await sql`UPDATE users SET role = 'guest', primary_role = 'guest' WHERE id = ${moveReq.user_id}`;
  } else if (moveReq.t_email) {
    await sql`UPDATE users SET role = 'guest', primary_role = 'guest' WHERE email = ${moveReq.t_email}`;
  }

  // 6. Record in accounting_transactions if there is refund or income
  if (moveReq.settlement_type === 'OwnerRefund' && moveReq.net_refund_amount > 0) {
    try {
      await sql`
        INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
        VALUES (
          1, 'Expense', 'Deposit Refund',
          ${moveReq.net_refund_amount},
          ${'คืนเงินประกันห้อง ' + (moveReq.room_id || '-') + ' (คำร้อง #' + moveReq.id + ')'},
          ${moveReq.id}, 'move_out_refund', ${new Date().toISOString().slice(0, 10)}
        )
      `;
    } catch (e) {}
  }
}
