import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/authz';

// Replaced by /api/keeper/jobs (commit 13). The earlier handlers listed every job without a login and let any keeper
// change any job; they now only answer: 401 without a login, 403 for other roles, 410 otherwise.
async function gone() {
  const guard = await requireRole(['keeper', 'owner', 'manager']);
  if ('response' in guard) return guard.response;
  return NextResponse.json({ success: false, message: 'ย้ายไปใช้ /api/keeper/jobs แล้ว' }, { status: 410 });
}
export const GET = gone;
export const POST = gone;
export const PATCH = gone;
export const PUT = gone;
