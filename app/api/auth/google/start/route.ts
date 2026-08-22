import { createGoogleOAuthAttempt, googleAuthorizationUrl, googleOAuthCookie, googleRedirectUri } from '@/lib/services/google-oauth';
import { consumeRateLimit, isSecureRequest, requestClientKey } from '@/lib/services/http-guard';
import { readCookie, SESSION_COOKIE, verifySession } from '@/lib/services/session';
import { isSessionActive, openProgressDatabase } from '@/lib/services/progress-store';

export const runtime = 'edge';

export async function GET(request: Request) {
  if (!consumeRateLimit(requestClientKey(request, 'google-oauth', process.env.TRUST_PROXY === '1'), 12, 60 * 60_000)) return Response.json({ error: '登录请求过于频繁' }, { status: 429 });
  const clientId = process.env.GOOGLE_CLIENT_ID, secret = process.env.SESSION_SECRET;
  const redirectUri = googleRedirectUri(request.url, process.env.SITE_URL);
  if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || !secret || secret.length < 24 || !process.env.DATABASE_PATH || !redirectUri) return Response.json({ error: 'Google 登录尚未配置' }, { status: 503 });
  const verified = await verifySession(readCookie(request.headers.get('cookie'), SESSION_COOKIE), secret);
  let current: typeof verified = null;
  try { const database = await openProgressDatabase(); if (verified && database && isSessionActive(database, verified)) current = verified; } catch {}
  const attempt = await createGoogleOAuthAttempt(secret, current?.kind === 'guest' ? current.userId : null);
  const response = new Response(null, { status: 302, headers: { location: googleAuthorizationUrl(clientId, redirectUri, attempt.state, attempt.challenge) } });
  response.headers.append('set-cookie', googleOAuthCookie(attempt.token, isSecureRequest(request)));
  response.headers.set('cache-control', 'private, no-store');
  return response;
}
