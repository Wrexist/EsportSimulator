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

---

## Status — 2A done (2026-10-10)

Branch `claude/revamp-phase-2` (on top of Phase 0 + 1).

- **W1** `data/round-maps/<Map>.json` for all 8 maps, baked from the nav meshes by `scripts/bake-round-maps.ts` (10–11 routes, 9–12 holds, 17–20 utility spots, 6+6 plant spots per map; 30–46 KB each). Site labels follow the game's bombsite entities (the old `data/map-layouts` had A/B swapped on Anubis, Inferno, Mirage, Sandstone, Vertigo).
- **W2** `engine/match/round-script*.ts`: plan → assignment → timeline → duels → utility → bomb; `buildRoundScript`, `samplePositions`, `scriptInputFromResolverRound`, `prepareRoundMap`. ~1.1–1.5 ms per round.
- **W3** live radar samples the script every frame (`lib/live-round-script.ts`, `components/match/RadarScriptLayer.tsx`, `lib/radar-script-frame.ts`): view cones, persistent death markers, shot tracers, smokes/molotovs/flash/HE, bomb carrier/drop/plant/defuse, baked site letters, "Bomb planted at B by …" and kill locations in the feed. Old position engine deleted (incl. the 5 MB `data/radar-nav-data.json`).

| Metric | Before | After | Target |
|---|---|---|---|
| Killer is victim's nearest enemy | 29–34% | 87% | ≥ 80% |
| Kills with a visible shooter line | 50% | 100% | 100% |
| Teammates < 2% apart | 12.7% | 1.2% | < 10% |
| Site from the plan | 0% | 100% | 100% |
| On nav mesh | — | 99.0% | ≥ 99% |
| Max speed | — | 1.08 × run speed | ≤ 1.1 |
| Radar cost | ~9.5 ms per tick | 1.5 ms per round + 2.5 µs per frame | — |

Verification: type-check 0 · lint 0 · jest 214 suites / 2,217 tests. Screenshots: `tmp/phase2/radar/`.

**Carried into 2B:** early kills (< ~15 s) are sometimes out of reach because the resolver times kills without positions; AI teams buy no grenades; teammates occasionally within 2–3.6% (4.3% of pairs); Nuke "nearest enemy" counts players on the other floor.
