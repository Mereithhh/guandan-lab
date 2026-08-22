import { createAuthenticatedSession, readCookie, sessionCookie } from '@/lib/services/session';
import { expiredGoogleOAuthCookie, GOOGLE_OAUTH_COOKIE, googleRedirectUri, verifyGoogleOAuthAttempt } from '@/lib/services/google-oauth';
import { claimGoogleAccount, openProgressDatabase, upsertSession } from '@/lib/services/progress-store';

export const runtime = 'edge';

function returnHome(request: Request, status: 'ok' | 'cancelled' | 'failed', cookie?: string) {
  const url = new URL('/', process.env.SITE_URL || request.url);
  url.searchParams.set('login', status);
  const response = new Response(null, { status: 302, headers: { location: url.toString() } });
  response.headers.append('set-cookie', expiredGoogleOAuthCookie(new URL(request.url).protocol === 'https:'));
  if (cookie) response.headers.append('set-cookie', cookie);
  response.headers.set('cache-control', 'private, no-store');
  return response;
}

export async function GET(request: Request) {
  const url = new URL(request.url), secret = process.env.SESSION_SECRET, clientId = process.env.GOOGLE_CLIENT_ID, clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (url.searchParams.has('error')) return returnHome(request, 'cancelled');
  const redirectUri = googleRedirectUri(request.url, process.env.SITE_URL);
  if (!secret || !clientId || !clientSecret || !redirectUri) return returnHome(request, 'failed');
  const attempt = await verifyGoogleOAuthAttempt(readCookie(request.headers.get('cookie'), GOOGLE_OAUTH_COOKIE), url.searchParams.get('state'), secret);
  const code = url.searchParams.get('code');
  if (!attempt || !code || code.length > 4096) return returnHome(request, 'failed');
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 8_000);
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', signal: controller.signal, redirect: 'error', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: attempt.verifier }) });
    if (!tokenResponse.ok) return returnHome(request, 'failed');
    const tokens = await tokenResponse.json() as { access_token?: string };
    if (!tokens.access_token) return returnHome(request, 'failed');
    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { signal: controller.signal, redirect: 'error', headers: { authorization: `Bearer ${tokens.access_token}` } });
    if (!profileResponse.ok) return returnHome(request, 'failed');
    const profile = await profileResponse.json() as { sub?: string; email?: string; email_verified?: boolean; name?: string };
    if (!profile.sub || !profile.email || profile.email_verified !== true) return returnHome(request, 'failed');
    const database = await openProgressDatabase();
    if (!database) return returnHome(request, 'failed');
    const claimed = claimGoogleAccount(database, attempt.guestUserId, { subject: profile.sub, email: profile.email, displayName: profile.name || profile.email.split('@')[0] });
    const session = await createAuthenticatedSession(secret, { userId: claimed.userId, kind: 'google', displayName: claimed.displayName });
    upsertSession(database, session.claims);
    return returnHome(request, 'ok', sessionCookie(session.token, new URL(request.url).protocol === 'https:'));
  } catch { return returnHome(request, 'failed'); }
  finally { clearTimeout(timer); }
}
