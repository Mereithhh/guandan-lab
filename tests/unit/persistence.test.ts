import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { newGame } from '../../lib/game/engine';
import { claimGoogleAccount, deleteUserProgress, exportUserProgress, getTrainingProfile, hasOnlinePresence, isSessionActive, listMatchSummaries, openProgressDatabase, resetProgressDatabaseForTests, revokeSession, saveCompletedMatch, saveTrainingProfile, upsertSession } from '../../lib/services/progress-store';
import { createGuestSession, expiredSessionCookie, readCookie, SESSION_COOKIE, sessionCookie, signSession, verifySession } from '../../lib/services/session';
import { EMPTY_TRAINING_PROFILE } from '../../lib/services/training-profile';

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

  it('migrates a v3 database to bounded training profiles and a durable global usage ledger', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'guandan-v3-'));
    const path = join(directory, 'progress.sqlite'), previous = new DatabaseSync(path);
    previous.exec(`
      PRAGMA foreign_keys=ON;
      CREATE TABLE users(id TEXT PRIMARY KEY,kind TEXT NOT NULL,display_name TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at TEXT NOT NULL,created_at TEXT NOT NULL);
      CREATE TABLE google_accounts(provider_subject TEXT PRIMARY KEY,user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,email TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
      CREATE TABLE matches(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,seed INTEGER NOT NULL,level TEXT NOT NULL,round_no INTEGER NOT NULL,score INTEGER NOT NULL,social_score INTEGER NOT NULL,title TEXT NOT NULL,state_json TEXT NOT NULL,finished_at TEXT NOT NULL,UNIQUE(user_id,seed));
      INSERT INTO users VALUES('v3-user','google','旧牌友','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z');
      INSERT INTO sessions VALUES('v3-session','v3-user','2099-01-01T00:00:00.000Z','2026-01-01T00:00:00.000Z');
      INSERT INTO google_accounts VALUES('v3-google-subject','v3-user','v3@example.com','2026-01-01T00:00:00.000Z','2026-01-02T00:00:00.000Z');
      INSERT INTO matches VALUES('v3-match','v3-user',303,2,1,77,88,'旧局','{"schemaVersion":2,"players":[],"events":[]}','2026-01-03T00:00:00.000Z');
      PRAGMA user_version=3;
    `);
    previous.close();
    const database = await openProgressDatabase(path);
    expect(database!.prepare('PRAGMA user_version').get()).toEqual({ user_version: 5 });
    expect(database!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='training_profiles'").get()).toEqual({ name: 'training_profiles' });
    expect(database!.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='global_usage_quotas'").get()).toEqual({ name: 'global_usage_quotas' });
    expect(exportUserProgress(database!, 'v3-user')).toMatchObject({
      profile: { id: 'v3-user', kind: 'google', display_name: '旧牌友' },
      googleAccount: { provider_subject: 'v3-google-subject', email: 'v3@example.com' },
      training: { revision: 0, profile: EMPTY_TRAINING_PROFILE },
      matches: [{ id: 'v3-match', seed: 303, score: 77, social_score: 88 }],
    });
    resetProgressDatabaseForTests();
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
    expect(exported.training).toMatchObject({ revision: 0, profile: EMPTY_TRAINING_PROFILE });
    deleteUserProgress(database!, claims.userId);
    expect(listMatchSummaries(database!, claims.userId)).toEqual([]);
  });

  it('monotonically merges bounded training snapshots and deletes them with the profile', async () => {
    const database = await openProgressDatabase(':memory:'), { claims } = await createGuestSession(secret);
    upsertSession(database!, claims);
    const first = saveTrainingProfile(database!, claims, {
      ...structuredClone(EMPTY_TRAINING_PROFILE),
      course: { progress: [3, 1, 0, 0], mastered: [true, false, false, false], mistakes: [1, 0, 0, 0] },
      countAttempts: [{ round: 1, kind: 'ace', seen: 2, remaining: 6, answer: 6, correct: true }],
    });
    expect(first.revision).toBe(1);
    const stale = saveTrainingProfile(database!, claims, {
      ...structuredClone(EMPTY_TRAINING_PROFILE),
      course: { progress: [1, 0, 0, 0], mastered: [false, false, false, false], mistakes: [2, 0, 0, 0] },
      gridAttempts: [{ round: 1, score: 2 }],
      locale: 'en',
    });
    expect(stale).toMatchObject({ revision: 2, profile: { locale: 'en', course: { progress: first.profile.course.progress, mastered: first.profile.course.mastered, mistakes: [2, 0, 0, 0] } } });
    expect(stale.profile.countAttempts).toHaveLength(1);
    expect(stale.profile.gridAttempts).toHaveLength(1);
    expect(exportUserProgress(database!, claims.userId).training.revision).toBe(2);
    deleteUserProgress(database!, claims.userId);
    expect(getTrainingProfile(database!, claims.userId).revision).toBe(0);
  });

  it('does not let an invalidated session recreate training after deletion or Google claim', async () => {
    const database = await openProgressDatabase(':memory:');
    const deleted = await createGuestSession(secret);
    upsertSession(database!, deleted.claims);
    deleteUserProgress(database!, deleted.claims.userId);
    expect(() => saveTrainingProfile(database!, deleted.claims, { ...structuredClone(EMPTY_TRAINING_PROFILE), locale: 'en' })).toThrow(/no longer active/u);
    expect(exportUserProgress(database!, deleted.claims.userId)).toMatchObject({ profile: null, googleAccount: null, training: { revision: 0 } });

    const claimed = await createGuestSession(secret);
    upsertSession(database!, claimed.claims);
    const google = claimGoogleAccount(database!, claimed.claims.userId, { subject: 'google-race-subject', email: 'race@example.com', displayName: '竞态牌友' });
    expect(() => saveTrainingProfile(database!, claimed.claims, { ...structuredClone(EMPTY_TRAINING_PROFILE), locale: 'en' })).toThrow(/no longer active/u);
    expect(isSessionActive(database!, claimed.claims)).toBe(false);
    expect(exportUserProgress(database!, claimed.claims.userId).profile).toBeNull();
    expect(getTrainingProfile(database!, google.userId).revision).toBe(0);
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
    saveTrainingProfile(database!, claims, { ...structuredClone(EMPTY_TRAINING_PROFILE), course: { progress: [3, 0, 0, 0], mastered: [true, false, false, false], mistakes: [1, 0, 0, 0] } });
    const google = claimGoogleAccount(database!, claims.userId, { subject: 'google-subject-1', email: 'player@example.com', displayName: '牌友' });
    expect(listMatchSummaries(database!, google.userId)).toHaveLength(1);
    expect(getTrainingProfile(database!, google.userId)).toMatchObject({ revision: 2, profile: { course: { mastered: [true, false, false, false] } } });
    expect(exportUserProgress(database!, claims.userId).profile).toBeNull();
    expect(exportUserProgress(database!, claims.userId).googleAccount).toBeNull();
    expect(exportUserProgress(database!, google.userId).googleAccount).toMatchObject({ provider_subject: 'google-subject-1', email: 'player@example.com' });
    expect(claimGoogleAccount(database!, null, { subject: 'google-subject-1', email: 'new@example.com', displayName: '新牌友' }).userId).toBe(google.userId);
    expect(exportUserProgress(database!, google.userId).googleAccount).toMatchObject({ provider_subject: 'google-subject-1', email: 'new@example.com' });
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
