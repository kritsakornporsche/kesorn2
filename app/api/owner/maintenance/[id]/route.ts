import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session || !session.user) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const resolvedParams = await params;
    const { id } = resolvedParams;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing maintenance ID' }, { status: 400 });
    }

    const body = await req.json();
    const { status } = body;

    if (!status) {
      return NextResponse.json({ success: false, message: 'Missing new status' }, { status: 400 });
    }

    await sql`
      UPDATE maintenance_requests
      SET status = ${status}
      WHERE id = ${id}
    `;

    const updated = await sql`SELECT * FROM maintenance_requests WHERE id = ${id} LIMIT 1`;

    return NextResponse.json({ success: true, data: updated[0] || { id, status } });
  } catch (err: any) {
    console.error('[Maintenance API PUT]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
