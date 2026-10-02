import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

// GET /api/owner/settings
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const sql = getDb();
    const profile = await sql`SELECT * FROM dormitory_profile LIMIT 1`;

    if (profile.length > 0) {
      return NextResponse.json({
        success: true,
        data: profile[0]
      });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: 1,
        name: 'หอพักเกษร 2',
        phone: '081-999-2222',
        address: '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000',
        water_rate: 100,
        electricity_rate: 8,
        promptpay_number: '0812345678',
        promptpay_name: 'หอพักเกษร 2 (ม.พะเยา)'
      }
    });
  } catch (err: any) {
    console.error('Error fetching settings:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

// POST /api/owner/settings
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json();
    const {
      name,
      address,
      phone,
      tax_id,
      water_rate,
      electricity_rate,
      has_wifi,
      has_parking,
      pet_friendly,
      has_lan,
      facilities,
      map_url,
      description,
      has_air_con,
      cover_image,
      promptpay_number,
      promptpay_name,
      ocr_api_key,
      ocr_provider
    } = body;

    const sql = getDb();

    // Check if profile exists
    const existing = await sql`SELECT id FROM dormitory_profile LIMIT 1`;
    if (existing.length === 0) {
      await sql`
        INSERT INTO dormitory_profile (
          name, address, phone, tax_id, water_rate, electricity_rate,
          has_wifi, has_parking, pet_friendly, has_lan, facilities, map_url,
          description, has_air_con, cover_image, promptpay_number, promptpay_name,
          ocr_api_key, ocr_provider
        ) VALUES (
          ${name || 'หอพักเกษร 2'}, ${address || ''}, ${phone || ''}, ${tax_id || ''}, 
          ${water_rate !== undefined ? water_rate : 100.00}, ${electricity_rate !== undefined ? electricity_rate : 8.00},
          ${has_wifi ? 1 : 0}, ${has_parking ? 1 : 0}, ${pet_friendly ? 1 : 0}, ${has_lan ? 1 : 0}, 
          ${facilities || ''}, ${map_url || ''}, ${description || ''}, 
          ${has_air_con ? 1 : 0}, ${cover_image || ''},
          ${promptpay_number || ''}, ${promptpay_name || ''},
          ${ocr_api_key || null}, ${ocr_provider || 'gemini'}
        )
      `;
    } else {
      await sql`
        UPDATE dormitory_profile
        SET 
          name = ${name || 'หอพักเกษร 2'},
          address = ${address || ''},
          phone = ${phone || ''},
          tax_id = ${tax_id || ''},
          water_rate = ${water_rate !== undefined ? water_rate : 100.00},
          electricity_rate = ${electricity_rate !== undefined ? electricity_rate : 8.00},
          has_wifi = ${has_wifi ? 1 : 0},
          has_parking = ${has_parking ? 1 : 0},
          pet_friendly = ${pet_friendly ? 1 : 0},
          has_lan = ${has_lan ? 1 : 0},
          facilities = ${facilities || ''},
          map_url = ${map_url || ''},
          description = ${description || ''},
          has_air_con = ${has_air_con ? 1 : 0},
          cover_image = ${cover_image || ''},
          promptpay_number = ${promptpay_number || ''},
          promptpay_name = ${promptpay_name || ''},
          ocr_api_key = COALESCE(${ocr_api_key !== undefined ? (ocr_api_key || null) : null}, ocr_api_key),
          ocr_provider = COALESCE(${ocr_provider || null}, ocr_provider)
        WHERE id = ${existing[0].id}
      `;
    }

    return NextResponse.json({ success: true, message: 'บันทึกข้อมูลสำเร็จ' });
  } catch (err: any) {
    console.error('Error updating settings:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
