# L34 implementation report

Status: partial; required upstream L02/L06/L07 and packaged acceptance are not complete.

Implemented a shared local/CI evidence runner with per-command logs, nonzero/missing failure, source and lock hashes, Node/npm/environment identity, same-run Windows artifact hashing, source-change detection and no publishing. CI no longer ignores lint; failed checks retain logs; web build and manual Windows candidate job are distinct. Static scan now covers all public files, labels its limits, ignores the 415-entry historical bulk baseline as release approval, refuses baseline rewrites and fails on missing/invalid policy. Readiness output reports findings instead of misleading per-check 'ok'; hardening labels the actual configured week count.

Executed `npm run release:checks`: conflicts, fresh types, lint, 1,300 tests/129 suites, seven fixture production imports, 500-week hardening (39,955ms), and source-unchanged all pass. Dependency audit, strict readiness and expanded static content correctly fail; overall exit 1/NO-GO. Full logs and source manifest: `L01-L02-L34-run/`. Readiness: 1 HIGH, 1 MEDIUM, 3 INFO. Expanded static scan found `public/hltvrankiing` filename keyword (1 MEDIUM); this is a review flag, not a legal finding. Dependencies remain unmodified.

After that recorded run, added npm/environment metadata, excluded final L36 owner review from input gates to prevent a circular requirement, required conditional scope to be verified or explicitly excluded, and hardened missing policy behavior. Targeted final regression: 16 tests/3 suites pass including four subprocess tests of the real scanner. Earlier full-run manifest identifies its exact pre-follow-up source; it is not claimed as a final source snapshot.

Remaining: verified fresh Windows package and installed-app runtime acceptance, inline art/provenance/packaged notices and actual inclusion review, item-specific reviewed expiring exceptions if any are proposed, remote CI execution, complete release-environment/artifact linkage. Source manifest intentionally excludes ignored files. No package, remote workflow, Steam upload or release was performed. L34.1 complete; .2/.3/.4 partial; A1/A3 complete, A2 open.

Next: L06-L08 and L03; build and test Windows candidate at L31 after prerequisite closure. Full release command remains NO-GO while acceptance is missing. See `RELEASE-COMMANDS.md`.
