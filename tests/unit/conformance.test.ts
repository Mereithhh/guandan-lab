import { describe, expect, it } from 'vitest';
import { createDeck, rankPower } from '../../lib/game/cards';
import { newGame, nextRound, passTurn, playCards } from '../../lib/game/engine';
import { beats, parseCombo } from '../../lib/game/rules';
import type { GameState, Seat } from '../../lib/game/types';
import {
  card,
  COMPETITION_2022_SOURCE,
  ORDERING_FIXTURES,
  TRIBUTE_FIXTURES,
  WILD_AND_SEQUENCE_FIXTURES,
} from '../fixtures/competition-2022';

const reference = (section: keyof typeof COMPETITION_2022_SOURCE.sections) =>
  `${COMPETITION_2022_SOURCE.edition} · ${COMPETITION_2022_SOURCE.sections[section]}`;

function completedDeal(finishOrder: Seat[]): GameState {
  const state = newGame(4);
  return {
    ...state,
    phase: 'finished',
    finishOrder,
    players: state.players.map(player => ({ ...player, finished: finishOrder.indexOf(player.seat) + 1 })),
  };
}

describe('2022 competition-rule conformance fixtures', () => {
  it('keeps every fixture tied to the reviewed edition and a named section', () => {
    expect(COMPETITION_2022_SOURCE.authority).toContain('国家体育总局棋牌运动管理中心');
    expect(COMPETITION_2022_SOURCE.adoption).toContain('赛事办赛指南');
    expect(COMPETITION_2022_SOURCE.adoptionUrl).toMatch(/^https:\/\/www\.sport\.gov\.cn\//u);
    for (const fixture of [...WILD_AND_SEQUENCE_FIXTURES, ...ORDERING_FIXTURES, ...TRIBUTE_FIXTURES]) {
      expect(reference(fixture.section), fixture.name).toContain('2022');
      expect(COMPETITION_2022_SOURCE.sections[fixture.section], fixture.name).not.toHaveLength(0);
    }
  });

  it.each(WILD_AND_SEQUENCE_FIXTURES)('$name [$section]', fixture => {
    const parsed = parseCombo(fixture.cards, fixture.level);
    expect(parsed?.kind ?? null, reference(fixture.section)).toBe(fixture.kind);
    if (fixture.mainRank !== undefined) expect(parsed?.mainRank, reference(fixture.section)).toBe(fixture.mainRank);
    if (fixture.wildCount !== undefined) expect(parsed?.wildIds, reference(fixture.section)).toHaveLength(fixture.wildCount);
  });

  it.each(ORDERING_FIXTURES)('$name [$section]', fixture => {
    const lower = parseCombo(fixture.lower, fixture.level);
    const higher = parseCombo(fixture.higher, fixture.level);
    expect(lower, `${fixture.name}: lower · ${reference(fixture.section)}`).not.toBeNull();
    expect(higher, `${fixture.name}: higher · ${reference(fixture.section)}`).not.toBeNull();
    expect(beats(higher!, lower!), reference(fixture.section)).toBe(true);
    expect(beats(lower!, higher!), reference(fixture.section)).toBe(false);
  });

  it('lets an earlier passer act again after another seat raises', () => {
    const opening = card(3), seatOne = card(4), raising = card(5), seatThree = card(6);
    const spare = [card(10), card(11), card(12), card(13)];
    const base = newGame(8);
    let state: GameState = {
      ...base,
      turn: 1,
      leader: 0,
      passes: 0,
      lastPlay: { seat: 0, cardIds: [opening.id], combo: parseCombo([opening], 2)! },
      players: base.players.map((player, seat) => ({
        ...player,
        hand: [[spare[0]], [seatOne, spare[1]], [raising, spare[2]], [seatThree, spare[3]]][seat],
        finished: undefined,
      })),
    };

    state = passTurn(state, 1);
    expect(state.turn).toBe(2);
    state = playCards(state, 2, [raising.id]);
    expect(state.passes, reference('play')).toBe(0);
    state = passTurn(state, 3);
    state = passTurn(state, 0);
    expect(state.turn, 'seat 1 passed before the raise but must receive a new response turn').toBe(1);
    state = passTurn(state, 1);
    expect(state.lastPlay, reference('play')).toBeNull();
    expect(state.turn).toBe(2);
  });

  it.each(TRIBUTE_FIXTURES)('$name [$section]', fixture => {
    const previous = completedDeal(fixture.finishOrder);
    const next = nextRound(previous, fixture.seed);
    const roundEvents = next.events.filter(event => event.type === 'round');
    const doubleDown = fixture.finishOrder[0] % 2 === fixture.finishOrder[1] % 2;
    const givers = doubleDown ? [fixture.finishOrder[3], fixture.finishOrder[2]] : [fixture.finishOrder[3]];
    const dealt = newGame(fixture.seed, next.level);

    if (fixture.expected === 'resistance') {
      const bigJokers = givers.flatMap(seat => dealt.players[seat].hand).filter(candidate => candidate.rank === 16);
      expect(bigJokers, reference(fixture.section)).toHaveLength(2);
      expect(roundEvents).toHaveLength(1);
      expect(roundEvents[0].note).toContain('抗贡');
      expect(next.turn).toBe(fixture.finishOrder[0]);
      return;
    }

    const deck = new Map(createDeck().map(candidate => [candidate.id, candidate]));
    expect(roundEvents, reference(fixture.section)).toHaveLength(doubleDown ? 2 : 1);
    for (const event of roundEvents) {
      const [tributeId, returnId] = event.cardIds!;
      const tribute = deck.get(tributeId)!;
      const returned = deck.get(returnId)!;
      const giverHand = dealt.players[event.seat!].hand;
      const eligible = giverHand.filter(candidate => !(candidate.suit === 'H' && candidate.rank === next.level));
      const maximum = Math.max(...eligible.map(candidate => rankPower(candidate.rank, next.level)));
      expect(tribute.suit === 'H' && tribute.rank === next.level, reference(fixture.section)).toBe(false);
      expect(rankPower(tribute.rank, next.level), reference(fixture.section)).toBe(maximum);
      expect(rankPower(returned.rank, next.level), reference(fixture.section)).toBeLessThanOrEqual(10);
    }

    if (doubleDown) {
      const powers = roundEvents.map(event => rankPower(deck.get(event.cardIds![0])!.rank, next.level));
      expect(powers[0], 'head winner receives the larger double tribute').toBeGreaterThanOrEqual(powers[1]);
    }
    expect(next.turn, 'the giver of the larger/only tribute leads').toBe(roundEvents[0].seat);
  });
});
