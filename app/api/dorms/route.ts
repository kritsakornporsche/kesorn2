import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const petFriendly = searchParams.get('petFriendly') === 'true';
  const hasParking = searchParams.get('hasParking') === 'true';
  const hasAirCon = searchParams.get('hasAirCon') === 'true';
  const maxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : null;
  const searchName = searchParams.get('search')?.trim();

  try {
    const sql = getDb();

    // Query Kesorn 2 profile and rooms
    const profiles = await sql`
      SELECT 
        p.id, p.name, p.address, p.phone,
        p.cover_image, p.description, p.pet_friendly, p.has_parking, p.has_air_con, p.has_wifi, p.has_lan,
        p.water_rate, p.electricity_rate, p.facilities, p.map_url,
        COALESCE(MIN(rm.price), 0) as min_price,
        COUNT(CASE WHEN rm.status IN ('Available', 'ว่าง', 'available') THEN 1 END) as available_rooms_count
      FROM dormitory_profile p
      LEFT JOIN rooms rm ON 1=1
      GROUP BY p.id, p.name, p.address, p.phone, p.cover_image, p.description, p.pet_friendly, p.has_parking, p.has_air_con, p.has_wifi, p.has_lan, p.water_rate, p.electricity_rate, p.facilities, p.map_url
    `;

    const matchedDorms = [];

    for (const dorm of profiles) {
      if (petFriendly && !dorm.pet_friendly) continue;
      if (hasParking && !dorm.has_parking) continue;
      if (hasAirCon && !dorm.has_air_con) continue;
      if (searchName && !dorm.name?.toLowerCase().includes(searchName.toLowerCase())) continue;
      if (maxPrice !== null && Number(dorm.min_price) > maxPrice) continue;

      matchedDorms.push({
        id: dorm.id || 1,
        name: dorm.name || 'หอพักเกษร 2',
        address: dorm.address || 'ต.แม่กา อ.เมือง จ.พะเยา (หออยู่ฝั่งเดียวกับมอ ใกล้หอวรางคณา หน้า ม.พะเยา)',
        phone: dorm.phone || '082-985-3519',
        cover_image: dorm.cover_image || '/images/kesorn/building-exterior.jpg',
        description: dorm.description || 'หอพักเกษร 2 บรรยากาศเงียบสงบ สะอาด ปลอดภัย น่าอยู่มาก',
        pet_friendly: Boolean(dorm.pet_friendly),
        has_parking: Boolean(dorm.has_parking),
        has_air_con: Boolean(dorm.has_air_con),
        has_wifi: Boolean(dorm.has_wifi),
        has_lan: Boolean(dorm.has_lan),
        water_rate: dorm.water_rate !== null && dorm.water_rate !== undefined ? Number(dorm.water_rate) : 100,
        electricity_rate: dorm.electricity_rate !== null && dorm.electricity_rate !== undefined ? Number(dorm.electricity_rate) : 7,
        facilities: dorm.facilities || '',
        map_url: dorm.map_url || '',
        min_price: Number(dorm.min_price) || 2800,
        available_rooms_count: Number(dorm.available_rooms_count),
        available_rooms_summary: Number(dorm.available_rooms_count) > 0 ? `${dorm.available_rooms_count} ห้องว่าง` : 'เต็มทุกห้อง',
      });
    }

    return NextResponse.json({ success: true, data: matchedDorms });
  } catch (error: any) {
    console.error('Error fetching dorms:', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch dormitories', error: error.message }, { status: 500 });
  }
}
