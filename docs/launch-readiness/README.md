# Windows 1.0 launch plan

Current September 25 status: [remaining release gates](REMAINING-2026-09-25.md), [signed-in Steamworks check](evidence/STEAM-STATUS-2026-09-25.md), and [browser recovery review](evidence/2026-09-25-browser-recovery.md). Older package summaries below are historical implementation evidence, not current acceptance.

Reviewed 14 September 2026. **Target confirmed by the owner: Windows 1.0. Current release decision: NO-GO.** This is the current launch execution index. It consolidates the previous 60-package audit and adds the requested spatial simulation and full-product acceptance work. It is a complete register of the work currently known, not a claim that every undiscovered defect has been found.

Latest implementation: [L30 Steam and L29 follow-up](evidence/L30-REPORT.md). SDK compatibility, achievement scope/retries, Cloud discovery/conflict choices and guarded uploads; retained mod artwork and folder import. Real Steam ownership/Cloud enabled verified read-only for App ID 4326170. 1,650 tests / 172 suites, types/build and isolated native IPC pass. Four new promotional masters and [store preview](../../marketing/steam-2026-09-14/preview.html). L29/L30 remain partial: real platform/UI lifecycle, account/local-save migration, Cloud races/retry, exact artwork exports, gameplay captures, earlier identities/5v5/calibration and clearance remain. **Next: L31 Windows shipping artifact.**

## Use this pack

| Document | Purpose |
|---|---|
| [CHECKLIST.md](CHECKLIST.md) | 36 packages, 144 implementation tasks and 108 acceptance criteria |
| [MASTER-PROMPTS.md](MASTER-PROMPTS.md) | Index and copyable continuation prompt; links to 36 self-contained execution prompts |
| [backlog.json](backlog.json) | Dependencies, scope, current state and evidence fields for each package |
| [ROUTE-MATRIX.md](ROUTE-MATRIX.md) | All 40 current application routes and their remaining acceptance scenarios |
| [LEGACY-CROSSWALK.md](LEGACY-CROSSWALK.md) | Where every earlier audit package now belongs |
| [AUDIT-DELTA.md](AUDIT-DELTA.md) | Rechecked findings, scanner limits and missing release evidence |
| [evidence/](evidence/) | Fresh audit outputs and evidence snapshots |

Use one bounded prompt at a time. Investigate existing implementation first, finish its missing behavior and acceptance, then update the register. A package labeled **partial** contains working code worth preserving. Do not rewrite it merely because the larger release gate is open. Dependencies govern acceptance; useful preparation can proceed before every upstream package is finished.

## What will make this an excellent management game

The product promise is a convincing esports career where a manager's decisions have understandable consequences. A strong first session should lead naturally into another week, another transfer window and another season.

Five design pillars:

1. **Meaningful tradeoffs.** A veteran versus a prospect, scouting versus an immediate signing, recovery versus practice, saving money versus upgrading, and aggression versus a disciplined retake should each have situations where they make sense.
2. **Credible matches.** Players use connected space, know only what they can perceive or learn, coordinate roles, and win through simulated actions. Tactical choices affect behavior. The 2D radar displays the same events that determine the result.
3. **An evolving competitive world.** AI clubs recruit within budgets, players develop and age, tournaments finish correctly, records persist, and board/squad reactions reflect what actually happened.
4. **Fast, legible decisions.** The glass interface supports readable tables and immediate navigation. Every page makes the next relevant decision easy to find, explains costs and uncertainty, and handles failure clearly. Map Studio stays quiet.
5. **Trust over a long career.** Saves survive updates and failures, calendar/economy facts agree across screens, offline play works, and support can reproduce problems from useful diagnostics.

These are quality goals to test with players. No prompt, test count or claim of realism can establish that the game is the best on Steam.

## Current evidence and its limits

Latest execution: **L14 versioned replay and match integration boundaries are implemented; acceptance remains partial.** Spatial lab rounds now share a sealed event/frame record across scoreboard, radar, outcome, diagnostic economy and saved-position replay. Career fixes cover veto maps/sides/seed, pending event recovery and duplicate/stale writes. **1,447 tests / 150 suites pass**; a 52-week compatibility-engine benchmark takes **17.23 seconds**, above the 10-second target. [L14 implementation and limitations](evidence/L14-REPORT.md). Next: **L15 finances and contracts**, alongside full spatial match/5v5 integration, Mirage review and calibration. Windows packaging, Steam identity and content gates remain open.

Previous execution: **L13 team knowledge and coordination are implemented in the independent Simulation lab; acceptance remains partial.** Delayed reports, role assignments, collision-tested spacing/shooting, objective timers, utility budgets and decision replay are available through six pinned Mirage examples. **1,435 tests / 147 suites pass; six compiled-worker scenarios repeat and match Node in full.** [L13 evidence and limitations](evidence/L13-REPORT.md). Owner Mirage uploads remain unchanged. **Next: L14 versioned authoritative match/replay integration**, alongside full-team tactics, Mirage review and utility calibration. Windows packaged testing, real Steam App ID and content clearance remain open.

Previous execution: **L12 utility flight and effects are implemented in the controlled lab; acceptance remains partial.** Five original Mirage fixtures exercise smoke, flash, HE, fire and decoys with editable throw/landing/bounce settings. **1,418 tests / 146 suites pass.** [Implementation, fidelity and runtime evidence](evidence/L12-REPORT.md). Mirage revalidation preserves the owner uploads; wall heights, opening semantics and CT/A/B floor coverage remain review tasks. **Next: L13 team knowledge/tactics**, alongside utility calibration and manual Mirage review. L14 live-match integration, Windows packaged testing, Steam identity and content gates remain open.

Previous execution: **L11 controlled encounters are implemented in Simulation lab; release acceptance remains partial.** Visible evidence, reaction, aim, resolved shots, armor and ammunition determine the duel outcome. Five pinned Mirage examples and a player-knowledge/world-truth timeline make the rules inspectable. Full regression **1,394/145** passes; **21 final focused encounter tests** pass. [L11 implementation and runtime evidence](evidence/L11-REPORT.md). Next: L12 utility flight/effects, alongside manual Mirage review and L10 calibration; L13/L14 bring team decisions and authoritative live matches. Windows packaged testing, Steam identity and content gates remain open.

Previous follow-up: **Mirage v12 is preserved with 169 marks; a separate copy adds ten generated reference routes.** New opening diagnostics identify two coincident blue/green pairs and missing height/behavior metadata. Current check: 20 errors / 87 review notes, mostly unbound geometry and review metadata. **90 targeted tests / 5 suites, fresh types, production build and ten repeated native route checks pass.** Motion agrees exactly across Node/Chromium; display-heading differences leave whole-frame cross-runtime equality open. [Updated audit and evidence](evidence/MIRAGE-V12-REPORT.md). L09/L10 remain partial. Next: manual Mirage review and L10 calibration, alongside L11 perception/shots; packaged testing, Steam identity and content gates remain open.

Previous execution: **L09 validation and the next L10 lab integration are implemented; both launch packages remain partial.** The original 142-mark Mirage upload and all its vertices are preserved. A separate registered review copy identifies A/B, provides provisional ground bindings and exposes 18 remaining geometry errors. All four safe-point spawn/site routes complete movement. Registration coverage spans eight maps / ten floors, all held for review. **1,362 tests / 143 suites pass**; browser backup/import, check persistence, geometry transfer and CT-to-A playback were verified. [L09 report](evidence/L09-REPORT.md), [L10 report](evidence/L10-REPORT.md). Next: manual Mirage wall/ground/vertical review and L10 calibration/moving-team coordination, then **L11 perception and collision-tested shots**. Packaged Windows, real Steam App ID, L08 content clearance and prior package acceptance remain open.

| Check or subsystem | Verified state | What remains |
|---|---|---|
| Regression baseline | L01/L02/L34 recorded run: 1,300 tests/129 suites. Subsequent identity and interface pass: 1,306 tests/131 suites pass; fresh type check passes. | Re-run the complete gate on the actual Windows release candidate. Source checks do not certify a packaged release. |
| Fresh hardening run | Passed tamper detection, synthetic transaction-step crash/resume, 500 simulated weeks in 49,042 ms, and signatures of 2,202 images | This uses an in-memory fixture, not packaged crash recovery, ten-season balance acceptance, or asset-rights verification. [Log](evidence/hardening.txt) |
| Fresh strict Steam-ready scan | **Failed:** 0 BLOCKER, 1 HIGH, 1 MEDIUM, 3 INFO | HIGH keyword flag in `lib/map-utility-templates.ts`; MEDIUM `dust2` identifier in `data/map-studio-library.json`. These are local policy findings, not a Valve rejection or legal determination. Resolve underlying disposition accurately. [Report](evidence/steam-ready.json) |
| Expanded compliance scan | L34 now scans all `public` and ignores the old 415-entry blanket baseline. Strict scan fails with one MEDIUM (`public/hltvrankiing`). | Resolve source disposition and item-specific rights evidence. File signatures and keywords do not certify distribution rights. [Execution report](evidence/L34-REPORT.md) |
| Dependencies | **L06: 0 known findings** in fresh full and production audits; 47 baseline package dispositions recorded. Reproducible install, 1,311 tests/133 suites, clean types, production worker and Electron-hosted server pass. | Actual packaged graph and native/offline acceptance remain; the real Steam App ID file is absent. [L06 report](evidence/L06-REPORT.md), [full](evidence/L06-dependencies.json), [production](evidence/L06-runtime-dependencies.json). Older audit files are retained as baseline evidence. |
| Shipping artifact | **Failed:** `dist/win-unpacked` does not exist | Build, inspect and test the actual Windows executable/depot. A successful Next build is not an Electron release artifact. [Log](evidence/ship-artifact.txt) |
| Electron / IPC boundaries | L07: all 41 channels inventoried and guarded; source traversal/junction/payload tests, real Electron IPC/navigation and production CSP/worker probes pass. Full suite 1,322 tests/135 suites passes. | Actual packaged Windows security/lifecycle, live Steam and L06 prerequisite acceptance remain open. [L07 report](evidence/L07-REPORT.md) |
| Save/worker/finance foundation | Typed snapshot builder, correlated compute-only worker/fallback, single final commit, close lifecycle and shared recurring finance calculations exist | Durable-field inventory, real recovery, full determinism and native failure acceptance remain. [Implementation evidence](../audit-2026-09-12/IMPLEMENTATION.md) |
| Spatial foundation | Eight imported map references; height-aware navigation, sampled body collision, static sight checks, playback and independent lab saves | Jumps/drops, accurate body physics, perception, shots, utility, team tactics and outcome-producing integration are not finished. [Lab guide](../SPATIAL-LAB.md) |
| Live match engine | `engine/match/round-outcome.ts` still describes and implements outcome generation from an already selected round winner; radar movement is reconstructed | New spatial behavior is not yet authoritative. The lab is not evidence that live combat is physically correct. [Roadmap](../TACTICAL-SIMULATION-ROADMAP.md) |
| Team identities | Previous inventory: 198 teams; three redesign studies implemented | Reverify and complete the remaining identity review/redesign; previous report lists 195 outstanding. Rights, consistency and small-size acceptance remain. |
| Real Steam and player acceptance | No current account/build review, two-PC Cloud, clean-machine or external playtest evidence was established here | These remain unverified even when a local script passes. |

The source base commit is `f0c1f814dba8d97ffb771e5d530b8eb180c85d80` with substantial local changes. The commit ID alone does not identify this candidate. Keep source/lockfile/artifact hashes with future release evidence. Earlier June/July documents and Steam feedback are historical inputs until reconciled with current account-side evidence.

[The source snapshot](evidence/source-snapshot.json) records hashes for the audited application/domain paths, scripts and map-studio references. Its stated scope excludes other public assets and packaged dependencies; it is not the complete release manifest required by L31/L34.

## Work sequence and milestones

| Milestone | Packages | Exit result |
|---|---|---|
| A. Establish the release contract and remove immediate uncertainty | L01, L02, L34; begin L06, L07, L08 | Confirmed scope, fixtures, credible gates, vulnerability triage and asset disposition plan |
| B. Make a career safe to trust | L03, L04, L05 | Real save/reload/recovery, deterministic progression and native lifecycle acceptance |
| C. Build a credible match vertical slice | L09 → L10 → L11 → L12 → L13 → L14 | Reviewed Mirage geometry through an outcome-producing match; then all launch maps accepted |
| D. Complete the management systems | L15 → L16 → L17 → L18; L19 → L20 → L21 | Coherent economics, squad/development, competitive world, career consequences and match agency |
| E. Finish the player experience | L22, L23, L24, L25, L26 | New-player comprehension and all-route visual/input/content acceptance |
| F. Prove performance, balance and distribution | L27, L28, conditional L29, L31 → L30 | Measured long careers, verified package and actual Steam features |
| G. Validate the launch candidate | L32, L33, L35, L36 | Truthful store, external acceptance, support/rollback and evidence-based owner handoff |

The exact dependency graph is in `backlog.json`; the table summarizes workstreams rather than forcing every discovery task into a strict waterfall. For example, prepare the store and support drafts early, but accept them only against the final behavior. Build preliminary native packages early enough to discover integration problems; rebuild and retest the final candidate after gameplay changes.

**Next execution: L15 finances, budgets and contract consequences, with L14 full-match integration/acceptance, L13 full-team tactics, L10/L12 calibration and manual Mirage acceptance continuing alongside.** Keep career results on the compatibility path until the controlled simulator passes its gates. Outstanding L02-L08 release acceptance, Windows packaged testing, Steam identity and content clearance remain open.

The previous 8–15-week estimate predates the new spatial simulation scope. Do not reuse it as a launch promise. Re-estimate after the save recovery milestone, a packaged smoke run and the controlled encounter, using actual throughput and defect discovery. No release date is justified by the current evidence.

## Launch scope and optional ambitions

Required for this plan: a complete, polished Windows 1.0 management career; the user's requested credible 2D tactical simulation; consistent fictional identities; trustworthy persistence; verified claimed Steam features; supported hardware/input/languages; truthful marketing and operational readiness.

Workshop/community packages, controller/Deck claims, additional languages and additional operating systems are conditional on the final scope. A feature becomes a required acceptance gate if it is shipped or advertised. Unfinished controls need a deliberate inclusion/exclusion decision. Windows 1.0 is confirmed; price, minimum hardware, language/input promises and exact launch content still need product decisions and measurements.

Potential later ambitions include more authored career events, additional competition formats, deeper scouting reports and richer tactical playbooks. Add these only when they improve measured player decisions and have an explicit budget. They must not obscure the required work already listed.

## Proposed quality targets

These are internal targets to calibrate and accept, not Steam rules or already measured achievements:

- **Save and outcome integrity:** zero known data-loss, duplicate-commit, startup or progression-blocking defects in the accepted fault matrix.
- **First session:** a proposed pilot of 12 fresh players, with at least 10 completing the defined opening objective without facilitator rescue. Record failures and qualitative confusion as well as completion.
- **Long careers:** a proposed extended campaign of 30 seeds over ten seasons across club tiers and difficulty, plus human sessions. The existing 500-week synthetic fuzz is a different test.
- **Decision quality:** paired experiments demonstrate the intended effects and costs of tactical, recruitment, training and financial choices; multiple viable approaches remain.
- **Responsiveness:** measure input acknowledgement, navigation, tick time, memory and save cost on named hardware. A useful starting target is sub-100 ms acknowledgement and smooth 60 Hz UI during normal interaction; adopt final budgets from real profiling.
- **Presentation/access:** all 40 routes are classified; every included route passes functional, responsive, keyboard and error-state acceptance. Essential controls work at 1024×640 and declared scaling settings.

## Steam and platform requirements checked against current sources

Valve reviews both the store presence and the build. Advertised launch features must be implemented; supported operating systems must launch successfully. Screenshots should show gameplay. The detailed review page states typical reviews take 3–5 business days and recommends allowing at least seven business days. These are not guarantees. [Steam review process](https://partner.steamgames.com/doc/store/review_process)

Check the account's applicable Steam Direct waiting period and the public Coming Soon duration before setting a date: the published guidance describes 30 days after the app fee and at least two weeks of Coming Soon visibility for the initial-title process. Existing account eligibility was not inspected. [Steam Direct](https://partner.steamgames.com/steamdirect)

Complete the content survey against the actual shipped content, including applicable AI-generated artwork, audio, narrative or localization. Live-generated content has additional disclosure/guardrail requirements. Routine development efficiency tooling is distinguished from player-consumed content in the current guidance. [Content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey)

Validate Cloud on actual devices and accounts using the integration selected by the game; inspect sync logs and preserve conflict backups. A separate Steam Playtest app can support pre-release feedback if the owner chooses it. [Steam Cloud](https://partner.steamgames.com/doc/features/cloud), [Steam Playtest](https://partner.steamgames.com/doc/features/playtest)

Electron's security guidance calls for current runtime versions, restricted navigation and sender validation for IPC. The current code protects several boundaries, but storage/mod handlers still require a complete channel-by-channel review. This is an audit task, not a claim of a demonstrated exploit. [Electron security](https://www.electronjs.org/docs/latest/tutorial/security)

## GO/NO-GO rules and account-side handoff

Keep the decision at NO-GO until the exact candidate has passed all required acceptance criteria. P0 means startup/data loss/security catastrophe; P1 means a core loop, result, essential control or promised feature is broken. Neither category is waived as polish. Lower-impact defects require a recorded disposition, player impact, workaround where available and follow-up owner.

The final handoff needs the executable/depot and hashes, reproducible source identity, gate outputs, supported-target matrix, rights/attribution disposition, real Steam evidence, store/build approval state, known issues, support details and a tested rollback. A local keyword scan cannot grant rights or Steam approval.

The owner still supplies or verifies account-side information: Steamworks release/review status, relevant reviewer feedback, authorized content rights, final pricing/packages and the publishing decision. Local work should continue wherever those inputs are not required. This planning request does not publish a build, contact testers, send outreach or release the game.

## What was completed in this audit pass

The existing backlog was consolidated, the current source and release scripts were inspected, official Steam/Electron guidance was checked, fresh readiness/compliance/dependency/hardening/artifact checks were captured, and this prompt/checklist pack was generated and validated. The root README's stale shipping-folder, real-team and save-version descriptions were corrected. Run `python scripts/validate-launch-plan.py` to check package IDs, dependency cycles, source entry points, prompt/task agreement, all 60 legacy packages, all 40 routes and local document links. This validates the plan structure, not launch implementation.

The application was not rewritten, dependencies were not upgraded, a Windows artifact was not built, and no Steam submission or release was performed. Implementation of the remaining packages is the next work.
