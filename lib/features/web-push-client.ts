'use client';

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

export function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    (window.navigator as any).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

export async function unsubscribeDeviceFromWebPush(userEmail?: string): Promise<void> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    const endpoint = sub ? sub.endpoint : undefined;

    await fetch('/api/features/web-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'unsubscribe',
        endpoint,
        userEmail: userEmail || localStorage.getItem('userEmail') || undefined,
      }),
    });
  } catch {
    // ignore
  }
}

export async function subscribeDeviceToWebPush(params?: {
  role?: string;
  subRole?: string;
  userName?: string;
  userEmail?: string;
  sendConfirmationPush?: boolean;
}): Promise<{
  success: boolean;
  permission: NotificationPermission | 'unsupported';
  needsIosHomeScreen?: boolean;
  subscriberCount?: number;
  roleLabel?: string;
  message: string;
}> {
  if (typeof window === 'undefined') {
    return { success: false, permission: 'unsupported', message: 'ไม่รองรับบนฝั่งเซิร์ฟเวอร์' };
  }

  // On iOS Safari, PushManager & Notification only exist when opened as a Home Screen Web App
  if (isIosDevice() && !isStandalonePwa()) {
    return {
      success: false,
      permission: 'unsupported',
      needsIosHomeScreen: true,
      message:
        'สำหรับ iPhone/iPad: กรุณากดปุ่มแชร์ (Share ⬆️) ใน Safari แล้วเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)" จากนั้นเปิดแอปจากหน้าจอโฮมเพื่อรับแจ้งเตือนนอกแอป',
    };
  }

  if (!('serviceWorker' in navigator) || !('Notification' in window)) {
    return {
      success: false,
      permission: 'unsupported',
      message: 'เบราว์เซอร์นี้ไม่รองรับ Web Push Notification',
    };
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      return {
        success: false,
        permission: perm,
        message: 'ยังไม่ได้รับอนุญาตแจ้งเตือน กรุณากด "อนุญาต (Allow)"',
      };
    }

    await navigator.serviceWorker.register('/sw.js');
    const registration = await navigator.serviceWorker.ready;

    // Fetch VAPID public key from server
    const keyRes = await fetch('/api/features/web-push');
    const keyData = await keyRes.json();
    if (!keyData.success || !keyData.publicKey) {
      return {
        success: false,
        permission: perm,
        message: 'ไม่พบ VAPID Public Key จากเซิร์ฟเวอร์',
      };
    }

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(keyData.publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey as unknown as BufferSource,
      });
    }

    const subJson = subscription.toJSON();
    const saveRes = await fetch('/api/features/web-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'subscribe',
        subscription: subJson,
        role: params?.role || localStorage.getItem('userRole') || '',
        subRole: params?.subRole || localStorage.getItem('userSubRole') || '',
        userName: params?.userName || localStorage.getItem('userName') || '',
        userEmail: params?.userEmail || localStorage.getItem('userEmail') || '',
        sendConfirmationPush: Boolean(params?.sendConfirmationPush),
        message: 'นี้คือการทดสอบการแจ้งเดือน',
        url: window.location.pathname,
      }),
    });
    const saveData = await saveRes.json();

    if (!saveData.success) {
      return {
        success: false,
        permission: perm,
        message: saveData.message || 'ไม่สามารถเปิดรับการแจ้งเตือนได้ กรุณาเข้าสู่ระบบก่อน',
      };
    }

    return {
      success: true,
      permission: 'granted',
      subscriberCount: saveData.subscriberCount || 1,
      roleLabel: saveData.roleLabel,
      message: `ลงทะเบียนแจ้งเตือนนอกแอปสำเร็จ (${saveData.roleLabel || 'สมาชิก'})`,
    };
  } catch (err: any) {
    return {
      success: false,
      permission: Notification.permission,
      message: err?.message || 'เกิดข้อผิดพลาดในการลงทะเบียน Web Push',
    };
  }
}
