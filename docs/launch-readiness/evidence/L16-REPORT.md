# L16 — Squad, scouting, recruitment and transfer AI

Date: 2026-09-14. Target: Windows 1.0. **Status: partial; not release accepted.** Dependencies L04/L15 and long-career economic viability remain open.

## Follow-up on 14 September 2026

The previously failing 104-week finance fixture now stays solvent, as do seeds 3417 and 3418, with identical repeated trajectories. Optional staff/facility/academy investments now consider recurring costs; distressed clubs may seek eligible sponsors. Registration enforces current senior ownership/contracts and entry rules. Bench reward inflation is fixed. See [L17 report](L17-REPORT.md) for current checks, limitations and the restored Steam App ID 4326170. The original failing evidence below is retained as the baseline; full-career acceptance remains open.

## Changes

- Added `engine/recruitment.ts`: shared opening wage expectations, role aliases, academy ownership exclusion, employed-scout checks and a 26-week reserve against the club's full recurring deficit. Costs include dated player/staff wages, equipment, facilities and academy upkeep.
- Corrected scouting OVR to use the shared player evaluation rather than copying skill. Preserved zero values and deterministic estimate bands. Transfers, scouting, recruitment profiles, desktop market and negotiation show report-dependent ratings. Rating sorting uses the displayed estimate. Hidden synergy filters and charts require an elite report.
- Added a recruitment profile with shortlist/squad comparison, confirmed attributes, wage expectations, report upgrades, mission cancellation and negotiation. Owned-player profiles retain their detailed squad controls. All portraits keep the permanent player ID as their fallback seed.
- Scouting requires a real, available target and an employed, unexpired club scout. No borrowing rival scouts or paying to scout nonexistent players. Better scouts can upgrade reports. Completion is shared between pre-tick and worker processors, deduplicates reports, preserves higher report quality and explains incomplete/cancelled missions. Cancellation does not refund commissioned work; the UI states this.
- Desktop free-agent offers now use the same negotiation modal. Removed its separate direct-sign/bonus flow. The contract modal uses roster ownership, refreshes terms when changing player/week/career, rejects ownership changes during negotiation, and shows scheduled wage settlements rather than including the exclusive expiry week. Offer Contract remains below Current Team.
- Canonical transfers reject academy-held recruits and clear stale listing metadata. Old or changed-owner/listing offers explain why they cannot be accepted. New AI offers expire after two weeks; expired pending offers no longer block future bids. Acceptance rechecks current affordability. Completed matches no longer trigger the same-week sale warning.
- Squad swaps reject foreign clubs, non-integer/out-of-bounds positions and changes during an active match. Academy promotion copy no longer promises universal tournament eligibility.
- Real browser checks exposed two interaction defects: the negotiation overlay could sit behind the sidebar, and the bench Swap button followed its enclosing player link. Negotiation now renders in a body portal; Swap prevents the link's default navigation. Both corrected actions were verified through the visible UI.
- AI free agents use the same opening wage calculation and zero transfer fee as the human flow. Urgent vacancies prefer low wages but cannot bypass affordability. Multiple vacancies can be filled in one week, including outside the transfer window. Optional depth is released when the cash reserve becomes insufficient. Release and signing no longer silently debit invented fees.
- AI-to-AI transfers filter affordable alternatives before choosing a target, preserve the seller's five-player quorum, post paired transfer ledger entries, and update chemistry/synergy/training ownership. Pre-season signings exclude academy/contract-held players, check affordability, and date contracts to the actual signing week.

## Validation

- Regression suite: see [L16-jest.txt](L16-jest.txt) and [machine-readable results](L16-jest.json). New tests exercise scouting → known comparison data → signing → lineup swap → production export/import, unavailable scouts/players, cancellation/upgrades, academy boundaries, stale offers, roster-edit guards, full-cost affordability, transfer cash conservation and OVR consistency.
- [104-week recruitment/finance audit](L16-recruitment-runtime.json): two identical synthetic runs, canonical save snapshot each week, production export/import at the end. Ownership, active contracts, integer wages, roster caps and repeated canonical simulation state are checked. Wall-clock save timestamps are excluded by the existing `canonicalWeekState` helper, not by a new relaxed comparison.
- **Economic acceptance failed:** in the synthetic 104-week scenario, one AI club still enters debt. The audit records `financialViabilityPassed: false`. No matches, prize money, full-world seasons or training are simulated in this test. It is invariant/recruitment evidence, not proof of a balanced two-year career.
- Full regression run: **1,495 tests / 153 suites passed**. The final Swap event fix additionally passed **31 tests / 2 suites** in [final focused regressions](L16-final-regressions.txt). A timing-ratio test failed during concurrent build/test load, then passed unchanged in isolation and in the full rerun; see [timing recheck](L16-performance-recheck.txt). No threshold was relaxed.
- Production build and compiled-worker smoke passed: build **`5AOpHd4zlZ1PZB6JFnixS`**, [build log](L16-build.txt), [artifact identity](L16-build-identity.json). Existing warnings remain. Week worker `8654.3ad5903a0519e09b.js`; spatial worker `2063.dbacc41a85fa0716.js`.
- [Native week validation](L16-native-week.json): ten comparisons covering worker, repeat, fallback, injected worker failure and reload passed. [Native L14 validation](L16-L14-native-replays.json): six controlled spatial scenarios and five replay checks passed. These probes ran build `OzQrfoKkTbybk4hXER4g-`; subsequent changes were UI-only and both worker content hashes are unchanged in the final build. This is development-runtime evidence, not packaged Windows acceptance.

## Real browser recruitment workflow

Used the production preview at localhost:3210 and a separate imported L16 Aurora career (seed 3416), through visible controls only. Fixture SHA-256: `c6946f0b254968377a6492082c5c3ee4b0d6143db84fcbffdf995c877def846e`.

1. Opened QA Free Agent with an unknown **41–81** OVR estimate, compared against PlayerA1, commissioned the employed scout for **$3,000**, and advanced the fixture one week. The completed elite report showed **52 OVR**. [Comparison screenshot](L16-comparison-unknown.png).
2. Negotiated **$4,900/week for 104 weeks**, zero free-agent transfer fee. The Offer Contract button below Current Team was visible and unobstructed. Signing updated ownership and the player profile. [Contract screenshot](L16-contract-offer.png).
3. Saved and reloaded, moved the recruit into the first starting slot, then saved and reloaded again. The contract, report and starting position persisted. [Starting lineup](L16-starting-lineup.png).
4. Advanced the QA career to its scheduled friendly, completed quick veto, and simulated the match. L16 Aurora won **13–7 on Nuke**; QA Free Agent recorded **10 / 8 / 5**, proving the recruited player was fielded. [Result screenshot](L16-match-result.png), [visible result text](L16-match-result-dom.txt). This verifies the instant friendly route, not every competition/live-match path.
5. Found a development follow-up: unused substitute PlayerA1 appears with **0 / 0 / 0** but **+150 match XP**. Track participation-based rewards and bench presentation in L17; this run does not establish correct development rewards.
6. Saved the QA career and restored the owner's WETERMELON career. Confirmed **$501,400**, **20 September 2026**, **week 2/day 1** without advancing it. Owner Mirage drafts remain unchanged; hashes and counts are recorded in the runtime report.

## Save compatibility and rollback

No save schema version change or bulk migration. Existing player/team IDs, fictional identities, portraits, careers and owner map drafts remain. The only new offer fields (`expiresWeek`, `salaryPerWeek`) are additive event data; older offers use a two-week expiry when checked. Legacy missions with no valid employed scout now end with an explanation instead of revealing free expert attributes. Existing report tiers remain usable.

No owner career was advanced for testing. Browser testing uses the synthetic `tmp/l16/recruitment-ui.json`, validated by the production importer; its hash is in the runtime report. Keep a normal exported save before rolling back across gameplay-rule changes. Never reset the whole dirty worktree to revert this package.

## Remaining work / next package

1. Extend the successful browser friendly fielding check to competition registration and other match types, plus contract/renewal/counteroffer/cancellation edge cases. A successful recruitment workflow is not blanket tournament eligibility evidence.
2. Calibrate multi-tier club income, staff/facility investment and wages. Resolve the recorded AI debt result, then run full seeded careers with matches, retirement, academy supply and contract expiry across several seasons. Preserve explicit insufficient-funds outcomes rather than granting cash or free players.
3. Audit remaining player-card, rankings, history and desktop surfaces for intentional public information versus hidden attributes. Main recruitment entry points are corrected; no claim of a complete game-wide information audit.
4. Complete AI negotiation/contract-duration and reputation/lineup-strength calibration. Shared opening wages do not establish parity for every counteroffer and player duration preference.
5. Continue L14 full 5v5/career replay parity, recovery and projection integration. Controlled spatial replay checks do not complete this criterion.
6. **Next development package: L17 — development, training and academy choices**, beginning with participation-based match XP and carrying the L16 balance/eligibility follow-ups. L04/L15 dependency acceptance remains open.

Windows packaged testing, the real Steam App ID, content clearance and Mirage geometry/utility calibration remain launch requirements. This work makes no Steam approval, rights-clearance or perfection claim.
