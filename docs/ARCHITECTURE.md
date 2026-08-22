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

## Online target

Online rooms must be server-authoritative. The server generates the deal, stores the full state, executes `legalPlay`, and returns a seat projection containing only the player's hand plus public information. Each action carries `matchId`, `actionId` and `expectedVersion`; accepted actions append an event and increment the version transactionally.

Cloudflare deployments can implement rooms with Durable Objects and D1. Single-node Docker deployments can use WebSocket plus SQLite. Both adapters share the rules core, DTOs and conformance tests.
