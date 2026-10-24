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

Rule: anchors (duels, plant, defuse, pickups) never move. Walking never goes
above run speed.

Walkers (added 2026-10-23, before the hold pass). Someone about to walk into
sight of a close enemy they are not fighting either waits at the last spot on
that walk the enemy cannot see and goes on once the enemy has passed, or sets
off earlier from the hold before the walk so they pass before the enemy gets
there. The time comes out of the walk's next hold. Neither is allowed to move
an anchor, cross the plant (a walk to the site turns pointless after it), or
park the walker on a teammate.

| Constant | Value | Why |
|---|---|---|
| `MAX_YIELDS` | 4 per player per round | Bounds the pass; later waits rarely help |
| `YIELD_LOOKBACK` | 6 s | How far back on the walk a wait spot may be; farther back reads as turning round |
| `YIELD_MARGIN` | 1 s | The wait spot must stay hidden this long after setting off again |
| `LEAVE_EARLY_MAX` | 6 s | Longest early start beyond the exposure itself |
| (catch-up pace) | up to 1 / `WALK_PACE` | After a wait the rest of the walk may speed up to make its next hold, never above run speed on any step |

Sight-aware routes (added 2026-10-24, before the walkers). A walk that passes
in sight of a close enemy is re-planned on a path that costs extra for every
node an enemy would see at the time the walker gets there (Dijkstra on the nav
graph). The new route is kept only when it is seen less than the old one, fits
the same time at no more than run speed, and is not much longer. Each player
may set off earlier from the hold before the walk, never before an anchor or
across the plant.

| Constant | Value | Why |
|---|---|---|
| `MAX_REROUTES` | 6 per player per round | Bounds the pass |
| `SIGHT_COST` | 8 | Extra path cost per seen node, scaled by edge length over pace |
| `DETOUR_MAX` / `DETOUR_EXTRA` | 1.8× + 3 map-% | Longest detour allowed; longer ones read as wandering |

On its own this is a small gain (Sandstone 13.7 → 12.8 s per round of close
no-fight sightings); most walks have no hidden route that fits their time.

Duel placement also adds `BYSTANDER = 25` when the killer's spot is in clear
sight of one of the victim's teammates within `BYSTANDER_RANGE = 8` map-%:
the killer stays there after the kill, and that teammate would shoot.

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
`lo = 0.22 − (grenades − 55)·0.002`. For an average thrower (grenades 55; the
player database averages 56) that keeps the old mean raw damage (≈ 27 HP per
throw, the old T 12–45 and CT 10–40 rolls blended) but about 29 % of throws
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

Measured (all maps × seeds 1–12, skill 70): 1,692 HEs, 26 % harmless, 20.9 HP
per throw (19.3 before). Grenades still cannot kill (`hurt` floors at 1 HP).
The before/after calibration and the lethal-HE experiment are in
`GRENADE_CALIBRATION_2026-10.md`.

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

## 8. Chance meetings become fights (`engine/match/round-sim/contacts.ts`, `contactsUntil` in `simulate.ts`)

The resolver decides who fights whom before the round script places anyone,
so the script could walk two enemies past each other in clear sight with no
fight (14.7 s per round of enemy pairs within 4 map-% in sight with no duel,
measured on all maps). Now, for the manager's own matches (the only rounds
shown on the radar), the round is resolved, its script is built (without the
cover pass), and every enemy pair that stays within `CONTACT_RANGE` in sight
for `CONTACT_SECONDS` with one of them moving and no duel of their own within
2.5 s is fed back to the resolver as a duel at that moment. The round is then
resolved again, up to `CONTACT_PASSES` times. AI-vs-AI matches skip it.

| Constant | Value | Why |
|---|---|---|
| `CONTACT_RANGE` | 5 map-% (≈ 6.5 m) | Close enough that both would certainly shoot |
| `CONTACT_SECONDS` | 1 s | Shorter sightings are passing glimpses |
| `CONTACT_REACTION` | 0.5 s | First sight to first shot |
| `CONTACT_PASSES` | 2 | A third pass gained little for its cost |
| `CONTACT_STALE` | 6 s | A meeting the round has moved well past is dropped |
| `CONTACT_T_EDGE` | 3 points | The T moves with intent; the CT is usually rotating. Without it CT round wins rose about 5 points |
| `CONTACT_AWP_OPEN` | 10 points | A scoped AWP takes the first shot of the round |
| `CONTACT_OPENING_AWP_ONLY` | true | Before the first kill only meetings with an AWP count; rifler-vs-rifler chance meetings handed openings to lurkers and supports (AWPer opening share fell to 20.8%) |
| (post-plant) | off | After the plant, extra meetings turned bomb wins into eliminations (T bomb share fell below 32%) |

Effect (seeds 11 and 12, all 8 maps, close no-fight sightings per round,
with the sight-aware routes above): 14.7 s → 10.3 s. Per map: Sandstone
13.7 → 10.6, Mirage 14.7 → 11.2, Inferno 18.7 → 12.3, Nuke 15.2 → 8.7,
Overpass 13.7 → 11.4, Vertigo 10.6 → 8.2, Ancient 16.5 → 10.9, Anubis
13.5 → 8.9. Calibration (600 maps) stays in band (48 pass, 2 warn, 0 fail,
against 46 / 4 / 0 before); see the PR for the table. Cost: about 42 ms per
map instead of 4 ms, only for the manager's matches.

Successive meetings are `CONTACT_AFTER = 0.6` s apart (a meeting found while
a planned fight ran would otherwise land on the same instant as it). The
sight-aware routes only touch walks done before the plant; after it, a detour
on a retreat read as turning back toward the site.

Pro reference (ESTA CS:GO demos, `docs/revamp/pro-benchmarks/` on the
benchmarks branch): close quiet pair-seconds are about 0.4 s per round at
≤ 6 map-%, so the game is still well above pro levels. Closing the rest needs
the round script to plan around enemies rather than fixing meetings after
the fact.
