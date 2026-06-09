# UI_POLISH_PLAN.md — "Smooth, clean, perfected" master plan

> Source: six parallel audits (motion, visual consistency, interaction feedback, performance,
> accessibility, layout robustness), 2026-06-09. **Every finding below was re-verified against
> current code before inclusion**; agent claims that failed verification were dropped or corrected
> (noted inline). Execute top-to-bottom — phases are ordered by player-felt payoff ÷ risk.
> One phase = one commit (two max). Gate every phase on: `tsc` 0 errors, full `jest` green,
> `next lint --file <touched>` 0 errors.

**Verified ground truth that shapes everything:**
- Electron min window **1024×640** (`electron/main.js:171`) — that's the layout floor, not 1280.
- `lib/motion.ts` has a complete token system (`liquidSpring`, `quickEase`, `pageTransition`,
  `useLiquidTransition`) — but **77 inline `transition={{duration…}}` vs 4 token usages**. Adoption, not invention.
- Global `prefers-reduced-motion` CSS exists (`globals.css:63,82`) but cannot stop framer-motion's
  rAF springs — that's what the unused `useLiquidTransition()` is for.
- `images.unoptimized: true` is **deliberate** (`next.config.js:19`, Electron static export);
  do NOT "fix" by removing it. Image wins come from pre-sized assets only.
- jest is node-env: none of this is unit-testable except store actions. Each phase carries a
  manual-verify checklist instead.

---

## Phase 0 — Money-flow correctness (small, highest stakes) 🔴

The only phase where players can lose money/progress. Verified P0s:

| # | Fix | Where |
|---|-----|-------|
| 0.1 | Render the missing `FAILED` stage (failure message + Close/Retry). `setStage("FAILED")` fires at `NegotiationModal.tsx:250` but no branch renders it → stuck/empty modal. | `components/transfer/NegotiationModal.tsx` |
| 0.2 | Submission lock: `isSubmitting` state disables OFFER CONTRACT (`:451`) and SUBMIT OFFER (`:387`) during the store call; double-click can double-fire `transferPlayer`. | same |
| 0.3 | Surface outcome at page level: `onComplete(success, message)` → `addToast` on transfers page (currently zero toasts on success/failure). | `app/transfers/page.tsx` |
| 0.4 | Audit `purchaseEquipment` failure branch surfaces a toast (claim: buried; verify first). | `app/equipment/page.tsx:84-92` |

Risk: low (additive UI states). Test: store-level — assert `transferPlayer` is idempotent/guarded on
double-call if it isn't already (node-testable). Manual: force a failing transfer (budget 0), confirm FAILED screen.
Effort: S.

## Phase 1 — Global quick wins (two systemic one-pass fixes) 🟠

1.1 **Contrast floor.** Fix the 16 verified `text-[8px]/[9px]/[10px]` + `text-white/20-30`
*informational* labels (calendar events, news meta, stat labels, "Press Esc" hint) to `text-white/50`+.
Do it per-site (16 edits) — NOT the suggested global CSS override of `.text-white\/30` (specificity
hack, would also lighten decorative hairlines). Decorative dividers stay as-is.

1.2 **Motion-token adoption at the felt sites.** Don't churn all 77 inline configs — convert the ones
players feel: page-entry consistency (every `app/*/page.tsx` gets the same entry treatment — standardize
on the existing CSS `animate-in fade-in` since most pages already use it; remove framer page wrappers
where duplicated), TopBar spinner configs → one `loadingSpinner` token, toast transition kept as-is
(it's already tokenized). Leave one-off decorative timings alone.

Risk: visual diffs only. Manual: click through all sidebar routes once; entries feel uniform.
Effort: S-M.

## Phase 2 — Semantic visual system (define once, migrate hot screens) 🟠

2.1 Add semantic tokens to `globals.css` + `tailwind.config.ts`: `--status-win/--status-loss`
(standardize on emerald-400/red-400), `--money-pos/--money-neg`, text tiers (`.text-pri/.text-sec/.text-ter`
if not already defined — verify first; a11y audit says `.text-ter` exists).
2.2 Migrate the five screens where drift is player-visible: dashboard, finances, FPL, rankings, desktop
notifications (win/loss hue drift verified: `emerald-400` vs `emerald-500/90` etc.).
2.3 Badge `size="xs"` variant (kills the inline `text-[8px] px-1.5` one-offs); replace raw buttons on
squad page (`app/squad/page.tsx:111`) with `<Button variant="outline">`.
2.4 EmptyState adoption: replace raw "no data" text on desktop/training with the existing `EmptyState`
component (built, under-used — same orphan pattern as ever).

Risk: medium (broad class renames → visual regressions). Mitigate: screenshot before/after per screen.
Effort: M.

## Phase 3 — Feedback & affordances 🟡

3.1 Tooltips on disabled actions explaining *why* (insufficient budget on BUY/SUBMIT OFFER — Tooltip
already imported in NegotiationModal; roster-full; cooldowns).
3.2 `error.tsx` for top-traffic routes (transfers, squad, training, scouting, schedule, finances,
tournaments, academy) — copy the existing `app/match/[id]/error.tsx` pattern.
3.3 Hover/cursor honesty: `GlassTable` rows only get hover/pointer styling when clickable.
3.4 Aria-labels on icon-only close buttons (BookScrimModal pattern — copy StaffDetailsModal:141).

Risk: low. Effort: M.

## Phase 4 — Felt performance 🟡

4.1 **MarketApp evaluation caching** (verified: `evaluatePlayer` over every player re-runs each tick
while open, deps `[players, teams]`): cache per-player evaluation keyed by the fields it reads, or
recompute only on `currentWeek` change instead of array identity.
4.2 Dashboard selector hygiene: bundle the standalone `eventsLog` subscription (`app/page.tsx:59`)
into the existing `useShallow` block; pre-slice season-recap filters to the last-52-week window.
4.3 Gate off-screen infinite animations: NewsApp ticker (15s loop), TournamentBracket orbs, sparkle
loops — pause when not visible (IntersectionObserver) or render-gate by phase.
4.4 ~~StaffDetailsModal P0~~ — **rejected on verification**: immer keeps unchanged object references,
selector result is stable. No change.
4.5 ~~Remove image `unoptimized`~~ — **rejected**: required by Electron static export.

Risk: low-medium (4.1 needs care to not serve stale evaluations after training). Manual: open Market
app, advance week, feel for stutter. Effort: M.

## Phase 5 — Layout robustness at 1024×640 🟡

5.1 Dashboard news feed: `max-h-[1100px]` (`app/page.tsx:687`) → viewport-relative
(`max-h-[calc(100vh-12rem)]`).
5.2 Match live/tactics: 12-col and `grid-cols-5` strategy rows need responsive fallbacks at 1024px
(verify in-browser first — agent arithmetic, not rendered evidence).
5.3 Fixed-corner stack: toasts (top-right) fine; bottom-right at small heights — feedback-animations
`bottom-4 right-4` vs BugReport `bottom-6 right-6` overlap; consolidate offsets into one spacing
convention.
5.4 Truncation guards: TopBar team name, live-match kill-log names (`max-w-[60px]`), bracket team
cards — `truncate` + `min-w-0` on the flex parents.
5.5 Schedule page fixed `w-[320px]` week columns — accept horizontal scroll as design, but verify the
scroll affordance is visible at 1024px.

Risk: medium (layout changes need eyes at both 1024×640 and 1920×1080). Effort: M.

## Phase 6 — A11y & input completeness 🟢

6.1 Form labels in BugReport / StaffNegotiation / BookScrim modals (placeholder-only today);
`aria-valuetext` on negotiation sliders.
6.2 Dialog focus behavior: confirm Radix primitives trap focus; add to the custom `ExitConfirmDialog`
if it doesn't.
6.3 Sweep icon-only buttons for aria-labels (pattern exists, apply at the ~10 flagged sites).

Risk: low. Effort: S-M.

## Phase 7 — QA sweep & ship gate 🟢

- Full manual pass at 1024×640 and 1920×1080: every route, sound on/off, reduced-motion on.
- One full in-app season (covers TASK.md P1 manual debt: board review, SACKED overlay, toasts).
- `npm run release:verify`.
- Update TASK.md / LEARNINGS.md with anything new that bit us.

---

## Execution notes

- Phases 0-1 are immediate; 2-6 reorderable on taste; 7 always last.
- Stacking onto PR #47 unless told otherwise (it's open and unreviewed — review bots out of credits).
- Findings rejected during verification are recorded above (4.4, 4.5, fake blur(120px) claim) so they
  don't get re-reported by future audits.
