# Contributing

Thanks for helping make GuanDan Lab more correct, welcoming and useful to beginners.

[Open good-first issues](https://github.com/Mereithhh/guandan-lab/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22) · [Help wanted](https://github.com/Mereithhh/guandan-lab/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)

## Ten-minute setup

```bash
git clone https://github.com/Mereithhh/guandan-lab.git
cd guandan-lab
cp .env.example .env.local
npm ci
npm run dev
```

No provider key or database is required for local rules, lessons, AI practice, memory drills or replays.

## Code map

| Area | Owner boundary |
| --- | --- |
| `lib/game` | Deterministic rules, cards, engine, fair-AI observation and analysis; no network or database I/O |
| `lib/services` | Provider guards, sessions, SQLite persistence, OAuth and online-room storage |
| `lib/i18n` | Typed user-facing onboarding copy; translations must reuse game logic |
| `app/api` | Same-origin, rate-limited server routes and provider adapters |
| `app/components` | Learning, game, memory, replay and online UI |
| `tests/fixtures` | Sourced competition or explicitly named regional profiles |
| `tests/unit` / `tests/e2e` | Deterministic contracts and real desktop/mobile browser flows |

## Change workflow

1. Open or comment on an Issue before a large change.
2. Create a focused branch and keep rules, UI and infrastructure changes separable when possible.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the relevant E2E tests.
4. Fill in the pull request checklist, including rule evidence and privacy impact.

Use the smallest relevant gate while iterating, then run the full gate before requesting review:

| Change | Fast feedback | Required before review |
| --- | --- | --- |
| Rules or engine | `npx vitest run tests/unit/rules.test.ts tests/unit/engine.test.ts tests/unit/conformance.test.ts` | typecheck, lint, coverage, build, E2E |
| Agent or TTS provider | `npx vitest run tests/unit/agent-route.test.ts tests/unit/tts-route.test.ts tests/unit/services.test.ts` | typecheck, lint, coverage, build |
| Onboarding or UI | targeted Playwright `--grep` plus typecheck | lint, build, full desktop/mobile E2E |
| Persistence or matchmaking | persistence/online unit tests | coverage, build, full E2E, Compose smoke when Docker changes |
| Deployment configuration | `npx vitest run tests/unit/doctor.test.ts` | `npm run doctor` with a safe fixture environment, lint and diff check |
| Documentation only | link and claim check | `git diff --check` |

The CI workflow is authoritative and the security workflow runs CodeQL on pushes/PRs plus dependency review on pull requests.

Rule changes require a minimal card example, expected result, rule version or regional variant, and a reliable source. Add a regression test before changing the engine. Never weaken move validation to accommodate an AI response.

Do not commit API keys, OAuth credentials, production data, private replays or generated audio containing personal information. UI changes should support keyboard and touch use, keep captions available, and avoid color-only state.

By contributing, you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md) and license your contribution under Apache-2.0.
