import { createGuestSession, readCookie, SESSION_COOKIE, sessionCookie, verifySession } from '@/lib/services/session';
import { openProgressDatabase, upsertSession } from '@/lib/services/progress-store';
import { consumeRateLimit, requestClientKey } from '@/lib/services/http-guard';

export const runtime = 'edge';

export async function GET(request: Request) {
  if (!consumeRateLimit(requestClientKey(request, 'session', process.env.TRUST_PROXY === '1'), 120, 60 * 60_000)) return Response.json({ error: '会话请求过于频繁' }, { status: 429 });
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 24) return Response.json({ mode: 'local', persistent: false, profile: null });
  const current = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  const session = current ? { claims: current, token: null } : await createGuestSession(secret);
  let persistent = false;
  try {
    const database = await openProgressDatabase();
    if (database) { upsertSession(database, session.claims); persistent = true; }
  } catch { persistent = false; }
  const response = Response.json({ mode: session.claims.kind, persistent, profile: { id: session.claims.userId, displayName: session.claims.displayName } });
  if (session.token) response.headers.append('set-cookie', sessionCookie(session.token, new URL(request.url).protocol === 'https:'));
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
