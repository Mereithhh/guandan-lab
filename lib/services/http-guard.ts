interface WindowCounter { count: number; resetAt: number }
const counters = new Map<string, WindowCounter>();
const MAX_RATE_LIMIT_KEYS = 5_000;

export function requestClientKey(request: Request, namespace: string, trustProxy = false): string {
  const forwarded = trustProxy ? request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : null;
  return `${namespace}:${forwarded || 'shared-direct-client'}`;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    if (counters.size >= MAX_RATE_LIMIT_KEYS) {
      for (const [candidate, counter] of counters) if (counter.resetAt <= now) counters.delete(candidate);
      while (counters.size >= MAX_RATE_LIMIT_KEYS) counters.delete(counters.keys().next().value as string);
    }
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function publicRequestOrigin(request: Request, siteUrl = process.env.SITE_URL, trustProxy = process.env.TRUST_PROXY === '1'): string {
  if (siteUrl) {
    try { return new URL(siteUrl).origin; } catch {}
  }
  if (trustProxy) {
    const proto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    const host = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim() || request.headers.get('host');
    if ((proto === 'http' || proto === 'https') && host && !/[\s\\/]/u.test(host)) {
      try { return new URL(`${proto}://${host}`).origin; } catch {}
    }
  }
  return new URL(request.url).origin;
}

export function isSecureRequest(request: Request): boolean {
  return publicRequestOrigin(request).startsWith('https://');
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return publicRequestOrigin(request) === new URL(origin).origin; } catch { return false; }
}

export class BodyTooLargeError extends Error {}
export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  if (!request.body) throw new SyntaxError('missing body');
  const reader=request.body.getReader(),chunks:Uint8Array[]=[];let total=0;
  try {
    while(true){const {done,value}=await reader.read();if(done)break;if(!value)continue;total+=value.byteLength;if(total>maxBytes){await reader.cancel();throw new BodyTooLargeError('body too large')}chunks.push(value)}
  } finally { reader.releaseLock(); }
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
