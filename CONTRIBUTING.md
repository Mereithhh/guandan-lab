# Contributing

Thanks for helping make GuanDan Lab more correct, welcoming and useful to beginners.

1. Open or comment on an Issue before a large change.
2. Create a focused branch and keep rules, UI and infrastructure changes separable when possible.
3. Run `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` and the relevant E2E tests.
4. Fill in the pull request checklist, including rule evidence and privacy impact.

Rule changes require a minimal card example, expected result, rule version or regional variant, and a reliable source. Add a regression test before changing the engine. Never weaken move validation to accommodate an AI response.

Do not commit API keys, OAuth credentials, production data, private replays or generated audio containing personal information. UI changes should support keyboard and touch use, keep captions available, and avoid color-only state.

By contributing, you agree to the [Code of Conduct](./CODE_OF_CONDUCT.md) and license your contribution under Apache-2.0.
