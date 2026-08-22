import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, PUT } from '../../app/api/progress/route';
import { openProgressDatabase, resetProgressDatabaseForTests, upsertSession } from '../../lib/services/progress-store';
import { createGuestSession, SESSION_COOKIE } from '../../lib/services/session';
import { EMPTY_TRAINING_PROFILE } from '../../lib/services/training-profile';

const secret = 'progress-route-secret-with-more-than-32-characters';

async function signedRequest(method: 'GET' | 'PUT', body?: unknown, origin = 'https://game.example') {
  vi.stubEnv('SESSION_SECRET', secret);
  vi.stubEnv('DATABASE_PATH', ':memory:');
  const issued = await createGuestSession(secret), database = await openProgressDatabase();
  upsertSession(database!, issued.claims);
  return new Request(`https://game.example/api/progress`, {
    method,
    headers: { cookie: `${SESSION_COOKIE}=${issued.token}`, origin, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
}

afterEach(() => { resetProgressDatabaseForTests(); vi.unstubAllEnvs(); });

describe('training profile route', () => {
  it('stores a validated snapshot and returns private versioned progress', async () => {
    const request = await signedRequest('PUT', { training: { ...structuredClone(EMPTY_TRAINING_PROFILE), locale: 'en' }, baseRevision: 0 });
    const response = await PUT(request), payload = await response.json() as { training: { revision: number; profile: { locale: string } }; merged: boolean };
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(payload).toMatchObject({ training: { revision: 1, profile: { locale: 'en' } }, merged: false });

    const get = await GET(new Request('https://game.example/api/progress', { headers: { cookie: request.headers.get('cookie')! } }));
    await expect(get.json()).resolves.toMatchObject({ persistent: true, training: { revision: 1, profile: { locale: 'en' } } });
  });

  it('rejects cross-site, malformed and unsigned training writes', async () => {
    const crossSite = await signedRequest('PUT', { training: EMPTY_TRAINING_PROFILE, baseRevision: 0 }, 'https://evil.example');
    expect((await PUT(crossSite)).status).toBe(403);
    const malformed = await signedRequest('PUT', { training: { ...EMPTY_TRAINING_PROFILE, aiSpeed: 9 }, baseRevision: 0 });
    expect((await PUT(malformed)).status).toBe(400);
    const unsigned = new Request('https://game.example/api/progress', { method: 'PUT', headers: { origin: 'https://game.example', 'content-type': 'application/json' }, body: JSON.stringify({ training: EMPTY_TRAINING_PROFILE, baseRevision: 0 }) });
    expect((await PUT(unsigned)).status).toBe(503);
  });

  it('returns the latest private snapshot instead of accepting a stale revision', async () => {
    const first = await signedRequest('PUT', { training: { ...structuredClone(EMPTY_TRAINING_PROFILE), locale: 'en' }, baseRevision: 0 });
    expect((await PUT(first)).status).toBe(200);
    const stale = new Request('https://game.example/api/progress', { method: 'PUT', headers: { cookie: first.headers.get('cookie')!, origin: 'https://game.example', 'content-type': 'application/json' }, body: JSON.stringify({ training: { ...structuredClone(EMPTY_TRAINING_PROFILE), aiSpeed: 2 }, baseRevision: 0 }) });
    const response = await PUT(stale), payload = await response.json() as { training: { revision: number; profile: { locale: string } } };
    expect(response.status).toBe(409);
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(payload.training).toMatchObject({ revision: 1, profile: { locale: 'en' } });
  });
});
