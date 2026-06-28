# LEARNINGS.md — Non-obvious constraints (each one already bit us)

> Add entries when something surprises you. Keep entries short: the trap, the rule, where it lives.

## Persistence & save schema

- **The two explicit save builders silently drop unknown fields.** `store/utils/build-save-snapshot.ts` and the `saveGame` action (`store/game-store.ts` ~line 1939) enumerate every `GameSave` field by hand — deliberately, to exclude transient store state. Load (`...hydratedSave`) and tick-result (`...processedSave`) paths spread wholesale. So a new field round-trips *everywhere except saving* unless added to both builders. Mirror the `fplData` lines. This cost us a debugging round on `boardState`.
- **Optional fields = no migration.** `saveVersion` stays at 6; old saves get `undefined` and code must default. Pattern: `ensureBoardState()` runs every tick to backfill.
- **Accumulated state ≠ derived state.** `careerStats` is rebuilt from match history so it's *not* in the builders; board confidence is accumulated so it *must* be. Ask "can this be recomputed?" before deciding where it lives.

## Engine & simulation

- **Dead branches pass tests.** The league-completion branch was unreachable (league matches stored in `playoffBracket`, so the bracket branch always won) — and its unit test encoded the *wrong* behavior yet passed for years. A green test on code you haven't proven reachable proves nothing. When fixing routing, check branch ORDER (`league` before `bracket` in `hasTerminalTournamentCompletion`).
- **Dedup scope must be all pending weeks.** `processAITransferMarket` deduped offers per-`currentWeek`; a listed player accrued a fresh offer every week forever (unbounded inbox). Pending = `!e.selectedChoiceId`, regardless of week.
- **Swiss grants at most ONE bye per round.** Per-bucket odd-team byes hand out N byes and corrupt who reaches 3 wins. Float-pair leftovers across buckets; bye only the final unpaired team (`engine/tournament/swiss-handlers.ts`).
- **`format` data must match engine routing.** The engine routes non-16/24-team "swiss" fields into bracket logic. Declaring `"swiss"` on an 8-slot event ships a lie; we relabeled instead of building unvalidated Swiss.
- **Repeatable income gets farmed.** Job-offer signing bonus (salary×4) was acceptable per-event but offers regenerate → infinite money. Any new income needs either a cap, a cooldown (`lastJobChangeWeek`, 12 weeks), or to be one-shot per deterministic ID.
- **Game-over pattern:** processor sets `save.gameOverReason` + `save.gameOverWeek` (see `finance-processor.ts:114` "BANKRUPTCY", `board-expectations.ts` "SACKED"); the dashboard overlay branches on the reason string. Don't invent a parallel mechanism.

## Store & UI

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
- **Engine imports in client components are fine if type-only or pure** — `career-stats.ts` pulls only types, so `board-expectations` in a dashboard component doesn't bloat the bundle. Check the import chain (`grep "^import" <module>`) before assuming.

## Process

- **Re-verify before fixing.** Multiple audit items marked "open" had changed state by the time we got to them. Trace to `file:line` in *current* code first; the audit doc records which claims went stale.
- **Risky refactors need their harness first.** Determinism hardening is deferred until a seed-replay test exists (same seed → byte-identical save), not because it's unimportant but because without the harness we can't tell if we fixed or broke it.
- **Conservative game design beats clever:** sacking requires a telegraphed on-notice season; rewards are capped; new boards start comfortable. Tension without cheapness — players forgive difficulty, not arbitrariness.
