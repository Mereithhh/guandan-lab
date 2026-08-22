import { createGuestSession, expiredSessionCookie, readCookie, SESSION_COOKIE, sessionCookie, verifySession } from '@/lib/services/session';
import { isSessionActive, openProgressDatabase, revokeSession, upsertSession } from '@/lib/services/progress-store';
import { consumeRateLimit, isSameOrigin, isSecureRequest, requestClientKey } from '@/lib/services/http-guard';
import { getQueueStatus, leaveMatchmaking } from '@/lib/services/online-store';
import { providerStatus } from '@/lib/services/provider-status';

export const runtime = 'edge';

export async function GET(request: Request) {
  if (!consumeRateLimit(requestClientKey(request, 'session', process.env.TRUST_PROXY === '1'), 120, 60 * 60_000)) return Response.json({ error: '会话请求过于频繁' }, { status: 429 });
  const providers=providerStatus(process.env);
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) return Response.json({ mode: 'local', persistent: false, googleOAuth: false, onlineMatching: false, profile: null, ...providers });
  let database = null;
  try {
    database = await openProgressDatabase();
  } catch { database = null; }
  const verified = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  const current = verified && database && isSessionActive(database, verified) ? verified : null;
  const session = current ? { claims: current, token: null } : await createGuestSession(secret);
  const persistent = Boolean(database);
  if (database) upsertSession(database, session.claims);
  const googleOAuth = persistent && Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.SITE_URL);
  const onlineMatching = persistent && process.env.ONLINE_MATCHING_ENABLED === '1';
  const onlineStatus = onlineMatching && database ? getQueueStatus(database, session.claims.userId) : { status: 'idle' as const };
  const response = Response.json({ mode: session.claims.kind, persistent, googleOAuth, onlineMatching, onlineStatus, profile: { id: session.claims.userId, displayName: session.claims.displayName }, ...providers });
  if (session.token) response.headers.append('set-cookie', sessionCookie(session.token, isSecureRequest(request)));
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: '跨站请求被拒绝' }, { status: 403 });
  const secret = process.env.SESSION_SECRET, secure = isSecureRequest(request);
  if (secret) {
    const claims = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
    if (claims) { try { const database = await openProgressDatabase(); if (database) { const online = getQueueStatus(database, claims.userId); if (online.status === 'matched') return Response.json({ error: '请先回到真人牌桌，使用“离开并取消本局”后再退出' }, { status: 409 }); if (online.status === 'queued') leaveMatchmaking(database, claims.userId); revokeSession(database, claims); } } catch {} }
  }
  const response = Response.json({ loggedOut: true });
  response.headers.append('set-cookie', expiredSessionCookie(secure));
  return response;
}
