'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';

interface Tenant {
  id: number;
  name: string;
  email: string;
  phone: string;
  room_number: string;
  status: string;
}

export default function TenantsManagement() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Search & Filter state (Rule 12)
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tenants?dormId=1`);
      const data = await res.json();
      if (data.success) {
        setTenants(data.data || []);
      }
    } catch (err) {
      console.error('Fetch tenants error:', err);
    } finally {
      setLoading(false);
    }
  };

  const { data: session, status: authStatus } = useSession();

  useEffect(() => {
    if (authStatus === 'unauthenticated') {
      router.push('/signin?callbackUrl=/owner/tenants');
      return;
    }
    fetchTenants();
  }, [authStatus, router]);

  const filteredTenants = tenants.filter((t) => {
    if (statusFilter !== 'ALL') {
      if (t.status?.toLowerCase() !== statusFilter.toLowerCase()) return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchRoom = t.room_number?.toLowerCase().includes(q);
      const matchName = t.name?.toLowerCase().includes(q);
      const matchPhone = t.phone?.toLowerCase().includes(q);
      const matchEmail = t.email?.toLowerCase().includes(q);
      if (!matchRoom && !matchName && !matchPhone && !matchEmail) return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 lg:p-10 space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-3xl">👥</span>
            <div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">ทะเบียนผู้เช่า (Tenant Directory)</h1>
              <p className="text-xs sm:text-sm text-slate-400 mt-0.5">รายชื่อ ข้อมูลติดต่อ และสถานะสัญญาของผู้เช่าทั้งหมด</p>
            </div>
          </div>
        </div>

        <button
          onClick={fetchTenants}
          className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white font-bold text-xs rounded-xl border border-white/10 transition-all flex items-center gap-2 self-start sm:self-auto"
        >
          <span>🔄</span>
          <span>รีเฟรช</span>
        </button>
      </div>

      {/* Search & Filter Controls (Rule 12) */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-stretch sm:items-center bg-slate-900/80 p-4 rounded-2xl border border-white/10 shadow-xl">
        <div className="flex items-center gap-2 overflow-x-auto">
          <button
            onClick={() => setStatusFilter('ALL')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              statusFilter === 'ALL' ? 'bg-primary text-white shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            ทั้งหมด ({tenants.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-4 py-2 rounded-xl text-xs font-black transition-all ${
              statusFilter === 'active' ? 'bg-emerald-500 text-white shadow-md' : 'bg-slate-950 text-slate-400 hover:text-white border border-white/5'
            }`}
          >
            กำลังพักอยู่ ({tenants.filter(t => t.status?.toLowerCase() === 'active').length})
          </button>
        </div>

        <div className="relative min-w-[260px]">
          <input
            type="text"
            placeholder="ค้นหาเลขห้อง, ชื่อ, เบอร์โทร, อีเมล..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-primary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-2.5 text-xs text-slate-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Tenants Table */}
      <div className="bg-slate-900/80 rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
        {loading ? (
          <div className="p-16 text-center text-slate-400 font-bold animate-pulse">กำลังโหลดข้อมูลผู้เช่า...</div>
        ) : filteredTenants.length === 0 ? (
          <div className="p-16 text-center text-slate-400 font-bold space-y-2">
            <span className="text-4xl block">🔍</span>
            <p className="text-white">ไม่พบข้อมูลผู้เช่าตามเงื่อนไข</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead className="bg-slate-950/60 border-b border-white/10">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">ห้อง</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">ชื่อ-นามสกุล</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">เบอร์โทรศัพท์</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">อีเมล</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400">สถานะ</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase tracking-wider text-slate-400 text-right">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTenants.map((tenant) => (
                  <tr key={tenant.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-6 py-4 font-black text-primary text-base font-mono">
                      ห้อง {tenant.room_number || '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-primary/20 text-primary font-bold text-xs flex items-center justify-center">
                          {tenant.name?.charAt(0) || 'U'}
                        </div>
                        <span className="font-bold text-white text-sm">{tenant.name || 'ไม่ระบุชื่อ'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-mono text-slate-300">
                      {tenant.phone ? (
                        <div className="flex items-center gap-2">
                          <span>{tenant.phone}</span>
                          <a
                            href={`tel:${tenant.phone}`}
                            className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 rounded text-[10px] font-bold hover:bg-emerald-500 hover:text-white transition-colors"
                          >
                            โทร
                          </a>
                        </div>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400 truncate max-w-[200px]">{tenant.email || '-'}</td>
                    <td className="px-6 py-4">
                      <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                        {tenant.status === 'active' ? '🟢 กำลังพักอยู่' : tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <a
                        href={`/owner/chat?user=${tenant.email}`}
                        className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white text-xs font-bold rounded-lg border border-white/10 transition-colors inline-flex items-center gap-1"
                      >
                        <span>💬</span>
                        <span>แชท</span>
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
