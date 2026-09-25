# v12 real-map series and interrupted recovery follow-up

Physical matches remain rehearsal-only. No production simulation rules, career saves or authored map drawings were changed by this follow-up.

## Changes

- `scripts/launch/check-physical-series.ts --real` runs normal-length BO3 rounds on pinned Vertigo, Anubis and Sandstone reference geometry. It verifies mesh hashes, purchases, team/side bindings, serialized pending requests, sealed settlement, idempotent repeated delivery, halftime economy resets, map progression, finalization and unchanged input projects. It retains a diagnostic journal after each round.
- `__tests__/spatial-teams.test.ts` adds a recoverer-death case and a failed-live-smoke-flight case. Death cancels the wait without a ghost pickup. Failed flight cancels by the next simulation tick without another grenade charge. Both retain collision separation checks.
- The project-art reconciliation records 78 exact, source-matched deliveries without modifying their image pixels. The remaining source-content gate has 67 unresolved records; this is not final packaged-content acceptance.
- The Steam readiness audit now validates the explicit release identity and excludes development `steam_appid.txt` files. Its previous requirement to ship/unpack that file contradicted the existing integration and [Valve's SDK instructions](https://partner.steamgames.com/doc/sdk/api#initialization_and_shutdown). No runtime Steam integration was changed.

## Verification

- 51 tests passed across `spatial-teams`, `spatial-recovery-support` and `physical-match-lifecycle`.
- Seven audit tests passed, including rejection of Spacewar/mismatched identities, incomplete nested-file exclusions, preserved UI strings/URLs and fail-closed handling of invalid source syntax. This is 58 focused tests total, not a full-suite rerun.
- Final follow-up TypeScript check passed.
- Focused Next lint passed for the tests. The repository excludes `scripts/` from lint, so the series script was not lint-validated. Next also prints its existing lint-command deprecation notice.
- Strict Steam readiness passes with zero BLOCKER/HIGH findings, one MEDIUM map-name warning and seven INFO findings. The two obsolete App ID BLOCKER findings are gone. Explanatory comments and reference URL literals are retained as INFO through parsed, in-memory classification; visible strings, JSX labels and data remain scanned. Source attribution was not removed. This is not content clearance or installed-game acceptance.
- Production-browser Vertigo recovery, playback and saved-position resume after reload passed in the isolated review server. See [browser evidence](launch-readiness/evidence/2026-09-25-browser-recovery.md) for scope and viewport limitations.
- Real-map BO3 passed **43 rounds**, away winning **0-2**: Vertigo **8-13** (21 rounds), Anubis **9-13** (22 rounds). All rounds reported zero final blocked survivors; collision separation, purchases, pending JSON resume, duplicate settlement, halftime, map progression, unchanged inputs and finalization assertions passed. Sandstone was loaded as the possible decider but **not played**. This campaign did not reach overtime; earlier synthetic overtime evidence remains separate.
- [Completed receipt](ui-review/physical-career/spatial-round-v12-real-series-integration.json) matches the current ten-file source fingerprint `92c3eafcc9df30ffda62335b5cfa0327e7e77b7ebb8432ea8f15ede4187cbfe0`. The exact source list is inside the receipt. Different earlier campaign fingerprints used different source lists and are not interchangeable.
- Original Mirage v13 drawing remains SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.

No production rebuild was needed for test/tool/document/ledger-only changes; browser checks used the preceding v12 production build. No new Windows artifact was built, uploaded, installed or submitted for review.

## Remaining acceptance

One BO3 with equal synthetic rosters cannot certify all seven maps, sites, seeds, balance or performance. This offline campaign took roughly 45 minutes on the current busy host; it is correctness evidence, not a real-time performance pass. The three gunfire-disabled Vertigo opponent stand-offs remain open. Real career integration, additional-seed scenarios, true target-resolution UI checks and packaged Steam lifecycle tests remain required.

See the [current release checklist](launch-readiness/REMAINING-2026-09-25.md) and [signed-in Steam status](launch-readiness/evidence/STEAM-STATUS-2026-09-25.md).
