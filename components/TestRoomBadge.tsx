// "ทดสอบ" badge next to a test room's rows on owner / manager pages (commit 26c, lib/test-rooms.ts). Renders nothing for
// a real room, so it can be dropped next to any room number.
import { TEST_ROOM_BADGE, isTestRoom } from '@/lib/test-rooms';

export default function TestRoomBadge({ roomNumber, force }: { roomNumber?: string | null; force?: boolean }) {
  if (!force && !isTestRoom(roomNumber)) return null;
  return (
    <span className="ml-1.5 inline-block align-middle px-1.5 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/50 text-amber-500 text-[10px] font-black leading-none">
      {TEST_ROOM_BADGE}
    </span>
  );
}
