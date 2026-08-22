import { RANK_LABEL, createDeck, shuffle } from "../game/cards";
import type { Card, Rank } from "../game/types";

export type CountKind = "jokers" | "ace" | "two" | "level";
export interface CountDrill {
  kind: CountKind;
  level: Rank;
  label: string;
  total: number;
  seen: number;
  remaining: number;
  plays: Card[][];
  options: number[];
}
export interface CountAttempt {
  id?: string;
  round: number;
  kind: CountKind;
  seen: number;
  remaining: number;
  answer: number;
  correct: boolean;
}
export interface GridAttempt {
  id?: string;
  round: number;
  score: number;
  maxScore?: 3 | 9 | 18;
}
export type NineGridKey =
  | "bigJoker"
  | "smallJoker"
  | "heartLevel"
  | "ace"
  | "plainLevel"
  | "king"
  | "five"
  | "ten"
  | "queen";
export interface NineGridCell {
  key: NineGridKey;
  label: string;
  total: number;
  own: number;
  seen: number;
  initial: number;
  remaining: number;
}
export interface NineGridDrill {
  level: Rank;
  hand: Card[];
  plays: Card[][];
  cells: NineGridCell[];
}

const KINDS: CountKind[] = ["jokers", "ace", "two", "level"];
const LEVELS: Rank[] = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
const isKind = (value: unknown): value is CountKind =>
  typeof value === "string" && KINDS.includes(value as CountKind);
const NINE_GRID: Array<{
  key: NineGridKey;
  label: string;
  total: number;
  matches: (card: Card) => boolean;
}> = [
  {
    key: "bigJoker",
    label: "大王",
    total: 2,
    matches: (card) => card.rank === 16,
  },
  {
    key: "smallJoker",
    label: "小王",
    total: 2,
    matches: (card) => card.rank === 15,
  },
  {
    key: "heartLevel",
    label: "红桃级牌",
    total: 2,
    matches: (card) => card.suit === "H" && card.rank === 2,
  },
  { key: "ace", label: "A", total: 8, matches: (card) => card.rank === 14 },
  {
    key: "plainLevel",
    label: "普通级牌",
    total: 6,
    matches: (card) => card.rank === 2 && card.suit !== "H",
  },
  { key: "king", label: "K", total: 8, matches: (card) => card.rank === 13 },
  { key: "five", label: "5", total: 8, matches: (card) => card.rank === 5 },
  { key: "ten", label: "10", total: 8, matches: (card) => card.rank === 10 },
  { key: "queen", label: "Q", total: 8, matches: (card) => card.rank === 12 },
];

/** The popular nine-cell remaining-count drill. Level 2 avoids category overlap while learning. */
export function createNineGridDrill(
  seed: number,
  round: number,
): NineGridDrill {
  const deck = shuffle(createDeck(), seed + round * 977),
    hand = deck.slice(0, 27),
    outside = deck.slice(27);
  const keyCards = outside.filter((card) =>
      NINE_GRID.some((cell) => cell.matches(card)),
    ),
    decoys = outside.filter(
      (card) => !NINE_GRID.some((cell) => cell.matches(card)),
    );
  const exposed = shuffle(
    [
      ...shuffle(keyCards, seed + round).slice(0, 8),
      ...shuffle(decoys, seed ^ round).slice(0, 7),
    ],
    seed + round * 313,
  );
  const cells = NINE_GRID.map((cell) => {
    const own = hand.filter(cell.matches).length,
      seen = exposed.filter(cell.matches).length;
    return {
      key: cell.key,
      label: cell.label,
      total: cell.total,
      own,
      seen,
      initial: cell.total - own,
      remaining: cell.total - own - seen,
    };
  });
  return {
    level: 2,
    hand,
    plays: [exposed.slice(0, 5), exposed.slice(5, 10), exposed.slice(10)],
    cells,
  };
}

export function createCountDrill(
  seed: number,
  round: number,
  focus?: CountKind,
): CountDrill {
  const level = LEVELS[Math.abs(seed + round) % LEVELS.length],
    kind = focus ?? KINDS[Math.abs(seed + round) % KINDS.length],
    rank =
      kind === "ace"
        ? 14
        : kind === "two"
          ? 2
          : kind === "level"
            ? level
            : null;
  const matches = (card: Card) =>
      kind === "jokers" ? card.rank >= 15 : card.rank === rank,
    total = kind === "jokers" ? 4 : 8,
    label =
      kind === "jokers"
        ? "王"
        : kind === "ace"
          ? "A"
          : kind === "two"
            ? "2"
            : `级牌 ${RANK_LABEL[level]}`;
  const deck = createDeck(),
    targets = shuffle(deck.filter(matches), seed + round * 31),
    decoys = shuffle(
      deck.filter((card) => !matches(card)),
      seed ^ (round * 101),
    ),
    seen = 1 + (Math.abs(seed * 7 + round * 3) % Math.min(4, total)),
    publicCards = shuffle(
      [...targets.slice(0, seen), ...decoys.slice(0, 7)],
      seed + round * 211,
    ),
    plays = [
      publicCards.slice(0, 3),
      publicCards.slice(3, 6),
      publicCards.slice(6),
    ],
    remaining = total - seen;
  const options = shuffle(
    [
      ...new Set([
        Math.max(0, remaining - 1),
        remaining,
        Math.min(total, remaining + 1),
      ]),
    ],
    seed + round * 503,
  );
  return { kind, level, label, total, seen, remaining, plays, options };
}

export function parseCountAttempts(raw: string | null): CountAttempt[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as {
      schemaVersion?: unknown;
      attempts?: unknown;
    };
    if (value.schemaVersion !== 1 || !Array.isArray(value.attempts)) return [];
    return value.attempts
      .filter((item): item is CountAttempt => {
        if (!item || typeof item !== "object") return false;
        const attempt = item as Partial<CountAttempt>,
          { id, round, kind, seen, remaining, answer, correct } = attempt;
        if (
          id !== undefined &&
          (typeof id !== "string" || !/^[A-Za-z0-9_-]{8,100}$/.test(id))
        )
          return false;
        if (
          !isKind(kind) ||
          typeof round !== "number" ||
          typeof seen !== "number" ||
          typeof remaining !== "number" ||
          typeof answer !== "number" ||
          typeof correct !== "boolean"
        )
          return false;
        const total = kind === "jokers" ? 4 : 8;
        return (
          Number.isInteger(round) &&
          round >= 1 &&
          round <= 1_000_000 &&
          Number.isInteger(seen) &&
          seen >= 0 &&
          seen <= total &&
          Number.isInteger(remaining) &&
          remaining >= 0 &&
          remaining <= total &&
          seen + remaining === total &&
          Number.isInteger(answer) &&
          answer >= 0 &&
          answer <= total &&
          correct === (answer === remaining)
        );
      })
      .slice(-50);
  } catch {
    return [];
  }
}

export function serializeCountAttempts(attempts: CountAttempt[]): string {
  return JSON.stringify({ schemaVersion: 1, attempts: attempts.slice(-50) });
}

export function parseGridAttempts(raw: string | null): GridAttempt[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown,
      attempts = Array.isArray(value)
        ? value
        : value &&
            typeof value === "object" &&
            (value as { schemaVersion?: unknown }).schemaVersion === 1
          ? (value as { attempts?: unknown }).attempts
          : null;
    if (!Array.isArray(attempts)) return [];
    return attempts
      .filter((item): item is GridAttempt => {
        if (!item || typeof item !== "object") return false;
        const { id, round, score, maxScore } = item as Partial<GridAttempt>;
        return (
          (id === undefined ||
            (typeof id === "string" && /^[A-Za-z0-9_-]{8,100}$/.test(id))) &&
          typeof round === "number" &&
          Number.isInteger(round) &&
          round >= 1 &&
          round <= 1_000_000 &&
          typeof score === "number" &&
          Number.isInteger(score) &&
          score >= 0 &&
          score <= (maxScore ?? 3) &&
          (maxScore === undefined || [3, 9, 18].includes(maxScore))
        );
      })
      .slice(-50);
  } catch {
    return [];
  }
}

export function serializeGridAttempts(attempts: GridAttempt[]): string {
  return JSON.stringify({ schemaVersion: 1, attempts: attempts.slice(-50) });
}
