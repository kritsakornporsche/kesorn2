import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { canViewContract, readPaper, deletePaper } from '@/lib/contract-files';
import { requireRole } from '@/lib/authz';

// GET — the signed paper contract, stored outside public/. Owner/manager, or the contract's own tenant.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const contractId = Number(id);
    const access = await canViewContract(contractId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่พบไฟล์สัญญา' }, { status: access.status });
    }

    const sql = getDb();
    const rows = await sql`SELECT contract_file_url FROM contracts WHERE id = ${contractId} LIMIT 1`;
    const file = readPaper(rows[0]?.contract_file_url);
    if (!file) {
      return NextResponse.json({ success: false, message: 'ไม่พบไฟล์สัญญา' }, { status: 404 });
    }

    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `inline; filename="contract_${contractId}.${file.ext}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[Contract paper GET Error]', error);
    return NextResponse.json({ success: false, message: 'เปิดไฟล์สัญญาไม่สำเร็จ' }, { status: 500 });
  }
}

// DELETE — remove the signed paper contract file and reset paper fields in contracts
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const guard = await requireRole(['owner', 'manager']);
    if ('response' in guard) return guard.response;

    const { id } = await params;
    const contractId = Number(id);
    if (!contractId || contractId <= 0) {
      return NextResponse.json({ success: false, message: 'รหัสสัญญาไม่ถูกต้อง' }, { status: 400 });
    }

    const sql = getDb();
    const rows = await sql`
      SELECT id, status, contract_file_url, move_in_bill_id 
      FROM contracts 
      WHERE id = ${contractId} 
      LIMIT 1
    `;
    if (rows.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบสัญญา' }, { status: 404 });
    }

    const contract = rows[0];
    if (contract.status === 'Active') {
      return NextResponse.json({ success: false, message: 'ไม่สามารถลบสัญญาที่มีผลใช้งานแล้ว' }, { status: 400 });
    }

    if (contract.contract_file_url) {
      deletePaper(contract.contract_file_url);
    }

    await sql`
      UPDATE contracts 
      SET contract_file_url = NULL, 
          paper_signed_date = NULL, 
          paper_uploaded_at = NULL, 
          paper_uploaded_by = NULL 
      WHERE id = ${contractId}
    `;

    return NextResponse.json({
      success: true,
      message: 'ลบไฟล์สัญญาที่ลงนามเรียบร้อยแล้ว',
    });
  } catch (error: any) {
    console.error('[Contract paper DELETE Error]', error);
    return NextResponse.json({ success: false, message: 'ลบไฟล์สัญญาไม่สำเร็จ: ' + error.message }, { status: 500 });
  }
}
