import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getRates } from '@/lib/billing';

// Public: the same rates are already shown on the landing page and in /api/dorms
export async function GET() {
  try {
    const rates = await getRates(getDb());
    return NextResponse.json({ success: true, data: rates });
  } catch (error: any) {
    console.error('[Rates GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดอัตราค่าบริการไม่สำเร็จ' }, { status: 500 });
  }
}
