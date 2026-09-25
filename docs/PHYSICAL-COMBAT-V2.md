# Physical combat v2 integration — 21 September 2026

## Scope

Follow-up: [v3 career rehearsal and traversal](PHYSICAL-CAREER-V3.md) adds exact armor carry-over, team traversal and saved rehearsal ownership. The v2 evidence below remains historical.

Purchased career loadouts and attributes now drive the isolated physical round preview. This is **not enabled for production careers**. Existing careers continue using their current engine. No saves, map drawings, portraits or Steam builds were replaced.

## Implemented

- `engine/spatial/weapon-profiles.ts`: explicit profiles for all 25 weapons in the existing shop. Magazine, reserves, cadence, reload, spread, recoil, pellets, damage, armor absorption and range vary by weapon. Values are original provisional tuning, not extracted CS2 data.
- `career-loadouts.ts`: snapshots player identity, purchased weapon, armor, helmet, kit and utility stock. Rifle/AWP/pistol proficiency affects aim; reaction affects acquisition timing; proficiency and tactics affect recoil control. Invalid identities, attributes and weapon IDs fail validation instead of silently becoming a rifle.
- `team-model.ts` and `team-simulation.ts`: enforce those profiles, separate trigger pulls from shotgun pellets, require a helmet for head armor, use five/ten-second equipped-kit defuses, and emit weapon/headshot information in physical events.
- `objective-zones.ts`: planting inside a bound polygon on its intended floor; the planted bomb stays at the planter's position. Draft polygons are not implicitly certified. Unbound lab scenarios retain their older radius behavior.
- `round-replay.ts`: newly simulated rounds are tagged `spatial-round-v2`. Version-one replay/checkpoint readers remain available. V2 reward diagnostics use the lethal event's weapon, including HE/fire, rather than assuming the player's primary caused every kill.
- `round-settlement.ts`: pure sequential settlement rehearsal using existing economy rules. Consumed grenades leave survivor inventory; deaths use existing inventory cleanup. Score, loss streak and money update once. Repeated identical receipts are harmless after JSON resume; conflicting or out-of-sequence rounds fail.
- `resolve-career-round-preview.ts`: one owner binds inputs, runs physics, seals the replay, derives career-shaped results and calculates settlement. It uses the existing 115-second round and 40-second bomb clocks. It never writes to the career store.
- `spatial-lab.worker.ts`: `career-round-preview` request boundary, including map-reference checks. The production match worker/UI has not been switched to this API.
- `components/maps/TeamLab.tsx`: purchased-weapon selection, helmet/kit controls, individual attributes, actual magazine limits, extended clocks and authored-plant-area binding.
- `lib/live-match-utils.ts`: explicit 300 utility-kill reward, preserving the previous fallback amount while preventing a purchased sniper/SMG from determining grenade rewards.

## Calibration evidence

`scripts/launch/calibrate-physical-combat.ts` runs 200 deterministic stationary duels: five weapon pairings, two distances, both orientations and ten seeds. Results are in `docs/ui-review/physical-career/combat-v2-calibration.json`; SHA-256 of the run data is `5620b67478ba74b547ac3461b3548f7416b4101522fe57b2b39df7ef56ebdefd`.

The campaign exposed unrealistic head-only aiming for sniper/shotgun profiles. Those profiles now aim below the observed head contact. This adjustment uses observed contact information and does not reveal hidden opponents.

Balance is unfinished: AK won all 20 close M4 duels; Nova won only one of 20 close MP9 duels. Static duels omit price, scope handling, movement, team trades and map context, so these are diagnostic findings, not proof of balanced weapons. Baseline data is retained in `combat-v2-before-body-aim.json`.

## Remaining development gates

1. Implement exact remaining armor points across rounds; legacy economy currently stores armor as a boolean, so preview carry-over would replenish surviving armor to 100 next round.
2. Integrate authored walk/crouch/jump traversal into physical team routes and review Mirage wall heights and plant/spawn floors.
3. Calibrate moving combat, scope handling, utility decisions and full-team executes over multiple seeds and mirrored sides.
4. Add persistent career commit ownership with stale-result rejection, recovery receipts, halftime/map transitions and duplicate-worker/reload tests. The preview's receipts are not a substitute for an atomic store commit.
5. Connect replay-driven live UI, then verify resume-to-results in Chrome and the packaged Windows/Steam build. Browser automation has timed out; no fresh visual or click-through pass is claimed.

## What the map author needs to do

Follow `docs/ui-review/physical-career/YOUR-NEXT-STEPS.md`: review Mirage CT spawn and A/B boundaries, then the 17 unbound walls and 25 openings. Export the latest map-project JSON. Preserve newer browser-local edits; do not replace them with the older v12 file. Unknown physical heights can remain Draft with clear notes. Other maps can wait.

## Reproduce

Verified on 21 September 2026:

- Full Jest: **179 suites / 1,691 tests passed** (`tmp/physical-v2-full-tests.log`).
- TypeScript check passed (`tmp/physical-v2-types.log`); the subsequent production build also passed type checking.
- Production build and bundled worker startup passed (`tmp/physical-v2-build.log`). Existing lint warnings remain; the build log reports none in the modified spatial engine/TeamLab modules.
- Chrome visual/click-through checks and packaged Windows testing remain open.

```powershell
npm test -- --runInBand physical-career-loadouts spatial-teams spatial-round-replay
npx tsx scripts/launch/calibrate-physical-combat.ts
npm test -- --runInBand
npm run type-check
npm run build
```

The new tests exercise all weapon coverage, input immutability, attribute timing, head armor, shotgun ammunition, equipped-kit timing, floor-bound planting, JSON-resumed settlement, v1 replay compatibility, single-owner resolution and purchased HE consumption/rewards.
