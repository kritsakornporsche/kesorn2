import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { INSPECTABLE, MAX_ITEMS, STATUS_TEXT, acknowledgeOnPaper, defaultItemsFor, getInspection, refusalStatus, saveInspection, type InspectionKind } from '@/lib/inspections';

const kindParam = (v: unknown): InspectionKind => (v === 'move_out' ? 'move_out' : 'move_in');
import { PHOTOS_TOTAL_MAX_BYTES } from '@/lib/inspection-files';
import { BOOKING_PAID_STATUSES } from '@/lib/booking-steps';
import { isPaper } from '@/lib/contract-files';
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
      SELECT c.id, c.status, c.room_id, c.data_confirmed_at, c.contract_file_url, r.room_number, t.name AS tenant_name
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
    // commit 28-3: a booking is inspected after its contract data is confirmed (step 3)
    const notConfirmed = kind === 'move_in' && BOOKING_PAID_STATUSES.includes(contract.status) && !contract.data_confirmed_at && !isPaper(contract.contract_file_url);
    const canEdit = kind === 'move_in' ? INSPECTABLE.includes(contract.status) && !notConfirmed : openMoveOut;
    return NextResponse.json({
      success: true,
      contract: { id: contract.id, status: contract.status, room_number: contract.room_number, tenant_name: contract.tenant_name },
      inspection,
      status,
      status_text: STATUS_TEXT[status],
      kind,
      editable: canEdit && status !== 'acknowledged',
      blocked_reason: notConfirmed ? 'ตรวจห้องได้หลังหอพักยืนยันข้อมูลสัญญา (ขั้น 3)' : null,
      defaults: inspection ? [] : await defaultItemsFor(contractId, contract.room_id, kind),
      move_in: kind === 'move_out' ? await getInspection(contractId, 'move_in') : null,
      max_items: MAX_ITEMS,
    });
  } catch (error: any) {
    console.error('[Inspection GET Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'โหลดผลตรวจห้องไม่สำเร็จ') }, { status: 500 });
  }
}

// PATCH { action: 'ack_paper' } — the tenant acknowledged the move-in inspection on paper (signed the printed record);
// recorded by the owner / manager, who and when kept (commit 28-3, lib/inspections.ts acknowledgeOnPaper).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const contractId = Number((await params).id);
    const body = await req.json().catch(() => ({}));
    if (body?.action !== 'ack_paper') return NextResponse.json({ success: false, message: 'action ต้องเป็น ack_paper' }, { status: 400 });
    if (!Number.isInteger(contractId) || contractId <= 0) return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    const result = await acknowledgeOnPaper(contractId, guard.user, new Date());
    if (!result.ok) return NextResponse.json({ success: false, message: result.message }, { status: refusalStatus(result.reason) });
    return NextResponse.json({ success: true, message: 'บันทึกว่าผู้เช่ารับทราบผลตรวจห้องบนกระดาษแล้ว', inspection: await getInspection(contractId, 'move_in') });
  } catch (error: any) {
    console.error('[Inspection PATCH Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'บันทึกการรับทราบไม่สำเร็จ') }, { status: 500 });
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
    // Send WebPush & In-App Notification to tenant
    try {
      const sql = getDb();
      const rows = await sql`
        SELECT c.id, r.room_number, COALESCE(t.user_id, u.id) as tenant_user_id, COALESCE(u.email, t.email) as tenant_email
        FROM contracts c
        LEFT JOIN rooms r ON r.id = c.room_id
        LEFT JOIN tenants t ON t.id = c.tenant_id
        LEFT JOIN users u ON LOWER(t.email) = LOWER(u.email)
        WHERE c.id = ${Number(id)}
        LIMIT 1
      `;
      if (rows.length > 0 && rows[0].tenant_user_id) {
        const { createUserNotification } = await import('@/lib/notifications');
        const k = kindParam(body?.kind);
        const title = k === 'move_out' ? '📋 หอพักบันทึกผลตรวจห้องย้ายออกแล้ว' : '📋 หอพักบันทึกผลตรวจสภาพห้องแล้ว';
        const msg = k === 'move_out'
          ? `ห้อง ${rows[0].room_number}: ผลตรวจสภาพห้องก่อนย้ายออกพร้อมให้ตรวจสอบแล้ว`
          : `ห้อง ${rows[0].room_number}: กรุณาตรวจสอบสภาพห้องพักและกดยืนยันรับทราบในระบบ`;
        await createUserNotification({
          userId: rows[0].tenant_user_id,
          userEmail: rows[0].tenant_email,
          title,
          message: msg,
          type: 'inspection',
          link: '/guest',
        });
      }
    } catch (ne) {
      console.warn('[Inspection save notify warn]:', ne);
    }

    return NextResponse.json({ success: true, message: 'บันทึกผลตรวจห้องแล้ว รอผู้เช่ารับทราบ', inspection: await getInspection(Number(id), kindParam(body?.kind)) });
  } catch (error: any) {
    console.error('[Inspection POST Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'บันทึกผลตรวจห้องไม่สำเร็จ', 'storage/inspections') }, { status: 500 });
  }
}
