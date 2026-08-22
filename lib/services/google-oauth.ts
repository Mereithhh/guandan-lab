import { signOpaquePayload, verifyOpaquePayload } from './session';

export const GOOGLE_OAUTH_COOKIE = 'gd_google_oauth';
const OAUTH_TTL_SECONDS = 10 * 60;

interface GoogleOAuthAttempt {
  v: 1;
  state: string;
  verifier: string;
  guestUserId: string | null;
  exp: number;
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function randomUrlSafe(bytes: number): string {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return base64Url(value);
}

export async function createGoogleOAuthAttempt(secret: string, guestUserId: string | null, now = Date.now()) {
  const state = randomUrlSafe(24), verifier = randomUrlSafe(48);
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const attempt: GoogleOAuthAttempt = { v: 1, state, verifier, guestUserId, exp: Math.floor(now / 1000) + OAUTH_TTL_SECONDS };
  return { state, verifier, challenge: base64Url(digest), token: await signOpaquePayload(attempt, secret) };
}

export async function verifyGoogleOAuthAttempt(token: string | null, expectedState: string | null, secret: string, now = Date.now()): Promise<GoogleOAuthAttempt | null> {
  const attempt = await verifyOpaquePayload<GoogleOAuthAttempt>(token, secret);
  if (!attempt || attempt.v !== 1 || !expectedState || attempt.state !== expectedState || !attempt.verifier || attempt.exp * 1000 <= now) return null;
  return attempt;
}

export function googleRedirectUri(requestUrl: string, configuredSiteUrl?: string): string | null {
  try {
    const base = new URL(configuredSiteUrl || requestUrl);
    if (base.protocol !== 'https:' && base.hostname !== 'localhost' && base.hostname !== '127.0.0.1') return null;
    return new URL('/api/auth/google/callback', base.origin).toString();
  } catch { return null; }
}

export function googleAuthorizationUrl(clientId: string, redirectUri: string, state: string, challenge: string): string {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: 'openid email profile', state, code_challenge: challenge, code_challenge_method: 'S256', prompt: 'select_account' }).toString();
  return url.toString();
}

export function googleOAuthCookie(token: string, secure: boolean): string {
  return `${GOOGLE_OAUTH_COOKIE}=${encodeURIComponent(token)}; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=${OAUTH_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function expiredGoogleOAuthCookie(secure: boolean): string {
  return `${GOOGLE_OAUTH_COOKIE}=; Path=/api/auth/google; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
