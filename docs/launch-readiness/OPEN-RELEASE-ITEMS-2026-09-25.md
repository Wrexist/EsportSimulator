# All unaccepted Steam release items — 25 September 2026

Register snapshot: 36 packages; 102 unchecked implementation tasks and 98 unchecked acceptance criteria. These are not a remaining-code estimate or readiness percentage.

**Read [the current handoff](../../STEAM_RELEASE_HANDOFF.md) first.** The package register includes historical bookkeeping: unchecked means not accepted, not necessarily unimplemented. Reverify current code and evidence before changing anything. No implementation or approval is inferred by this export.

The current handoff adds the latest Overpass failures, physical rehearsal limitation, portrait synchronization, source-content reconciliation, Steam status and packaging requirements. Original detailed prompts remain available for every package.

## L01 — Define the launch promise and management identity

Recorded status: **verified** · required · Dependencies: none · [Master prompt](prompts/L01.md)

No unchecked items in this package register. Preserve its evidence and recheck affected behavior after changes.


Recorded evidence: [L01-REPORT.md](evidence/L01-REPORT.md)

## L02 — Create reproducible careers and evidence fixtures

Recorded status: **partial** · required · Dependencies: L01 · [Master prompt](prompts/L02.md)

- [ ] **L02.4** Add failure injection at the actual persistence and worker boundaries; preserve historical fixtures as compatibility inputs.
- [ ] **L02.A3** Each failed acceptance case produces a reproducible report and retained last-good save.

Recorded evidence: [L02-REPORT.md](evidence/L02-REPORT.md)

## L03 — Finish save, migration and recovery trust

Recorded status: **partial** · required · Dependencies: L02 · [Master prompt](prompts/L03.md)

- [ ] **L03.2** Complete serializer/default/migration coverage across all supported save versions and career switching; do not assume an optional TypeScript field persists.
- [ ] **L03.3** Exercise disk/quota failure, corrupted primary with valid backup, failed migration, interrupted commit, duplicate Save and crash during next week using the actual adapters.
- [ ] **L03.4** Keep last-good data and make processing, saving, saved and retry states truthful; ensure ledger, rewards and week completion are applied exactly once.
- [ ] **L03.A1** Declared durable state round-trips through each real save path and a fresh process.
- [ ] **L03.A2** Faults never silently replace a valid save with invalid data or report a failed write as saved.
- [ ] **L03.A3** Recovery and older-save behavior are verified in both browser storage and the packaged application.

Recorded evidence: [IMPLEMENTATION.md](../audit-2026-09-12/IMPLEMENTATION.md), [L03-REPORT.md](evidence/L03-REPORT.md), [L03-save-fields.json](evidence/L03-save-fields.json), [L03-checks.json](evidence/L03-checks.json), [L03-native-faults.json](evidence/L03-native-faults.json), [L03-native-read.json](evidence/L03-native-read.json)

## L04 — Prove deterministic simulation and worker ownership

Recorded status: **partial** · required · Dependencies: L02, L03 · [Master prompt](prompts/L04.md)

- [ ] **L04.A1** Worker, fallback and resumed runs agree on canonical match, economy, progression and RNG fields.
- [ ] **L04.A2** Late results, concurrent requests and failure after computation cannot double-advance the week.
- [ ] **L04.A3** The compiled worker boots without browser globals and cannot initialize durable storage.

Recorded evidence: [L04-REPORT.md](evidence/L04-REPORT.md), [L04-L05-checks.json](evidence/L04-L05-checks.json)

## L05 — Complete preferences, audio, exit and desktop lifecycle

Recorded status: **partial** · required · Dependencies: L03, L04 · [Master prompt](prompts/L05.md)

- [ ] **L05.3** Keep Map Studio and nested lab pages silent, honor stored volume before first interaction, and verify menu/match scene changes and background-window behavior.
- [ ] **L05.4** Verify fullscreen, display scaling, window resize, minimize/restore, sleep/resume and single-instance behavior on the supported desktop target.
- [ ] **L05.A1** Canceling close leaves the app usable and autosave active, with no duplicate timers or handlers.
- [ ] **L05.A2** Muted starts and studio clicks stay quiet; settings persist across restart and agree across screens.
- [ ] **L05.A3** Native close/cancel/slow-save behavior is exercised in the packaged build, not inferred from helper tests.

Recorded evidence: [L05-REPORT.md](evidence/L05-REPORT.md), [L04-L05-checks.json](evidence/L04-L05-checks.json)

## L06 — Resolve dependency and runtime security findings

Recorded status: **partial** · required · Dependencies: L02 · [Master prompt](prompts/L06.md)

- [ ] **L06.1** Triage all 47 recorded advisories and the seven production findings against runtime reachability, build tools and the shipped dependency tree.
- [ ] **L06.3** Recheck Next worker compilation, Electron/native module compatibility, save migration and offline startup after each relevant update.
- [ ] **L06.A1** No reachable critical/high release vulnerability remains without a concrete mitigation verified on the candidate.
- [ ] **L06.A2** The resolved dependency graph is reproducible from the lockfile and the actual packaged tree is audited.
- [ ] **L06.A3** Affected regression suites, clean type checks, production worker and packaged startup pass after upgrades.

Recorded evidence: [dependencies.json](evidence/dependencies.json), [runtime-dependencies.json](evidence/runtime-dependencies.json), [L06-REPORT.md](evidence/L06-REPORT.md), [L06-TRIAGE.json](evidence/L06-TRIAGE.json), [L06-dependencies.json](evidence/L06-dependencies.json), [L06-runtime-dependencies.json](evidence/L06-runtime-dependencies.json)

## L07 — Harden Electron, IPC and local boundaries

Recorded status: **partial** · required · Dependencies: L06 · [Master prompt](prompts/L07.md)

- [ ] **L07.A1** An untrusted frame cannot read/write saves, clear storage, access arbitrary paths or change privileged settings.
- [ ] **L07.A2** Invalid inputs fail safely without crashing or altering unrelated files.
- [ ] **L07.A3** A packaged security smoke run documents navigation, IPC and local-port behavior with real Electron.

Recorded evidence: [L07-REPORT.md](evidence/L07-REPORT.md), [L07-IPC-INVENTORY.json](evidence/L07-IPC-INVENTORY.json), [L07-checks.json](evidence/L07-checks.json), [L07-native-security.json](evidence/L07-native-security.json), [L07-native-csp.json](evidence/L07-native-csp.json)

## L08 — Establish content provenance and distribution rights

Recorded status: **partial** · required · Dependencies: L01 · [Master prompt](prompts/L08.md)

- [ ] **L08.3** Reconcile historical Steam feedback with the current build/store evidence; prepare original replacements or explicit distribution permission where needed.
- [ ] **L08.4** Resolve the strict scan's source-reference finding accurately and expand review beyond public/assets; never rename files or widen allowlists merely to conceal unresolved ownership.
- [ ] **L08.A1** Every included asset has a documented release disposition and required attribution is actually packaged.
- [ ] **L08.A2** Unresolved third-party content is replaced or deliberately excluded from the shipping artifact while user drafts remain backed up.
- [ ] **L08.A3** Store screenshots, trailers and generated player-facing content have the same provenance review as game assets.

Recorded evidence: [steam-ready.json](evidence/steam-ready.json), [AUDIT-DELTA.md](AUDIT-DELTA.md), [L08-REPORT.md](evidence/L08-REPORT.md), [L08-content-inventory.json](evidence/L08-content-inventory.json), [L08-lineup-inventory.json](evidence/L08-lineup-inventory.json)

## L09 — Register map annotations, spawns and plant zones

Recorded status: **partial** · required · Dependencies: L02, L08 · [Master prompt](prompts/L09.md)

- [ ] **L09.A1** Mirage spawn and plant zones align with the reviewed reference and never place a body in a solid or wrong floor.

Recorded evidence: [L09-REPORT.md](evidence/L09-REPORT.md), [SPATIAL-LAB.md](../SPATIAL-LAB.md), [L09-map-coverage.md](evidence/L09-map-coverage.md), [MIRAGE-V12-REPORT.md](evidence/MIRAGE-V12-REPORT.md)

## L10 — Implement credible movement and vertical traversal

Recorded status: **partial** · required · Dependencies: L04, L09 · [Master prompt](prompts/L10.md)

- [ ] **L10.2** Implement supported-body clearance and floor support, turning, acceleration, stopping, crouch clearance, stairs, ramps and validated ladders.
- [ ] **L10.3** Add explicit jump/drop arcs, landing validation, one-way edges and blocked-path recovery; do not invent reverse routes or teleport to nearby polygons.
- [ ] **L10.4** Add route smoothing constrained to valid surfaces, congestion/teammate avoidance and inspectable reasons for rejected transitions; calibrate provisional values from measured references.
- [ ] **L10.A1** Accepted route fixtures never cross solids, unsupported gaps or floors; illegal transitions fail with a reason.
- [ ] **L10.A2** Every enabled traversal has positive, negative and reverse-direction cases plus deterministic replay.
- [ ] **L10.A3** Mirage main rotations and height transitions are manually reviewed before expanding acceptance to the other launch maps.

Recorded evidence: [L10-REPORT.md](evidence/L10-REPORT.md), [SPATIAL-LAB.md](../SPATIAL-LAB.md), [MIRAGE-V12-REPORT.md](evidence/MIRAGE-V12-REPORT.md)

## L11 — Make perception and shots cause encounter outcomes

Recorded status: **partial** · required · Dependencies: L04, L10 · [Master prompt](prompts/L11.md)

- [ ] **L11.A1** No direct shot damages through opaque geometry or a different floor without a verified penetration rule.
- [ ] **L11.A2** A hidden or out-of-FOV enemy cannot trigger an omniscient response; reaction/reload windows are exercised.
- [ ] **L11.A3** Seeded duel replays reproduce damage and outcome, including simultaneous-action ordering and interrupted visibility.

Recorded evidence: [L11-REPORT.md](evidence/L11-REPORT.md), [L11-checks.json](evidence/L11-checks.json)

## L12 — Simulate utility, cover and dynamic obstacles

Recorded status: **partial** · required · Dependencies: L10, L11 · [Master prompt](prompts/L12.md)

- [ ] **L12.3** Add dynamic door/breakable state and material thickness/penetration only where supported by reviewed data; do not treat the decimated visibility mesh as complete physical truth.
- [ ] **L12.A1** Effects respect walls, heights, timing, team inventory and visibility rules; smoke cannot magically fill disconnected rooms.
- [ ] **L12.A2** A reviewed utility test set covers each enabled grenade and every launch map; imports are never auto-certified.
- [ ] **L12.A3** Deterministic validation catches invalid throws, missing geometry, impossible trajectories and expired effects.

Recorded evidence: [L12-REPORT.md](evidence/L12-REPORT.md), [L12-checks.json](evidence/L12-checks.json)

## L13 — Build tactically intelligent teams

Recorded status: **partial** · required · Dependencies: L11, L12 · [Master prompt](prompts/L13.md)

- [ ] **L13.3** Coordinate spacing, angle coverage, trade timing, utility budgets, bomb carrier, plant/defuse deadlines and economy-driven saves.
- [ ] **L13.4** Expose tactical intent and why a plan changed in replay diagnostics; prevent oscillating objectives, crowding, repeated utility waste and stuck loops.
- [ ] **L13.A1** Teams complete objective scenarios without omniscient rotations, impossible trades or indefinite inactivity.
- [ ] **L13.A2** Role and tactical changes measurably alter behavior under controlled scenarios; stronger settings improve distributions without forced wins.
- [ ] **L13.A3** Timeouts, bomb deadlines, teammate loss and stale information produce explainable replanning.

Recorded evidence: [L13-REPORT.md](evidence/L13-REPORT.md), [L13-checks.json](evidence/L13-checks.json), [L13-native.json](evidence/L13-native.json), [L13-l12-regression-native.json](evidence/L13-l12-regression-native.json), [L13-mirage-review.json](evidence/L13-mirage-review.json), [L13-calibration.json](evidence/L13-calibration.json), [L13-browser-replay-check.json](evidence/L13-browser-replay-check.json), [L13-team-lab.png](evidence/L13-team-lab.png)

## L14 — Connect the spatial engine to authoritative matches

Recorded status: **partial** · required · Dependencies: L03, L04, L13 · [Master prompt](prompts/L14.md)

- [ ] **L14.1** Replace the winner-first path for the new simulator only after controlled encounters pass, with a versioned compatibility path for existing careers/replays.
- [ ] **L14.2** Make the same event stream drive match results, stats, economy, bomb state and 2D radar; never hide an impossible kill line while retaining its damage.
- [ ] **L14.3** Preserve map ID, floor, side, roster, seed and tactic choices from veto through live/instant/skip/resume/result/history.
- [ ] **L14.4** Keep real-time rendering separate from simulation time so playback speed, pauses or dropped frames cannot change results; profile season simulation cost.
- [ ] **L14.A1** Live, instant, skipped and resumed versions of the same scenario agree on canonical result and events.
- [ ] **L14.A2** Veto-selected maps persist through every match view, fixing any reproduced Sandstone/Nuke mismatch.
- [ ] **L14.A3** No match commits duplicate rewards, player stats or results, and old saves remain loadable with explicit engine versioning.

Recorded evidence: [L14-REPORT.md](evidence/L14-REPORT.md), [L14-replays.json](evidence/L14-replays.json), [L14-jest.json](evidence/L14-jest.json), [L14-season-profile.md](evidence/L14-season-profile.md), [L14-mirage-review.json](evidence/L14-mirage-review.json), [L14-native.json](evidence/L14-native.json), [L14-browser-export.json](evidence/L14-browser-export.json), [L14-source.json](evidence/L14-source.json)

## L15 — Unify finances, budgets and contract consequences

Recorded status: **partial** · required · Dependencies: L03, L04 · [Master prompt](prompts/L15.md)

- [ ] **L15.1** Trace all wages, transfers, signing bonuses, prizes, sponsors, loans if present, facilities and equipment through one ledger and forecast contract.
- [ ] **L15.2** Show recurring commitments, conditional revenue, one-off costs, affordability and runway consistently before decisions and after settlement.
- [ ] **L15.3** Test renewals, releases, cash shortfalls, delayed/conditional payments, replayed transactions and season boundaries.
- [ ] **L15.4** Keep risk/reward choices meaningful; remove infinite money loops without punishing ordinary save/reload or adding anti-refund gameplay.
- [ ] **L15.A1** Every controlled cash delta reconciles to a unique ledger entry and all screens agree on labeled totals.
- [ ] **L15.A2** Contracts cannot be signed twice, exceed enforceable constraints silently or charge without delivering the agreed state.
- [ ] **L15.A3** Healthy and distressed clubs remain playable or reach clearly telegraphed failure through documented rules.

Recorded evidence: [L15-REPORT.md](evidence/L15-REPORT.md), [L15-finance-runtime.json](evidence/L15-finance-runtime.json), [L15-native-week.json](evidence/L15-native-week.json), [L15-L14-native-replays.json](evidence/L15-L14-native-replays.json), [L15-jest.json](evidence/L15-jest.json), [L15-build-receipt.json](evidence/L15-build-receipt.json), [L15-identity-tests.txt](evidence/L15-identity-tests.txt), [L15-signing-preview.png](evidence/L15-signing-preview.png), [L15-profile-portrait.png](evidence/L15-profile-portrait.png), [L15-career-portraits.png](evidence/L15-career-portraits.png), [L15-club-emblems.png](evidence/L15-club-emblems.png)

## L16 — Finish squad, recruitment, scouting and transfer AI

Recorded status: **partial** · required · Dependencies: L04, L15 · [Master prompt](prompts/L16.md)

- [ ] **L16.1** Reconcile OVR and role fit across squad, scouting, comparison, eligibility and negotiation, preserving intentionally hidden information.
- [ ] **L16.2** Complete offers, counteroffers, renewals, expiry, poaching, free agents, roster registration, bench/release and cancellation paths already supported by the design.
- [ ] **L16.3** Make AI recruitment respond to needs, finances, age, roles, reputation and contract availability under the same constraints as the player.
- [ ] **L16.4** Explain uncertainty, wages, buyouts, team fit and competition eligibility before commitment; prevent retired, duplicated or already-owned signings.
- [ ] **L16.A1** A player can scout, compare, negotiate, sign and field an eligible player through the full UI and after reload.
- [ ] **L16.A2** AI teams maintain viable rosters and finances over long careers without magical transfers.
- [ ] **L16.A3** Every stale/invalid offer has a recoverable explanation; no hidden-attribute leakage through alternate screens.

Recorded evidence: [L16-REPORT.md](evidence/L16-REPORT.md), [L16-jest.json](evidence/L16-jest.json), [L16-recruitment-runtime.json](evidence/L16-recruitment-runtime.json), [L16-native-week.json](evidence/L16-native-week.json), [L16-L14-native-replays.json](evidence/L16-L14-native-replays.json), [L16-build-identity.json](evidence/L16-build-identity.json), [L16-final-regressions.txt](evidence/L16-final-regressions.txt), [L16-match-result-dom.txt](evidence/L16-match-result-dom.txt), [L16-followup-runtime.json](evidence/L16-followup-runtime.json), [L16-followup-seed3417.json](evidence/L16-followup-seed3417.json), [L16-followup-seed3418.json](evidence/L16-followup-seed3418.json), [L17-REPORT.md](evidence/L17-REPORT.md)

## L17 — Make development, training and academy choices matter

Recorded status: **partial** · required · Dependencies: L04, L16 · [Master prompt](prompts/L17.md)

- [ ] **L17.1** Audit actual training slots, capacity, daily/weekly timing, fatigue, recovery, morale and staff/facility modifiers against what the UI promises.
- [ ] **L17.2** Define age/potential/development/decline and scouting uncertainty so specialists, prospects and veterans create different viable plans.
- [ ] **L17.3** Complete academy ownership, prospect recruitment, promotion, loans if supported and long-run player supply without duplicate player records.
- [ ] **L17.4** Show projected tradeoffs and weekly evidence of change; avoid unlimited passive stat growth, schedule overlap and misleading empty slots.
- [ ] **L17.A1** Training effects are reachable through real scheduling actions and match the displayed constraints.
- [ ] **L17.A2** Aging, retirement, academy replenishment and promotion stay finite and ownership-safe across ten seasons.
- [ ] **L17.A3** At least three distinct training plans produce the intended tradeoffs across a seeded cohort, not just different text.

Recorded evidence: [L17-REPORT.md](evidence/L17-REPORT.md), [L17-jest.json](evidence/L17-jest.json), [L17-cohort.json](evidence/L17-cohort.json), [L17-build-identity.json](evidence/L17-build-identity.json), [L17-native-week.json](evidence/L17-native-week.json), [L17-L14-native-replays.json](evidence/L17-L14-native-replays.json), [L17-followup-jest.json](evidence/L17-followup-jest.json), [L17-followup-build-identity.json](evidence/L17-followup-build-identity.json), [L17-expanded-cohort.json](evidence/L17-expanded-cohort.json), [L17-ten-season.json](evidence/L17-ten-season.json)

## L18 — Give staff, sponsors, facilities and equipment clear value

Recorded status: **partial** · required · Dependencies: L15, L17 · [Master prompt](prompts/L18.md)

- [ ] **L18.1** Verify each hire, upgrade and sponsorship has an implemented benefit, recurring cost, activation time, capacity and cancellation/expiry rule.
- [ ] **L18.2** Connect organizational investments to training, scouting, morale, commercial outcomes or preparation through bounded documented effects.
- [ ] **L18.3** Align preview numbers with settlement and performance selectors; expose prerequisites and opportunity costs instead of decorative purchase screens.
- [ ] **L18.4** Test repeated purchases, replacement, bankruptcy, contract renewal and unavailable offers; remove or clearly exclude nonfunctional launch options.
- [ ] **L18.A1** No paid action takes cash without delivering its advertised effect and every ongoing cost is ledgered.
- [ ] **L18.A2** A cheaper alternative remains rational for some clubs; stacking cannot produce runaway bonuses.
- [ ] **L18.A3** All organization flows save/load correctly and their benefits are visible in a controlled before/after scenario.

Recorded evidence: [L18-REPORT.md](evidence/L18-REPORT.md), [L18-jest.json](evidence/L18-jest.json), [L18-build-identity.json](evidence/L18-build-identity.json), [L18-native-week.json](evidence/L18-native-week.json), [L18-runtime.json](evidence/L18-runtime.json), [L18-content-gate.txt](evidence/L18-content-gate.txt)

## L19 — Validate calendar, tournaments, qualification and rankings

Recorded status: **partial** · required · Dependencies: L04, L15 · [Master prompt](prompts/L19.md)

- [ ] **L19.1** Verify every declared format and supported field size, byes, tiebreakers, brackets, map series, qualification, seeding and terminal completion.
- [ ] **L19.2** Use shared calendar helpers for days, weeks, seasons, contract dates and historical fixtures; resolve overlaps and rollover correctly.
- [ ] **L19.3** Award trophies, prize money, circuit points and qualification exactly once, then propagate consistent results to schedule, inbox, rankings and history.
- [ ] **L19.4** Ensure AI-only fixtures and unavailable player teams progress the world without softlocks; distinguish implemented formats from labels that fall back.
- [ ] **L19.A1** All launch tournament formats finish through actual scheduled progression with correct entrants and winners.
- [ ] **L19.A2** No team appears twice, receives duplicate byes/rewards or advances from an unresolved result.
- [ ] **L19.A3** Multi-season calendars and rankings remain coherent after save/reload, job changes and eliminated player teams.

Recorded evidence: [L19-REPORT.md](evidence/L19-REPORT.md), [L19-formats.json](evidence/L19-formats.json), [L19-jest.json](evidence/L19-jest.json), [L19-build-identity.json](evidence/L19-build-identity.json), [L19-native-week.json](evidence/L19-native-week.json)

## L20 — Make long careers coherent and memorable

Recorded status: **partial** · required · Dependencies: L16, L17, L18, L19 · [Master prompt](prompts/L20.md)

- [ ] **L20.1** Connect board expectations, manager reputation, morale, chemistry, rivalry, inbox decisions and season recaps to actual outcomes and bounded consequences.
- [ ] **L20.2** Verify jobs, club switches, sacking, bankruptcy, recovery/new-career paths and historical records do not leak state between clubs or careers.
- [ ] **L20.3** Create a curated set of situation-driven stories with variation, cooldowns and meaningful choices; avoid repetitive inbox spam and cosmetic choices presented as mechanical.
- [ ] **L20.4** Maintain records, legends, trophies, FPL and academy histories where shipped, using one authoritative result source and bounded storage.
- [ ] **L20.A1** A full career can cross promotions, losses, job changes and season reviews without stalled progression or duplicated story rewards.
- [ ] **L20.A2** Important consequences are telegraphed and the player can explain why their board, squad or finances changed.
- [ ] **L20.A3** Ten-season fixtures preserve coherent rosters, history and manageable notification volume.

Recorded evidence: [L20-REPORT.md](evidence/L20-REPORT.md), [L20-career-runtime.json](evidence/L20-career-runtime.json), [L20-jest.json](evidence/L20-jest.json), [L20-build-identity.json](evidence/L20-build-identity.json), [L20-native-week.json](evidence/L20-native-week.json)

## L21 — Make match management offer real agency

Recorded status: **partial** · required · Dependencies: L14, L16, L19 · [Master prompt](prompts/L21.md)

- [ ] **L21.1** Complete the preparation-to-result loop with valid lineup, roles, map veto, economy plan, tactical intentions and clear costs or limits for intervention.
- [ ] **L21.2** Make timeouts and mid-match instructions affect simulation decisions through bounded rules with feedback, not an unexplained guaranteed win boost.
- [ ] **L21.3** Support watch, pause, speed, skip, interruption and resume consistently; explain momentum, utility, damage and decisive tactical moments at an appropriate level.
- [ ] **L21.4** Link post-match analysis to practical next actions in training, recruitment and tactics; make defeat informative without exposing omniscient opponent data.
- [ ] **L21.A1** A manager has meaningful pre-match and permitted live decisions whose effects are demonstrable in paired scenarios.
- [ ] **L21.A2** Every BO1/3/5 path, stale fixture, back navigation and resume preserves map and lineup contracts.
- [ ] **L21.A3** Players can identify what happened and choose a relevant response from the result screen.

Recorded evidence: [L21-REPORT.md](evidence/L21-REPORT.md), [L21-match-audit.json](evidence/L21-match-audit.json), [L21-jest.json](evidence/L21-jest.json), [L21-build-identity.json](evidence/L21-build-identity.json), [L21-native-week.json](evidence/L21-native-week.json)

## L22 — Rebuild onboarding and the first session

Recorded status: **partial** · required · Dependencies: L01, L16, L17, L21 · [Master prompt](prompts/L22.md)

- [ ] **L22.1** Guide new players through a valid club choice, squad assessment, budget constraint, one training/recruitment decision and the first match.
- [ ] **L22.2** Reduce front-loaded exposition; reveal useful information when a decision needs it and keep the next action prominent.
- [ ] **L22.3** Provide honest difficulty/eligibility explanations, contextual help, skippable/replayable tutorial and recovery from abandoned setup.
- [ ] **L22.4** Test with new players using a scripted observation protocol; capture confusion and time-to-first-meaningful-decision rather than relying on developer familiarity.
- [ ] **L22.A1** At least 10 of 12 proposed fresh-player testers complete the defined first-session objective without facilitator rescue; record actual results before claiming this gate passes.
- [ ] **L22.A2** All tutorial steps correspond to reachable controls and can be skipped or replayed without corrupting progress.
- [ ] **L22.A3** Dashboard priorities remain useful after onboarding instead of permanently displaying introductory clutter.

Recorded evidence: [L22-REPORT.md](evidence/L22-REPORT.md), [L22-jest.json](evidence/L22-jest.json), [L22-build-identity.json](evidence/L22-build-identity.json), [L22-native-first-session.json](evidence/L22-native-first-session.json), [L22-PLAYER-TEST-PROTOCOL.md](evidence/L22-PLAYER-TEST-PROTOCOL.md), [L22-player-sessions.csv](evidence/L22-player-sessions.csv)

## L23 — Apply one polished interface across all routes

Recorded status: **partial** · required · Dependencies: L05, L22 · [Master prompt](prompts/L23.md)

- [ ] **L23.1** Use the existing glass shell and shared primitives; establish readable type, spacing, density, table, form, modal, loading, empty and error standards.
- [ ] **L23.2** Audit every route in ROUTE-MATRIX.md and each important modal/overlay, including map tools, without replacing working domain code for visual reasons.
- [ ] **L23.3** Make navigation immediate, preserve relevant filters/scroll, support back/forward and contextual return, and clarify desktop/inbox behavior.
- [ ] **L23.4** Split oversized components only along real responsibilities, removing proven duplicate paths and keeping dense data surfaces free of expensive layered blur.
- [ ] **L23.A1** All required actions are visible and usable at 1024x640, 1280x720 and 1440x900 plus declared OS scaling.
- [ ] **L23.A2** Representative dashboard/table/form/modal/match screens pass a consistent visual review with no clipped controls or broken loading/error states.
- [ ] **L23.A3** Every claimed launch route has an accepted screenshot and interaction case; development-only pages are explicitly gated.

Recorded evidence: [GLASS-INTERFACE.md](../audit-2026-09-12/GLASS-INTERFACE.md), [L23-REPORT.md](evidence/L23-REPORT.md), [L23-ROUTE-REVIEW.md](evidence/L23-ROUTE-REVIEW.md), [L23-route-inventory.json](evidence/L23-route-inventory.json), [L23-ui-cases.csv](evidence/L23-ui-cases.csv), [L23-jest.json](evidence/L23-jest.json), [L23-build.txt](evidence/L23-build.txt), [L23-http-smoke.json](evidence/L23-http-smoke.json)

## L24 — Finish accessibility, input and localization readiness

Recorded status: **partial** · required · Dependencies: L23 · [Master prompt](prompts/L24.md)

- [ ] **L24.1** Complete keyboard-only journeys, semantic labels, focus order, modal Escape/focus return, error announcements and alternatives to pointer-only map interactions.
- [ ] **L24.2** Make reduced motion effective in CSS, canvas, SVG and radar playback; ensure colors are reinforced by labels/shapes and zoom/scaling stays usable.
- [ ] **L24.3** Define supported keyboard/mouse/controller behavior and test text entry and navigation on each claimed device, including Deck only if promised.
- [ ] **L24.4** Audit font glyphs, string extraction, dates/numbers, text expansion and actual language completeness; ship only verified language claims.
- [ ] **L24.A1** The core career loop and essential map editing/testing actions are operable without precise pointer use.
- [ ] **L24.A2** Supported zoom, contrast and reduced-motion configurations retain readable information and functional controls.
- [ ] **L24.A3** Every advertised language/input/device has a recorded acceptance pass; controller or Deck badges are not inferred from a browser screenshot.

Recorded evidence: [L24-REPORT.md](evidence/L24-REPORT.md), [L24-INPUT-LANGUAGE-SCOPE.md](evidence/L24-INPUT-LANGUAGE-SCOPE.md), [L24-localization-inventory.json](evidence/L24-localization-inventory.json), [L24-acceptance-cases.csv](evidence/L24-acceptance-cases.csv), [L24-jest.json](evidence/L24-jest.json), [L24-build.txt](evidence/L24-build.txt)

## L25 — Complete original team identities and asset delivery

Recorded status: **partial** · required · Dependencies: L08, L23 · [Master prompt](prompts/L25.md)

- [ ] **L25.2** Create a coherent but distinct visual identity per team, informed by permitted references and the user's direction without assuming a close recreation is automatically distributable.
- [ ] **L25.3** Validate small crest silhouettes, light/dark contrast, SVG ID isolation, transparent edges, raster fallbacks and custom-upload behavior.
- [ ] **L25.4** Package only approved current assets and generate a searchable contact sheet/manifest with version, source, file size and team mapping.
- [ ] **L25.A1** Every launch team has one approved identity that remains recognizable at table, profile and match sizes.
- [ ] **L25.A2** No wrong initials, original-name fallback, duplicate SVG IDs, missing references or source-only alternates appear in the shipped artifact.
- [ ] **L25.A3** Asset rights and replacement disposition are resolved under 08 before store/media approval.

Recorded evidence: [L25-REPORT.md](evidence/L25-REPORT.md), [index.html](evidence/L25-assets/index.html), [manifest.json](evidence/L25-assets/manifest.json), [L25-asset-validation.json](evidence/L25-asset-validation.json), [L25-tests.json](evidence/L25-tests.json), [L25-portrait-audit.json](evidence/L25-portrait-audit.json)

## L26 — Edit content, terminology, audio and feedback

Recorded status: **partial** · required · Dependencies: L20, L23, L25 · [Master prompt](prompts/L26.md)

- [ ] **L26.1** Apply shared terminology and formatters for money, attributes, OVR, dates, percentages and match outcomes; remove placeholders, raw IDs and contradictory copy.
- [ ] **L26.2** Edit tutorial/help, events, inbox, contracts, error recovery and tool descriptions around concrete player decisions.
- [ ] **L26.3** Balance notification density, music transitions, repeated sounds and success/failure feedback through an audible pass; retain quiet map workspaces.
- [ ] **L26.A1** Primary journeys contain no misleading numbers, unresolved placeholders or unexplained jargon.
- [ ] **L26.A2** Audio respects settings and route ownership across startup, navigation and resume without clipping or repetitive spam.
- [ ] **L26.A3** Claims in help, UI and store copy agree with the candidate's implemented behavior.

Recorded evidence: [L26-REPORT.md](evidence/L26-REPORT.md), [L26-EDITORIAL.md](evidence/L26-EDITORIAL.md), [L26-content-inventory.json](evidence/L26-content-inventory.json), [L26-tests.json](evidence/L26-tests.json), [L26-acceptance-cases.csv](evidence/L26-acceptance-cases.csv), [L26-http-smoke.json](evidence/L26-http-smoke.json)

## L27 — Measure and improve real performance

Recorded status: **partial** · required · Dependencies: L04, L14, L23 · [Master prompt](prompts/L27.md)

- [ ] **L27.1** Capture startup, navigation latency, long tasks, week-tick duration, match playback, save time, memory and asset cost on named minimum/recommended hardware and seeded small/late careers.
- [ ] **L27.2** Profile the real production Electron package and browser worker, distinguishing compute, rendering, storage and asset loading.
- [ ] **L27.4** Define an evidence-based budget table and sustained-play regressions; treat suggested input acknowledgement under 100 ms and smooth 60 Hz UI on target hardware as proposed targets, not measured claims.
- [ ] **L27.A1** Baseline and candidate measurements use the same machine, scenario, build settings and sample method.
- [ ] **L27.A2** Accepted budgets are met for ordinary and late-career scenarios; long tasks show truthful progress and do not freeze controls.
- [ ] **L27.A3** A sustained session and repeated map/route changes show no unbounded memory, timer or event-listener growth.

Recorded evidence: [L27-REPORT.md](evidence/L27-REPORT.md), [L27-comparison.json](evidence/L27-comparison.json), [L27-BUDGETS.md](evidence/L27-BUDGETS.md), [L27-acceptance-cases.csv](evidence/L27-acceptance-cases.csv), [L27-tests.json](evidence/L27-tests.json)

## L28 — Run a management and simulation balance campaign

Recorded status: **partial** · required · Dependencies: L13, L15, L16, L17, L18, L19, L20, L21, L27 · [Master prompt](prompts/L28.md)

- [ ] **L28.2** Evaluate player development/decline, transfer prices, salaries, AI solvency, tournament competitiveness, sponsor scaling, injury/fatigue if enabled and roster replenishment.
- [ ] **L28.3** Run paired decision experiments and at least the proposed 30 seeds over ten seasons in the extended campaign; retain failures and intermediate saves rather than averaging them away.
- [ ] **L28.4** Combine distributions with human playtest feedback so dominant exploits and tedious optimal play are removed without scripting guaranteed outcomes.
- [ ] **L28.A1** No NaN/infinite values, dead seasons, impossible ownership or inexhaustible money loops occur in the accepted campaign.
- [ ] **L28.A2** Multiple viable organizational and tactical strategies have documented strengths, costs and counterplay.
- [ ] **L28.A3** Tuning changes have a before/after distribution report with sample size, uncertainty and stated design targets.

Recorded evidence: [L28-REPORT.md](evidence/L28-REPORT.md), [L28-summary.json](evidence/L28-summary.json), [L28-CAMPAIGN-PROTOCOL.md](evidence/L28-CAMPAIGN-PROTOCOL.md), [L28-acceptance-cases.csv](evidence/L28-acceptance-cases.csv), [L28-tests.json](evidence/L28-tests.json)

## L29 — Finish community imports and optional Workshop

Recorded status: **partial** · required · Dependencies: L03, L07, L08 · [Master prompt](prompts/L29.md)

- [ ] **L29.2** Validate archive/path/media/data boundaries, compatibility, missing references and safe failure; never execute imported code as part of ordinary content import.
- [ ] **L29.3** Provide preview, attribution, backup, rollback, clear precedence and clean unmodded fallback without altering unrelated careers.
- [ ] **L29.4** If Workshop is claimed for launch, test subscribe/update/unsubscribe and offline behavior using an authorized Steam test environment; otherwise hide unfinished controls and remove the claim.
- [ ] **L29.A1** Malformed, oversized or incompatible imports fail without save loss or arbitrary filesystem access.
- [ ] **L29.A2** Installing/removing a supported package has a reproducible and reversible outcome.
- [ ] **L29.A3** The release explicitly chooses verified Workshop support or exclusion; optional status is not a silent exemption for advertised features.

Recorded evidence: [L29-REPORT.md](evidence/L29-REPORT.md), [L29-tests-final.txt](evidence/L29-tests-final.txt), [L29-native-ipc.json](evidence/L29-native-ipc.json), [L29-mod-preflight.txt](evidence/L29-mod-preflight.txt), [L30-REPORT.md](evidence/L30-REPORT.md)

## L30 — Validate Steam identity, Cloud, achievements and stats

Recorded status: **partial** · required · Dependencies: L03, L05, L07, L19, L20, L31 · [Master prompt](prompts/L30.md)

- [ ] **L30.1** Confirm the real App ID, app ownership, launch configuration and feature definitions against an authorized Steamworks export; do not infer account settings from local files.
- [ ] **L30.2** Test achievement IDs/conditions/idempotency, stats, leaderboards if promised, rich presence, overlay and offline-to-online recovery through the real Steam client.
- [ ] **L30.3** Exercise local-only/cloud-only/conflicting/corrupt saves, two devices, different Steam users, clock skew, cloud failure and retry with retained backups.
- [ ] **L30.4** Keep local progression functional when Steam is unavailable and ensure account/career scope is correct; use deliberate tested conflict choices instead of silent destructive overwrite.
- [ ] **L30.A1** Real client tests on the candidate verify every advertised Steam feature and record App ID/build identity.
- [ ] **L30.A2** Two-machine cloud scenarios retain a recoverable copy and never leak one user's career into another account.

Recorded evidence: [L30-REPORT.md](evidence/L30-REPORT.md), [L30-steam-readonly.json](evidence/L30-steam-readonly.json), [L30-native-ipc.json](evidence/L30-native-ipc.json), [L30-tests.json](evidence/L30-tests.json), [L30-mod-smoke.json](evidence/L30-mod-smoke.json)

## L31 — Produce and test the actual Windows shipping artifact

Recorded status: **failed** · required · Dependencies: L03, L05, L06, L07, L08, L25 · [Master prompt](prompts/L31.md)

- [ ] **L31.1** Produce a fresh electron-builder artifact with the correct executable, runtime/native dependencies, licensed assets and notices; record source/lockfile/artifact hashes.
- [ ] **L31.2** Verify the exact depot content root and launch executable, including the historical wrong-archive/wrong-executable failure class; do not upload source trees.
- [ ] **L31.3** Exercise install, first launch, no Node/dev server installed, offline play, clean Windows account, non-ASCII paths, update, uninstall/reinstall and save retention.
- [ ] **L31.4** Test all declared OS/GPU/scaling targets and document signing/reputation behavior; omit unverified platforms from release claims.
- [ ] **L31.A1** The actual artifact passes ship:verify and launches via Steam and directly in the supported offline mode.
- [ ] **L31.A2** A clean-machine play/save/restart/update journey succeeds without development dependencies or lost careers.
- [ ] **L31.A3** The packaged files and launch configuration are the same candidate later tested and submitted.

Recorded evidence: [ship-artifact.txt](evidence/ship-artifact.txt)

## L32 — Prepare a truthful Steam store and launch campaign

Recorded status: **unverified** · required · Dependencies: L01, L08, L22, L25, L26 · [Master prompt](prompts/L32.md)

- [ ] **L32.1** Draft final positioning, short/long description, feature list, screenshots, gameplay trailer, capsules, system requirements and support links from the accepted build.
- [ ] **L32.2** Reconcile actual Steamworks feedback with the confirmed Windows 1.0 release; replace outdated Early Access claims in local drafts and record required account-side changes.
- [ ] **L32.3** Prepare content/AI disclosures, ratings, languages, pricing/package decisions, release timing and store/build review checklists using current official guidance.
- [ ] **L32.4** Create a practical wishlist/playtest/demo/community schedule with measurable learning goals; prepare outreach drafts but send or publish only when authorized.
- [ ] **L32.A1** Every screenshot/feature/platform/language claim can be demonstrated in the candidate and has approved provenance.
- [ ] **L32.A2** Store and build review evidence, timing prerequisites and account-owned decisions are recorded rather than presumed passed.
- [ ] **L32.A3** Marketing assets show actual gameplay and the launch calendar includes review/rework time without inventing a guaranteed release date.

## L33 — Run external playtests and the full acceptance matrix

Recorded status: **unverified** · required · Dependencies: L22, L24, L26, L27, L28, L31, L30 · [Master prompt](prompts/L33.md)

- [ ] **L33.1** Run every launch route and overlay through happy, empty, loading, error, stale-data, keyboard, scale and reload cases, with separate developmental-route exclusions.
- [ ] **L33.2** Recruit an authorized pilot cohort of management-sim newcomers and experienced players; observe onboarding, meaningful choices, match comprehension and willingness to continue.
- [ ] **L33.3** Test multi-hour and multi-season sessions, crashes, bad imports, offline play and low-end hardware using the actual candidate.
- [ ] **L33.4** Triage feedback into reproducible defects, balance issues and preferences; fix release blockers and retest the affected journeys.
- [ ] **L33.A1** No unresolved save-loss, startup, progression, result-integrity or essential-control blocker remains.
- [ ] **L33.A2** All launch routes have build-linked evidence; pilot completion/clarity targets are reported with cohort size and actual results.
- [ ] **L33.A3** A clean candidate survives a full career loop and representative extended sessions with a tested recovery path.

## L34 — Make release gates reproducible and honest

Recorded status: **partial** · required · Dependencies: L02, L06, L07 · [Master prompt](prompts/L34.md)

- [ ] **L34.2** Fix audit coverage gaps: scanner completion must not print as acceptance; include map-studio assets, public/maps, inline art, packaged notices and actual file inclusion where relevant.
- [ ] **L34.3** Keep accepted exceptions specific, reviewed and expiring; never refresh baselines simply to make a failing release pass.
- [ ] **L34.4** Record exact source snapshot, lockfile, toolchain, environment and artifact identity so results from one build cannot certify another; document expensive extended gates separately.
- [ ] **L34.A2** A freshly packaged artifact has a manifest connecting its bytes to the tested source and dependency graph.

Recorded evidence: [steam-ready.json](evidence/steam-ready.json), [compliance.json](evidence/compliance.json), [AUDIT-DELTA.md](AUDIT-DELTA.md), [L34-REPORT.md](evidence/L34-REPORT.md)

## L35 — Prepare support, diagnostics and safe updates

Recorded status: **open** · required · Dependencies: L03, L30, L31, L34 · [Master prompt](prompts/L35.md)

- [ ] **L35.1** Prepare support contact, known issues, troubleshooting, version/build display, safe diagnostic export and save-backup instructions.
- [ ] **L35.2** Define severity, reproduction templates and ownership for crashes, save failures, gameplay blockers, balance and ordinary feedback without collecting unnecessary private data.
- [ ] **L35.3** Prepare a tested hotfix, rollback and save-compatibility procedure with the previous good depot/artifact retained.
- [ ] **L35.4** Draft first-week monitoring and communication schedules, patch notes and incident responses; account for Steam reviews respectfully without manipulating them.
- [ ] **L35.A1** A tester can produce a useful redacted report with build, scenario and recovery data.
- [ ] **L35.A2** A rollback drill restores the intended binary while preserving compatible user saves or explaining a safe migration boundary.
- [ ] **L35.A3** Support and update procedures name concrete artifacts, responsible actions and stopping conditions.

## L36 — Assemble the release decision and owner handoff

Recorded status: **open** · required · Dependencies: L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28, L29, L30, L31, L32, L33, L34, L35 · [Master prompt](prompts/L36.md)

- [ ] **L36.1** Review every required package against its evidence and every conditional feature against the signed-off scope; do not count a prompt, code file or mock test as completion.
- [ ] **L36.2** Freeze the accepted artifact and assemble source/artifact hashes, gate outputs, rights disposition, supported targets, store/build approvals and known issues.
- [ ] **L36.3** Resolve all P0/P1 failures and record explicit bounded lower-severity deferrals with player impact and follow-up; do not derive a fake readiness percentage.
- [ ] **L36.4** Prepare the concrete release checklist and public communication for the owner; perform external submission/publication only within explicit authorization and applicable tool rules.
- [ ] **L36.A1** Every launch claim is supported by the exact candidate and every required gate is passed, not merely scheduled.
- [ ] **L36.A2** No missing executable, unresolved distribution rights, data-loss fault or unverified advertised feature is waived as polish.
- [ ] **L36.A3** The owner receives a reviewable GO/NO-GO report, exact artifact, rollback plan and the remaining account-side actions.
