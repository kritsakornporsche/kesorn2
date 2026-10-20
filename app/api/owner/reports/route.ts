import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';
import { bangkokDate } from '@/lib/billing';
import { isMonth, ownerReport, reportCsv } from '@/lib/reports';

// GET ?month=YYYY-MM[&format=csv] — owner report (lib/reports.ts).
// Owner: everything. Manager: occupancy and unpaid bills only (no income, expense or deposits), also in the CSV.
export async function GET(req: Request) {
  const guard = await requireRole(['owner', 'manager']);
  if ('response' in guard) return guard.response;
  try {
    const search = new URL(req.url).searchParams;
    const now = new Date();
    const month = search.get('month') || bangkokDate(now).slice(0, 7);
    if (!isMonth(month)) {
      return NextResponse.json({ success: false, message: 'เดือนไม่ถูกต้อง (YYYY-MM)' }, { status: 400 });
    }
    const report = await ownerReport(month, guard.user.role === 'owner' ? 'owner' : 'manager', now);
    if (search.get('format') === 'csv') {
      const filename = `รายงานหอพัก_${month}.csv`;
      return new Response(reportCsv(report), {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="report_${month}.csv"; filename*=UTF-8''${encodeURIComponent(filename)}`,
          'Cache-Control': 'private, no-store',
        },
      });
    }
    return NextResponse.json({ success: true, data: report });
  } catch (err) {
    console.error('[GET /api/owner/reports]', err);
    return NextResponse.json({ success: false, message: 'โหลดรายงานไม่สำเร็จ' }, { status: 500 });
  }
}
