# AGENTS.md — EsportSimulator

CS:GO/CS2-style esports management sim. **Next.js 14 (app router) + React 18 + Zustand 5 (immer slices) + Electron**, shipping to **Steam**. All simulation runs client-side; saves persist to IndexedDB via `engine/save-manager.ts`.

Read `TASK.md` (current state, priorities) and `LEARNINGS.md` (constraints that already bit us) before starting work. Treat them as source of truth; update them when state changes.

## Commands

```bash
npx tsc --noEmit --pretty false        # type-check (~30s) — run before every commit
npx jest <pattern>                     # targeted tests (fast)
npx jest                               # full suite (~21s) — run before every push
npx next lint --file <path>            # targeted lint (full `npm run lint` is slow)
npm run preflight                      # type-check + full tests
npm run dev                            # web dev server
npm run electron:dev                   # Electron shell (port 3001)
npm run release:verify                 # full ship gate (conflicts, tsc, hardening, Steam compliance, build)
```

Quality bar (do not regress): **tsc 0 errors, lint 0 errors, all jest suites green.** Every bug fix lands behind a regression test.

## Architecture

| Layer | Path | Rules |
|-------|------|-------|
| Pages | `app/` | App router. `app/layout.tsx` wraps everything in `GameShell` (sidebar, topbar, toasts, overlays; `hideChrome` on new-game/main-menu). |
| Components | `components/` | `ui/` primitives, `layout/` shell, feature dirs. framer-motion everywhere; `lib/motion.ts` has shared springs. |
| State | `store/` | One Zustand store composed from `store/slices/*`. Mutations via immer `set()`. `store/game-store.ts` is large; slices are the unit of work. |
| Simulation | `engine/` | **Pure, deterministic, no React/DOM.** The week tick is `engine/atomic-week-processor.ts` orchestrating `engine/processors/*`. |
| Static data | `data/` | JSON (tournaments, teams, names). Validate with `node -e "JSON.parse(...)"` after edits. |
| Tests | `__tests__/` | Flat dir, jest **node env** (no DOM/component tests). |

Path alias: `@/` = repo root.

## Critical invariants

1. **Save schema:** new `GameSave` fields must be optional (no migration; `saveVersion` stays) AND plumbed into **both** explicit save builders — `store/utils/build-save-snapshot.ts` and the `saveGame` action in `store/game-store.ts` (mirror `fplData`). Load/result paths spread wholesale, so only the builders drop fields — silently.
2. **Determinism:** engine code never calls `Math.random()` / `Date.now()`. Thread the provided `SeededRNG`; IDs via `nextDeterministicId` or deterministic templates (`board_review_s{N}_{teamId}`).
3. **Replay safety:** week-tick processors thread `eventIdSet`/`ledgerIdSet`. Any new `eventsLog`/`financeLedger`/`newsFeed` push inside the tick must be dedup-guarded, and dedup scope is **all pending weeks**, not the current week.
4. **One authoritative save per tick** (end of `atomic-week-processor`). Never add intra-tick `saveGame` calls — JSON.stringify cost dominated wall time before this was fixed.
5. **Economy:** every budget mutation gets a `FinanceLedgerEntry` (id, week, teamId, type, category, amount, description, running balance). New income sources must be capped and non-farmable (see signing-bonus exploit in LEARNINGS).
6. **Unbounded growth:** `compactPersistentState` caps logs. Anything pushed weekly needs a cap or cross-week dedup.

## Conventions

- Match the indent/style of the file you're editing (engine is 4-space, much of `app/` is 2-space).
- Test harness pattern: local `makeSave`/`makeTeam`/`makePlayer` factories with `as unknown as GameSave` casts — copy the pattern in `__tests__/ai-transfer-logic.test.ts`.
- Audio: `soundManager.play()` self-gates on the user's sound setting — safe to call anywhere, but keep feedback sparse (no sounds on high-frequency events).
- UI feedback: toasts via `addToast`; meaningful types (`achievement`, `level_up`, `warning`, `error`) auto-play sounds.
- Comments state constraints the code can't show; no narration.

## Workflow

- Branch: work stays on the designated `Codex/*` branch; never push elsewhere; no PRs unless explicitly requested.
- One logical change per commit, message explains the *why*.
- Before fixing an audit/backlog item, **re-verify it against current code** — several "open" items had already changed state.
- Prefer surfacing/fixing existing systems over building parallel new ones (the help system and stat tooltips existed, fully built, mounted nowhere).
