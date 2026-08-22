import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newGame } from '../../lib/game/engine';
import { claimGoogleAccount, deleteUserProgress, exportUserProgress, hasOnlinePresence, isSessionActive, listMatchSummaries, openProgressDatabase, resetProgressDatabaseForTests, revokeSession, saveCompletedMatch, upsertSession } from '../../lib/services/progress-store';
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
  it('rejects a future schema without modifying it', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'guandan-future-'));
    const path = join(directory, 'future.sqlite'), future = new DatabaseSync(path);
    future.exec('CREATE TABLE future_only(value TEXT); PRAGMA user_version=99;');
    future.close();
    await expect(openProgressDatabase(path)).rejects.toThrow(/newer/u);
    const check = new DatabaseSync(path);
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual([{ name: 'future_only' }]);
    check.close();
    rmSync(directory, { recursive: true, force: true });
  });

  it('rolls back all schema DDL when a supported migration fails', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'guandan-broken-'));
    const path = join(directory, 'broken.sqlite'), broken = new DatabaseSync(path);
    broken.exec('CREATE TABLE online_actions(wrong_column TEXT); PRAGMA user_version=2;');
    broken.close();
    await expect(openProgressDatabase(path)).rejects.toThrow();
    const check = new DatabaseSync(path);
    expect(check.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all()).toEqual([{ name: 'online_actions' }]);
    expect(check.prepare('PRAGMA user_version').get()).toEqual({ user_version: 2 });
    check.close();
    rmSync(directory, { recursive: true, force: true });
  });

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
    expect(isSessionActive(database!, claims)).toBe(true);
    revokeSession(database!, claims);
    expect(isSessionActive(database!, claims)).toBe(false);
  });

  it('claims guest matches into a stable Google profile transactionally', async () => {
    const database = await openProgressDatabase(':memory:');
    const { claims } = await createGuestSession(secret);
    saveCompletedMatch(database!, claims, { ...newGame(77), phase: 'finished' }, { score: 80, socialScore: 90, title: '均衡协作型', advice: [], metrics: {} });
    const google = claimGoogleAccount(database!, claims.userId, { subject: 'google-subject-1', email: 'player@example.com', displayName: '牌友' });
    expect(listMatchSummaries(database!, google.userId)).toHaveLength(1);
    expect(exportUserProgress(database!, claims.userId).profile).toBeNull();
    expect(claimGoogleAccount(database!, null, { subject: 'google-subject-1', email: 'new@example.com', displayName: '新牌友' }).userId).toBe(google.userId);
  });

  it('refuses to cascade-delete an identity participating in matchmaking', async () => {
    const database = await openProgressDatabase(':memory:');
    const { claims } = await createGuestSession(secret);
    upsertSession(database!, claims);
    database!.prepare('INSERT INTO matchmaking_queue(user_id,joined_at) VALUES(?,?)').run(claims.userId, new Date().toISOString());
    expect(hasOnlinePresence(database!, claims.userId)).toBe(true);
    expect(() => claimGoogleAccount(database!, claims.userId, { subject: 'google-subject-online', email: 'online@example.com', displayName: '在线牌友' })).toThrow(/Leave online/u);
    expect(exportUserProgress(database!, claims.userId).profile).not.toBeNull();
  });
});
