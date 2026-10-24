# Pro Counter-Strike benchmarks (2026-10)

Real numbers from real pro matches, to check the script-v1 resolver and the
round script against. Research only: nothing in the engine reads this file.

- **Main source: ESTA.** 1,558 parsed pro CS:GO demos (878 online, 680 LAN),
  Jan 2021 – May 2022, HLTV-listed top events, parsed with awpy 1.x
  ([dataset](https://github.com/pnxenopoulos/esta), CC BY-SA 4.0;
  [paper, arXiv 2209.09861](https://arxiv.org/abs/2209.09861)). Every figure
  below was computed here from all 1,558 demos (40,187 regulation rounds,
  269k kills, 131k HEs, 203k molotovs). Machine-readable copy:
  [`pro-benchmarks-esta.json`](pro-benchmarks-esta.json).
- **Line of sight** uses the game's own collision meshes
  (`public/map-studio/spatial/<Map>.mesh`, the geometry the visibility bake
  uses), ray-cast eye to eye between every pair of live enemies on every
  frame. That puts the real games and the simulator on the same yardstick.
  Six maps have both demos and a mesh: Mirage, Inferno, Nuke, Overpass,
  Vertigo and Ancient. As a check, 89% of real kill lines (not wallbangs or
  through smoke) are clear on the mesh: Nuke 94%, Mirage 92%, Inferno 82%,
  Ancient 85%. Inferno and Ancient were rebuilt for CS2, so their geometry
  differs more from the 2021–22 demos.
- **Secondary sources** (CS2, aggregated, not recomputed here) are in section 8.

How to reproduce: run the scripts in `scripts/` here in this order:
1. Download, then `extract.py`, then `records.py`.
2. `los.ts`, using a copy of PR #65's `engine/spatial/geometry.ts`.
3. `aggregate.py`, then `report.py`.

The run takes about 45 minutes and downloads about 4 GB.

## Caveats that matter

- **CS:GO, not CS2, and MR15, not MR12.** Per-round figures carry over well:
  win types, plants, timings, distances and damage. Per-map counts do not:
  rounds per map, overtime rate and ≤ 3-round losses.
- **Frames are 2 Hz.** A sighting starts at the first 0.5 s frame with line
  of sight, so real sight-to-shot times can be up to 0.5 s longer than shown.
  The median order still holds: first shot 0.12 s, then first damage
  0.23 s, then the kill 0.43 s.
- **Units.** 1 world unit = 0.0254 m. The game's 1 map-% ≈ 51 u ≈ 1.3 m,
  so 4 m ≈ 3.1 map-%, 6 map-% ≈ 7.8 m and 10 map-% ≈ 13 m.
- **Stand-off definition** matches the PR #65 audit. An enemy pair in line of
  sight inside the radius counts as "quiet" unless the pair's own kill comes
  within the next 2.5 s (`ENGAGE_GRACE`). A sighting is a run of quiet frames
  with gaps of up to 1 s.
- **Trades** use awpy's own flag (killing the player who killed a teammate,
  within 5 s), plus our own timing from a death to the killer's death.
- **Buy types** use HLTV's equipment-value bands, not the game's call names.
  Game *eco* ≈ Full Eco, *half* ≈ Semi Eco, *force* ≈ Semi Buy.

## Headline: real vs the simulator

| Metric | Real pro (ESTA) | Simulator now | Current target | Read |
|---|---|---|---|---|
| Sightings ≥ 3 s at ≤ 6 map-%, per round | **0.03** (2.4% of rounds have one) | 2.3 (PR #65 phase 2 audit) | – | **About 75× too many.** Real players almost never share close sight without shooting |
| Quiet pair-seconds per round, ≤ 6 map-% | **0.38 s** | – | – | Use as the stand-off target (≤ 10 map-%: 1.5 s) |
| Quiet pair-seconds per round, ≤ 4 m | **0.05 s** | 14–19 s (Isac's report) | – | Effectively zero, as expected |
| Contact at 0–4 m → damage within 1 s / 3 s | **73% / 85%** | – | – | **A close meeting is a fight.** 78% end in a kill within 3 s |
| Contact at 8–13 m → kill within 3 s | **62%** | – | – | Even at 13 m most meetings resolve fast |
| Sight → kill, median / p90 | **0.43 s / 1.6 s** | – | – | 80% of kills come within 1 s of first sight |
| Victim fired back before dying | **69%** | – | – | Return fire is normal |
| HEs doing no enemy damage | **64%** | ≈ 26% | – | Real HEs miss far more often |
| HE damage per enemy hit, median / p90 | **14 / 46 HP** | – | – | Most HE hits are chip damage |
| CT round win | **53.8%** | 49.9% | 50–53% | Real is slightly CT-sided. Abios CS2 2023–24 is close to even (46–56% by map) |
| T wins by bomb (share of T wins) | **41.6%** | 37.6% | ≈ 45% | Lower the reference to about 42% |
| CT wins: elimination / defuse / time | **68 / 23 / 9%** | 64.5 / 27.4 / 8.1 | 65 / 25 / 8 | Defuses run a little high in the sim |
| Plant rate (all rounds / gun rounds) | **52% / 54%** | – | – | New target |
| T win after a plant | **76%** | – | – | New target |
| First kill, median (s after freeze end) | **27 s** (p10 12 s, p90 70 s) | – | – | New target for the round script's first duel time |
| Opening kill → round win | **72%** | – | – | scope.gg CS2 Premier/FACEIT gives 65–73% |
| Eco (Full Eco) vs full buy | **6.3%** | 10.5% | ≈ 8% | The sim is slightly generous |
| Semi Eco vs full buy | **18.7%** | 31.6% (half) | 30–40% | The half-buy reference looks high |
| Force (Semi Buy) vs full buy | **33.5%** | 31.3% | 25–30% | Real is higher than the reference. Move it to about 30–35% |
| Kills per round | **6.53** | 6.71 | ≈ 7.1 | The reference is high for this sample |
| ADR | **72.2** | 73.8 | ≈ 76 | Same |
| Headshot kills | **46.1%** | 46.5% | 45–50% | ✓ |
| Trade kills (≤ 5 s) | **16.1%** | 23.8% | 20–25% | Lower under awpy's definition. HLTV counts trades differently, so check before moving the band |
| Trade time, median | **2.45 s** (58% of 5 s trades within 2 s) | – | – | |
| Win the next round after a win | **65.1%** | 64.2% | 60–65% | ✓ |
| Pistol winner wins round 2 / rounds 2 and 3 | **77.2% / 58.6%** | 76.0 / 44.8 | 78 / 48 | **Rounds 2 and 3 are too low in the sim.** Real conversion is about 59% |

## How each metric feeds calibration

- **Stand-offs (the main consumer is PR #65).**
  - Target: ≤ 0.5 quiet pair-seconds per round at ≤ 6 map-%, and ≤ 0.05 sightings of 3 s or more per round.
  - Anything above about 0.2 sightings per round is clearly unreal.
  - This is the acceptance number for enemy-aware routing plus "meetings become fights".
- **Meetings become fights (resolver).**
  - When the round script puts two enemies in line of sight within 4 m, the resolver should start a duel there about 85% of the time within 3 s (73% within 1 s).
  - At 4–8 m the rate is 80%. At 8–13 m it is 72%.
  - The other 15–28% are real "no fight" cases: someone dies to a different enemy, or someone breaks line of sight.
  - Use these rates as the chance that a contact becomes a duel. Then retune `DUEL_SCALE` and `CT_BIAS` back into the win-rate bands.
- **Duel timing (round script).**
  - After first sight: first shot ≈ 0.1–0.2 s, first damage ≈ 0.25 s, kill ≈ 0.45 s (p90 1.6 s).
  - Close kills (0–5 m) take longer: median 0.6 s, p90 3.1 s. These are corner fights and jiggle peeks.
  - Victims fire back in 69% of kills, which backs return fire on the radar (`CHIP_BASE`/`CHIP_CLOSE`).
- **Timeline.** These set `HIT_STEP`, execute timing and the length of the default phase.
  - First kill: median 27 s after freeze end (p25 17 s, p75 48 s).
  - Plant: median 76 s (p25 53 s, p75 95 s).
  - Rounds last a median of 92 s.
  - Kills spread almost evenly from 10 s to 100 s, about 10% per 10 s. Under 1% happen in the first 10 s.
- **Win reasons and plants (resolver).** These calibrate the post-plant retake odds and `SAVE_*`.
  - T wins split 42% bomb, 58% elimination.
  - A plant converts 76% of the time. Without a plant, Ts win 13%.
- **Economy.** Section 4's buy matrix gives `eco_vs_full`, `force_vs_full` and `half_vs_full`.
- **Trades.** These feed `TRADE_HIT`/`TRADE_DECAY` and how far apart the round script spaces trades.
  - 16% of kills are trades within 5 s.
  - The median trade takes 2.45 s, and 76% land within 3 s.
- **Engagement distance (duel placement).** Use these to check that duel spot pairs aren't too close.
  - Median kill distance is 16 m (12.5 map-%), with p10 6.7 m and p90 31 m.
  - Only 5% of kills happen inside 5 m, and 23% inside 10 m.
  - Median by weapon: rifles 17 m, pistols 14 m, SMGs 11 m. Opening kills: 16 m.
- **Utility (`grenade-damage.ts`).**
  - Each team throws 1.6 HEs per round.
  - 64% of HEs do no enemy damage, 26% hit one enemy and 10% hit two or more.
  - Damage per enemy hit: median 14 HP, p90 46 HP. 1.6% of HEs kill.
  - 86% of molotovs do no enemy damage.
  - Utility damage is about 23 per team-round (utility ADR 4.6).
  - The game's ≈ 26% harmless rate is too low if every thrown HE counts; then about 60–65% is right. If the game only books HEs thrown at a target, compare against the hits-per-HE split instead.

## 1. Rounds, plants and win types (regulation rounds)

Maps with at least 20 demos. Rounds per map: Inferno 7,502, Mirage 7,190, Nuke 6,625, Dust2 5,096, Overpass 4,738, Vertigo 4,331, Ancient 3,407, Train 1,298. All: 40,187 rounds in 1,558 maps.

| Metric | All | Inferno | Mirage | Nuke | Dust2 | Overpass | Vertigo | Ancient | Train |
|---|---|---|---|---|---|---|---|---|---|
| T round win | **46.2%** | 49.2% | 46.0% | 43.8% | 48.0% | 43.4% | 48.9% | 42.7% | 45.5% |
| CT round win | **53.8%** | 50.8% | 54.0% | 56.2% | 52.0% | 56.6% | 51.1% | 57.3% | 54.5% |
| Pistol rounds: T win | **49.0%** | 56.1% | 46.8% | 47.5% | 40.9% | 46.4% | 57.1% | 45.8% | 50.0% |
| Gun rounds (both full buy): T win | **44.8%** | 47.5% | 45.1% | 42.3% | 48.0% | 41.3% | 46.0% | 41.1% | 43.9% |
| T wins by bomb (share of T wins) | **41.6%** | 50.8% | 39.7% | 39.6% | 42.6% | 38.9% | 36.4% | 38.5% | 35.7% |
| T wins by elimination | **58.4%** | 49.2% | 60.3% | 60.4% | 57.4% | 61.1% | 63.6% | 61.5% | 64.3% |
| CT wins by elimination (share of CT wins) | **68.0%** | 66.5% | 70.1% | 70.4% | 66.9% | 68.6% | 67.1% | 64.8% | 66.6% |
| CT wins by defuse | **22.7%** | 23.8% | 22.0% | 21.3% | 23.8% | 19.0% | 22.9% | 26.8% | 27.3% |
| CT wins on time | **9.2%** | 9.7% | 7.9% | 8.2% | 9.3% | 12.4% | 10.0% | 8.4% | 6.1% |
| Plant rate, all rounds | **52.1%** | 57.8% | 51.5% | 48.4% | 53.0% | 47.6% | 52.9% | 52.2% | 52.0% |
| Plant rate, gun rounds | **53.7%** | 59.0% | 52.4% | 49.5% | 56.9% | 48.9% | 54.5% | 53.5% | 52.5% |
| T win after a plant | **76.3%** | 78.7% | 76.8% | 75.1% | 76.5% | 77.1% | 77.6% | 70.4% | 71.0% |
| T win without a plant | **13.4%** | 8.8% | 13.4% | 14.3% | 15.9% | 12.8% | 16.5% | 12.3% | 18.0% |
| Plant time, median (s after freeze end) | **75.6 s** | 80.4 s | 69.5 s | 72.5 s | 75.3 s | 86.5 s | 75.3 s | 68.3 s | 64.3 s |
| Plant time, p25 | **52.8 s** | 59.5 s | 45.4 s | 48.9 s | 54.8 s | 65.5 s | 54.6 s | 43.8 s | 47.8 s |
| Plant time, p75 | **95.3 s** | 98.2 s | 91.0 s | 94.3 s | 93.7 s | 101.5 s | 94.2 s | 91.9 s | 94.7 s |
| Round length, median | **92.5 s** | 99.8 s | 86.8 s | 88.4 s | 92.2 s | 99.5 s | 92.1 s | 85.6 s | 86.1 s |

## 2. Time to first kill and the opening duel

| Metric | All | Inferno | Mirage | Nuke | Dust2 | Overpass | Vertigo | Ancient | Train |
|---|---|---|---|---|---|---|---|---|---|
| First kill, median (s after freeze end) | **27.4 s** | 32.2 s | 25.4 s | 25.6 s | 27.6 s | 31.7 s | 25.9 s | 24.5 s | 25.0 s |
| First kill, p10 | **12.4 s** | 13.5 s | 11.6 s | 12.9 s | 9.63 s | 15.3 s | 11.7 s | 12.0 s | 13.1 s |
| First kill, p25 | **16.8 s** | 18.9 s | 16.3 s | 16.5 s | 13.9 s | 19.9 s | 15.6 s | 15.7 s | 17.0 s |
| First kill, p75 | **47.9 s** | 55.0 s | 45.0 s | 43.5 s | 51.8 s | 52.5 s | 42.8 s | 42.8 s | 44.1 s |
| First kill, p90 | **70.3 s** | 78.7 s | 67.3 s | 64.9 s | 73.4 s | 74.1 s | 62.4 s | 66.1 s | 68.3 s |
| First kill, mean | **34.8 s** | 39.2 s | 32.8 s | 32.6 s | 34.9 s | 38.5 s | 31.9 s | 32.2 s | 33.2 s |
| First kill in gun rounds, median | **28.6 s** | 32.5 s | 25.7 s | 26.8 s | 28.7 s | 33.9 s | 26.9 s | 26.0 s | 24.7 s |
| First kill in pistol rounds, median | **24.3 s** | 28.5 s | 23.5 s | 22.3 s | 27.5 s | 27.3 s | 23.8 s | 22.8 s | 23.3 s |
| Opening kill made by a T | **42.1%** | 42.2% | 40.6% | 40.3% | 43.5% | 42.8% | 46.8% | 38.9% | 43.4% |
| Team with the opening kill wins the round | **72.4%** | 71.7% | 72.3% | 73.1% | 71.3% | 73.3% | 72.6% | 72.8% | 72.6% |
| … when the T side got it | **72.0%** | 74.8% | 72.6% | 70.9% | 72.0% | 69.4% | 72.9% | 69.8% | 70.9% |
| … when the CT side got it | **72.7%** | 69.5% | 72.2% | 74.6% | 70.7% | 76.2% | 72.4% | 74.8% | 73.9% |
| Opening kill distance, median | **16.4 m** | 15.1 m | 18.7 m | 15.7 m | 19.8 m | 16.6 m | 14.1 m | 15.8 m | 17.1 m |

## 3. Kills, distance and trades

| Metric | All | Inferno | Mirage | Nuke | Dust2 | Overpass | Vertigo | Ancient | Train |
|---|---|---|---|---|---|---|---|---|---|
| Kills per round | **6.53** | 6.35 | 6.57 | 6.59 | 6.43 | 6.55 | 6.64 | 6.64 | 6.64 |
| ADR (all damage, per player) | **72.2** | 70.8 | 72.3 | 72.6 | 71.3 | 72.5 | 73.8 | 73.3 | 73.0 |
| Headshot kills | **46.1%** | 47.2% | 46.9% | 46.0% | 47.7% | 44.7% | 44.1% | 44.1% | 46.1% |
| Wallbang kills | **4.1%** | 4.3% | 4.5% | 3.1% | 4.5% | 4.3% | 4.7% | 3.6% | 2.6% |
| Kills through smoke | **4.5%** | 5.5% | 4.3% | 3.6% | 5.2% | 2.9% | 5.6% | 4.3% | 3.3% |
| Kill distance p10 | **6.68 m** | 6.25 m | 7.12 m | 6.06 m | 7.35 m | 6.98 m | 6.77 m | 6.99 m | 6.42 m |
| Kill distance p25 | **10.5 m** | 9.77 m | 11.5 m | 9.54 m | 12.2 m | 10.8 m | 10.3 m | 10.5 m | 10.5 m |
| Kill distance median | **16.2 m** | 14.8 m | 18.3 m | 15.1 m | 19.2 m | 16.4 m | 15.1 m | 15.8 m | 17.8 m |
| Kill distance p75 | **23.4 m** | 20.9 m | 26.6 m | 22.4 m | 27.4 m | 23.1 m | 20.8 m | 22.3 m | 26.9 m |
| Kill distance p90 | **31.0 m** | 27.6 m | 34.2 m | 30.9 m | 35.8 m | 30.1 m | 25.7 m | 27.9 m | 38.0 m |
| Kill distance median (map-%) | **12.5** | 11.5 | 14.1 | 11.7 | 14.8 | 12.7 | 11.7 | 12.2 | 13.7 |
| Kills at 0–5 m | **5.1%** | 6.1% | 4.6% | 6.4% | 4.3% | 4.4% | 4.5% | 4.5% | 5.5% |
| Kills at 5–10 m | **17.7%** | 20.1% | 14.8% | 20.8% | 13.3% | 17.2% | 18.8% | 18.3% | 17.5% |
| Kills at 10–15 m | **22.1%** | 24.5% | 19.5% | 22.3% | 17.9% | 22.3% | 26.2% | 24.0% | 17.7% |
| Kills at 15–20 m | **19.4%** | 21.2% | 17.3% | 18.7% | 17.2% | 20.6% | 22.2% | 20.0% | 16.7% |
| Kills at 20–30 m | **24.3%** | 21.3% | 26.6% | 20.7% | 28.7% | 25.3% | 23.9% | 26.1% | 22.7% |
| Kills at 30–40 m | **8.6%** | 5.8% | 13.5% | 8.1% | 11.9% | 7.9% | 4.2% | 6.1% | 11.9% |
| Kills at 40 m+ | **2.8%** | 1.0% | 3.8% | 2.9% | 6.7% | 2.3% | 0.2% | 1.2% | 8.1% |
| Trade kills (awpy, ≤ 5 s) | **16.1%** | 17.1% | 15.3% | 15.9% | 15.6% | 16.5% | 16.9% | 16.2% | 15.1% |
| Trade time, median (killer killed back) | **2.45 s** | 2.28 s | 2.70 s | 2.37 s | 2.43 s | 2.47 s | 2.32 s | 2.50 s | 2.69 s |
| Trade time, p25 | **1.07 s** | 0.97 s | 1.23 s | 1.08 s | 1.04 s | 1.05 s | 1.00 s | 1.09 s | 1.14 s |
| Trade time, p75 | **5.09 s** | 4.87 s | 5.39 s | 4.96 s | 5.10 s | 5.09 s | 4.95 s | 5.38 s | 5.43 s |
| Trades ≤ 5 s done within 2 s | **58.5%** | 60.2% | 55.4% | 59.0% | 58.9% | 58.4% | 59.7% | 59.1% | 56.9% |
| Trades ≤ 5 s done within 3 s | **76.2%** | 77.0% | 73.9% | 77.0% | 76.6% | 75.9% | 77.1% | 76.7% | 75.3% |

Kill distance by weapon class (all maps, metres):

| Class | n | p25 | median | p75 | p90 |
|---|---|---|---|---|---|
| Rifle | 209,050 | 11.18 | 17.02 | 24.16 | 31.79 |
| Pistols | 43,894 | 8.86 | 13.91 | 20.9 | 28.53 |
| SMG | 11,769 | 7.28 | 11.02 | 15.81 | 21.49 |
| Heavy | 215 | 5.01 | 7.17 | 10.07 | 13.01 |

When kills happen (all maps, share of kills by seconds after freeze end): 0-10 s 0.6%, 10-20 s 8.6%, 20-30 s 10.7%, 30-40 s 10.9%, 40-50 s 10.3%, 50-60 s 10.1%, 60-70 s 9.9%, 70-80 s 9.8%, 80-90 s 9.2%, 90-100 s 8.6%, 100+ s 11.2%.

## 4. Buy types (non-pistol regulation rounds)

Win rate of a side with this buy against a full buy (either side), all maps:

| Buy | Rounds | Win vs full buy |
|---|---|---|
| Full Eco | 4,560 | 6.3% |
| Semi Eco | 4,700 | 18.7% |
| Semi Buy | 6,249 | 33.5% |
| Full Buy | 38,360 | 50.0% |

T win % by T buy (rows) and CT buy (columns), all maps:

| T \ CT | Full Eco | Semi Eco | Semi Buy | Full Buy |
|---|---|---|---|---|
| Full Eco | 0.0% (1) | – (0) | 4.5% (308) | 6.0% (2,641) |
| Semi Eco | – (0) | 0.0% (1) | 26.6% (143) | 18.1% (2,641) |
| Semi Buy | 96.1% (334) | 75.6% (679) | 59.3% (916) | 33.2% (3,623) |
| Full Buy | 93.2% (1,919) | 80.4% (2,059) | 66.1% (2,626) | 44.8% (19,180) |

awpy/HLTV style on team freeze-time-end equipment value: Full Eco < $5k, Semi Eco $5k–10k, Semi Buy $10k–20k, Full Buy > $20k.

## 5. Series shape (MR15, so per-map round counts do not carry over to MR12)

| Metric | All | Inferno | Mirage | Nuke | Dust2 | Overpass | Vertigo | Ancient | Train |
|---|---|---|---|---|---|---|---|---|---|
| Overtime rate | **7.0%** | 7.6% | 7.6% | 6.2% | 5.6% | 6.1% | 10.7% | 6.8% | 1.9% |
| Win the next round after a win | **65.1%** | 64.0% | 65.3% | 64.9% | 65.0% | 65.8% | 66.0% | 64.9% | 65.9% |
| Pistol winner wins the next round | **77.2%** | 75.1% | 80.2% | 75.7% | 75.6% | 77.3% | 80.7% | 79.1% | 70.2% |
| Pistol winner wins the next two | **58.6%** | 59.5% | 60.9% | 59.5% | 56.8% | 59.1% | 60.4% | 52.1% | 51.9% |
| Regulation rounds per map (MR15) | **25.8** | 26.0 | 25.9 | 25.5 | 25.9 | 26.2 | 25.6 | 25.8 | 25.0 |

## 6. Utility damage

| Metric | All | Inferno | Mirage | Nuke | Dust2 | Overpass | Vertigo | Ancient | Train |
|---|---|---|---|---|---|---|---|---|---|
| HE grenades per team-round | **1.58** | 1.96 | 1.19 | 1.79 | 1.20 | 1.52 | 1.80 | 1.54 | 1.47 |
| Molotovs per team-round | **2.45** | 2.74 | 2.23 | 2.41 | 2.22 | 2.53 | 2.35 | 2.73 | 2.28 |
| Flashes per team-round | **3.28** | 3.48 | 3.39 | 2.29 | 4.23 | 3.32 | 3.19 | 3.25 | 3.09 |
| Smokes per team-round | **3.00** | 3.09 | 2.92 | 3.17 | 3.03 | 2.89 | 2.77 | 3.06 | 2.89 |
| Utility damage per team-round | **22.9** | 32.0 | 17.6 | 17.8 | 22.0 | 18.6 | 28.5 | 24.2 | 23.9 |
| Utility ADR (per player) | **4.59** | 6.40 | 3.52 | 3.56 | 4.39 | 3.72 | 5.71 | 4.83 | 4.79 |
| HEs that do no enemy damage | **63.8%** | 58.2% | 62.8% | 77.2% | 60.1% | 69.4% | 55.7% | 60.6% | 62.6% |
| HE enemy damage per throw, mean | **9.57** | 11.2 | 9.80 | 5.71 | 11.8 | 7.59 | 11.8 | 9.87 | 10.2 |
| HE enemy damage per damaging throw, median | **20.0** | 21.0 | 21.0 | 18.0 | 22.0 | 18.0 | 20.0 | 18.0 | 21.0 |
| … mean | **26.5** | 26.9 | 26.4 | 25.1 | 29.6 | 24.8 | 26.5 | 25.0 | 27.3 |
| HE damage per enemy hit, median | **14.0** | 14.0 | 15.0 | 14.0 | 15.0 | 14.0 | 13.0 | 12.0 | 15.5 |
| HE damage per enemy hit, p90 | **46.0** | 46.0 | 47.0 | 45.0 | 47.0 | 45.0 | 46.0 | 43.0 | 48.0 |
| HE kills per 100 HEs | **1.64** | 1.77 | 1.97 | 0.84 | 2.10 | 1.61 | 2.06 | 1.21 | 2.19 |
| Molotovs that do no enemy damage | **86.2%** | 85.1% | 88.1% | 86.6% | 85.8% | 88.4% | 85.0% | 84.0% | 84.3% |
| Molotov enemy damage per damaging throw, median | **15.0** | 16.0 | 14.0 | 16.0 | 16.0 | 16.0 | 14.0 | 14.0 | 16.0 |

HE outcome per throw (all maps): 0 enemies hit 63.8%, 1 enemies hit 25.8%, 2 enemies hit 7.8%, 3 enemies hit 2.0%, 4+ enemies hit 0.5%.

HE damage per enemy hit (all maps): 1-10 HP 40.6%, 10-20 HP 19.0%, 20-30 HP 13.6%, 30-40 HP 11.0%, 40-50 HP 9.1%, 50-60 HP 5.0%, 60-80 HP 1.2%, 80+ HP 0.6%.

## 7. Line of sight: stand-offs, contact → fight, sight → kill

Ray-cast with the game's own collision meshes (`public/map-studio/spatial/<Map>.mesh`, standing eye 64 u, crouched 46 u) between every pair of live enemies on each 2 Hz frame. Only the six maps that have both ESTA demos and a game mesh.

| Metric | All | Inferno | Mirage | Nuke | Overpass | Vertigo | Ancient |
|---|---|---|---|---|---|---|---|
| Rounds checked | **34594** | 7647 | 7393 | 6758 | 4846 | 4490 | 3460 |
| Kill lines clear on the mesh (mesh check) | **89.1%** | 82.3% | 92.5% | 93.6% | 87.1% | 93.0% | 84.9% |
| ≤ 4 m: quiet pair-seconds per round | **0.05 s** | 0.06 s | 0.05 s | 0.05 s | 0.03 s | 0.08 s | 0.05 s |
| ≤ 4 m: sightings ≥ 3 s per round | **0.00** | 0.00 | 0.00 | 0.00 | 0.00 | 0.01 | 0.00 |
| ≤ 6 map-% (7.8 m): quiet pair-seconds per round | **0.38 s** | 0.41 s | 0.31 s | 0.38 s | 0.29 s | 0.58 s | 0.39 s |
| ≤ 6 map-%: sightings ≥ 3 s per round | **0.03** | 0.03 | 0.02 | 0.02 | 0.02 | 0.05 | 0.03 |
| ≤ 6 map-%: rounds with a sighting ≥ 3 s | **2.4%** | 2.3% | 2.2% | 2.0% | 1.8% | 3.9% | 2.8% |
| ≤ 6 map-%: sightings ≥ 10 s per 100 rounds | **0.07** | 0.07 | 0.03 | 0.06 | 0.06 | 0.18 | 0.09 |
| ≤ 10 map-% (13 m): quiet pair-seconds per round | **1.47 s** | 1.46 s | 1.10 s | 1.36 s | 1.12 s | 2.40 s | 1.75 s |
| ≤ 10 map-%: sightings ≥ 3 s per round | **0.12** | 0.10 | 0.09 | 0.10 | 0.09 | 0.22 | 0.14 |
| ≤ 10 map-%: sightings ≥ 20 s per 100 rounds | **0.01** | 0.01 | 0.00 | 0.00 | 0.02 | 0.00 | 0.00 |
| Contact at 0–4 m: damage within 1 s | **73.0%** | 73.8% | 72.9% | 76.2% | 75.9% | 64.7% | 69.3% |
| Contact at 0–4 m: damage within 3 s | **84.6%** | 84.4% | 85.2% | 86.9% | 88.3% | 76.0% | 84.6% |
| Contact at 0–4 m: kill within 3 s | **77.8%** | 77.2% | 79.7% | 79.7% | 81.7% | 68.8% | 77.4% |
| Contact at 4–8 m: damage within 3 s | **79.9%** | 79.6% | 80.7% | 81.3% | 82.3% | 74.2% | 81.7% |
| Contact at 4–8 m: kill within 3 s | **71.3%** | 70.6% | 73.4% | 72.9% | 73.7% | 65.3% | 71.9% |
| Contact at 8–13 m: damage within 3 s | **72.5%** | 71.7% | 75.9% | 74.9% | 78.3% | 64.7% | 69.5% |
| Contact at 8–13 m: kill within 3 s | **61.6%** | 59.8% | 66.4% | 64.3% | 66.7% | 54.1% | 58.8% |
| Kills with a visible run before them | **75.3%** | 70.2% | 76.9% | 78.7% | 73.7% | 79.3% | 73.2% |
| Sight → kill, median | **0.43 s** | 0.45 s | 0.41 s | 0.43 s | 0.42 s | 0.44 s | 0.46 s |
| Sight → kill, p75 | **0.83 s** | 0.90 s | 0.80 s | 0.81 s | 0.79 s | 0.84 s | 0.92 s |
| Sight → kill, p90 | **1.59 s** | 1.76 s | 1.48 s | 1.47 s | 1.44 s | 1.66 s | 1.90 s |
| Sight → killer's first shot, median | **0.12 s** | 0.12 s | 0.12 s | 0.11 s | 0.10 s | 0.12 s | 0.13 s |
| Sight → first damage, median | **0.23 s** | 0.24 s | 0.22 s | 0.22 s | 0.22 s | 0.23 s | 0.24 s |
| Victim fired back before dying | **69.3%** | 69.9% | 65.9% | 68.9% | 71.5% | 71.1% | 70.5% |

Sight → kill, all six maps, share of kills: 0-0.5 s 55.3%, 0.5-1 s 24.9%, 1-1.5 s 8.8%, 1.5-2 s 4.1%, 2-3 s 3.4%, 3-5 s 2.2%, 5-10 s 1.0%, 10+ s 0.2%.

Sight → kill by kill distance (median / p90): 0-5m 0.58 / 3.13 s (n 9,437), 5-10m 0.43 / 1.81 s (n 31,002), 10-20m 0.42 / 1.48 s (n 70,382), 20m+ 0.44 / 1.45 s (n 52,897).

## 8. Secondary sources (CS2, published aggregates)

These were not recomputed here. HLTV and Leetify pages can't be fetched from the build container, so the figures come from articles that quote them.

| Source | What it gives | Figures |
|---|---|---|
| [Abios: CS2 map win rates](https://abiosgaming.com/press/cs2-map-winrates/) (16,539 pro matches, Jan 2023 – Jan 2024) | CT / T round win by map | Mirage 51/49, Nuke 46/54 (as published), Inferno 50/50, Overpass 46/54, Vertigo 53/47, Ancient 50/50, Anubis 56/44 |
| [HLTV: Which bomb-sites are hardest to hold?](https://www.hltv.org/news/40195/which-bomb-sites-are-hardest-to-hold) (Skybox EDGE, Nov 2024, top-team gun rounds) | Site hold and retake rates | Average hold ≈ 24% (Nuke A 44%, Anubis B 21%, Dust2 B 20%, Inferno A 18%); average retake 21%. G2's post-plant conversion is 78%, which is 4.6 pts below average, so the average is about 82% |
| [Dust2.us: Anubis most T-sided](https://www.dust2.us/news/59104/anubis-is-historically-and-currently-the-most-t-sided-map-in-cs2) (HLTV, to Mar 2025) | T round win | Anubis T 55.5% (past 12 months), 55.3% (all time) |
| [scope.gg: Does the first kill win the round?](https://scope.gg/guides/cs2-first-kill-round-win-rate-premier-faceit/) (Premier and FACEIT, 2026) | Round win after the opening kill | 64.8–72.6% by map and side (ESTA pro: 72.4%) |
| [Leetify (X), 1.9M Premier matches, Apr 2024](https://x.com/leetify/status/1792949667321311262) | Map side balance (matchmaking, not pro) | Anubis T 52.7%, Dust2 T 51.4%, Inferno T 51.3%, Nuke CT 51.5%, Mirage CT 51.5% |
| [Skin.Club, citing HLTV 2025 (LAN vs top 20)](https://community.skin.club/en/news/best-cs2-players-by-utility-damage-per-24-rounds-in-2025) | Utility damage leaders | Top 10 average ≈ 171 per 24 rounds (≈ 7.1 per round) for the best utility players. ESTA's all-player average is 4.6 per round |

Notes:
- The Abios Nuke figure contradicts most other sources, which show Nuke as CT-sided. ESTA has Nuke at 56% CT. Treat the Abios Nuke row as suspect.
- The HLTV post-plant figure (about 82% in CS2 gun rounds between top teams) is higher than ESTA's 76% over all rounds, because ESTA includes eco and force plants.
