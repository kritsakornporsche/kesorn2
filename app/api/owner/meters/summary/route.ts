import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { requireRole } from '@/lib/authz';
import { calcDueDate, calcMonthlyBill, getRates, moveInCover, ratesForRoom, withoutMoveInCover } from '@/lib/billing';
import { LARGE_UNITS, cycleFor, rolloverDefault } from '@/lib/meters';

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

// GET — every room with the cycle being recorded now (lib/meters.ts cycleFor, Thai time), the previous reading the
// next reading counts from, this cycle's reading and monthly bill. ?roomId= — the room's reading history.
export async function GET(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const roomId = new URL(req.url).searchParams.get('roomId');
    const sql = getDb();
    const now = new Date();
    const cycle = cycleFor(now);

    if (roomId) {
      const roomRes = await sql`SELECT id, room_number, room_type, floor, price, status FROM rooms WHERE id = ${roomId} LIMIT 1`;
      if (roomRes.length === 0) return NextResponse.json({ success: false, message: 'ไม่พบห้องนี้' }, { status: 404 });
      const history = await sql`
        SELECT m.id, m.billing_cycle, m.kind, m.event, m.previous_reading, m.current_reading, m.units_used, m.photo_url,
          m.rollover_at, m.old_meter_final, m.new_meter_start, m.event_note, m.large_confirmed,
          COALESCE(m.recorded_at, m.created_at) AS recorded_at, u.name AS recorded_by_name,
          (SELECT b.status FROM bills b WHERE m.kind = 'cycle' AND b.room_number = ${roomRes[0].room_number} AND b.billing_cycle = m.billing_cycle
             AND COALESCE(b.bill_type, 'monthly') = 'monthly' AND COALESCE(b.is_first_bill, 0) = 0
             AND LOWER(b.status) NOT IN ('cancelled', 'canceled') ORDER BY b.id LIMIT 1) AS bill_status,
          (SELECT b.id FROM bills b WHERE m.kind = 'cycle' AND b.room_number = ${roomRes[0].room_number} AND b.billing_cycle = m.billing_cycle
             AND COALESCE(b.bill_type, 'monthly') = 'monthly' AND COALESCE(b.is_first_bill, 0) = 0
             AND LOWER(b.status) NOT IN ('cancelled', 'canceled') ORDER BY b.id LIMIT 1) AS bill_id
        FROM meter_readings m LEFT JOIN users u ON u.id = m.recorded_by
        WHERE m.room_id = ${roomId} AND m.type IN ('Electricity', 'Electric')
        ORDER BY m.id DESC
      `;
      return NextResponse.json({ success: true, room: roomRes[0], cycle, history });
    }

    const rooms = await sql`
      SELECT r.id, r.room_number, r.floor, r.room_type, r.price, r.status,
        c.status AS contract_status, c.tenant_id, c.occupants, c.start_meter_reading, c.start_date, c.move_in_bill_id, t.name AS tenant_name
      FROM rooms r
      LEFT JOIN contracts c ON c.id = (SELECT c2.id FROM contracts c2 WHERE c2.room_id = r.id AND c2.status = 'Active' ORDER BY c2.id DESC LIMIT 1)
      LEFT JOIN tenants t ON c.tenant_id = t.id
      ORDER BY CAST(r.room_number AS UNSIGNED) ASC, r.room_number ASC
    `;
    const rates = await getRates(sql);
    const summary = [];
    for (const room of rooms) {
      const latest = (await sql`
        SELECT id, billing_cycle, kind, previous_reading, current_reading, units_used, photo_url, COALESCE(recorded_at, created_at) AS recorded_at
        FROM meter_readings WHERE room_id = ${room.id} AND type IN ('Electricity', 'Electric') ORDER BY id DESC LIMIT 1
      `)[0];
      const cycleRow = (await sql`
        SELECT id, previous_reading, current_reading, units_used, event, photo_url FROM meter_readings
        WHERE room_id = ${room.id} AND type IN ('Electricity', 'Electric') AND kind = 'cycle' AND billing_cycle = ${cycle} LIMIT 1
      `)[0];
      const bill = (await sql`
        SELECT id, status FROM bills WHERE room_number = ${room.room_number} AND billing_cycle = ${cycle}
          AND COALESCE(bill_type, 'monthly') = 'monthly' AND COALESCE(is_first_bill, 0) = 0
          AND LOWER(status) NOT IN ('cancelled', 'canceled') ORDER BY id LIMIT 1
      `)[0];
      // The number the next reading counts from (for a correction: the row before this cycle's reading)
      let previousForRecord: number | null;
      if (cycleRow) {
        const before = (await sql`
          SELECT current_reading FROM meter_readings WHERE room_id = ${room.id} AND type IN ('Electricity', 'Electric') AND id < ${cycleRow.id}
          ORDER BY id DESC LIMIT 1
        `)[0];
        previousForRecord = before ? Number(before.current_reading) : num(room.start_meter_reading);
      } else {
        previousForRecord = latest ? Number(latest.current_reading) : num(room.start_meter_reading);
      }
      const active = room.contract_status === 'Active';

      summary.push({
        room_id: room.id,
        room_number: room.room_number,
        floor: room.floor,
        room_type: room.room_type,
        room_status: room.status,
        contract_status: room.contract_status || null,
        tenant_name: room.tenant_name || null,
        tenant_id: room.tenant_id || null,
        price: room.price,
        latest_cycle: latest?.billing_cycle || '-',
        latest_kind: latest?.kind || null,
        latest_reading: latest ? Number(latest.current_reading) : null,
        previous_reading: latest ? num(latest.previous_reading) : null,
        units_used: latest ? num(latest.units_used) : null,
        photo_url: latest?.photo_url || null,
        created_at: latest?.recorded_at || null,
        // This cycle
        cycle,
        needs_reading: active,
        previous_for_record: previousForRecord,
        rollover_default: previousForRecord === null ? null : rolloverDefault(previousForRecord),
        cycle_reading: cycleRow
          ? { id: cycleRow.id, previous: num(cycleRow.previous_reading), current: num(cycleRow.current_reading), units: num(cycleRow.units_used), event: cycleRow.event, photo_url: cycleRow.photo_url || null }
          : null,
        cycle_bill: bill ? { id: bill.id, status: bill.status } : null,
        can_record: active && (!bill || String(bill.status).toLowerCase() === 'draft'),
        // Server-side price of the bill this cycle's reading would produce (the page only displays it)
        bill_preview: cycleRow && active
          ? {
              ...withoutMoveInCover(
                calcMonthlyBill({ roomPrice: room.price, unitsUsed: cycleRow.units_used, occupants: room.occupants, rates: ratesForRoom(rates, room.room_number) }),
                await moveInCover(sql, room, cycle)
              ),
              due_date: calcDueDate(cycle, now),
            }
          : null,
      });
    }
    return NextResponse.json({ success: true, cycle, largeUnits: LARGE_UNITS, data: summary });
  } catch (error: any) {
    console.error('[GET /api/owner/meters/summary]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลมิเตอร์ไม่สำเร็จ' }, { status: 500 });
  }
}
