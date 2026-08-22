# Architecture

## Current training mode

The browser owns a deterministic `GameState`; `lib/game` validates every action and emits an event log. AI agents receive only their own hand, public card counts and public events through `observe()`. This is appropriate for offline training, but browser devtools can still inspect the full state and seed.

## Trust boundary

- ElevenLabs and compatible-model secrets remain in server environment variables.
- The browser calls same-origin API routes and never receives provider credentials.
- Model output is untrusted. It must match one of the legal moves computed by the rules core; otherwise the deterministic fallback is used.
- A provider base URL is administrator configuration, not a player preference. Public HTTPS is required by default to reduce SSRF and accidental key exfiltration.

## Self-host target

The self-hosted edition will use one Node process and SQLite under `/data` for the first durable release. SQLite is a single-instance choice, not a horizontal-scaling claim. Repositories will expose guest profiles, matches, append-only match events, analyses and quotas. WAL, foreign keys, busy timeout, migrations and backups are release gates.

## Online target

Online rooms must be server-authoritative. The server generates the deal, stores the full state, executes `legalPlay`, and returns a seat projection containing only the player's hand plus public information. Each action carries `matchId`, `actionId` and `expectedVersion`; accepted actions append an event and increment the version transactionally.

Cloudflare deployments can implement rooms with Durable Objects and D1. Single-node Docker deployments can use WebSocket plus SQLite. Both adapters share the rules core, DTOs and conformance tests.
