import { NextResponse } from 'next/server';
import { canViewContract } from '@/lib/contract-files';
import { readPhoto } from '@/lib/inspection-files';
import { photoBelongsTo } from '@/lib/inspections';

// GET — a room inspection photo, stored outside public/. Owner/manager, or the contract's own tenant; the file must
// belong to this contract's inspection (a file name from another contract is not found).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  try {
    const { id, file } = await params;
    const contractId = Number(id);
    const access = await canViewContract(contractId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่พบรูป' }, { status: access.status });
    }
    const photo = (await photoBelongsTo(contractId, file)) ? readPhoto(file) : null;
    if (!photo) return NextResponse.json({ success: false, message: 'ไม่พบรูป' }, { status: 404 });

    return new Response(new Uint8Array(photo.bytes), {
      headers: {
        'Content-Type': photo.contentType,
        'Content-Disposition': `inline; filename="inspection_${contractId}_${file}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    console.error('[Inspection photo GET Error]', error);
    return NextResponse.json({ success: false, message: 'เปิดรูปไม่สำเร็จ' }, { status: 500 });
  }
}
