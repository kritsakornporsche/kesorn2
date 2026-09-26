import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { auth } from '@/auth';

export async function GET() {
  try {
    const session = await auth();
    if (!session || ((session.user as any)?.role !== 'platform_admin' && (session.user as any)?.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const platformSql = getDb();
    const transactions = await platformSql`
      SELECT a.*, d.dorm_name
      FROM platform_accounting a
      LEFT JOIN dormitory_registry d ON a.dormitory_id = d.id
      ORDER BY a.transaction_date DESC, a.created_at DESC
      LIMIT 100
    `;

    // Monthly summary
    const monthlySummary = await platformSql`
      SELECT 
        YEAR(transaction_date) as year,
        MONTH(transaction_date) as month,
        SUM(CASE WHEN type = 'Income' THEN amount ELSE 0 END) as income,
        SUM(CASE WHEN type IN ('Refund','Expense') THEN amount ELSE 0 END) as expense
      FROM platform_accounting
      GROUP BY YEAR(transaction_date), MONTH(transaction_date)
      ORDER BY year DESC, month DESC
      LIMIT 12
    `;

    const totalIncome = transactions
      .filter((t: any) => t.type === 'Income')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);
    const totalExpense = transactions
      .filter((t: any) => t.type !== 'Income')
      .reduce((s: number, t: any) => s + Number(t.amount), 0);

    return NextResponse.json({
      success: true,
      transactions,
      monthlySummary,
      totals: { income: totalIncome, expense: totalExpense, profit: totalIncome - totalExpense },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session || ((session.user as any)?.role !== 'platform_admin' && (session.user as any)?.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Unauthorized' }, { status: 401 });
    }

    const { type, category, amount, description, dormitory_id, transaction_date } = await request.json();
    if (!type || !amount || !transaction_date) {
      return NextResponse.json({ success: false, message: 'Missing fields' }, { status: 400 });
    }
    const platformSql = getDb();
    const result = await platformSql`
      INSERT INTO platform_accounting (type, category, amount, description, dormitory_id, transaction_date)
      VALUES (${type}, ${category || 'Service'}, ${amount}, ${description || ''}, ${dormitory_id || null}, ${transaction_date})
    `;
    return NextResponse.json({ success: true, message: 'บันทึกรายการสำเร็จ' }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message }, { status: 500 });
  }
}
