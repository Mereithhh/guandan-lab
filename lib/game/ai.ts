import { beats, parseCombo } from "./rules";
import type { Card, GameState, Rank, Seat } from "./types";

export type AgentStyleId = "learner" | "control" | "partnerFirst" | "tempo";
export interface AgentPersona {
  id: AgentStyleId;
  label: string;
  description: string;
  yieldAt: number;
}
export const AGENT_PERSONAS: Record<Seat, AgentPersona> = {
  0: {
    id: "learner",
    label: "训练建议",
    description: "优先使用刚好够大的合法牌，保留炸弹。",
    yieldAt: 3,
  },
  1: {
    id: "control",
    label: "稳健控场",
    description: "王总偏爱对子控节奏；对手接近出完时会提高牌权压力。",
    yieldAt: 2,
  },
  2: {
    id: "partnerFirst",
    label: "搭档优先",
    description: "小顾会在搭档只剩 4 张以内时主动让路，平时尽量低成本跟牌。",
    yieldAt: 4,
  },
  3: {
    id: "tempo",
    label: "效率突围",
    description: "林姐优先一次带走更多张数，但不会无故先交炸弹。",
    yieldAt: 1,
  },
};
export function agentPersona(seat: Seat) {
  return AGENT_PERSONAS[seat];
}

/** Server-side policy instructions. Every agent may reason only from Observation. */
export function remotePersonaInstruction(id: AgentStyleId): string {
  const shared =
    "不得猜测或索要未提供的暗牌；不得故意放水、串通或为讨好某位玩家而降低合理牌力。";
  if (id === "control")
    return `你是“王总”的决策层：目标明确、节奏强、重视算牌证据和牌权，炸弹作为关键风险保险但不留到失去价值。${shared}`;
  if (id === "partnerFirst")
    return `你是“小顾”的决策层：优先为搭档保持牌权和接风路径，搭档接近出完时避免无意义盖牌，其余时候低成本跟牌。${shared}`;
  if (id === "tempo")
    return `你是“林姐”的决策层：优先整组出牌、减少碎牌并维持转换速度，但不在普通圈次无故先交炸弹。${shared}`;
  return `你是零基础训练决策层：优先刚好够大的合法牌并保留关键牌力。${shared}`;
}

export interface Observation {
  seat: Seat;
  role: GameState["players"][number]["role"];
  persona: AgentStyleId;
  hand: Card[];
  level: Rank;
  turn: Seat;
  lastPlay: GameState["lastPlay"];
  counts: number[];
  events: GameState["events"];
}
export interface AgentPolicy {
  name: string;
  choose(
    observation: Observation,
    legalMoves: string[][],
  ): Promise<string[] | null>;
}

export function observe(state: GameState, seat: Seat): Observation {
  const events = state.events
    .filter((e) => e.type !== "deal")
    .map((e) => ({ ...e, note: e.type === "round" ? e.note : undefined }));
  return {
    seat,
    role: state.players[seat].role,
    persona: agentPersona(seat).id,
    hand: state.players[seat].hand,
    level: state.level,
    turn: state.turn,
    lastPlay: state.lastPlay,
    counts: state.players.map((p) => p.hand.length),
    events,
  };
}

export function legalMoves(o: Observation): string[][] {
  const hand = o.hand,
    wild = hand.filter((c) => c.suit === "H" && c.rank === o.level),
    groups = new Map<number, Card[]>();
  for (const c of hand) groups.set(c.rank, [...(groups.get(c.rank) || []), c]);
  const candidates: Card[][] = hand.map((c) => [c]);
  for (const g of groups.values())
    for (let n = 2; n <= Math.min(g.length, 10); n++)
      candidates.push(g.slice(0, n));
  for (let rank = 2; rank <= 14; rank++) {
    const base = (groups.get(rank) || []).filter((c) => !wild.includes(c));
    for (let size = 2; size <= 10; size++) {
      const need = size - base.length;
      if (base.length && need >= 0 && need <= wild.length)
        candidates.push([
          ...base.slice(0, size - need),
          ...wild.slice(0, need),
        ]);
    }
  }
  const jokers = hand.filter((c) => c.suit === "J");
  if (jokers.length === 4) candidates.push(jokers);
  const ranks = [...groups.keys()].filter((r) => r <= 14);
  for (const tripleRank of ranks)
    for (const pairRank of ranks) {
      if (tripleRank === pairRank) continue;
      const a = (groups.get(tripleRank) || [])
          .filter((c) => !wild.includes(c))
          .slice(0, 3),
        b = (groups.get(pairRank) || [])
          .filter((c) => !wild.includes(c))
          .slice(0, 2),
        need = 5 - a.length - b.length;
      if (a.length && b.length && need >= 0 && need <= wild.length)
        candidates.push([...a, ...b, ...wild.slice(0, need)]);
    }
  const windows = [
    [14, 2, 3, 4, 5],
    ...[3, 4, 5, 6, 7, 8, 9, 10].map((start) =>
      [0, 1, 2, 3, 4].map((i) => start + i),
    ),
  ];
  for (const window of windows) {
    const missing = window.filter((r) => !groups.get(r)?.length);
    if (missing.length <= wild.length) {
      const natural = window
        .filter((r) => groups.get(r)?.length)
        .map(
          (r) =>
            groups.get(r)!.find((c) => !wild.includes(c)) ?? groups.get(r)![0],
        );
      candidates.push([...natural, ...wild.slice(0, missing.length)]);
    }
    for (const suit of ["S", "H", "C", "D"] as const) {
      const suited = window
        .map((r) => hand.find((c) => c.rank === r && c.suit === suit))
        .filter(Boolean) as Card[];
      const need = 5 - suited.length;
      if (need <= wild.length)
        candidates.push([
          ...suited,
          ...wild.filter((c) => !suited.includes(c)).slice(0, need),
        ]);
    }
  }
  for (let start = 2; start <= 13; start++) {
    const pair = [start, start + 1, start + 2].flatMap((r) =>
      (groups.get(r) || []).slice(0, 2),
    );
    if (pair.length + wild.length >= 6)
      candidates.push([
        ...pair,
        ...wild.filter((c) => !pair.includes(c)).slice(0, 6 - pair.length),
      ]);
    const plate = [start, start + 1].flatMap((r) =>
      (groups.get(r) || []).slice(0, 3),
    );
    if (plate.length + wild.length >= 6)
      candidates.push([
        ...plate,
        ...wild.filter((c) => !plate.includes(c)).slice(0, 6 - plate.length),
      ]);
  }
  const seen = new Set<string>();
  return candidates
    .filter((cs) => {
      const ids = cs.map((c) => c.id).sort(),
        key = ids.join("|");
      if (seen.has(key) || new Set(ids).size !== ids.length) return false;
      seen.add(key);
      const combo = parseCombo(cs, o.level);
      return !!combo && beats(combo, o.lastPlay?.combo ?? null);
    })
    .map((cs) => cs.map((c) => c.id));
}

export function chooseAiMove(o: Observation): string[] | null {
  const moves = legalMoves(o);
  if (!moves.length) return null;
  const partner = ((o.seat + 2) % 4) as Seat,
    persona = agentPersona(o.seat);
  if (o.lastPlay?.seat === partner && o.counts[partner] <= persona.yieldAt)
    return null;
  const facts = (move: string[]) => {
    const combo = parseCombo(
      move.map((id) => o.hand.find((c) => c.id === id)!),
      o.level,
    )!;
    return {
      combo,
      bomb: ["bomb", "straightFlush", "jokerBomb"].includes(combo.kind) ? 1 : 0,
    };
  };
  return moves.sort((a, b) => {
    const A = facts(a),
      B = facts(b);
    if (persona.id === "control") {
      const opponentThreat = o.counts.some(
        (count, seat) => seat % 2 !== o.seat % 2 && count <= 2,
      );
      return (
        A.bomb - B.bomb ||
        (opponentThreat
          ? B.combo.mainRank - A.combo.mainRank
          : Math.abs(a.length - 2) - Math.abs(b.length - 2)) ||
        A.combo.mainRank - B.combo.mainRank ||
        b.length - a.length
      );
    }
    if (persona.id === "tempo")
      return (
        A.bomb - B.bomb ||
        b.length - a.length ||
        A.combo.mainRank - B.combo.mainRank
      );
    return (
      A.bomb - B.bomb ||
      A.combo.mainRank - B.combo.mainRank ||
      b.length - a.length
    );
  })[0];
}

export function explainAgentMove(
  o: Observation,
  move: string[] | null,
  personaVerified = true,
) {
  const persona = agentPersona(o.seat),
    name =
      o.seat === 1
        ? "王总"
        : o.seat === 2
          ? "小顾"
          : o.seat === 3
            ? "林姐"
            : "你",
    moves = legalMoves(o);
  if (!move) {
    const partner = ((o.seat + 2) % 4) as Seat;
    if (!moves.length) return `${name}没有同型更大的合法牌，选择过牌。`;
    if (!personaVerified)
      return `${name} · LLM Agent（${persona.label}）选择合法过牌；本地规则已校验。`;
    if (o.lastPlay?.seat === partner && o.counts[partner] <= persona.yieldAt)
      return `${name}采用“${persona.label}”：搭档只剩 ${o.counts[partner]} 张、接近出完，因此让出牌权。`;
    return `${name}采用“${persona.label}”：保留当前牌力，选择过牌。`;
  }
  const combo = parseCombo(
    move.map((id) => o.hand.find((card) => card.id === id)!),
    o.level,
  );
  if (!personaVerified)
    return `${name} · LLM Agent（${persona.label}）选择合法出 ${move.length} 张牌；本地规则已校验。`;
  if (combo && ["bomb", "straightFlush", "jokerBomb"].includes(combo.kind))
    return `${name}采用“${persona.label}”：此时用炸弹争夺牌权。`;
  if (persona.id === "control")
    return `${name}采用“稳健控场”：用受控牌力维持牌权压力。`;
  if (persona.id === "tempo")
    return `${name}采用“效率突围”：这一手打出 ${move.length} 张牌。`;
  if (persona.id === "partnerFirst")
    return `${name}采用“搭档优先”：以较低成本行动并观察搭档。`;
  return `${name}采用“训练建议”：优先使用刚好够大的合法牌。`;
}

export async function safeAgentMove(
  policy: AgentPolicy,
  o: Observation,
  timeoutMs = 1500,
): Promise<string[] | null> {
  return (await safeAgentDecision(policy, o, timeoutMs)).move;
}

export async function safeAgentDecision(
  policy: AgentPolicy,
  o: Observation,
  timeoutMs = 1500,
): Promise<{ move: string[] | null; source: "llm" | "fallback" }> {
  const legal = legalMoves(o),
    fallback = chooseAiMove(o);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const move = await Promise.race([
      policy.choose(o, legal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("agent timeout")), timeoutMs);
      }),
    ]);
    if (move === null)
      return o.lastPlay
        ? { move: null, source: "llm" }
        : { move: fallback, source: "fallback" };
    const key = [...move].sort().join("|");
    return legal.some((m) => [...m].sort().join("|") === key)
      ? { move, source: "llm" }
      : { move: fallback, source: "fallback" };
  } catch {
    return { move: fallback, source: "fallback" };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const localTrainingAgent: AgentPolicy = {
  name: "搭档协作 Agent v1",
  choose: async (o) => chooseAiMove(o),
};

export const compatibleRemoteAgent: AgentPolicy = {
  name: "OpenAI 兼容 Agent",
  choose: async (observation, moves) => {
    const response = await fetch("/api/agent", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ observation, legalMoves: moves }),
    });
    if (!response.ok) throw new Error("remote agent unavailable");
    const data = (await response.json()) as { move?: string[] | null };
    if (
      !Object.hasOwn(data, "move") ||
      (data.move !== null && !Array.isArray(data.move))
    )
      throw new Error("invalid remote agent response");
    return data.move;
  },
};
