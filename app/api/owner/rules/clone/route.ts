import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { sourceDormId, targetDormId, replaceExisting } = body;

    if (!sourceDormId || !targetDormId) {
      return NextResponse.json({ success: false, message: 'Missing sourceDormId or targetDormId' }, { status: 400 });
    }

    if (sourceDormId === targetDormId) {
      return NextResponse.json({ success: false, message: 'หอพักต้นทางและปลายทางต้องไม่เป็นหอพักเดียวกัน' }, { status: 400 });
    }

    const sql = getDb();

    // Verify owner owns both dorms
    const targetCheck = await sql`
      SELECT id FROM dormitory_registry 
      WHERE id = ${targetDormId} 
        AND (
          owner_id = ${session.user.id} 
          OR owner_email = ${session.user.email} 
          OR owner_id IN (SELECT id FROM users WHERE email = ${session.user.email})
        )
      LIMIT 1
    `;

    if (targetCheck.length === 0) {
      return NextResponse.json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการหอพักปลายทาง' }, { status: 403 });
    }

    // Get rules from source dorm
    const sourceRules = await sql`
      SELECT title, description, category, fine_amount, is_active, sort_order 
      FROM dormitory_rules 
      WHERE dorm_id = ${sourceDormId}
      ORDER BY sort_order ASC, id ASC
    `;

    if (sourceRules.length === 0) {
      return NextResponse.json({ success: false, message: 'หอพักต้นทางยังไม่มีกฎระเบียบที่บันทึกไว้' }, { status: 400 });
    }

    if (replaceExisting) {
      await sql`DELETE FROM dormitory_rules WHERE dorm_id = ${targetDormId}`;
    }

    // Clone into target dorm
    for (const r of sourceRules) {
      await sql`
        INSERT INTO dormitory_rules (
          dorm_id,
          title,
          description,
          category,
          fine_amount,
          is_active,
          sort_order
        ) VALUES (
          ${targetDormId},
          ${r.title},
          ${r.description},
          ${r.category},
          ${r.fine_amount},
          ${r.is_active},
          ${r.sort_order}
        )
      `;
    }

    return NextResponse.json({ 
      success: true, 
      message: `คัดลอกกฎระเบียบจำนวน ${sourceRules.length} ข้อ ไปยังหอพักเป้าหมายเรียบร้อยแล้ว` 
    });
  } catch (error: any) {
    console.error('[API Owner Rules Clone Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
