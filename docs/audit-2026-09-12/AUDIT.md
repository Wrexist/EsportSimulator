# Project audit

Date: 2026-09-12 · Commit: `f0c1f814` · Windows · Node 22.18.0 · npm 11.7.0.

## 1. Assessment

The project has accumulated features faster than it has consolidated their contracts. Many individual systems work, but the same concept is represented differently in multiple places: finances, ratings, map names, settings, dates, saves, navigation, and release readiness. This creates both player confusion and maintenance risk.

The right direction is a disciplined consolidation program: protect progress, make calculations authoritative, establish a readable UI system, simplify the primary player journey, then finish release validation. Retain the match engine, week processors, store slices, existing UI primitives, and regression suite while improving their boundaries.

### What is already worth preserving

- Strict TypeScript is enabled, build errors are not ignored, and the current production build passes.
- All 1,163 tests pass across 112 suites. Tests cover many previously discovered economy, roster, tournament, and persistence defects.
- Seeded simulation, an atomic processor, save integrity checking, migrations, backup rotation, and bounded histories already exist.
- The worker has a compute-only save manager. The ordinary worker path no longer independently persists the game.
- Zustand persistence has been narrowed to preferences and the active save ID; it no longer serializes the entire world on every UI change.
- Many actions have already moved into slices and many weekly operations into processors. Continue that decomposition instead of restarting it.
- Design tokens, shared primitives, help, tutorial, shortcuts, error boundaries, and motion infrastructure exist and are mounted.
- Electron has Node integration disabled, context isolation and sandboxing enabled, permission denial, popup blocking, and mod-path traversal checks.
- Asset branding work, mod validation, Workshop integration, and ship-artifact verification provide useful foundations.

### Evidence and scope

The audit inventoried **8,425 tracked files**, including **633 TS/TSX/JS/MJS/CSS files and 154,237 lines**. That line total includes tests and tooling. It scanned the tracked source for structural and consistency signals, traced high-risk flows in detail, executed automated checks, and inspected the main player screens in a production browser build.

This is repository-wide coverage, **not a claim of line-by-line semantic verification of every file**. It does not prove every asset's provenance, every tournament format, every save migration, or every gameplay outcome. The [coverage matrix](COVERAGE.md) explicitly identifies runtime coverage and remaining verification.

Confidence labels used below:

- **Reproduced:** observed in the built browser game or isolated executable probe.
- **Verified source:** the behavior or structural issue is directly visible in current code; the complete failure scenario may not have been exercised.
- **Investigation:** plausible risk requiring a dedicated test before calling it a player-facing defect.
- **Design recommendation:** a proposed improvement, not a correctness claim.

Priority means urgency: **P1** before release or broad redesign; **P2** in the professionalization program; **P3** subsequent refinement. No issue is labeled P0 without evidence of an immediate, broad failure.

## 2. Verified baseline

| Check | Observed result | Practical limit |
|---|---|---|
| `npm ci --no-fund --no-audit` | Passed; 1,226 packages installed | No dependency versions changed |
| `npm run type-check` | Passed, zero errors | Tests are excluded from the main TS program |
| `npm test -- --runInBand` | 112 suites, 1,163 tests passed | Jest uses Node; no actual DOM, Electron, or Worker lifecycle |
| `npm run lint` | Zero errors, 154 warnings | Scripts excluded; CI lint step is nonblocking |
| `npm run build` | Passed; 38 static-generation entries completed | Not an Electron package or Steam launch |
| `npm run release:hardening` | All four checks passed; 500 weeks in ~42.6 s | Synthetic base save, in-memory storage, direct processor call |
| `npm run check:conflicts` | Passed | Text-marker check only |
| `npm run validate:circuit-calendar` | Passed, four warnings | Four qualifier lead times are one week instead of the preferred 2–3 |
| `npm run audit:steam-ready:strict` | Zero blocker/high/medium/low; three info | Source heuristics miss observed presentation mismatches |
| `npm run compliance:steam:strict` | Zero findings | Not rights clearance or packaged-content certification |
| `npm audit --json` | 47 affected-package findings | Findings are not 47 demonstrated vulnerabilities in this game |

Lint breakdown: 90 unused-variable warnings, 21 unescaped-entity warnings, 15 restricted-console warnings, 15 `no-console`, nine raw-image warnings, three `prefer-const`, and one hook-dependency warning. Some console warnings refer to the logger itself; clean up rules and intentional exceptions rather than blindly deleting code.

Production build first-load JS: main menu **386 kB**, dashboard **400 kB**, desktop **548 kB**, player detail **544 kB**, scouting **497 kB**, statistics **494 kB**, live match **463 kB**. These are build-reported sizes, not measured startup latency or RAM usage.

## 3. Reliability, calculations, and saves

### F01 — Different financial systems produce conflicting projections

**P1 · Reproduced.** With the same Pulsar career in week 1/day 3, the dashboard reports income **$22.9k**, facilities **$1.0k**, and net **+$20.6k/week**. Finances reports revenue **$15,000**, facilities **$0**, and net **+$13,750/week**. No financial action occurred between these inspections.

Evidence: `app/page.tsx:157` calls `EconomyEngine.processWeeklyFinances`; `app/finances/page.tsx:100` calls `economyManager.generateFinancialReport`. See `engine/economy-engine.ts`, `engine/economy-manager.ts`, and captured `home-ui.txt` / `finances-ui.txt`.

**Required change:** establish one weekly finance projection contract shared by the actual processor and all UI surfaces. Distinguish projected income from posted ledger entries. Reconcile salaries, staff, facility upkeep, sponsor floors, reputation/difficulty multipliers, merchandising, league revenue, and bonuses. Do not simply pick the visually preferable number.

**Done when:** the dashboard, Finances, any desktop finance view, and the next tick agree for the same inputs, with explicit explanations for one-off or contingent amounts.

### F02 — A late worker response can resolve a later request

**P1 · Reproduced by isolated transport probe.** `engine/worker/week-processor-bridge.ts:129` starts synchronous fallback after 30 seconds without removing the listener, terminating the worker, or marking the request obsolete. Messages have no request ID. After fallback completes, a new request can accept the previous request's late result.

The retained listener and cross-request response acceptance are demonstrated in `evidence/behavior-probes.cjs`. This reproduces transport behavior using the real transpiled bridge with fake timers/Worker; it is not a real 30-second browser stall experiment.

**Required change:** correlate requests and responses, allow one active operation, clean up on every terminal path, terminate/quarantine failed workers, ignore late messages, and start fallback from an immutable input and captured RNG state. Handle post-initialization worker errors and synchronous `postMessage` failures too.

**Done when:** timeout→fallback→next request, late result, ERROR, worker crash, clone failure, and termination tests cannot return another operation's result or commit twice.

### F03 — Worker and synchronous fallback have different persistence contracts

**P1 · Verified source; failure impact needs integration tests.** The worker uses `WorkerSaveManager`, which writes nothing. `processSync` imports the ordinary `atomicWeekProcessor`, whose save manager performs real persistence. The store then runs additional post-week work and saves again (`store/game-store.ts:2387`).

That means fallback can expose a durable intermediate state lacking subsequent academy/history/postprocessing changes. The store also clears `isLoading` before the final durable save. Passing the direct processor's crash tests does not prove the complete store flow is safe.

**Required change:** use the same compute contract for worker and fallback and give an application-level coordinator ownership of commit, recovery, and action locking. Model computing, committing, saved, and failed states explicitly. Preserve correct crash recovery during the change.

### F04 — Durable-state serialization is duplicated and incomplete

**P1 · Verified source / partial reproduction.** `buildSaveSnapshot(state: any)` and `game-store.saveGame` enumerate save fields separately. Both omit `lastCommittedWeekTick`, although `GameSave` documents it as a recovery marker (`engine/save-types.ts:115`). The isolated probe confirms the snapshot builder drops it; the complete crash consequence remains unproven.

Player-authored `customTactics` also exist only in store state (`store/slices/match-ui-slice.ts:29`) and are absent from both the save schema and the small persisted preferences payload. They reset when the store is recreated. Active-match state and weekly-activity selections likewise require an explicit persistence policy rather than accidental treatment as transient data.

**Required change:** one typed serializer, an explicit field inventory, old-save migration/default rules, and actual store→storage→fresh store round trips. Persist authored tactical loadouts. Decide and communicate whether an interrupted live match resumes or restarts; do not promise resume until tested.

### F05 — Electron force-close timer can override the save dialog

**P1 · Verified source.** `electron/main.js:1042` force-closes after 15 seconds. `GameShell` can be waiting for the player to answer “simulation running” or “save failed,” or be saving. The timeout does not distinguish an unresponsive renderer from a responsive renderer displaying a decision.

**Required change:** a close handshake with acknowledgements and state-aware timeout policy. Never use the same short timeout for a dead renderer and a player reading a save warning. Include Steam Cloud delay/offline conditions in testing.

### F06 — Canceling an exit can leave autosave stopped

**P1 · Verified source.** The close handler clears `autoSaveInterval` before asking for a decision and does not recreate it after cancellation (`components/layout/GameShell.tsx:124`). The handler is registered once using `__esimCloseHookRegistered`, while its containing effect reruns on theme changes and in development StrictMode. Consequently the registered closure may refer to an old interval.

**Required change:** separate close subscription and autosave lifecycle, expose an unsubscribe callback from preload, and use current refs or one coordinator. Verify cancel→continue playing→autosave, theme changes, repeated close requests, and remounts.

### F07 — Autosave controls write different stores

**P1 · Verified source.** `SettingsModal.tsx:346` writes `useSettingsStore.autoSave`; the standalone settings page selects `game-store.autoSave` (`app/settings/page.tsx:74`). `GameShell` checks the game-store value. The two controls can disagree, and the menu preference can fail to control background saves.

**Required change:** one preference owner with a one-time legacy migration, shared setting components, and clear wording that distinguishes periodic saving from mandatory progression commits.

### F08 — Audio preferences can be lost during initialization

**P2 · Reproduced by isolated audio probe.** `SoundManager` initializes on the first click/key. Volume setters return early until an audio context exists (`lib/sound-manager.ts:65`), but initialization assigns hard-coded gains. A stored zero volume applied before the first interaction is lost; the probe observes master gain 0.24 afterward.

There is also a source-level music lifecycle problem: the route effect calls `stopMusic()` in cleanup, but only starts music when the broad scene changes. Navigating between two menu-scene routes stops music without restarting it (`GameShell` ambient music effect). Auditory output was not assessed by listening in this pass.

**Required change:** retain requested audio settings before initialization; apply them when audio becomes available. Key music lifetime to scene, not every pathname. Verify mute across cold start, reload, all settings entry points, and route changes.

## 4. Player experience and presentation

### F09 — Primary progression controls are clipped at minimum resolution

**P1 · Reproduced.** At 1024×640 on Training, “Next Day” occupies approximately x=1066–1204 and “Skip Week” x=1212–1320. Both are beyond the viewport. Root overflow is hidden, so a document-width check alone reports no overflow.

Evidence: `components/layout/TopBar.tsx`, `GameShell.tsx`, `evidence/training-1024x640.png`.

**Required change:** responsive topbar priorities, compact/collapsible navigation, and a permanently reachable Continue/Play action. Measure interactive-element bounds and nested clipping, not only document scroll width. Test 1024×640, 1280×800, 1440×900, and larger windows with text scaling.

### F10 — Typography removes hierarchy and strains readability

**P2 · Reproduced + source inventory.** Archivo Black is loaded as the body font, installed as `font-sans`, and forced on `html, body` with `!important` (`app/layout.tsx`, `src/design/tokens.ts:154`, `app/globals.css:100`). Body paragraphs, control labels, metadata, and headings therefore share a heavy display treatment.

There are **1,044 literal `text-[8px]`, `text-[9px]`, or `text-[10px]` occurrences across 111 application-source files**. This is a pattern count, not 1,044 independently verified accessibility failures. Screenshots confirm dense low-emphasis labels and all-heavy text. Large hero panels consume space while actionable content moves below the fold.

**Required change:** a legible body font; display font reserved for selected headings/branding; normal-weight paragraphs; tabular numerals; a compact, consistent text scale; fewer uppercase/tracked labels; semantic contrast tokens. Fix the shell and reference screens first, then migrate the rest.

### F11 — Fictional branding is inconsistent in the actual game

**P1 · Reproduced.** Main menu advertises “REAL PLAYERS” and “ESPORT MANAGER”; other surfaces use “ESPORTS MANAGER,” “Esports Manager Simulator,” and “Esports Manager: FPS.” Veto selects **Sandstone**, live match shows **Dust II**, and results return to **Sandstone**.

`data/map-pool.ts:23` explicitly maps Sandstone to Dust II. The purge test only rejects the spelling `dust2`, so it passes. Drills also contain named map/training references outside the narrow check.

**Required change:** choose the public title and canonical display-name registry; separate stable save IDs from display names. Review player-facing copy and packaged assets against the intended fictional-world policy. Extend checks to rendered names and source data. This is a consistency/policy finding, not a legal conclusion about any specific term or asset.

### F12 — Starting-career guidance contradicts available teams

**P2 · Reproduced.** The screen says a new manager must begin with a Semi-Pro team, while Semi-Pro is shown as level 5 locked and the selectable Pulsar team is Amateur. Career gating uses reputation; the visual tier list uses rank-derived tiers (`app/new-game/page.tsx:155`, `:536`, `engine/manager-progression.ts`).

**Required change:** derive the explanation, badges, filtering, and eligibility from one unlock rule. Add a “Available now” filter and several sensible starting recommendations; label locks with an attainable requirement. Team cards and search inputs also need proper keyboard/accessible semantics.

### F13 — “OVR” refers to different ratings

**P2 · Reproduced.** Pulsar has 52 OVR in selection and Continue, but 44 OVR on the dashboard. Selection uses `evaluatePlayer().overallRating`; the dashboard averages `player.skill` (`app/page.tsx:112`).

**Required change:** one team overall selector, or explicitly distinct labels such as Overall and Raw aim skill. Apply the same definition to selection, saves, squad, profiles, and comparisons. Explain scouting uncertainty separately from true rating.

### F14 — Time presentation uses incompatible definitions

**P2 · Reproduced / verified source.** The first friendly took place on week 1/day 3, September 14, while its result screen displayed September 12. `result/page.tsx:271` uses `getDateForWeek(match.week)` without the match day. The dashboard season progress uses lifetime `currentWeek / 52` (`app/page.tsx:569`), so week 53 displays over 100% rather than season-two progress.

**Required change:** central date/season helpers distinguishing absolute week, season week, calendar date, and match day. Audit schedule, match results, news, contract expiry, birthday/aging, and recaps against those definitions.

### F15 — Training copy and interactions need a focused overhaul

**P2 · Reproduced.** The Training screen shows a 0/3 slot allowance while its tooltip says a baseline of 10. Recovery cards display “+ -10 Fatigue” / “+ -20 Fatigue.” Raw labels such as `StressResistance` appear. “INITIALIZE SIMULATION” sits after a long grid of drills. The page calls itself “Performance Center,” while navigation says Training.

Evidence: `app/training/page.tsx:270`, `:339`, `data/drills.json`, store initialization and drill constants.

**Required change:** display the actual slot rule, format signed deltas centrally, label actions in player terms, put the selected drill and Run action together, and separate drills, individual training, and tactical loadouts. Investigate the intended passive-training pipeline before changing balance; individual focus overrides already exist, so the controls are not simply all dead.

### F16 — Reduced-motion preference only partly controls animation

**P2 · Verified source.** The setting changes a CSS class, while global Framer Motion is configured as `reducedMotion="user"`, meaning the operating-system preference. It does not consult the explicit in-game toggle. CSS animation suppression cannot stop every JavaScript animation.

**Required change:** combine the in-game preference with the OS preference and define which functional transitions remain. Check confetti, radar, infinite loops, loading animations, and route transitions separately.

### F17 — Accessibility needs interaction testing, not just styles

**P2 · Reproduced / verified source.** The main-menu settings icon has no accessible name; career team cards and training drill cards appear as containers rather than clear controls; the manager-name input has no accessible name in the observed tree. `app/layout.tsx` disables user zoom. Tiny text, icon-only buttons, nested overlays, and focus restoration require systematic coverage.

**Required change:** semantic interactive elements, real labels, visible focus, keyboard selection, modal focus trapping/restoration, and meaningful error/status announcements. Re-enable zoom where supported and verify text scaling. Existing skip link, help, and shared Radix primitives should be retained.

### F18 — Inbox navigation introduces a second application shell

**P2 · Design recommendation backed by browser observation.** The sidebar's Inbox opens a window inside a simulated desktop with its own icons, dock, panels, and weekly focus, while the outer sidebar and topbar remain. This duplicates navigation and competes for attention. Academy already reuses its desktop component on a normal route, demonstrating that consolidation is possible.

**Required change:** make one shell authoritative. Recommended default: conventional management navigation with an inline Inbox and shared feature views. Retain the virtual desktop only if it has a clear intentional role; do not maintain separate business logic inside desktop versions.

### F19 — Missing decorative asset references remain

**P2 · Verified source/filesystem.** `/grid.svg` is referenced in player, tournament, staff, and negotiation overlays, but no corresponding public file exists. A debug-only tournament logo reference is also missing. The mod-loader documentation example was excluded as a false positive.

**Required change:** replace the missing texture with a shared CSS treatment or provide an owned asset; add literal and manifest-based asset checks with case-sensitive validation. Dynamic mod assets need their own checks.

## 5. Security and release engineering

### F20 — Dependencies need current advisory triage

**P1 · Registry scan evidence.** `npm audit` reports 47 affected-package findings, including direct dependencies such as Next, Electron, PostCSS, Sharp, electron-builder, and development/import tooling. The report includes five critical and 33 high findings. Some are inherited through tools, some concern features this app may not use, and some suggested fixes require major upgrades.

**Required change:** classify each finding as packaged runtime, development/build, or offline asset tooling; establish exploit prerequisites; update or replace affected packages in tested steps; record any residual acceptance. Do not run a blind forced upgrade. Next 14 is outside the current supported major list, so a supported-version migration belongs in the plan. See [Next.js support policy](https://nextjs.org/support-policy).

Electron recommends keeping its runtime current and assessing dependency security; that includes the shipped Chromium/Node versions, not only packages listed under `dependencies`. See [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security).

### F21 — Local server and IPC trust boundaries are too broad

**P1 · Verified source.** `electron/main.js:132` calls `server.listen(port)` without a host. Node documents that omitting the host listens on the unspecified address, potentially covering all interfaces; bind the packaged server explicitly to loopback. See [Node server.listen](https://nodejs.org/api/net.html#serverlistenport-host-backlog-callback). Actual LAN reachability was not tested and can depend on firewall configuration.

Navigation permits any HTTP localhost/127.0.0.1 port rather than the exact application origin (`main.js:740`, `:1097`). Main-process storage/mod/GPU/window handlers do not use a shared sender check. Steam handlers check webContents identity, which is useful but should also be evaluated against frame/origin requirements.

**Required change:** exact application-origin policy, loopback binding, shared IPC sender/frame validation, bounded schemas/key namespaces, and negative tests for foreign local origins. Keep existing isolation and sandbox protections. Assess CSP tightening with the production build; do not remove required directives without testing.

### F22 — Release paths do not enforce the same gates

**P1 · Verified source.** `release:verify` omits Jest and the strict Steam-ready audit. `SHIP_GAME.bat` runs `dist`, artifact verification, then upload, without first running the complete quality checks. CI's Electron job invokes electron-builder directly, bypassing the Steam App ID guard, and the workflow does not provision the ignored App ID file. CI does not run `ship:verify` against its package. Lint is explicitly nonblocking, although the current Next build also runs lint.

**Required change:** one documented release command that verifies code, tests, dependencies, branding policy, App ID, packaged files, and boot before producing an uploadable artifact. Upload should consume the exact verified immutable artifact. Preserve explicit operator control over publishing.

### F23 — Passing checks leave major integration gaps

**P1 · Verified configuration.** Jest runs in Node with `diagnostics.warnOnly`; `__tests__` is excluded from `tsc`. There is no browser test suite wired into CI. The 500-week hardening run calls `AtomicWeekProcessor` with an in-memory synthetic base save and an empty training map, not the actual browser store + Worker + desktop storage + postprocessing chain.

**Required change:** add focused browser and Electron integration tests for the failures above. Make test typing explicit. Preserve existing invariant tests, add full-store replay/parity cases, and use real snapshot long runs across starting tiers and difficulty. Green unit tests remain valuable, but they are not release certification.

## 6. Architecture, maintainability, and content operations

### F24 — Large orchestration files and type adapters concentrate risk

**P2 · Measured.** `game-store.ts` is 2,655 lines; tournament detail 1,912; tournament manager 1,468; Scouting 1,455; atomic processor 1,442; Desktop 1,407; live-match hook 1,375; Settings 1,209. The application-source scan found 738 occurrences of the word `any` across 130 files; this includes comments and is not an AST count of unsafe types. No `@ts-ignore`/`@ts-nocheck` matches were found.

The simulation imports shared indexes from `store/`; `engine/academy-constants.ts` imports UI icons; storage/platform services share the engine directory. Save/runtime entity types require repeated casts.

**Required change:** extract cohesive application services, presentation selectors, and feature views incrementally. Move shared indexes to a domain-neutral module; split platform adapters from pure simulation; put icon mapping in UI. Replace high-risk boundary casts with named adapters and narrow command inputs. A line-count target is a warning signal, not permission to split files arbitrarily.

### F25 — Documentation has multiple conflicting authorities

**P2 · Verified.** TASK references June branches and old pending work. README claims 33 tests, save versions v1–v4, real teams, and an obsolete SteamBuild output. Other documents claim complete/production-ready status while the release evidence packet records NO-GO pending manual validation. DEV and WORKFLOW duplicate instructions with different branch prefixes. Historical audits mix fixed items and outstanding recommendations.

**Required change:** one current status, one backlog, one architecture overview, one development guide, one release runbook. Archive old audits with date/commit and link them as history. Generate volatile counts from tools. Move Phase-number narrative out of source comments when it no longer explains a constraint.

### F26 — Content and asset lifecycle needs ownership

**P2 · Measured / design recommendation.** Tracked `public/` contains 4,385 files (~251 MB decimal); `raw-data/` has 3,269 (~244 MB). Large original PNGs and presentation/mockup assets sit near runtime assets. Packaging broadly includes public content. A 4.99 MB radar navigation JSON is imported into relevant source chains.

**Required change:** classify runtime assets, masters, import sources, examples, and marketing outputs. Create a manifest with identity, intended use, dimensions, generated/source provenance, and package inclusion. Keep original art safely; optimize and selectively package derivatives. Do not delete raw inputs or strip unused-looking assets before checking dynamic references and save compatibility. Review rights/provenance with the appropriate owner; filename scans cannot establish it.

### F27 — Performance evidence is not enforced at the product boundary

**P2 · Verified tooling.** Performance harnesses and historical reports exist, but CI mostly logs bundle size and uses nonblocking steps. Browser startup, input latency, actual save time, large-world worker cloning, long-term memory, and Steam Deck graphics have not been measured in this pass.

**Required change:** explicit target hardware and budgets, repeatable measurements, and a ratchet on regressions. Profile before adding caches or changing frameworks. Route bundle sizes suggest starting with Desktop, player detail, Scouting, Stats, and live match.

### F28 — Progression and balance need a coherent product acceptance model

**P2 · Investigation / design recommendation.** Board expectations, career progression, academy, FPL, training, facilities, staff, rivals, and sponsors all exist. What remains unproven is whether they form a comprehensible, balanced career across multiple seasons, rather than merely surviving a processor fuzz test.

**Required change:** a feature contract for each player choice: input, cost, timing, visible outcome, persisted state, failure case, and explaining UI. Run real-snapshot careers across tiers/seeds/difficulties; measure income, progression speed, roster churn, player growth, tournament access, and idle weeks. Tune only against stated goals. Defer new negotiation systems and new progression mechanics until the existing loop is coherent.

## 7. Older findings that should not be blindly reopened

| Historical concern | Current source evidence |
|---|---|
| Transfer modal has no FAILED screen | FAILED branch exists at `NegotiationModal.tsx:526`; test the interaction instead of reimplementing it |
| Help/tutorial never mounted | Both are mounted globally in GameShell |
| No global reduced-motion support | `MotionConfig` exists; the remaining gap is the explicit in-game preference |
| Store serializes the entire world on every mutation | `partialize` now persists a small preference/bootstrap payload |
| Worker writes a second independent database | Compute-only WorkerSaveManager exists; fallback parity remains open |
| Several independent EmptyState/Skeleton implementations | Some old paths are compatibility re-exports of canonical components |
| No gameplay effects from staff specialization/rivalries/sponsors | Dedicated processors and regression tests exist; examine balance and integration |
| Only a few dozen tests | Current run passes 1,163 tests |

## 8. What remains explicitly unverified

- A packaged binary's startup, saving, close dialogs, upgrade/install/uninstall, offline Steam behavior, and native-module compatibility.
- Live Steam achievement definitions, store content, cloud conflict behavior across two machines, Workshop subscription/update/removal, and depot configuration.
- Full keyboard/controller navigation, screen-reader usability, measured contrast, all dialogs at minimum size and larger text, and OS reduced motion.
- Real-snapshot multi-season balance, many seeds, all tournament routes, live/instant result equivalence, and worker/fallback/store crash parity.
- Detailed rights/provenance review of all assets and data. This report makes no legal clearance claim.
- Production memory/CPU/frame-rate/save-latency benchmarks on target hardware.

These are scheduled work packages in the plan, not silently assumed passes.
