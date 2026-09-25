# Project coverage and acceptance checklist

This file records the scope of the 12 September 2026 audit and defines what still needs checking. It complements the [findings](AUDIT.md) and [60-package plan](PLAN.md). A route appearing here is not a certification of every interaction on that route.

## 1. What was actually exercised

The production web build ran on the isolated origin `http://127.0.0.1:3210`. A fresh manager named **Audit Manager** selected **Pulsar**, initially rank #158 with a $500,000 budget. The walkthrough inspected onboarding, entered the career, visited Training and Settings, advanced to week 1/day 3, used quick veto/preparation, started a live match, used the accelerated skip flow, completed a 13–11 win against Iron Warden, returned to management, saved, returned to the main menu, and used Continue. The resumed career showed day 3, the win, and rank #154. Existing Electron saves were not used.

The walkthrough then inspected the principal management destinations. It covered **25 of 38 page route patterns in the browser**, at varying interaction depth. Most secondary screens received a render/navigation inspection; their purchase, negotiation, promotion, and failure paths were not all executed. The audit did not run a complete human-played season, a cold installed-app restart, or live Steam operations.

The 1024×640 Training view exposed offscreen progression controls. Screens were also inspected at 1440×900. A sampled browser-console check returned no warnings/errors; this does not prove all routes or later interactions are error-free. Screenshots and UI text are in [evidence/](evidence/).

Separate checks ran against the whole project: dependency installation/audit, type-check, lint, all 112 Jest suites, production build, conflict/calendar/Steam static checks, and the 500-week hardening harness. The hardening harness uses a synthetic save and direct processor execution, so its pass is not browser, worker, store-orchestrator, or packaged-save coverage.

### Coverage labels

- **Flow:** exercised a meaningful part of this route's player flow in the browser; remaining scenarios are listed.
- **View:** opened and inspected the browser UI/navigation; not a full transaction or failure-path test.
- **Source:** included in route inventory/source review; no browser execution in this audit. Review depth varies. This is not a statement that every branch was manually traced.
- **Tooling:** source/configuration review and relevant automated checks; actual deployment or native behavior remains separate.

Package numbers below refer to PLAN.md. None of the remaining acceptance work is marked completed by this matrix.

## 2. Every page route

| Route | Audit coverage | Required acceptance work / main concerns | Plan packages |
|---|---|---|---|
| `/main-menu` | Flow | Continue, new career, settings, credits, keyboard names, branding, audio, no-save and incompatible-save states | 11–12, 18, 25, 30, 39 |
| `/new-game` | Flow | Manager identity, eligible/locked teams, difficulty, budget/OVR definitions, keyboard selection, back/retry | 16, 19, 25, 30 |
| `/new-game/create-team` | Source | Naming validation, generated identity, roster/budget rules, duplicate names, cancellation, persistence | 18–20, 30, 39 |
| `/load-game` | Source | Slot metadata, Continue consistency, import/export, overwrite/delete scope, corrupt/old saves, actual disk recovery | 07–08, 25, 39, 56 |
| `/` | Flow | Accurate finances, next action, warnings, date/season progress, save feedback, all supported widths | 13, 15–17, 22, 31 |
| `/squad` | View | Roles/bench constraints, sorting, filters, comparison, selection, unavailable players, roster mutations | 16, 24, 32 |
| `/player/[id]` | Source | Rating/attribute definitions, hidden scouting data, contract actions, long history, missing ID, asset references | 16, 20, 32, 48 |
| `/transfers` | View | Search/filter/sort, full negotiation states, funds/roster validation, concurrent target changes, cancel/retry, ledger | 15–16, 28, 32 |
| `/scouting` | View | Mission costs/duration, uncertainty, report delivery, search/filter continuity, no-result and expired targets | 16, 20, 32, 45 |
| `/training` | Flow/view | Allocation shown versus actual capacity, daily/weekly distinction, negative deltas, fatigue, submit placement, 1024×640 controls | 20, 22, 33 |
| `/schedule` | View | Day/week alignment, next fixture, conflicting activities, season rollover, contextual actions | 17, 33, 35 |
| `/schedule/staff-meeting` | Source | Eligibility, staff effects, timing/cost, repeat submission, cancellation, saved outcome | 13, 20, 33, 37 |
| `/match/[id]/tactics` | Flow | Lineup constraints, selected tactics, quick-veto sequence, map names, stale fixture, start/back | 07, 18, 28, 34 |
| `/match/[id]/veto` | Source | Full manual veto, turn ownership, pick/ban/order, BO1/3/5, timeout/auto options, refresh and back behavior | 07, 18, 34 |
| `/match/[id]/live` | Flow | Speed/skip/pause/timeout, display names, readability, round stats, overtime, resume, duplicate completion | 07, 18, 25–26, 34, 50 |
| `/match/[id]/result` | Flow | Correct day/date, names, score, individual stats, rewards/ledger/rankings once, next match and return | 15, 17–18, 34–35 |
| `/tournaments` | View | Calendar/eligibility, registration, invitation, filters, no available events, current/finished clarity | 17, 24, 35 |
| `/tournaments/[id]` | Source | Bracket/Swiss/league views, seeds/byes, qualification, result navigation, completion/prizes, missing asset | 17, 24, 35, 45, 48 |
| `/finances` | View | Projection/ledger consistency, recurring/conditional income, obligations, financial distress and history | 15, 20, 36 |
| `/sponsorships` | View | Requirements, negotiation/selection, overlapping deals, payouts, renewals, expiry, failure explanations | 15, 20, 36 |
| `/staff` | View | Hiring/assignment, specialization effect, wages, availability, dismiss/replace, capacity, details assets | 15, 20, 37, 48 |
| `/basecamp` | View | Facility costs/upkeep, queues, prerequisites, levels, effects, cancel/refund, completion timing | 15, 20, 37 |
| `/academy` | View | Prospect generation, scouting/development, promotion, roster limits, contracts, upgrades, long-term value | 16, 20, 37, 45, 52 |
| `/equipment` | View | Price/upkeep, slots, team/player effects, purchases, upgrades, replacement, persistence | 15, 20, 37 |
| `/desktop` | View | Inbox within competing shell, read/action-required states, expired decisions, weekly focus, window behavior | 23, 25, 38, 45 |
| `/career` | Source | Manager XP/skills, job eligibility, team change, board review, sacking, history, career-level persistence | 07, 20, 38, 52 |
| `/rankings` | View | Rank/points definitions, dates, filters, movement, tie handling, player/team consistency | 16–17, 20, 38 |
| `/fpl` | View | Entry/availability, simulated participation, points/rewards, calendar interactions, missing data | 17, 20, 38, 52 |
| `/stats` | View | Sample size, filters, competition/season scope, empty data, correct totals, large-history performance | 17, 20, 38, 50–51 |
| `/trophies` | View | Locked/unlocked explanation, award timing, deduplication, display history, team-change semantics | 18, 20, 38 |
| `/hall-of-fame` | View | Historical identity, eligibility, records, retirement/season effects, generated/imported players | 17–18, 38, 52 |
| `/settings` | Flow/view | Shared preferences, actual autosave/audio/motion behavior, restore defaults, input labels, device/career scope | 10–12, 25–26, 39 |
| `/settings/community-import` | Source | Schema/file limits, mod identity, preview/activation, rollback, malformed files, save compatibility, offline state | 18, 39, 42, 57 |
| `/credits` | Source | Product name, contribution/asset attribution, readable links, keyboard, external-link handling | 18, 25, 41, 48, 53 |
| `/animations` | Source | Confirm intended development gating; animations respect preference if reachable in a supported mode | 26, 47, 56 |
| `/dev` | Source | Confirm intended development gating, debug mutation isolation, no accidental production entry point | 41, 47, 56 |
| `/dev/map-builder` | Source | Confirm development gating; editor input/output validation, safe asset paths, no shipped accidental dependencies | 41–42, 47–49 |
| `/dev/radar-preview` | Source | Confirm development gating; radar/nav data references, memory cost, missing debug asset | 47–51 |

### Routes and surfaces outside `page.tsx`

| Surface | Audit coverage | Remaining acceptance |
|---|---|---|
| `app/api/console-log/route.ts` | Source; production guard identified | Confirm production requests are rejected, development payloads are bounded/validated, and log output does not accept control-data unexpectedly. |
| Root layout, viewport, theme, GameShell, topbar/sidebar | Source plus browser interaction | Close/autosave lifecycle, minimum resolution and scaling, zoom, modal focus, keyboard shortcuts, reduced motion, transient state. |
| Global/route/match error boundaries and not-found | Source | Trigger failures and invalid IDs; recovery should preserve a valid save and return to a useful screen. |
| Settings modal, save dialogs, tutorial/help, notifications | Partial browser/source | Shared settings, initial/default/error states, queueing, keyboard/focus, cancellation, audible and motion behavior. |
| Negotiation, staff/player/tournament details and confirmation modals | Source and incidental UI | Full modal lifecycle, all transaction states, long content, stale data, action reachability and missing assets. |
| Electron menu/window/preload/Steam bridge | Tooling | Actual packaged launch/close, origin and IPC validation, offline behavior, Steam and storage integration. |

## 3. Major subsystem inventory and audit depth

The inventory is a snapshot of tracked files before this report was added. Counts are scale indicators, not a quality score. Build outputs, node_modules, and the test browser's local data are not counted as tracked project source.

| Area | What was examined | Main remaining work |
|---|---|---|
| Project/configuration | Package scripts/lock, Next/TS/Jest/lint/build configuration, root docs, CI/release scripts | One current workflow, supported dependencies, typed tests, enforceable release gates; 02, 40, 46, 54, 59 |
| `app/` — 80 files | All page routes inventoried; shared layout/style and high-risk pages traced; 25 routes browser-inspected | Route matrix above; contracts before page refactoring |
| `components/` — 162 files; `src/` — 8 | Shared shell, primitives/re-exports, large feature views, dialogs, tokens, help/accessibility infrastructure | Consolidate existing implementations, readable typography, focus/keyboard, shared interaction system; 21–29, 45 |
| `store/` — 27 files | Global store, slices, settings/persistence partialization, week orchestration, save builders, runtime fields | Single operation/commit/serialization ownership, typed commands/selectors; 05–14, 43–46 |
| `engine/` — 117 files | Simulation entry points, save contracts, worker, financial systems, processor composition, high-risk feature integration | Replay/fallback/storage parity, consistent projection, domain boundaries, scenario acceptance; 05–08, 14–20, 32–44 |
| Save system | Schema/types, serializer paths, integrity, migration/backup machinery, adapters, commit tick handling | Fresh-store round trips, actual adapter failures, native recovery, older versions, in-progress match policy; 07–09, 14, 56 |
| Worker/weekly pipeline | Bridge lifecycle, worker save shim, synchronous fallback, post-processing and final save order | Correlation/cleanup, one commit contract, failure injection, full-store replay; 05–06, 14 |
| Match systems and `useLiveMatch` | Preparation/veto/live/result source chains, names/dates, one completed browser match, test suite | All formats, overtime, tactical controls, resume/skip equivalence policy, reward dedup; 18, 34, 55 |
| Tournament/circuit/league | Managers, format helpers, calendar validation, completion/qualification processors, existing tests | Real-seed schedules, all field sizes/formats, qualification warnings, season rollover and prizes; 17, 35, 52 |
| Economy/sponsors | Competing calculators traced to consumers, actual weekly finance processor, browser totals | Unified projections, ledger reconciliation, affordability/expiry cases, multi-season balance; 15, 36, 52 |
| AI/roster/transfers/scouting | Module and slice boundaries, existing test coverage, roster/market/scouting screens | Full transactional journeys, AI competitiveness, uncertainty/reveal rules, late-career behavior; 32, 52 |
| Training/player lifecycle | Drill and weekly/individual training paths, capacity UI, fatigue/development-related processors | Product decision on overlapping systems, truthful preview, time/cost/effect testing; 20, 33, 52 |
| Academy/staff/facilities/equipment | Existing engines/slices and UI, bonus integration evidence, test coverage | Trace every advertised effect and obligation, upgrade completion/cancellation, balance; 37, 52 |
| Manager/board/career/records | Progression, board, job, stats/history, milestone/award processors and existing tests | Team changes, sacking, repeated reviews, dedup, time/identity consistency; 17–18, 38, 52 |
| FPL/events/news/inbox | Availability/processors, event/news generation, desktop inbox view | Action validity, message lifecycle, reward effects, calendar and history integration; 23, 38, 52 |
| `lib/` — 38 files; `hooks/` — 4 | Settings/sound, utilities, asset/radar helpers, motion/accessibility, live-match dependencies | Initialization/lifecycle, canonical formatting, domain/presentation separation, profile heavy imports; 11–12, 20, 26, 44, 50 |
| `types/` — 13 files; `data/` — 18 | Shared type/schema relationships, game data/display names, tournament/map/content references | Clear DTO boundaries, canonical identity/labels, content integrity, versioning and validation; 03, 18, 42, 44, 48 |
| Electron — main/preload/Steam | Security settings, listener host, origin/navigation policy, IPC handlers, close timeout, packaging hooks | Verify and tighten real platform boundaries; actual native smoke/recovery; 09–10, 41–42, 56–57 |
| Tests — 112 suites | Executed all 1,163 tests; examined configuration, critical regression tests, hardening harness limits | Browser/native/replay/failure integration, test typing, real snapshot seeds; 01, 04, 08, 14, 46, 55–58 |
| `scripts/` — 66 files | Audit/hardening/calendar/build/ship/mod/asset/performance tooling and package-script entry points | Shared gates, data-transform reproducibility, performance budgets, safe content operations; 42, 48–51, 54 |
| `public/` — 4,385 files, ~251 MB | Inventory, static reference scan, all 2,202 checked image signatures, representative browser assets | Provenance/manifest, runtime inclusion, missing paths, image/audio review, actual package size; 18, 48–49, 53 |
| `raw-data/` — 3,269 files, ~244 MB | Inventory and role in ingestion/generation; not manual verification of every item | Preserve masters, provenance and update process, source/runtime separation; 42, 48–49 |
| Deployment/build/site/marketing/examples/prompts | Packaging, Steam runbooks/config, storefront claims and branding-related references; inventory of supporting material | Current launch instructions, exact artifact verification, attribution/content claims, supported sample mods; 02, 48–49, 53–54, 57, 59 |
| Historical audits/docs/tasks | Current-status comparisons and re-verification of selected older findings | Reconcile into one current backlog, retain history clearly, remove competing active statuses; 02, 59 |

## 4. Required player-journey and failure matrix

For execution, add a build identifier, test fixture/seed, environment, date, result, and evidence link to each row. Until that happens, **remaining work is pending**. The audit column only describes evidence collected in this pass.

| Scenario | Audit evidence | Acceptance still required |
|---|---|---|
| New existing-team career → first match → save → Continue | One browser flow passed | Automate; different eligibility/difficulty states; fresh browser context and packaged restart |
| Create a custom team | Source only | Validation, identity, roster/budget, cancel/back, first match and reload |
| No save / multiple saves / old save | Source and existing unit tests | Actual storage UI, selected slot, compatibility/migration, malformed metadata |
| Manual save / autosave / close-save | Source, isolated browser manual save/Continue | Real timers, settings consistency, close/cancel/retry, disk/quota failure, crash/backup |
| Worker success / unavailable / timeout / late response / runtime error | Source plus reproduced late-result transport probe | Maintained regression tests and real application worker/fallback parity |
| Week/day double click and repeated close | Source | Single operation semantics and accurate progress/commit feedback |
| Deterministic save/reload simulation | Seeded infrastructure and existing tests; synthetic 500-week run passed | Full store/worker/adapters, repeated seeds, commit/crash boundaries, cosmetic RNG separation if needed |
| Training → daily/weekly outcomes → save/reload | UI/source reviewed, no complete training transaction verified | Actual slot limits, pending selections, costs, fatigue, passive/manual interactions |
| Transfer/scouting → negotiation → roster/ledger | Views/source/existing tests | All negotiation states, insufficient funds, target changes, cancellation, durable effects |
| Staff/facility/academy/equipment purchase and effect | Views/source/existing tests | Completion/queue/cancel, actual simulation bonus, ongoing cost, later reload |
| Weekly finance forecast → settlement → ledger | Contradictory UI totals reproduced | Canonical totals, contingent income, one-offs, sponsorship/contract edge cases |
| Manual veto → live BO1/3/5 → overtime → result | Quick-veto BO1 and one completed match observed | Manual route, multiple maps, overtime, tactics/timeout, speed/skip/resume, result equivalence policy |
| Tournament qualify/register/play/finish | Calendar validator and existing format tests passed | Supported field sizes/formats, byes, rescheduling, awards once, actual career sequence |
| Week 52 → new season / year boundary | Existing tests; synthetic long run | All UI dates/progress, contracts, board review, schedules, history and finances |
| Team change / retirement / sacking | Source and existing tests | All affected stores, history ownership, pending actions, game-over/recovery UI |
| Mod import / Workshop update / invalid content | Static checks and source | Actual malformed/large/path cases, activation rollback, cached offline behavior, Steam lifecycle |
| Settings/audio/motion from cold start | Source; audio initialization defect reproduced with fake audio context | Actual audible behavior, session/navigation persistence, application and OS motion preferences |
| Keyboard-only / screen reader / zoom | Partial semantics observed; issues identified | Complete core flow, focus traps/return, names, announcements, visible focus, zoom/scaling |
| 1024×640 and larger Windows scaling | Clipped Training controls reproduced | Every primary route/modal/action, long names/localized lengths, target display scaling |
| Late-career dense lists/history | Build bundle sizes and synthetic run | Actual large-save load/filter/scroll, memory growth, save time, worker clone cost |
| Offline packaged game | Source only | Core career without network/Steam; correct local assets, error messages and save behavior |
| Steam launch/overlay/achievements/cloud/Workshop | Static checks passed | Actual intended build/configuration; two-device cloud conflicts where supported |
| Upgrade/install/uninstall/reinstall | Not run | Preserve intended save locations, migrate compatible saves, correct shortcuts/config/assets |
| Multi-season balance and first-player comprehension | One first-week flow, synthetic endurance only | Multiple seeds/tiers/difficulties, meaningful choice cadence, fresh-player observation |

## 5. Evidence index and reproduction

| File | What it establishes |
|---|---|
| [inventory.json](evidence/inventory.json) | Baseline tracked-file counts, sizes, paths, code-line totals and large files |
| [types.txt](evidence/types.txt) | TypeScript run output |
| [test-summary.json](evidence/test-summary.json) | Executed test/suite totals and duration |
| [lint.txt](evidence/lint.txt) | Current warnings and lint result |
| [build.txt](evidence/build.txt) | Production build result and route bundle sizes |
| [hardening.txt](evidence/hardening.txt) | Tamper/recovery/synthetic endurance/image checks and their output |
| [dependency-audit.json](evidence/dependency-audit.json) | Advisory snapshot for the installed lockfile on the audit date |
| [steam-ready-report.json](evidence/steam-ready-report.json) | Strict source audit's limited findings |
| [steam-compliance-report.json](evidence/steam-compliance-report.json) | Compliance scan's limited findings |
| [behavior-probes.cjs](evidence/behavior-probes.cjs) | Executable fake-transport/timer/audio/snapshot reproductions; see warning below |
| [behavior-probes.txt](evidence/behavior-probes.txt) | Captured probe results at the audited baseline |
| [training-1024x640.png](evidence/training-1024x640.png) | Readability/layout context for the minimum-size Training view |
| [dashboard-1024x640.png](evidence/dashboard-1024x640.png) | Dashboard visual reference from the resize inspection; Training is the decisive clipped-control reproduction |
| [live-match-1440x900.png](evidence/live-match-1440x900.png) | Live-match typography/layout and naming context |
| [inbox-1440x900.png](evidence/inbox-1440x900.png) | Nested virtual-desktop/inbox navigation context |
| `*-ui.txt` in evidence | Browser UI text snapshots of the inspected management screens, including conflicting finance totals |

Run the audit probes from the repository root after dependencies are installed:

```powershell
node docs/audit-2026-09-12/evidence/behavior-probes.cjs
```

These probes assert the **existing defective behavior**, using controlled fake transport/audio dependencies. They are evidence scripts, not desired-behavior regression tests or part of the game's CI. Once the defects are fixed they may intentionally fail; preserve them as dated evidence and implement the correct long-term assertions in the maintained test suite. The save-field probe demonstrates omission, not an observed end-user crash or data-loss incident.

No captured game data is a real player's private save. The isolated test career and build checks do not modify the user's existing Electron career. This audit did not publish, upload to Steam, or change application behavior.
