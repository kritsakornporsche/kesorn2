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

export async function POST(req: Request) {
  try {
    const { ownerEmail, personalData, dormData } = await req.json();
    if (!ownerEmail || !dormData) {
      return NextResponse.json({ success: false, message: 'Missing required data' }, { status: 400 });
    }

    const sql = getDb();

    // Get user id
    let users = await sql`SELECT id FROM users WHERE email = ${ownerEmail} LIMIT 1`;
    let ownerId;
    const ownerDisplayName = personalData?.fullName || dormData?.ownerName || 'Owner';

    if (users.length === 0) {
      // Create owner user if not exist
      const bcrypt = require('bcryptjs');
      const hash = await bcrypt.hash('temp_password', 12);
      const res = await sql`
        INSERT INTO users (email, password, name, phone, primary_role)
        VALUES (${ownerEmail}, ${hash}, ${ownerDisplayName}, ${personalData?.mobilePhone || null}, 'owner')
      `;
      ownerId = (res as any).insertId;
    } else {
      ownerId = users[0].id;
      // Update owner personal name, phone and role in users table
      await sql`
        UPDATE users 
        SET name = ${ownerDisplayName}, 
            phone = ${personalData?.mobilePhone || null},
            role = 'owner',
            primary_role = 'owner'
        WHERE id = ${ownerId}
      `;
    }

    // Register in dormitory_registry
    const dbNameGenerated = `dorm_${ownerId}_${Date.now()}`;
    const reg = await sql`
      INSERT INTO dormitory_registry (
        owner_id, owner_email, owner_name, dorm_name, db_name, phone, address, status, approved_at
      )
      VALUES (
        ${ownerId}, ${ownerEmail}, ${ownerDisplayName}, ${dormData.name}, ${dbNameGenerated},
        ${dormData.phone || personalData?.mobilePhone || ''}, ${dormData.address || ''}, 'Active', NOW()
      )
    `;
    const dormRegistryId = (reg as any).insertId;

    // Create user_dorm_role
    await sql`
      INSERT INTO user_dorm_roles (user_id, dorm_id, role)
      VALUES (${ownerId}, ${dormRegistryId}, 'owner')
      ON DUPLICATE KEY UPDATE role = 'owner', is_active = 1
    `;

    // Build facilities list string
    const facilitiesList = Array.isArray(dormData.selectedAmenities) && dormData.selectedAmenities.length > 0
      ? dormData.selectedAmenities.join(', ')
      : (dormData.facilities || '');

    const mapUrlStr = dormData.mapUrl || (dormData.latitude && dormData.longitude ? `https://maps.google.com/?q=${dormData.latitude},${dormData.longitude}` : '');

    // Create dormitory profile
    await sql`
      INSERT INTO dormitory_profile (
        dorm_id, name, address, phone, tax_id, owner_id, water_rate, electricity_rate,
        has_wifi, has_parking, pet_friendly, has_lan,
        has_air_con, facilities, map_url, description, cover_image,
        promptpay_number, promptpay_name
      )
      VALUES (
        ${dormRegistryId}, ${dormData.name}, ${dormData.address || ''}, ${dormData.phone || personalData?.mobilePhone || ''},
        ${personalData?.taxId || ''}, ${ownerId}, ${dormData.water_rate || 18.0}, ${dormData.electricity_rate || 8.0},
        ${dormData.has_wifi ? 1 : 0}, ${dormData.has_parking ? 1 : 0}, ${dormData.pet_friendly ? 1 : 0}, ${dormData.has_lan ? 1 : 0},
        ${dormData.has_air_con ? 1 : 0}, ${facilitiesList}, ${mapUrlStr},
        ${dormData.description || 'หอพักคุณภาพ ใกล้สิ่งอำนวยความสะดวก ปลอดภัย สะอาด'},
        ${dormData.coverImage || dormData.cover_image || '/up-logo.png'},
        ${dormData.promptpay_number || dormData.promptpayNumber || ''},
        ${dormData.promptpay_name || dormData.promptpayName || ''}
      )
    `;

    // Process Rules (from templateDormId or custom rules array)
    const templateDormId = dormData.templateDormId;
    const customRules = dormData.rules;

    if (templateDormId) {
      // Clone rules from template dorm
      const tplRules = await sql`
        SELECT title, description, category, fine_amount, is_active, sort_order 
        FROM dormitory_rules 
        WHERE dorm_id = ${templateDormId}
        ORDER BY sort_order ASC, id ASC
      `;
      for (const r of tplRules) {
        await sql`
          INSERT INTO dormitory_rules (
            dorm_id, title, description, category, fine_amount, is_active, sort_order
          ) VALUES (
            ${dormRegistryId}, ${r.title}, ${r.description}, ${r.category}, ${r.fine_amount}, ${r.is_active}, ${r.sort_order}
          )
        `;
      }
    } else if (Array.isArray(customRules) && customRules.length > 0) {
      for (let i = 0; i < customRules.length; i++) {
        const r = customRules[i];
        if (r.title && r.description) {
          await sql`
            INSERT INTO dormitory_rules (
              dorm_id, title, description, category, fine_amount, is_active, sort_order
            ) VALUES (
              ${dormRegistryId}, 
              ${r.title}, 
              ${r.description}, 
              ${r.category || 'ทั่วไป'}, 
              ${r.fine_amount !== undefined ? Number(r.fine_amount) : 0}, 
              1, 
              ${i}
            )
          `;
        }
      }
    } else {
      // Seed default baseline rules
      const defaultRules = [
        { title: 'ห้ามส่งเสียงดังยามวิกาล', description: 'งดใช้เสียงดังหลังเวลา 22.00 น. เพื่อความสงบเรียบร้อยของผู้พักอาศัย', category: 'การใช้เสียง', fine: 500 },
        { title: 'ห้ามสูบบุหรี่ในห้องพักและทางเดิน', description: 'ห้ามสูบบุหรี่ภายในอาคารเด็ดขาด ให้สูบในจุดที่กำหนดเท่านั้น', category: 'ความปลอดภัย', fine: 1000 },
        { title: 'การเข้า-ออกอาคาร', description: 'ต้องพกคีย์การ์ดและปิดประตูกลางทุกครั้ง ห้ามนำบุคคลภายนอกเข้าพักค้างคืนโดยไม่แจ้ง', category: 'การเข้า-ออก', fine: 500 },
        { title: 'การรักษาความสะอาด', description: 'ทิ้งขยะในจุดทิ้งขยะส่วนกลางให้เรียบร้อย และห้ามวางสิ่งของกีดขวางทางเดินส่วนกลาง', category: 'ความสะอาด', fine: 300 }
      ];
      for (let i = 0; i < defaultRules.length; i++) {
        const r = defaultRules[i];
        await sql`
          INSERT INTO dormitory_rules (
            dorm_id, title, description, category, fine_amount, is_active, sort_order
          ) VALUES (
            ${dormRegistryId}, ${r.title}, ${r.description}, ${r.category}, ${r.fine}, 1, ${i}
          )
        `;
      }
    }

    return NextResponse.json({
      success: true,
      message: 'ตั้งค่าหอพักสำเร็จ',
      dormDbName: dormRegistryId.toString(),
      dormId: dormRegistryId,
    });
  } catch (err: any) {
    console.error('POST Onboarding Error:', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
