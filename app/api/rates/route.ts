import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { bookingFeeFor, getContractParty, getPaymentInfo, getRates, moveInCosts } from '@/lib/billing';
import { getCurrentUser } from '@/lib/authz';

// Public: the same rates are already shown on the landing page and in /api/dorms.
// ?roomNumber= adds that room's move-in costs (rent, deposit, booking fee) for the cost calculator.
// payment: where to transfer (PromptPay / bank account, from the settings page) — printed on the contract form.
// party: dorm address + landlord name / phone for the contract form — signed-in users only (null otherwise).
// bookingFee: the standard booking fee (bookingFeeFor; a room's own fee is in room.bookingFee).
export async function GET(req: Request) {
  try {
    const sql = getDb();
    const rates = await getRates(sql);
    const roomNumber = new URL(req.url).searchParams.get('roomNumber');
    const room = roomNumber ? await moveInCosts(sql, roomNumber) : undefined;
    const payment = await getPaymentInfo(sql);
    // Landlord name / phone for the printed contract: signed-in users only
    const party = (await getCurrentUser()) ? await getContractParty(sql) : null;
    return NextResponse.json({ success: true, data: rates, payment, party, bookingFee: bookingFeeFor(null), ...(roomNumber ? { room } : {}) });
  } catch (error: any) {
    console.error('[Rates GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดอัตราค่าบริการไม่สำเร็จ' }, { status: 500 });
  }
}
