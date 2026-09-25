# LEARNINGS.md — Non-obvious constraints (each one already bit us)

> Add entries when something surprises you. Keep entries short: the trap, the rule, where it lives.

## UI interaction boundaries

- **A fixed modal can still be trapped behind shell stacking contexts.** Render global negotiation overlays in a body portal and verify the action is unobstructed in the real app, including desktop entry points. See `components/transfer/NegotiationModal.tsx`.
- **Stopping propagation does not cancel a containing link.** The squad Swap control must also prevent default navigation; verify the lineup action stays on the squad screen. See `app/squad/page.tsx`.

## Persistence & save schema

- **Request success is not transaction success.** IndexedDB mutations resolve at transaction completion; abort after a successful request must reject. A failed disk/browser write must not switch backends or become a memory-only “save.” Test with actual transactions and fresh processes.
- **electron-store interprets dots as property paths.** Save staging keys end in `.tmp`; read/write/delete these as literal root keys through `store.store`, otherwise staging can destroy the primary. IPC must explicitly admit only the legitimate staging suffix.
- **Store-only state silently disappears.** Custom loadouts, watchlists and live-match checkpoints now belong to the canonical snapshot. Older careers receive fresh defaults and must clear missing optional fields; top-level field inventory lives in L03 evidence. Do not clone the whole save twice or re-migrate identical verified backup bytes each tick.

- **Explicit serializers silently drop unknown fields.** The September cleanup consolidated manual saves and week snapshots into `store/utils/build-save-snapshot.ts`. Its typed field list excludes transient state, but optional fields still need a round-trip test. Preserve `lastCommittedWeekTick` and RNG zero, and clear missing optional values on career load instead of relying on a spread.
- **Optional additions need compatibility defaults.** Use `CURRENT_SAVE_VERSION` (currently 7); do not hard-code an older version in builders or docs. Missing fields in older saves need a defined default; structural changes may require migration.
- **Accumulated state ≠ derived state.** `careerStats` is rebuilt from match history so it's *not* in the builders; board confidence is accumulated so it *must* be. Ask "can this be recomputed?" before deciding where it lives.

## Engine & simulation

- **Smoke is a vision volume, not bullet geometry.** L12 wraps perception/flash rays only; shot and blast resolution retain the physical world. Constrain smoke samples and fire cells by 3D connectivity/support so a flat radar circle cannot spread through a wall or floor. Triangle hit normals are optional for existing callers; grenade bounces fail closed when a surface cannot provide one.
- **Model checkpoints are not source verification.** Lab landing/bounce targets compare with computed flight and never steer it. Keep source URL/notes separate, preserve draft status, and retain full hashes alongside explicitly scoped Node/Chromium comparisons. Original utility tuning is not calibrated CS2 data.

- **Sense/decide must precede all damage resolution.** A sequential fire-and-kill loop silently favors actor A in equal-reaction duels. L11 schedules both eligible rays before applying damage and permits simultaneous lethal trades. Aim reads observed knowledge; only perception and physical resolution can read the opponent world state (`engine/spatial/encounter.ts`).

- **Cross-runtime display angles can differ by one floating-point bit.** Mirage v12 native replay matches route geometry and every movement field exactly, but Node/Chromium heading values differ by up to 2.22e-16 radians in the inspected CT-to-A case. Keep full hashes for same-runtime repetition and an explicitly scoped motion hash for cross-runtime comparison; do not claim whole-frame parity or round physics to make a test pass. See `scripts/launch/mirage-v12-browser.ts`.

- **Dead branches pass tests.** The league-completion branch was unreachable (league matches stored in `playoffBracket`, so the bracket branch always won) — and its unit test encoded the *wrong* behavior yet passed for years. A green test on code you haven't proven reachable proves nothing. When fixing routing, check branch ORDER (`league` before `bracket` in `hasTerminalTournamentCompletion`).
- **Dedup scope must be all pending weeks.** `processAITransferMarket` deduped offers per-`currentWeek`; a listed player accrued a fresh offer every week forever (unbounded inbox). Pending = `!e.selectedChoiceId`, regardless of week.
- **Swiss grants at most ONE bye per round.** Per-bucket odd-team byes hand out N byes and corrupt who reaches 3 wins. Float-pair leftovers across buckets; bye only the final unpaired team (`engine/tournament/swiss-handlers.ts`).
- **`format` data must match engine routing.** The engine routes non-16/24-team "swiss" fields into bracket logic. Declaring `"swiss"` on an 8-slot event ships a lie; we relabeled instead of building unvalidated Swiss.
- **Repeatable income gets farmed.** Job-offer signing bonus (salary×4) was acceptable per-event but offers regenerate → infinite money. Any new income needs either a cap, a cooldown (`lastJobChangeWeek`, 12 weeks), or to be one-shot per deterministic ID.
- **Game-over pattern:** processor sets `save.gameOverReason` + `save.gameOverWeek` (see `finance-processor.ts:114` "BANKRUPTCY", `board-expectations.ts` "SACKED"); the dashboard overlay branches on the reason string. Don't invent a parallel mechanism.

## Store & UI

- **Player identity must travel with the portrait.** Pass `player.id` as `PlayerPortrait.seed` even when a real source exists, because it can fail. Main-menu save previews carry IDs too. Do not reintroduce separate live-head fallbacks in profile, squad or negotiation views: they produce different faces from the baked portrait pool. Record visual regression checks separately from source/render tests.

- **Verify a flag has readers before writing it.** Settings' "Replay Tutorial" set `onboardingCompleted` — grep showed zero readers; the real trigger is `triggerTutorial()` → `manualTutorialTrigger`, watched by `TutorialOverlay`. The button shipped broken for months. `grep` the consumer before trusting a setter.
- **Two settings stores, easy to cross the wires.** `lib/settings-store.ts` (localStorage, `useSettingsStore`) is the *canonical* home for display/audio/game-speed/autosave/notifications — that's where consumers read (`useLiveMatch.ts` gameSpeed, `ui-slice` notifications gate, `GameShell` autosave, `applyWindowSettings` resolution). `game-store` *also* has stale copies of `resolution`/`gameSpeed`/`notifications`. The standalone `/settings` page wrote the game-store copies → three inert controls; `SettingsModal` was correct. Rule: settings controls bind to `useSettingsStore`; if you must read a setting in code, read it there. `applyWindowSettings()` reads settings-store internally, so its inputs must live there too.
- **Built ≠ shipped.** `help-system.tsx` (full categorized game guide) and `stat-tooltip.tsx` existed, polished, imported by nothing. Before building UX, search for orphaned components: `grep -rln <name> | grep -v <itself>`.
- **Effect deps on object identity reset timers.** Toast auto-dismiss depended on the `toast` object; parent re-renders recreated the inline callback and pushed dismissal out forever. Key effects on `toast.id`, memoize callbacks (`ToastNotifications.tsx`).
- **Fixed bottom-right is contested real estate:** BugReportButton `bottom-6 right-6`, DevTools `bottom-6 right-20`, help button `bottom-24 right-6`. Check before adding floating UI.
- **`GameShell` is the single mount point** for global overlays (`app/layout.tsx` wraps every page). Dynamic-import with `ssr: false`, gate with `!hideChrome` for gameplay-only chrome.

## Testing & tooling

- **jest is node-env, `__tests__/` only** — no DOM, no component tests. Anything visual goes on the manual-verification list in TASK.md, not assumed covered.
- **Harness idiom:** local `makeSave`/`makeTeam`/`makePlayer` with partial overrides and `as unknown as GameSave`. Tests construct minimal saves; don't import fixture factories across test files.
- **Targeted lint:** `npx next lint --file <path>` — full lint is slow and noisy with pre-existing warnings; the bar is *zero errors*, warnings are legacy.
- **Incremental `tsc` masks errors the production build catches.** `tsconfig.json` has `incremental: true`; a stale `.tsbuildinfo` made `npx tsc --noEmit` pass locally while `next build` (fresh program) failed type-checking on `GameShell.tsx` (`window.electron` global augmentation not applied). Before trusting a green type-check ahead of a ship build, delete `*.tsbuildinfo` (or run `npm run build`). Fix the underlying typing locally (cast `window` per-use, as elsewhere in that file) rather than depending on a global `.d.ts` that the build may not pick up.
- **ESLint walks up to parent dirs without `root: true`.** A stray `~/.eslintrc.json` above the project double-registered `@next/next` → `⨯ ESLint: Plugin "@next/next" was conflicted` in `next build`. `.eslintrc.json` now sets `"root": true` to stop the upward walk.
- **Tailwind arbitrary values with commas warn as ambiguous.** `ease-[cubic-bezier(0.22,1,0.36,1)]` triggered a build-time ambiguity warning; register named tokens in `tailwind.config.ts` (`transitionTimingFunction.glass`) and use the semantic class (`ease-glass`) instead.
- **Engine imports in client components are fine if type-only or pure** — `career-stats.ts` pulls only types, so `board-expectations` in a dashboard component doesn't bloat the bundle. Check the import chain (`grep "^import" <module>`) before assuming.

## Process

- **Re-verify before fixing.** Multiple audit items marked "open" had changed state by the time we got to them. Trace to `file:line` in *current* code first; the audit doc records which claims went stale.
- **Risky refactors need their harness first.** Determinism hardening is deferred until a seed-replay test exists (same seed → byte-identical save), not because it's unimportant but because without the harness we can't tell if we fixed or broke it.
- **Conservative game design beats clever:** sacking requires a telegraphed on-notice season; rewards are capped; new boards start comfortable. Tension without cheapness — players forgive difficulty, not arbitrariness.

## September 2026 cleanup

- **IPC trust needs the current frame and exact origin, not only a window ID.** Main and Steam channels use `electron/ipc-policy.js` and the shared trusted-main-frame predicate. Keep every channel inventoried and test valid payloads from untrusted senders, otherwise schema rejection can disguise a missing sender check. Mod SVG responses need an inert document CSP in addition to safe paths.
- **Electron navigation cancellation happens in order.** `will-frame-navigate` precedes `will-navigate`; cancelling the first means the second never fires. Native probes must inspect the first cancellable event. Derive the launch URL after the local server selects its available port; never silently trust a second development origin.
- **Steam Cloud can reject an operation without throwing.** The installed SDK returns booleans; preserve an explicit acknowledgement through both main-process IPC and `SteamService`. A local save may succeed while Cloud synchronization fails.

- **Major React/Fiber upgrades need one consistent dependency graph.** React 19 uses Fiber 9/Drei 10; current Fiber 9.7 excludes React 19.3. Resolve cleanly without force/legacy-peer bypasses, then prove `npm ci`, types and the production worker. Next 15 pins old PostCSS internally, so patch and validate that nested copy as well as the root. Do not run a standalone type check concurrently with build cleanup, which removes generated `.next/types` inputs.

- **Next client builds can fold `typeof window` inside workers.** A storage module imported by the production worker accessed `window.electron` before READY. Use runtime `globalThis.window` guards for shared entry dependencies. `npm run verify:worker-build` boots the actual compiled chunk without DOM globals and rejects IndexedDB opens during startup.
- **Worker timeout is a transport failure, not permission to accept a late result.** Correlate responses, terminate failed workers, capture input and seed before awaiting, and keep the fallback compute-only. Store-level tests must exercise the real final commit action.
- **Close acknowledgement is separate from save completion.** The native watchdog covers receipt only. Once acknowledged, wait for saving or the player decision. Cancelling close must leave autosave running; unregister IPC listeners on unmount.
- **Recurring forecasts must use settlement math.** Dashboard and finances now adapt EconomyEngine; equipment upkeep belongs in its weekly expense report and is ledgered exactly once. One-off transactions remain outside that recurring forecast.

- **Reserve the display font for branding.** Forcing Archivo Black on body plus the Tailwind sans token made even small labels heavy. The September glass pass uses the platform sans stack and leaves Archivo as `font-display`. Keep dense cards free of backdrop blur and avoid layered page entry animations.
- **Programmatic dialogs still need a trigger for focus return.** The navigation search opens with Ctrl/Cmd+K or its visible button; that button is a Radix DialogTrigger. Verify Escape returns focus and names remain available when the sidebar collapses.

- **Settings hydration is not career readiness.** `_hasHydrated` becomes true while `loadGame()` still owns `isLoading`. A direct entity route must wait while its missing record is loading before calling `notFound()`; otherwise the error boundary persists after the valid record arrives. The player profile now covers this with rendering tests and a real refresh check.
- **Identity refreshes must preserve correspondence.** Use stable IDs and known previous stock names, keep unknown/custom identities intact, and validate full records so roster/stat changes cannot hide behind a bulk rename. Portraits are reused; a face source file is not a reliable source of player identity.

- **An RNG accumulator must stay bounded.** Mulberry32 bit operations wrap each sample, but an unbounded JavaScript accumulator eventually loses integer precision. Compare a multi-million-draw uninterrupted stream with periodically reconstructed RNG state. Zero is a valid seed; use nullish defaults.
- **Replay probes must prove their transport.** Matching output alone can conceal a broken worker silently using fallback. Assert actual worker availability, then compare subsequent weeks after a real save/load. Keep commit metadata exclusions explicit and narrow.
- **A test runner can consume cosmetic randomness.** Jest source-map sorting uses Math.random while formatting logs. Vary ambient randomness and compare canonical gameplay instead of globally throwing from Math.random, which can fail in diagnostic code.
- **A disabled autosave does not cancel a manual save.** Native close must await already pending writes. Device preference hydration must precede audio gain connection; Studio and hidden-window gates cover effects as well as music.

## 2026-09-13 ? Registered spatial review

- Radar image registration is not floor or collision acceptance. Keep image hashes, map version, explicit height ranges and author review separate; a cached validation signature never grants release approval. Preserve original annotation vertices in a separate review copy.
- Navigation polygons may be inset from physical floor. A full-body floor check needs the selected center surface plus bounded foot support, including actual downward collision rays at inset borders. Test void and wrong-floor rejection alongside that positive case.
- A production worker can have a bootstrap plus shared Webpack chunks. Loading the chunk containing onmessage does not execute it. Native integration probes must start the generated bootstrap and serve its dependency chunks.

## 2026-09-13 - L14 replay boundaries

- A live checkpoint needs its original pending event queue and processed cursor. Displayed scores/rosters alone cannot reconstruct an in-flight round safely. Preserve visible deaths and purchased weapons separately from already computed round-end economy.
- A repeatedly cancelled debounce can starve at fast playback speeds. Keep a fixed checkpoint cadence, clone at the store boundary, and capture the owning career at initialization; reading the current career when an old callback fires can misattribute its data.
- Saved veto maps outrank URL hints. Reject contradictory result maps rather than changing the label on events from another map. Match seed zero is valid; adapters must not replace it with a fresh global RNG draw.
- Completed match IDs guard every downstream reward/stat mutation, including when stale scheduled data still contains the same ID. Keep XP annotations attached to the actual committed result object.
- Spatial replay consistency is narrower than career acceptance: lab frame/event parity does not prove complete 5v5 matches, purchased economy, durable simulator checkpoints or affordable season cost.

## 2026-09-14 - L17 development evidence

- SaveManager.importSave intentionally creates a new career identity. Deterministic persistence tests should use normal saveGame/loadGame when comparing canonical save IDs; do not normalize away identity or change import semantics to pass a soak.
- Training effect authority belongs to the drill catalog, not caller-provided rewards. Apply talent discounts only to positive fatigue so recovery is not weakened. Technical potential should not cap health or morale recovery.
- A passing lifecycle hash and unique ownership do not prove sufficient player supply or balanced finances. Record roster shortages and season cash alongside repeatability. Small league fixtures can strongly distort prize income and free-agent availability.

## 2026-09-14 - L18 organization contracts

- Resolve a sponsor from the live offer pool before any tier/name/cooldown checks. Persisting the canonical offer afterward does not prevent a spoofed tier bypass in earlier validation. Current STANDARD and legacy BASIC labels represent the same slot.
- Commercial forecasts must include the existing reputation income floor: signing a small sponsor may add zero cash. Show base offer payout separately from the incremental settled amount.
- Staff renewal UI must inspect the store result; a negotiation acceptance estimate cannot override an expired contract or cash-reserve rejection.
- Equipment ratings currently feed legacy team strength, not permanent player attributes or training speed. Keep copy explicit, count one item per slot, and reject same-item repeat purchases before charging.


## 2026-09-14 ? L19 tournament/calendar boundaries

- A complete bracket audit must check series winning scores, not just a champion. Automatic veto previously supplied only three maps to BO5 and could finish 2?1. `simulateMapVeto` now receives format; the real audit asserts map count and required wins.
- Build the entire draw before propagating byes. Use standard seed positions and source-index assignment; 12-team bye-versus-bye branches otherwise stall. Do not silently reseed already played owner draws.
- Pairwise head-to-head tie comparators can be non-transitive. Use a mini-table across the whole tied group, then stable criteria. Recomputing standings must deduplicate match IDs.
- An empty scheduled list is insufficient proof of league completion. Require its declared rows/full pair set. Require third-place completion before reward/qualification finalization, and derive bracket champions from actual final results.
- Qualification promotion belongs at the common terminal reward boundary, including AI-only events. Pass season instance IDs into eligibility/tier resolution; store circuit receipts must also guard repeats.
- Scheduling must include completed fixtures and roll full weeks forward; it must not reuse an occupied default day. Preserve scheduled days in AI result records and do not simulate future weeks. Full daily/legacy/world acceptance is still open.
- L19 evidence: 1,533 tests / 156 suites; 13 repeated real MatchEngine tournament cases with normal weekly save/load; build bxlHNghfTicUnk6xOcJ0h and actual native worker pass. This is not full computeWeek tournament careers, visual UI or packaged acceptance.


## 2026-09-14 - L20 career boundaries

- Reading a job offer is not resolving it. Validate selectedChoiceId/withdrawal/deadline/origin tenure, and route store and engine acceptance through one action. All old-tenure choices must be invalidated when switching clubs.
- Academy plans and reports belong to the club, not the manager. Optional per-team management archives survive canonical save/load; include archived academy ownership in recruitment guards, upkeep and retained references. Long-absence AI academy behavior still needs acceptance.
- Season history needs managed stints when a club changes mid-season. Whole-week attribution currently gives the departing club the move week and starts the new stint next week; finer daily attribution is a known follow-up.
- Recaps must filter by managed team/season, not subtract player wins from the entire world's matches. PRIZE income is not total revenue; inherited club trophies are not manager achievements.
- A top-175 club cannot reasonably be given a top-26 survival target without context. New low-ranked boards use persisted relative targets; short incoming stints get a grace review. Sacking still needs previous notice.
- L20 repeated 520-week real computeWeek fixture: two job moves, 12 history stints, no roster shortages, max 502 events, identical saves. It remains a three-club fixture with excessive cash and zero natural new decision triggers; do not call it balanced or full-world acceptance.

### L21 ? Match-management boundaries (2026-09-14)

- Fixture setters must not write paid preparation flags or reopen purchases. Validate ownership, completed/active state and current daily date in the transactional purchase path. A sealed veto requires the full format pool, and side selections must follow that pool.
- Loadouts belong to the managed team; apply explicit slotIndex rather than array position. Clone store player/staff records before transient talent adjustments. An active/recoverable match must be resumed, not replaced through instant simulation.
- Timeouts now relieve only own losing-streak pressure for two generated rounds, two per series, between rounds only. Keep real loss-bonus state intact. Existing timeoutBoostRounds storage is retained, but rule changes affect future rounds; recorded pending queues stay authoritative. Legacy engine tag alone is not a cross-build deterministic replay guarantee.
- Save match-time lineup IDs with results; current club rosters rewrite history after transfers. Older results disclose the fallback. New IDs survive canonical save/load but do not replace a full historical player archive.
- Evidence: 1,553/158 tests, build w85noNhQbAmNk10nuJvH6, worker 3816.a285fccc44f6c408.js, native run-btAkJk, paired audit seed 3921. Browser inventory empty, so no UI acceptance. App ID 4326170 passes; content gate still fails.

### L22 - First-session persistence (2026-09-14)

- Tutorial flags in device persistence are not career progress. Optional firstSession data must pass create, canonical snapshot, save/load and explicit legacy defaults. Old careers default to dismissed; replay changes only guide state and does not change the new-game preference. Do not revive the device-global clicked-link checklist or manual timestamp trigger.
- Links are not completed decisions. Squad/budget require an explicit review; weekly focus requires a valid selection; first-result review requires a managed-team result. Keep free regular training selectable when no plan exists and in debt. Paid choices validate current affordability at the store boundary.
- selectedWeeklyActivity was missing from canonical saves; it is now optional, validated and explicitly reset across careers. Guide/plan changes use the normal serialized save pipeline.
- New-game initialization reports failure in store.error rather than necessarily throwing. The page must check it before navigating or counting a new career. Draft inputs are separate bounded device storage, clear only after success, and do not skip validation on recovery.
- Evidence: 1,560/159 tests, build X-YUbkV5tvJuK3DL9cuDK, worker 3816.0d3a693d9299321c.js. Real-store Electron profile run-wHIpqn verifies guide/plan reload, skip/replay, old-career isolation and first-match completion. Browser unavailable; no fresh participants tested. A prepared 12-person protocol is not acceptance evidence.


### L23 interface consistency (2026-09-14)

- GameShell scrolls inside main; Next's window scroll handling does not restore that panel. Keep route/career-scoped scroll separate from persisted careers, observe late content briefly, ignore placeholder clamp events during restoration, and yield to user input. Do not read the outgoing scroll during layout cleanup after the next page has already shortened it.
- UI state is a bounded, in-memory presentation cache. Old career filters must not bleed into a newly selected career; no-career/loading controls must not become defaults. Desktop/Inbox and Map Studio own their interaction state.
- Keep dense GlassTable content on the existing non-blurred card surface with one horizontal scroll owner. Shared dialog caps do not fix bespoke modals automatically. Actual focus, zoom and resolution checks remain necessary.
- 1,571/162 tests and build P6YMlEYBkceFlAeTBiDU5 pass. All 150 prepared L23 UI cases remain NOT_RUN; a source inventory or HTTP status is not an accepted screenshot or interaction case.


### L24 accessibility/input/readiness (2026-09-14)

- Focus traps must enumerate inside the active dialog, refresh visible enabled controls and retain summary/trigger focus. The old helper scanned the document and was unused. Signing/staff/settings now use a scoped helper; nested custom/Radix overlays and screen-reader background exclusion still require real UI checks. Keep one skip link and make main programmatically focusable.
- Label Radix slider thumbs, not just the root wrapper. Provide meaningful units. Coordinate alternatives in Map Studio and Spatial Lab must use the existing edit/undo/validation paths, preserve locks and refuse edits during recovery; never bypass geometry surface selection.
- Contrast preferences previously applied only after visiting Settings. Keep them in validated device settings, adopt the earlier key once and let explicit Off win. Theme foreground/background variables expect HSL components, not hex strings. Confetti must check app/OS motion settings both before and after lazy loading.
- Literal interpolation needs a callback and one substitution pass; dollar-sign replacement tokens or braces in names must not change text. English is the only implemented UI language. Dictionary registration is not complete route translation: no UI consumers currently import the helper.
- 1,589/163 tests and build s-yb7lubDHeLiB9Wk6WOV pass. Actual browser/input/contrast/glyph cases are NOT_RUN; do not turn source scans, mocked storage hydration or focus-index tests into UI/Steam input acceptance.

## L25 identity delivery (2026-09-14)

- Audit public launch snapshots, not raw import snapshots. Team logo wrappers must share the same ID/path resolver; guessed display-name paths bypass identity policy. Preserve explicit user/mod SVGs and upload priority.
- Whole-roster SVG ID tests do not detect identical-looking teams. Hash rendered pixels separately and record shared families honestly: 198 teams, 15 studies and 183 family fallbacks in this increment; 18 identical-pixel groups.
- Contrast-test dark primary colors on dark panels. Small-size enlargement can clip crests; validate decoded transparent raster margins, not just SVG viewBox values. Export manifests include renderer/design/catalog source hashes plus delivered file hashes.
- Review PNG/WebP exports under docs are not a shipped fallback pack. A builder exclusion is not packaged evidence. All visual/rights approval remains open; content gate holds 4,986 items. 1,595/164 tests and build cq8dsNxFQpI_H_o3H8Svp pass.

## L26 content and audio (2026-09-14)

- Zero revenue must stay zero: never use a nonzero `||` fallback in finance UI. Income bars must use actual proportions. Forward `value` to Radix Progress, not only its visual transform. Use shared exact money for contract decisions.
- Check the consumer of an effect before describing it: Bootcamp effects.xp=2 is converted into a flat +50 XP award, not doubled training XP. The widget/help/processor now share that formula without changing balance.
- Rate-limit audio separately from visuals and simulation. Routine info/XP can be silent; errors should still interrupt normal feedback. Finished music oscillators need disconnect and tracking removal; one shell owner handles menu/match/studio scenes.
- AI-assisted crest paths rendered from code are still visible artwork. Inventory player-consumed content separately from coding assistance; procedural audio/simulation are not automatically live model services. No authorship/rights claim follows from a filename or static scan.
- 1,608/166 tests and build 2GX-oYzTzbaGEiXjb0G1r pass. Browser selection is unavailable; 18 UI/audio/content cases NOT_RUN. The mix is not audibly accepted, and 4,988 content items remain held.


### L27: isolate performance evidence and quote cache lifetime (2026-09-14)

- Freeze exact career bytes, RNG, flags, host and lockfile before comparisons. A late fixture with expired contracts measures mass recruitment, not ordinary late play; retain an active-contract comparator. Never overlap benchmark runs with builds/tests.
- Recruitment wages may be reused only within the synchronous vacancy-fill operation where remaining candidates and week cannot change. Rebuild affordability/ownership per hire; discard quotes before another team/week. Require identical state/RNG outputs.
- Node VM execution verifies the real compiled worker code but is not a Chromium worker, transport or Electron performance trace. Memory-backed SaveManager timings are not durable-save latency. Compute-soak heap grows with career data; renderer/listener/native stability needs actual sustained play.


### L28: campaign failures before curve tuning (2026-09-14)

- Senior AI scouting must create canonical affordable contracts; legacy player.salary fields are not wage obligations. The AI-specific season-end retirement path must terminate contracts as well as remove roster IDs.
- Short IDs can make charCodeAt variance nonfinite. Recorded KPR needs recorded rounds, not maps. Retain nested pre-serialization finite checks and failure snapshots; JSON silently converts NaN to null.
- Separate synthetic three-club wealth, deliberately underfunded world cases and natural snapshot finances. Stop bankrupt/sacked careers and report censoring. A 30-seed small-world campaign is not a final integrated full-world acceptance campaign.
- Pair exact input/RNG hashes and preserve seed-level outcomes, failures and annual saves. Capture source hashes at run start; extending the harness during an older run must not relabel that run with later code. Small confidence intervals and aggregate tactics do not establish human counterplay or spatial calibration.

- Finance settles before tournament prizes. Reconcile positive end-of-week cash before committing a provisional bankruptcy, while preserving older terminal careers and board dismissals; do not solve this by granting bailout money. The L28 week-33 ledger showed -$59,883 before a $360,000 prize and +$300,117 afterward.


### 2026-09-14 ? L29 imports and original identities
- Community JSON sections must commit together: separate per-file writes mix old omitted sections into new imports. `database.json` is authoritative, `{}` is a removal tombstone, and `database.previous.json` preserves rollback. Legacy files are read only without a modern database.
- Original and fictional player IDs have no intersection. Map by unique retained source team number + nationality + all 20 stats, then verify team roster correspondence. Row order alone is insufficient; portrait stems may contain dots.
- Raw image suffixes can lie: four `.webp` files were web markup. Validate bytes/dimensions and retain a missing-asset report. Local originals are not proof of permission, and a separate community mod does not imply legal clearance or independent authorship.
- Current `/mod-assets/` URLs depend on the active mod folder. Names/stats survive in saves, but per-career image pinning and offline/versioned packages remain release work.
- Publisher default is local verification; no Steam initialization without `--publish` and a review tied to the inventory. Keep dist-mod/raw-data outside base artifacts.
- Native Electron probes inherit `ELECTRON_RUN_AS_NODE=1` in this environment. Remove it for the probe child and restore the calling shell value; use isolated userData and hidden windows.


## L30 ? 14 September 2026

- Installed steamworks.js 0.4.0 exposes singular achievement and integer stats; verify native declarations and boolean returns instead of assuming wrapper APIs. A connected bridge is not proof of a successful store/unlock.
- Cloud-only discovery must initialize the bridge independently of achievement triggers. Explicit divergent-load choices retain both originals; upload needs its own observed-version guard. SDK file reads are not cross-device atomic compare-and-swap.
- Pin original mod bytes before activation and keep serving prior bundle IDs after database selection changes. Cached Workshop selection must fail closed if its bundle disappears; never silently activate community content.
- Imagegen returned master dimensions different from the requested sizes. Record actual dimensions and distinguish promotional art from screenshots; do not claim an upload-ready capsule package without final exports.
- Real Steam read-only identity/ownership/settings evidence is separate from synthetic SDK tests, native IPC transport and packaged acceptance. L30 remains partial; continue with L31.


## Steam asset delivery follow-up

- Owner approved exact-size local exports. A PNG with apparent checkerboard is not transparent: inspect hasAlpha and raw alpha. Generated logo candidates failed this check; use the delivered native vector wordmark for clean portable PNG exports.
- The 18-file upload pack is outside game/package content. Browser inventory was empty, so no Steam upload occurred. Existing archive screenshots were outdated; a capture checklist does not count as a finished screenshot gallery.


## Steamworks follow-up 15 September 2026
- Package upload-ready images separately from source masters; never mix About panels, app icons and capsules in one drop batch.
- Steam store presence approval does not imply build approval. Live review rejected Build 23989573 for missing EsportsManager.exe; do not redirect to the bundled 7zip helper executable.
- Steam description editor defaults to the account language (Swedish here), independently of the English short-description selector. Explicitly choose English before editing.
- Legacy short-description onchange required actual sequential keyboard input and blur to persist in this session; verify after Save navigation, not only input.value before Save.
- Legacy graphical drop area did not open a file chooser. Description V?lj fil chooser succeeded; three feature panels uploaded. No capsule upload or review submission occurred.

## L31 packaging follow-up
- Fictional player names do not remove unused asset files from a public/**/* package glob. The 4,988-row gate covers source and development files too; distinguish unresolved inventory from proven third-party content.
- The direct upload entry point must enforce the same package guard as SHIP_GAME.bat. Check the VDF destination before login; never interpolate the account name into a command shell.
- Local QA packaging uses dist-qa, a LOCAL-QA-ONLY marker, separate userData, and disabled Steam initialization. It must never be uploaded as the release artifact.
- electron-builder FileSet mapping for the QA entry must use a directory plus filter; a single-file from mapping omitted the archive entry. Archive sanity checks caught it.
- This terminal inherits ELECTRON_RUN_AS_NODE=1. Clear it only in the launch process environment for actual Electron UI startup; otherwise the executable exits as Node and rejects Electron switches.
- L31 actual packaged QA startup passed with isolated userData and Steam disabled. Boot success is narrower than installed Steam, save/reload, or full-career acceptance.

## Artwork and gallery follow-up
- Preserve portrait pool ordering when relocating assets: deterministic identity assignments depend on it. Verify migration bytes and old-save aliases, while preserving community mod URLs.
- Store TypeScript backups with .bak, not .ts, even under tmp: Next type checking can include them.
- A QA executable boot and local production browser gallery do not establish Steam installation acceptance. Record installed/target Steam Build IDs separately.

- Energy and fatigue are separate simulation fields. Never label inverse fatigue as Energy; preserve energy=0 with nullish/finite handling.
- Stable colors plus a small hash-selected motif pool can produce identical stock crests. Allocate canonical stock combinations independently of save ordering, while preserving user replacements.
- On Windows, normalize ASAR paths before statFile/extractFile; slash-normalized report paths alone fail nested entry lookups.
- Awpy's upstream licensing distinguishes MIT build scripts from Valve-owned extracted assets; do not propagate the tool license onto generated game-asset bundles.

- EM v2 icons are reproducible vector compositions from outlined Barlow glyphs, not unknown raster masters. Verify this source chain before treating all marketing assets as uniformly unresolved.
- Archivo Black runtime WOFF2 exactly matches @fontsource/archivo-black 5.3.0. Its local OFL differs in whitespace only. Byte-match fonts and normalize license text deliberately; do not silently approve other files.
- Excluding logo.original.* alone leaves regular legacy logo.png/webp copies in packages. Exclude regular legacy raster logos too; verify archive contents and preserve local sources. Keep fictional SVG designs and user/mod replacements outside retired stock paths.

## 2026-09-21 - Physical career ownership

- Verify input/replay hashes, then compare session/revision again inside the store mutation after asynchronous verification. An old career result must never commit to a newly loaded one.
- Preserve exact surviving armor; a boolean otherwise refills it each round. New slots discard inherited worker journals.
- Team simulation must use the same links, stance and toggles as route preview. Finish committed flights, use airborne speed bounds, and clear ledges before gravity on drops.

## 2026-09-21 - Physical series lifecycle

- Check map clinch before overtime half/set reset; otherwise a boundary winner is lost or reset incorrectly. Keep round receipts map-scoped and map summaries series-scoped.
- Freeze career combat attributes/roles, map order, seed and side assignment in the rehearsal. Bind identities to side geometry slots after swaps; do not move geometry labels with the team.
- Charge physical armor repairs explicitly. A retained helmet and depleted vest must not either prevent repairs or charge for another helmet. Reject zero-cost unknown utility IDs.
- Gate buy/map/final transitions by phase and session revision, then compare ownership again after dynamic imports. Old single-round journals remain readable; new slots still discard inherited rehearsals.

## 2026-09-22 - Mirage redraw metadata

- Redrawn polygons get new IDs and can lose spatial/site bindings. Recheck labels, IDs and reference floor samples; never transplant floor metadata purely by old mark ID.
- The v13 CT spawn default 0..72 range is not its world floor (around -266). Radar upper/lower labels are not absolute Z coordinates.
- Navigation-safe floor samples do not certify bomb trigger extents. Keep original area vertices and a separate repaired draft; do not claim raised crates as ground to silence coverage errors.

- Mirage installed VPK contains native bomb target hulls and enabled team spawn entities. Spawn origins and trigger volume Z must not be confused with standing-floor coordinates. World physics has query-specific collision categories; flattening all shapes produces incorrect walls. Native nav currently exactly matches pinned Mirage reference.

- Other native maps need entity model translations (Anubis, Inferno, Overpass, Vertigo). Nuke B has six convex trigger pieces; preserve their union instead of a bounding polygon. Disabled spawn entities exist in Inferno/Nuke/Overpass. Vertigo T spawn is on the lower radar; site IDs must come from bomb_site_designation, not model naming.

- Native multi-hull site labels overlap badly when each piece carries a full name. Render one overview label per site group and show full source labels on selection. Native spawn origins should be small team-colored pins, not full callout labels. The existing career radar still estimates positions and shot links from events; native editor screenshots do not certify live physical playback.

## Radar boundary and route updates

- Outer-contour extraction discards internal voids. Anubis now uses a separate additive boundary receipt so upgrades do not resurrect deleted lineup guides; preserve native navigation on every height before tracing a closed wall. A dark radar patch is not a verified infinite wall.
- Physics categories are query-specific: Anubis has player-only clip, player-excluded and grenade-excluded geometry, pass-bullets, window and sky. Default-solid vertical-face proximity is evidence, not a runtime collision certification.
- The legacy radar replays from round start on each seek/render. New A* route caching must be bounded and return copies; otherwise callers mutate cached paths or rendering becomes expensive. Keep estimated positions distinct from physical replay truth.

## 2026-09-23 - Physical radar playback
- Pair recorded world coordinates with the reference radar, not the independently registered editor source image. Use world altitude for floors and invert yaw for image Y. Never interpolate straight across unsampled corners.
- Keep the exact round binding/receipt when series progression resets map receipts or swaps sides. Do not derive old replay identity from current roster order.
- Capture replay checkpoints outside Immer mutations: structuredClone cannot clone draft proxies. Compare ownership before saving; key checkpoints by replay hash and engine. Bookmark updates must not reset the playback verification effect.


## Physical calibration v4 (2026-09-23)
- Recoil decay must run before reload/sight/blindness early exits, and inter-burst cadence must permit recovery; otherwise accumulated pitch can miss indefinitely.
- A transient teammate obstruction must not permanently retire a goal after that blocker leaves. Track the actual blocker and clear stale records on successful movement; retain world collision checks. Broad crowd-yield changes worsened Mirage and were discarded.
- Version simulation changes and reject old pending/series continuation under new rules while preserving replay viewing. Keep a sealed baseline before calibration; never label a changed-rules result as an older engine.


## Squad spacing v5 (2026-09-23)
- Use the local upcoming entry route direction, not the distant objective vector, to decide whether support is ahead around bends. Avoid reversing an ahead support into the entry.
- An occupied following endpoint must not become a static navigation obstacle. Validate the world route, stop short along its path and retain all swept body checks. Never truncate a jump or ladder mid-flight.
- Full-duration combat and no-gun navigation stress can diverge: defenders still occupy space and sightings still change plans without shooting. Report objective congestion explicitly rather than inferring plant readiness from reduced waits or successful elimination rounds.


## Objective coordination v6 (2026-09-23)
- Reserve the exact bomb objective for the carrier/recoverer/defuser. Use separately reserved reachable perimeter positions for teammates; never substitute unchecked floor samples for complete movement validation.
- Defuse travel must target the actual planted point, not a bombsite marker. Post-plant T policy must stay on the planted site even when old opening assignments or new sightings suggest a rotation.
- A custom Next dev server conf.distDir alone did not isolate compiler workers. They reload next.config.js independently. Use a process-local environment flag in root config and verify production manifest persistence after actual dev compilation. The isolated route types are included in tsconfig.json.


## Recovery route ownership v7 (2026-09-23)
- A destination-distance threshold cannot decide whether an existing route is reusable. Following intentionally truncates routes; recovery/defuse/engagement tasks need their own route purpose and must invalidate an old shortened track even at a nearby endpoint.
- Compute route purpose before overriding intent with temporary blocked status, or a blocked-state transition can accidentally clear bounded failure retirement.
- A regression fixture with an enemy in sight can mask this route bug: a trade reaction changes the goal, causing an incidental replan. The controlled test occludes that enemy and fails on preserved v6 before passing v7.


## Recovery support v8 (2026-09-23)
- Turn toward frozen, recently delivered observations only after reaction time. A report is not firing permission: keep direct-sight, aim, world-ray and first-body checks in the live shot path.
- Forecast authored recovery utility with copied inventory, the actual release position and the same collision model. A landing target alone is insufficient: smoke must screen the reported threat-to-pickup ray, and flash preflight must check current friendly exposure.
- Reserve the release tick against movement. Otherwise preflight and actual release use different positions. Serialize same-player authored throws and prevent simultaneous gunfire during the utility interval.
- Keep old replay recordings readable while rejecting old-engine pending work under new rules. Do not conflate controlled utility tests with validated real-map lineups.
- Timing tests can fail under overlapping build/simulation load (8.09x vs an 8x limit here); preserve the failure log and rerun unchanged before claiming a regression. Separate rerun was 1.54x. Never relax the gate to hide host contention.


## 2026-09-23 shared map rehearsal
- Validate all selected native spawn-to-hold routes, not only the first spawn per side. Grounded positions can still have unusable approach paths; record exclusions and choose another enabled start for the fixture.
- Teammate planning geometry must use the same footprint as execution. Square reservations falsely reject legal diagonal starts against circular runtime bodies. Reservations must not supply floor support.
- Keep native bombsite convex pieces separate, preserving XY gaps and Z bounds. Do not replace their union with one large hull.
- Await an actual screening smoke effect before pickup; queuing or detonating a throw is not proof that the reported angle is screened.
- Store full-round source/fixture hashes and report blocked survivors separately from legal round settlement. A timeout is not navigation certification.

## 2026-09-23 crowd and utility v10
- A passing pocket must clear the requester's future lane and stay occupied until passage. Immediately returning to the station recreates the jam.
- Follow triangle-fan seams inside nonplanar nav polygons; linearly interpolating only the endpoints can lose floor support. Tiny native height changes still need explicit step handling.
- Forecast destination body clearance as well as the sweep, and include stance height in cached footprint keys. Passing a sweep alone does not imply the live destination is legal.
- Separate static route failure from body reservations: Overpass CT5's final route arrives against the world, fails with teammates, and cannot be fixed by crouching. That is tactical cover/passing coordination, not a wall drawing problem.
- Per-map utility calibration should verify source/mesh/fixture hashes, real screening before pickup, finite inventory and exact model trajectory. A controlled 2T/1CT fixture is not a full-match or real-game lineup certificate.
- Keep the failure evidence for performance tests under load and rerun unchanged when simulation/build jobs finish. This run's 10.05x failure became 1.89x in isolation; do not raise the threshold.
- Report final blocked survivors and no-plant timeouts alongside legal round outcomes. The v10 campaign has one blocked combat support and eleven no-gun blocked survivors despite all rounds settling.

## 2026-09-25 physical coordination v11
- A blocked native portal midpoint does not prove the whole shared edge is blocked. Offer bounded alternate crossings only with body reservations; retain surface, stance, footprint and swept-clearance checks, and prefer the original crossing when valid.
- An exhausted shortened follow track is stationary even when its teammate-follow goal is distant. Such players must participate in passing arbitration. A regression must assert the waiting carrier actually passes, not just that a yield event occurred.
- A passing pocket may be valid while its direct route crosses a teammate. Retry that candidate with body-aware routing before rejecting it. This was necessary to restore Ancient planting; merely accepting retired requesters did not help and was reverted.
- Failed cover assignments need bounded rejection memory and retry backoff. Cache reservation worlds only while their exact reserved coordinate list is unchanged.
- Precise opposing-body planning reservations may come only from current direct perception, never stale/radio contacts. Opposing stand-offs with gunfire disabled remain a separate stress-test limitation; do not fix them by ghosting players.
- Validate final engine and fixture hashes. Intermediate passing receipts become stale after behavior changes. Seven moving recovery examples passed, but they do not certify full combat or real-game utility lineups.
- Use a focused real-mesh regression for recorded passage failures and a separate full-round campaign. Run heavy calibration/build jobs sequentially when host CPU/RAM is constrained; never stop unrelated applications to accelerate checks.

## 2026-09-25 approach recovery v12
- A whole-route body reservation failure does not prove static geometry is unreachable. A validated world approach can reach local passing arbitration while every executed step still checks live swept bodies. Never relax runtime body collision to clear a planning failure.
- Mirrored identical roster series should reverse team ownership while keeping physical replay hashes identical. Exercise the actual pending JSON journal, purchases, duplicate delivery, overtime and finalization. Halftime/overtime economy resets legitimately differ from immediate round settlement.
- Engine slots are T1..T5/CT1..CT5 in parsed production requests; synthetic test fixtures must respect those IDs.
- Gunfire-enabled recovery evidence must require actual shots, but shots before smoke do not prove incoming fire throughout pickup. Keep scenario limits explicit.

## 2026-09-25 recovery interruption, real BO3 and audit follow-up
- Fault-inject a recovery smoke failure only into the live multi-actor simulation. Utility preflight also steps a simulation; failing both prevents the wait from ever beginning and tests the wrong path.
- A real BO3 can end 2-0: report only maps actually played, and do not infer overtime/decider coverage from the configured pool. This run played Vertigo/Anubis only, 43 rounds.
- Steam store publication and app-data publication are separate. Store editor can have unpublished changes while App Data Admin reports no differences. Keep old review Build IDs distinct from the current default.
- steam_appid.txt is a development hint, not a required depot file or secret. Audit the explicit release resolver and nested-file exclusion; retain native installed-Steam acceptance separately.
- Classify source comments/reference URL literals in memory using a parser; preserve actual source/attribution and keep visible strings/data scanned. Parser errors fail closed. These classifications do not grant rights to downloaded content.
- Browser viewport capability can report success without changing the observed tab size. Measure innerWidth/innerHeight before claiming target-resolution acceptance, then reset temporary overrides.

- Portrait identity must be keyed by permanent player ID: legacy team/name transforms changed after image baking. Restore exact authored faces via verified raw-to-stock identity mappings, preserving explicit custom art. Use Map lookups to avoid inherited constructor/prototype keys from imported IDs. Error state must track the resolved image URL, not its pre-migration source.
