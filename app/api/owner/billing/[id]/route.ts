import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  const { id } = await params;
  const billId = parseInt(id, 10);
  if (isNaN(billId)) {
    return NextResponse.json({ success: false, message: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    const body = await req.json();
    const { status, slip_url, title, amount, due_date } = body;

    if (!status && title === undefined && amount === undefined) {
      return NextResponse.json({ success: false, message: 'No fields to update' }, { status: 400 });
    }

    let normalizedStatus = status;
    if (typeof status === 'string') {
      const lower = status.toLowerCase();
      if (lower === 'paid') normalizedStatus = 'Paid';
      else if (lower === 'unpaid') normalizedStatus = 'Unpaid';
      else if (lower === 'pending') normalizedStatus = 'Pending';
    }

    if (normalizedStatus) {
      if (slip_url !== undefined) {
        await sql`
          UPDATE bills 
          SET status = ${normalizedStatus}, slip_url = ${slip_url}
          WHERE id = ${billId}
        `;
      } else {
        await sql`
          UPDATE bills 
          SET status = ${normalizedStatus}
          WHERE id = ${billId}
        `;
      }
    }

    if (title !== undefined && amount !== undefined && due_date !== undefined) {
      await sql`
        UPDATE bills 
        SET title = ${title}, amount = ${amount}, due_date = ${due_date}
        WHERE id = ${billId}
      `;
    }

    const updatedBills = await sql`
      SELECT b.*, t.name as tenant_name, t.user_id as tenant_user_id, COALESCE(b.room_number, r.room_number) as room_number
      FROM bills b
      LEFT JOIN tenants t ON b.tenant_id = t.id
      LEFT JOIN rooms r ON r.id = t.room_id
      WHERE b.id = ${billId}
      LIMIT 1
    `;

    const currentBill = updatedBills[0];

    // Real-time notification and accounting sync
    if (currentBill && normalizedStatus) {
      const dormId = currentBill.dorm_id || 1;
      const tenantUserId = currentBill.tenant_user_id;

      if (normalizedStatus === 'Paid') {
        // 1. Notify tenant
        if (tenantUserId) {
          try {
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${tenantUserId},
                'การชำระเงินได้รับการอนุมัติแล้ว',
                ${'ยอดชำระบิลรอบ ' + (currentBill.billing_cycle || '-') + ' จำนวน ฿' + Number(currentBill.amount || 0).toLocaleString('th-TH') + ' ได้รับการยืนยันเรียบร้อยแล้ว'},
                'payment_approved',
                0,
                '/tenant/billing',
                NOW()
              )
            `;
          } catch (e) {
            console.warn('[Billing Notification] Warn:', e);
          }
        }

        // 2. Sync to accounting_transactions if not exists
        try {
          const existingTx = await sql`
            SELECT id FROM accounting_transactions
            WHERE reference_id = ${billId} AND reference_type = 'bill'
            LIMIT 1
          `;
          if (existingTx.length === 0) {
            await sql`
              INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, reference_id, reference_type, transaction_date)
              VALUES (
                ${dormId},
                'Income',
                'Rent',
                ${currentBill.amount || 0},
                ${'ชำระบิลห้อง ' + (currentBill.room_number || '-') + ' (' + (currentBill.billing_cycle || '-') + ')'},
                ${billId},
                'bill',
                ${new Date().toISOString().slice(0, 10)}
              )
            `;
          }
        } catch (txErr) {
          console.warn('[Billing Accounting Sync] Warn:', txErr);
        }

      } else if (normalizedStatus === 'Unpaid' && slip_url === null) {
        // Notify tenant about slip rejection
        if (tenantUserId) {
          try {
            await sql`
              INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
              VALUES (
                ${tenantUserId},
                'สลิปการชำระเงินถูกปฏิเสธ',
                ${'สลิปการชำระเงินบิลประจำรอบ ' + (currentBill.billing_cycle || '-') + ' ไม่ผ่านการตรวจสอบ กรุณาอัปโหลดสลิปใหม่อีกครั้ง'},
                'payment_rejected',
                0,
                '/tenant/billing',
                NOW()
              )
            `;
          } catch (e) {
            console.warn('[Billing Reject Notification] Warn:', e);
          }
        }
      }
    }

    return NextResponse.json({ success: true, data: currentBill || { id: billId, status: normalizedStatus } });
  } catch (err: any) {
    console.error('[Billing API PUT] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  const { id } = await params;
  const billId = parseInt(id, 10);
  if (isNaN(billId)) {
    return NextResponse.json({ success: false, message: 'Invalid bill ID' }, { status: 400 });
  }

  try {
    await sql`DELETE FROM bills WHERE id = ${billId}`;
    return NextResponse.json({ success: true, message: 'Bill deleted successfully' });
  } catch (err: any) {
    console.error('[Billing API DELETE] Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

