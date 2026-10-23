# Esports Manager: FPS gameplay, radar and UX overhaul: engineering report (2026-10-23)

Branch `claude/project-thread-6h04ps`, based on `main` at "Game revamp:
Phases 0–5 (#64)". Nothing was published, uploaded or released. No Steam
or release settings were changed.

## A. Initial audit

Five audit streams ran in parallel on the untouched `main` code: A combat
and movement (B was folded into A), C radar, D UI/UX, E QA/stress and F
performance. Each one measured the real pipeline: resolver → round script →
radar scene → canvas.

**Critical findings**

- **Stand-offs (A1, P0).** Enemies stood in line of sight at close range for
  long stretches without shooting. 92% of rounds had at least one. The worst
  lasted 71 s, with the two players 0.7 map-% (about 1 m) apart.
  - Root cause: the round script places the resolver's duels, and all other
    motion (staging, holds, post-plant spots) is planned without looking at
    the other team. Nothing checked whether a holding player could see an
    enemy.
- **First contact does not become a fight (A2, P0).** 83% of close contacts
  ended with no kill between the two. 44% of kills had no return fire.
  - Root cause: the same as A1, plus the radar only showed a shot at the
    moment of the kill (C3). The loser's damage on the winner (duel "chip")
    landed at the same instant as the kill, so nothing ever looked
    reciprocal.
- **Grenades hurt players far from where they landed (A3/C1, P1).** 87% of
  players hurt by an HE were outside its radius. The HE median was 10.7
  map-% from the victim (p90 33.8). 18 grenades were on the wrong floor.
  - Root cause: landing spots came from a baked list of spots per site.
    The resolver picks the victim independently.
- **Kills through walls and smokes (A4, P1).** 28.6% of kill lines were
  blocked at eye height, and 14.9% crossed an active smoke.
  - Root cause: duel placement had no line-of-sight model.
- **Dead players throw grenades (A5/QA-1, P1).** There were 121 throws by
  already-dead CTs in an 8,343-round stress run, some of them damaging.
  - Root cause: retake utility and arrivals in `round-sim/simulate.ts`
    didn't check `alive` after the lurker's pick.

**Major UX defects (D)**

- Two clocks: the scorebug counted down, but the feed and scrubber counted up.
- The multi-kill callout was drawn on top of the clutch banner.
- At round end the screen said "LIVE" three times.
- Your own team was never marked.
- The buy card broke at 1280×720.
- The "Continue to results" button covered the scrubber.
- The bug-report button was on by default.
- The first-session checklist pushed every page down by about 200 px.

**Radar (C)**

- No build-up of shots before a kill.
- Molotov damage landed instantly.
- Weak, instant damage feedback.
- The auto-floor flipped on a one-player difference.

**Performance (F)**

- `structuredClone` is the top self-time in a match sim (PF-1).
- The perf baseline is over target (PF-2).
- The round script is built synchronously in the live click handler: about
  4 ms p50 and up to 45 ms max (PF-3).

**Architecture risks**

- `lib/radar-script-frame.ts` is a second, unused frame model that has
  drifted (C9).
- Engine invariants are only checked in aggregate (T-1).

## B. Prioritized issue register

Status key: ✅ fixed and verified by a test or measurement. 🟡 partly fixed.
⏸ not fixed (reason given). ❔ not reproduced.

| ID | Sev | Issue | Root cause | Fix | Test / evidence | Status |
|---|---|---|---|---|---|---|
| A1 | P0 | Close-range stand-offs without shooting | Holding motion planned blind to enemies | Baked line of sight per map plus a new cover pass. A holder exposed to an enemy they won't fight steps into the nearest hidden node and returns in time for their next anchor | `combat-overhaul › keeps opponents from standing in each other's sight`; audit harness (below) | ✅ (big reduction, not zero) |
| A2 | P0 | First contact doesn't become a reciprocal fight | Shots shown only at the kill; chip at the kill instant | Radar draws the exchange before every kill: the killer fires for 0.6 s (0.9 s on the opening kill), and the victim fires back when it really hit. Chip lands 0.25 s before the kill | `combat-overhaul › draws the exchange of fire`, `› return fire lands just before the kill` | ✅ (visual and HP timing; resolver outcome rules unchanged) |
| A3/C1 | P1 | Grenade damage far from the grenade | Spot list independent of the victim | `placeGrenade`: a damaging HE lands at the distance its damage implies (CS2 falloff), a molotov lands under the victim, both on the victim's floor | `combat-overhaul › a damaging HE lands within its blast radius…` | ✅ |
| A4 | P1 | Kills through walls / smokes | No line-of-sight model | Duel spot cost +120 without sight, +60 through an active smoke | `combat-overhaul › places nearly every duel where killer and victim can see each other` (> 93%) | ✅ (28.6% → 3.6% blocked) |
| A5/QA-1 | P1 | Dead CTs throw retake utility | Missing `alive` filter | Filter arrivals and throwers by `alive` | `combat-overhaul › nobody throws a grenade after dying`; 60-series stress run: 0 violations | ✅ |
| C2 | P2 | Molotov damage instant | One hit at landing | 4 ticks over at most 1.5 s, all before the victim's death | `combat-overhaul › … every molotov tick before the victim dies` | ✅ |
| C3/C4 | P2 | No duel build-up / first contact | See A2 | See A2 (longer lead-in on the opening kill) | as A2 | ✅ |
| C5 | P2 | Weak damage feedback | Instant ring change | Red fading "HP lost" segment, a pulse at ≤ 25 HP, a larger HE pop | `combat-overhaul › shows the HP just lost`; radar-draw tests | ✅ |
| C8 | P3 | Auto-floor flips on one player | No hysteresis | Needs a 2-player majority; shots pick the floor first | `radar-level-selector.test.ts` | ✅ |
| D2 | P1 | Two different clocks | Feed/scrubber used elapsed time | Feed, scrubber and review chip use the scorebug clock (time left, bomb timer after the plant) | `combat-overhaul › feed clock`, `radar-scrubber-review.test.ts` | ✅ |
| D3 | P1 | Multi-kill callout covers the clutch banner | Both top-centre | Callout moved below the banner | screenshot | ✅ |
| D4 | P1 | "LIVE" at round end / three LIVE chips | Scrubber showed LIVE whenever not reviewing | Scrubber shows ROUND OVER; the radar's LIVE chip is removed (screen readers still hear "live"); footer says "at round end" | `radar-controls-rendering.test.ts`; screenshot | ✅ |
| D5 | P1 | Own team never marked | None | YOU tag on the own roster card and scorebug | screenshot | ✅ |
| D6/D7 | P1/P2 | Buy card breaks at 1280; recommended call doesn't stand out | 5 fixed columns, gear inside button | Duplicate calls become a note (4 columns), recommended button is filled gold with a live countdown, gear moves to one "Edit loadouts" link on narrow cards, progress bar is 4 px | `live-match-labels.test.ts`; screenshot | ✅ |
| D10 | P2 | Continue-to-results covers the scrubber | Fixed-position pill | Moved into the radar overlay slot | screenshot | ✅ |
| D11 | P2 | Screen reader hears every timer second | `aria-live` on the whole scorebug | Live region announces only the score | code review | ✅ |
| D14 | P2 | First-session card pushes every page down | Same card on every route | One-line strip away from the step's page | screenshot | ✅ |
| D16 | P2 | Bug button on by default, covers the feed | Store default `true` | Default `false` (saved settings are kept), hidden on the live screen | code review | ✅ |
| D1 | P0? | Result page "not played yet" | Not reproduced on a quiet tree (VICTORY 22–21 shown); the audit run overlapped hot-reloads | none | manual run | ❔ |
| A6 | P2 | Back-and-forth movement in quick multi-kills | Between two anchors < 4 s apart the player drifted back toward their default spot and returned | Phase 2: hold between them (`SHORT_LEG = 4`) | `round-script-motion.test.ts`; audit: bursts 119 → 41 in 334 rounds | ✅ (some remain: cover trips) |
| A7 | P3 | Some graph edges clip props | Graph stitching | none | 0.09% of moving samples | ⏸ low impact |
| A8 | P3 | Teammates overlap | Shared spots | Cover keeps 2.2 map-% spacing | teammate-spacing test | 🟡 |
| A9/QA-2 | P2/P3 | Retake flash after the retake started | Third flash timed at t + 0.1 | Phase 2: flashes at t − 1.1 / − 0.8 / − 0.5 (timing only, no RNG change) | `resolver-order.test.ts › no grenade after the thrower's death` | ✅ |
| QA-3 | P2 | Lurker picks resolved out of order | A lurk pick is resolved apart from the hit, so its kill was pushed before earlier kills | Phase 2: opening kill, trades and 1vX recomputed from the kills in time order; the hit's first duel keeps its opening bonus | `resolver-order.test.ts`; wrong opening kill 11 % of rounds → 0 % | ✅ (outcomes; the lurk victim's state is still applied early, see G) |
| QA-4/C10 | P2/P3 | Every HE damages someone; grenades can't kill | Resolver rolled a guaranteed 12–45 HP | Phase 2: landing error + CS2 falloff; 26 % of HEs hit nobody; misses placed out of reach. Lethal HEs measured separately, **not integrated** | `grenade-damage.test.ts` (9); `GRENADE_CALIBRATION_2026-10.md` | ✅ misses / ⏸ lethality (decision) |
| QA-5 | P3 | One cross-floor duel | Placement | Visibility returns false across floors, so the duel spot cost now covers it | stress run | 🟡 |
| C7 | P3 | Labels overlap in crowds | Plates rode with their dots for 250 ms between layouts | Phase 2: relayout as soon as two plates (or a plate and a dot) clash | simulated 4 maps at 900 px: 3.1 % → 0 % of frames at 1×, 16 % → 0 % at 4× | ✅ |
| C9 | P3 | Dead duplicate frame model | Legacy | none (tests still use it as reference) | | ⏸ |
| PF-1/PF-2 | P2 | `structuredClone` hot spot; perf baseline over target | Clones every round | none | | ⏸ not touched (save format risk) |
| PF-3 | P3 | Synchronous round build | | none; the build is now about 5.8 ms p50 (was 4.7) because of the cover pass | perf test (< 6 ms) | ⏸ |
| D8/D9/D12/D13/D15/D17–D19 | P2/P3 | Feed placement and grouping, other polish | | none | | ⏸ polish backlog |

## C. Research and design decisions

See [`TUNING_COMBAT_2026-10.md`](TUNING_COMBAT_2026-10.md) for every constant
and its source. The key decisions:

- **Fix the motion, not the outcome.** The calibrated resolver decides who
  wins every round and every duel. Changing it would shift win rates and
  economy balance, which the brief said not to touch. So stand-offs are
  fixed by moving holders into cover, not by inventing extra kills.
  - Trade-off: about two thirds of rounds still have a short sighting (mostly
    3–5 s, and mostly while players walk). Removing those would need the
    resolver to create more fights.
- **Line of sight is baked, not ray-cast at runtime.** The bake costs
  0.9–2.7 KB per map. The runtime cost is a byte lookup, and a stale bake
  falls back to the old behaviour (with a failing test).
- **Return fire only when it really happened.** The victim fires back on the
  radar only when the resolver recorded chip damage on the winner, so shots
  and HP bars always agree.
- **Grenades follow CS2 numbers** (98 damage, about 350 u radius, linear
  falloff). The radius is the least certain number (330–385 u in sources).

## D. Implementation summary

| Area | Files | Change |
|---|---|---|
| Line of sight | `engine/match/round-script-visibility.ts`, `scripts/bake-round-visibility.ts`, `data/round-maps/visibility/*` | Baked node-to-node line of sight per map (eye height, multi-surface aware), a stale-bake guard, and a smoke segment test |
| Cover pass | `engine/match/round-script-cover.ts`, `round-script.ts`, `round-script-context.ts` | New pass after step assembly. Exposed holds step into cover and return in time for anchors. No allocations in the sampling grid |
| Duel placement | `engine/match/round-script-timeline.ts` | Sight and smoke costs in `chooseDuel` |
| Grenades | `engine/match/round-script-tracks.ts`, `round-script-types.ts`, `round-script-sample.ts` | `placeGrenade`, smoke clouds, `hitId`/`dmg` carried to the script. `sampleTrack` moved out to break an import cycle |
| Resolver | `engine/match/round-sim/simulate.ts` | Dead players no longer arrive at or throw retake utility |
| HP | `lib/round-hp.ts` | Return-fire lead, molotov ticks |
| Radar | `lib/radar-scene.ts`, `lib/radar-draw.ts`, `components/match/RadarCanvas.tsx`, `lib/radar-level-selector.ts` | Shot exchange, HP-lost segment, critical pulse, HE pop at the true radius, floor hysteresis |
| Clock | `lib/live-feed-clock.ts`, `lib/radar-scrubber.ts`, `LiveFeed.tsx`, `RadarScrubber.tsx`, `MapRadarPanel.tsx` | One clock everywhere |
| Live screen | `MomentCallout.tsx`, `LiveRosterCard.tsx`, `LiveMatchScoreboard.tsx`, `DecisionCard.tsx`, `app/match/[id]/live/page.tsx` | Banner spacing, YOU tag, screen-reader score, buy card, results button |
| Shell | `GameShell.tsx`, `store/game-store.ts`, `GettingStartedChecklist.tsx` | Bug button default and hiding, one-line guide |
| Tests | `__tests__/combat-overhaul.test.ts` (new), `radar-level-selector`, `radar-scrubber-review` | See F |

Save compatibility: no saved data shape changed. `showBugReportButton`
keeps whatever a save already stores. Scripts are rebuilt from saved rounds,
so old saves get the new motion.

## E. Before-and-after evidence

Screenshots are not committed. They are in the project files folder
`overhaul-evidence/`. Radar pairs show the same map, round and moment on
`main` (port 3002) and on this branch (port 3001), taken from
`/dev/radar-preview`, which runs the real resolver → round script → live
radar panel. Live-screen shots come from a full career match played in
Chromium at 1920×1080 and 1280×720.

| Evidence | Files (`before` / `after`) | What changed |
|---|---|---|
| Grenade damage | `radar/04_he_damage_r2_*` | Before: the HE pop is small and lands away from Mako, who still loses 40 HP. After: the blast radius is drawn at its real size and covers Mako (60 HP), with a red "HP lost" segment. zent also steps aside from a T walking through mid instead of standing on top of him |
| Molotov / health bars | `radar/05_molotov_r3_*` | Before: pyx shows 84 HP the instant the fire lands next to him. After: the fire is under him and the damage ticks in (92 HP at this moment), with a lost-HP segment and hit ring |
| First contact / reciprocal fire | `radar/03_first_contact_r1_*` | After: shot streaks between the two duelists in the lead-in to the opening kill. Before: nothing until the kill |
| Movement / stand-off | `radar/01_standoff_r7_*` | Positions at the moment of a 35 s stand-off on `main`; the clock now reads time left (1:15) like the scorebug |
| Elimination / round end | `radar/06_round_end_r5_*` | Death markers, scrubber reads ROUND OVER instead of LIVE |
| Main live UI | `live/1920_26_live_combat_late`, `live/1280_26_live_combat_late` (before in `live-before/`) | YOU tags on the scorebug and roster; feed times match the scorebug (1:27 on both) |
| Buy card | `live/1280_27_live_decision_card` vs `live-before/1280_27_*` | 4 calls instead of 5, a note for 2×AWP = Full buy, one "Edit loadouts" link, nothing clipped at 1280 |
| Final match state | `live/1920_30_match_end_beat`, `live/1920_31_match_result` | End beat and result page (DEFEAT 6–13). The result page loaded every time (D1 not reproduced) |

Measured (audit harness: eye-height ray casts on the collision mesh, all 8
maps × 2 seeds, about 335 rounds):

| Metric | Before | After |
|---|---|---|
| Stand-off seconds at ≤ 6 map-% | 8,304 | 2,672 (−68%) |
| Stand-off seconds at ≤ 10 map-% | 18,276 | 6,533 (−64%) |
| Stand-offs of ≥ 20 s | 54 | 2 |
| Rounds with any stand-off | 88% | 67% |
| Stand-offs per round | 3.08 | 1.59 |
| Kill lines blocked at eye height | 28.6% | 3.6% |
| HE distance from victim (median / max) | 10.7 / 33.8 (p90) | 4.7 / 6.4 (radius 6.8) |
| Molotov distance from victim (median) | 8.9 | 0.01 |
| Grenades on the wrong floor | 18 | 0 |
| Throws by dead players (stress run) | 121 in 8,343 rounds | 0 in 60 series |

Test fixture (Mirage, Inferno, Nuke and Ancient, seed 11, baked line of
sight): 57.1 → 30.0 stand-off pair-seconds per round, longest stand-off
70 s → 19.5 s, and 49 → 0 stand-offs of 20 s or more.

## F. Verification results

Phase 1 results are below. Phase 2 results (after the grenade and gameplay
fixes) are in section I and supersede these where they differ.

| Check | Result |
|---|---|
| `tsc --noEmit` | 0 errors |
| `next lint` | no warnings or errors |
| Full `jest` (before the last two small commits) | **258 suites, 2,734 tests, all passed** (659 s) |
| Jest re-run after the final cover-pass and buy-card commits | round-script, live-round-script, calibration, combat-overhaul, radar controls/scrubber, live labels: 7 suites, 71 tests passed |
| New tests | `__tests__/combat-overhaul.test.ts`: 10 tests (bake freshness, cross-floor, duels in sight, stand-off metric, grenade placement, dead throwers, HP timing, radar fire, HP lost, feed clock) |
| `npm run build` (Next production build plus worker check) | **passed**; "production worker starts without browser globals" |
| Runtime | Full career match played in Chromium (dev server) at 1920×1080 and 1280×720, through skip match, end beat and result page. No page errors in the capture logs |
| Electron / Steam packaging | not run in phase 1 (see section I for the phase 2 Linux QA package) |
| Performance | Round script build p50 is about 5.8 ms, up from 4.7 ms on `main` (the perf test limit is 6 ms). Visibility bakes are 0.9–2.7 KB per map |

Skipped or failed: none. One audit-harness test I wrote (a harmless HE never
lands on a living opponent) was dropped: the resolver never produces a
harmless HE, so it had nothing to check (see QA-4).

## G. Remaining work

(Updated after phase 2; see section I.)

- **Release status: not release-ready.**
  - The packaged app was verified only as a Linux local-QA build in a
    container under a virtual display. The Windows/Steam package has
    not been built or run.
  - D1 (result page) still needs one manual playthrough on a real install.
- **High priority:**
  - **Short sightings (3–5 s) remain.** The phase 2 audit (baked line of
    sight, ≤ 6 map-%, ≥ 3 s, not the lead-in to the pair's own duel) finds
    2.3 sightings per round:
    - 59 % last 3–5 s;
    - 35 % involve two moving players;
    - 30 % a T walking past a holding CT;
    - 23 % two holders.
    In 306 cases the cover pass found no hiding spot. That is mostly a
    whole team walking through a holder's area when the resolver gave
    them no fight. Fixing this properly needs the resolver to create those
    fights (a calibration change), or the script to route walkers around
    enemies. Relaxing the cover search changed nothing measurable.
  - QA-3 (rest): the lurk pick's victim is still removed from the hit
    before their recorded death time. Outcomes and stats are now read in
    time order, but the resolver's own sequencing is unchanged.
- **Product decision (made):** HE grenades stay non-lethal for this release
  (Isac, 2026-10-23). Lethal HEs are a separate future change. It needs:
  - fight-list guards;
  - a utility death in the round script;
  - a kill-feed icon.
- **Lower priority polish:** feed grouping and placement (D8/D9),
  D12/D13/D15/D17–D19.
- **Packaging finding (Linux only):** `sharp`'s native library
  (`@img/sharp-libvips-*`) is packed inside the asar and fails to load on
  Linux. The QA build fixed it by unpacking `@img/**`. The Windows release
  config was not changed or tested here.
- **Unverified risks:**
  - The HE radius is an estimate.
  - Windows packaging and Steam integration were not exercised.
- **Deferred:** PF-1/PF-2 performance (touches save cloning), moving the
  round build off the click handler (PF-3), and deleting
  `radar-script-frame.ts` (C9).

## H. Next step

Build and run the Windows package on a real machine (`npm run qa:package`,
then play one match), and play D1 through to the result page. Then decide
how to handle the remaining short sightings. Either the resolver creates a
fight for close contacts (a calibration change that needs sign-off), or the
script routes walkers around enemies.

## I. Phase 2 (2026-10-23): grenades, gameplay fixes, release check

### What changed

| Item | Change | Measured effect |
|---|---|---|
| HE misses | `engine/match/grenade-damage.ts`: damage = 98 × (1 − distance/6.8), ×0.6 with armour; 0 out of reach, behind a wall or on another floor. Landing error depends on the thrower's grenade skill (one random draw per throw, as before) | 26.1 % of HEs hit nobody (was 0 %); 20.9 HP per throw (was 19.3). All round, economy and win-reason metrics stay in band. See `GRENADE_CALIBRATION_2026-10.md` |
| HE lethality | Experiment only, **not integrated** (Isac: keep non-lethal) | 4 of 1,704 HEs would kill; no outcome change; 2 impossible states without extra guards |
| Event ordering (QA-3, part) | `finish()` re-derives opening kill, trades and the first 1vX per side from kills in time order; the lurk pick no longer steals the opening kill | Wrong opening kill: 11 % of rounds → 0 % |
| Retake flashes (A9/QA-2) | Pop 1.1 s (first flash) and 0.8 s (second) before the retake fight instead of seconds late | Timing change only; no separate audit metric |
| Back-and-forth (A6) | A leg of 4 s or less to a reachable next anchor holds instead of stepping out and back | Oscillation bursts 119 → 41 per 334 rounds; stand-offs unchanged (533 → 526) |
| Radar labels (C7) | Forced relayout when two name plates overlap or a plate covers another dot | Overlapping plates 3.1 % → 0 % of frames at 1×, 16 % → 0 % at 4× |
| Short sightings (3–5 s) | **Not fixed** (see section G) | 2.3 per round remain |

New tests: `grenade-damage.test.ts` (9: direct hit, partial, edge of radius,
outside radius, obstructed, other floor, nobody hit, armour, miss
distribution), `resolver-order.test.ts` (5), `round-script-motion.test.ts`
(oscillation bound). `l21-paired-and-insights.test.ts`: the `call-full-buy`
scenario now runs 1,200 seeds. At 400 seeds the HE change pushed its noisy
estimate to −7.25 pp, just outside the ±6 pp bound; at 1,200 seeds it is
−4.5 pp (95 % CI −7.3 to −1.7), inside the bound. The bound was not changed.

### Verification

| Check | Result |
|---|---|
| Full `jest` | **261 suites pass** (one scenario failed before the seed-count change above; passes after) |
| `next lint` | clean |
| `npm run build` | passed, including the worker check |
| Packaged Electron | **Linux local QA build only**, from a Linux `dir` copy of the QA package config, run under a virtual display as a non-root user and driven over the remote debugging port. Nothing was published or uploaded, and nothing went to Steam |
| Full match, packaged app, 1920×1080 | New career, then a full BO1 (Sandstone, 7–13) at 2× then 8× (key moments), covering multi-player fights (the 1280 capture shows a triple kill), round transitions, the end beat and the result page. No page errors logged |
| Full match, packaged app, 1280×720 | The same fixture from the same saved state, through to the result page (7–13, deterministic replay of the same match). No page errors logged |
| Windows package / Steam | **not built or run** |
| Performance | Calibration `ms_per_map` about 5.8–7.9 ms in this container (informational; no limit) |

Evidence (project files): `overhaul-evidence/electron/` (1920 and 1280
screenshots, `errors.log`), `overhaul-evidence/grenades/` (calibration
comparisons and the lethal patch). Before images for the live screens are in
`live-before/` from phase 1.

### Defects found during the packaged run

- **Linux packaging:** `sharp`'s native library fails to load from inside the
  asar. Fixed only in the QA config here (unpack `@img/**`); the Windows
  release config was not changed.
- **Top bar at 1280×720:** the "CLUB" nav item runs into the search button
  on the match result page.
- **Help bubble at 1280×720:** the floating help button covers part of the
  MVP rating on the result page.

