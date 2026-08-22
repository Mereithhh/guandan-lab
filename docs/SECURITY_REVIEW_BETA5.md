# beta.5 security and adversarial review

Review target: `f3e028dc963230b54864ff349b447009b8f84851` (`v0.3.0-beta.5`)

This report records the scope, concrete findings and verification used for the beta.5 release. It is not a penetration test, compliance certification or guarantee that no vulnerability exists.

## Scope

- compatible Agent and ElevenLabs server routes;
- provider URL and same-origin guards;
- secret and upstream-error redaction;
- local legal-move validation and hidden-information boundaries;
- Chinese/English onboarding, rule equivalence and persisted language state;
- 2022 competition-profile conformance claims;
- README, release and launch-copy evidence claims.

Two independent read-only agent passes reviewed changes outside the files each agent originally authored. The primary agent reproduced every accepted finding before changing code.

## Findings closed before release

| Severity | Finding | Resolution | Evidence |
| --- | --- | --- | --- |
| P1 | English footer, support and OAuth-return copy initially remained Chinese | Moved the strings into the typed locale layer and covered the OAuth return path | `lib/i18n/onboarding.ts`, English desktop/mobile E2E |
| P1 | English tribute guidance omitted the exact two-big-joker resistance conditions | Made single- and double-tribute conditions equivalent to the Chinese rulebook | locale source and English rule-drawer E2E |
| P1 | “32 fixtures” overstated the evidence composition | Corrected the claim to 32 checks: 30 fixtures, one response-right scenario and one provenance check | `tests/fixtures/competition-2022.ts`, `tests/unit/conformance.test.ts` |
| P1 | Agent move comparison could collide when card IDs contained a separator | Replaced joined-string comparison with exact sorted-array equality | `tests/unit/services.test.ts` |
| P1 | ElevenLabs redirects could carry the provider authentication header | Set `redirect: "error"` and added route contracts | `tests/unit/tts-route.test.ts` |
| P1 | TTS timeout did not cover response-body download | Kept the abort timer active through audio validation and download | route implementation and malformed-body/timeout contracts |

No reproducible P0 or remaining P1 was found in the reviewed scope after remediation.

## Verification at the reviewed commit

- 103 unit, rule and route-contract tests passed.
- Coverage: 93.47% lines and 84.19% branches.
- Desktop and mobile E2E passed, including English persistence and OAuth-return notices.
- TypeScript, ESLint, production build, Docker build and Compose capability smoke test passed in [PR #13](https://github.com/Mereithhh/guandan-lab/pull/13).
- Provider contracts cover authentication headers, unsafe base URLs, redirects, timeouts, response sizes, malformed upstreams, audio types and redaction.

## Known limits

- The public demo has no production provider keys, cloud database, Google OAuth or online matching enabled.
- Anonymous quotas are designed for a single self-hosted instance, not a public multi-tenant paid-provider service.
- The rules fixtures cover the documented teaching profile, not every regional variant or tournament procedure.
- Automated checks do not replace runtime monitoring, dependency patching or a professional security assessment.

Future changes are scanned by the repository CodeQL and dependency-review workflow in addition to the normal CI gate.

