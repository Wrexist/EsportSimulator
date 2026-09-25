# Route acceptance matrix

All 40 `app/**/page.tsx` routes observed on 13 September 2026. This is the remaining acceptance matrix, not a claim that each screen is broken or already tested. Existing screenshots and partial checks are retained in [the earlier coverage report](../audit-2026-09-12/COVERAGE.md). Assign concrete evidence to each included route before L33 acceptance.

For each included route, test its listed scenario plus loading, empty, error, invalid/stale data, keyboard-only operation, focus return, zoom/scaling, back/forward and reload. Use 1024×640, 1280×720 and 1440×900 with declared Windows scaling. Dynamic routes need valid, missing and stale IDs. Modal/overlay acceptance is listed after the table. Development routes need a deliberate production gate rather than player-facing acceptance claims.

| Route | Responsible packages | Specific scenarios still requiring release acceptance | State |
|---|---|---|---|
| `/` | L15 L20 L22 L23 | Overview priorities, next day/week, truthful cash and fixture data, loading locks, failed save recovery | Unverified on release candidate |
| `/main-menu` | L05 L22 L23 | New/continue/load/settings flows, no-save state, unavailable save, menu audio and keyboard focus | Unverified on release candidate |
| `/new-game` | L16 L22 | Valid manager/team eligibility, locked choices, cancellation, duplicate submit and initial save | Unverified on release candidate |
| `/new-game/create-team` | L16 L22 L25 | Name/identity validation, roster/budget constraints, logo failure, back navigation and save | Unverified on release candidate |
| `/load-game` | L03 L05 | Older versions, missing/corrupt primary, backup recovery, delete scope, failed disk write and restart | Unverified on release candidate |
| `/squad` | L16 L23 | Role/roster validation, bench/lineup changes, ratings agreement, unavailable players and keyboard table actions | Unverified on release candidate |
| `/player/[id]` | L16 L17 L20 | Revealed versus hidden attributes, contracts, development/history, stale/missing player and return context | Unverified on release candidate |
| `/transfers` | L15 L16 | Scout/compare/offer/negotiate/sign, expiry, affordability, stale offers, cancellation and reload | Unverified on release candidate |
| `/scouting` | L16 L17 | Mission budget/timing, uncertainty, results, ownership, repeated actions and no-eligible-player state | Unverified on release candidate |
| `/training` | L17 L23 | Truthful slot capacity, schedule conflicts, fatigue/recovery, projections, completion and narrow layout | Unverified on release candidate |
| `/academy` | L17 L20 | Prospect generation, ownership, promotion, roster/training, season rollover and no-cash state | Unverified on release candidate |
| `/fpl` | L17 L20 | Eligibility, participation, rewards, promotion/ownership, history, empty and already-completed states | Unverified on release candidate |
| `/staff` | L15 L18 | Hire/renew/fire, wage commitments, role limits, actual bonuses, missing candidates and reload | Unverified on release candidate |
| `/basecamp` | L15 L18 | Upgrade eligibility/cost/time, activation, capacity/effect, replacement and stale completion | Unverified on release candidate |
| `/equipment` | L15 L18 | Purchase/equip/replace, recurring upkeep, affordability, displayed effect and repeated clicks | Unverified on release candidate |
| `/sponsorships` | L15 L18 | Offer conditions, forecast versus earned revenue, accept/decline/expiry and duplicate payouts | Unverified on release candidate |
| `/finances` | L15 L23 | Ledger reconciliation, forecasts/runway, one-off costs, signed deltas, empty history and distress | Unverified on release candidate |
| `/schedule` | L17 L19 | Day/week consistency, overlapping activities, due fixtures, year rollover and completion links | Unverified on release candidate |
| `/schedule/staff-meeting` | L18 L20 | Availability, cost/timing, choice consequences, cancel/repeat and saved outcome | Unverified on release candidate |
| `/tournaments` | L19 L23 | Eligibility, qualification, field sizes/formats, active/completed/empty filters and next action | Unverified on release candidate |
| `/tournaments/[id]` | L19 | Brackets/byes/tiebreaks, series progression, final rewards, missing tournament and historical consistency | Unverified on release candidate |
| `/rankings` | L19 L20 | One result source, tie ordering, season resets, qualification and player/club history links | Unverified on release candidate |
| `/match/[id]/tactics` | L09 L13 L21 | Valid roster/roles, tactic persistence, budget constraints, map setup, stale fixture and back/resume | Unverified on release candidate |
| `/match/[id]/veto` | L14 L21 | Turn ownership, ban/pick order, BO1/3/5, canonical map IDs and live/instant/result agreement | Unverified on release candidate |
| `/match/[id]/live` | L10 L11 L12 L13 L14 L21 L27 | Physical event stream, floors/visibility, interventions, pause/speed/skip/resume, one result commit and performance | Unverified on release candidate |
| `/match/[id]/result` | L14 L19 L21 | Map/score/stat agreement, unique rewards, explanatory analysis, next action and reload idempotency | Unverified on release candidate |
| `/career` | L20 L23 | Board/reputation milestones, jobs/club switching, sacking/bankruptcy and old-career isolation | Unverified on release candidate |
| `/desktop` | L20 L23 | Inbox discoverability, actionable decisions, archived/expired items, keyboard navigation and duplicate shell behavior | Unverified on release candidate |
| `/hall-of-fame` | L20 L25 | Inductions/records, legends if included, fictional identities, empty history and repeated load | Unverified on release candidate |
| `/stats` | L19 L20 L23 | Filters, totals versus per-map/per-season values, missing data, sample sizes and history consistency | Unverified on release candidate |
| `/trophies` | L19 L20 L25 | Award exactly once, correct club/season, zero-trophy state, identity assets and historical persistence | Unverified on release candidate |
| `/settings` | L05 L24 L26 | Preference consistency, mute/scale/motion, reset scope, fullscreen and restart persistence | Unverified on release candidate |
| `/settings/community-import` | L03 L07 L08 L29 | Preview, schema/size/path validation, attribution, backup, rollback and incompatible/invalid content | Unverified on release candidate |
| `/credits` | L08 L25 L26 | Accurate contributor/license/asset notices, links, supported fonts and packaged notice availability | Unverified on release candidate |
| `/map-editor` | L09 L23 L24 L26 | 142-mark draft safety, site/spawn naming, geometry/utility tools, undo, import/export, keyboard alternatives and silence | Unverified on release candidate |
| `/map-editor/lab` | L09 L10 L11 L12 L27 | Reference registration, overlapping floors, routes/rays/traversal, saved settings, diagnostics, worker failure and silence | Unverified on release candidate |
| `/animations` | L23 L24 L26 | Classify intended audience; verify reduced motion, controls and production inclusion or gate | Unverified on release candidate |
| `/dev` | L07 L23 L34 | Developer-only route: confirm intended production gate and no privileged actions exposed | Unverified on release candidate |
| `/dev/map-builder` | L07 L09 L23 L34 | Developer-only route: gate, validated inputs, data ownership, import/export and no accidental career mutation | Unverified on release candidate |
| `/dev/radar-preview` | L07 L14 L23 L34 | Developer-only route: gate, fabricated data isolation, map/floor/identity controls and no career advancement | Unverified on release candidate |

## Cross-route overlays and states

- [ ] Save/close/retry/cancel, long-running week, worker fallback, corrupt-save recovery and backup selection.
- [ ] Transfer/contract confirmation, player comparison, staff hiring, upgrades, sponsorship acceptance and insufficient funds.
- [ ] Board warning, sacking, bankruptcy, job change, season recap, trophy/legend celebrations and dismissal/reload.
- [ ] Command search, help/tutorial, tooltips, notification/inbox details, custom-logo upload and map export/import.
- [ ] Offline/Steam-unavailable/Cloud-conflict, account switching, update/migration and low disk space.
- [ ] No-career state, missing mod, incompatible schema, map worker error and unregistered geometry.

Use unique fixture/build identifiers and pass/fail evidence per scenario. A screenshot confirms appearance, not save durability, accessibility or simulated outcomes.

