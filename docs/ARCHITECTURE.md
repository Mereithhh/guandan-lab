# Architecture

## Current training mode

The browser owns a deterministic `GameState`; `lib/game` validates every action and emits an event log. AI agents receive only their own hand, public card counts and public events through `observe()`. This is appropriate for offline training, but browser devtools can still inspect the full state and seed.

## Trust boundary

- ElevenLabs and compatible-model secrets remain in server environment variables.
- The browser calls same-origin API routes and never receives provider credentials.
- Model output is untrusted. It must match one of the legal moves computed by the rules core; otherwise the deterministic fallback is used.
- A provider base URL is administrator configuration, not a player preference. Public HTTPS is required by default to reduce SSRF and accidental key exfiltration.

## Self-host persistence

The self-hosted edition uses one Node process and SQLite under `/data`. A signed, HttpOnly guest cookie is created without blocking play; completed training games are written transactionally to `matches`, `match_events` and `analyses`. The schema also reserves durable session and quota records. SQLite runs with WAL, foreign keys and a busy timeout. This is a single-instance choice, not a horizontal-scaling claim; operators must back up the mounted volume.

Optional Google login uses Authorization Code + PKCE, a short-lived signed state cookie and fixed Google token/userinfo endpoints. A successful callback merges guest matches into the existing Google profile transactionally and never persists the provider access token. OAuth is offered only when SQLite, the public site URL and both Google credentials are configured.

When `SESSION_SECRET` or `DATABASE_PATH` is absent—or when the runtime has no persistent filesystem—the browser keeps the local replay store and the API reports `persistent: false`. This is the expected Cloudflare Sites fallback until a D1 adapter is configured.

## Online self-host preview

Online rooms are server-authoritative. The SQLite adapter groups four signed users, generates and stores the deal, executes the shared rule engine, and returns a seat projection containing only the caller's hand plus public information. Deal seeds and opponents' hands are removed. Each action carries a unique `actionId` and `expectedVersion`; accepted actions are deduplicated, appended to `online_actions` and increment the room version transactionally.

The first self-host release uses one-second HTTP polling. A refreshed browser discovers its active room through the signed session, which provides simple reconnect behavior without claiming WebSocket scale. Matchmaking entries expire after five minutes; a player can explicitly cancel the current room, and a room safely cancels after two minutes without an action so an abandoned seat cannot stall forever. Mutation routes have application rate limits. Public chat is intentionally absent. AI takeover, moderation reports and multi-instance coordination remain release gates.

When TLS terminates at a reverse proxy, configure an HTTPS `SITE_URL`; alternatively set `TRUST_PROXY=1` only behind a proxy that overwrites forwarded headers. Origin checks and Secure cookies use that canonical public origin rather than the internal HTTP hop.

Cloudflare deployments can later implement rooms with Durable Objects and D1. Multi-instance Docker deployments will need a coordinator or external database. Both future adapters must preserve the same rules core, privacy projection, action idempotency and conformance tests.
