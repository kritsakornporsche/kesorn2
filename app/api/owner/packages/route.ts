import { NextResponse } from 'next/server';
import { getPlatformDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';

function safeJsonParse(val: any) {
  if (typeof val !== 'string') return val || [];
  try {
    return JSON.parse(val);
  } catch {
    try {
      // Fix escaping issues
      const cleaned = val.replace(/\\"/g, '"');
      return JSON.parse(cleaned);
    } catch (e) {
      console.error('Failed to parse features JSON:', val, e);
      return [];
    }
  }
}

export async function GET() {
  const guard = await requireRole(['owner']);
  if ('response' in guard) return guard.response;
  const sql = getPlatformDb();
  
  try {
    const packages = await sql`SELECT * FROM dormitory_packages ORDER BY price ASC`;
    const parsed = packages.map((p: any) => ({
      ...p,
      features: safeJsonParse(p.features),
    }));
    return NextResponse.json({ success: true, data: parsed });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
