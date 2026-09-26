import { auth } from '@/auth';
import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';

// Helper to check dorm ownership
async function verifyDormOwner(sql: any, user: any, dormId: number) {
  const rows = await sql`
    SELECT id FROM dormitory_registry 
    WHERE id = ${dormId} 
      AND (
        owner_id = ${user.id} 
        OR owner_email = ${user.email} 
        OR owner_id IN (SELECT id FROM users WHERE email = ${user.email})
      )
    LIMIT 1
  `;
  return rows.length > 0;
}

// GET: Fetch rules for a dormitory
export async function GET(req: Request) {
  try {
    const session = await auth();
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId');
    const dormId = dormIdParam ? parseInt(dormIdParam, 10) : ((session?.user as any)?.dormId ? parseInt((session?.user as any).dormId, 10) : 1);
    const sql = getDb();

    // Query rules ordered by category and sort_order
    const rules = await sql`
      SELECT 
        id, 
        dorm_id, 
        title, 
        description, 
        category, 
        fine_amount, 
        is_active, 
        sort_order, 
        created_at, 
        updated_at
      FROM dormitory_rules
      WHERE dorm_id = ${dormId}
      ORDER BY 
        CASE category
          WHEN 'ความปลอดภัย' THEN 1
          WHEN 'การเข้า-ออก' THEN 2
          WHEN 'ความสะอาด' THEN 3
          WHEN 'สัตว์เลี้ยง' THEN 4
          WHEN 'การใช้เสียง' THEN 5
          ELSE 6
        END ASC,
        sort_order ASC,
        id ASC
    `;

    return NextResponse.json({ success: true, data: rules });
  } catch (error: any) {
    console.error('[API Owner Rules GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// POST: Add a new rule
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { dormId, title, description, category, fineAmount, isActive, sortOrder } = body;

    if (!dormId || !title || !description) {
      return NextResponse.json({ success: false, message: 'กรุณากรอกหัวข้อและรายละเอียดกฎระเบียบ' }, { status: 400 });
    }

    const sql = getDb();
    const isOwner = await verifyDormOwner(sql, session.user, dormId);
    if (!isOwner) {
      return NextResponse.json({ success: false, message: 'คุณไม่มีสิทธิ์จัดการหอพักนี้' }, { status: 403 });
    }

    const result = await sql`
      INSERT INTO dormitory_rules (
        dorm_id,
        title,
        description,
        category,
        fine_amount,
        is_active,
        sort_order
      ) VALUES (
        ${dormId},
        ${title},
        ${description},
        ${category || 'ทั่วไป'},
        ${fineAmount !== undefined ? Number(fineAmount) : 0},
        ${isActive !== undefined ? (isActive ? 1 : 0) : 1},
        ${sortOrder !== undefined ? Number(sortOrder) : 0}
      )
    `;

    return NextResponse.json({ 
      success: true, 
      message: 'เพิ่มกฎระเบียบหอพักเรียบร้อยแล้ว',
      insertId: result.insertId || null
    });
  } catch (error: any) {
    console.error('[API Owner Rules POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// PUT: Update an existing rule
export async function PUT(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { id, title, description, category, fineAmount, isActive, sortOrder } = body;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Missing rule ID' }, { status: 400 });
    }

    const sql = getDb();
    
    // Find rule and check ownership
    const ruleRows = await sql`SELECT dorm_id FROM dormitory_rules WHERE id = ${id} LIMIT 1`;
    if (ruleRows.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบกฎระเบียบที่ระบุ' }, { status: 404 });
    }

    const isOwner = await verifyDormOwner(sql, session.user, ruleRows[0].dorm_id);
    if (!isOwner) {
      return NextResponse.json({ success: false, message: 'คุณไม่มีสิทธิ์แก้ไขกฎระเบียบนี้' }, { status: 403 });
    }

    await sql`
      UPDATE dormitory_rules
      SET 
        title = COALESCE(${title}, title),
        description = COALESCE(${description}, description),
        category = COALESCE(${category}, category),
        fine_amount = ${fineAmount !== undefined ? Number(fineAmount) : sql`fine_amount`},
        is_active = ${isActive !== undefined ? (isActive ? 1 : 0) : sql`is_active`},
        sort_order = ${sortOrder !== undefined ? Number(sortOrder) : sql`sort_order`},
        updated_at = NOW()
      WHERE id = ${id}
    `;

    return NextResponse.json({ success: true, message: 'บันทึกการแก้ไขกฎระเบียบเรียบร้อยแล้ว' });
  } catch (error: any) {
    console.error('[API Owner Rules PUT Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// DELETE: Remove a rule
export async function DELETE(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const ruleId = searchParams.get('id');

    if (!ruleId) {
      return NextResponse.json({ success: false, message: 'Missing rule ID' }, { status: 400 });
    }

    const sql = getDb();
    const ruleRows = await sql`SELECT dorm_id FROM dormitory_rules WHERE id = ${ruleId} LIMIT 1`;
    if (ruleRows.length === 0) {
      return NextResponse.json({ success: false, message: 'ไม่พบกฎระเบียบที่ระบุ' }, { status: 404 });
    }

    const isOwner = await verifyDormOwner(sql, session.user, ruleRows[0].dorm_id);
    if (!isOwner) {
      return NextResponse.json({ success: false, message: 'คุณไม่มีสิทธิ์ลบกฎระเบียบนี้' }, { status: 403 });
    }

    await sql`DELETE FROM dormitory_rules WHERE id = ${ruleId}`;

    return NextResponse.json({ success: true, message: 'ลบกฎระเบียบเรียบร้อยแล้ว' });
  } catch (error: any) {
    console.error('[API Owner Rules DELETE Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
