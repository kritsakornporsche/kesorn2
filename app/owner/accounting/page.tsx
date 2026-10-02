'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

interface Transaction {
  id: number;
  type: string;
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
}

interface MonthlySummary {
  year: number;
  month: number;
  income: number;
  expense: number;
}

const monthNames = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

export default function OwnerAccounting() {
  const { data: session } = useSession();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary[]>([]);
  const [totals, setTotals] = useState({ income: 0, expense: 0, profit: 0 });
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: 'Income', category: 'Rent', amount: 0, description: '', transaction_date: new Date().toISOString().split('T')[0] });

  const [dormId, setDormId] = useState<number>(1);

  const load = (id = 1) => {
    setLoading(true);
    fetch(`/api/owner/accounting?dormId=${id}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setTransactions(d.transactions);
          setMonthly(d.monthlySummary);
          setTotals(d.totals);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    const email = localStorage.getItem('userEmail') || session?.user?.email || 'owner@kaset2.com';
    fetch(`/api/owner/onboarding?email=${email}`)
      .then(res => res.json())
      .then(data => {
        if (data.success && data.hasDorm) {
          setDormId(data.dorm.id);
          load(data.dorm.id);
        } else {
          load(1);
        }
      })
      .catch(() => load(1));
  }, [session]);

  const handleSubmit = async () => {
    await fetch('/api/owner/accounting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, dorm_id: dormId }),
    });
    setShowForm(false);
    setForm({ type: 'Income', category: 'Rent', amount: 0, description: '', transaction_date: new Date().toISOString().split('T')[0] });
    load(dormId);
  };

  const fmt = (n: number) => Number(n).toLocaleString('th-TH');

  if (loading) return (
    <div className="flex-1 flex items-center justify-center bg-secondary/40">
      <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
    </div>
  );

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-secondary/40">
      <header className="h-20 bg-card/60 backdrop-blur-md border-b border-white/20/10 flex items-center justify-between px-10 shrink-0 sticky top-0 z-10">
        <div>
          <h1 className="text-xl font-black tracking-tight text-white">บัญชีหอพัก</h1>
          <p className="text-[10px] font-bold text-foreground/50 uppercase tracking-widest mt-0.5">Dormitory Accounting</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
        >
          + บันทึกรายการ
        </button>
      </header>

      <div className="flex-1 overflow-y-auto p-10">
        <div className="max-w-6xl mx-auto space-y-8">

          {/* KPI Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="bg-card border border-white/20/10 shadow-sm rounded-2xl p-6">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">รายรับรวม</p>
              <p className="text-3xl font-black text-[#10B981]">฿{fmt(totals.income)}</p>
            </div>
            <div className="bg-card border border-white/20/10 shadow-sm rounded-2xl p-6">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">รายจ่ายรวม</p>
              <p className="text-3xl font-black text-[#EF4444]">฿{fmt(totals.expense)}</p>
            </div>
            <div className="bg-card border border-white/20/10 shadow-sm rounded-2xl p-6">
              <p className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-1">กำไรสุทธิ</p>
              <p className={`text-3xl font-black ${totals.profit >= 0 ? 'text-white' : 'text-[#EF4444]'}`}>
                ฿{fmt(totals.profit)}
              </p>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="bg-card border border-white/20/10 shadow-sm rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/20/10 bg-card">
              <h3 className="text-white font-bold">รายการทั้งหมด</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[600px]">
                <thead>
                  <tr className="border-b border-white/20/10">
                    <th className="text-left px-6 py-3 text-muted-foreground text-xs uppercase tracking-widest font-bold">วันที่</th>
                    <th className="text-left px-6 py-3 text-muted-foreground text-xs uppercase tracking-widest font-bold">ประเภท</th>
                    <th className="text-left px-6 py-3 text-muted-foreground text-xs uppercase tracking-widest font-bold">หมวด</th>
                    <th className="text-left px-6 py-3 text-muted-foreground text-xs uppercase tracking-widest font-bold">รายละเอียด</th>
                    <th className="text-right px-6 py-3 text-muted-foreground text-xs uppercase tracking-widest font-bold">จำนวน</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD3]">
                  {transactions.length === 0 ? (
                    <tr><td colSpan={5} className="px-6 py-12 text-center text-muted-foreground text-sm">ยังไม่มีรายการ</td></tr>
                  ) : transactions.map(t => (
                    <tr key={t.id} className="hover:bg-card transition-colors">
                      <td className="px-6 py-4 text-white/80">{t.transaction_date ? new Date(t.transaction_date).toLocaleDateString('th-TH') : '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                          t.type === 'Income' ? 'bg-[#10B981]/10 text-[#10B981]' : 'bg-[#EF4444]/10 text-[#EF4444]'
                        }`}>{t.type === 'Income' ? 'รายรับ' : 'รายจ่าย'}</span>
                      </td>
                      <td className="px-6 py-4 text-white/80">{t.category}</td>
                      <td className="px-6 py-4 text-white">{t.description || '-'}</td>
                      <td className={`px-6 py-4 text-right font-bold ${t.type === 'Income' ? 'text-[#10B981]' : 'text-[#EF4444]'}`}>
                        {t.type === 'Income' ? '+' : '-'}฿{fmt(Number(t.amount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Add Transaction Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto" onClick={() => setShowForm(false)}>
          <div className="bg-card border border-white/20/10 rounded-2xl p-6 sm:p-8 w-full max-w-md shadow-2xl my-auto" onClick={e => e.stopPropagation()}>
            <h2 className="text-white font-black text-lg mb-6">บันทึกรายการใหม่</h2>
            <div className="space-y-4">
              <div>
                <label className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1.5">ประเภท</label>
                <select
                  value={form.type}
                  onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                  className="w-full bg-card border border-white/20/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary"
                >
                  <option value="Income">รายรับ (Income)</option>
                  <option value="Expense">รายจ่าย (Expense)</option>
                </select>
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1.5">หมวดหมู่</label>
                <input
                  value={form.category}
                  onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                  className="w-full bg-card border border-white/20/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary"
                  placeholder="เช่น ค่าเช่า, ค่าซ่อมบำรุง"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1.5">จำนวน (บาท)</label>
                  <input
                    type="number"
                    value={form.amount}
                    onChange={e => setForm(f => ({ ...f, amount: Number(e.target.value) }))}
                    className="w-full bg-card border border-white/20/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1.5">วันที่</label>
                  <input
                    type="date"
                    value={form.transaction_date}
                    onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
                    className="w-full bg-card border border-white/20/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="text-muted-foreground text-xs font-bold uppercase tracking-wider block mb-1.5">รายละเอียด</label>
                <input
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  className="w-full bg-card border border-white/20/10 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-primary"
                  placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowForm(false)} className="flex-1 py-3 bg-card text-muted-foreground rounded-xl font-bold text-sm hover:bg-white/10 transition-colors border border-white/20/10">ยกเลิก</button>
                <button onClick={handleSubmit} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20">บันทึก</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
