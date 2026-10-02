import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session?.user?.email) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const roomId = searchParams.get('roomId');
    const sql = getDb();

    // 1. If roomId provided, return history for that specific room
    if (roomId) {
      const roomRes = await sql`SELECT id, room_number, room_type, floor, price, status FROM rooms WHERE id = ${roomId} LIMIT 1`;
      if (roomRes.length === 0) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
      }

      const history = await sql`
        SELECT 
          m.id,
          m.billing_cycle,
          m.previous_reading,
          m.current_reading,
          m.units_used,
          m.photo_url,
          m.created_at,
          COALESCE(b.status, 'Not Issued') as bill_status,
          b.id as bill_id
        FROM meter_readings m
        LEFT JOIN bills b ON (b.room_number = ${roomRes[0].room_number} AND b.billing_cycle = m.billing_cycle)
        WHERE m.room_id = ${roomId} AND m.type = 'Electricity'
        ORDER BY m.billing_cycle DESC, m.created_at DESC
      `;

      return NextResponse.json({
        success: true,
        room: roomRes[0],
        history: history,
      });
    }

    // 2. Otherwise return all 20 rooms with their latest reading summary
    const rooms = await sql`
      SELECT 
        r.id, r.room_number, r.floor, r.room_type, r.price, r.status,
        c.status as contract_status,
        c.tenant_id,
        t.name as tenant_name
      FROM rooms r
      LEFT JOIN contracts c ON (c.room_id = r.id AND c.status IN ('Active', 'MoveOutPending'))
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ORDER BY CAST(r.room_number AS UNSIGNED) ASC, r.room_number ASC
    `;

    const summary = [];
    for (const room of rooms) {
      const latestReading = await sql`
        SELECT billing_cycle, previous_reading, current_reading, units_used, photo_url, created_at
        FROM meter_readings
        WHERE room_id = ${room.id} AND type = 'Electricity'
        ORDER BY billing_cycle DESC, id DESC
        LIMIT 1
      `;

      summary.push({
        room_id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        room_type: room.room_type,
        room_status: room.status,
        contract_status: room.contract_status,
        tenant_name: room.tenant_name || (room.status === 'Occupied' ? 'ผู้เช่าประจำ' : 'ห้องว่าง'),
        tenant_id: room.tenant_id || room.id,
        price: room.price,
        latest_cycle: latestReading[0]?.billing_cycle || '-',
        latest_reading: latestReading[0]?.current_reading !== undefined ? Number(latestReading[0].current_reading) : null,
        previous_reading: latestReading[0]?.previous_reading !== undefined ? Number(latestReading[0].previous_reading) : null,
        units_used: latestReading[0]?.units_used !== undefined ? Number(latestReading[0].units_used) : null,
        photo_url: latestReading[0]?.photo_url || null,
        created_at: latestReading[0]?.created_at || null,
      });
    }

    return NextResponse.json({
      success: true,
      data: summary,
    });
  } catch (error: any) {
    console.error('[Meters Summary API Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
