const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  console.log('--- Updating kesorn_db with exact RentHub information ---');

  // 1. Update dormitory_profile
  await conn.execute(`
    UPDATE dormitory_profile
    SET name = 'หอพักเกษร 2 (หน้า ม.พะเยา)',
        address = 'ต.แม่กา อ.เมือง จ.พะเยา (หออยู่ฝั่งเดียวกับมอ ใกล้หอวรางคณา หน้า ม.พะเยา)',
        phone = '082-985-3519',
        cover_image = '/images/kesorn/building-exterior.jpg',
        description = 'หอพักเกษร 2 หน้า ม.พะเยา (หออยู่ฝั่งเดียวกับมอ ใกล้หอวรางคณา) สวย สะอาด สงบ น่าอยู่มาก เฟอร์นิเจอร์ครบ: เตียง 5 ฟุต, ตู้เสื้อผ้า, ตู้เย็น, โต๊ะ-เก้าอี้ทำงาน, พัดลม, ชั้นวางของ, เครื่องทำน้ำอุ่น (ห้องน้ำกว้างมาก), อ่างล้างจาน (ที่ทำกับข้าวระเบียงกว้างมาก) ฟรีค่าน้ำ ฟรีอินเทอร์เน็ต WiFi เราเตอร์ทุกห้อง ค่าไฟ 6 บาท/ยูนิต จองเพียง 1,000 บาท เงินประกัน 2,000 บาท โทร 082-985-3519 ได้ 24 ชม.',
        water_rate = 0.00,
        electricity_rate = 6.00,
        has_wifi = 1,
        has_parking = 1,
        has_air_con = 1,
        has_lan = 1,
        pet_friendly = 1,
        facilities = 'เฟอร์นิเจอร์-ตู้เสื้อผ้า,เตียงที่นอน 5 ฟุต,โต๊ะและเก้าอี้ทำงาน,ตู้เย็น,พัดลม,เครื่องทำน้ำอุ่น,อ่างล้างจานระเบียง,ชั้นวางของ,ที่แขวนของ,ที่จอดรถยนต์,ที่จอดรถมอเตอร์ไซค์/จักรยาน,กล้องวงจรปิด (CCTV),อินเทอร์เน็ตไร้สาย (WIFI ทุกห้อง),อนุญาตให้เลี้ยงสัตว์',
        map_url = 'https://maps.google.com/maps?q=19.0305,99.9255&t=&z=16&ie=UTF8&iwloc=&output=embed'
    WHERE id = 1
  `);
  console.log('✅ Updated dormitory_profile');

  // 2. Update all 20 rooms:
  // Standard (Rooms 1-7, 11-14): 2,800 THB
  // Deluxe (Rooms 8-10, 15-18): 3,000 THB
  // Suite (Rooms 19-20): 3,100 THB
  const standardImages = JSON.stringify([
    '/images/kesorn/room-bed.jpg',
    '/images/kesorn/room-ac-fan.jpg',
    '/images/kesorn/bathroom.jpg',
    '/images/kesorn/corridor.jpg',
    '/images/kesorn/building-exterior.jpg'
  ]);

  const deluxeImages = JSON.stringify([
    '/images/kesorn/room-bed.jpg',
    '/images/kesorn/room-ac-fan.jpg',
    '/images/kesorn/bathroom.jpg',
    '/images/kesorn/corridor.jpg',
    '/images/kesorn/building-front.jpg'
  ]);

  const suiteImages = JSON.stringify([
    '/images/kesorn/room-ac-fan.jpg',
    '/images/kesorn/room-bed.jpg',
    '/images/kesorn/bathroom.jpg',
    '/images/kesorn/corridor.jpg',
    '/images/kesorn/building-exterior.jpg'
  ]);

  const commonAmenities = JSON.stringify([
    'เตียงที่นอน 5 ฟุต',
    'ตู้เสื้อผ้าไม้สัก',
    'โต๊ะและเก้าอี้ทำงาน',
    'ตู้เย็น',
    'พัดลม',
    'เครื่องทำน้ำอุ่น (ห้องน้ำกว้างมาก)',
    'อ่างล้างจานระเบียง (ที่ทำกับข้าว)',
    'ชั้นวางของติดผนัง 3 ชั้น',
    'ที่แขวนของ',
    'อินเทอร์เน็ต WiFi กล่องเราเตอร์ในห้อง'
  ]);

  const suiteAmenities = JSON.stringify([
    'เครื่องปรับอากาศ',
    'พัดลมติดผนัง',
    'เตียงที่นอน 5 ฟุต',
    'ตู้เสื้อผ้าไม้สัก',
    'โต๊ะและเก้าอี้ทำงาน',
    'ตู้เย็น',
    'เครื่องทำน้ำอุ่น (ห้องน้ำกว้างมาก)',
    'อ่างล้างจานระเบียง',
    'ชั้นวางของติดผนัง 3 ชั้น',
    'ที่แขวนของ',
    'อินเทอร์เน็ต WiFi กล่องเราเตอร์ในห้อง'
  ]);

  // Standard: 2,800
  await conn.execute(`
    UPDATE rooms
    SET price = 2800.00,
        image_url = ?,
        amenities = ?
    WHERE room_number IN ('1','2','3','4','5','6','7','11','12','13','14')
  `, [standardImages, commonAmenities]);

  // Deluxe: 3,000
  await conn.execute(`
    UPDATE rooms
    SET price = 3000.00,
        image_url = ?,
        amenities = ?
    WHERE room_number IN ('8','9','10','15','16','17','18')
  `, [deluxeImages, commonAmenities]);

  // Suite: 3,100
  await conn.execute(`
    UPDATE rooms
    SET price = 3100.00,
        image_url = ?,
        amenities = ?
    WHERE room_number IN ('19','20')
  `, [suiteImages, suiteAmenities]);

  console.log('✅ Updated all 20 rooms with exact real prices (฿2,800 - ฿3,100) & amenities');

  // 3. Update dormitory_rules
  await conn.execute('DELETE FROM dormitory_rules WHERE dorm_id = 1');
  const rules = [
    {
      title: 'นโยบายการจองและเงินประกัน',
      content: 'ค่าจองเพื่อยืนยันสิทธิ์ห้องพัก 1,000 บาท เงินประกันความเสียหาย 2,000 บาท คืนให้เมื่อสิ้นสุดสัญญาเช่าตามระเบียบ',
      category: 'การจองและเงินประกัน',
      fine: 0,
      order: 1
    },
    {
      title: 'อัตราค่าน้ำประปาและค่าไฟฟ้า',
      content: 'ฟรีค่าน้ำประปา (รวมอยู่ในค่าห้องพักแล้ว) ค่าไฟฟ้าคิดหน่วยละ 6 บาท ฟรีอินเทอร์เน็ต Wi-Fi มีกล่องเราเตอร์แยกทุกห้อง',
      category: 'สาธารณูปโภค',
      fine: 0,
      order: 2
    },
    {
      title: 'นโยบายสัตว์เลี้ยง (Pet-Friendly)',
      content: 'อนุญาตให้เลี้ยงสัตว์เลี้ยงได้ (เช่น สุนัข แมว) โดยผู้พักอาศัยต้องดูแลความสะอาดและไม่ส่งเสียงรบกวนห้องข้างเคียง',
      category: 'สัตว์เลี้ยง',
      fine: 0,
      order: 3
    },
    {
      title: 'การรักษาความสงบและเวลาพักผ่อน',
      content: 'งดใช้เสียงดังหลังเวลา 22:00 น. เพื่อสุขอนามัยและความสงบเรียบร้อยของผู้พักอาศัยท่านอื่น',
      category: 'การใช้เสียง',
      fine: 500,
      order: 4
    },
    {
      title: 'ข้อห้ามเรื่องการสูบบุหรี่และสิ่งเสพติด',
      content: 'ห้ามสูบบุหรี่ กัญชา หรือสารเสพติดทุกชนิดภายในห้องพักและตัวอาคารเด็ดขาด ฝ่าฝืนมีโทษปรับ 2,000 บาท',
      category: 'ความปลอดภัย',
      fine: 2000,
      order: 5
    }
  ];

  for (const r of rules) {
    await conn.execute(`
      INSERT INTO dormitory_rules (dorm_id, title, content, description, category, fine_amount, sort_order, order_index, is_active)
      VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)
    `, [r.title, r.content, r.content, r.category, r.fine, r.order, r.order]);
  }
  console.log('✅ Updated dormitory_rules to match real conditions');

  // Verify
  const [profile] = await conn.execute('SELECT name, phone, address, water_rate, electricity_rate, pet_friendly FROM dormitory_profile WHERE id = 1');
  console.log('Dorm Profile:', profile[0]);

  const [rooms] = await conn.execute('SELECT room_number, room_type, price FROM rooms ORDER BY CAST(room_number AS UNSIGNED)');
  console.log('Room count:', rooms.length);
  console.log('Prices sample:', rooms.slice(0, 3), '...', rooms.slice(7, 9), '...', rooms.slice(18, 20));

  await conn.end();
}

main().catch(console.error);
