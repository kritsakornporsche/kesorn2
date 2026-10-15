import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/authz';
import { canViewMeterPhoto } from '@/lib/meters';
import { readMeterPhoto } from '@/lib/meter-files';

// GET — a meter photo, stored outside public/ (storage/meters). Owner/manager, or the tenant billed for that room and
// cycle. Others get 404.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ success: false, message: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  try {
    const { id } = await params;
    const file = await canViewMeterPhoto(user, Number(id));
    const photo = file ? readMeterPhoto(file) : null;
    if (!photo) return NextResponse.json({ success: false, message: 'ไม่พบรูป' }, { status: 404 });
    return new Response(new Uint8Array(photo.bytes), {
      headers: { 'Content-Type': photo.contentType, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  } catch (error: any) {
    console.error('[GET /api/meters/[id]/photo]', error);
    return NextResponse.json({ success: false, message: 'เปิดรูปไม่สำเร็จ' }, { status: 500 });
  }
}
