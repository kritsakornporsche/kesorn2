/**
 * scripts/reset-and-seed-20-rooms.js
 * ล้างข้อมูลหอพัก แล้วสร้างใหม่ให้มีแค่ 20 ห้อง และทำให้ห้องว่างทั้งหมด (Available)
 * โดยรักษา Users หลัก (owner, tenant, keeper, maid, technician, researcher, guest) เอาไว้
 */
const mysql = require('mysql2/promise');
require('dotenv').config({ path: '.env' });

async function resetAndSeed() {
  const dbUrl = process.env.DATABASE_URL || 'mysql://smartdom:smartdom@localhost:3306/kesorn_db';
  console.log('Connecting to:', dbUrl);
  const conn = await mysql.createConnection(dbUrl);

  try {
    await conn.query('SET FOREIGN_KEY_CHECKS = 0');

    console.log('1. Clearing existing operational & room-related data...');
    const tablesToClear = [
      'accounting_monthly_summary',
      'accounting_transactions',
      'announcement_reads',
      'announcements',
      'bills',
      'booking_progress',
      'chat_messages',
      'cleaning_jobs',
      'contracts',
      'conversations',
      'maintenance_jobs',
      'maintenance_requests',
      'meter_readings',
      'move_out_requests',
      'notifications',
      'parcels',
      'room_inventory',
      'tenants',
      'rooms'
    ];

    for (const t of tablesToClear) {
      await conn.query(`TRUNCATE TABLE \`${t}\``);
      console.log(` - Cleared \`${t}\``);
    }

    console.log('2. Resetting dormitory_profile...');
    await conn.query('TRUNCATE TABLE `dormitory_profile`');
    await conn.query(`
      INSERT INTO dormitory_profile (
        id, name, address, phone, tax_id, cover_image, description,
        water_rate, electricity_rate, promptpay_number, promptpay_name,
        has_wifi, has_parking, has_air_con, has_lan, pet_friendly
      ) VALUES (
        1,
        'หอพักเกษร 2',
        '123 หมู่ 6 ต.แม่กา อ.เมือง จ.พะเยา 56000',
        '081-234-5678',
        '0565561001234',
        '/up-logo.png',
        'หอพักคุณภาพใกล้มหาวิทยาลัยพะเยา ปลอดภัย สะอาด สิ่งอำนวยความสะดวกครบครัน',
        18.00,
        8.00,
        '0812345678',
        'หอพักเกษร 2 (ม.พะเยา)',
        1, 1, 1, 1, 1
      )
    `);
    console.log(' - Seeded dormitory_profile');

    console.log('3. Seeding 20 empty/available rooms (Floor 1-2, 10 rooms per floor)...');
    // ชั้น 1: 101 - 110 (10 ห้อง)
    // ชั้น 2: 201 - 210 (10 ห้อง)
    const roomValues = [];
    
    // ชั้น 1 (101 - 110)
    for (let i = 1; i <= 10; i++) {
      const roomNum = `1${String(i).padStart(2, '0')}`;
      const isDeluxe = i >= 8;
      const roomType = isDeluxe ? 'Deluxe' : 'Standard';
      const price = isDeluxe ? 4200.00 : 3500.00;
      roomValues.push([
        roomNum,
        roomType,
        price,
        'Available',
        1,
        null,
        'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
        JSON.stringify([
          'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1598928506311-c55ded91a20c?auto=format&fit=crop&w=800&q=80'
        ]),
        JSON.stringify(['เครื่องปรับอากาศ', 'เครื่องทำน้ำอุ่น', 'เตียง 5 ฟุต', 'ตู้เสื้อผ้า', 'โต๊ะทำงาน', 'ระเบียง', 'Wi-Fi ฟรี'])
      ]);
    }

    // ชั้น 2 (201 - 210)
    for (let i = 1; i <= 10; i++) {
      const roomNum = `2${String(i).padStart(2, '0')}`;
      const isSuite = i >= 9;
      const roomType = isSuite ? 'Suite' : (i >= 5 ? 'Deluxe' : 'Standard');
      const price = isSuite ? 5000.00 : (i >= 5 ? 4200.00 : 3500.00);
      roomValues.push([
        roomNum,
        roomType,
        price,
        'Available',
        2,
        null,
        'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
        JSON.stringify([
          'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?auto=format&fit=crop&w=800&q=80',
          'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?auto=format&fit=crop&w=800&q=80'
        ]),
        JSON.stringify(['เครื่องปรับอากาศ', 'เครื่องทำน้ำอุ่น', 'เตียง 5 ฟุต', 'ตู้เย็น', 'ตู้เสื้อผ้า', 'โต๊ะทำงาน', 'ระเบียง', 'Wi-Fi ฟรี'])
      ]);
    }

    const insertRoomSql = `
      INSERT INTO rooms (
        room_number, room_type, price, status, floor, tenant_id, image_url, images, amenities
      ) VALUES ?
    `;
    await conn.query(insertRoomSql, [roomValues]);
    console.log(` - Successfully created ${roomValues.length} rooms (All Available!)`);

    // Add standard inventory for each room
    const [createdRooms] = await conn.query('SELECT id, room_number FROM rooms ORDER BY id ASC');
    const inventoryValues = [];
    for (const r of createdRooms) {
      inventoryValues.push([r.id, 'กุญแจห้องและคีย์การ์ด', 'Good', '2 ดอก + 1 ใบ']);
      inventoryValues.push([r.id, 'รีโมตเครื่องปรับอากาศ', 'Good', '1 เครื่อง']);
      inventoryValues.push([r.id, 'ฟูกที่นอน 5 ฟุต', 'Good', 'สะอาด ไม่มีรอยชำรุด']);
      inventoryValues.push([r.id, 'โต๊ะทำงานและเก้าอี้', 'Good', 'ครบชุด']);
    }
    await conn.query(
      'INSERT INTO room_inventory (room_id, item_name, condition_status, notes) VALUES ?',
      [inventoryValues]
    );
    console.log(' - Added initial room inventory for all 20 rooms');

    // Add standard dormitory rules
    await conn.query('TRUNCATE TABLE `dormitory_rules`');
    const rules = [
      ['ห้ามส่งเสียงดังหลังเวลา 22:00 น.', 'เพื่อความสงบเรียบร้อยของผู้พักอาศัยท่านอื่น กรุณางดใช้เสียงดังหลังเวลา 22:00 น.', 1],
      ['ห้ามสูบบุหรี่ภายในห้องพักและทางเดิน', 'ห้ามสูบบุหรี่ กัญชา หรือสารเสพติดทุกชนิดภายในอาคาร ฝ่าฝืนปรับ 2,000 บาท', 2],
      ['การชำระค่าเช่า', 'กำหนดชำระค่าเช่าภายในวันที่ 1-5 ของทุกเดือน หากเกินกำหนดมีค่าปรับวันละ 50 บาท', 3],
      ['การรักษาความสะอาด', 'กรุณาทิ้งขยะในจุดที่กำหนด และรักษาความสะอาดบริเวณหน้าห้องพักของท่าน', 4],
      ['การนำสัตว์เลี้ยงเข้าพัก', 'หอพักอนุญาตให้เลี้ยงสัตว์เลี้ยงขนาดเล็กได้ แต่ต้องไม่รบกวนผู้พักอาศัยห้องอื่น', 5]
    ];
    for (const [title, content, idx] of rules) {
      await conn.query(
        'INSERT INTO dormitory_rules (title, content, order_index, is_active) VALUES (?, ?, ?, 1)',
        [title, content, idx]
      );
    }
    console.log(' - Seeded dormitory rules');

    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('🎉 Reset and seed completed successfully!');
  } catch (err) {
    console.error('Error during reset:', err);
    throw err;
  } finally {
    await conn.end();
  }
}

resetAndSeed();
