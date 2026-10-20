import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { getDb } from '@/lib/db';
import { changeContractData, confirmContractData, contractDataStatus, contractDataView } from '@/lib/contract-data';
import { serverErrorMessage } from '@/lib/db-errors';

// Step 3 of booking → tenant (commit 28, lib/contract-data.ts). Owner / manager only.
// GET — the contract data, whether it can be confirmed / changed, and the change history.
// POST { action: 'confirm' | 'change', tenantName, tenantAddress, occupants, startDate, endDate, reason? }

const idOf = async (params: Promise<{ id: string }>) => Number((await params).id);

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const contractId = await idOf(params);
    const view = Number.isInteger(contractId) && contractId > 0 ? await contractDataView(getDb(), contractId) : null;
    if (!view) return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    return NextResponse.json({ success: true, ...view });
  } catch (error) {
    console.error('[Contract data GET Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'โหลดข้อมูลสัญญาไม่สำเร็จ') }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const contractId = await idOf(params);
    if (!Number.isInteger(contractId) || contractId <= 0) return NextResponse.json({ success: false, message: 'ไม่พบข้อมูลสัญญาเช่า' }, { status: 404 });
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object') return NextResponse.json({ success: false, message: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    const input = { tenantName: body.tenantName, tenantAddress: body.tenantAddress, occupants: body.occupants, startDate: body.startDate, endDate: body.endDate };
    const now = new Date();
    if (body.action === 'confirm') {
      const result = await confirmContractData(contractId, input, guard.user.id, now);
      if (!result.ok) return NextResponse.json({ success: false, message: result.message, reason: result.reason }, { status: contractDataStatus(result.reason) });
      return NextResponse.json({ success: true, message: 'ยืนยันข้อมูลสัญญาแล้ว — ข้อมูลถูกล็อก ขั้นถัดไป: ตรวจสภาพห้อง', data: result.data });
    }
    if (body.action === 'change') {
      const result = await changeContractData(contractId, input, body.reason, guard.user.id, now);
      if (!result.ok) return NextResponse.json({ success: false, message: result.message, reason: result.reason }, { status: contractDataStatus(result.reason) });
      return NextResponse.json({ success: true, message: `แก้ข้อมูลสัญญาแล้ว (${result.changes.map((c) => c.label).join(', ')}) และแจ้งผู้จองแล้ว`, changes: result.changes });
    }
    return NextResponse.json({ success: false, message: 'action ต้องเป็น confirm หรือ change' }, { status: 400 });
  } catch (error) {
    console.error('[Contract data POST Error]', error);
    return NextResponse.json({ success: false, message: serverErrorMessage(error, 'บันทึกข้อมูลสัญญาไม่สำเร็จ') }, { status: 500 });
  }
}
