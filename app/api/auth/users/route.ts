import { NextResponse } from 'next/server';
import { getDormDb } from '@/lib/db';
import { auth } from '@/auth';

const sql = getDormDb('smartdom_dorm_1');

async function ensureTable() {
  // Match actual DB schema (column: name, not full_name)
  await sql`
    CREATE TABLE IF NOT EXISTS users (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255) NOT NULL,
      email       VARCHAR(255) NOT NULL UNIQUE,
      password    VARCHAR(255) NOT NULL,
      role        VARCHAR(50)  NOT NULL DEFAULT 'tenant',
      created_at  TIMESTAMP    DEFAULT NOW()
    )
  `;
  await sql`
    ALTER TABLE users
    ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS sub_role VARCHAR(50)
  `;
}

// GET /api/auth/users — list all users (admin & owner use)
export async function GET() {
  try {
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const role = (session.user as any)?.role;
    if (role !== 'admin' && role !== 'platform_admin' && role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    }

    await ensureTable();

    // Alias 'name' as 'full_name' so the frontend interface stays consistent
    const users = await sql`
      SELECT id, name AS full_name, email, role, sub_role, is_active, created_at
      FROM users
      ORDER BY created_at DESC
    `;

    const summary = await sql`
      SELECT
        COUNT(*)                                            AS total,
        COUNT(CASE WHEN role = 'owner' THEN 1 END)          AS owners,
        COUNT(CASE WHEN role = 'keeper' THEN 1 END)         AS keepers,
        COUNT(CASE WHEN role = 'tenant' THEN 1 END)         AS tenants,
        COUNT(CASE WHEN is_active = TRUE THEN 1 END)        AS active
      FROM users
    `;

    return NextResponse.json({
      success: true,
      data: users,
      summary: summary[0],
    });
  } catch (error: any) {
    console.error('[GET /api/auth/users]', error);
    return NextResponse.json(
      { success: false, message: 'ไม่สามารถดึงข้อมูลผู้ใช้งานได้', error: error.message },
      { status: 500 }
    );
  }
}
