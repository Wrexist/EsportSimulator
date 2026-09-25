# Cleanup implementation: first batch

Date: 12 September 2026. Changes are local and uncommitted on top of the audited baseline `f0c1f814`. This records implementation after the audit; the original findings and evidence remain a historical baseline.

## What changed

| Area / audit reference | Implemented behavior | Remaining acceptance |
|---|---|---|
| Week transport — F02, packages 05–06 | Requests have IDs; stale responses cannot complete another request. Overlapping requests are rejected. Errors, timeouts, initialization failures and message failures terminate the worker and use one captured input/seed for fallback. Listeners and timers are cleaned up. | Repeat on packaged Electron and representative long-running careers. A failed worker uses fallback for the rest of that bridge's lifetime. |
| Compute and commit — F03, package 06 | Worker and fallback call the same compute-only entry. The store applies post-processing, persists the final snapshot, and then releases its loading lock. A failed final write retains the advanced in-memory week for a save retry. | Full restart/recovery fault matrix in package 08; persistence after process termination has not been certified. |
| Save serialization — F04, package 07 | Manual saves and simulation snapshots use one typed serializer. Commit markers and RNG state zero survive serialization. Loading an older career clears a previous career's commit marker. | Complete inventory of custom tactics, pending activity and other optional fields; migration policy and all-career round trips remain open. |
| Close and autosave — F05–07, packages 09–11 | Shared lifecycle handles autosave and close; cancelling close leaves autosave active. IPC subscriptions return cleanup functions. Renderer receipt stops the native watchdog; an unresponsive renderer prompts the player instead of closing automatically. One canonical autosave preference serves both settings screens, with legacy migration. | Actual Electron close/cancel/remount/slow-disk tests; broader preference schema cleanup. |
| Audio and motion — F08/F16, packages 12/26 | Volume choices made before AudioContext creation are retained. Pending music starts after audio initialization; menu route changes preserve music. Framer Motion honors the app's reduced-motion preference. | Audible acceptance on hardware; audit all CSS/canvas animation and screen-reader behavior. |
| Recurring finances — F01, package 15 | Dashboard and Finances derive forecasts from EconomyEngine settlement calculations. Equipment upkeep is included in the report and ledgered once. Expense rows and cash labels reflect actual data. | All hiring/sponsorship/one-off previews, affordability messaging and season balance scenarios. |
| Progression controls — F09, package 22 | Header actions wrap and secondary information yields space at narrower widths, exposing progression controls at 1024×640. | Full responsive matrix across every route, modal, scale setting and keyboard path. |
| Electron boundary — F21, package 41 | Local server binds to 127.0.0.1. Navigation uses exact allowed origins and ports. Close IPC checks the main window/frame and origin. | Validate every remaining sensitive IPC channel, packaged CSP/navigation and native integration. |
| Production worker startup — F23/F24, packages 05/54/55 | Browser QA exposed a production-only `window` access before READY. Shared storage/Steam guards now inspect the runtime realm. Workers do not initialize durable storage. A build gate executes the actual compiled worker without DOM globals and requires READY. | This gate covers startup; real-browser progression and integration tests cover different behavior. It relies on the current Next.js worker chunk format and must be revisited during framework upgrades. |

## Verification

| Check | Result |
|---|---|
| Final full Jest run | **1,207 tests / 121 suites passed**, zero failed or pending (64.9 seconds). |
| Production build and type validation | Passed. Build lint retains **154 warnings**, zero errors. |
| Actual compiled-worker startup gate | Passed; READY without window/document or durable-storage initialization. The gate reproduced the failure in the previous bundle before the runtime guard fix. |
| Release hardening | Passed: tamper check, transaction-step crash/resume, **500 simulated weeks**, 2,202 image signatures. This synthetic run preceded the final worker-realm guards and career-marker reset; the final full suite and production build cover those edits. |
| Strict Steam-ready and compliance scans | Passed; limited static checks. |
| Electron JavaScript syntax | Main and preload checks passed; native window behavior not executed. |
| Browser production career | Reloaded week 2, played a friendly, advanced to **week 3 / day 1** with cash **$541,200**. The $20,600 increase matched the forecast; no captured worker fallback warning or console error. Closed the tab, reopened and continued the save: week 3 / day 1 and $541,200 were retained. |
| Responsive progression | DAILY, NEXT DAY and SKIP WEEK all inside **1024×640, 1280×720, 1440×900** viewports. Next Day and Skip Week also clicked successfully at 1024×640 earlier in the pass. |
| Settings consistency | Turning autosave off in the standalone page was reflected in the main-menu settings modal; restored it to on after testing. |
| Whitespace validation | `git diff --check` passed. |

Browser testing used only the isolated Audit Manager career at `127.0.0.1:3210`; existing Electron saves were not used. This is targeted acceptance for changed behavior, not an all-route visual sign-off.

Regression coverage now exercises the actual worker client, shared compute entry, store commit action, serializer, financial settlement, settings migration, audio initialization, autosave/close lifecycle, native watchdog helper and origin checks. The suite uses fault injection for timeout, stale response, disk failure and delayed commit cases. Native helper unit tests do not substitute for a packaged application test.

Evidence from this implementation pass is in [implementation-evidence/](implementation-evidence/). Earlier audit evidence is unchanged in [evidence/](evidence/).

## Next work, in order

1. Finish packages 07–09: inventory every persistent field, implement missing serialization deliberately, and exercise interrupted save/restart recovery in the application and packaged Electron.
2. Triage the 47 baseline dependency findings (package 40), then complete sensitive IPC validation and packaged boundary tests (41/56). This batch changes no dependency versions.
3. Establish the shared visual rules and accessible components (21, 23–29), then apply them route by route using COVERAGE.md. Current typography, navigation duplication and many accessibility findings remain.
4. Reconcile remaining player-facing facts and match flow (16–20, 30–39). During this pass, the test career's instant-result flow showed Nuke after the veto selected Sandstone; investigate the veto-to-result map contract under package 34/F11.
5. Add maintained browser acceptance automation, complete release gating, and run native Steam/cloud/device acceptance (54–60). Static Steam scans are not runtime certification.

The 60-package plan remains the authoritative backlog. This batch implements important portions of it; unchecked packages stay open where their broader acceptance criteria have not been met. The application is not yet fully polished or release-certified.
