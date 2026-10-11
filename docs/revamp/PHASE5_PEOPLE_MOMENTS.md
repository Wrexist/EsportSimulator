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
