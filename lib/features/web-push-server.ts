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

export function getOrGenerateVapidKeys() {
  return {
    publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
  };
}

export function loadPushSubscriptions(): StoredPushSubscription[] {
  return [];
}

export function savePushSubscription(_sub: StoredPushSubscription) {
  return true;
}

export function removePushSubscription(_endpoint: string) {
  return true;
}

export async function sendWebPushToAllSubscriptions(payload: {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  senderLabel?: string;
}) {
  return {
    success: true,
    sentCount: 0,
    failedCount: 0,
    message: 'Push notification simulated / not configured in dev environment',
    payload,
  };
}
