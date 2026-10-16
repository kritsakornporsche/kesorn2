import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { canViewContract } from '@/lib/contract-files';
import { getContractParty } from '@/lib/billing';
import { getInspection } from '@/lib/inspections';

// GET ?kind=move_in — data of the printable room inspection sheet (attachment to the contract).
// Same access as the contract file: owner/manager, or the contract's own tenant (others 404).
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contractId = Number(id);
    const access = await canViewContract(contractId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่พบสัญญา' }, { status: access.status });
    }
    const kind = new URL(req.url).searchParams.get('kind') === 'move_out' ? 'move_out' : 'move_in';
    const sql = getDb();
    const rows = await sql`
      SELECT c.id, c.start_date, c.end_date, r.room_number, r.floor, t.name AS tenant_name
      FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = ${contractId} LIMIT 1
    `;
    if (rows.length === 0) return NextResponse.json({ success: false, message: 'ไม่พบสัญญา' }, { status: 404 });
    const inspection = await getInspection(contractId, kind);
    return NextResponse.json({ success: true, kind, contract: rows[0], party: await getContractParty(sql), inspection });
  } catch (error) {
    console.error('[Inspection sheet GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดใบตรวจสภาพห้องไม่สำเร็จ' }, { status: 500 });
  }
}
