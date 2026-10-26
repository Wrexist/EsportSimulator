# Age curve check (C7), 2026-10-26

Question from the Clutch Legend study: when do players peak, and how fast do
they decline? Target from the pro scene: a peak around 24 to 27, a slow
decline after, and in-game leaders and AWPers lasting into their 30s.

Measured with `scripts/audit/age-curve-sim.ts` on a real career world (the
final save of a one-season campaign, 1,098 rostered players): twelve seasons
of the development steps every club runs (AI training regimen, recovery,
natural growth, age decline, birthdays, retirement checks), without matches,
transfers or youth intake. ΔOVR is the mean change in a player's OVR over
the season he spends at that age.

## Before

| Age | ΔOVR / season |
|---|---|
| 16 | +17.7 |
| 17 | +14.0 |
| 18 | +8.3 |
| 19 | +4.7 |
| 20 | +2.6 |
| 21 | +2.4 |
| 22 | +0.5 |
| 24 to 31 | about 0 |
| 32 to 37 | −0.02 to −0.08 |

Players reached their potential by about 21 and then never declined: a
21-year-old star stayed at his peak until he retired in his mid-30s. The
training step had no age term, and the age decline (one point of one aim
stat now and then) was refilled by training every week.

## Change

`engine/development-rates.ts` `AGE_CURVE`, same rules for every club:

- Training gains shrink with age (×0.30 to ×0.34 up to 22, then ×0.30,
  ×0.24, ×0.18, ×0.12 from 29), so talent fills out over the early
  twenties.
- From 29 the ceiling (potential) loses 0.4 points a season, 0.7 from 31,
  1.1 from 33 and 1.5 from 35. Skill, rifle, reaction, clutch and pistol
  above the ceiling sink toward it; tactics, leadership, teamwork and the
  AWP stat do not.
- In-game leaders and AWPers (primary or second role) decline at half rate.
- The training preview and the player's development outlook use the same
  factors and say so.

## After

| Age | ΔOVR / season |
|---|---|
| 16 | +5.6 |
| 18 | +4.8 |
| 20 | +3.1 |
| 21 | +2.8 |
| 22 | +1.4 |
| 23 | +0.6 |
| 24 | +0.4 |
| 25 to 28 | +0.1 to 0 |
| 29 | −0.4 |
| 31 | −0.7 |
| 33 | −1.0 |
| 35 | −1.2 |
| 37 | −1.4 |

By role at 29 / 31 / 33 / 35: riflers and entries −0.5 / −0.9 / −1.3 / −1.7,
IGLs −0.3 / −0.4 / −0.6 / −0.7, AWPers −0.1 / −0.2 / −0.4 / −0.4.

Retirement is unchanged (from 32, `engine/retirement-chance.ts`).

Re-run after any change to training, natural growth or ageing:

    npx tsx scripts/audit/age-curve-sim.ts <campaign final save .json.gz> 12
