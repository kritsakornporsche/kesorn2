// Cloudflare Turnstile ("ไม่ใช่บอท") check for sign-up e-mail verification (commit 26d). The secret comes from the
// environment only (CLOUDFLARE_TURNSTILE_SECRET_KEY) — no built-in fallback. Cloudflare's public test keys and the
// mock token "cf-mock-token-success" work only when NODE_ENV=development; anywhere else they are refused with a clear
// message (never a crash). Read at call time, so tests can switch NODE_ENV.

export const TURNSTILE_MOCK_TOKEN = 'cf-mock-token-success';

/** Cloudflare's documented test keys look like 1x0000…AA / 2x0000…AB / 3x0000…: never real ones. */
export const isTurnstileTestKey = (key: string | null | undefined) => /^[123]x0{10,}[A-Z]{2}$/.test(String(key ?? '').trim());

/** Cloudflare's always-pass test keys (public, from the Turnstile docs) — development only */
export const TURNSTILE_DEV_SECRET = '1x' + '0'.repeat(31) + 'AA';
export const TURNSTILE_DEV_SITE_KEY = '1x' + '0'.repeat(20) + 'AA';

export const TURNSTILE_NOT_SET = 'ระบบยืนยันว่าไม่ใช่บอท (Cloudflare Turnstile) ยังไม่ได้ตั้งค่า กรุณาแจ้งผู้ดูแลระบบ';
export const TURNSTILE_TEST_REFUSED = 'ใช้คีย์/โทเคนทดสอบของ Cloudflare Turnstile ได้เฉพาะเครื่องพัฒนา (development) เท่านั้น';

const isDev = () => process.env.NODE_ENV === 'development';

/** Site key for the page: from the environment; the test site key only in development; '' = not set. */
export function turnstileSiteKey(value: string | null | undefined, nodeEnv: string | undefined): string {
  const key = String(value ?? '').trim();
  if (key && !(isTurnstileTestKey(key) && nodeEnv !== 'development')) return key;
  return nodeEnv === 'development' ? TURNSTILE_DEV_SITE_KEY : '';
}

export async function verifyTurnstileToken(token: string, remoteIp?: string): Promise<{ success: boolean; message?: string }> {
  const dev = isDev();
  if (token === TURNSTILE_MOCK_TOKEN) {
    return dev ? { success: true } : { success: false, message: TURNSTILE_TEST_REFUSED };
  }
  const configured = (process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || '').trim();
  const secretKey = configured || (dev ? TURNSTILE_DEV_SECRET : '');
  if (!secretKey) return { success: false, message: TURNSTILE_NOT_SET };
  if (isTurnstileTestKey(secretKey)) {
    if (!dev) return { success: false, message: TURNSTILE_TEST_REFUSED };
    // development with the always-pass test secret
    if (secretKey.startsWith('1x')) return { success: true };
  }
  if (!token) return { success: false, message: 'กรุณายืนยันระบบความปลอดภัย Cloudflare Turnstile' };

  try {
    const formData = new URLSearchParams();
    formData.append('secret', secretKey);
    formData.append('response', token);
    if (remoteIp) formData.append('remoteip', remoteIp);
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: formData,
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    const outcome = await res.json();
    if (outcome.success) return { success: true };
    return { success: false, message: 'การตรวจสอบ Cloudflare Turnstile ไม่ผ่าน: ' + (outcome['error-codes']?.join(', ') || 'ไม่ทราบสาเหตุ') };
  } catch (error: any) {
    console.error('[Turnstile verification error]:', error?.message || error);
    // only on a development machine a network problem lets the check pass
    if (dev) return { success: true };
    return { success: false, message: 'ไม่สามารถติดต่อเซิร์ฟเวอร์ Cloudflare เพื่อตรวจสอบความปลอดภัยได้' };
  }
}
