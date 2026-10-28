/**
 * In-memory sliding-window Rate Limiter for Authentication & Sensitive Endpoints
 * Prevents Brute-force and Credential Stuffing attacks.
 */

interface RateLimitRecord {
  attempts: number;
  resetAt: number;
  blockedUntil: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

const MAX_FAILED_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BLOCK_MS = 5 * 60 * 1000;  // 5 minutes block if exceeded

// Cleanup expired entries periodically to prevent memory leak
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetAt && now > record.blockedUntil) {
        rateLimitStore.delete(key);
      }
    }
  }, 10 * 60 * 1000);
}

export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  return '127.0.0.1';
}

export function checkLoginRateLimit(key: string): {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
} {
  const now = Date.now();
  const record = rateLimitStore.get(key);

  if (!record) {
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS, retryAfterSeconds: 0 };
  }

  // Check if actively blocked
  if (now < record.blockedUntil) {
    const retryAfter = Math.ceil((record.blockedUntil - now) / 1000);
    return { allowed: false, remainingAttempts: 0, retryAfterSeconds: retryAfter };
  }

  // Check if window expired
  if (now > record.resetAt) {
    rateLimitStore.delete(key);
    return { allowed: true, remainingAttempts: MAX_FAILED_ATTEMPTS, retryAfterSeconds: 0 };
  }

  const remaining = Math.max(0, MAX_FAILED_ATTEMPTS - record.attempts);
  return { allowed: remaining > 0, remainingAttempts: remaining, retryAfterSeconds: 0 };
}

export function recordLoginFailure(key: string): {
  blocked: boolean;
  retryAfterSeconds: number;
  remainingAttempts: number;
} {
  const now = Date.now();
  let record = rateLimitStore.get(key);

  if (!record || now > record.resetAt) {
    record = {
      attempts: 1,
      resetAt: now + WINDOW_MS,
      blockedUntil: 0,
    };
  } else {
    record.attempts += 1;
  }

  if (record.attempts >= MAX_FAILED_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_MS;
    rateLimitStore.set(key, record);
    return {
      blocked: true,
      retryAfterSeconds: Math.ceil(BLOCK_MS / 1000),
      remainingAttempts: 0,
    };
  }

  rateLimitStore.set(key, record);
  return {
    blocked: false,
    retryAfterSeconds: 0,
    remainingAttempts: MAX_FAILED_ATTEMPTS - record.attempts,
  };
}

export function resetLoginRateLimit(key: string): void {
  rateLimitStore.delete(key);
}
