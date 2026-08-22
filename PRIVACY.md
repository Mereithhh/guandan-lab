# Privacy

GuanDan Lab is designed to work without an account. This document describes the default open-source build; a third-party deployment may publish a different policy.

## Local-only mode

When no persistence service is configured, the browser stores at most 12 recent training games in `localStorage`. The server does not receive those replays. Clearing site data removes them.

## Self-hosted SQLite mode

When `SESSION_SECRET` and `DATABASE_PATH` are configured, the server issues a random, signed HttpOnly guest cookie valid for 30 days. Completed games, event logs and coaching analyses are associated with that random guest ID. Matches are retained until the user deletes them or the operator applies a shorter policy. Expired session rows are removed opportunistically when sessions are used.

`GET /api/progress?export=1` exports the current account. `DELETE /api/progress` removes the profile and cascades to sessions, matches, events, analyses and provider links; it also expires the browser session. Operators are responsible for a documented backup lifecycle because deleted rows may remain in earlier volume snapshots.

## Google login

Google login is optional and disabled unless the operator configures it. The app requests `openid email profile` and stores the provider subject, verified email and display name. It uses Authorization Code + PKCE and does not retain Google access or refresh tokens. Claiming an account moves the current guest history into the Google profile transactionally.

## AI and voice providers

Optional compatible-model requests contain a seat-limited observation and legal move IDs. Optional ElevenLabs requests contain the displayed coach sentence. Provider credentials stay on the server. Operators should review their chosen providers' policies and configure durable quotas before enabling paid services for anonymous public traffic.

## Online rooms

Self-hosted online matching stores room membership, the authoritative full deal and accepted actions. API projections include only the caller's hand, public plays and card counts; they omit the deal seed and opponents' hidden cards. Guest aliases are shown at the table; Google profile names and email addresses are never used as public table names. The preview has no chat. Room data currently follows the operator's database retention and backup policy.

## Operational data

Reverse proxies and hosting platforms may retain IP addresses, user agents and request logs independently of the application database. Self-hosters should minimize log retention, protect `/data`, rotate `SESSION_SECRET` only with an account migration plan, and publish contact details for privacy requests.
