import type { GameState } from '@/lib/game/types';
import type { SessionClaims } from './session';
import { EMPTY_TRAINING_PROFILE, mergeTrainingProfiles, parseTrainingProfile, type TrainingProfile } from './training-profile';

interface Statement<Row = Record<string, unknown>> {
  run(...values: unknown[]): unknown;
  all(...values: unknown[]): Row[];
  get(...values: unknown[]): Row | undefined;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare<Row = Record<string, unknown>>(sql: string): Statement<Row>;
  close(): void;
}

export interface StoredMatchSummary {
  id: string;
  seed: number;
  level: number;
  roundNo: number;
  score: number;
  socialScore: number;
  title: string;
  finishedAt: string;
}

export interface MatchAnalysisInput {
  score: number;
  socialScore: number;
  title: string;
  advice: string[];
  metrics: Record<string, number>;
}

export interface StoredTrainingProfile {
  profile: TrainingProfile;
  revision: number;
  updatedAt: string | null;
}

export interface UsageQuotaResult {
  allowed: boolean;
  userUsed: number;
  globalUsed: number;
  resetAt: string;
}

const connectionPragmas = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
`;

const schema = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK(kind IN ('guest','google')),
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS google_accounts (
  provider_subject TEXT PRIMARY KEY,
  user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seed INTEGER NOT NULL,
  level TEXT NOT NULL,
  round_no INTEGER NOT NULL,
  score INTEGER NOT NULL,
  social_score INTEGER NOT NULL,
  title TEXT NOT NULL,
  state_json TEXT NOT NULL,
  finished_at TEXT NOT NULL,
  UNIQUE(user_id, seed)
);
CREATE TABLE IF NOT EXISTS match_events (
  match_id TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  PRIMARY KEY(match_id, sequence)
);
CREATE TABLE IF NOT EXISTS analyses (
  match_id TEXT PRIMARY KEY REFERENCES matches(id) ON DELETE CASCADE,
  advice_json TEXT NOT NULL,
  metrics_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS training_profiles (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  profile_json TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, quota_key, period_start)
);
CREATE TABLE IF NOT EXISTS global_usage_quotas (
  quota_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(quota_key, period_start)
);
CREATE TABLE IF NOT EXISTS matchmaking_queue (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS online_rooms (
  id TEXT PRIMARY KEY,
  state_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK(status IN ('playing','finished','cancelled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  turn_started_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS online_room_members (
  room_id TEXT NOT NULL REFERENCES online_rooms(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seat INTEGER NOT NULL CHECK(seat BETWEEN 0 AND 3),
  joined_at TEXT NOT NULL,
  PRIMARY KEY(room_id, user_id),
  UNIQUE(room_id, seat)
);
CREATE TABLE IF NOT EXISTS online_actions (
  room_id TEXT NOT NULL REFERENCES online_rooms(id) ON DELETE CASCADE,
  action_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  accepted_version INTEGER NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(room_id, user_id, action_id)
);
CREATE INDEX IF NOT EXISTS matches_user_finished ON matches(user_id, finished_at DESC);
CREATE INDEX IF NOT EXISTS online_members_user ON online_room_members(user_id, joined_at DESC);
`;

const SUPPORTED_SCHEMA_VERSION = 5;

function migrate(database: SqliteDatabase, version: number): void {
  if (version > SUPPORTED_SCHEMA_VERSION) throw new Error(`Database schema ${version} is newer than this server supports`);
  const roomColumns = database.prepare<{ name: string }>('PRAGMA table_info(online_rooms)').all();
  if (!roomColumns.some(column => column.name === 'turn_started_at')) {
    database.exec('ALTER TABLE online_rooms ADD COLUMN turn_started_at TEXT');
    database.exec('UPDATE online_rooms SET turn_started_at=updated_at WHERE turn_started_at IS NULL');
  }
  const actionColumns = database.prepare<{ name: string; pk: number }>('PRAGMA table_info(online_actions)').all();
  const hasScopedKey = actionColumns.find(column => column.name === 'user_id')?.pk === 2 && actionColumns.find(column => column.name === 'action_id')?.pk === 3;
  if (!hasScopedKey) database.exec(`
    ALTER TABLE online_actions RENAME TO online_actions_legacy;
    CREATE TABLE online_actions (
      room_id TEXT NOT NULL REFERENCES online_rooms(id) ON DELETE CASCADE,
      action_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      accepted_version INTEGER NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY(room_id, user_id, action_id)
    );
    INSERT OR IGNORE INTO online_actions SELECT room_id,action_id,user_id,accepted_version,payload_json,created_at FROM online_actions_legacy;
    DROP TABLE online_actions_legacy;
  `);
  database.exec(`PRAGMA user_version = ${SUPPORTED_SCHEMA_VERSION}`);
}

let cached: { path: string; database: SqliteDatabase } | null = null;

async function dynamicImport(specifier: string): Promise<unknown> {
  return import(/* @vite-ignore */ specifier);
}

export async function openProgressDatabase(path = process.env.DATABASE_PATH): Promise<SqliteDatabase | null> {
  if (!path) return null;
  if (cached?.path === path) return cached.database;
  if (cached) cached.database.close();
  if (path !== ':memory:') {
    const nodePath = await dynamicImport('node:path') as typeof import('node:path');
    const fs = await dynamicImport('node:fs') as typeof import('node:fs');
    fs.mkdirSync(nodePath.dirname(path), { recursive: true });
  }
  const sqlite = await dynamicImport('node:sqlite') as typeof import('node:sqlite');
  const database = new sqlite.DatabaseSync(path) as unknown as SqliteDatabase;
  const version = database.prepare<{ user_version: number }>('PRAGMA user_version').get()?.user_version ?? 0;
  if (version > SUPPORTED_SCHEMA_VERSION) { database.close(); throw new Error(`Database schema ${version} is newer than this server supports`); }
  database.exec(connectionPragmas);
  database.exec('PRAGMA foreign_keys = OFF; BEGIN IMMEDIATE;');
  try {
    database.exec(schema);
    migrate(database, version);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    database.close();
    throw error;
  }
  database.exec('PRAGMA foreign_keys = ON;');
  cached = { path, database };
  return database;
}

export function resetProgressDatabaseForTests(): void {
  cached?.database.close();
  cached = null;
}

export function upsertSession(database: SqliteDatabase, claims: SessionClaims): void {
  const now = new Date().toISOString();
  database.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
  database.prepare(`INSERT INTO users(id,kind,display_name,created_at,updated_at) VALUES(?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,display_name=excluded.display_name,updated_at=excluded.updated_at`)
    .run(claims.userId, claims.kind, claims.displayName.slice(0, 80), now, now);
  database.prepare(`INSERT INTO sessions(id,user_id,expires_at,created_at) VALUES(?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET user_id=excluded.user_id,expires_at=excluded.expires_at`)
    .run(claims.sid, claims.userId, new Date(claims.exp * 1000).toISOString(), now);
}

export function isSessionActive(database: SqliteDatabase, claims: SessionClaims, now = Date.now()): boolean {
  const row = database.prepare<{ expires_at: string }>('SELECT expires_at FROM sessions WHERE id=? AND user_id=?').get(claims.sid, claims.userId);
  return Boolean(row && Date.parse(row.expires_at) > now);
}

export function revokeSession(database: SqliteDatabase, claims: SessionClaims): void {
  database.prepare('DELETE FROM sessions WHERE id=? AND user_id=?').run(claims.sid, claims.userId);
}

export function saveCompletedMatch(database: SqliteDatabase, claims: SessionClaims, game: GameState, analysis: MatchAnalysisInput): StoredMatchSummary {
  if (game.phase !== 'finished' || !Array.isArray(game.events) || game.events.length > 2000) throw new Error('Only bounded completed matches can be stored');
  upsertSession(database, claims);
  const id = `${claims.userId}:${game.seed}`;
  const finishedAt = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    database.prepare(`INSERT INTO matches(id,user_id,seed,level,round_no,score,social_score,title,state_json,finished_at)
      VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id,seed) DO UPDATE SET level=excluded.level,round_no=excluded.round_no,
      score=excluded.score,social_score=excluded.social_score,title=excluded.title,state_json=excluded.state_json,finished_at=excluded.finished_at`)
      .run(id, claims.userId, game.seed, game.level, game.roundNo, analysis.score, analysis.socialScore, analysis.title.slice(0, 120), JSON.stringify(game), finishedAt);
    database.prepare('DELETE FROM match_events WHERE match_id=?').run(id);
    const insertEvent = database.prepare('INSERT INTO match_events(match_id,sequence,event_type,payload_json) VALUES(?,?,?,?)');
    game.events.forEach((event, sequence) => insertEvent.run(id, sequence, event.type, JSON.stringify(event)));
    database.prepare(`INSERT INTO analyses(match_id,advice_json,metrics_json,created_at) VALUES(?,?,?,?)
      ON CONFLICT(match_id) DO UPDATE SET advice_json=excluded.advice_json,metrics_json=excluded.metrics_json,created_at=excluded.created_at`)
      .run(id, JSON.stringify(analysis.advice.slice(0, 12)), JSON.stringify(analysis.metrics), finishedAt);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return { id, seed: game.seed, level: game.level, roundNo: game.roundNo, score: analysis.score, socialScore: analysis.socialScore, title: analysis.title, finishedAt };
}

export function listMatchSummaries(database: SqliteDatabase, userId: string, limit = 20): StoredMatchSummary[] {
  const rows = database.prepare<{ id:string;seed:number;level:number;round_no:number;score:number;social_score:number;title:string;finished_at:string }>(
    'SELECT id,seed,level,round_no,score,social_score,title,finished_at FROM matches WHERE user_id=? ORDER BY finished_at DESC LIMIT ?'
  ).all(userId, Math.max(1, Math.min(limit, 50)));
  return rows.map(row => ({ id: row.id, seed: row.seed, level: row.level, roundNo: row.round_no, score: row.score, socialScore: row.social_score, title: row.title, finishedAt: row.finished_at }));
}

export function listStoredGames(database: SqliteDatabase, userId: string, limit = 12): GameState[] {
  const rows = database.prepare<{ state_json: string }>('SELECT state_json FROM matches WHERE user_id=? ORDER BY finished_at DESC LIMIT ?').all(userId, Math.max(1, Math.min(limit, 12)));
  return rows.flatMap(row => { try { const game = JSON.parse(row.state_json) as GameState; return game.schemaVersion === 2 && Array.isArray(game.players) && Array.isArray(game.events) ? [game] : []; } catch { return []; } });
}

function readTrainingRow(database: SqliteDatabase, userId: string): StoredTrainingProfile {
  const row = database.prepare<{ profile_json: string; revision: number; updated_at: string }>('SELECT profile_json,revision,updated_at FROM training_profiles WHERE user_id=?').get(userId);
  if (!row) return { profile: structuredClone(EMPTY_TRAINING_PROFILE), revision: 0, updatedAt: null };
  try {
    const profile = parseTrainingProfile(JSON.parse(row.profile_json));
    return profile ? { profile, revision: row.revision, updatedAt: row.updated_at } : { profile: structuredClone(EMPTY_TRAINING_PROFILE), revision: row.revision, updatedAt: row.updated_at };
  } catch { return { profile: structuredClone(EMPTY_TRAINING_PROFILE), revision: row.revision, updatedAt: row.updated_at }; }
}

export function getTrainingProfile(database: SqliteDatabase, userId: string): StoredTrainingProfile {
  return readTrainingRow(database, userId);
}

/** Atomically charges both the signed user and the whole deployment for a UTC day. */
export function consumeUsageQuota(database: SqliteDatabase, claims: SessionClaims, quotaKey: string, units: number, userLimit: number, globalLimit: number, now = new Date()): UsageQuotaResult {
  if (!/^[a-z][a-z0-9_-]{1,39}$/u.test(quotaKey) || !Number.isSafeInteger(units) || units < 1 || !Number.isSafeInteger(userLimit) || userLimit < 1 || !Number.isSafeInteger(globalLimit) || globalLimit < userLimit) throw new Error('Invalid usage quota configuration');
  const periodStart = now.toISOString().slice(0, 10), reset = new Date(`${periodStart}T00:00:00.000Z`); reset.setUTCDate(reset.getUTCDate() + 1);
  database.exec('BEGIN IMMEDIATE');
  try {
    const active = database.prepare(`SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=? AND s.user_id=? AND s.expires_at>?`).get(claims.sid, claims.userId, now.toISOString());
    if (!active) throw new Error('Provider session is no longer active');
    const userUsed = database.prepare<{ used: number }>('SELECT used FROM usage_quotas WHERE user_id=? AND quota_key=? AND period_start=?').get(claims.userId, quotaKey, periodStart)?.used ?? 0;
    const globalUsed = database.prepare<{ used: number }>('SELECT used FROM global_usage_quotas WHERE quota_key=? AND period_start=?').get(quotaKey, periodStart)?.used ?? 0;
    if (userUsed + units > userLimit || globalUsed + units > globalLimit) {
      database.exec('COMMIT');
      return { allowed: false, userUsed, globalUsed, resetAt: reset.toISOString() };
    }
    database.prepare(`INSERT INTO usage_quotas(user_id,quota_key,period_start,used) VALUES(?,?,?,?) ON CONFLICT(user_id,quota_key,period_start) DO UPDATE SET used=used+excluded.used`).run(claims.userId, quotaKey, periodStart, units);
    database.prepare(`INSERT INTO global_usage_quotas(quota_key,period_start,used) VALUES(?,?,?) ON CONFLICT(quota_key,period_start) DO UPDATE SET used=used+excluded.used`).run(quotaKey, periodStart, units);
    database.prepare("DELETE FROM usage_quotas WHERE period_start < date(?, '-8 days')").run(periodStart);
    database.prepare("DELETE FROM global_usage_quotas WHERE period_start < date(?, '-32 days')").run(periodStart);
    database.exec('COMMIT');
    return { allowed: true, userUsed: userUsed + units, globalUsed: globalUsed + units, resetAt: reset.toISOString() };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export class TrainingRevisionConflictError extends Error {
  constructor(public readonly latest: StoredTrainingProfile) { super('Training profile revision conflict'); }
}

export function saveTrainingProfile(database: SqliteDatabase, claims: SessionClaims, incoming: TrainingProfile, baseRevision?: number): StoredTrainingProfile {
  const now = new Date().toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    const active = database.prepare(`SELECT 1 FROM sessions s JOIN users u ON u.id=s.user_id
      WHERE s.id=? AND s.user_id=? AND s.expires_at>?`).get(claims.sid, claims.userId, now);
    if (!active) throw new Error('Training session is no longer active');
    const stored = readTrainingRow(database, claims.userId);
    if (baseRevision !== undefined && baseRevision !== stored.revision) throw new TrainingRevisionConflictError(stored);
    const profile = mergeTrainingProfiles(stored.profile, incoming), revision = stored.revision + 1;
    database.prepare(`INSERT INTO training_profiles(user_id,profile_json,revision,updated_at) VALUES(?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json,revision=excluded.revision,updated_at=excluded.updated_at`)
      .run(claims.userId, JSON.stringify(profile), revision, now);
    database.exec('COMMIT');
    return { profile, revision, updatedAt: now };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}

export function exportUserProgress(database: SqliteDatabase, userId: string): { profile: unknown; googleAccount: unknown; usage: unknown[]; training: StoredTrainingProfile; matches: unknown[]; events: unknown[]; analyses: unknown[] } {
  return {
    profile: database.prepare('SELECT id,kind,display_name,created_at,updated_at FROM users WHERE id=?').get(userId) ?? null,
    googleAccount: database.prepare('SELECT provider_subject,email,created_at,updated_at FROM google_accounts WHERE user_id=?').get(userId) ?? null,
    usage: database.prepare('SELECT quota_key,period_start,used FROM usage_quotas WHERE user_id=? ORDER BY period_start,quota_key').all(userId),
    training: getTrainingProfile(database, userId),
    matches: database.prepare('SELECT * FROM matches WHERE user_id=? ORDER BY finished_at').all(userId),
    events: database.prepare('SELECT e.* FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.user_id=? ORDER BY e.match_id,e.sequence').all(userId),
    analyses: database.prepare('SELECT a.* FROM analyses a JOIN matches m ON m.id=a.match_id WHERE m.user_id=? ORDER BY a.created_at').all(userId),
  };
}

export function deleteUserProgress(database: SqliteDatabase, userId: string): void {
  database.prepare('DELETE FROM users WHERE id=?').run(userId);
}

export function hasOnlinePresence(database: SqliteDatabase, userId: string): boolean {
  const queued = database.prepare('SELECT 1 FROM matchmaking_queue WHERE user_id=?').get(userId);
  const playing = database.prepare(`SELECT 1 FROM online_room_members m JOIN online_rooms r ON r.id=m.room_id
    WHERE m.user_id=? AND r.status='playing' LIMIT 1`).get(userId);
  return Boolean(queued || playing);
}

export function claimGoogleAccount(database: SqliteDatabase, guestUserId: string | null, profile: { subject: string; email: string; displayName: string }): { userId: string; displayName: string } {
  if (!profile.subject || !profile.email || !profile.displayName) throw new Error('Incomplete Google profile');
  const now = new Date().toISOString(), displayName = profile.displayName.slice(0, 80), email = profile.email.slice(0, 320);
  database.exec('BEGIN IMMEDIATE');
  try {
    if (guestUserId && hasOnlinePresence(database, guestUserId)) throw new Error('Leave online play before claiming an account');
    const existing = database.prepare<{ user_id: string }>('SELECT user_id FROM google_accounts WHERE provider_subject=?').get(profile.subject);
    const userId = existing?.user_id ?? crypto.randomUUID();
    database.prepare(`INSERT INTO users(id,kind,display_name,created_at,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET kind='google',display_name=excluded.display_name,updated_at=excluded.updated_at`)
      .run(userId, 'google', displayName, now, now);
    database.prepare(`INSERT INTO google_accounts(provider_subject,user_id,email,created_at,updated_at) VALUES(?,?,?,?,?)
      ON CONFLICT(provider_subject) DO UPDATE SET email=excluded.email,updated_at=excluded.updated_at`)
      .run(profile.subject, userId, email, now, now);
    if (guestUserId && guestUserId !== userId) {
      const guestTraining = readTrainingRow(database, guestUserId), accountTraining = readTrainingRow(database, userId);
      if (guestTraining.revision > 0) {
        const merged = mergeTrainingProfiles(accountTraining.profile, guestTraining.profile);
        database.prepare(`INSERT INTO training_profiles(user_id,profile_json,revision,updated_at) VALUES(?,?,?,?)
          ON CONFLICT(user_id) DO UPDATE SET profile_json=excluded.profile_json,revision=excluded.revision,updated_at=excluded.updated_at`)
          .run(userId, JSON.stringify(merged), Math.max(accountTraining.revision, guestTraining.revision) + 1, now);
      }
      database.prepare('DELETE FROM matches WHERE user_id=? AND seed IN (SELECT seed FROM matches WHERE user_id=?)').run(guestUserId, userId);
      database.prepare('UPDATE matches SET user_id=? WHERE user_id=?').run(userId, guestUserId);
      database.prepare(`INSERT INTO usage_quotas(user_id,quota_key,period_start,used)
        SELECT ?,quota_key,period_start,used FROM usage_quotas WHERE user_id=?
        ON CONFLICT(user_id,quota_key,period_start) DO UPDATE SET used=used+excluded.used`).run(userId, guestUserId);
      database.prepare('UPDATE sessions SET user_id=? WHERE user_id=?').run(userId, guestUserId);
      database.prepare('DELETE FROM users WHERE id=?').run(guestUserId);
    }
    database.exec('COMMIT');
    return { userId, displayName };
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
