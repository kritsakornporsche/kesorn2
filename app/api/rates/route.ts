import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRates, moveInCosts } from '@/lib/billing';

// Public: the same rates are already shown on the landing page and in /api/dorms.
// ?roomNumber= adds that room's move-in costs (rent, deposit, booking fee) for the cost calculator.
export async function GET(req: Request) {
  try {
    const sql = getDb();
    const rates = await getRates(sql);
    const roomNumber = new URL(req.url).searchParams.get('roomNumber');
    const room = roomNumber ? await moveInCosts(sql, roomNumber) : undefined;
    return NextResponse.json({ success: true, data: rates, ...(roomNumber ? { room } : {}) });
  } catch (error: any) {
    console.error('[Rates GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดอัตราค่าบริการไม่สำเร็จ' }, { status: 500 });
  }
}
