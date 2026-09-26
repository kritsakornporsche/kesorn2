import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { auth } from '@/auth';

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');

    if (!roomId) {
      return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    const progress = await sql`
      SELECT current_step, booking_data 
      FROM booking_progress 
      WHERE user_email = ${session.user.email} AND room_id = ${parseInt(roomId)}
    `;

    const item = progress[0];
    let parsedData = item.booking_data;
    if (typeof parsedData === 'string') {
      try { parsedData = JSON.parse(parsedData); } catch (e) {}
    }

    return NextResponse.json({ 
      success: true, 
      data: { 
        ...item, 
        booking_data: parsedData 
      } 
    });
  } catch (error: any) {
    console.error('[Get Progress Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { roomId, currentStep, bookingData } = await request.json();

    if (!roomId || !currentStep) {
      return NextResponse.json({ success: false, message: 'Missing required fields' }, { status: 400 });
    }

    const existing = await sql`
      SELECT id FROM booking_progress 
      WHERE user_email = ${session.user.email} AND room_id = ${parseInt(roomId)}
    `;

    if (existing.length > 0) {
      await sql`
        UPDATE booking_progress 
        SET current_step = ${currentStep}, booking_data = ${JSON.stringify(bookingData)}, updated_at = NOW()
        WHERE user_email = ${session.user.email} AND room_id = ${parseInt(roomId)}
      `;
    } else {
      await sql`
        INSERT INTO booking_progress (user_email, room_id, current_step, booking_data, updated_at)
        VALUES (${session.user.email}, ${parseInt(roomId)}, ${currentStep}, ${JSON.stringify(bookingData)}, NOW())
      `;
    }

    return NextResponse.json({ success: true, message: 'Progress saved successfully' });
  } catch (error: any) {
    console.error('[Save Progress Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
  }
  const sql = getDb();

  try {
    const { roomId } = await request.json();

    await sql`
      DELETE FROM booking_progress 
      WHERE user_email = ${session.user.email} AND room_id = ${parseInt(roomId)}
    `;

    return NextResponse.json({ success: true, message: 'Progress cleared successfully' });
  } catch (error: any) {
    console.error('[Clear Progress Error]', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
