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
