# GuanDan Lab

> Learn fast. Play with grace.

[简体中文](./README.md)

[![CI](https://github.com/Mereithhh/guandan-lab/actions/workflows/ci.yml/badge.svg)](https://github.com/Mereithhh/guandan-lab/actions/workflows/ci.yml)
[![Latest release](https://img.shields.io/github/v/release/Mereithhh/guandan-lab?include_prereleases)](https://github.com/Mereithhh/guandan-lab/releases)
[![License](https://img.shields.io/github/license/Mereithhh/guandan-lab)](./LICENSE)
[![Try the public demo](https://img.shields.io/badge/demo-play_now-57e3bd)](https://guandan-bootcamp.miromind-0889.chatgpt.site)

[▶ Try the demo](https://guandan-bootcamp.miromind-0889.chatgpt.site) · [☆ Star the repo](https://github.com/Mereithhh/guandan-lab) · [◇ Join the discussion](https://github.com/Mereithhh/guandan-lab/discussions/35) · [⌘ Run locally](#quick-start)

[Public demo](https://guandan-bootcamp.miromind-0889.chatgpt.site) · [Launch discussion](https://github.com/Mereithhh/guandan-lab/discussions/35) · [Production checklist](https://github.com/Mereithhh/guandan-lab/issues/34) · [Deployment](./docs/DEPLOYMENT_EN.md) · [Roadmap](./ROADMAP.md) · [Architecture](./docs/ARCHITECTURE.md) · [Contributing](./CONTRIBUTING.md)

GuanDan Lab is an open-source, beginner-first coach for Guan Dan, a Chinese four-player partnership card game played with two decks. It combines a deterministic rules engine, fair-play AI partners, a nominal 15-minute crash-course format, card-counting drills, optional voice coaching and evidence-based match replays.

The default story puts you at a table with the fictional “Chen”, but this is not a deliberate-losing simulator. The coach rewards legal play, pace, partnership awareness and respectful table behaviour. It never rewards collusion, hidden-card signals or throwing a game.

![Real GuanDan Lab walkthrough: training paths, course, memory drill and AI table](./public/walkthrough.gif)

[Deterministic core + 32 conformance checks](./tests/unit/conformance.test.ts) · [Fair-AI visibility boundary](./docs/ARCHITECTURE.md) · 178 unit/contract tests · [beta.15 paid-provider security review](./docs/SECURITY_REVIEW_BETA15.md)

## Why this project exists

Most rules articles explain what a hand is, but not what a nervous first-time player should do next. Most game clients let you play, but do not explain why a move is legal, what public information you should remember or how your choices affected your partner.

GuanDan Lab turns those gaps into one verifiable training loop:

1. Learn the core hand types and turn rules.
2. Pass a 14-decision mastery check instead of skipping ahead by guessing.
3. Optionally solve five 5–7 card endgames with immediate rules and table-manner feedback.
4. Practise a complete 108-card deal with three AI players.
5. Slow down AI turns, inspect recent play history and group same-rank cards.
6. Train visible-card subtraction and a 3×3 position-memory grid.
7. Replay the match event by event and receive separate card-skill and social-skill feedback.

## What works today

- A deterministic, zero-I/O rules core for two uniquely tracked 54-card decks.
- Competition-profile hand parsing, comparison, turn flow, partnership finish order, level advancement, tribute and return.
- 32 competition-rule conformance checks: 30 table-driven fixtures, one response-right scenario and one provenance check.
- Three testably distinct local AI players—Chen controls, Gu supports the partner, and Lin sheds efficiently—using only seat-visible information and validated legal action IDs.
- An optional OpenAI-compatible server-side Agent for moves and post-match public-event coaching; every returned move is validated locally before play.
- Optional ElevenLabs Chinese coaching with captions and automatic device-speech fallback.
- Chinese and English onboarding, mastery course and rulebook with a persisted keyboard-accessible language switch.
- Five deterministic mini endgames whose candidate actions are checked by the production rules engine, with no opponent hands exposed.
- Same-rank hand stacks, adjustable AI pacing, expandable live play history and one-click legal hints.
- Installable Web App metadata, search discovery files, truthful structured data and a system share action without tracking parameters.
- Event-based card-counting, a nine-grid memory drill and complete local match replays.
- Guest-first use with no registration. When localStorage is retained, the browser saves training locally; self-hosted SQLite uses revision checks and local-delta replay to merge course, endgame, bounded memory, preference and replay progress across devices without letting a stale device relock earned lessons or replace a full server history. Google OAuth claiming and four-player server-authoritative matchmaking remain optional.
- Docker deployment with a named SQLite volume and capability smoke tests in CI.

The hosted demo currently runs the local rules Agent and device voice. Paid AI, ElevenLabs, Google OAuth, SQLite cloud saves and online matchmaking are opt-in self-hosted capabilities; the UI reports the active mode instead of pretending they are enabled.

## Quick start

Requires Node.js 22.13 or newer:

```bash
git clone https://github.com/Mereithhh/guandan-lab.git
cd guandan-lab
cp .env.example .env.local
npm ci
npm run dev
```

Open `http://localhost:3000`. No provider key is required for the complete local training path.

Docker:

```bash
cp .env.example .env.local
# Set a random SESSION_SECRET of at least 24 characters in .env.local.
docker compose up --build
```

The default database lives at `/data/guandan.sqlite` in a named Docker volume and stores signed sessions, bounded training profiles, matches, event evidence and analyses. If `SESSION_SECRET` is missing, the application fails closed to browser-local saves instead of issuing forgeable production sessions.

Before a public Docker deployment, run `docker compose run --rm --no-deps web node scripts/doctor.mjs --lang=en`; local Node development may use `npm run doctor -- --lang=en`. It checks sessions, SQLite, HTTPS, OAuth, matching, compatible models, ElevenLabs and the support link without printing any secret; production blockers return a non-zero exit code.

See [the deployment guide](./docs/DEPLOYMENT_EN.md) for TLS, reverse proxy, backup, upgrade and DNS instructions.

## Optional AI and voice providers

All secrets stay server-side. Never expose them with a `NEXT_PUBLIC_*` prefix.

```dotenv
AI_BASE_URL=https://your-provider.example/v1
AI_API_KEY=replace-me
AI_MODEL=your-model
PAID_PROVIDERS_ENABLED=1
PAID_PROVIDER_USER_DAILY_UNITS=250
PAID_PROVIDER_GLOBAL_DAILY_UNITS=5000

ELEVENLABS_API_KEY=replace-me
ELEVENLABS_VOICE_ID=replace-me
ELEVENLABS_MODEL_ID=eleven_multilingual_v2
```

The compatible Agent endpoint fixes the request path to `/chat/completions`, rejects unsafe private base URLs by default, limits input and output sizes, enforces timeouts and returns only locally validated moves. The ElevenLabs route rejects redirects, validates the audio response, limits its size and returns an explicit browser-speech fallback on failure.

Enabling paid providers also requires `SESSION_SECRET`, `DATABASE_PATH`, and explicit positive per-user and deployment-wide daily budgets; otherwise calls fail closed. SQLite atomically charges relative cost units per UTC day (defaults: Agent 1, review 2, ElevenLabs 1 per 100 characters). These units are not currency or token counts, so set conservative limits from your provider pricing.

AI and voice have separate failure circuits, one half-open probe, and an in-process concurrency cap. Identical ElevenLabs requests use an authenticated hashed cache and single-flight fetch. Daily budgets persist for the single-node deployment, while circuits and concurrency counters are per Node process. Keep reverse-proxy connection limits and provider-side hard budgets and alerts for public traffic.

Post-match model review receives only public play events, finish order and non-hidden deterministic local metrics—never any player's unplayed hand. The model may select only from controlled style and advice codes, which local code maps to reviewed copy; local code also remains authoritative for card-skill score, social score and evidence metrics. Timeout, throttling, free text or malformed output is disclosed in the result dialog and falls back to local evidence.

`GET /api/session` reports the effective Agent and voice modes without returning a model name, base URL or secret.

## Verification

```bash
npm run typecheck
npm run lint
npm test
npm run test:coverage
npm run build
npm run test:e2e
docker compose config --quiet
```

The repository gate covers TypeScript, ESLint, unit and contract tests, coverage thresholds, production builds, desktop/mobile browser flows, Docker builds and a real Compose capability smoke test. Rule changes should include the smallest disputed hand, the rule profile and a regression test; see [rule sources](./RULES_SOURCES.md).

## Architecture

`lib/game` is the deterministic rules core and performs no network or database I/O. Browser and server flows share the same validation logic. The optional online table is server-authoritative: it generates the deal on the server, projects only the current player's hand, uses versioned idempotent actions and supports refresh recovery.

The current self-hosted target is a single Node process with SQLite. The hosted Sites target is designed around D1 and Durable Objects. These deployments share the rules core and network protocol, not a storage implementation. Read [the architecture guide](./docs/ARCHITECTURE.md) before changing trust boundaries.

## Contributing

Useful contributions include:

- minimal rule-dispute fixtures with a source;
- regional rule profiles that do not weaken the default competition profile;
- beginner lesson and accessibility improvements;
- Agent strategies that preserve hidden-information boundaries;
- mobile interaction and memory-training research;
- translations that reuse the typed locale layer instead of duplicating game logic.

Start with [CONTRIBUTING.md](./CONTRIBUTING.md), follow the [Code of Conduct](./CODE_OF_CONDUCT.md), and report vulnerabilities through [SECURITY.md](./SECURITY.md), not a public issue.

Looking for a bounded first contribution? Pick an open [`good first issue`](https://github.com/Mereithhh/guandan-lab/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22).

## Roadmap and scope

- `0.4`: mid-deal feedback and AI takeover after disconnects.
- `0.5`: reporting, spectators, a stable room protocol and multi-instance coordination.
- `1.0`: rule-variant plugins, Agent tournaments, a stable protocol and a reusable rules SDK.

Roadmap items are not shipped features. The authoritative status and acceptance criteria live in [ROADMAP.md](./ROADMAP.md).

## Ethics and licence

“Networking through Guan Dan” is a product story, not a promise about investors or career outcomes. “Chen” is fictional and does not represent a real executive or public figure. The project does not reward deliberate losing, peeking, signalling or collusion.

Code is licensed under [Apache License 2.0](./LICENSE). Original AI-generated campaign artwork is documented in [the asset register](./docs/ASSETS.md).
