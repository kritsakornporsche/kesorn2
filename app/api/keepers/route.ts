import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;
  const sql = getDb();

  try {
    const { searchParams } = new URL(request.url);
    const dormId = parseInt(searchParams.get('dormId') || (session.user as any)?.dormId || '1', 10);

    const keepers = await sql`
      SELECT * FROM keepers 
      WHERE dorm_id = ${dormId}
      ORDER BY id ASC
    `;

    return NextResponse.json({ success: true, data: keepers });
  } catch (error: any) {
    console.error('[Keepers GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;
  const sql = getDb();

  try {
    const body = await request.json();
    const { name, email, phone, position, dorm_id, password } = body;

    if (!name || !position) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const targetDormId = parseInt(dorm_id || (session.user as any)?.dormId || '1', 10);
    const result = await sql`
      INSERT INTO keepers (name, email, phone, position, dorm_id)
      VALUES (${name}, ${email || null}, ${phone || null}, ${position}, ${targetDormId})
    `;

    return NextResponse.json({ success: true, message: 'Keeper added successfully', data: { id: (result as any).insertId } });
  } catch (error: any) {
    console.error('[Keepers POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
