import type { GameState } from '@/lib/game/types';
import type { SessionClaims } from './session';

interface Statement<Row = Record<string, unknown>> {
  run(...values: unknown[]): unknown;
  all(...values: unknown[]): Row[];
  get(...values: unknown[]): Row | undefined;
}

interface SqliteDatabase {
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

const schema = `
PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
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
CREATE TABLE IF NOT EXISTS usage_quotas (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quota_key TEXT NOT NULL,
  period_start TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(user_id, quota_key, period_start)
);
CREATE INDEX IF NOT EXISTS matches_user_finished ON matches(user_id, finished_at DESC);
PRAGMA user_version = 1;
`;

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
  database.exec(schema);
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

export function exportUserProgress(database: SqliteDatabase, userId: string): { profile: unknown; matches: unknown[]; events: unknown[]; analyses: unknown[] } {
  return {
    profile: database.prepare('SELECT id,kind,display_name,created_at,updated_at FROM users WHERE id=?').get(userId) ?? null,
    matches: database.prepare('SELECT * FROM matches WHERE user_id=? ORDER BY finished_at').all(userId),
    events: database.prepare('SELECT e.* FROM match_events e JOIN matches m ON m.id=e.match_id WHERE m.user_id=? ORDER BY e.match_id,e.sequence').all(userId),
    analyses: database.prepare('SELECT a.* FROM analyses a JOIN matches m ON m.id=a.match_id WHERE m.user_id=? ORDER BY a.created_at').all(userId),
  };
}

export function deleteUserProgress(database: SqliteDatabase, userId: string): void {
  database.prepare('DELETE FROM users WHERE id=?').run(userId);
}
