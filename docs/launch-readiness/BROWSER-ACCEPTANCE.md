# Maintained browser acceptance: L02

Use real visible game controls. Unit tests and direct store mutation do not pass these cases. Start a separate browser profile with an empty `http://localhost:3210` origin. The owner's existing origin is `http://127.0.0.1:3210`; never clear it or import test careers there. A different tab on the same origin is not isolation. If localhost already contains unrecognized saves, use a separate browser profile before testing.

Run `npm run qa:fixtures` to create a new, non-overwriting `tmp/launch-fixtures/run-*` directory. Each save uses production export/import validation, seed 3402, schema, factory/lock hashes and per-scenario expectations. The original generated JSON is the immutable reset input; import creates a new career ID. Keep previous run folders for compatibility. These seven careers cover small synthetic worlds, not the full-world performance baseline. The late-career case has synthetic history and must not count as ten simulated seasons.

For every case record source digest from release evidence, browser/version, QA origin, fixture hash or full new-career setup, visible actions, expected/observed values, status, screenshot and export of last-good save. A failure keeps all evidence and stops dependent steps; it must not silently reset the career. Missing export is itself recorded as a gap, never reported as retained. Native file selection may require the tester to select the generated file; do not weaken browser protections.

| Case | Visible application actions | Required observation |
|---|---|---|
| QA-01 | Main menu, New Career, name `Launch QA 3402`, choose Pulsar, Start Career; dismiss tutorial after separately checking onboarding | Club, five starters, initial date and budget visible; no old saves overwritten |
| QA-02 | Transfers, free-agent filter, inspect affordable candidate, sign through confirmation | Named player joins once, contract wage and any fee agree with roster and ledger |
| QA-03 | Training, select one drill or role-training action, confirm | Allowance, readiness and money update according to the shown cost; repeated click cannot exceed capacity |
| QA-04 | Schedule, advance to next match, preparation/veto/tactics, play live, finish result | Result appears once; live/result/history agree; no claim of complete spatial physics |
| QA-05 | Advance to next week using the normal progression control, resolve blocking decisions | Week advances once, finances/condition/events reflect actions; button becomes responsive again |
| QA-06 | Settings save, export last-good save, close tab, open main menu on same QA origin and load | Same club/week/roster/cash/training/match outcome; no silent new career or lost pending fields |
| QA-07 | Repeat using shortage, crisis, boundary and late-career generated imports | Explicit constraints, once-only consequences, useful errors, persisted state |
| QA-08 | Packaged Windows persistence fault/recovery and worker interruption | L03/L04 fault matrix and retained primary/backup; browser/memory success alone is insufficient |

A complete run must cover all QA-01 through QA-06, plus scenario coverage QA-07 and appropriate L03/L04 failures. See `evidence/L02-REPORT.md` for observed results and gaps. Fixture generator failure writes `failure.json`; release runner preserves complete command logs. Automatic browser failure artifact capture and actual browser/disk fault injection remain open work, not provided by the memory storage tests.
