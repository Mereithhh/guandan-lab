# Beta 15 paid-provider security review

Review date: 2026-08-22

Scope: compatible-model Agent and review routes, ElevenLabs TTS, signed-session enforcement, SQLite usage ledgers, circuit breakers, concurrency control, cache behavior, and deployment configuration checks.

## Findings closed before release

- A malformed nested Agent observation could previously throw after acquiring capacity. The route now builds a strictly bounded allowlisted payload before authentication, leasing, or charging; the regression proves malformed requests consume neither budget nor capacity.
- Cancelling a half-open request before contacting the provider could leave the recovery probe occupied. A neutral lease cancellation now clears the matching probe generation.
- Deployment checks did not include the full cost of a maximum-length 260-character TTS request. Runtime status and the doctor now use the same default operation costs and maximum-length multiplier.
- Provider responses were size-checked after buffering. All three paid routes now read bounded streams, cancel both declared and observed oversized bodies, and count the attempt as a provider failure.
- Paid runtime checks now reject obvious placeholder or low-diversity session secrets even when an operator bypasses the deployment doctor.

## Verified properties

- Paid routes run only in the Node runtime and require a live signed session backed by SQLite.
- One `BEGIN IMMEDIATE` transaction revalidates the session and reserves both the per-user and deployment-wide UTC-day budget.
- Deleting a user cannot refund the independent deployment ledger; guest-to-Google claiming merges personal usage without double-counting the deployment.
- AI and TTS have independent circuits. Stale concurrent successes cannot close a newer circuit, and only one half-open probe is admitted.
- TTS authenticates and rate-limits before its SHA-256 cache, single-flights identical misses, and never exposes provider credentials or raw upstream errors.

## Residual deployment constraints

The durable ledger is designed for a single Node deployment sharing one SQLite file. Circuit and concurrency state is per process. Public operators should also enforce reverse-proxy connection limits and provider-side hard budgets. Anonymous guests can rotate cookies, so the deployment-wide budget remains the final cost ceiling.

Validation at review close: 174 unit/contract tests, 34 browser tests passed with 10 device-specific skips, 94.86% line coverage, 84.18% branch coverage, production build passed, and zero audited dependency vulnerabilities.
