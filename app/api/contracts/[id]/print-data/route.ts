import { NextResponse } from 'next/server';
import { canViewContract } from '@/lib/contract-files';
import { contractPrintData } from '@/lib/contract-print';

// GET — everything the printed contract shows (contract text input + move-in inspection record).
// Same access as the contract file: owner/manager, or the contract's own tenant (others 404).
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const contractId = Number((await params).id);
    const access = await canViewContract(contractId);
    if (!access.ok) {
      return NextResponse.json({ success: false, message: access.status === 401 ? 'กรุณาเข้าสู่ระบบ' : 'ไม่พบสัญญา' }, { status: access.status });
    }
    const data = await contractPrintData(contractId);
    if (!data) return NextResponse.json({ success: false, message: 'ไม่พบสัญญา' }, { status: 404 });
    const i = data.input;
    return NextResponse.json({
      success: true,
      contractId: data.id,
      input: i,
      // commit 28-2: not confirmed yet (step 3) — the page marks it ร่าง and does not print it
      draft: data.draft,
      inspectionSheet: {
        kind: 'move_in',
        contract: { id: data.id, start_date: i.startDate ?? null, end_date: i.endDate ?? null, room_number: i.roomNumber ?? null, floor: i.floor ?? null, tenant_name: i.tenantName ? `${i.tenantTitle || ''}${i.tenantName}` : null },
        party: i.party ?? null,
        inspection: data.inspection,
      },
    });
  } catch (error) {
    console.error('[Contract print-data GET Error]', error);
    return NextResponse.json({ success: false, message: 'โหลดข้อมูลสัญญาไม่สำเร็จ' }, { status: 500 });
  }
}
