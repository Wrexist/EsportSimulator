# Launch checklist: Windows 1.0

Current known backlog: 36 packages, 144 implementation tasks, 108 acceptance criteria. All completion boxes begin unchecked because the broader launch acceptance has not been established. **Partial** means some supporting implementation exists, not that it should be rewritten. **Failed** means a fresh check failed; **unverified** means runtime/ownership/acceptance evidence is missing; **open** means the deliverable is not yet established. These are work states, not severity ratings or progress percentages.

Scope and critical paths: [README](README.md). Exact prompts: [MASTER-PROMPTS](MASTER-PROMPTS.md). Machine-readable status: [backlog.json](backlog.json). Update the JSON and this checklist together when accepting work.

## L01 — Define the launch promise and management identity

**verified · required** · Depends: None · [Master prompt](prompts/L01.md)

- [x] **L01.1** Record the confirmed Windows 1.0 scope, supported inputs/languages and target player; reconcile older Early Access material as historical context.
- [x] **L01.2** Define the decision loop: assess squad and cash, choose a constrained plan, prepare a match, observe consequences, adapt next week.
- [x] **L01.3** Specify shared meanings for OVR, scouting confidence, booked cash versus forecast, dates and training capacity; map each to one source of truth.
- [x] **L01.4** Separate launch commitments from optional ambitions; keep fictional team names, 2D radar, quiet Map Studio and restrained glass styling.

Acceptance:

- [x] **L01.A1** Every store promise maps to an implemented behavior and an acceptance case.
- [x] **L01.A2** A ten-minute product brief explains three meaningful tradeoffs and why a player would return for another season.
- [x] **L01.A3** Unconfirmed hardware, input/language scope, price and content rights are recorded as decisions, not silently treated as settled.

## L02 — Create reproducible careers and evidence fixtures

**partial · required** · Depends: L01 · [Master prompt](prompts/L02.md)

- [x] **L02.1** Create deterministic first-week, weak-club, strong-club, cash-crisis, roster-shortage, season-boundary and late-career fixtures without private user data.
- [x] **L02.2** Record seed, build identity, schema version, scenario steps, expected results and reset procedure for each fixture.
- [x] **L02.3** Maintain real browser acceptance for new career, recruit/train, match, next week, save, close and reload; keep test storage separate.
- [ ] **L02.4** Add failure injection at the actual persistence and worker boundaries; preserve historical fixtures as compatibility inputs.

Acceptance:

- [x] **L02.A1** Fixture setup is repeatable and cannot overwrite a user's career or map draft.
- [x] **L02.A2** The core journey runs through real application actions, not only mocked helpers.
- [ ] **L02.A3** Each failed acceptance case produces a reproducible report and retained last-good save.

## L03 — Finish save, migration and recovery trust

**partial · required** · Depends: L02 · [Master prompt](prompts/L03.md)

- [x] **L03.1** Inventory every durable field, including custom tactics, pending activities, in-progress matches, board state and newly added simulation data; classify device preferences and transient state separately.
- [ ] **L03.2** Complete serializer/default/migration coverage across all supported save versions and career switching; do not assume an optional TypeScript field persists.
- [ ] **L03.3** Exercise disk/quota failure, corrupted primary with valid backup, failed migration, interrupted commit, duplicate Save and crash during next week using the actual adapters.
- [ ] **L03.4** Keep last-good data and make processing, saving, saved and retry states truthful; ensure ledger, rewards and week completion are applied exactly once.

Acceptance:

- [ ] **L03.A1** Declared durable state round-trips through each real save path and a fresh process.
- [ ] **L03.A2** Faults never silently replace a valid save with invalid data or report a failed write as saved.
- [ ] **L03.A3** Recovery and older-save behavior are verified in both browser storage and the packaged application.

[L03 execution report](evidence/L03-REPORT.md) — release acceptance remains open.

## L04 — Prove deterministic simulation and worker ownership

**partial · required** · Depends: L02, L03 · [Master prompt](prompts/L04.md)

- [x] **L04.1** Reverify the existing request correlation, timeout termination, captured input/seed and compute-only worker/fallback before changing them.
- [x] **L04.2** Compare repeated runs through the actual application coordinator, including reloads and worker failure, and isolate cosmetic randomness from gameplay RNG.
- [x] **L04.3** Extract orchestration only where it clarifies computation, reconciliation and the single durable commit; retain current working contracts.
- [x] **L04.4** Version deterministic replay inputs and define which metadata timestamps are intentionally excluded from equality checks.

Acceptance:

- [ ] **L04.A1** Worker, fallback and resumed runs agree on canonical match, economy, progression and RNG fields.
- [ ] **L04.A2** Late results, concurrent requests and failure after computation cannot double-advance the week.
- [ ] **L04.A3** The compiled worker boots without browser globals and cannot initialize durable storage.

[L04 execution report](evidence/L04-REPORT.md) — implementation evidence recorded; release acceptance remains open.

## L05 — Complete preferences, audio, exit and desktop lifecycle

**partial · required** · Depends: L03, L04 · [Master prompt](prompts/L05.md)

- [x] **L05.1** Test autosave, manual save, close during a tick, slow disk, retry, cancel, force-close choice and remount with the shared lifecycle.
- [x] **L05.2** Finish preference ownership and migration across all settings surfaces; show reset scope and distinguish career choices from device settings.
- [ ] **L05.3** Keep Map Studio and nested lab pages silent, honor stored volume before first interaction, and verify menu/match scene changes and background-window behavior.
- [ ] **L05.4** Verify fullscreen, display scaling, window resize, minimize/restore, sleep/resume and single-instance behavior on the supported desktop target.

Acceptance:

- [ ] **L05.A1** Canceling close leaves the app usable and autosave active, with no duplicate timers or handlers.
- [ ] **L05.A2** Muted starts and studio clicks stay quiet; settings persist across restart and agree across screens.
- [ ] **L05.A3** Native close/cancel/slow-save behavior is exercised in the packaged build, not inferred from helper tests.

[L05 execution report](evidence/L05-REPORT.md) — implementation evidence recorded; release acceptance remains open.

## L06 — Resolve dependency and runtime security findings

**partial · required** · Depends: L02 · [Master prompt](prompts/L06.md) · [Execution evidence](evidence/L06-REPORT.md)

- [ ] **L06.1** Triage all 47 recorded advisories and the seven production findings against runtime reachability, build tools and the shipped dependency tree.
- [x] **L06.2** Use primary vendor/advisory sources to select supported versions; upgrade in reviewable groups with migration notes, rather than applying force fixes blindly.
- [ ] **L06.3** Recheck Next worker compilation, Electron/native module compatibility, save migration and offline startup after each relevant update.
- [x] **L06.4** Record resolved findings and evidence-backed dispositions; do not suppress scans or claim every transitive advisory is a demonstrated exploit.

Acceptance:

- [ ] **L06.A1** No reachable critical/high release vulnerability remains without a concrete mitigation verified on the candidate.
- [ ] **L06.A2** The resolved dependency graph is reproducible from the lockfile and the actual packaged tree is audited.
- [ ] **L06.A3** Affected regression suites, clean type checks, production worker and packaged startup pass after upgrades.

## L07 — Harden Electron, IPC and local boundaries

**partial · required** · Depends: L06 · [Master prompt](prompts/L07.md) · [Execution evidence](evidence/L07-REPORT.md)

- [x] **L07.1** Inventory every IPC channel, its sender validation, schema, bounds, return contract and filesystem authority, including storage, mods, logs, window and GPU settings.
- [x] **L07.2** Keep context isolation, sandboxing, web security and loopback-only serving; enforce exact trusted origin/frame checks and deny unexpected navigation/new windows.
- [x] **L07.3** Test traversal, symlinks where applicable, malformed payloads, oversized imports, untrusted URLs and renderer-origin requests against actual handlers.
- [x] **L07.4** Review CSP exceptions against the production runtime; remove only exceptions proven unnecessary, retaining working worker and asset loading.

Acceptance:

- [ ] **L07.A1** An untrusted frame cannot read/write saves, clear storage, access arbitrary paths or change privileged settings.
- [ ] **L07.A2** Invalid inputs fail safely without crashing or altering unrelated files.
- [ ] **L07.A3** A packaged security smoke run documents navigation, IPC and local-port behavior with real Electron.

## L08 — Establish content provenance and distribution rights

**partial · required** · Depends: L01 · [Master prompt](prompts/L08.md)

- [x] **L08.1** Inventory every shipped map/radar/mesh, logo, portrait, font, sound, database, text and lineup reference with source, license/permission, attribution, allowed use and release inclusion.
- [x] **L08.2** Review current imported geometry and reference artwork separately from user-authored annotations; public availability and fictional names do not establish distribution rights.
- [ ] **L08.3** Reconcile historical Steam feedback with the current build/store evidence; prepare original replacements or explicit distribution permission where needed.
- [ ] **L08.4** Resolve the strict scan's source-reference finding accurately and expand review beyond public/assets; never rename files or widen allowlists merely to conceal unresolved ownership.

Acceptance:

- [ ] **L08.A1** Every included asset has a documented release disposition and required attribution is actually packaged.
- [ ] **L08.A2** Unresolved third-party content is replaced or deliberately excluded from the shipping artifact while user drafts remain backed up.
- [ ] **L08.A3** Store screenshots, trailers and generated player-facing content have the same provenance review as game assets.

[L08 execution report](evidence/L08-REPORT.md) — release acceptance remains open.

## L09 — Register map annotations, spawns and plant zones

**partial · required** · Depends: L02, L08 · [Master prompt](prompts/L09.md)

- [x] **L09.1** Preserve the 142-mark Mirage upload byte-for-byte; identify A/B plant polygons, spawn areas and unresolved user notes without asserting unreviewed geometry is correct.
- [x] **L09.2** Define versioned coordinate registration between annotation radars and world-space references, including floor/height identity and confidence/provenance.
- [x] **L09.3** Create validation for polygon closure, intersections, blocked spawn points, connected exits and reachable plant zones; add explicit links for reviewable height transitions.
- [x] **L09.4** Make registration, import, correction, undo, backup, export and release inclusion visible in Map Studio, with a clear draft-to-validated workflow.

Acceptance:

- [ ] **L09.A1** Mirage spawn and plant zones align with the reviewed reference and never place a body in a solid or wrong floor.
- [x] **L09.A2** A saved/imported project retains registration and validation status without changing the original attachment.
- [x] **L09.A3** Every supported release map has a coverage sheet, or is explicitly excluded from the launch map pool.

Evidence: [L09 execution and remaining acceptance](evidence/L09-REPORT.md). Package remains partial. [Mirage v12 follow-up](evidence/MIRAGE-V12-REPORT.md): 169 original marks preserved, ten reference routes checked; manual acceptance remains open.

## L10 — Implement credible movement and vertical traversal

**partial · required** · Depends: L04, L09 · [Master prompt](prompts/L10.md)

- [x] **L10.1** Extend the current fixed-step movement and directed navigation without losing continuous time across tile boundaries or collision stopping.
- [ ] **L10.2** Implement supported-body clearance and floor support, turning, acceleration, stopping, crouch clearance, stairs, ramps and validated ladders.
- [ ] **L10.3** Add explicit jump/drop arcs, landing validation, one-way edges and blocked-path recovery; do not invent reverse routes or teleport to nearby polygons.
- [ ] **L10.4** Add route smoothing constrained to valid surfaces, congestion/teammate avoidance and inspectable reasons for rejected transitions; calibrate provisional values from measured references.

Acceptance:

- [ ] **L10.A1** Accepted route fixtures never cross solids, unsupported gaps or floors; illegal transitions fail with a reason.
- [ ] **L10.A2** Every enabled traversal has positive, negative and reverse-direction cases plus deterministic replay.
- [ ] **L10.A3** Mirage main rotations and height transitions are manually reviewed before expanding acceptance to the other launch maps.

Evidence: [L10 execution and remaining acceptance](evidence/L10-REPORT.md). Package remains partial. [Mirage v12 follow-up](evidence/MIRAGE-V12-REPORT.md): 169 original marks preserved, ten reference routes checked; manual acceptance remains open.

## L11 — Make perception and shots cause encounter outcomes

**partial · required** · Depends: L04, L10 · [Master prompt](prompts/L11.md)

- [x] **L11.1** Build a bounded controlled encounter before changing full-match generation: facing/FOV, occlusion, visible target acquisition, reaction delay and decaying last-known information.
- [x] **L11.2** Separate what the simulator knows from what each player/team knows; hidden positions must not leak into aim, path decisions or target selection.
- [x] **L11.3** Implement aim turning/error, movement accuracy, burst/recoil, ammo, reload, body/head hit volumes, armor and collision-tested damage with explicit units and provisional weapon data.
- [x] **L11.4** Add a reasoned event timeline for sight, reaction, shot, obstruction, damage and death; outcomes must emerge from these events rather than a preselected winner.

Acceptance:

- [ ] **L11.A1** No direct shot damages through opaque geometry or a different floor without a verified penetration rule.
- [ ] **L11.A2** A hidden or out-of-FOV enemy cannot trigger an omniscient response; reaction/reload windows are exercised.
- [ ] **L11.A3** Seeded duel replays reproduce damage and outcome, including simultaneous-action ordering and interrupted visibility.

Evidence: [L11 controlled encounter](evidence/L11-REPORT.md). The four implementation tasks are scoped to the two-player lab; launch acceptance stays open for L04/L10 dependencies, reviewed geometry and packaged/calibrated evidence.

## L12 — Simulate utility, cover and dynamic obstacles

**partial · required** · Depends: L10, L11 · [Master prompt](prompts/L12.md)

- [x] **L12.1** Model thrown grenade flight, bounce, gravity, fuse, throw mode and landing in world space, retaining source lineup metadata separately from verified trajectories.
- [x] **L12.2** Implement smoke visibility volumes, flash exposure by facing/occlusion, HE cover and distance, fire spread/expiry and meaningful decoys at an explicitly declared fidelity.
- [ ] **L12.3** Add dynamic door/breakable state and material thickness/penetration only where supported by reviewed data; do not treat the decimated visibility mesh as complete physical truth.
- [x] **L12.4** Give the lab throw-to-land replay, target tolerance, bounce editing and checked/draft status, with clear diagnostics when a reference cannot be reproduced.

Acceptance:

- [ ] **L12.A1** Effects respect walls, heights, timing, team inventory and visibility rules; smoke cannot magically fill disconnected rooms.
- [ ] **L12.A2** A reviewed utility test set covers each enabled grenade and every launch map; imports are never auto-certified.
- [ ] **L12.A3** Deterministic validation catches invalid throws, missing geometry, impossible trajectories and expired effects.

Evidence: [L12 utility lab](evidence/L12-REPORT.md). Tasks 1/2/4 are implemented at the declared two-player lab fidelity. Dynamic entities/materials, L10/L11 dependencies, reviewed all-map lineups and packaged acceptance remain open.

## L13 — Build tactically intelligent teams

**partial · required** · Depends: L11, L12 · [Master prompt](prompts/L13.md)

- [x] **L13.1** Implement readable team and role states for default, entry, support, trade, lurk, anchor, rotate, execute, retake, save and clutch.
- [x] **L13.2** Use team knowledge, communication delay and uncertainty instead of hidden enemy coordinates; parameterize skill through consistent decision/execution rules.
- [ ] **L13.3** Coordinate spacing, angle coverage, trade timing, utility budgets, bomb carrier, plant/defuse deadlines and economy-driven saves.
- [ ] **L13.4** Expose tactical intent and why a plan changed in replay diagnostics; prevent oscillating objectives, crowding, repeated utility waste and stuck loops.

Acceptance:

- [ ] **L13.A1** Teams complete objective scenarios without omniscient rotations, impossible trades or indefinite inactivity.
- [ ] **L13.A2** Role and tactical changes measurably alter behavior under controlled scenarios; stronger settings improve distributions without forced wins.
- [ ] **L13.A3** Timeouts, bomb deadlines, teammate loss and stale information produce explainable replanning.

Evidence: [L13 team lab](evidence/L13-REPORT.md). Role states and delayed evidence policy are implemented in the independent lab. Coordination/congestion breadth, full 5v5 and map calibration, live-match integration and dependencies remain open. All acceptance criteria stay unchecked.

## L14 — Connect the spatial engine to authoritative matches

**partial · required** · Depends: L03, L04, L13 · [Master prompt](prompts/L14.md)

- [ ] **L14.1** Replace the winner-first path for the new simulator only after controlled encounters pass, with a versioned compatibility path for existing careers/replays.
- [ ] **L14.2** Make the same event stream drive match results, stats, economy, bomb state and 2D radar; never hide an impossible kill line while retaining its damage.
- [ ] **L14.3** Preserve map ID, floor, side, roster, seed and tactic choices from veto through live/instant/skip/resume/result/history.
- [ ] **L14.4** Keep real-time rendering separate from simulation time so playback speed, pauses or dropped frames cannot change results; profile season simulation cost.

Acceptance:

- [ ] **L14.A1** Live, instant, skipped and resumed versions of the same scenario agree on canonical result and events.
- [ ] **L14.A2** Veto-selected maps persist through every match view, fixing any reproduced Sandstone/Nuke mismatch.
- [ ] **L14.A3** No match commits duplicate rewards, player stats or results, and old saves remain loadable with explicit engine versioning.

Evidence: [L14 implementation and remaining acceptance](evidence/L14-REPORT.md). Versioned spatial round replay and compatibility-path veto, checkpoint and commit fixes are implemented. Full career stream integration, packaged recovery, 5v5/map/calibration dependencies and season performance remain open. All acceptance criteria stay unchecked.

## L15 — Unify finances, budgets and contract consequences

**partial · required** · Depends: L03, L04 · [Master prompt](prompts/L15.md)

Implementation evidence: [L15 report](evidence/L15-REPORT.md), [Windows finance runtime](evidence/L15-finance-runtime.json). Recurring receipts, reconciled academy/payroll, dated staff expiry, conditional player bonuses and contract/forecast checks implemented. Cross-surface, long-career and packaged acceptance remain open.

- [ ] **L15.1** Trace all wages, transfers, signing bonuses, prizes, sponsors, loans if present, facilities and equipment through one ledger and forecast contract.
- [ ] **L15.2** Show recurring commitments, conditional revenue, one-off costs, affordability and runway consistently before decisions and after settlement.
- [ ] **L15.3** Test renewals, releases, cash shortfalls, delayed/conditional payments, replayed transactions and season boundaries.
- [ ] **L15.4** Keep risk/reward choices meaningful; remove infinite money loops without punishing ordinary save/reload or adding anti-refund gameplay.

Acceptance:

- [ ] **L15.A1** Every controlled cash delta reconciles to a unique ledger entry and all screens agree on labeled totals.
- [ ] **L15.A2** Contracts cannot be signed twice, exceed enforceable constraints silently or charge without delivering the agreed state.
- [ ] **L15.A3** Healthy and distressed clubs remain playable or reach clearly telegraphed failure through documented rules.

## L16 — Finish squad, recruitment, scouting and transfer AI

**partial · required** · Depends: L04, L15 · [Master prompt](prompts/L16.md)

Implementation and current limitations: [L16 report](evidence/L16-REPORT.md). Recruitment/scouting safeguards and comparison are implemented; three repeated synthetic finance scenarios now remain solvent after upkeep-aware investment checks. Full-career financial viability and broader eligibility remain open. See also [L17 follow-up](evidence/L17-REPORT.md).

- [ ] **L16.1** Reconcile OVR and role fit across squad, scouting, comparison, eligibility and negotiation, preserving intentionally hidden information.
- [ ] **L16.2** Complete offers, counteroffers, renewals, expiry, poaching, free agents, roster registration, bench/release and cancellation paths already supported by the design.
- [ ] **L16.3** Make AI recruitment respond to needs, finances, age, roles, reputation and contract availability under the same constraints as the player.
- [ ] **L16.4** Explain uncertainty, wages, buyouts, team fit and competition eligibility before commitment; prevent retired, duplicated or already-owned signings.

Acceptance:

- [ ] **L16.A1** A player can scout, compare, negotiate, sign and field an eligible player through the full UI and after reload.
- [ ] **L16.A2** AI teams maintain viable rosters and finances over long careers without magical transfers.
- [ ] **L16.A3** Every stale/invalid offer has a recoverable explanation; no hidden-attribute leakage through alternate screens.

## L17 — Make development, training and academy choices matter

**partial · required** · Depends: L04, L16 · [Master prompt](prompts/L17.md)

Evidence: [L17 follow-up report](evidence/L17-REPORT.md). 1,511 tests and production build pass; cohort and repeated ten-season lifecycle checks pass within the documented fixture. UI acceptance, full-world player supply/economy and dependencies remain open; acceptance is not checked off.

- [ ] **L17.1** Audit actual training slots, capacity, daily/weekly timing, fatigue, recovery, morale and staff/facility modifiers against what the UI promises.
- [ ] **L17.2** Define age/potential/development/decline and scouting uncertainty so specialists, prospects and veterans create different viable plans.
- [ ] **L17.3** Complete academy ownership, prospect recruitment, promotion, loans if supported and long-run player supply without duplicate player records.
- [ ] **L17.4** Show projected tradeoffs and weekly evidence of change; avoid unlimited passive stat growth, schedule overlap and misleading empty slots.

Acceptance:

- [ ] **L17.A1** Training effects are reachable through real scheduling actions and match the displayed constraints.
- [ ] **L17.A2** Aging, retirement, academy replenishment and promotion stay finite and ownership-safe across ten seasons.
- [ ] **L17.A3** At least three distinct training plans produce the intended tradeoffs across a seeded cohort, not just different text.

## L18 — Give staff, sponsors, facilities and equipment clear value

**partial · required** · Depends: L15, L17 · [Master prompt](prompts/L18.md)

Evidence: [L18 report](evidence/L18-REPORT.md). 1,519 tests, production build, native worker checks and repeated 52-week organization scenarios pass. Browser, remaining flows, full-world balance and dependencies remain open; no broad acceptance criterion is marked complete.

- [ ] **L18.1** Verify each hire, upgrade and sponsorship has an implemented benefit, recurring cost, activation time, capacity and cancellation/expiry rule.
- [ ] **L18.2** Connect organizational investments to training, scouting, morale, commercial outcomes or preparation through bounded documented effects.
- [ ] **L18.3** Align preview numbers with settlement and performance selectors; expose prerequisites and opportunity costs instead of decorative purchase screens.
- [ ] **L18.4** Test repeated purchases, replacement, bankruptcy, contract renewal and unavailable offers; remove or clearly exclude nonfunctional launch options.

Acceptance:

- [ ] **L18.A1** No paid action takes cash without delivering its advertised effect and every ongoing cost is ledgered.
- [ ] **L18.A2** A cheaper alternative remains rational for some clubs; stacking cannot produce runaway bonuses.
- [ ] **L18.A3** All organization flows save/load correctly and their benefits are visible in a controlled before/after scenario.

## L19 — Validate calendar, tournaments, qualification and rankings

**partial · required** · Depends: L04, L15 · [Master prompt](prompts/L19.md)

- [ ] **L19.1** Verify every declared format and supported field size, byes, tiebreakers, brackets, map series, qualification, seeding and terminal completion.
- [ ] **L19.2** Use shared calendar helpers for days, weeks, seasons, contract dates and historical fixtures; resolve overlaps and rollover correctly.
- [ ] **L19.3** Award trophies, prize money, circuit points and qualification exactly once, then propagate consistent results to schedule, inbox, rankings and history.
- [ ] **L19.4** Ensure AI-only fixtures and unavailable player teams progress the world without softlocks; distinguish implemented formats from labels that fall back.

Acceptance:

- [ ] **L19.A1** All launch tournament formats finish through actual scheduled progression with correct entrants and winners.
- [ ] **L19.A2** No team appears twice, receives duplicate byes/rewards or advances from an unresolved result.
- [ ] **L19.A3** Multi-season calendars and rankings remain coherent after save/reload, job changes and eliminated player teams.

## L20 — Make long careers coherent and memorable

**partial · required** · Depends: L16, L17, L18, L19 · [Master prompt](prompts/L20.md)

- [ ] **L20.1** Connect board expectations, manager reputation, morale, chemistry, rivalry, inbox decisions and season recaps to actual outcomes and bounded consequences.
- [ ] **L20.2** Verify jobs, club switches, sacking, bankruptcy, recovery/new-career paths and historical records do not leak state between clubs or careers.
- [ ] **L20.3** Create a curated set of situation-driven stories with variation, cooldowns and meaningful choices; avoid repetitive inbox spam and cosmetic choices presented as mechanical.
- [ ] **L20.4** Maintain records, legends, trophies, FPL and academy histories where shipped, using one authoritative result source and bounded storage.

Acceptance:

- [ ] **L20.A1** A full career can cross promotions, losses, job changes and season reviews without stalled progression or duplicated story rewards.
- [ ] **L20.A2** Important consequences are telegraphed and the player can explain why their board, squad or finances changed.
- [ ] **L20.A3** Ten-season fixtures preserve coherent rosters, history and manageable notification volume.

## L21 — Make match management offer real agency

**partial · required** · Depends: L14, L16, L19 · [Master prompt](prompts/L21.md)

Implementation and controlled verification: [L21 report](evidence/L21-REPORT.md). 1,553 tests, production/native-worker checks and paired match audit pass. Full UI/5v5/calibration acceptance remains open; criteria below remain unchecked.

- [ ] **L21.1** Complete the preparation-to-result loop with valid lineup, roles, map veto, economy plan, tactical intentions and clear costs or limits for intervention.
- [ ] **L21.2** Make timeouts and mid-match instructions affect simulation decisions through bounded rules with feedback, not an unexplained guaranteed win boost.
- [ ] **L21.3** Support watch, pause, speed, skip, interruption and resume consistently; explain momentum, utility, damage and decisive tactical moments at an appropriate level.
- [ ] **L21.4** Link post-match analysis to practical next actions in training, recruitment and tactics; make defeat informative without exposing omniscient opponent data.

Acceptance:

- [ ] **L21.A1** A manager has meaningful pre-match and permitted live decisions whose effects are demonstrable in paired scenarios.
- [ ] **L21.A2** Every BO1/3/5 path, stale fixture, back navigation and resume preserves map and lineup contracts.
- [ ] **L21.A3** Players can identify what happened and choose a relevant response from the result screen.

## L22 — Rebuild onboarding and the first session

**partial · required** · Depends: L01, L16, L17, L21 · [Master prompt](prompts/L22.md)

Implementation and controlled verification: [L22 report](evidence/L22-REPORT.md). 1,560 tests and production/isolated real-store checks pass. Browser acceptance and the 10-of-12 fresh-player test remain open; participants tested: 0.

- [ ] **L22.1** Guide new players through a valid club choice, squad assessment, budget constraint, one training/recruitment decision and the first match.
- [ ] **L22.2** Reduce front-loaded exposition; reveal useful information when a decision needs it and keep the next action prominent.
- [ ] **L22.3** Provide honest difficulty/eligibility explanations, contextual help, skippable/replayable tutorial and recovery from abandoned setup.
- [ ] **L22.4** Test with new players using a scripted observation protocol; capture confusion and time-to-first-meaningful-decision rather than relying on developer familiarity.

Acceptance:

- [ ] **L22.A1** At least 10 of 12 proposed fresh-player testers complete the defined first-session objective without facilitator rescue; record actual results before claiming this gate passes.
- [ ] **L22.A2** All tutorial steps correspond to reachable controls and can be skipped or replayed without corrupting progress.
- [ ] **L22.A3** Dashboard priorities remain useful after onboarding instead of permanently displaying introductory clutter.

## L23 — Apply one polished interface across all routes

**partial · required** · Depends: L05, L22 · [Master prompt](prompts/L23.md)

Implementation: [L23 report](evidence/L23-REPORT.md). Shared UI bounds/density, compact headings, career-scoped list controls and main-panel scroll restoration implemented; 1,571 tests and production build pass. [40-route source triage](evidence/L23-ROUTE-REVIEW.md) and 150 NOT_RUN UI cases recorded. Visual/interaction and dependency acceptance remain open.

- [ ] **L23.1** Use the existing glass shell and shared primitives; establish readable type, spacing, density, table, form, modal, loading, empty and error standards.
- [ ] **L23.2** Audit every route in ROUTE-MATRIX.md and each important modal/overlay, including map tools, without replacing working domain code for visual reasons.
- [ ] **L23.3** Make navigation immediate, preserve relevant filters/scroll, support back/forward and contextual return, and clarify desktop/inbox behavior.
- [ ] **L23.4** Split oversized components only along real responsibilities, removing proven duplicate paths and keeping dense data surfaces free of expensive layered blur.

Acceptance:

- [ ] **L23.A1** All required actions are visible and usable at 1024x640, 1280x720 and 1440x900 plus declared OS scaling.
- [ ] **L23.A2** Representative dashboard/table/form/modal/match screens pass a consistent visual review with no clipped controls or broken loading/error states.
- [ ] **L23.A3** Every claimed launch route has an accepted screenshot and interaction case; development-only pages are explicitly gated.

## L24 — Finish accessibility, input and localization readiness

**partial · required** · Depends: L23 · [Master prompt](prompts/L24.md)

Implementation: [L24 report](evidence/L24-REPORT.md). Scoped modal focus, named controls, keyboard map-coordinate workflows, startup contrast preferences, confetti motion guards and English-only readiness fixes implemented. 1,589 tests and production build pass. [Input/language scope](evidence/L24-INPUT-LANGUAGE-SCOPE.md) records 42 NOT_RUN cases; all real input/display/language acceptance and L23 dependency evidence remain open.

- [ ] **L24.1** Complete keyboard-only journeys, semantic labels, focus order, modal Escape/focus return, error announcements and alternatives to pointer-only map interactions.
- [ ] **L24.2** Make reduced motion effective in CSS, canvas, SVG and radar playback; ensure colors are reinforced by labels/shapes and zoom/scaling stays usable.
- [ ] **L24.3** Define supported keyboard/mouse/controller behavior and test text entry and navigation on each claimed device, including Deck only if promised.
- [ ] **L24.4** Audit font glyphs, string extraction, dates/numbers, text expansion and actual language completeness; ship only verified language claims.

Acceptance:

- [ ] **L24.A1** The core career loop and essential map editing/testing actions are operable without precise pointer use.
- [ ] **L24.A2** Supported zoom, contrast and reduced-motion configurations retain readable information and functional controls.
- [ ] **L24.A3** Every advertised language/input/device has a recorded acceptance pass; controller or Deck badges are not inferred from a browser screenshot.

## L25 — Complete original team identities and asset delivery

**partial · required** · Depends: L08, L23 · [Master prompt](prompts/L25.md)

Implementation: [L25 report](evidence/L25-REPORT.md). 198 inventoried; 3 retained + 12 new studies, 183 shared-family identities remain. 594 exports verified; 18 identical-pixel groups. 1,595 tests, types/build/worker pass. Visual approval, real UI, packaged delivery and rights remain open.

- [x] **L25.1** Retain fictional team names and inventory the 198 identities; recheck the prior three studies and 195 remaining redesigns before claiming counts are current.
- [ ] **L25.2** Create a coherent but distinct visual identity per team, informed by permitted references and the user's direction without assuming a close recreation is automatically distributable.
- [ ] **L25.3** Validate small crest silhouettes, light/dark contrast, SVG ID isolation, transparent edges, raster fallbacks and custom-upload behavior.
- [ ] **L25.4** Package only approved current assets and generate a searchable contact sheet/manifest with version, source, file size and team mapping.

Acceptance:

- [ ] **L25.A1** Every launch team has one approved identity that remains recognizable at table, profile and match sizes.
- [ ] **L25.A2** No wrong initials, original-name fallback, duplicate SVG IDs, missing references or source-only alternates appear in the shipped artifact.
- [ ] **L25.A3** Asset rights and replacement disposition are resolved under 08 before store/media approval.

## L26 — Edit content, terminology, audio and feedback

**partial · required** · Depends: L20, L23, L25 · [Master prompt](prompts/L26.md)

Implementation: [L26 report](evidence/L26-REPORT.md). Finance/contract formatting, truthful income bars and flat Bootcamp XP copy, guide/tooltip edits, audio throttling/scene cleanup and player-content inventory. 1,608 tests, types/build/worker pass. 18 real UI/audio/content cases NOT_RUN; broad editorial and release acceptance remain open.

- [ ] **L26.1** Apply shared terminology and formatters for money, attributes, OVR, dates, percentages and match outcomes; remove placeholders, raw IDs and contradictory copy.
- [ ] **L26.2** Edit tutorial/help, events, inbox, contracts, error recovery and tool descriptions around concrete player decisions.
- [ ] **L26.3** Balance notification density, music transitions, repeated sounds and success/failure feedback through an audible pass; retain quiet map workspaces.
- [x] **L26.4** Maintain an AI-generated player-content inventory for the Steam survey and an editorial review trail; do not equate code-assistance usage with shipped art/audio/narrative.

Acceptance:

- [ ] **L26.A1** Primary journeys contain no misleading numbers, unresolved placeholders or unexplained jargon.
- [ ] **L26.A2** Audio respects settings and route ownership across startup, navigation and resume without clipping or repetitive spam.
- [ ] **L26.A3** Claims in help, UI and store copy agree with the candidate's implemented behavior.

## L27 — Measure and improve real performance

**partial · required** · Depends: L04, L14, L23 · [Master prompt](prompts/L27.md)

- [ ] **L27.1** Capture startup, navigation latency, long tasks, week-tick duration, match playback, save time, memory and asset cost on named minimum/recommended hardware and seeded small/late careers.
- [ ] **L27.2** Profile the real production Electron package and browser worker, distinguishing compute, rendering, storage and asset loading.
- [x] **L27.3** Fix measured hotspots with indexing, bounded logs/caches, memoization, batching and asset loading; avoid speculative rewrites.
- [ ] **L27.4** Define an evidence-based budget table and sustained-play regressions; treat suggested input acknowledgement under 100 ms and smooth 60 Hz UI on target hardware as proposed targets, not measured claims.

Acceptance:

- [ ] **L27.A1** Baseline and candidate measurements use the same machine, scenario, build settings and sample method.
- [ ] **L27.A2** Accepted budgets are met for ordinary and late-career scenarios; long tasks show truthful progress and do not freeze controls.
- [ ] **L27.A3** A sustained session and repeated map/route changes show no unbounded memory, timer or event-listener growth.

Evidence: [L27 report](evidence/L27-REPORT.md). Measured recruitment caching preserves all paired outputs; 1,610 tests, types/build/worker pass. Twelve real performance cases NOT_RUN; target hardware, UI, storage and sustained-play acceptance remain open.

## L28 — Run a management and simulation balance campaign

**partial · required** · Depends: L13, L15, L16, L17, L18, L19, L20, L21, L27 · [Master prompt](prompts/L28.md)

- [x] **L28.1** Build a seed-controlled batch campaign spanning club tiers, difficulty, roster styles, tactical approaches and starting finances.
- [ ] **L28.2** Evaluate player development/decline, transfer prices, salaries, AI solvency, tournament competitiveness, sponsor scaling, injury/fatigue if enabled and roster replenishment.
- [ ] **L28.3** Run paired decision experiments and at least the proposed 30 seeds over ten seasons in the extended campaign; retain failures and intermediate saves rather than averaging them away.
- [ ] **L28.4** Combine distributions with human playtest feedback so dominant exploits and tedious optimal play are removed without scripting guaranteed outcomes.

Acceptance:

- [ ] **L28.A1** No NaN/infinite values, dead seasons, impossible ownership or inexhaustible money loops occur in the accepted campaign.
- [ ] **L28.A2** Multiple viable organizational and tactical strategies have documented strengths, costs and counterplay.
- [ ] **L28.A3** Tuning changes have a before/after distribution report with sample size, uncertainty and stated design targets.

Evidence: [L28 report](evidence/L28-REPORT.md). Staged 30-seed/two-policy small-world ten-season campaign, paired tactics and full-world follow-ups found contract/awards fixes. 1,618 tests, types/build/worker pass. Final full-world extended campaign and ten human/integration cases remain open; acceptance unchecked.

## L29 — Finish community imports and optional Workshop

**partial · conditional** · Depends: L03, L07, L08 · [Master prompt](prompts/L29.md)

- [x] **L29.1** Audit the existing community import and Workshop implementation before adding another format; define supported content, schema, versions and limits.
- [ ] **L29.2** Validate archive/path/media/data boundaries, compatibility, missing references and safe failure; never execute imported code as part of ordinary content import.
- [ ] **L29.3** Provide preview, attribution, backup, rollback, clear precedence and clean unmodded fallback without altering unrelated careers.
- [ ] **L29.4** If Workshop is claimed for launch, test subscribe/update/unsubscribe and offline behavior using an authorized Steam test environment; otherwise hide unfinished controls and remove the claim.

Acceptance:

- [ ] **L29.A1** Malformed, oversized or incompatible imports fail without save loss or arbitrary filesystem access.
- [ ] **L29.A2** Installing/removing a supported package has a reproducible and reversible outcome.
- [ ] **L29.A3** The release explicitly chooses verified Workshop support or exclusion; optional status is not a silent exemption for advertised features.

## L30 — Validate Steam identity, Cloud, achievements and stats

**unverified · required** · Depends: L03, L05, L07, L19, L20, L31 · [Master prompt](prompts/L30.md)

- [ ] **L30.1** Confirm the real App ID, app ownership, launch configuration and feature definitions against an authorized Steamworks export; do not infer account settings from local files.
- [ ] **L30.2** Test achievement IDs/conditions/idempotency, stats, leaderboards if promised, rich presence, overlay and offline-to-online recovery through the real Steam client.
- [ ] **L30.3** Exercise local-only/cloud-only/conflicting/corrupt saves, two devices, different Steam users, clock skew, cloud failure and retry with retained backups.
- [ ] **L30.4** Keep local progression functional when Steam is unavailable and ensure account/career scope is correct; use deliberate tested conflict choices instead of silent destructive overwrite.

Acceptance:

- [ ] **L30.A1** Real client tests on the candidate verify every advertised Steam feature and record App ID/build identity.
- [ ] **L30.A2** Two-machine cloud scenarios retain a recoverable copy and never leak one user's career into another account.
- [x] **L30.A3** Mock or static parity checks remain clearly separate from real Steam evidence.

## L31 — Produce and test the actual Windows shipping artifact

**failed · required** · Depends: L03, L05, L06, L07, L08, L25 · [Master prompt](prompts/L31.md)

- [ ] **L31.1** Produce a fresh electron-builder artifact with the correct executable, runtime/native dependencies, licensed assets and notices; record source/lockfile/artifact hashes.
- [ ] **L31.2** Verify the exact depot content root and launch executable, including the historical wrong-archive/wrong-executable failure class; do not upload source trees.
- [ ] **L31.3** Exercise install, first launch, no Node/dev server installed, offline play, clean Windows account, non-ASCII paths, update, uninstall/reinstall and save retention.
- [ ] **L31.4** Test all declared OS/GPU/scaling targets and document signing/reputation behavior; omit unverified platforms from release claims.

Acceptance:

- [ ] **L31.A1** The actual artifact passes ship:verify and launches via Steam and directly in the supported offline mode.
- [ ] **L31.A2** A clean-machine play/save/restart/update journey succeeds without development dependencies or lost careers.
- [ ] **L31.A3** The packaged files and launch configuration are the same candidate later tested and submitted.

## L32 — Prepare a truthful Steam store and launch campaign

**unverified · required** · Depends: L01, L08, L22, L25, L26 · [Master prompt](prompts/L32.md)

- [ ] **L32.1** Draft final positioning, short/long description, feature list, screenshots, gameplay trailer, capsules, system requirements and support links from the accepted build.
- [ ] **L32.2** Reconcile actual Steamworks feedback with the confirmed Windows 1.0 release; replace outdated Early Access claims in local drafts and record required account-side changes.
- [ ] **L32.3** Prepare content/AI disclosures, ratings, languages, pricing/package decisions, release timing and store/build review checklists using current official guidance.
- [ ] **L32.4** Create a practical wishlist/playtest/demo/community schedule with measurable learning goals; prepare outreach drafts but send or publish only when authorized.

Acceptance:

- [ ] **L32.A1** Every screenshot/feature/platform/language claim can be demonstrated in the candidate and has approved provenance.
- [ ] **L32.A2** Store and build review evidence, timing prerequisites and account-owned decisions are recorded rather than presumed passed.
- [ ] **L32.A3** Marketing assets show actual gameplay and the launch calendar includes review/rework time without inventing a guaranteed release date.

## L33 — Run external playtests and the full acceptance matrix

**unverified · required** · Depends: L22, L24, L26, L27, L28, L31, L30 · [Master prompt](prompts/L33.md)

- [ ] **L33.1** Run every launch route and overlay through happy, empty, loading, error, stale-data, keyboard, scale and reload cases, with separate developmental-route exclusions.
- [ ] **L33.2** Recruit an authorized pilot cohort of management-sim newcomers and experienced players; observe onboarding, meaningful choices, match comprehension and willingness to continue.
- [ ] **L33.3** Test multi-hour and multi-season sessions, crashes, bad imports, offline play and low-end hardware using the actual candidate.
- [ ] **L33.4** Triage feedback into reproducible defects, balance issues and preferences; fix release blockers and retest the affected journeys.

Acceptance:

- [ ] **L33.A1** No unresolved save-loss, startup, progression, result-integrity or essential-control blocker remains.
- [ ] **L33.A2** All launch routes have build-linked evidence; pilot completion/clarity targets are reported with cohort size and actual results.
- [ ] **L33.A3** A clean candidate survives a full career loop and representative extended sessions with a tested recovery path.

## L34 — Make release gates reproducible and honest

**partial · required** · Depends: L02, L06, L07 · [Master prompt](prompts/L34.md)

- [x] **L34.1** Consolidate conflict, type, lint, regression, dependency, hardening, static content, worker, build and shipping checks into an evidence-producing local/CI contract.
- [ ] **L34.2** Fix audit coverage gaps: scanner completion must not print as acceptance; include map-studio assets, public/maps, inline art, packaged notices and actual file inclusion where relevant.
- [ ] **L34.3** Keep accepted exceptions specific, reviewed and expiring; never refresh baselines simply to make a failing release pass.
- [ ] **L34.4** Record exact source snapshot, lockfile, toolchain, environment and artifact identity so results from one build cannot certify another; document expensive extended gates separately.

Acceptance:

- [x] **L34.A1** The release command fails on any required failing/missing gate and preserves actionable logs.
- [ ] **L34.A2** A freshly packaged artifact has a manifest connecting its bytes to the tested source and dependency graph.
- [x] **L34.A3** Static success is explicitly labeled as static coverage and cannot claim live Steam, rights or player acceptance.

## L35 — Prepare support, diagnostics and safe updates

**open · required** · Depends: L03, L30, L31, L34 · [Master prompt](prompts/L35.md)

- [ ] **L35.1** Prepare support contact, known issues, troubleshooting, version/build display, safe diagnostic export and save-backup instructions.
- [ ] **L35.2** Define severity, reproduction templates and ownership for crashes, save failures, gameplay blockers, balance and ordinary feedback without collecting unnecessary private data.
- [ ] **L35.3** Prepare a tested hotfix, rollback and save-compatibility procedure with the previous good depot/artifact retained.
- [ ] **L35.4** Draft first-week monitoring and communication schedules, patch notes and incident responses; account for Steam reviews respectfully without manipulating them.

Acceptance:

- [ ] **L35.A1** A tester can produce a useful redacted report with build, scenario and recovery data.
- [ ] **L35.A2** A rollback drill restores the intended binary while preserving compatible user saves or explaining a safe migration boundary.
- [ ] **L35.A3** Support and update procedures name concrete artifacts, responsible actions and stopping conditions.

## L36 — Assemble the release decision and owner handoff

**open · required** · Depends: L03, L04, L05, L06, L07, L08, L09, L10, L11, L12, L13, L14, L15, L16, L17, L18, L19, L20, L21, L22, L23, L24, L25, L26, L27, L28, L29, L30, L31, L32, L33, L34, L35 · [Master prompt](prompts/L36.md)

- [ ] **L36.1** Review every required package against its evidence and every conditional feature against the signed-off scope; do not count a prompt, code file or mock test as completion.
- [ ] **L36.2** Freeze the accepted artifact and assemble source/artifact hashes, gate outputs, rights disposition, supported targets, store/build approvals and known issues.
- [ ] **L36.3** Resolve all P0/P1 failures and record explicit bounded lower-severity deferrals with player impact and follow-up; do not derive a fake readiness percentage.
- [ ] **L36.4** Prepare the concrete release checklist and public communication for the owner; perform external submission/publication only within explicit authorization and applicable tool rules.

Acceptance:

- [ ] **L36.A1** Every launch claim is supported by the exact candidate and every required gate is passed, not merely scheduled.
- [ ] **L36.A2** No missing executable, unresolved distribution rights, data-loss fault or unverified advertised feature is waived as polish.
- [ ] **L36.A3** The owner receives a reviewable GO/NO-GO report, exact artifact, rollback plan and the remaining account-side actions.


