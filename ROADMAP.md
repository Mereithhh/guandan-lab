# Roadmap

Roadmap items are proposals until their acceptance checks pass. We do not advertise them as shipped features.

## 0.3 — Finish the 15-minute learning loop

- Add three interactive micro-lessons: legal follow, pass, and lead.
- Add 5–7 card mini endgames so the first complete feedback loop is under five minutes.
- Make every coach recommendation derive from a legal move and explain one reason.
- Train memory from the previous real trick instead of revealing fixed vocabulary tiles.
- [x] Give the three agents distinguishable, testable styles: Chen controls, Gu supports the partner, and Lin sheds efficiently.

## 0.4 — Accounts and durable progress

- [x] Issue an HttpOnly signed guest session without blocking the first game.
- [x] Store profiles, sessions, match summaries, events, analyses and usage quotas in SQLite for single-node self-hosting.
- [x] Merge course, endgame, memory and preference progress across signed devices without stale-device rollback.
- [x] Let Google OAuth users claim guest progress transactionally with Authorization Code + PKCE.
- [x] Support JSON export and deletion for self-hosted guest data.
- [x] Document retention defaults, backups and the Google account privacy flow.
- [x] Fail closed around paid providers with signed-session revalidation, persistent per-user/global daily budgets, bounded concurrency and recovery circuits.

## 0.5 — Online rooms

- [x] Move deal generation and rule validation to a server-authoritative SQLite room state machine.
- [x] Return only seat projections; never send the seed or opponents' hands.
- [x] Add action IDs, optimistic versions and polling-based reconnect.
- Add AI seat takeover after a player timeout (the current Beta safely cancels the room).
- Add abuse reporting before public matchmaking; chat remains intentionally absent.

## 1.0 — Ecosystem

- Versioned regional-rule plugins and conformance fixtures.
- Reusable game-core package and documented network protocol.
- Agent tournaments with identical observations and reproducible seeds.
- Anonymous, privacy-reviewed replay sharing.
