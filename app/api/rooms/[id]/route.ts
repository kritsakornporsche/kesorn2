import { NextResponse } from 'next/server';
import { getDb, getPlatformDb, getDormDb, getDormDbFromSession } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params;
    const id = resolvedParams.id;
    
    const sql = getDb();
    
    // Fetch room with dorm info from dormitory_profile and owner from users
    const result = await sql`
      SELECT 
        r.*, 
        COALESCE(dp.name, 'หอพักเกษร 2') as dorm_name, 
        dp.address as dorm_address, 
        dp.phone as dorm_phone,
        u.name as owner_name,
        ku.name as keeper_name, 
        ku.phone as keeper_phone, 
        ku.email as keeper_email,
        mor.move_out_date,
        mor.status as move_out_status,
        CASE 
          WHEN UPPER(r.room_number) = 'T01' THEN 5.00 
          WHEN r.water_rate IS NOT NULL THEN r.water_rate
          ELSE dp.water_rate 
        END as water_rate,
        CASE WHEN UPPER(r.room_number) = 'T01' THEN 1.00 ELSE dp.electricity_rate END as electricity_rate,
        CASE 
          WHEN UPPER(r.room_number) = 'T01' THEN 5.00 
          WHEN r.common_fee IS NOT NULL THEN r.common_fee
          ELSE dp.common_fee 
        END as common_fee,
        CASE 
          WHEN UPPER(r.room_number) = 'T01' THEN 20.00 
          WHEN r.deposit_amount IS NOT NULL THEN r.deposit_amount
          ELSE 3000.00 
        END as deposit_amount,
        dp.pet_friendly,
        dp.has_parking,
        dp.has_air_con,
        dp.has_wifi,
        dp.has_lan,
        dp.facilities as dorm_facilities,
        dp.map_url as dorm_map_url,
        dp.description as dorm_description,
        dp.cover_image as dorm_cover_image,
        dp.promptpay_number,
        dp.promptpay_name,
        1 as dorm_id,
        CASE 
          WHEN r.status IN ('Available', 'ว่าง') THEN 'Available'
          WHEN r.status IN ('MovingOut', 'Moving Out', 'กำลังจะย้ายออก') OR mor.id IS NOT NULL THEN 'MovingOut'
          ELSE r.status
        END as display_status
      FROM rooms r
      LEFT JOIN dormitory_profile dp ON 1=1
      LEFT JOIN users u ON u.role = 'owner'
      LEFT JOIN keepers k ON 1=1
      LEFT JOIN users ku ON k.user_id = ku.id
      LEFT JOIN tenants t ON t.room_id = r.id AND t.status = 'active'
      LEFT JOIN move_out_requests mor ON (mor.room_id = r.id OR mor.tenant_id = t.id) AND mor.status IN ('Pending', 'Approved')
      WHERE r.id = ${id}
      LIMIT 1
    `;
    
    if (result.length === 0) {
      return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
    }
    
    return NextResponse.json({ success: true, data: result[0] }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({ success: false, message: 'Failed to fetch room', error: error.message }, { status: 500 });
  }
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const id = resolvedParams.id;
    const body = await request.json();
    const { room_number, room_type, price, status, floor, image_url, deposit_amount, water_rate, common_fee } = body;

    if (!id || !room_number || !room_type || price === undefined) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    
    // Check if room number already exists for a DIFFERENT room IN THE SAME DORMITORY
    const existing = await sql`SELECT id FROM rooms WHERE room_number = ${room_number} AND id != ${id}`;
    if (existing.length > 0) {
      return NextResponse.json({ success: false, message: 'Room number already exists in this dormitory' }, { status: 409 });
    }

    const deposit = deposit_amount !== undefined && deposit_amount !== null && deposit_amount !== '' ? parseFloat(deposit_amount) : 3000;
    const water = water_rate !== undefined && water_rate !== null && water_rate !== '' ? parseFloat(water_rate) : 100;
    const common = common_fee !== undefined && common_fee !== null && common_fee !== '' ? parseFloat(common_fee) : 150;

    await sql`
      UPDATE rooms 
      SET room_number = ${room_number}, 
          room_type = ${room_type}, 
          price = ${price}, 
          status = ${status}, 
          floor = ${floor}, 
          image_url = ${image_url || null},
          deposit_amount = ${deposit},
          water_rate = ${water},
          common_fee = ${common}
      WHERE id = ${id}
    `;

    const updated = await sql`SELECT * FROM rooms WHERE id = ${id} LIMIT 1`;
    if (updated.length === 0) {
      return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Room updated successfully', data: updated[0] }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating room:', error);
    return NextResponse.json({ success: false, message: 'Failed to update room', error: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth();
    if (!session || (session.user as any).role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const resolvedParams = await params;
    const id = resolvedParams.id;

    if (!id) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    const sql = getDormDbFromSession(session);
    
    // Check if room has active contracts, bills, or readings
    const relatedContracts = await sql`SELECT id FROM contracts WHERE room_id = ${id} LIMIT 1`;
    const relatedTenants = await sql`SELECT id FROM tenants WHERE room_id = ${id} LIMIT 1`;
    if (relatedContracts.length > 0 || relatedTenants.length > 0) {
      return NextResponse.json({
        success: false,
        message: 'ไม่สามารถลบห้องพักนี้ได้เนื่องจากมีข้อมูลสัญญาเช่าหรือผู้เช่าผูกอยู่ กรุณาปรับสถานะห้องเป็นปิดปรับปรุง (Maintenance) แทน'
      }, { status: 400 });
    }

    await sql`DELETE FROM rooms WHERE id = ${id}`;

    return NextResponse.json({ success: true, message: 'Room deleted successfully' }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting room:', error);
    return NextResponse.json({ success: false, message: 'Failed to delete room', error: error.message }, { status: 500 });
  }
}
