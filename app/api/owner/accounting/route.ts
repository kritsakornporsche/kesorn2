import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET(req: Request) {
  try {
    const session = await auth();
    if (!session || !session.user) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const dormId = parseInt(searchParams.get('dormId') || (session.user as any)?.dormId || '1', 10);
    const sql = getDb();
    
    const transactions = await sql`
      SELECT * FROM accounting_transactions
      WHERE dorm_id = ${dormId}
      ORDER BY transaction_date DESC, created_at DESC
      LIMIT 100
    `;

    // Monthly summary
    const monthlySummary = await sql`
      SELECT 
        YEAR(transaction_date) as year,
        MONTH(transaction_date) as month,
        SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type = 'Expense' THEN amount ELSE 0 END) as expense
      FROM accounting_transactions
      WHERE dorm_id = ${dormId}
      GROUP BY YEAR(transaction_date), MONTH(transaction_date)
      ORDER BY year DESC, month DESC
      LIMIT 12
    `;

    const totalIncome = transactions
      .filter((t: any) => t.type === 'Income')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalExpense = transactions
      .filter((t: any) => t.type === 'Expense')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    return NextResponse.json({
      success: true,
      transactions,
      monthlySummary,
      totals: { income: totalIncome, expense: totalExpense, profit: totalIncome - totalExpense },
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
    if ((session.user as any)?.role !== 'owner') {
      return NextResponse.json({ success: false, message: 'Forbidden: Owner role required' }, { status: 403 });
    }

    const body = await req.json();
    const { type, category, amount, description, dorm_id } = body;
    const txDate = body.transaction_date || body.date || new Date().toISOString().slice(0, 10);

    if (!type || !category || amount === undefined) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
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
