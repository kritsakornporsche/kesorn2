import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: Request) {
  try {
    const session = await auth();
    const role = (session?.user as any)?.role;
    if (!session?.user || (role !== 'owner' && role !== 'keeper' && role !== 'platform_admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized: เฉพาะเจ้าของหอพัก' }, { status: 401 });
    }
    const body = await req.json();
    const { contract_id, new_end_date, deposit_amount, contract_file_url } = body;

    if (!contract_id || !new_end_date) {
      return NextResponse.json({ 
        success: false, 
        message: 'กรุณาระบุรหัสสัญญาและกำหนดวันสิ้นสุดสัญญาฉบับต่ออายุใหม่' 
      }, { status: 400 });
    }

    const sql = getDb();

    // 1. Fetch existing contract
    const existingContracts = await sql`
      SELECT * FROM contracts WHERE id = ${contract_id} LIMIT 1
    `;

    if (existingContracts.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเดิมในระบบ' }, { status: 404 });
    }

    const oldContract = existingContracts[0];

    // 2. Mark old contract as 'Renewed' and clear renewal flag
    await sql`
      UPDATE contracts 
      SET status = 'Renewed', renewal_requested = 0 
      WHERE id = ${contract_id}
    `;

    // 3. Create new contract entry linked via parent_contract_id
    const startDate = oldContract.end_date 
      ? new Date(oldContract.end_date).toISOString().split('T')[0] 
      : new Date().toISOString().split('T')[0];

    const finalFileUrl = contract_file_url || oldContract.contract_file_url || null;
    const finalDeposit = deposit_amount !== undefined ? deposit_amount : oldContract.deposit_amount;

    const newContractRes = await sql`
      INSERT INTO contracts (
        tenant_id, room_id, start_date, end_date, deposit_amount, status, contract_file_url, parent_contract_id, id_card_number, tenant_address, id_card_image
      )
      VALUES (
        ${oldContract.tenant_id}, ${oldContract.room_id}, ${startDate}, ${new_end_date}, ${finalDeposit}, 'Active', ${finalFileUrl}, ${contract_id}, ${oldContract.id_card_number || null}, ${oldContract.tenant_address || null}, ${oldContract.id_card_image || null}
      )
    `;

    const newContractId = (newContractRes as any).insertId;

    // 4. Ensure room remains Occupied
    if (oldContract.room_id) {
      await sql`UPDATE rooms SET status = 'Occupied' WHERE id = ${oldContract.room_id}`;
    }

    // 5. Notify tenant
    try {
      const tenantUser = await sql`
        SELECT COALESCE(t.user_id, u.id) as user_id 
        FROM tenants t 
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE t.id = ${oldContract.tenant_id} 
        LIMIT 1
      `;
      if (tenantUser.length > 0 && tenantUser[0].user_id) {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${tenantUser[0].user_id},
            'การต่ออายุสัญญาเช่าสำเร็จแล้ว',
            ${'สัญญาเช่าฉบับใหม่ได้รับการอนุมัติแล้ว ขยายระยะเวลาถึงวันที่ ' + new Date(new_end_date).toLocaleDateString('th-TH')},
            'contract_renewal_approved',
            0,
            '/tenant/contract',
            NOW()
          )
        `;
      }
    } catch (ne) {
      console.warn('Renewal tenant notify warn:', ne);
    }

    return NextResponse.json({
      success: true,
      message: 'ต่ออายุสัญญาเช่าและบันทึกเอกสารสัญญาฉบับใหม่สำเร็จเรียบร้อยแล้ว',
      newContractId
    });
  } catch (err: any) {
    console.error('[Contract Renewal API Error]:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
