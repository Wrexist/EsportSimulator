# L18 organization systems

14 September 2026. Windows 1.0. **Implementation pass; L18 remains partial and release remains NO-GO.**

## Changes

- **Facilities:** player actions reject foreign clubs, unknown facility types, invalid levels and non-finite budgets. Basecamp now describes the implemented training/recovery/fan effects, uses the settlement upkeep formula, displays next-level upkeep and states immediate activation and the absence of a sale/refund flow. Removed unsupported unlock claims. Existing purchase and upgrade ledger entries remain authoritative.
- **Staff:** the staff overview, weekly development/recovery and analyst tactical contribution share `engine/organization-effects.ts`. Specialization and passive talents are included; an explicit zero stat stays zero. Effects are bounded: coach development at 110 effective points, talent training/tactic contribution at 100% each, psychologist recovery at 30, analyst tactical contribution at 5.5 before the independent style-counter bonus. Weekly development excludes expired staff. Hiring rejects already-employed IDs, including stale market entries. The renewal popup now respects the action result instead of showing acceptance after a rejected renewal.
- **Equipment:** buying the installed item again cannot charge cash. Purchases reject invalid budgets and copy catalog effects without sharing mutable catalog objects. Replacement removes the previous slot, charges the catalog price with a ledger entry and replaces its upkeep. Legacy duplicate slots contribute once to strength and upkeep; ratings are bounded at the catalog ceiling (8 per peripheral, 5 for PC). The full valid catalog still tops out at +56.25% in the legacy team-strength calculation; this is a cap, not a claim that the value is balanced. Equipment copy now explains the match-strength modifier, absence of permanent stat/training gains, immediate replacement, no trade-in refund and upkeep change. Cheaper replacements remain available.
- **Sponsors:** signing resolves the live saved offer before checking its tier, identity, cooldown and eligibility. Current STANDARD and legacy BASIC names share a standard slot; malformed tiers cannot enter the team. Foreign clubs cannot consume the human offer pool. Sponsor totals now use the same reputation floor, reputation factor, expiry and difficulty logic as settlement. Offer cards show projected incremental weekly income separately from base payout. A small deal can add zero cash when the reputation floor is higher; goal bonuses and brand effects remain separate.

These changes extend existing actions and serializers. No schema bump, identity replacement, map edit or historical result rewrite. New bounds affect future computations; balance-sensitive replay/version acceptance remains part of L14. Older saves retain their fields. Unknown equipment types no longer contribute to the active catalog loadout; valid custom/legacy IDs in recognized slots are retained, with bounded ratings.

## Implemented costs and benefits

| Investment | Activation and cost | Implemented benefit |
|---|---|---|
| Training facility | Immediate; $10k build, $25k x current level upgrade; weekly level^1.25 x $500 | +10% weekly senior stat gains per level |
| Recovery facility | Same facility prices/upkeep | +1 fatigue recovery and +2 energy recovery per level each weekly lifecycle update; existing low-morale recovery also applies |
| Tactical facility | Same facility prices/upkeep | +20% tactic, leadership and teamwork training gains per level |
| Fan zone | Same facility prices/upkeep | +20% fan income and +15% organic follower growth per level |
| Staff | Sign-on payment, weekly contracted wage, dated expiry; one hire per role | Coach development, psychologist recovery, analyst tactical contribution, scout reports; respective specialist/talent effects |
| Equipment | Catalog purchase, immediate slot replacement, weekly installed-item upkeep | Bounded gear rating / 80 added to career team-strength multiplier; no permanent player-stat mutation |
| Sponsor | No signing fee; fixed remaining weeks and tier slot | Settled commercial income subject to existing floor/factors; separately processed brand and goal effects |

Facilities also participate in the existing average-level match-strength modifier, capped at +10%. The per-building upkeep figures in the UI are rounded for display; settlement floors the aggregate. No arbitrary payment or new income source was introduced.

## Evidence

- **1,519 tests / 155 suites pass:** [results](L18-jest.json), [log](L18-jest.txt). Eight new organization tests cover spoofed sponsor eligibility/cooldowns, foreign-club/invalid-facility actions, repeated equipment charges and cheaper replacement, duplicate gear bounds, stale staff ownership/expiry, preview-to-training agreement, sponsor settlement factors and production save/load. Existing sponsor tests now supply live offers and a legitimately eligible club. Legacy analyst tests now assert bounded stacking and zero-stat behavior; the finance fixture uses a valid typed equipment slot.
- **Production build, TypeScript and compiled-worker smoke pass:** [build log](L18-build.txt), [build/source identity](L18-build-identity.json). Build `tePTzTD8nT08jz6H4qLMx`, worker `5894.0f48b5ac600e2dd1.js`. Existing lint warnings remain; targeted lint had no errors. The first build caught audit-only typing mistakes, corrected before the passing build.
- **Actual Electron worker/repeat/fallback/failure/reload checks pass:** [native report](L18-native-week.json). Isolated profile `tmp/l04-native/run-H7Iom5`, generated from the existing L15 coordinator probe and this build's compiled worker. This is development runtime evidence, not an installed release package or full 5v5 spatial acceptance.
- **Repeated 52-week investment comparison passes:** [runtime report](L18-runtime.json), [log](L18-runtime.txt), reproduced with `npx tsx scripts/launch/l18-organization-audit.ts`. Two plans each run twice, seed 3618, through real organization actions, 52 `computeWeek` calls, normal weekly save/load, unique ledger IDs, finite cash and staff/sponsor expiry. Final canonical states repeat exactly. Both human rosters stay at five in this fixture. It is a three-club test, not ten seasons or a representative full-world economy.

| Plan | Upfront spending | Initial total weekly expenses | Initial weekly net | Gear strength modifier |
|---|---:|---:|---:|---:|
| Level-1 facilities and standard equipment | $48,300 | $15,925 | +$9,370 | +13.75% |
| Level-2 facilities and elite equipment | $187,000 | $23,506 | +$1,796 | +56.25% |

Both plans start with $200k and the same paid 13-week coach/sponsor contracts. The original attempted level-3 building setup exceeded the fixture budget and was correctly rejected; the reviewed advanced plan uses affordable level-2 buildings. No fixture cash was increased. Final cash reaches $2.10m / $1.54m, reinforcing the need for full-world economy calibration. The small sponsor sits below the existing income floor; this case verifies expiry/persistence, while the new regression also checks a deal above the floor.

## Remaining acceptance and next work

1. Browser inventory returned no browsers, and opening the local preview returned **“No browser is available.”** No real UI interaction or screenshots are claimed. Verify facility purchases, sponsor offer delta/expiry, equipment replacement and failed renewal messaging through the real UI when connected. Preview runs at `http://127.0.0.1:3210`.
2. Finish cross-surface staff talent/scout effects, negotiation acceptance at the authoritative action boundary, sponsor goal/cancellation and all financial-distress flows. The current work does not establish every advertised organization flow. Review desktop shop/player-detail wording alongside the main equipment screen.
3. L17/L16 full-world roster supply and economics remain open. This 52-week fixture does not resolve the prior ten-season four-player spell, contracted-player recruitment policy, excessive cash or all competition entry/roster-lock rules. Do not generate free money or force purchases to hide these findings. Calibrate organization costs/strength with the full-world campaign.
4. L14 full-match/replay acceptance and Mirage wall-height/spawn/bombsite/utility calibration remain open. The owner's original Mirage files and careers were not modified.
5. [Steam App ID gate passes for **4326170**](L18-steam-appid.txt). [Content verification blocks release with **4,968 unresolved/changed items**](L18-content-gate.txt). No allowlist or content gate was bypassed. Actual packaged Windows installation, offline/Steam launch and save/close/recovery acceptance remain required; no Steam upload or publication was performed.
6. **Next development package: L19 — calendar, tournaments, qualification and rankings**, alongside these L16/L17/L18 follow-ups. L18 tasks/acceptance remain unchecked because dependencies and real UI/full-world evidence are incomplete.

## Files and rollback

Core changes: `engine/organization-effects.ts`, `engine/equipment-manager.ts`, `engine/economy-engine.ts`, `engine/match/team-strength.ts`, `engine/processors/{training-processor,match-tactical-bonus}.ts`, `store/slices/{team-facilities-slice,staff-management-slice}.ts`; UI: `app/{basecamp,equipment,staff,sponsorships}/page.tsx`, `components/staff/StaffNegotiationModal.tsx`, `components/sponsorships/SponsorOfferCard.tsx`. Regression/audit source and hashes are included in the evidence identity.

No automatic save migration or old-career recalculation is needed. Preserve an exported career before reverting future calculation behavior. The workspace contains extensive earlier uncommitted work; do not reset it to roll back this package. Owner map hashes are recorded unchanged in the identity report.
