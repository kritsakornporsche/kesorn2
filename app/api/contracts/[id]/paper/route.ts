import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { canViewContract, readPaper } from '@/lib/contract-files';

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
