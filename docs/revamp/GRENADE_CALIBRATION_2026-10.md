# HE grenade calibration (2026-10)

Two separate changes, measured separately:

1. **HE misses** (shipped on `claude/project-thread-6h04ps`): an HE's damage comes
   from where it landed (`engine/match/grenade-damage.ts`), so it can hit nobody.
2. **Lethal HEs** (experiment only, **not integrated**): an HE whose damage reaches
   the victim's HP kills them. The patch lives outside the repo
   (project files `overhaul-evidence/grenades/lethal-he-experiment.patch`).

All numbers below come from runs in this session:

- `npx tsx scripts/calibrate-engine.ts --engine script-v1 --samples 600` (seed 20261010,
  600 realism maps plus the skill, star, agency and cap suites), on three trees:
  - the base commit `2c7a25d8`;
  - this branch;
  - this branch with the lethal patch and `HE_LETHAL=1`.
- `tmp/audit/he-dist.ts` (gitignored): every map × seeds 1–12 through the
  radar fixtures, with all players at skill 70.

## 1. HE damage distribution (resolver, about 2,000 rounds per run)

| | Before (guaranteed hit) | After (misses) |
|---|---|---|
| HEs thrown | 1,673 | 1,692 |
| Hit nobody | 0 % | **26.1 %** |
| Damage per throw | 19.3 HP | 20.9 HP |
| Damage per hit | 19.3 HP | 28.2 HP |
| 0 HP | 0 | 442 |
| 1–19 HP | 940 | 462 |
| 20–39 HP | 673 | 462 |
| 40–59 HP | 60 | 246 |
| 60–79 HP | 0 | 80 |
| Kills by HE | 0 | 0 |

The spread is now realistic: many grenades do nothing, and a few land at a
player's feet for 60+ HP when the victim has no armour. A typical database
thrower (grenades 55; the player database averages 56) keeps the old mean
damage per throw. The fixtures use grenades 70, so they average 8 % more
damage per throw than before. Skill now matters, which is intended.

## 2. Round outcomes and economy, before → after (misses)

| Metric | Before | After | Band |
|---|---|---|---|
| Rounds per map | 21.80 | 21.64 | PASS → PASS |
| CT round win | 49.1 % | 49.2 % | PASS → PASS |
| Eco vs full buy | 9.9 % | 10.3 % | PASS → PASS |
| Force vs full buy | 31.9 % | 31.3 % | PASS → PASS |
| Half buy vs full buy | 33.2 % | 33.1 % | PASS → PASS |
| Kills per round | 6.72 | 6.71 | PASS → PASS |
| ADR | 73.9 | 73.9 | PASS → PASS |
| T wins by bomb | 37.4 % | 37.7 % | PASS → PASS |
| CT wins by defuse | 28.0 % | 28.2 % | PASS → PASS |
| Impossible states | 0 | 0 | PASS → PASS |

Overall, 47 of 50 metrics pass both before and after.

The one status change is `agency_timeout`, which went from PASS at +1.3 ±1.8
to warn at +0.3 ±2.0. That is a paired, map-win-point effect of calling a
timeout at a 3-round losing streak. The two values sit inside each other's
confidence intervals, so the change is noise rather than a measured shift.
The committed baseline in `calibration/script-v1.md` (+3.0 ±1.9) predates the
base commit used here.

Full comparison: project files `overhaul-evidence/grenades/base-vs-miss.txt`.

## 3. Lethal HE experiment (not integrated)

| | Misses only | Misses + lethal |
|---|---|---|
| HEs that would kill | — | 4 of 1,704 (0.23 %) |
| Kills by HE | 0 | 4 in 2,053 rounds |
| Every round, economy and win-reason metric | — | identical within 0.5 pp |
| Impossible states (600 calibration maps) | 0 | **2** |

What the experiment shows:

- **A lethal HE almost never happens with the current numbers.**
  - The resolver throws HEs in the execute and at the site entrance, when
    targets are nearly always on 100 HP. 98 HP is the maximum against an
    unarmoured target and 59 against an armoured one.
  - So an HE only kills a player already chipped earlier in the round. That
    happens 0.2 % of the time, in line with CS, where HE kills on full-HP
    targets are rare.
- **Lethality has no measurable balance effect:**
  - round outcomes and economy are unchanged;
  - kills per round are unchanged at 6.71.
- **Integrating it is not free.**
  - The resolver assumes grenades never kill. A lethal HE on the CT side's
    entry player left that player in the execute's fight list. That produced
    "dead player killed again" and "more than 5 kills by one team" (2 maps
    of 600).
  - The round script and radar also have no path yet for a death without a
    duel.
  - Supporting it needs:
    - guarding every place that reads the fight list after utility;
    - a utility death in the round script (with the death placed at the
      grenade);
    - a kill-feed icon.

Recommendation: keep grenades non-lethal for this release. The realism gain is
about one HE kill per 500 rounds, and it carries real integration risk. If
lethal HEs are wanted later, do it as its own change, together with the three
pieces listed above.
