# Objective coordination — 2026-09-23

Physical rehearsals now use `spatial-round-v6`. Normal career results remain `legacy-v2`; physical settlement and rewards are not enabled.

## Changes

- A dropped bomb has one nominated, reachable recovery player. Nomination uses checked travel, with deterministic ID tie-breaking, and is reconsidered if the nominee dies or retires its route. Other attackers take separate reachable positions instead of all chasing the pickup.
- Non-carriers approaching a bombsite leave the planting destination to the carrier. Separate positions are selected 128–192 world units around the objective, with floor support, body clearance, route and movement validation, friendly spacing and reserved destinations.
- Post-plant attackers take positions near the actual bomb instead of returning to their opening assignments. The team planner keeps the planted site as its objective; it does not rotate toward an unused site.
- Retake support uses separate reachable positions. The nominated defuser's route and travel estimate target the actual bomb, including off-center plants inside an authored zone, rather than the site's reference marker.
- If no checked perimeter position is available, the actor holds supported ground. No teleport, invented floor, weakened world collision or enemy-position access was introduced.
- v1–v5 recordings remain readable. Existing engine-version gates require new rehearsals before continuing with changed simulation rules.

Implementation: `engine/spatial/team-simulation.ts`, `engine/spatial/team-model.ts`, and `engine/spatial/round-replay.ts`. Calibration reporting now records recoveries, nominations, defuses and a hash of the two team-simulation source files.

## Verification

- **186 suites / 1,759 tests passed** (`tmp/objectives-v6-all-tests.log`).
- New scenarios cover single-player bomb recovery, separated recovery cover, nearby post-plant positions, a clear defuser approach, an off-center authored plant, deterministic repetition and compatibility with v5 replays.
- Typecheck, targeted engine lint, production build and bundled worker startup passed. Existing unrelated build lint warnings remain.
- The latest user drawing is unchanged: SHA256 `68d5ce44e95636de7e0a8972044b840ae0a0ecfe4265f4cb9c8969fd2c7671e8`.
- No new browser click-through, Windows package or Steam installation test was performed. The local sealed rehearsal fixture is refreshed separately by `scripts/launch/check-physical-career.ts`.

## Full-round campaign

`npx tsx scripts/launch/calibrate-mirage-teams.ts --full` uses the existing provisional Mirage fixture: three combat seeds and one no-gun stress case, a 115-second round clock, 40-second bomb timer, and 160-second maximum observation horizon. Reports are stored in `docs/ui-review/physical-career/mirage-spatial-round-v6-full-rounds.json`; this is not certification of the latest drawing or all maps.

The final repeat matches these outcomes; its recorded simulator source hash was checked against the final source files:

| Scenario | Outcome | Plants / defuses | Recoveries | Resolution time |
|---|---|---:|---:|---:|
| Combat 4326170 | CT elimination win | 0 / 0 | 2 | 66.23 s |
| Combat 4326171 | CT defuse win | 1 / 1 | 0 | 106.09 s |
| Combat 4326172 | CT timeout win | 0 / 0 | 0 | 115 s |
| No-gun 4326170 | CT defuse win | 1 / 1 | 0 | 53.5 s |

The previously jammed no-gun case now plants and defuses, with blocked-movement ticks reduced from 680 to 393. All four runs preserve at least 32.03523 units of swept body separation. No actor ends in the retired `blocked` intent, but this does not mean every tactical stalemate is solved. All winners are CT; three combat seeds do not establish balanced gameplay.

## Preview/build isolation

An HTTP production check exposed a pre-existing preview-server issue: Next's dev workers reloaded the root config without the custom server's `conf` override and cleared production output. `next.config.js` now honors a process-local `ESIM_ISOLATED_REVIEW=1` flag, used by `scripts/launch/start-radar-review.cjs`. Normal builds still use `.next`; review workers use `tmp/anubis-radar-dev-build`. The production build was regenerated after stopping the conflicting preview.

Start the isolated viewer with `node scripts/launch/start-radar-review.cjs`. This is development tooling, not a Steam launcher.

Verified both servers running together: the production rehearsal route returns **404**, the development viewer returns **200**, and the production manifest remains present after development compilation. `tsconfig.json` includes the isolated development route types added by Next.

## Remaining work

This is a bounded improvement to objective coordination, not a general crowd or tactical AI solution. Endpoint-clearance failures remain. The first campaign still had a combat timeout following carrier loss, so recovery under opposition and tactical decisions to break a stalemate need further work. Perimeter positions are checked positions, not authored tactical cover or exposure rankings. General head-on passing, wider seed/map coverage, real-time simulation performance and full career/Steam validation remain open.

Next: inspect the remaining carrier-loss timeout, add recovery-under-fire regressions, and calibrate disengagement/utility support while preserving team knowledge and collision rules. No new map drawing is needed from the user for that work.
