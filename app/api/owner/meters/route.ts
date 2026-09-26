import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import fs from 'fs';
import path from 'path';

/**
 * Persist Base64 meter photo to local disk under public/uploads/meters/
 * Returns static web path e.g. /uploads/meters/meter_1_16_water_2026-04_1234567.jpg
 */
function saveMeterPhoto(
  photoData: string | null | undefined, 
  dormId: number, 
  roomId: number, 
  type: string, 
  billingCycle: string
): string | null {
  if (!photoData || typeof photoData !== 'string') return null;
  
  // If it's already a saved URL or server path, return as is
  if (!photoData.startsWith('data:image/')) {
    return photoData;
  }

  try {
    const commaIdx = photoData.indexOf(',');
    if (commaIdx <= 0) return photoData;

    const meta = photoData.substring(0, commaIdx);
    const base64Data = photoData.substring(commaIdx + 1).replace(/\s/g, '');
    if (!base64Data) return null;

    const extMatch = meta.match(/data:image\/([a-zA-Z0-9\-\+]+)/);
    const rawExt = extMatch ? extMatch[1].toLowerCase() : 'jpg';
    const ext = rawExt === 'jpeg' ? 'jpg' : rawExt;
    const buffer = Buffer.from(base64Data, 'base64');

    const uploadsDir = path.join(process.cwd(), 'public', 'uploads', 'meters');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const cleanCycle = (billingCycle || 'cycle').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `meter_${dormId}_${roomId}_${type.toLowerCase()}_${cleanCycle}_${Date.now()}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, buffer);
    return `/uploads/meters/${filename}`;
  } catch (err) {
    console.error('[saveMeterPhoto File Write Error]', err);
    // Fallback to storing raw base64 data URL in longtext column so the evidence is never lost
    return photoData;
  }
}


// Fetch all meter readings or filter by room
export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const sql = getDb();

    let dormId = parseInt(searchParams.get('dormId') || (session.user as any)?.dormId || '0', 10);
    if (!dormId || dormId === 0) {
      const dormRes = await sql`
        SELECT d.id FROM dormitory_registry d
        JOIN users u ON d.owner_id = u.id
        WHERE u.email = ${session.user.email}
        LIMIT 1
      `;
      dormId = dormRes.length > 0 ? dormRes[0].id : 1;
    }

    const billingCycle = searchParams.get('billing_cycle');
    
    let readings;
    if (billingCycle && billingCycle !== 'all') {
      readings = await sql`
        SELECT m.*, r.room_number 
        FROM meter_readings m
        JOIN rooms r ON m.room_id = r.id
        WHERE m.dorm_id = ${dormId} AND m.billing_cycle = ${billingCycle}
        ORDER BY r.room_number ASC, m.type ASC
      `;
    } else {
      readings = await sql`
        SELECT m.*, r.room_number 
        FROM meter_readings m
        JOIN rooms r ON m.room_id = r.id
        WHERE m.dorm_id = ${dormId}
        ORDER BY m.billing_cycle DESC, r.room_number ASC, m.type ASC
        LIMIT 200
      `;
    }

    return NextResponse.json({ success: true, data: readings, dormId });
  } catch (error: any) {
    console.error('[API Meters GET Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

// Create new meter reading or batch create
export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json();
    const sql = getDb();

    let dormId = parseInt(body.dorm_id || (session.user as any)?.dormId || '0', 10);
    if (!dormId || dormId === 0) {
      const dormRes = await sql`
        SELECT d.id FROM dormitory_registry d
        JOIN users u ON d.owner_id = u.id
        WHERE u.email = ${session.user.email}
        LIMIT 1
      `;
      dormId = dormRes.length > 0 ? dormRes[0].id : 1;
    }

    // Batch insertion support
    if (Array.isArray(body.items)) {
      const items = body.items;
      let insertedCount = 0;
      for (const item of items) {
        const { room_id, type, previous_reading, current_reading, billing_cycle, photo_url } = item;
        if (!room_id || !type || current_reading === undefined || !billing_cycle) continue;

        // Persist photo to disk and get static URL
        const finalPhotoUrl = saveMeterPhoto(photo_url, dormId, Number(room_id), type, billing_cycle);

        // Upsert
        const existing = await sql`
          SELECT id FROM meter_readings 
          WHERE dorm_id = ${dormId} AND room_id = ${room_id} AND type = ${type} AND billing_cycle = ${billing_cycle}
        `;

        if (existing.length > 0) {
          await sql`
            UPDATE meter_readings
            SET previous_reading = ${previous_reading || 0}, 
                current_reading = ${current_reading},
                photo_url = COALESCE(${finalPhotoUrl || null}, photo_url)
            WHERE id = ${existing[0].id}
          `;
        } else {
          await sql`
            INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, billing_cycle, photo_url)
            VALUES (${dormId}, ${room_id}, ${type}, ${previous_reading || 0}, ${current_reading}, ${billing_cycle}, ${finalPhotoUrl || null})
          `;
        }
        insertedCount++;
      }
      return NextResponse.json({ success: true, message: `บันทึกมิเตอร์สำเร็จ ${insertedCount} รายการ`, count: insertedCount });
    }

    // Single insertion
    const { room_id, type, previous_reading, current_reading, billing_cycle, photo_url } = body;

    if (!room_id || !type || current_reading === undefined || !billing_cycle) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }
    
    // Persist photo to disk and get static URL
    const finalPhotoUrl = saveMeterPhoto(photo_url, dormId, Number(room_id), type, billing_cycle);

    // Check for existing record
    const existing = await sql`
      SELECT id FROM meter_readings 
      WHERE dorm_id = ${dormId} AND room_id = ${room_id} AND type = ${type} AND billing_cycle = ${billing_cycle}
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE meter_readings
        SET previous_reading = ${previous_reading || 0}, 
            current_reading = ${current_reading},
            photo_url = COALESCE(${finalPhotoUrl || null}, photo_url)
        WHERE id = ${existing[0].id}
      `;
      return NextResponse.json({ success: true, message: 'อัปเดตการจดมิเตอร์เรียบร้อยแล้ว' });
    }

    const result = await sql`
      INSERT INTO meter_readings (dorm_id, room_id, type, previous_reading, current_reading, billing_cycle, photo_url)
      VALUES (${dormId}, ${room_id}, ${type}, ${previous_reading || 0}, ${current_reading}, ${billing_cycle}, ${finalPhotoUrl || null})
    `;

    return NextResponse.json({ success: true, message: 'บันทึกมิเตอร์เรียบร้อยแล้ว', data: { id: (result as any).insertId } }, { status: 201 });
  } catch (error: any) {
    console.error('[API Meters POST Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
