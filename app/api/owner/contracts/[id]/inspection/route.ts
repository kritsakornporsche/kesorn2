import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { INSPECTABLE, MAX_ITEMS, STATUS_TEXT, defaultItemsFor, getInspection, refusalStatus, saveInspection, type InspectionKind } from '@/lib/inspections';

const kindParam = (v: unknown): InspectionKind => (v === 'move_out' ? 'move_out' : 'move_in');
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/inspection-files';
import { serverErrorMessage } from '@/lib/db-errors';

// Base64 text of 20MB of photos plus the rest of the form; larger requests are refused before parsing
const BODY_MAX_CHARS = Math.ceil(PHOTOS_TOTAL_MAX_BYTES / 3) * 4 + 1024 * 1024;

// GET ?kind=move_in|move_out — an inspection of a contract (or the starting items when not done yet). Owner/manager.
// For move_out the move-in result comes too, to compare item by item.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const contractId = Number(id);
    const sql = getDb();
    const rows = Number.isInteger(contractId) && contractId > 0 ? await sql`
      SELECT c.id, c.status, c.room_id, r.room_number, t.name AS tenant_name
      FROM contracts c LEFT JOIN rooms r ON r.id = c.room_id LEFT JOIN tenants t ON t.id = c.tenant_id
      WHERE c.id = ${contractId} LIMIT 1
    ` : [];
    const contract = rows[0];
    if (!contract) return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });

    const kind = kindParam(new URL(req.url).searchParams.get('kind'));
    const inspection = await getInspection(contractId, kind);
    const status = inspection?.status || 'none';
    // Move-out: while the move-out is open and the deposit not settled yet (lib/moveOut.ts)
    const openMoveOut = kind === 'move_out'
      ? (await sql`SELECT id FROM move_out_settlements WHERE contract_id = ${contractId} AND state IN ('Notified', 'Returned') LIMIT 1`).length > 0
      : false;
    const canEdit = kind === 'move_in' ? INSPECTABLE.includes(contract.status) : openMoveOut;
    return NextResponse.json({
      success: true,
      contract: { id: contract.id, status: contract.status, room_number: contract.room_number, tenant_name: contract.tenant_name },
      inspection,
      status,
      status_text: STATUS_TEXT[status],
      kind,
      editable: canEdit && status !== 'acknowledged',
      defaults: inspection ? [] : await defaultItemsFor(contractId, contract.room_id, kind),
      move_in: kind === 'move_out' ? await getInspection(contractId, 'move_in') : null,
      max_items: MAX_ITEMS,
    });
  } catch (error: any) {
    console.error('[Inspection GET Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'โหลดผลตรวจห้องไม่สำเร็จ') }, { status: 500 });
  }
}

// POST — save an inspection: { kind?: 'move_in' | 'move_out', note, items: [{ name, condition, note, photo?: dataUrl, keepPhoto?: file }] }
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const { id } = await params;
    const text = await req.text();
    if (text.length > BODY_MAX_CHARS) {
      return NextResponse.json({ success: false, message: `รูปรวมกันต้องไม่เกิน ${PHOTOS_TOTAL_MAX_BYTES / 1024 / 1024}MB ต่อการบันทึกหนึ่งครั้ง` }, { status: 413 });
    }
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }

    const result = await saveInspection(Number(id), kindParam(body?.kind), { items: body?.items, note: body?.note }, guard.user, new Date());
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message, item: result.item ?? null }, { status: refusalStatus(result.reason) });
    }
    return NextResponse.json({ success: true, message: 'บันทึกผลตรวจห้องแล้ว รอผู้เช่ารับทราบ', inspection: await getInspection(Number(id), kindParam(body?.kind)) });
  } catch (error: any) {
    console.error('[Inspection POST Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'บันทึกผลตรวจห้องไม่สำเร็จ', 'storage/inspections') }, { status: 500 });
  }
}
