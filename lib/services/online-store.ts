import { newGame, passTurn, playCards } from '../game/engine';
import type { Card, Combo, GameEvent, GameState, Rank, Seat } from '../game/types';
import type { SqliteDatabase } from './progress-store';
import { upsertSession } from './progress-store';
import type { SessionClaims } from './session';

interface QueueRow { user_id: string; display_name: string; kind: 'guest'|'google'; joined_at: string }
interface MembershipRow { room_id: string; seat: number; version: number; status: 'playing'|'finished'|'cancelled' }
interface RoomRow { id: string; state_json: string; version: number; status: 'playing'|'finished'|'cancelled'; seat: number; turn_started_at: string }

const TURN_TIMEOUT_MS = 120_000;

function expireStaleRooms(database: SqliteDatabase, roomId?: string): void {
  const sql = `UPDATE online_rooms SET status='cancelled',updated_at=? WHERE status='playing' AND turn_started_at < ?${roomId ? ' AND id=?' : ''}`;
  const values = [new Date().toISOString(), new Date(Date.now() - TURN_TIMEOUT_MS).toISOString(), ...(roomId ? [roomId] : [])];
  database.prepare(sql).run(...values);
}

export interface OnlinePlayerView {
  seat: Seat;
  name: string;
  role: 'you'|'partner'|'opponent';
  hand: Card[];
  cardCount: number;
  finished?: number;
}

export interface OnlineRoomView {
  id: string;
  version: number;
  status: 'playing'|'finished'|'cancelled';
  turnDeadline: string | null;
  youSeat: Seat;
  state: {
    schemaVersion: 2;
    ruleVersion: GameState['ruleVersion'];
    createdAt: number;
    level: Rank;
    phase: GameState['phase']|'cancelled';
    players: OnlinePlayerView[];
    turn: Seat;
    leader: Seat;
    lastPlay: { seat: Seat; cardIds: string[]; combo: Combo } | null;
    passes: number;
    finishOrder: Seat[];
    events: GameEvent[];
    trickNo: number;
  };
}

export type QueueStatus = { status: 'idle' } | { status: 'queued'; position: number; waiting: number; joinedAt: string } | { status: 'matched'; roomId: string; seat: Seat; version: number };

function membership(database: SqliteDatabase, userId: string): MembershipRow | undefined {
  expireStaleRooms(database);
  return database.prepare<MembershipRow>(`SELECT m.room_id,m.seat,r.version,r.status FROM online_room_members m
    JOIN online_rooms r ON r.id=m.room_id WHERE m.user_id=? AND r.status='playing' ORDER BY m.joined_at DESC LIMIT 1`).get(userId);
}

export function joinMatchmaking(database: SqliteDatabase, claims: SessionClaims): QueueStatus {
  upsertSession(database, claims);
  const now = new Date().toISOString(), stale = new Date(Date.now() - 5 * 60_000).toISOString();
  database.exec('BEGIN IMMEDIATE');
  try {
    const active = membership(database, claims.userId);
    if (active) {
      database.exec('COMMIT');
      return { status: 'matched', roomId: active.room_id, seat: active.seat as Seat, version: active.version };
    }
    database.prepare('DELETE FROM matchmaking_queue WHERE joined_at < ?').run(stale);
    database.prepare(`INSERT INTO matchmaking_queue(user_id,joined_at) VALUES(?,?)
      ON CONFLICT(user_id) DO UPDATE SET joined_at=excluded.joined_at`).run(claims.userId, now);
    const waiting = database.prepare<QueueRow>(`SELECT q.user_id,u.display_name,u.kind,q.joined_at FROM matchmaking_queue q
      JOIN users u ON u.id=q.user_id WHERE NOT EXISTS (
        SELECT 1 FROM online_room_members m JOIN online_rooms r ON r.id=m.room_id WHERE m.user_id=q.user_id AND r.status='playing'
      ) ORDER BY q.joined_at LIMIT 4`).all();
    if (waiting.length === 4) {
      const roomId = crypto.randomUUID(), seed = crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff, state = newGame(seed);
      state.players = state.players.map((player, seat) => ({ ...player, name: waiting[seat].kind === 'google' ? `牌友-${waiting[seat].user_id.replaceAll('-', '').slice(-6).toUpperCase()}` : waiting[seat].display_name.slice(0, 32) }));
      database.prepare('INSERT INTO online_rooms(id,state_json,version,status,created_at,updated_at,turn_started_at) VALUES(?,?,?,?,?,?,?)').run(roomId, JSON.stringify(state), 0, 'playing', now, now, now);
      const addMember = database.prepare('INSERT INTO online_room_members(room_id,user_id,seat,joined_at) VALUES(?,?,?,?)');
      const removeQueue = database.prepare('DELETE FROM matchmaking_queue WHERE user_id=?');
      waiting.forEach((player, seat) => { addMember.run(roomId, player.user_id, seat, now); removeQueue.run(player.user_id); });
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  return getQueueStatus(database, claims.userId);
}

export function getQueueStatus(database: SqliteDatabase, userId: string): QueueStatus {
  const active = membership(database, userId);
  if (active) return { status: 'matched', roomId: active.room_id, seat: active.seat as Seat, version: active.version };
  const queued = database.prepare<{ joined_at: string }>('SELECT joined_at FROM matchmaking_queue WHERE user_id=?').get(userId);
  if (!queued) return { status: 'idle' };
  if (Date.parse(queued.joined_at) < Date.now() - 5 * 60_000) { leaveMatchmaking(database, userId); return { status: 'idle' }; }
  const ahead = database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM matchmaking_queue WHERE joined_at <= ?').get(queued.joined_at)?.count ?? 1;
  const waiting = database.prepare<{ count: number }>('SELECT COUNT(*) AS count FROM matchmaking_queue').get()?.count ?? 1;
  return { status: 'queued', position: ahead, waiting, joinedAt: queued.joined_at };
}

export function leaveMatchmaking(database: SqliteDatabase, userId: string): void {
  database.prepare('DELETE FROM matchmaking_queue WHERE user_id=?').run(userId);
}

function roomRow(database: SqliteDatabase, roomId: string, userId: string): RoomRow | undefined {
  return database.prepare<RoomRow>(`SELECT r.id,r.state_json,r.version,r.status,r.turn_started_at,m.seat FROM online_rooms r
    JOIN online_room_members m ON m.room_id=r.id WHERE r.id=? AND m.user_id=?`).get(roomId, userId);
}

export function projectOnlineRoom(database: SqliteDatabase, roomId: string, userId: string): OnlineRoomView | null {
  expireStaleRooms(database, roomId);
  const row = roomRow(database, roomId, userId);
  if (!row) return null;
  const state = JSON.parse(row.state_json) as GameState, youSeat = row.seat as Seat, partner = ((youSeat + 2) % 4) as Seat;
  return {
    id: row.id, version: row.version, status: row.status, youSeat, turnDeadline: row.status === 'playing' ? new Date(Date.parse(row.turn_started_at) + TURN_TIMEOUT_MS).toISOString() : null,
    state: {
      schemaVersion: 2, ruleVersion: state.ruleVersion, createdAt: state.createdAt, level: state.level, phase: row.status === 'cancelled' ? 'cancelled' : state.phase,
      players: state.players.map(player => ({ seat: player.seat, name: player.name, role: player.seat === youSeat ? 'you' : player.seat === partner ? 'partner' : 'opponent', hand: player.seat === youSeat ? player.hand : [], cardCount: player.hand.length, finished: player.finished })),
      turn: state.turn, leader: state.leader, lastPlay: state.lastPlay, passes: state.passes, finishOrder: state.finishOrder,
      events: state.events.map(event => event.type === 'deal' ? { ...event, note: '已发牌' } : event), trickNo: state.trickNo,
    },
  };
}

export class OnlineActionError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

export function applyOnlineAction(database: SqliteDatabase, roomId: string, claims: SessionClaims, input: { actionId: string; expectedVersion: number; type: 'play'|'pass'; cardIds?: string[] }): OnlineRoomView {
  if (!input || !/^[A-Za-z0-9_-]{8,80}$/u.test(input.actionId) || !Number.isSafeInteger(input.expectedVersion)) throw new OnlineActionError('动作标识无效');
  if (input.type !== 'play' && input.type !== 'pass') throw new OnlineActionError('动作类型无效');
  if (input.type === 'pass' && input.cardIds !== undefined && (!Array.isArray(input.cardIds) || input.cardIds.length > 0)) throw new OnlineActionError('过牌不能携带手牌');
  const payload = JSON.stringify({ type: input.type, cardIds: input.type === 'play' ? input.cardIds ?? [] : [] });
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = roomRow(database, roomId, claims.userId);
    if (!row) throw new OnlineActionError('房间不存在或无权访问', 404);
    const duplicate = database.prepare<{ payload_json: string }>('SELECT payload_json FROM online_actions WHERE room_id=? AND action_id=? AND user_id=?').get(roomId, input.actionId, claims.userId);
    if (duplicate && duplicate.payload_json !== payload) throw new OnlineActionError('动作标识已被用于其他操作', 409);
    if (!duplicate) {
      if (row.status !== 'playing') throw new OnlineActionError('牌局已经结束', 409);
      if (row.version !== input.expectedVersion) throw new OnlineActionError('牌局版本已更新，请刷新后重试', 409);
      const state = JSON.parse(row.state_json) as GameState, seat = row.seat as Seat;
      let next: GameState;
      if (input.type === 'pass') next = passTurn(state, seat);
      else {
        const cardIds = input.cardIds;
        if (!Array.isArray(cardIds) || cardIds.length < 1 || cardIds.length > 12 || cardIds.some(id => typeof id !== 'string' || id.length > 40)) throw new OnlineActionError('出牌数据无效');
        next = playCards(state, seat, cardIds);
      }
      const now = new Date().toISOString();
      const updated = database.prepare('UPDATE online_rooms SET state_json=?,version=version+1,status=?,updated_at=?,turn_started_at=? WHERE id=? AND version=?').run(JSON.stringify(next), next.phase === 'finished' ? 'finished' : 'playing', now, now, roomId, row.version) as { changes?: number };
      if (updated.changes !== 1) throw new OnlineActionError('牌局版本冲突，请重试', 409);
      database.prepare('INSERT INTO online_actions(room_id,action_id,user_id,accepted_version,payload_json,created_at) VALUES(?,?,?,?,?,?)').run(roomId, input.actionId, claims.userId, row.version + 1, payload, now);
    }
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
  const projected = projectOnlineRoom(database, roomId, claims.userId);
  if (!projected) throw new OnlineActionError('房间不存在', 404);
  return projected;
}

export function cancelOnlineRoom(database: SqliteDatabase, roomId: string, userId: string): void {
  database.exec('BEGIN IMMEDIATE');
  try {
    const row = roomRow(database, roomId, userId);
    if (!row) throw new OnlineActionError('房间不存在或无权访问', 404);
    const now = new Date().toISOString();
    const updated = database.prepare(`UPDATE online_rooms SET status='cancelled',version=version+1,updated_at=? WHERE id=? AND status='playing'`).run(now, roomId) as { changes?: number };
    if (updated.changes === 1) database.prepare('INSERT INTO online_actions(room_id,action_id,user_id,accepted_version,payload_json,created_at) VALUES(?,?,?,?,?,?)')
      .run(roomId, `cancel_${crypto.randomUUID()}`, userId, row.version + 1, JSON.stringify({ type: 'cancel' }), now);
    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }
}
