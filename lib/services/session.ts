export const SESSION_COOKIE = 'gd_session';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export interface SessionClaims {
  v: 1;
  sid: string;
  userId: string;
  kind: 'guest' | 'google';
  displayName: string;
  iat: number;
  exp: number;
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function decodeBase64Url(value: string): Uint8Array | null {
  try {
    const normalized = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch { return null; }
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(separator + 1).trim()); } catch { return null; }
  }
  return null;
}

export async function signSession(claims: SessionClaims, secret: string): Promise<string> {
  return signOpaquePayload(claims, secret);
}

export async function signOpaquePayload(payloadValue: unknown, secret: string): Promise<string> {
  const payload = encodeBase64Url(new TextEncoder().encode(JSON.stringify(payloadValue)));
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), new TextEncoder().encode(payload)));
  return `${payload}.${encodeBase64Url(signature)}`;
}

export async function verifyOpaquePayload<T>(token: string | null, secret: string): Promise<T | null> {
  if (!token || secret.length < 24) return null;
  const [payload, encodedSignature, extra] = token.split('.');
  const signature = encodedSignature ? decodeBase64Url(encodedSignature) : null;
  const payloadBytes = payload ? decodeBase64Url(payload) : null;
  if (!payload || extra || !signature || !payloadBytes) return null;
  const valid = await crypto.subtle.verify('HMAC', await hmacKey(secret), Uint8Array.from(signature).buffer, new TextEncoder().encode(payload));
  if (!valid) return null;
  try { return JSON.parse(new TextDecoder().decode(payloadBytes)) as T; } catch { return null; }
}

export async function verifySession(token: string | null, secret: string, now = Date.now()): Promise<SessionClaims | null> {
  const claims = await verifyOpaquePayload<SessionClaims>(token, secret);
  if (!claims || claims.v !== 1 || !claims.sid || !claims.userId || !['guest', 'google'].includes(claims.kind) || typeof claims.displayName !== 'string' || claims.exp * 1000 <= now) return null;
  return claims;
}

export async function createGuestSession(secret: string, now = Date.now()): Promise<{ claims: SessionClaims; token: string }> {
  if (secret.length < 24) throw new Error('SESSION_SECRET must contain at least 24 characters');
  const suffix = crypto.randomUUID().replaceAll('-', '').slice(-6).toUpperCase();
  return createAuthenticatedSession(secret, { userId: crypto.randomUUID(), kind: 'guest', displayName: `游客-${suffix}` }, now);
}

export async function createAuthenticatedSession(secret: string, profile: Pick<SessionClaims, 'userId' | 'kind' | 'displayName'>, now = Date.now()): Promise<{ claims: SessionClaims; token: string }> {
  if (secret.length < 24) throw new Error('SESSION_SECRET must contain at least 24 characters');
  const issuedAt = Math.floor(now / 1000);
  const claims: SessionClaims = {
    v: 1,
    sid: crypto.randomUUID(),
    userId: profile.userId,
    kind: profile.kind,
    displayName: profile.displayName.slice(0, 80),
    iat: issuedAt,
    exp: issuedAt + SESSION_TTL_SECONDS,
  };
  return { claims, token: await signSession(claims, secret) };
}

export function sessionCookie(token: string, secure: boolean): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure ? '; Secure' : ''}`;
}

export function expiredSessionCookie(secure: boolean): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? '; Secure' : ''}`;
}
