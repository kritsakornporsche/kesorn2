const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: '127.0.0.1',
    user: 'root',
    password: '',
    database: 'kesorn_db'
  });

  // 1. Update dormitory_profile
  await conn.execute(`
    UPDATE dormitory_profile
    SET cover_image = '/images/kesorn/building-exterior.jpg',
        phone = '081-842-4948',
        address = 'ต.แม่กา อ.เมือง จ.พะเยา (หน้ามหาวิทยาลัยพะเยา ใกล้ประตู 3)',
        description = 'หอพักเกษร 2 บรรยากาศเงียบสงบ สะอาด ปลอดภัย ตั้งอยู่บริเวณหน้ามหาวิทยาลัยพะเยา (ใกล้ประตู 3) พร้อมสิ่งอำนวยความสะดวกครบครัน ห้องแอร์และห้องพัดลม เครื่องทำน้ำอุ่น เฟอร์นิเจอร์ไม้สัก อินเทอร์เน็ต WiFi ฟรี และที่จอดรถ',
        map_url = 'https://maps.google.com/maps?q=19.0305,99.9255&t=&z=16&ie=UTF8&iwloc=&output=embed'
    WHERE id = 1
  `);
  console.log('Updated dormitory_profile with authentic photo and details');

  // 2. Update rooms image_url with authentic photos JSON
  const deluxeGallery = JSON.stringify([
    '/images/kesorn/room-ac-fan.jpg',
    '/images/kesorn/room-bed.jpg',
    '/images/kesorn/bathroom.jpg',
    '/images/kesorn/corridor.jpg',
    '/images/kesorn/building-exterior.jpg'
  ]);

  const standardGallery = JSON.stringify([
    '/images/kesorn/room-bed.jpg',
    '/images/kesorn/room-ac-fan.jpg',
    '/images/kesorn/bathroom.jpg',
    '/images/kesorn/corridor.jpg',
    '/images/kesorn/building-front.jpg'
  ]);

  await conn.execute("UPDATE rooms SET image_url = ? WHERE room_type IN ('Deluxe', 'Suite')", [deluxeGallery]);
  await conn.execute("UPDATE rooms SET image_url = ? WHERE room_type = 'Standard'", [standardGallery]);
  console.log('Updated all 20 rooms with authentic Kesorn 2 gallery images');

  const [check] = await conn.execute('SELECT id, room_number, room_type, SUBSTRING(image_url, 1, 60) as img FROM rooms LIMIT 3');
  console.log('Sample rooms:', check);

  const [profile] = await conn.execute('SELECT id, name, cover_image, phone, address FROM dormitory_profile WHERE id = 1');
  console.log('Profile:', profile[0]);

  await conn.end();
}

main().catch(console.error);
