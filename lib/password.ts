import bcrypt from 'bcryptjs';
import crypto from 'crypto';

// Legacy sha256/plaintext hashes still verify, but are flagged for bcrypt upgrade
export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<{ ok: boolean; needsRehash: boolean }> {
  if (!storedHash) return { ok: false, needsRehash: false };
  if (storedHash.startsWith('$2')) {
    return { ok: await bcrypt.compare(password, storedHash), needsRehash: false };
  }
  if (storedHash.length === 64) {
    const ok = crypto.createHash('sha256').update(password).digest('hex') === storedHash;
    return { ok, needsRehash: ok };
  }
  const ok = password === storedHash;
  return { ok, needsRehash: ok };
}
