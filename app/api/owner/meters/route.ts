import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { meterRefusalStatus, recordReading, type ReadingInput } from '@/lib/meters';
import { METER_PHOTO_MAX_BYTES } from '@/lib/meter-files';

const BODY_MAX_CHARS = Math.ceil(METER_PHOTO_MAX_BYTES / 3) * 4 + 64 * 1024;

// GET — readings of a billing cycle (?billing_cycle=YYYY-MM) or the latest 200. Owner/manager.
export async function GET(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const billingCycle = new URL(req.url).searchParams.get('billing_cycle');
    const sql = getDb();
    const readings = billingCycle && billingCycle !== 'all'
      ? await sql`
          SELECT m.id, m.room_id, m.type, m.kind, m.event, m.billing_cycle, m.previous_reading, m.current_reading, m.units_used,
            m.photo_url, m.recorded_at, m.created_at, r.room_number
          FROM meter_readings m JOIN rooms r ON m.room_id = r.id
          WHERE m.billing_cycle = ${billingCycle}
          ORDER BY r.room_number ASC, m.id ASC`
      : await sql`
          SELECT m.id, m.room_id, m.type, m.kind, m.event, m.billing_cycle, m.previous_reading, m.current_reading, m.units_used,
            m.photo_url, m.recorded_at, m.created_at, r.room_number
          FROM meter_readings m JOIN rooms r ON m.room_id = r.id
          ORDER BY m.id DESC
          LIMIT 200`;
    return NextResponse.json({ success: true, data: readings });
  } catch (error: any) {
    console.error('[GET /api/owner/meters]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลมิเตอร์ไม่สำเร็จ' }, { status: 500 });
  }
}

const inputOf = (b: any): ReadingInput => ({
  current: b.current_reading,
  event: b.event,
  rolloverAt: b.rollover_at,
  oldMeterFinal: b.old_meter_final,
  newMeterStart: b.new_meter_start,
  note: b.event_note,
  confirmLarge: b.confirm_large === true,
  photo: b.photo,
  previous: b.previous_if_none,
});

// POST { room_id, current_reading, event?, rollover_at?, old_meter_final?, new_meter_start?, event_note?, confirm_large?, photo?,
//        previous_if_none? } — the electricity reading of the current cycle (lib/meters.ts decides the cycle and the
// previous reading; a previous_reading sent by the page is ignored). Or { items: [...] } without photos: one result per room.
export async function POST(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const raw = await req.text();
    if (raw.length > BODY_MAX_CHARS) return NextResponse.json({ success: false, message: 'รูปมิเตอร์ต้องมีขนาดไม่เกิน 10MB' }, { status: 413 });
    let body: any;
    try { body = JSON.parse(raw); } catch { return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 }); }
    const now = new Date();

    if (Array.isArray(body.items)) {
      const results = [];
      for (const item of body.items) {
        if (item?.photo) {
          results.push({ room_id: item?.room_id, ok: false, message: 'การบันทึกหลายห้องพร้อมกันไม่รับรูป — บันทึกทีละห้อง' });
          continue;
        }
        const r = await recordReading(Number(item?.room_id), inputOf(item || {}), guard.user, now);
        results.push(r.ok ? { room_id: item.room_id, ok: true, units: r.units, cycle: r.cycle } : { room_id: item?.room_id, ok: false, message: r.message });
      }
      const saved = results.filter((r) => r.ok).length;
      return NextResponse.json({ success: saved > 0, message: `บันทึกมิเตอร์สำเร็จ ${saved} จาก ${results.length} ห้อง`, results });
    }

    const r = await recordReading(Number(body.room_id), inputOf(body), guard.user, now);
    if (!r.ok) return NextResponse.json({ success: false, reason: r.reason, message: r.message }, { status: meterRefusalStatus(r.reason) });
    const repriced = r.draftRepriced ? ` · คิดราคาบิลร่าง #${r.draftBillId} ใหม่แล้ว` : '';
    return NextResponse.json({
      success: true,
      message: `${r.updated ? 'แก้ไข' : 'บันทึก'}มิเตอร์ห้อง ${r.roomNumber} รอบ ${r.cycle} แล้ว (${r.units} หน่วย)${repriced}`,
      data: { id: r.readingId, cycle: r.cycle, previous: r.previous, current: r.current, units: r.units, event: r.event, updated: r.updated },
    }, { status: r.updated ? 200 : 201 });
  } catch (error: any) {
    console.error('[POST /api/owner/meters]', error);
    return NextResponse.json({ success: false, message: 'บันทึกมิเตอร์ไม่สำเร็จ' }, { status: 500 });
  }
}
