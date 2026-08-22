import { consumeRateLimit, isSameOrigin, requestClientKey } from '@/lib/services/http-guard';
import { getQueueStatus, joinMatchmaking, leaveMatchmaking } from '@/lib/services/online-store';
import { isSessionActive, openProgressDatabase } from '@/lib/services/progress-store';
import { readCookie, SESSION_COOKIE, verifySession } from '@/lib/services/session';

export const runtime = 'edge';

async function onlineContext(request: Request) {
  if (process.env.ONLINE_MATCHING_ENABLED !== '1') return null;
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  const claims = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  if (!claims) return null;
  try { const database = await openProgressDatabase(); return database && isSessionActive(database, claims) ? { claims, database } : null; }
  catch { return null; }
}

export async function GET(request: Request) {
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  return Response.json(getQueueStatus(current.database, current.claims.userId), { headers: { 'cache-control': 'private, no-store' } });
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  if (!consumeRateLimit(requestClientKey(request, 'online-queue', process.env.TRUST_PROXY === '1'), 20, 60_000)) return Response.json({ error: '匹配请求过于频繁' }, { status: 429 });
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  try { return Response.json(joinMatchmaking(current.database, current.claims)); }
  catch { return Response.json({ error: '暂时无法加入匹配' }, { status: 500 }); }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  const current = await onlineContext(request);
  if (!current) return Response.json({ error: '在线匹配未启用' }, { status: 503 });
  leaveMatchmaking(current.database, current.claims.userId);
  return Response.json({ status: 'idle' });
}
