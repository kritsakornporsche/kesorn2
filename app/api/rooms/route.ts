
import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const dormIdParam = searchParams.get('dormId');
    
    let targetDormId = 1;
    if (dormIdParam) {
      targetDormId = parseInt(dormIdParam, 10) || 1;
    } else {
      const session = await auth();
      const userDormId = (session?.user as any)?.dormId;
      if (userDormId) {
        targetDormId = parseInt(userDormId, 10) || 1;
      }
    }

    const sql = getDb();
    const isExplore = searchParams.get('explore') === 'true';

    let query;
    if (isExplore) {
      query = sql`
        SELECT 
          r.id, r.room_number, r.room_type, r.price, r.status, r.floor, r.image_url, r.created_at,
          mor.move_out_date,
          mor.status as move_out_status,
          mor.id as move_out_request_id,
          CASE 
            WHEN r.status IN ('Available', 'ว่าง') THEN 'Available'
            WHEN r.status IN ('MovingOut', 'Moving Out', 'กำลังจะย้ายออก') OR mor.id IS NOT NULL THEN 'MovingOut'
            ELSE r.status
          END as display_status
        FROM rooms r
        LEFT JOIN (
          SELECT room_id, MAX(move_out_date) as move_out_date, MAX(status) as status, MAX(id) as id
          FROM move_out_requests
          WHERE status IN ('Pending', 'Approved')
          GROUP BY room_id
        ) mor ON mor.room_id = r.id
        WHERE (r.status IN ('Available', 'ว่าง', 'MovingOut', 'Moving Out', 'กำลังจะย้ายออก') OR mor.id IS NOT NULL)
          AND (r.dorm_id = ${targetDormId} OR r.dorm_id IS NULL)
        ORDER BY r.floor ASC, CAST(r.room_number AS UNSIGNED) ASC, r.room_number ASC
      `;
    } else {
      query = sql`
        SELECT 
          r.id, r.room_number, r.room_type, r.price, r.status, r.floor, r.image_url, r.created_at,
          mor.move_out_date,
          mor.status as move_out_status,
          mor.id as move_out_request_id,
          CASE 
            WHEN r.status IN ('Available', 'ว่าง') THEN 'Available'
            WHEN r.status IN ('MovingOut', 'Moving Out', 'กำลังจะย้ายออก') OR mor.id IS NOT NULL THEN 'MovingOut'
            ELSE r.status
          END as display_status
        FROM rooms r
        LEFT JOIN (
          SELECT room_id, MAX(move_out_date) as move_out_date, MAX(status) as status, MAX(id) as id
          FROM move_out_requests
          WHERE status IN ('Pending', 'Approved')
          GROUP BY room_id
        ) mor ON mor.room_id = r.id
        WHERE (r.dorm_id = ${targetDormId} OR r.dorm_id IS NULL)
        ORDER BY r.floor ASC, CAST(r.room_number AS UNSIGNED) ASC, r.room_number ASC
      `;
    }

    const rooms = await query;
    return NextResponse.json({ success: true, data: rooms });

  } catch (error: any) {
    console.error('[API Rooms GET Error]', error);
    return NextResponse.json({ success: false, message: 'Failed to fetch rooms' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized: Only owners can create rooms' }, { status: 401 });
    }

    const body = await req.json();
    const { room_number, room_type, price, status, floor, image_url } = body;
    const dormId = parseInt(body.dorm_id || (session.user as any)?.dormId || '0', 10) || 1;

    if (!room_number || !room_type || price === undefined) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const sql = getDb();

    // Check if room number already exists in this dorm
    const existing = await sql`SELECT id FROM rooms WHERE room_number = ${room_number} AND (dorm_id = ${dormId} OR dorm_id IS NULL)`;
    if (existing.length > 0) {
      return NextResponse.json({ success: false, message: 'หมายเลขห้องนี้มีอยู่ในระบบแล้ว' }, { status: 409 });
    }

    const result = await sql`
      INSERT INTO rooms (room_number, room_type, price, status, floor, image_url, dorm_id)
      VALUES (${room_number}, ${room_type}, ${price}, ${status || 'Available'}, ${floor || 1}, ${image_url || null}, ${dormId})
    `;
    
    const newRoomId = (result as any).insertId;

    return NextResponse.json({ 
      success: true, 
      message: 'Room created successfully', 
      data: { id: newRoomId, room_number, room_type, price, status, floor } 
    }, { status: 201 });

  } catch (error: any) {
    console.error('[API Rooms POST Error]', error);
    return NextResponse.json({ success: false, message: 'Failed to create room', error: error.message }, { status: 500 });
  }
}
