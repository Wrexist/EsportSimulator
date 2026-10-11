# Phase 5 — People & moments

Goal: drama, celebration, replayability. Players are people with a personality that changes real numbers, seasons tell a story built from what actually happened, and the big beats (match start, title, signing, promotion, season end) feel like a game, with real sound. Source: `docs/revamp/AUDIT_2026-10-09.md` §3c/§4 and the Phase 5 audits (2026-10-11).

Truth rule continues: a personality, storyline choice or press answer may only promise effects the engine applies.

## Audit findings (2026-10-11)
- **People:** no personality fields; `traits` are read by the match engine but never assigned (0 of 1,368 players); prospect archetypes are rolled then thrown away; loyalty/amicability barely matter; morale reacts only to results, fatigue and events; no captain, mentor or relationships.
- **Story:** no storyline state; ~25 one-off event kinds, mostly generic copy; no press conferences; rivalries tracked but never told.
- **Records (bugs):** `avgRating` and `roundsPlayed` never update, so season MVP is `roster[0]`, Hall of Fame rating path and "hot form" rumours are dead; award majors/MVPs are fabricated from a hash; no per-player season history; manager reputation invisible.
- **Moments:** title celebration fires a week late (during the next advance); league titles, promotion/relegation and signings have no moment; no match intro or end-of-match beat; season recap and awards are silent.
- **Audio:** no audio files; all sound is oscillator beeps; music defaults to 0; 5 sound ids never fire; victory can play twice; "contractSign" plays when *selling*.
- **Art/licence:** no logotype, no dedicated title hero, plain loading screens; raw Valve radar PNGs still ship as a fallback.
- **Release gate:** `npm run content:verify` currently fails (53 new/changed files from Phases 1–4: round maps, radar art, fonts, flags, data). New audio needs inventory rows too.

## Streams
| ID | What | Notes |
|---|---|---|
| **5.1** Records & truth | `avgRating`, `roundsPlayed`, maps played updated from every official match (script-v1 HLTV-style rating); per-player season lines kept at season end (club, maps, rating, K–D, ADR, trophies); season awards from real stats (MVP, team of the season, rookie of the year), fabricated major wins/MVPs removed; records (player & club: best rating in a map, most kills, biggest win, longest streak); Hall of Fame wired to real careers; manager reputation shown, per-club manager timeline. | Engine. Additive optional fields, no save bump. |
| **5.2** Personalities & dressing room | Every player has a persistent personality: one archetype (Professional, Ambitious, Loyal, Mercenary, Hothead, Leader, Showman, Quiet) and 0–2 playstyle traits (AGGRESSIVE / PASSIVE / CLUTCHER / TRADE_FRAGGER) derived from attributes. Archetypes change real numbers: morale reactions (bench time, wage vs teammates, results), contract demands and length, transfer requests, training gain (Professional), media. Morale v2 adds playing time, wage fairness and promises (kept/broken). Manager-chosen captain and a veteran mentor with real effects. Save v9 assigns personalities deterministically. Player/squad screens show the personality with its stated effects. | Engine + player UI. Traits change match results → calibration gate must stay green. Owns save v9. |
| **5.3** Storylines & press | Persistent story arcs (state in the save) with 2–4 beats built from real state: contract standoff, rising star, slump, rivalry build-up/aftermath, veteran's last dance, dressing-room rift, giant-killer run, board under pressure. Beats arrive as decisions (4.9 deadlines/defaults) or news; choices change real numbers and the next beat. Pre-match press conference for big matches (finals, derbies, top-10 clashes): 2–3 questions with stated effects. News and the weekly-report headline name players, scores and ratings. | After 5.2. |
| **5.4** Moments | Match intro (versus card: logos, ranks, form, head-to-head, storyline line, map, countdown) → end-of-match beat on the live screen (final score + MVP) → result screen. Title celebration on the grand-final result, scaled by tier; league title, promotion and relegation moments; signing reveal (full-screen player card with personality); season review (story of the season, awards ceremony, team of the season, records) before pre-season; new-career welcome (board brief and objectives). Continue stops for moments. Reduced-motion variants. | 5.4a now; season review (5.4b) after 5.1. |
| **5.5** Audio | Sample-based audio engine (decoded buffers, preload, music crossfade, ducking under stingers, per-category volume), real files under `public/audio/` (SFX, stingers, 4 music cues), one sound per event (fix double victory, signing vs selling, dead ids), music on by default at a modest level after the first interaction, inventory rows so packaging accepts the files. | Owns `lib/sound-manager.ts`, `lib/audio-feedback.ts`. |
| **5.6** Key art | Title logotype (SVG, Barlow Condensed + trophy mark), title-screen hero with slow light sweep/parallax, branded loading/splash, tier trophy art for celebrations, season splash; Valve radar PNGs out of the build (fallback = baked radar art). | |
| **5.7** Release gate | Inventory rows for Phase 1–5 files so `npm run content:verify` passes. Project-made files need the owner's release statement. | Before any Steam build. |

## Sound cues (shared contract between 5.4 and 5.5)
`SoundType` gains: `matchIntro`, `countdown`, `titleWin`, `titleWinMajor`, `promotion`, `relegation`, `signing`, `sale`, `seasonReview`, `award`, `welcome`, `decision`. 5.4 calls `soundManager.play(<id>)`; until 5.5 lands an id may map to the nearest existing synth sound.

## Asset source (owner decision 2026-10-11)
Project-made: audio is rendered by an in-repo synthesis script and art by in-repo SVG/sharp/Playwright scripts (or derived from the baked radar art). No AI generation, no third-party samples or images. Individual files can be swapped later through the audio manifest / art helpers.

## Order
Wave 1 (parallel): 5.1, 5.2, 5.4a, 5.5, 5.6. Wave 2: 5.3, 5.4b. Then 5.7 and a full play-through.

## Done when
- Every player has a personality whose effects are visible and real; the season MVP and records come from real stats.
- A season produces at least 3 storylines that reference real players and results, and their choices change numbers.
- Match start, title, promotion, signing and season end each have a moment with sound; no moment fires late or twice.
- No oscillator beeps remain; the packaging gate passes with the new files.

---

## Status — done except the owner's release statement (2026-10-11)

Branch `claude/revamp-phase-5` (contains Phases 0–4).

| Stream | Result |
|---|---|
| 5.1 Records & truth | Every official match (managed and AI) feeds `avgRating`, rounds, K–D–A, damage, season tallies; season lines (12 kept); MVP, team of the season, rookie and Top 20 from real stats, competition-weighted; fabricated Major wins/MVPs/EVPs removed; world, club and season records; one Hall of Fame path; manager reputation log and club timeline. Regulars' mean rating 0.985 (was 0 for everyone). `engine/season-review.ts`. |
| 5.2 Personalities | 8 archetypes (7–18% each) and playstyle traits (36% of players) on every creation path, save v9. Morale v2 (bench time, wage fairness, promises), transfer requests (≤ 2 per club-season), archetype contract demands for manager and AI, Professional +10% training, captain and mentor with stated effects. Calibration 47/3/0 → 48/2/0. |
| 5.3 Storylines & press | 8 arc kinds from real state with decisions that apply their stated effects; 8–10 stories per managed season, 7 of 8 kinds seen; press conferences before finals, derbies, top-10 clashes and deciders (at most every 4 weeks, finals excepted); story-led weekly headline and final previews; inbox at week 13 still 4–5 unread. |
| 5.4a Moments | Persisted moment queue (Continue stops for it); match intro and end-of-match beat; titles on the grand-final result; division titles, promotion/relegation, signing reveal, new-career welcome; victory/defeat once per match. |
| 5.4b Season review | Full-screen season review (your season, MVP, rookie, Top 20, team of the season, records, story of the season) replaces the recap and awards modals; replay from the trophy room and inbox; project trophy art in every celebration. |
| 5.5 Audio | Project-made pack (35 SFX/stingers, 4 looping music cues, 6.1 MB, music −16 LUFS), sample-based engine with scenes, crossfade, ducking and a limiter; music on at 45 by default; one sound per event. |
| 5.6 Key art | Logotype, title-screen stage from the baked radar art, branded loading/boot splash, vector trophies for every tier, season splash (681 KB). Valve radar overviews and 4 real-event logos are out of the build. |
| 5.7 Release gate | Fonts (byte match to @fontsource 5.3.0, OFL) and 16 new flags (byte match to Flagcdn) recorded. 46 project-made/edited files wait for the owner's release statement: `node scripts/launch/record-revamp-content.cjs --owner-statement "<words>"` (dry run passes `npm run content:verify`). |

Also fixed: a $15k/week legend coach was offered to clubs that could not pay it (bankruptcies in the campaign smoke); it is now offered only with 26+ weeks of runway and states the cost.

Verification: type-check 0 · lint 0 · jest 253 suites / 2,696 tests · live run on the merged branch (new career → welcome → intro → match → end beat → result → signing reveal → forced title/league/tier moments → home, squad, week, league, trophies, settings, inbox): 0 page errors. Screenshots `tmp/phase5/`.

Open: listen-check the audio (`tmp/phase5/audio/preview.html`); contract standoffs did not trigger in the 3-seed season (unit-tested); every snapshot player has amicability 70, so only the Hothead rift fires; old AI trophy PNGs are still referenced by `data/tournaments.json` save summaries.

### Fixes (stream 5.8a, branch `claude/p5-fixes`)
- **Squad cap:** the manager can release a senior player (rest of the contract paid at once, stated before confirming; never below five). Squad, market board and deal panel show the squad against the cap of 7 and say how many to release or sell. `engine/roster-rules.ts`.
- **Contract standoff:** opening snapshot deals have already run part of their length (no deal of a player aged 20–30 used to end in season 1); the standoff opens in the final year of a top-five Ambitious/Mercenary player, at most 2 a season. 3-seed season: [2, 1, 0] (`docs/launch-readiness/evidence/phase5-3-storylines-p5-fixes.json`).
- **Amicability (save v10):** archetype base + id-hash spread instead of 70 for everyone; rifts capped at 2 a season.
- **Persistence:** the legend-pick decision, auto tactics (`GameSave.autoTactics`), the daily/weekly switch and the day within the week are saved at once.
- **Load game:** Titles counts the club's trophies.
