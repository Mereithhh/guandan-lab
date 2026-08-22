# Architecture

## Current training mode

The browser owns a deterministic `GameState`; `lib/game` validates every action and emits an event log. AI agents receive only their own hand, public card counts, public events and a fixed non-secret persona ID through `observe()`. Wang's control style, Gu's partner-first style and Lin's tempo style use distinct deterministic move ordering; compatible providers receive the same bounded persona ID, and every chosen card set still passes the shared legal-move boundary. This is appropriate for offline training, but browser devtools can still inspect the full state and seed.

## Trust boundary

- ElevenLabs and compatible-model secrets remain in server environment variables.
- The browser calls same-origin API routes and never receives provider credentials.
- Model output is untrusted. It must match one of the legal moves computed by the rules core; otherwise the deterministic fallback is used.
- A provider base URL is administrator configuration, not a player preference. Public HTTPS is required by default to reduce SSRF and accidental key exfiltration.
- Paid routes run in the Node runtime and require a valid signed session that is still active in SQLite. The same transaction revalidates that session and atomically reserves both the user's and deployment's UTC-day budget before any provider request.
- AI and voice use separate in-process circuits, a single half-open recovery probe and a shared concurrency ceiling. Stale successes cannot close a newer open circuit. ElevenLabs cache keys are SHA-256 hashes, and authentication happens before cache lookup.

## Self-host persistence

The self-hosted edition uses one Node process and SQLite under `/data`. A signed, HttpOnly guest cookie is created without blocking play; completed training games are written transactionally to `matches`, `match_events` and `analyses`. A bounded `training_profiles` snapshot also contains the mastery course, mini-endgame state, two memory histories, locale and AI pace. Earned progress merges monotonically; snapshot writes use compare-and-swap revisions, and clients rebase only attempts added since their last acknowledged snapshot. A full disjoint history cannot evict the server's bounded 50-item history, while explicit endgame resets use a monotonic epoch. The SQLite write transaction revalidates the live session so an in-flight request cannot recreate a deleted or claimed guest. These personal-learning scores are not competitive or leaderboard claims. SQLite runs with WAL, foreign keys and a busy timeout. This is a single-instance choice, not a horizontal-scaling claim; operators must back up the mounted volume.

Paid-provider usage uses a per-user ledger plus an independent deployment ledger. User deletion cascades personal rows but intentionally cannot lower deployment usage; guest-to-Google claims merge personal usage without charging the deployment twice. Budget persistence is deployment-wide only for processes sharing the same SQLite file. Circuit and concurrency state is per process, so horizontal deployment needs an external coordinator before it can make the same guarantees.

Optional Google login uses Authorization Code + PKCE, a short-lived signed state cookie and fixed Google token/userinfo endpoints. A successful callback merges both guest matches and the training profile into the existing Google profile transactionally and never persists the provider access token. OAuth is offered only when SQLite, the public site URL and both Google credentials are configured.

When `SESSION_SECRET` or `DATABASE_PATH` is absent—or when the runtime has no persistent filesystem—the browser keeps the local replay store and the API reports `persistent: false`. This is the expected Cloudflare Sites fallback until a D1 adapter is configured.

## Online self-host preview

Online rooms are server-authoritative. The SQLite adapter groups four signed users, generates and stores the deal, executes the shared rule engine, and returns a seat projection containing only the caller's hand plus public information. Deal seeds and opponents' hands are removed. Each action carries a unique `actionId` and `expectedVersion`; accepted actions are deduplicated, appended to `online_actions` and increment the room version transactionally.

The first self-host release uses one-second HTTP polling. A refreshed browser discovers its active room through the signed session, which provides simple reconnect behavior without claiming WebSocket scale. Matchmaking entries expire after five minutes; a player can explicitly cancel the current room, and a room safely cancels after two minutes without an action so an abandoned seat cannot stall forever. Mutation routes have application rate limits. Public chat is intentionally absent. AI takeover, moderation reports and multi-instance coordination remain release gates.

When TLS terminates at a reverse proxy, configure an HTTPS `SITE_URL`; alternatively set `TRUST_PROXY=1` only behind a proxy that overwrites forwarded headers. Origin checks and Secure cookies use that canonical public origin rather than the internal HTTP hop.

Cloudflare deployments can later implement rooms with Durable Objects and D1. Multi-instance Docker deployments will need a coordinator or external database. Both future adapters must preserve the same rules core, privacy projection, action idempotency and conformance tests.
