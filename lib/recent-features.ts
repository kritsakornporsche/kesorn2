export interface OwnerFeature {
  id: string;
  name: string;
  href: string;
  icon: string;
  category: string;
  badgeKey?: 'pendingBookings' | 'pendingSlips' | 'pendingMaintenance' | 'expiringContracts';
}

export const OWNER_FEATURES: OwnerFeature[] = [
  { id: 'meters', name: 'จดมิเตอร์น้ำ-ไฟ', href: '/owner/meters', icon: '⚡', category: 'การเงิน' },
  { id: 'billing', name: 'บิลค่าเช่ารายเดือน', href: '/owner/billing', icon: '💰', category: 'การเงิน', badgeKey: 'pendingSlips' },
  { id: 'bookings', name: 'รายการจองห้องพัก', href: '/owner/bookings', icon: '🔔', category: 'การจัดการ', badgeKey: 'pendingBookings' },
  { id: 'maintenance', name: 'แจ้งซ่อม / แม่บ้าน', href: '/owner/maintenance', icon: '🔧', category: 'บริการ', badgeKey: 'pendingMaintenance' },
  { id: 'rooms', name: 'ผังห้องพัก', href: '/owner/rooms', icon: '🚪', category: 'การจัดการ' },
  { id: 'contracts', name: 'สัญญาเช่า', href: '/owner/contracts', icon: '📝', category: 'การเงิน', badgeKey: 'expiringContracts' },
  { id: 'tenants', name: 'ทะเบียนผู้เช่า', href: '/owner/tenants', icon: '👥', category: 'การจัดการ' },
  { id: 'move-out', name: 'คำร้องขอย้ายออก', href: '/owner/move-out', icon: '📦', category: 'การจัดการ' },
  { id: 'accounting', name: 'บัญชีรายรับ-จ่าย', href: '/owner/accounting', icon: '📈', category: 'การเงิน' },
  { id: 'reports', name: 'รายงานหอพัก', href: '/owner/reports', icon: '📊', category: 'การเงิน' },
  { id: 'risk', name: 'วิเคราะห์ความเสี่ยง', href: '/owner/risk', icon: '🛡️', category: 'การเงิน' },
  { id: 'chat', name: 'แชทลูกหอ', href: '/owner/chat', icon: '💬', category: 'บริการ' },
  { id: 'rules', name: 'กฎและระเบียบหอ', href: '/owner/rules', icon: '⚖️', category: 'บริการ' },
  { id: 'keepers', name: 'พนักงาน', href: '/owner/keepers', icon: '🧹', category: 'บริการ' },
  { id: 'settings', name: 'ตั้งค่าหอพัก', href: '/owner/settings', icon: '⚙️', category: 'บริการ' },
];

export const DEFAULT_RECENT_IDS = ['meters', 'billing', 'bookings', 'maintenance', 'rooms'];

export function getRecentFeatures(limit = 5): OwnerFeature[] {
  if (typeof window === 'undefined') {
    return DEFAULT_RECENT_IDS.map((id) => OWNER_FEATURES.find((f) => f.id === id)!).filter(Boolean).slice(0, limit);
  }
  try {
    const raw = localStorage.getItem('owner_recent_features');
    if (!raw) {
      return DEFAULT_RECENT_IDS.map((id) => OWNER_FEATURES.find((f) => f.id === id)!).filter(Boolean).slice(0, limit);
    }
    const ids: string[] = JSON.parse(raw);
    const result: OwnerFeature[] = [];
    for (const id of ids) {
      const match = OWNER_FEATURES.find((f) => f.id === id || f.href === id);
      if (match && !result.some((r) => r.id === match.id)) {
        result.push(match);
      }
    }
    // Fill with default features if fewer than limit
    for (const defId of DEFAULT_RECENT_IDS) {
      if (!result.some((r) => r.id === defId)) {
        const match = OWNER_FEATURES.find((f) => f.id === defId);
        if (match) result.push(match);
      }
    }
    return result.slice(0, limit);
  } catch (e) {
    return DEFAULT_RECENT_IDS.map((id) => OWNER_FEATURES.find((f) => f.id === id)!).filter(Boolean).slice(0, limit);
  }
}

export function recordRecentFeature(featureIdOrHref: string) {
  if (typeof window === 'undefined') return;
  try {
    const match = OWNER_FEATURES.find(
      (f) => f.id === featureIdOrHref || f.href === featureIdOrHref || featureIdOrHref.startsWith(f.href)
    );
    if (!match) return;

    let current: string[] = [];
    const raw = localStorage.getItem('owner_recent_features');
    if (raw) {
      try {
        current = JSON.parse(raw);
      } catch {}
    }
    current = [match.id, ...current.filter((id) => id !== match.id)].slice(0, 10);
    localStorage.setItem('owner_recent_features', JSON.stringify(current));
    window.dispatchEvent(new CustomEvent('owner-recent-features-updated', { detail: match }));
  } catch (e) {
    console.error('recordRecentFeature error:', e);
  }
}
