import { getDb } from '@/lib/db';
import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { activateIfReady, missingMessage } from '@/lib/moveIn';

// POST — owner/manager confirms a contract. It takes effect only when the move-in bill is paid and the signed paper
// contract is uploaded (lib/moveIn.ts); otherwise the reply says what is still missing and nothing changes.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  const sql = getDb();

  try {
    const { id } = await params;
    const contractId = Number(id);

    const result = await activateIfReady(contractId);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.message }, { status: result.reason === 'not_found' ? 404 : 400 });
    }
    if (result.alreadyActive) {
      return NextResponse.json({ success: false, message: 'สัญญานี้มีผลอยู่แล้ว' }, { status: 400 });
    }
    if (!result.activated) {
      return NextResponse.json({ success: false, message: missingMessage(result.missing), missing: result.missing }, { status: 400 });
    }

    if (result.tenantUserId) {
      try {
        await sql`
          INSERT INTO notifications (user_id, title, message, type, is_read, link, created_at)
          VALUES (
            ${result.tenantUserId},
            'สัญญาเช่ามีผลแล้ว',
            'สัญญาเช่าของคุณมีผลแล้ว ยินดีต้อนรับสู่หอพักเกษร 2',
            'contract_approved',
            0,
            '/tenant/contract',
            ${new Date()}
          )
        `;
      } catch (ne) {
        console.warn('Sign contract notify warn:', ne);
      }
    }

    const updatedContracts = await sql`SELECT * FROM contracts WHERE id = ${contractId} LIMIT 1`;
    return NextResponse.json({
      success: true,
      message: 'Contract approved successfully',
      data: updatedContracts[0] || null
    });
  } catch (error: any) {
    console.error('Error approving contract:', error);
    return NextResponse.json({ success: false, message: error.message }, { status: 500 });
  }
}
