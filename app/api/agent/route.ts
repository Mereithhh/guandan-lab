import {
  parseAgentDecision,
  providerChatCompletionsUrl,
  type CompatibleAgentRequest,
} from "@/lib/services/compatible-agent";
import {
  legalMoves as enumerateLegalMoves,
  remotePersonaInstruction,
} from "@/lib/game/ai";
import {
  BodyTooLargeError,
  consumeRateLimit,
  isSameOrigin,
  readJsonBody,
  readResponseText,
  requestClientKey,
} from "@/lib/services/http-guard";
import {
  acquireProviderLease,
  authorizePaidProvider,
  cancelProviderLease,
  chargePaidProvider,
  recordProviderResult,
} from "@/lib/services/provider-guard";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (process.env.PAID_PROVIDERS_ENABLED !== "1")
    return Response.json({ error: "远程 AI 服务未启用" }, { status: 503 });
  if (!isSameOrigin(request))
    return Response.json({ error: "跨站请求被拒绝" }, { status: 403 });
  const baseUrl = process.env.AI_BASE_URL,
    apiKey = process.env.AI_API_KEY,
    model = process.env.AI_MODEL;
  if (!baseUrl || !apiKey || !model)
    return Response.json({ error: "远程 AI 尚未配置" }, { status: 503 });
  const endpoint = providerChatCompletionsUrl(
    baseUrl,
    process.env.AI_ALLOW_PRIVATE_BASE_URL === "1",
  );
  if (!endpoint)
    return Response.json(
      { error: "AI Base URL 不符合安全策略" },
      { status: 500 },
    );
  let input: CompatibleAgentRequest;
  try {
    input = await readJsonBody<CompatibleAgentRequest>(request, 200_000);
  } catch (error) {
    return Response.json(
      {
        error: error instanceof BodyTooLargeError ? "请求过大" : "请求格式无效",
      },
      { status: error instanceof BodyTooLargeError ? 413 : 400 },
    );
  }
  if (
    !input?.observation ||
    !["learner", "control", "partnerFirst", "tempo"].includes(
      input.observation.persona,
    ) ||
    !Array.isArray(input.legalMoves) ||
    input.legalMoves.length > 500 ||
    input.legalMoves.some(
      (move) =>
        !Array.isArray(move) ||
        move.length > 12 ||
        move.some((id) => typeof id !== "string" || id.length > 40),
    ) ||
    input.observation.events?.length > 300
  )
    return Response.json({ error: "牌局数据无效" }, { status: 400 });
  let providerInput: unknown,
    serverLegalMoves: string[][] = [];
  try {
    const o = input.observation,
      card = (value: unknown) => {
        const c = value as (typeof o.hand)[number];
        if (
          !c ||
          typeof c.id !== "string" ||
          c.id.length > 40 ||
          !["S", "H", "C", "D", "J"].includes(c.suit) ||
          !Number.isInteger(c.rank) ||
          c.rank < 2 ||
          c.rank > 16 ||
          ![0, 1].includes(c.deck)
        )
          throw new Error("invalid card");
        return { id: c.id, suit: c.suit, rank: c.rank, deck: c.deck };
      };
    if (
      !Array.isArray(o.hand) ||
      o.hand.length > 27 ||
      ![0, 1, 2, 3].includes(o.seat) ||
      ![0, 1, 2, 3].includes(o.turn) ||
      !["you", "boss", "partner", "opponent"].includes(o.role) ||
      !Number.isInteger(o.level) ||
      o.level < 2 ||
      o.level > 14 ||
      !Array.isArray(o.counts) ||
      o.counts.length !== 4 ||
      o.counts.some(
        (count) => !Number.isInteger(count) || count < 0 || count > 27,
      ) ||
      !Array.isArray(o.events)
    )
      throw new Error("invalid observation");
    const personaBySeat = [
      "learner",
      "control",
      "partnerFirst",
      "tempo",
    ] as const;
    const roleBySeat = ["you", "boss", "partner", "opponent"] as const;
    if (o.persona !== personaBySeat[o.seat] || o.role !== roleBySeat[o.seat])
      throw new Error("invalid seat identity");
    const cleanCards = o.hand.map(card),
      events = o.events.map((event) => {
        if (
          !event ||
          typeof event.id !== "string" ||
          event.id.length > 80 ||
          !["deal", "play", "pass", "trick", "finish", "round"].includes(
            event.type,
          ) ||
          !Number.isFinite(event.at) ||
          (event.seat !== undefined && ![0, 1, 2, 3].includes(event.seat)) ||
          (event.cardIds !== undefined &&
            (!Array.isArray(event.cardIds) ||
              event.cardIds.length > 12 ||
              event.cardIds.some(
                (id) => typeof id !== "string" || id.length > 40,
              ))) ||
          (event.note !== undefined &&
            (typeof event.note !== "string" || event.note.length > 240))
        )
          throw new Error("invalid event");
        return {
          id: event.id,
          type: event.type,
          seat: event.seat,
          cardIds: event.cardIds,
          at: event.at,
        };
      });
    let lastPlay = null;
    if (o.lastPlay) {
      const play = o.lastPlay,
        combo = play.combo;
      if (
        ![0, 1, 2, 3].includes(play.seat) ||
        !Array.isArray(play.cardIds) ||
        play.cardIds.length > 12 ||
        play.cardIds.some((id) => typeof id !== "string" || id.length > 40) ||
        !combo ||
        ![
          "single",
          "pair",
          "triple",
          "triplePair",
          "straight",
          "tube",
          "plate",
          "bomb",
          "straightFlush",
          "jokerBomb",
        ].includes(combo.kind) ||
        !Number.isInteger(combo.size) ||
        combo.size < 1 ||
        combo.size > 12 ||
        !Number.isInteger(combo.mainRank) ||
        !Array.isArray(combo.cards) ||
        combo.cards.length > 12 ||
        !Array.isArray(combo.wildIds) ||
        combo.wildIds.length > 12 ||
        combo.wildIds.some((id) => typeof id !== "string" || id.length > 40)
      )
        throw new Error("invalid play");
      lastPlay = {
        seat: play.seat,
        cardIds: play.cardIds,
        combo: {
          kind: combo.kind,
          size: combo.size,
          mainRank: combo.mainRank,
          cards: combo.cards.map(card),
          wildIds: combo.wildIds,
        },
      };
    }
    const cleanObservation = {
      seat: o.seat,
      role: o.role,
      persona: o.persona,
      hand: cleanCards,
      level: o.level,
      turn: o.turn,
      lastPlay,
      counts: o.counts.slice(0, 4),
      events,
    } as typeof o;
    serverLegalMoves = enumerateLegalMoves(cleanObservation);
    if (!o.lastPlay && serverLegalMoves.length === 0)
      throw new Error("invalid lead state");
    providerInput = {
      observation: cleanObservation,
      legalMoves: serverLegalMoves,
    };
  } catch {
    return Response.json({ error: "牌局数据无效" }, { status: 400 });
  }
  const authorization = await authorizePaidProvider(request, "ai");
  if (authorization.response) return authorization.response;
  if (
    !consumeRateLimit(
      requestClientKey(
        request,
        `agent:${authorization.context!.claims.userId}`,
        process.env.TRUST_PROXY === "1",
      ),
      40,
      60_000,
    )
  )
    return Response.json({ error: "AI 请求过于频繁" }, { status: 429 });
  const capacity = acquireProviderLease("ai");
  if (capacity.response) return capacity.response;
  const lease = capacity.lease!;
  const quotaResponse = chargePaidProvider(authorization.context!, "agent");
  if (quotaResponse) {
    cancelProviderLease(lease);
    return quotaResponse;
  }

  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 4500);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      redirect: "error",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.25,
        max_tokens: 120,
        messages: [
          {
            role: "system",
            content: `你是遵守竞技掼蛋规则的独立牌局 Agent。只能从 legalMoves 原样选择一项；仅当桌面已有上一手时才可返回 null。只输出 JSON：{"move":["card-id"]} 或 {"move":null}。${remotePersonaInstruction(input.observation.persona)}`,
          },
          { role: "user", content: JSON.stringify(providerInput) },
        ],
      }),
    });
    if (!response.ok) {
      recordProviderResult(lease, false);
      return Response.json({ error: "远程 AI 暂时不可用" }, { status: 502 });
    }
    const raw = await readResponseText(response, 100_000);
    const data = JSON.parse(raw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (typeof content !== "string" || !content.trim()) {
      recordProviderResult(lease, false);
      return Response.json({ error: "远程 AI 返回为空" }, { status: 502 });
    }
    const decision = parseAgentDecision(content, serverLegalMoves);
    if (
      !decision.valid ||
      (decision.move === null && !input.observation.lastPlay)
    ) {
      recordProviderResult(lease, false);
      return Response.json(
        { error: "远程 AI 返回了非法动作" },
        { status: 502 },
      );
    }
    recordProviderResult(lease, true);
    return Response.json({ move: decision.move });
  } catch {
    const timedOut = controller.signal.aborted;
    recordProviderResult(lease, false);
    return Response.json(
      { error: timedOut ? "远程 AI 请求超时" : "远程 AI 响应无效" },
      { status: timedOut ? 504 : 502 },
    );
  } finally {
    clearTimeout(timer);
  }
}
