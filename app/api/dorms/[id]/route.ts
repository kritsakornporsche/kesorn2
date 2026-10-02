import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const dormId = resolvedParams.id;

    const sql = getDb();

    const dorms = await sql`
      SELECT 
        p.id, p.name, p.address, p.phone,
        p.cover_image, p.description, p.pet_friendly, p.has_parking, p.has_air_con, p.has_wifi, p.has_lan,
        p.water_rate, p.electricity_rate, p.facilities, p.map_url,
        COALESCE(MIN(rm.price), 0) as min_price,
        COUNT(CASE WHEN rm.status IN ('Available', 'ว่าง', 'available') THEN 1 END) as available_rooms_count
      FROM dormitory_profile p
      LEFT JOIN rooms rm ON 1=1
      GROUP BY p.id, p.name, p.address, p.phone, p.cover_image, p.description, p.pet_friendly, p.has_parking, p.has_air_con, p.has_wifi, p.has_lan, p.water_rate, p.electricity_rate, p.facilities, p.map_url
      LIMIT 1
    `;

    if (dorms.length === 0) {
      return NextResponse.json({ success: false, message: 'Dormitory not found' }, { status: 404 });
    }

    const dorm = dorms[0];

    return NextResponse.json({
      success: true,
      data: {
        id: dorm.id || 1,
        name: dorm.name || 'หอพักเกษร 2',
        address: dorm.address || '',
        phone: dorm.phone || '082-985-3519',
        owner_name: 'คุณวัฒนันท์ (หอพักเกษร 2)',
        owner_email: 'owner@kesorn2.com',
        cover_image: dorm.cover_image || '/images/kesorn/building-exterior.jpg',
        description: dorm.description || null,
        pet_friendly: Boolean(dorm.pet_friendly),
        has_parking: Boolean(dorm.has_parking),
        has_air_con: Boolean(dorm.has_air_con),
        has_wifi: Boolean(dorm.has_wifi),
        has_lan: Boolean(dorm.has_lan),
        water_rate: dorm.water_rate !== null && dorm.water_rate !== undefined ? Number(dorm.water_rate) : 100,
        electricity_rate: dorm.electricity_rate !== null && dorm.electricity_rate !== undefined ? Number(dorm.electricity_rate) : 8,
        facilities: dorm.facilities || '',
        map_url: dorm.map_url || '',
        min_price: Number(dorm.min_price),
        available_rooms_count: Number(dorm.available_rooms_count),
      }
    });
  } catch (error: any) {
    console.error('Error fetching dorm by id:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch dormitory', error: error.message }, { status: 500 });
  }
}
