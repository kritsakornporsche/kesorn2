import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { canViewContract } from '@/lib/contract-files';
import { readRefundFile } from '@/lib/move-out-files';

// GET — the deposit refund slip of a move-out settlement, stored outside public/. Owner, or the contract's own tenant
// (managers do not see refunds). Others get 404.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    const rows = await sql`SELECT contract_id, refund_file FROM move_out_settlements WHERE id = ${Number(id)} LIMIT 1`;
    const row = rows[0];
    const access = row ? await canViewContract(Number(row.contract_id)) : null;
    if (access && !access.ok && access.status === 401) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const file = access?.ok && access.user.role !== 'manager' ? readRefundFile(row.refund_file) : null;
    if (!file) return NextResponse.json({ success: false, message: 'ไม่พบไฟล์' }, { status: 404 });
    return new Response(new Uint8Array(file.bytes), {
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `inline; filename="refund_${Number(id)}.${file.ext}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[GET /api/move-out/[id]/refund-file]', error);
    return NextResponse.json({ success: false, message: 'เปิดไฟล์ไม่สำเร็จ' }, { status: 500 });
  }
}
