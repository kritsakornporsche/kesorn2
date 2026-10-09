import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized: Only owners can batch create rooms' }, { status: 401 });
    }

    const body = await req.json();
    const { rooms, dorm_id } = body;

    if (!Array.isArray(rooms) || rooms.length === 0) {
      return NextResponse.json({ success: false, message: 'Invalid or empty rooms array' }, { status: 400 });
    }

    const userDormId = (session.user as any).dormId;
    const targetDormId = dorm_id ? parseInt(dorm_id, 10) : (userDormId ? parseInt(userDormId, 10) : null);

    if (!targetDormId) {
      return NextResponse.json({ success: false, message: 'Missing dormitory context' }, { status: 400 });
    }

    const sql = getDb();
    let createdCount = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (const room of rooms) {
      const { room_number, room_type, price, status, floor, image_url, deposit_amount, water_rate, common_fee } = room;

      if (!room_number || !room_type || price === undefined) {
        skippedCount++;
        continue;
      }

      // Check if room number already exists in this dorm
      const existing = await sql`SELECT id FROM rooms WHERE room_number = ${room_number} AND dorm_id = ${targetDormId}`;
      if (existing && existing.length > 0) {
        skippedCount++;
        continue;
      }

      const deposit = deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== '' ? parseFloat(deposit_amount) : 3000;
      const water = water_rate !== undefined && water_rate !== null && water_rate !== '' ? parseFloat(water_rate) : 100;
      const common = common_fee !== undefined && common_fee !== null && common_fee !== '' ? parseFloat(common_fee) : 150;

      await sql`
        INSERT INTO rooms (room_number, room_type, price, status, floor, image_url, dorm_id, deposit_amount, water_rate, common_fee)
        VALUES (${room_number}, ${room_type}, ${price}, ${status || 'Available'}, ${floor || 1}, ${image_url || null}, ${targetDormId}, ${deposit}, ${water}, ${common})
      `;
      createdCount++;
    }

    return NextResponse.json({
      success: true,
      createdCount,
      skippedCount,
      message: `เพิ่มห้องพักสำเร็จ ${createdCount} ห้อง${skippedCount > 0 ? ` (ข้ามห้องที่มีอยู่แล้ว ${skippedCount} ห้อง)` : ''}`,
    }, { status: 201 });

  } catch (error: any) {
    console.error('[API Rooms Batch POST Error]', error);
    return NextResponse.json({ success: false, message: 'Failed to batch create rooms', error: error.message }, { status: 500 });
  }
}
