# Findings rechecked for the launch plan

13 September 2026. Source inspection and fresh local checks; no Steamworks account or native release candidate was reviewed in this pass.

| ID | Evidence | Interpretation and required action | Owner package |
|---|---|---|---|
| R01 | `evidence/steam-ready.json`: HIGH source token in `lib/map-utility-templates.ts`, MEDIUM map identifier in `data/map-studio-library.json` | The strict local release gate fails. These keyword flags need truthful content-policy disposition, not automatic claims of infringement or blind renaming. | L08, L34 |
| R02 | `evidence/ship-artifact.txt`: missing `dist/win-unpacked` | There is no candidate at the configured shipping root to certify. A browser/Next build does not establish a Windows executable/depot. | L31 |
| R03 | Full and production npm audit JSON captured here | 47 total findings (5 critical); production-only 7 (1 critical). Advisory severity alone does not prove exploitability. Review reachable runtime and build-chain risks, upgrade with compatibility tests and retain dispositions. | L06 |
| R04 | `scripts/steam-compliance-audit.ts` walks `public/assets`; hardening's image check uses the same asset area | Zero findings leave other packaged asset roots, reference geometry, notices and distribution rights unverified. The package config includes broad public-file patterns. Add manifest-based inclusion review. | L08, L34 |
| R05 | `scripts/steam-ready-audit.ts` prints `ok` after a check function returns, even if it appended a finding | The per-check progress label means the scanner ran, not that the check passed. Summary and exit code are authoritative. Improve the reporting to avoid false confidence. | L34 |
| R06 | `engine/match/round-outcome.ts` explicitly receives a selected winner; `engine/spatial` is currently exposed through the lab | Current spatial fixtures do not make live outcomes causal. Implement encounters and event-stream integration before claiming credible simulated shots in released matches. | L09-L14 |
| R07 | `store/game-store.ts` has `customTactics`; the current explicit snapshot builder does not list it | Persistence scope needs a declared product decision and inventory. This is a confirmed omission from that builder, not proof of every other persistence path or an automatic schema change. | L03 |
| R08 | `electron/main.js` includes storage/mod handlers with unused event arguments alongside protected close handlers | Sender/schema/path validation must be traced channel by channel. Existing global navigation restrictions and unit tests are not a substitute for that audit. No exploit was attempted. | L07 |
| R09 | `docs/STEAM_REVIEW_REMEDIATION_PLAN.md`, older launch checklists and historical branch/PR instructions | Prior feedback and Early Access wording need reconciliation with the confirmed Windows 1.0 target. Their presence is not current Valve approval or a complete current launch checklist. | L01, L32, L34 |
| R10 | `scripts/build-mod.ts` comments describe a real-name/content overlay as legally clean | A distribution mechanism or optional mod label does not by itself resolve third-party asset permission. Review the actual included material before any authorized distribution; do not carry the comment's assurance into store copy. | L08, L29 |

## Passing evidence retained

- Fresh hardening: tamper and transaction-step recovery fixtures, 500 simulated weeks, and 2,202 image signatures passed. The run does not use a real disk-failure or native process-kill matrix.
- Fresh compliance: zero findings within its implemented scan scope.
- Previous implementation pass: 1,283 regression tests, then the expanded seven-test audio suite; successful production builds and compiled-worker startup. These were not rerun merely to create planning documents.
- Previous production browser checks: Mirage route/playback/settings persistence, lower Nuke background, zoom/pan and the 142-mark user draft import. All-route and full native acceptance remain open.

The launch pack does not claim to have replayed every career, reviewed every line or proven that the entire game is launch-ready. It makes the known work and missing evidence explicit, and gives each requirement an execution prompt and acceptance gate.
