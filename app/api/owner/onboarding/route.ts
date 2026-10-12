import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const email = searchParams.get('email');
  const dormDbName = searchParams.get('dormDbName'); // Now this acts as dorm_id

  if (!email) {
    return NextResponse.json({ success: false, message: 'Email required' }, { status: 400 });
  }

  try {
    const sql = getDb();
    
    // Get user id from email
    const users = await sql`SELECT id FROM users WHERE email = ${email} LIMIT 1`;
    if (users.length === 0) {
       return NextResponse.json({ success: true, hasDorm: false, canAddDorm: true, dorms: [], maxAllowedDorms: 1 });
    }
    const ownerId = users[0].id;

    // Kesorn 2 single dormitory response
    const dormProfiles = await sql`SELECT * FROM dormitory_profile LIMIT 1`;
    const dorm = dormProfiles[0] || {
      id: 1,
      name: 'หอพักเกษร 2',
      address: '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000',
      phone: '081-999-2222',
      water_rate: 18,
      electricity_rate: 8
    };

    const ownedDorms = [
      { id: 1, dorm_name: dorm.name || 'หอพักเกษร 2', db_name: 'kesorn_db' }
    ];

    return NextResponse.json({
      success: true,
      hasDorm: true,
      dorms: ownedDorms,
      canAddDorm: false,
      maxAllowedDorms: 1,
      dorm: dorm,
      subscription: null,
      dormDbName: 'kesorn_db',
      selectedDormId: 1,
    });
  } catch (err: any) {
    console.error('GET Onboarding Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json({ success: false, message: 'ปิดการใช้งานแล้ว' }, { status: 403 });
}
