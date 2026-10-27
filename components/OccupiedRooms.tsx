'use client';

// Rooms that already have a tenant (commit 28-12): not offered for a walk-in or a pre-system tenant (the server refuses
// them — lib/contracts createContractTx). Picking one here says what to do instead — a second person in the room is
// added on the room's contract (number of occupants) — with a link to that contract.

import { useEffect, useState } from 'react';
import Link from 'next/link';

export const OCCUPIED_ROOM_TEXT = 'ห้องนี้มีผู้เช่าแล้ว หากมีผู้พักเพิ่ม ให้แก้จำนวนผู้พักที่หน้าสัญญา';

/** Contract statuses that hold a room — as lib/contracts ROOM_HOLDING_STATUSES (that file is server-only) */
export const HOLDING_STATUSES = ['BookingRequested', 'BookingApproved', 'PendingOwnerSignature', 'PendingContract', 'PendingFirstBill', 'Active', 'MoveOutPending'];

type Held = { room: string; contractId: number; status: string };

export default function OccupiedRooms({ tone = 'dark' }: { tone?: 'dark' | 'theme' }) {
  const [held, setHeld] = useState<Held[]>([]);
  const [picked, setPicked] = useState<Held | null>(null);

  useEffect(() => {
    fetch('/api/owner/contracts')
      .then((r) => r.json())
      .then((d) => {
        if (!d.success || !Array.isArray(d.data)) return;
        const byRoom = new Map<string, Held>();
        for (const c of d.data) {
          if (!HOLDING_STATUSES.includes(c.status) || !c.room_number) continue;
          const prev = byRoom.get(c.room_number);
          // the Active contract of the room first
          if (!prev || (c.status === 'Active' && prev.status !== 'Active')) byRoom.set(c.room_number, { room: c.room_number, contractId: c.id, status: c.status });
        }
        setHeld([...byRoom.values()].sort((a, b) => a.room.localeCompare(b.room, 'th', { numeric: true })));
      })
      .catch(() => {});
  }, []);

  if (held.length === 0) return null;
  const dark = tone === 'dark';
  return (
    <div className={`space-y-2 text-[11px] ${dark ? 'text-slate-400' : 'text-muted-foreground'}`} data-occupied-rooms>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="font-bold">ห้องที่มีผู้เช่าแล้ว (ไม่อยู่ในรายการ):</span>
        {held.map((h) => (
          <button
            key={h.room}
            type="button"
            onClick={() => setPicked(picked?.room === h.room ? null : h)}
            aria-pressed={picked?.room === h.room}
            className={`px-2 py-0.5 rounded-lg border font-bold ${
              picked?.room === h.room
                ? 'border-amber-400/60 bg-amber-500/15 text-amber-300'
                : dark ? 'border-white/10 hover:border-white/30 text-slate-300' : 'border-border hover:border-primary text-foreground'
            }`}
          >
            {h.room}
          </button>
        ))}
      </div>
      {picked && (
        <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-200 flex flex-wrap items-center justify-between gap-2" role="status">
          <span className="font-bold">ห้อง {picked.room}: {OCCUPIED_ROOM_TEXT}</span>
          <Link href={`/owner/contracts/${picked.contractId}`} className="px-3 py-1.5 rounded-lg bg-amber-500 text-white font-black hover:bg-amber-400">
            เปิดหน้าสัญญาห้อง {picked.room} →
          </Link>
        </div>
      )}
    </div>
  );
}
