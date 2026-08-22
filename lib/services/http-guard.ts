interface WindowCounter { count: number; resetAt: number }
const counters = new Map<string, WindowCounter>();

export function requestClientKey(request: Request, namespace: string, trustProxy = false): string {
  const forwarded = request.headers.get('cf-connecting-ip') || (trustProxy ? request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() : null) || 'shared-direct-client';
  return `${namespace}:${forwarded}`;
}

export function consumeRateLimit(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = counters.get(key);
  if (!current || current.resetAt <= now) {
    counters.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(request.url).origin === new URL(origin).origin; } catch { return false; }
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
