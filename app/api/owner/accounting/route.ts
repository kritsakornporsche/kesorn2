import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';
import { requireRole } from '@/lib/authz';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner']);
    if ('response' in guard) return guard.response;

    const { searchParams } = new URL(req.url);
    const dormId = parseInt(searchParams.get('dormId') || (session.user as any)?.dormId || '1', 10);
    const sql = getDb();
    
    // The list shows the latest 100 rows; totals below are summed over every row
    const rows = await sql`
      SELECT * FROM accounting_transactions
      WHERE dorm_id = ${dormId}
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 100
    `;
    // Before deposits were recorded as a liability, they were booked as Income/Deposit and refunds as Expense
    const transactions = rows.map((t: any) => ({
      ...t,
      legacy: (t.type === 'Income' && t.category === 'Deposit') || (t.type === 'Expense' && t.category === 'Deposit Refund'),
      category_label: t.category === 'deposit_reclass' ? 'ปรับปรุงเงินประกันแบบเดิม' : t.category,
    }));

    // Monthly summary
    const monthlySummary = await sql`
      SELECT 
        YEAR(transaction_date) as year,
        MONTH(transaction_date) as month,
        SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'Income' AND category = 'deposit_reclass' THEN amount ELSE 0 END) as deposit_reclass,
        SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as expense
      FROM accounting_transactions
      WHERE dorm_id = ${dormId}
      GROUP BY YEAR(transaction_date), MONTH(transaction_date)
      ORDER BY year DESC, month DESC
      LIMIT 12
    `;

    // Income and profit never include deposits (Liability); deposits held = sum of Liability rows only.
    // deposit_reclass rows are included in income: an old deposit once booked as Income is taken back out (negative) when
    // it is moved to Liability at move-out (lib/moveOut.ts), so after the refund it adds nothing to income. Shown as its own line.
    const [sums] = await sql`
      SELECT
        COALESCE(SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END), 0) as income,
        COALESCE(SUM(CASE WHEN type = 'Income' AND category = 'deposit_reclass' THEN amount ELSE 0 END), 0) as deposit_reclass,
        COALESCE(SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END), 0) as expense,
        COALESCE(SUM(CASE WHEN type = 'Liability' THEN amount ELSE 0 END), 0) as liability
      FROM accounting_transactions
      WHERE dorm_id = ${dormId}
    `;
    const round2 = (n: number) => Math.round(n * 100) / 100;
    const totalIncome = round2(Number(sums?.income || 0));
    const totalExpense = round2(Number(sums?.expense || 0));

    return NextResponse.json({
      success: true,
      transactions,
      monthlySummary,
      totals: {
        income: totalIncome,
        expense: totalExpense,
        profit: round2(totalIncome - totalExpense),
        depositsHeld: round2(Number(sums?.liability || 0)),
        // Part of income: old deposits moved back out of income ("ปรับปรุงเงินประกันแบบเดิม")
        depositReclass: round2(Number(sums?.deposit_reclass || 0)),
      },
    });
  } catch (err: any) {
    console.error('[Accounting API Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    const guard = await requireRole(['owner']);
    if ('response' in guard) return guard.response;

    const body = await req.json();
    const { type, category, amount, description, dorm_id } = body;
    const txDate = body.transaction_date || body.date || new Date().toISOString().slice(0, 10);

    if (!type || !category || amount === undefined) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }
    // Manual entries are income or expense only; deposits are recorded by the payment and move-out flows
    if (type !== 'Income' && type !== 'Expense') {
      return NextResponse.json({ success: false, message: 'ประเภทรายการต้องเป็นรายรับหรือรายจ่าย' }, { status: 400 });
    }
    if (!Number.isFinite(Number(amount))) {
      return NextResponse.json({ success: false, message: 'จำนวนเงินไม่ถูกต้อง' }, { status: 400 });
    }

    const dormId = parseInt(dorm_id || (session.user as any)?.dormId || '1', 10);
    const sql = getDb();
    const result = await sql`
      INSERT INTO accounting_transactions (dorm_id, type, category, amount, description, transaction_date)
      VALUES (${dormId}, ${type}, ${category}, ${amount}, ${description || null}, ${txDate})
    `;

    return NextResponse.json({ success: true, data: { id: (result as any).insertId } });
  } catch (err: any) {
    console.error('[Accounting POST Error]', err);
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
