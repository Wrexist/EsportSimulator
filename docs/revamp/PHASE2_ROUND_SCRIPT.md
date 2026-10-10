# Phase 2 — Round script engine

Goal: every round is described by one deterministic **round script** (plan, player tracks, duels, utility, bomb). The radar, kill feed and stats read it, so what the radar shows is what happened. Types: `engine/match/round-script-types.ts`.

## Stages

| Stage | What | Results change? |
|---|---|---|
| **2A** | Script is built *on top of* today's resolver (`engine/match/round-outcome.ts`): it places each resolver kill at a plausible contact point on real routes, picks the attacked site, throws bought utility, moves the bomb. | No — outcomes, economy, saves unchanged |
| **2B** | Script *decides* the round: duels resolved from aim, weapon, peek/hold, utility and trades; streak bonuses gone; calibrated against pro CS2 numbers. | Yes — gated by the calibration harness |

## 2A work items

### W1 — Baked round maps (`data/round-maps/<mapId>.json`, `RoundMap`)
- Source: nav meshes `public/map-studio/spatial/<Map>.json` (world coords + `transform`), native plant zones and spawn pins in `public/map-studio/drafts/*-native*.json` (radar %), existing coarse layouts `data/map-layouts/*.json` (for orientation only).
- Tool: `scripts/bake-round-maps.ts` (deterministic; re-runnable). Uses `engine/spatial/navigation.ts` (`findRoute`) and the existing radar↔world transforms (`engine/spatial/registration.ts`, `fromRadar`).
- Per map: spawns (≥5/side), sites (centre, polygon, ≥4 plant spots), routes (≥2 T routes per site through different corridors, ≥1 CT setup route per site, rotations A↔B, optional lurk), holds (≥3 per site incl. anchors at site entrances), utility landing spots (per site: ≥2 smokes, ≥1 molotov, ≥1 flash for T executes; ≥1 CT retake molotov), `runSpeed`.
- Every route point lies on the nav mesh; route floors correct (Nuke/Vertigo). Size ≤ ~80 KB per map.
- QA: one review PNG per map (routes/holds/sites/utility over the radar art) in `tmp/`, plus a jest test validating the schema and invariants for all 8 maps.

### W2 — Script builder (`engine/match/round-script.ts`)
- `buildRoundScript(input: RoundScriptInput, map: RoundMap): RoundScript` — pure, seeded, < 2 ms per round.
- `samplePositions(script, t): SampledPlayer[]` — binary search + linear interpolation.
- Plan: T strategy from buy level, playstyle and seed (eco → stack/eco, rush on low buys, default/execute/split/fake otherwise); site = plant site if the resolver planted, else chosen; CT setup 2-1-2 by default, stacks when the seed/playstyle says so.
- Assignment: roles → routes (entry leads the execute, AWPer holds/anchors, lurker on the alt route, support throws utility), CT anchors per site, rotators.
- Duels: each resolver KILL at time `t` becomes a contact — killer and victim must be within line-of-sight distance (same or adjacent contact zone, ≤ ~12 map-%) at `t`, victims stop at their death point; trades happen near the previous death; post-plant kills happen near the bomb.
- Utility: only what was bought (`players[].utility`), thrown at `map.utility` spots for the plan's site, timed before the execute.
- Bomb: T carrier walks with the execute; plant at a plant spot at the resolver PLANT time; defuser stands at the bomb from `defuse.tStart`; explosion at plant + 40 s.
- Spacing: no two teammates within 2 map-% unless stacked on purpose; speed never exceeds `runSpeed × 1.1`.
- Development fallback until W1 lands: `roundMapFromLayout(layout)` built from `data/map-layouts/*.json`.

### W3 — Integration
- Live match: build the script once when a round's events are known; radar positions come from `samplePositions` (drop-in replacement for `computeRadarPositions` output: dots, bomb, killLines, smokes).
- Radar: death markers at `deaths[].at`, shot tracers `from → at`, smoke/molotov circles, bomb carrier and planted bomb, site from the plan.
- Events gain optional `site` (PLANT/DEFUSE) and `location` (KILL) fields — additive, save-compatible. The kill feed and result screen can name the site.
- Not persisted: scripts are rebuilt deterministically from seed + events.

## 2A acceptance (radar audit harness, 200 rounds × 8 maps)
| Metric | Audit (today) | Target |
|---|---|---|
| Killer is victim's nearest enemy | 29% | ≥ 80% |
| Kills with a visible shooter line | 50% | 100% |
| Teammate pairs overlapping | 39% | < 10% |
| Site from the plan (not a coin flip) | 0% | 100% |
| Positions on the nav mesh | n/a | ≥ 99% |
| Max speed | — | ≤ runSpeed × 1.1 |
| Build time per round | 9.5 ms per *tick* | < 2 ms per round |

## 2B (after 2A)
Fight model, utility effects, CS2 economy rules, stats computed from the script, calibration harness (`tmp/audit-2026-10-09/sim/` targets), save/version migration, worker offload.
