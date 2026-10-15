import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { bookingFeeFor, getPaymentInfo, getRates, moveInCosts } from '@/lib/billing';
import { bookingWindow } from '@/lib/bookings';

// Public: the same rates are already shown on the landing page and in /api/dorms.
// ?roomNumber= adds that room's move-in costs (rent, deposit, booking fee) for the cost calculator.
// payment: where to transfer (PromptPay / bank account, from the settings page) — printed on the contract form.
// bookingFee: the standard booking fee (bookingFeeFor; a room's own fee is in room.bookingFee).
export async function GET(req: Request) {
  try {
    const sql = getDb();
    const rates = await getRates(sql);
    const roomNumber = new URL(req.url).searchParams.get('roomNumber');
    const room = roomNumber ? await moveInCosts(sql, roomNumber) : undefined;
    // booking_open: whether booking requests are accepted right now (08:00–20:00 Thai time, server clock)
    const payment = await getPaymentInfo(sql);
    return NextResponse.json({ success: true, data: rates, payment, bookingFee: bookingFeeFor(null), ...(roomNumber ? { room, booking_open: bookingWindow(new Date()).open } : {}) });
  } catch (error: any) {
    console.error('[Rates GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดอัตราค่าบริการไม่สำเร็จ' }, { status: 500 });
  }
}
