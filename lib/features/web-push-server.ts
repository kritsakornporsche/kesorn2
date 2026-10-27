import fs from 'fs';
import path from 'path';
import webpush, { PushSubscription } from 'web-push';

export interface StoredPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  role: string;
  subRole?: string;
  userName?: string;
  userEmail?: string;
  userAgent?: string;
  createdAt: string;
}

const DATA_DIR = path.join(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid-keys.json');
const SUBS_FILE = path.join(DATA_DIR, 'push-subscriptions.json');

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

export function getOrGenerateVapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }

  ensureDataDir();
  if (fs.existsSync(VAPID_FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf8'));
      if (raw.publicKey && raw.privateKey) {
        return raw;
      }
    } catch {
      // regenerate if corrupted
    }
  }

  const generated = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(generated, null, 2), 'utf8');
  return generated;
}

export function loadPushSubscriptions(): StoredPushSubscription[] {
  ensureDataDir();
  if (!fs.existsSync(SUBS_FILE)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(SUBS_FILE, 'utf8'));
    if (!Array.isArray(raw)) return [];
    // Keep all authenticated subscriptions with email or name
    return raw.filter(
      (s: StoredPushSubscription) =>
        s &&
        s.endpoint &&
        Boolean(s.userEmail || s.userName)
    );
  } catch {
    return [];
  }
}

export function savePushSubscription(sub: StoredPushSubscription): StoredPushSubscription[] {
  const list = loadPushSubscriptions();
  const filtered = list.filter((item) => item.endpoint !== sub.endpoint);
  filtered.unshift(sub);
  ensureDataDir();
  fs.writeFileSync(SUBS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
  return filtered;
}

export function removePushSubscription(endpoint?: string, userEmail?: string): StoredPushSubscription[] {
  const list = loadPushSubscriptions();
  const filtered = list.filter((item) => {
    if (endpoint && item.endpoint === endpoint) return false;
    if (userEmail && item.userEmail && item.userEmail.toLowerCase() === userEmail.toLowerCase()) {
      return false;
    }
    return true;
  });
  ensureDataDir();
  fs.writeFileSync(SUBS_FILE, JSON.stringify(filtered, null, 2), 'utf8');
  return filtered;
}

export function formatRoleThaiLabel(role?: string, subRole?: string): string {
  const r = String(role || '').toLowerCase();
  if (r === 'owner') return 'Owner (เจ้าของหอพัก)';
  if (r === 'tenant') return 'Tenant (ผู้เช่า)';
  if (r === 'guest') return 'Guest (ผู้จองห้องพัก)';
  if (r === 'keeper') {
    if (subRole === 'maid') return 'Keeper (แม่บ้าน)';
    if (subRole === 'technician') return 'Keeper (ช่างซ่อมบำรุง)';
    return 'Keeper (แม่บ้าน/ช่างซ่อม)';
  }
  if (r === 'researcher') return 'Researcher (ผู้วิจัยระบบ)';
  if (r === 'platform_admin' || r === 'admin') return 'Admin (ผู้ดูแลระบบ)';
  return 'ผู้ใช้งานระบบ';
}

interface PushPayload {
  title: string;
  body: string;
  senderLabel?: string;
  recipientLabel?: string;
  url?: string;
  tag?: string;
}

async function dispatchPushToSubscriptions(
  subs: StoredPushSubscription[],
  payload: PushPayload
): Promise<{ sentCount: number; failedCount: number; totalSubscribers: number }> {
  if (subs.length === 0) {
    return { sentCount: 0, failedCount: 0, totalSubscribers: 0 };
  }

  const keys = getOrGenerateVapidKeys();
  webpush.setVapidDetails(
    'mailto:kritsakorn801@gmail.com',
    keys.publicKey,
    keys.privateKey
  );

  let sentCount = 0;
  let failedCount = 0;
  const invalidEndpoints = new Set<string>();

  await Promise.all(
    subs.map(async (sub) => {
      try {
        const roleDisplay = formatRoleThaiLabel(sub.role, sub.subRole);
        const identityDisplay = sub.userName || sub.userEmail || '';

        const personalizedTitle = payload.title.includes('➔') 
          ? payload.title 
          : `🔔 ${payload.title}`;
        const personalizedBody = `${payload.body}`;

        const messageString = JSON.stringify({
          title: personalizedTitle,
          body: personalizedBody,
          url: payload.url || '/',
          tag: payload.tag || `smartdorm-push-${Date.now()}`,
        });

        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: sub.keys,
          } as PushSubscription,
          messageString,
          {
            TTL: 86400,
            urgency: 'high',
          }
        );
        sentCount++;
      } catch (err: any) {
        failedCount++;
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          invalidEndpoints.add(sub.endpoint);
        }
      }
    })
  );

  if (invalidEndpoints.size > 0) {
    const list = loadPushSubscriptions();
    const remaining = list.filter((s) => !invalidEndpoints.has(s.endpoint));
    ensureDataDir();
    fs.writeFileSync(SUBS_FILE, JSON.stringify(remaining, null, 2), 'utf8');
  }

  return {
    sentCount,
    failedCount,
    totalSubscribers: subs.length,
  };
}

export async function sendWebPushToAllSubscriptions(payload: PushPayload) {
  const subs = loadPushSubscriptions();
  return dispatchPushToSubscriptions(subs, payload);
}

export async function sendWebPushToRole(role: string, payload: PushPayload) {
  const target = String(role).toLowerCase();
  const subs = loadPushSubscriptions().filter(
    (s) => String(s.role).toLowerCase() === target
  );
  return dispatchPushToSubscriptions(subs, payload);
}

export async function sendWebPushToEmail(email: string, payload: PushPayload) {
  const target = String(email).trim().toLowerCase();
  const subs = loadPushSubscriptions().filter(
    (s) => s.userEmail && s.userEmail.trim().toLowerCase() === target
  );
  return dispatchPushToSubscriptions(subs, payload);
}
