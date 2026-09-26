import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const dormId = parseInt(searchParams.get('dormId') || (session?.user as any)?.dormId || '1', 10);
    const sql = getDb();
    
    const news = await sql`
      SELECT a.*, COALESCE(u.name, 'เจ้าของหอพัก') as author_name 
      FROM announcements a
      LEFT JOIN users u ON a.dorm_id = u.id
      WHERE a.is_active = TRUE AND (a.dorm_id = ${dormId} OR a.dorm_id IS NULL)
      ORDER BY a.is_important DESC, a.created_at DESC
    `;

    return NextResponse.json({ success: true, data: news });
  } catch (error: any) {
    console.error('Announcements GET Error:', error);
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { title, content, category, is_important, dorm_id } = await request.json();
    if (!title || !content) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }

    const targetDormId = parseInt(dorm_id || (session.user as any)?.dormId || '1', 10);
    const sql = getDb();
    const result = await sql`
      INSERT INTO announcements (dorm_id, title, content, category, is_important, is_active)
      VALUES (${targetDormId}, ${title}, ${content}, ${category || 'general'}, ${is_important ? 1 : 0}, 1)
    `;

    // Notify all active tenants of this dormitory
    try {
      const activeTenants = await sql`
        SELECT DISTINCT COALESCE(t.user_id, u.id) as user_id
        FROM tenants t
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE (t.dorm_id = ${targetDormId} OR t.dorm_id IS NULL)
          AND t.status IN ('active', 'Active')
      `;

      for (const t of activeTenants as any[]) {
        if (t.user_id) {
          await sql`
            INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
            VALUES (
              ${t.user_id},
              ${'ประกาศใหม่: ' + title},
              ${content.length > 60 ? content.slice(0, 57) + '...' : content},
              'announcement',
              0,
              '/tenant/announcements',
              NOW()
            )
          `;
        }
      }
    } catch (ne) {
      console.warn('Announcement notify warn:', ne);
    }

    return NextResponse.json({ success: true, data: { id: (result as any).insertId } });
  } catch (error: any) {
    console.error('Announcements POST Error:', error);
    return NextResponse.json({ success: false, message: 'Server Error' }, { status: 500 });
  }
}
