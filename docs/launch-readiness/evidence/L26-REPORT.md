# L26 - Content, terminology, audio and feedback

Status: **partial**, 14 September 2026. Implemented and locally validated this increment; real UI/audio and dependency acceptance remain open. Required dependencies L20, L23 and L25 remain partial. Nothing was submitted to Steam.

## Delivered

- Finance income no longer invents a $15,000 league payment when the actual share is zero. Income bars show calculated proportions, including an all-zero case. Shared progress now exposes its value to assistive technology; regression tests found that the primitive previously received no value.
- Finance and signing use the shared exact-money formatter. Negative values have one sign before the currency, locale separators are fixed to English, invalid amounts display a dash and contract amounts retain their precision. Finance headings now say Finances / projected weekly net / next settlement; zero net is described as no current deficit rather than profitable.
- Added a guide topic for OVR, potential, IGL/AWPer/entry roles, K/D/A, ADR, match rating, BO1/BO3/BO5, map scores and contract costs. Corrected blanket development-age, seeding, circuit-decay and weekly-reset claims. Aligned related tooltips. Old inbox events with no data receive safe titles.
- Corrected Bootcamp's misleading doubled-XP label: the existing processor awards **flat +50 XP per roster player**. Card, guide and processor now share that existing formula. Costs and rewards are unchanged; the engine remains deterministic.
- Routine info/XP toasts are silent. Warning/error cues are differentiated, and presentation-only cooldowns prevent stacked signing/notification sounds while preserving every visual message and action. The error tone is a quieter triangle waveform. Finished music notes disconnect and leave tracking; switching menu/match stops the old scene. The shell owns both scenes and preserves mute/background/quiet-studio guards.
- Added a [hashed player-content inventory](L26-content-inventory.json), [editorial review and language rules](L26-EDITORIAL.md), and [18 real-environment acceptance cases](L26-acceptance-cases.csv). The inventory maps **1,368 players to 161 portrait files**, connects the L25 crest manifest and separates visible art/writing, procedural sound and coding assistance. It flags **289 editorial signals in 103 files** for triage, not 289 proven defects.
- Added an internal disclosure-review section to `STEAM_STORE_LISTING.md`. Its public-facing Windows 1.0 draft remains conservative. The current [Steam content survey](https://partner.steamgames.com/doc/gettingstarted/contentsurvey) was checked; player-consumed content is recorded separately from coding efficiency. No permission or authorship is inferred from a generated label.

## Verification

- **1,608 tests / 166 suites pass:** [Jest JSON](L26-tests.json), [log](L26-tests.txt). Thirteen new cases cover exact/invalid money, fraction percentages, zero/missing income, accessible progress, old inbox entries, flat Bootcamp copy, cue throttling and mocked audio scene/cleanup/mute/resume behavior. Existing weekly-activity tests still pin the +50 XP reward. Mock audio is not an audible pass.
- [TypeScript](L26-types.txt), [production build and worker startup](L26-build.txt) pass. Build `2GX-oYzTzbaGEiXjb0G1r`; worker `3816.0d3a693d9299321c.js`. Existing repository lint warnings remain. Scoped `git diff --check` passes. The final build includes the Bootcamp correction and finance wording changes.
- Preview `http://127.0.0.1:3210`, PID 491460. [HTTP smoke](L26-http-smoke.json) checks menu, finances, studio/lab and developer-route exclusion. HTTP statuses do not establish rendering, input, audio or packaged behavior.
- Computer-use inventory returned no apps/browsers. Browser selection for the local game explicitly returned **No browser is available**. All 18 real UI/audio/content cases remain NOT_RUN. No screenshots or listening result are claimed.
- Steam App ID **4326170** passes. Content gate blocks **4,988 unresolved/changed items**; inventory refreshed without expanding an allowlist. Distribution/packaged acceptance remains blocked by actual evidence requirements.
- Owner careers were not opened or advanced. Mirage hashes remain `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2` (v12) and `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65` (areas). Team snapshot hash remains `1d175e66684c7b0b31d8d46d9dd99b81bf07a64d4cd7249d613997363f46285b`.

## Files and compatibility

Implementation: `app/finances/page.tsx`, `components/finance/IncomeBreakdown.tsx`, `components/transfer/NegotiationModal.tsx`, `components/dashboard/WeeklyFocusWidget.tsx`, `components/ui/{help-system,stat-tooltip,progress}.tsx`, `components/layout/GameShell.tsx`, `lib/{utils-extended,audio-feedback,sound-manager,route-audio,event-format}.ts`, `store/slices/ui-slice.ts`, `types/activities.ts`, `engine/processors/weekly-activity-processor.ts`, `scripts/launch/inventory-player-content.cjs`, two new test files, store draft and launch records.

No save schema, snapshot identity, portrait bytes or map geometry changed. The activity helper extraction retains the existing computation and values. Audio cooldowns use the presentation clock, not simulation RNG/state; no toast is removed by the audio gate. Revert individual source changes for rollback; no save migration is required. Preserve unrelated work in the existing dirty workspace.

## Remaining work

1. Execute the 18 prepared UI/audio/content cases. Listen on speakers/headphones, measure peaks/clipping and transition clicks, check suspended-context recovery and run a long session. Music gains/stop transitions still need audible calibration; tests do not certify a smooth mix.
2. Finish editorial review across primary journeys, old-save recovery and season outcomes. Migrate remaining local money/date/stat formatters, inspect raw IDs and evaluate scanner candidates manually. Review precise tutorial/reward claims against their processors; do not assume changing a tooltip completes the whole route.
3. Confirm item-specific portrait/crest/narrative/audio authorship, permissions and likeness treatment with L08. Review actual packaged and Steam-account media before final survey answers. A static search found no common model-service signals and no recorded audio files under public, but that does not prove the entire product has no live AI or external assets.
4. Complete earlier UI/fresh-player tests, the remaining L25 identities, full 5v5 integration/calibration and packaged Windows acceptance. Release decision remains NO-GO.

**Next: L27 - measure and improve real performance.** Preserve the open validation and content gates alongside that work.
