# L28 — management and simulation balance campaign

14 September 2026. **Partial; release NO-GO.** The campaign found and fixed unpaid AI recruits, retained contracts after an AI retirement, and non-finite annual-award statistics. Kills per round now uses recorded rounds. A later ledger review also fixed bankruptcy being finalized before that week's prize income. No broad economy multiplier or tactical win-rate tuning was applied to fit these limited samples.

## Concrete fixes

1. `AIManager.processAcademyScouting` added players directly to senior squads with only legacy salary fields, bypassing the actual contract ledger. New recruits now need the shared affordability check and receive a 104-week canonical contract using the shared wage quote. Normal weekly finance charges it; there is no extra signing fee. Scouting still uses its existing seeded chance. Synergy is recalculated after the roster change.
2. The separate AI season-end retirement path removed a player from the roster but left their active contract. It now removes those contracts and records the retirement week. The triggering full-world failures are retained. Current-week wages already processed remain paid; future wages stop.
3. Award variance read character positions beyond short IDs and generated NaN. Deterministic cycling of short IDs makes those values finite while preserving ordinary long-ID results.
4. Recorded award KPR previously divided kills by maps. It now divides kills by recorded map rounds, including overtime/series scores; legacy records without a usable round denominator retain the existing fallback. Other estimated awards/achievements remain a separate content/calibration limitation.

## Campaign results

See [protocol](L28-CAMPAIGN-PROTOCOL.md), [summary](L28-summary.json), [raw small baseline](L28-baseline-small.json), [small campaign](L28-candidate2-small.json), [natural-finance final follow-up](L28-natural-final-world.json) and [checkpoint archive](../../../tmp/l28-campaign-checkpoints.zip).

| Run stage | Cases | Week ticks | Completed 520 | Structural failure cases | Career endings |
|---|---:|---:|---:|---:|---|
| baseline-small | 60 | 503 | 0 | 60 | None |
| baseline-world | 6 | 6 | 0 | 6 | None |
| candidate2-small | 60 | 31,200 | 60 | 0 | None |
| candidate2-world | 6 | 262 | 0 | 0 | {'BANKRUPTCY': 6} |
| natural-world | 6 | 254 | 0 | 4 | {'BANKRUPTCY': 2} |
| natural-final-world | 6 | 774 | 0 | 0 | {'BANKRUPTCY': 2, 'SACKED': 4} |
| repeat-final-small | 2 | 1,040 | 2 | 0 | None |

The small campaign covers **30 distinct seeds × two training policies × 520 real ticks**: 31,200 week ticks and 23,927 simulated matches. All paired initial hashes match, including baseline/candidate inputs. No full-year zero-match period was recorded. Roster shortages occurred in seven of the 60 cases; three cases were short for 53 ticks. These remain a recruitment/eligibility calibration concern, amplified by the small fixture's scarce free-agent pool. Synthetic clubs are not a representative full-world economy.

This is **staged evidence**. The 30-seed campaign includes the scouting and awards fixes, before the subsequently discovered retirement fix. The post-retirement code repeats seed 28001 under both policies with identical final state hashes, and reruns the affected natural-finance full-world cases. It is not a claim that all 30 seeds were rerun on the final integrated product. The initial harness/source identities are archived and corrected in the small-campaign metadata because that version originally read source hashes at completion; the final runner captures them at startup.

The underfunded world cases deliberately replace the first snapshot club's opening cash while retaining its payroll. Their bankruptcy outcomes are stress results, not default-career survival rates. Natural-finance cases retain snapshot finances and use three different clubs. Final follow-ups stop at genuine bankruptcy or sacking outcomes with no structural failures; none completes ten seasons. Do not continue ended careers merely to report 520 ticks.

## Balance interpretation

Small-world final managed cash ranges from $14,422,636 to $27,524,861, median $19,678,414. This scripted manager allows contract expiry and fills vacancies cheaply, and three-club competition is sparse. Large cash reserves warrant investigation; they do not by themselves prove a repeatable money exploit or justify a global income cut.

Across 30 paired small seeds, intensive-minus-light final cash has median $34,366, range $-874,305 to $1,495,874. The difference in total generated injury events has median -3.0, range -16 to 28. Injury counts cover the world, not only managed players. These heterogeneous scripted runs are descriptive; they do not establish an optimal training policy. Annual checkpoints retain initial-player progression/decline, fatigue, wages, sponsorship, transfers and tournament winners/prizes for deeper review. Difficulty/tier/cash combinations are stratified, not a complete factorial study.

[Tactical pairs](L28-tactical-pairs.json): 270 Mirage BO1 simulations, nine style pairings, 30 common seeds, mirrored player abilities and alternating CT starts. Home wins are 16/30 in equal-style pairs, 22/30 when countering and 14/30 when countered. The 22/30 Wilson 95% interval is approximately 55.6–85.8%; comparisons share seeds and are not independent proof of dominance. This is the legacy aggregate match engine, not validated spatial 5v5/utility behavior. No playstyle bonus was changed.

## Verification and compatibility

- **1,618 tests / 168 suites pass**, including eight new balance regressions: paid/affordable scouting, invariant detection, finite short-ID awards, round-based KPR and retired-contract cleanup. [Tests](L28-tests.json), [test log](L28-tests.log).
- TypeScript exits 0. Production build and worker startup verifier pass. Build `EA-MVYDvWDNj7iTVNZQMI`, worker `3816.fa2b0e0097846f89.js`. The first build caught type annotations missing in the new tactical harness; corrected and rebuilt. Existing lint warnings remain in the build log. [Build log](L28-build.log), [type-check log](L28-types.log).
- Preview port 3210, PID 306488. [HTTP smoke](L28-http-smoke.json) checks route availability only. No browser, human playtest, durable-save or packaged Windows acceptance was performed.
- [Data hashes](L28-preserved-data.json) confirm owner Mirage drawings, spawn/bombsite areas and team snapshot unchanged. Owner careers were not opened or advanced. [Archive/source manifest](L28-artifact-manifest.json) identifies delivered evidence.

No save schema change is needed. Existing recorded match results remain stored. Future recruitment, wages, retirement and annual awards can differ intentionally, so old week-input hashes are not expected to reproduce across the code change. New-generation fixes do not retroactively repair old unpaid AI prospects or serialized invalid awards; old-career repair/validation is explicitly open. Roll back only these source increments if necessary, preserving earlier dirty-workspace changes and user data.

## Final settlement follow-up

A ledger review found that two underfunded world cases were marked bankrupt at week 33, before a $360,000 tournament prize left the club with $300,117. This was an ordering defect, not an intended difficulty outcome. `FinanceProcessor.reconcileWeeklySolvency` now runs after weekly tournaments, matches and AI processing, before narrative/board decisions. It refreshes the managed club's financial state and clears only a current-week provisional bankruptcy when settled cash is positive; earlier terminal careers and board dismissals stay intact. It does not add money or alter the ledger. The existing state classifier is reused. Two additional regressions cover recovery, idempotence and preservation of genuine debt/earlier endings.

The [final settlement rerun](L28-settlement-final-world.json) uses the same six initial states as the earlier underfunded world cases: **1,238 ticks, 37,162 matches, 2 completed ten-season cases, 0 structural failures**, terminal outcomes {'BANKRUPTCY': 4}. The small 30-seed campaign and natural-finance follow-ups predate this last fix; their source identities remain separate. Complete the final integrated campaign before accepting balance.

The large checkpoint archive is retained under ignored `tmp/`, with its SHA-256 in the artifact manifest, so it is reviewable locally without adding a large binary to source control. Keep it with the evidence when moving this workspace.

## Open work and next step

All ten [human/final-integration acceptance cases](L28-acceptance-cases.csv) remain NOT_RUN. A 30-seed ten-season **final full-world** campaign with the full application coordinator, human strategy tests, sensible default-club recovery, transfer-price/wage/income tuning and dominant-action analysis remain required. Earlier player/UI testing, remaining team identities, full spatial 5v5 integration/calibration, L27 real performance, packaged Windows testing and content clearance stay open. Steam App ID 4326170 passes; the content gate holds 4,988 unresolved/changed items.

**Next: L29 — community imports and optional Workshop**, while continuing the L28 balance and validation work. Workshop scope remains conditional; do not publish content or treat local import tests as Steam approval.
