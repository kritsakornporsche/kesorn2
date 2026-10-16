import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { canViewJobPhoto } from '@/lib/maintenance';
import { readPhoto } from '@/lib/maintenance-files';

// GET — a repair / cleaning photo, stored outside public/. Owner/manager, the tenant of the job, or the keeper who can
// see the job; the file must belong to this job. Others get 404.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const { id, file } = await params;
    const photo = (await canViewJobPhoto(user, Number(id), file)) ? readPhoto(file) : null;
    if (!photo) return NextResponse.json({ success: false, message: 'ไม่พบรูป' }, { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: { 'Content-Type': photo.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error: any) {
    console.error('[GET /api/maintenance/[id]/photo]', error);
    return NextResponse.json({ success: false, message: 'เปิดรูปไม่สำเร็จ' }, { status: 500 });
  }
}
