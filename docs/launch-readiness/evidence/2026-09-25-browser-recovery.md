# Production-browser recovery review, 25 September 2026

Chrome extension control, isolated Next production server on localhost:3371. Existing user server on 3210 was not changed. No career save was cleared or modified.

## Observed flow

- Opened the Vertigo Team Lab, loaded its combat-recovery example through the existing backed-up loader. Reference loaded with 2,105 surfaces and 66,048 triangles.
- Browser worker produced a spatial-round-v12 replay with hash prefix `750c1a02fada`.
- Timeline showed actual smoke screening at 1.516 seconds, followed by bomb pickup at 1.891 seconds. T1 killed CT1; the displayed final survivor health was 78 HP.
- The ten-second calibration finished with CT winning on timeout. This is expected for the bounded pickup example; it does not establish a completed full round or plant.
- Saved playback position at tick 8 / 0.125 seconds, skipped to the result, then resumed. The saved position was restored and the UI stated that events/rewards were not reapplied.
- Reloaded the page, reran the retained combat settings, observed the same replay hash prefix, and resumed the saved position again.
- Switched to Observer, played the radar, observed the Play/Pause state and advancing timeline, and later observed the completed playback at tick 640 / 10 seconds.
- Radar, actor status cards and playback controls were visually inspected at the actual 1049 x 827 viewport. No horizontal document overflow was reported (scrollWidth 1049).

## Limits

This is browser-worker and playback acceptance for one controlled Team Lab scenario, not production-career integration, all-map coverage, a packaged executable test, or verification of actual reward application. Exactly-once settlement is separately exercised by journal tests.

An attempted browser viewport override to 1280 x 720 did not change the tab's measured size. The override was reset. Do not claim 1280 x 720, 1440 x 900 or 1920 x 1080 validation from this pass. Other routes and first-session player testing remain open.
