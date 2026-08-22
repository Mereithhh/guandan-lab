import { afterEach, describe, expect, it } from 'vitest';
import { newGame } from '../../lib/game/engine';
import { deleteUserProgress, exportUserProgress, listMatchSummaries, openProgressDatabase, resetProgressDatabaseForTests, saveCompletedMatch, upsertSession } from '../../lib/services/progress-store';
import { createGuestSession, expiredSessionCookie, readCookie, SESSION_COOKIE, sessionCookie, signSession, verifySession } from '../../lib/services/session';

const secret = 'unit-test-session-secret-with-32-characters';

afterEach(() => resetProgressDatabaseForTests());

describe('signed guest sessions', () => {
  it('round-trips an HttpOnly session and rejects tampering or expiry', async () => {
    const issued = await createGuestSession(secret, 1_700_000_000_000);
    expect(issued.claims.kind).toBe('guest');
    expect(issued.claims.displayName).toMatch(/^游客-/u);
    await expect(verifySession(issued.token, secret, 1_700_000_001_000)).resolves.toEqual(issued.claims);
    await expect(verifySession(`${issued.token}x`, secret, 1_700_000_001_000)).resolves.toBeNull();
    const expired = { ...issued.claims, exp: 1 };
    await expect(verifySession(await signSession(expired, secret), secret, 1_700_000_001_000)).resolves.toBeNull();
    const cookie = sessionCookie(issued.token, true);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Secure');
    expect(readCookie(cookie, SESSION_COOKIE)).toBe(issued.token);
    expect(expiredSessionCookie(true)).toContain('Max-Age=0');
  });

  it('requires a production-strength signing secret', async () => {
    await expect(createGuestSession('short')).rejects.toThrow(/24 characters/u);
    await expect(verifySession('anything', 'short')).resolves.toBeNull();
  });
});

describe('SQLite progress store', () => {
  it('stores a completed game and its append-only evidence transactionally', async () => {
    const database = await openProgressDatabase(':memory:');
    expect(database).not.toBeNull();
    const { claims } = await createGuestSession(secret);
    const game = { ...newGame(42), phase: 'finished' as const };
    const analysis = { score: 81, socialScore: 88, title: '搭档优先型', advice: ['保留牌权'], metrics: { opportunities: 4, presses: 2 } };
    const stored = saveCompletedMatch(database!, claims, game, analysis);
    expect(stored.seed).toBe(42);
    expect(listMatchSummaries(database!, claims.userId)).toMatchObject([{ seed: 42, score: 81, socialScore: 88 }]);
    const exported = exportUserProgress(database!, claims.userId);
    expect(exported.profile).toMatchObject({ id: claims.userId, kind: 'guest' });
    expect(exported.matches).toHaveLength(1);
    expect(exported.events).toHaveLength(game.events.length);
    expect(exported.analyses).toHaveLength(1);
    deleteUserProgress(database!, claims.userId);
    expect(listMatchSummaries(database!, claims.userId)).toEqual([]);
  });

  it('upserts the same signed session without duplicate records', async () => {
    const database = await openProgressDatabase(':memory:');
    const { claims } = await createGuestSession(secret);
    upsertSession(database!, claims);
    upsertSession(database!, { ...claims, displayName: '游客-NEW' });
    expect(exportUserProgress(database!, claims.userId).profile).toMatchObject({ display_name: '游客-NEW' });
  });
});
