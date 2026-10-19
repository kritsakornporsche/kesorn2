// What is in a room (commit 26): one list for the whole dorm, kept in code — no prices. It is the starting list of the
// move-in and move-out inspections (screen + PDF) by room type, and is shown on the guest room page and the owner /
// manager rooms page. Countable items get a quantity, compared between move-in and move-out. An inspection keeps its
// own copy of names and quantities (contract_inspection_items), so changing this list never changes a saved inspection.

import { isAirconType } from '@/lib/room-types';

export interface RoomItem {
  name: string;
  /** 'all' = every room · 'aircon' = air-conditioned rooms only */
  roomType: 'all' | 'aircon';
  countable: boolean;
}

export const ROOM_ITEMS: readonly RoomItem[] = [
  { name: 'กุญแจห้อง', roomType: 'all', countable: true },
  { name: 'พัดลม', roomType: 'all', countable: false },
  { name: 'อ่างล้างจานที่ระเบียง', roomType: 'all', countable: false },
  { name: 'เครื่องทำน้ำอุ่น', roomType: 'all', countable: false },
  { name: 'เตียงนอน', roomType: 'all', countable: false },
  { name: 'โต๊ะเขียนหนังสือ', roomType: 'all', countable: false },
  { name: 'ตู้เสื้อผ้า', roomType: 'all', countable: false },
  { name: 'ชั้นวางของ', roomType: 'all', countable: false },
  { name: 'ที่แขวนของ', roomType: 'all', countable: false },
  { name: 'ตู้เย็น', roomType: 'all', countable: false },
  { name: 'ประตูมุ้งลวด', roomType: 'all', countable: false },
  { name: 'ผ้าม่าน', roomType: 'all', countable: false },
  { name: 'อ่างล้างหน้า', roomType: 'all', countable: false },
  { name: 'ฝักบัวอาบน้ำ', roomType: 'all', countable: false },
  { name: 'กระจกห้องน้ำ', roomType: 'all', countable: false },
  { name: 'ชักโครก', roomType: 'all', countable: false },
  { name: 'เครื่องปรับอากาศ', roomType: 'aircon', countable: false },
  { name: 'รีโมทแอร์', roomType: 'aircon', countable: true },
];

/** Range of a countable item's quantity (keys, remotes): at least 1 at move-in and at move-out (commit 26b) */
export const QUANTITY_MIN = 1;
export const QUANTITY_MAX = 99;

/** The items of a room of this type (stored room_type: Standard = fan room, Deluxe = air-conditioned). */
export function itemsForRoomType(roomType: string | null | undefined): RoomItem[] {
  const aircon = isAirconType(roomType);
  return ROOM_ITEMS.filter((it) => it.roomType === 'all' || aircon);
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** Whether an item name is one of the countable items of the list. */
export function isCountableName(name: string | null | undefined): boolean {
  return !!name && ROOM_ITEMS.some((it) => it.countable && same(it.name, name));
}
