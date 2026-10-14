import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { INSPECTABLE, MAX_ITEMS, STATUS_TEXT, defaultItems, getMoveInInspection, refusalStatus, saveMoveInInspection } from '@/lib/inspections';
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/inspection-files';

// Base64 text of 20MB of photos plus the rest of the form; larger requests are refused before parsing
const BODY_MAX_CHARS = Math.ceil(PHOTOS_TOTAL_MAX_BYTES / 3) * 4 + 1024 * 1024;

// GET — the move-in inspection of a contract (or the starting items when not inspected yet). Owner/manager.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
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

    const inspection = await getMoveInInspection(contractId);
    const status = inspection?.status || 'none';
    return NextResponse.json({
      success: true,
      contract: { id: contract.id, status: contract.status, room_number: contract.room_number, tenant_name: contract.tenant_name },
      inspection,
      status,
      status_text: STATUS_TEXT[status],
      editable: INSPECTABLE.includes(contract.status) && status !== 'acknowledged',
      defaults: inspection ? [] : await defaultItems(contract.room_id),
      max_items: MAX_ITEMS,
    });
  } catch (error: any) {
    console.error('[Inspection GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดผลตรวจห้องไม่สำเร็จ' }, { status: 500 });
  }
}

// POST — save the move-in inspection: { note, items: [{ name, condition, note, photo?: dataUrl, keepPhoto?: file }] }
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

    const result = await saveMoveInInspection(Number(id), { items: body?.items, note: body?.note }, guard.user, new Date());
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message, item: result.item ?? null }, { status: refusalStatus(result.reason) });
    }
    return NextResponse.json({ success: true, message: 'บันทึกผลตรวจห้องแล้ว รอผู้เช่ารับทราบ', inspection: await getMoveInInspection(Number(id)) });
  } catch (error: any) {
    console.error('[Inspection POST Error]', error);
    return NextResponse.json({ success: false, message: 'บันทึกผลตรวจห้องไม่สำเร็จ' }, { status: 500 });
  }
}
