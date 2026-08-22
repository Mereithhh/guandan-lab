# Changelog

All notable changes will be documented here.

## Unreleased

## 0.3.0-beta.10 — 2026-08-22

- Added three distinct, deterministic AI character styles: Chen controls with structure, Gu yields earlier to a nearly-out partner, and Lin prioritizes efficient multi-card shedding.
- Passed the same bounded persona IDs to compatible model Agents while retaining exact local legal-move validation and deterministic fallback.
- Exposed each character's style at the table, in live history and in replay context, with accessible descriptions and turn-by-turn coach explanations.
- Made character descriptions tappable, clarified public-card history ordering and hand types, and kept compatible-model explanations neutral unless the local policy can prove the stated reason.
- Rebuilt compatible-provider observations from a strict allowlist and distinguished explicit passes from invalid output or timeouts so failures use the deterministic local fallback.

## 0.3.0-beta.9 — 2026-08-22

- Added optional compatible-model post-match coaching from public play events, with an explicit local-evidence fallback in the result dialog.
- Kept deterministic card-skill scores, social scores, metrics and displayed coaching copy authoritative; the model can select only controlled style/advice codes.
- Added a strict known-field privacy boundary that excludes all unplayed hands and hidden-derived metrics, plus route contracts for hidden-field injection, origin, URL, size, timeout and secret-redaction failures.
- Added browser-side timeout fallback, executable anti-collusion coaching filters, a fixed ethics reminder, and cloud-save contract regression coverage.
- Made long result coaching scrollable on small/landscape screens and surfaced save status, privacy scope and retry inside the result dialog.
- Made browser-local save status depend on the actual storage write, with an explicit failure state and retry instead of optimistic success copy.

## 0.3.0-beta.8 — 2026-08-22

- Added five optional deterministic 5–7 card “Chen table” endgames as a bridge from course mastery to the full 108-card deal, with immediate rules and table-manner feedback.
- Validated every puzzle choice through the production rules engine and kept all opponent hands out of learner-facing fixtures and explanations.
- Added versioned on-device puzzle progress, first-choice scoring, retry guidance and a full restart action.

## 0.3.0-beta.7 — 2026-08-22

- Increased the exposed mobile tap step for overlapping same-rank cards to 44px while preserving visual grouping and individual selection.
- Updated GitHub Actions to the latest verified major and ignored incompatible automatic major updates for TypeScript, ESLint and Node types while preserving Dependabot security updates.

## 0.3.0-beta.6 — 2026-08-22

- Slowed the default AI table pace to 2.2 seconds, added a 3.5-second explanation pace, and remembers the player's choice on the device.
- Expanded the in-table history from the latest 12 actions to the complete current deal, with clearer replay guidance.
- Made same-rank hand stacking visibly consistent on desktop and mobile, including per-rank count badges while retaining individual card selection.
- Added a complete English README, evidence-first launch copy and clearer Demo/Star/Run-locally contribution paths.
- Added CodeQL and pull-request dependency review plus a scoped public beta.5 adversarial review record.
- Corrected the 15-minute and localStorage claims so they match the measured product boundary.
- Added an original before/after training social illustration and documented its reusable asset license.
- Opened bounded good-first contribution issues and expanded the contributor code map and test matrix.

## 0.3.0-beta.5 — 2026-08-22

- Added a typed Chinese/English onboarding layer for the home page, mastery course and full rulebook, with a keyboard-accessible persisted language switch.
- Added 32 competition-rule conformance checks (30 table-driven fixtures, one response-right scenario and one provenance check) covering wildcards, sequences, bombs and tribute/return edges.
- Added route-level compatible Agent and ElevenLabs contracts for authentication, timeouts, malformed upstreams, redirect safety, audio validation and secret redaction.
- Hardened Agent card-ID comparison and made TTS download failures fall back safely to browser speech.

## 0.3.0-beta.4 — 2026-08-22

- Replaced misleading duplicate time tracks with distinct course, memory and mastery-gated full-game entrances.
- Fixed Docker Compose environment propagation and added a real Compose capability smoke test.
- Added explicit local/compatible Agent and device/ElevenLabs voice status without exposing configuration secrets.
- Added an original four-panel course illustration plus real homepage, course, memory and AI-table screenshots and a lightweight walkthrough GIF.

## 0.3.0-beta.3 — 2026-08-22

- Added an exposed-card subtraction drill generated from real two-deck card IDs, with remedial category repetition, separate accuracy history and a preserved nine-grid mode.

## 0.3.0-beta.2 — 2026-08-22

- Replaced the skippable crash course with 14 mastery-gated decisions covering card types, legal turns, table etiquette with 陈总 and event-based card counting.
- Added versioned, fail-closed course progress persistence and protected AI/online play from untrained entry paths.
- Improved mobile lesson navigation and safe-area spacing.
- Added route-level ElevenLabs provider tests for opt-in, successful audio and browser fallback behavior.

## 0.3.0-beta.1 — 2026-08-22

- Added signed, HttpOnly guest sessions and optional SQLite cloud progress for single-node self-hosting.
- Added transactional match/event/analysis storage, JSON export and account deletion.
- Added optional Google OAuth with PKCE and transactional guest-progress claiming.
- Added visible local/cloud save status with safe fallback on stateless hosts.
- Added opt-in four-player server-authoritative matchmaking with private seat projections, idempotent versioned actions and polling reconnect.
- Added same-rank card stacks, adjustable AI pacing, live play history and resumable cloud-save feedback.
- Added a two-minute online turn deadline, explicit room cancellation and mobile matchmaking coverage.
- Added a launch kit and a new original pixel-art campaign illustration.

## 0.2.0 — 2026-08-22

- Renamed the open-source project to GuanDan Lab / 掼蛋实验室.
- Added optional ElevenLabs speech with device-voice fallback.
- Added an OpenAI-compatible agent adapter with deterministic move validation.
- Made the training boss the fictional “陈总”.
- Added dynamic turn coaching and one-click legal hints.
- Added Docker and open-source community foundations.
