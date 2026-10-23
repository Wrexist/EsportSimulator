# Combat, radar and grenade tuning (2026-10)

This file explains every number added by the combat overhaul on branch
`claude/project-thread-6h04ps`: where each number comes from, what was
measured, and what is still a judgement call. Coordinates are radar % (0–100).
1 map-% is about 51 world units (≈ 1.3 m). `runSpeed` is about 4.2 map-%/s.

## 1. What a real fight looks like (research)

| Fact | Value used | Source / reasoning |
|---|---|---|
| Visual reaction time, general population | ≈ 280 ms | Claypool et al., WPI "Reflex" study of FPS players (median simple visual reaction) |
| Visual reaction time, regular gamers | ≈ 220–230 ms | Same study, frequent-gamer group |
| CS2 HE grenade base damage | 98 | csdb.gg weapon data |
| CS2 HE armour penetration | 57.5 % | csdb.gg. The resolver already uses 0.6; we keep 0.6 so the HP ledger doesn't change |
| CS2 HE damage radius | ≈ 350 u | Community measurements. **Uncertain** (sources disagree between about 330 and 385 u); we picked the middle |
| Molotov | damage over time while standing in the fire, about 7 s burn | CS2 behaviour; the resolver books the total as one number |

What this means for the radar: in a real duel both players see each other and
fire within about 0.2–0.3 s, then the loser dies. "First contact" is therefore
a short exchange of fire, not two dots standing still for half a minute.

## 2. Line of sight (`engine/match/round-script-visibility.ts`)

| Constant | Value | Why |
|---|---|---|
| `VIS_RADIUS` | 12 map-% | Covers the longest placed duel and the exposure range (10) with margin. Pairs farther apart are never "visible" (a sighting there isn't a fight the radar has to explain) |
| Eye height (bake) | 64 u | CS standing eye height |

The bake (`scripts/bake-round-visibility.ts`) ray-casts the collision mesh at
eye height between the ground points of every node pair on the same floor.
When a radar point sits over more than one walkable surface (stairs,
bridges), the pair counts as visible if any surface pair can see. That is the
conservative answer for both uses. The bake records a node count and a
coordinate checksum, and the runtime ignores a stale bake. The jest test
`combat-overhaul.test.ts › line of sight bake` fails until the bake is re-run.

Duel placement (`round-script-timeline.ts`) adds `NO_SIGHT = 120` to the cost
of a duel spot pair with no line of sight, and `THROUGH_SMOKE = 60` when the
line crosses an active smoke. These are costs, not bans: if every candidate is
blind, the cheapest is still used. They are meant to dominate the other terms,
so a visible spot wins whenever one exists (measured: kills placed without
line of sight fell from 28.6 % to 3.6 %).

## 3. Cover pass (`engine/match/round-script-cover.ts`)

| Constant | Value | Why |
|---|---|---|
| `SAMPLE_SECONDS` | 0.5 | Matches track keyframe spacing |
| `EXPOSE_RANGE` | 10 map-% (≈ 13 m) | Inside this, two players in sight of each other would certainly fight in CS. Farther sightings are long-range holds, which are legitimate |
| `ENGAGE_GRACE` | 2.5 s | A sighting this close to the two players' own duel is the start of that duel (3–10 reaction times), not a stand-off |
| `MIN_HOLD` | 1 s | Shorter holds are passing through |
| `COVER_RANGE` / `COVER_WALK` | 16 / 18 map-% | The first version used a much smaller search and found no cover at all in open areas (mid, long corridors); widening it is what made the pass work there |
| `MERGE_GAP` | 1.5 s | Two exposures this close become one trip instead of a jitter in and out of cover |
| `COVER_SPACING` | 2.2 map-% | Keeps teammates who take the same cover from stacking (the teammate-spacing test needs < 2 % of samples under 2 map-%) |
| `PARTIAL_CANDIDATES` | 16 | When nothing nearby is fully hidden, take the node seen the least (≤ 1/5 of the time, and less than the original spot) |
| `STEP_ASIDE` | 6 map-% | When nothing is even partly hidden (an enemy sweeps the whole area, e.g. a T walking straight through a mid holder), the holder steps to the reachable node that stays farthest from that enemy, at least 6 away (the stand-off range) |

Two exposures close in time are folded into one trip only when a single cover spot serves both; otherwise each gets its own trip.

Rule: anchors (duels, plant, defuse, pickups) never move. Only holding stretches
are edited, and walking never goes above run speed.

## 4. Grenades (`engine/match/grenade-damage.ts`, `round-script-tracks.ts`)

| Constant | Value | Why |
|---|---|---|
| `HE_DAMAGE_RADIUS` | 6.8 map-% | 350 u / 51 u per map-% |
| `HE_MAX_DAMAGE` | 98 | CS2 |
| `HE_ARMOUR_SHARE` | 0.6 | Same as the resolver |

Damage model (`heDamage`): 98 × (1 − distance/R), times 0.6 with armour,
rounded. A target at or past R, behind a wall, or on another floor takes 0.

The resolver no longer rolls a guaranteed 12–45 HP. It rolls a landing error
(`heLandingDistance(roll, grenades)`): `R · max(0, lo + 1.1·roll)` with
`lo = 0.2 − (grenades − 50)·0.003`. For an average thrower (grenades 50) that
keeps the old mean raw damage (≈ 28.5 HP per throw) but about 27 % of throws
land out of reach and do nothing. Better throwers land closer. It still uses
one draw from the same stream as the old roll, so every other random draw in
a round is unchanged.

A damaging HE lands at distance `R · (1 − raw/98)` from the victim, with
`raw = dmg / 0.6`, clamped to `[0.6, 0.9 R]`, preferring spots with line of
sight to the victim. That is the falloff inverted, so a 50-damage HE lands
closer than a 10-damage one. A harmless HE is placed where no living opponent
is in reach (out of range, behind a wall or on another floor): first by
walking back toward the thrower, then the nearest such node. A molotov lands
0.4 map-% from its victim (inside the fire) and always damages it.

Measured (8 maps × 2 seeds): 299 HEs, 224 hits, 25 % harmless. Grenades still
cannot kill (`hurt` floors at 1 HP); lethality is a separate experiment
(report, QA-4).

## 5. HP timing (`lib/round-hp.ts`)

| Constant | Value | Why |
|---|---|---|
| `RETURN_FIRE_LEAD` | 0.25 s | The loser's chip on the winner lands one reaction time (≈ 220–280 ms) before the kill instead of exactly at it, so the winner's HP drops while the exchange is drawn |
| `MOLOTOV_TICKS` | 4 | The molotov total is split into ticks instead of one instant hit |
| `MOLOTOV_BURN_SECONDS` | 1.5 s | Span of the ticks. It is shortened to `death − t − 0.1` when the victim dies sooner, so all burn damage lands before the death (the HP ledger stays exact) |

## 6. Radar feedback (`lib/radar-scene.ts`, `lib/radar-draw.ts`)

| Constant | Value | Why |
|---|---|---|
| `ENGAGE_SECONDS` | 0.6 s | Shots are drawn this long before a kill: about 2–3 reaction times, enough to read as an exchange at 1× speed |
| `OPENING_ENGAGE_SECONDS` | 0.9 s | The round's first kill (first contact) gets a longer lead-in so it reads clearly |
| `HP_LOSS_SECONDS` | 0.9 s | The red segment showing HP just lost fades over this time |
| Critical pulse | ≤ 25 HP | A slow ring pulse (off under reduced motion and for the other floor) |
| Shot bursts | about 6 per second | Two shooters drawn out of phase |

The killer always fires during the lead-in. The victim fires back only when the
resolver says it hit (it has duel chip on the winner), so the radar never
shows damage the HP bars don't.

Floor auto-select (`lib/radar-level-selector.ts`): `FLOOR_MAJORITY = 2`. The
view switches only when the other floor has at least 2 more players, or when
the shown floor is empty. Active shots decide the floor first.

## 7. Feed and scrubber clock

The scorebug counts down: round time left, stopping at the plant, then the
40 s bomb timer. Feed rows, scrubber labels and the review chip now use the
same clock (`lib/live-feed-clock.ts`, `scrubberClock` in
`lib/radar-scrubber.ts`), so a kill at "1:30" in the feed happened when the
scorebug said 1:30.
