import { afterEach, describe, expect, it } from 'vitest';
import { applyOnlineAction, cancelOnlineRoom, getQueueStatus, joinMatchmaking, OnlineActionError, projectOnlineRoom } from '../../lib/services/online-store';
import { openProgressDatabase, resetProgressDatabaseForTests } from '../../lib/services/progress-store';
import { createGuestSession } from '../../lib/services/session';

const secret = 'online-room-test-secret-with-at-least-32-characters';

afterEach(() => resetProgressDatabaseForTests());

describe('server-authoritative online rooms', () => {
  it('matches four guests, hides opponents, versions actions and deduplicates retries', async () => {
    const database = await openProgressDatabase(':memory:');
    const claims = await Promise.all(Array.from({ length: 4 }, async () => (await createGuestSession(secret)).claims));
    for (const player of claims) joinMatchmaking(database!, player);
    const statuses = claims.map(player => getQueueStatus(database!, player.userId));
    expect(statuses.every(status => status.status === 'matched')).toBe(true);
    const firstStatus = statuses[0];
    if (firstStatus.status !== 'matched') throw new Error('expected room');
    const roomId = firstStatus.roomId;
    const views = claims.map(player => projectOnlineRoom(database!, roomId, player.userId)!);
    for (const view of views) {
      expect(view.state.players.find(player => player.seat === view.youSeat)?.hand).toHaveLength(27);
      expect(view.state.players.filter(player => player.seat !== view.youSeat).every(player => player.hand.length === 0 && player.cardCount === 27)).toBe(true);
      expect(view.state.events[0].note).toBe('已发牌');
      expect(view.state).not.toHaveProperty('seed');
    }
    const turnSeat = views[0].state.turn;
    const actorIndex = views.findIndex(view => view.youSeat === turnSeat), actor = claims[actorIndex], actorView = views[actorIndex];
    const cardId = actorView.state.players.find(player => player.seat === turnSeat)!.hand[0].id;
    const accepted = applyOnlineAction(database!, roomId, actor, { actionId: 'action_0001', expectedVersion: 0, type: 'play', cardIds: [cardId] });
    expect(accepted.version).toBe(1);
    expect(accepted.state.players.find(player => player.seat === turnSeat)?.cardCount).toBe(26);
    expect(applyOnlineAction(database!, roomId, actor, { actionId: 'action_0001', expectedVersion: 0, type: 'play', cardIds: [cardId] }).version).toBe(1);
    expect(() => applyOnlineAction(database!, roomId, actor, { actionId: 'action_0001', expectedVersion: 0, type: 'pass' })).toThrow(/其他操作/u);
    expect(() => applyOnlineAction(database!, roomId, actor, { actionId: 'action_0003', expectedVersion: 1, type: 'invalid' as 'pass' })).toThrow(/类型/u);
    const nextActor = claims[views.findIndex(view => view.youSeat === accepted.state.turn)];
    expect(() => applyOnlineAction(database!, roomId, nextActor, { actionId: 'action_0002', expectedVersion: 0, type: 'pass' })).toThrow(OnlineActionError);
    expect(projectOnlineRoom(database!, roomId, 'not-a-member')).toBeNull();
    cancelOnlineRoom(database!, roomId, claims[1].userId);
    expect(projectOnlineRoom(database!, roomId, claims[0].userId)?.status).toBe('cancelled');
  });

  it('expires a room after two minutes without an action', async () => {
    const database = await openProgressDatabase(':memory:');
    const claims = await Promise.all(Array.from({ length: 4 }, async () => (await createGuestSession(secret)).claims));
    claims.forEach(player => joinMatchmaking(database!, player));
    const status = getQueueStatus(database!, claims[0].userId);
    if (status.status !== 'matched') throw new Error('expected room');
    database!.prepare('UPDATE online_rooms SET turn_started_at=? WHERE id=?').run('2000-01-01T00:00:00.000Z', status.roomId);
    expect(projectOnlineRoom(database!, status.roomId, claims[0].userId)?.status).toBe('cancelled');
  });
});
