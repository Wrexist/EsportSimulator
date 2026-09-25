# L15 - Finances, budgets and contracts

Status: **partial; release acceptance remains open**. Windows 1.0 remains NO-GO. This implementation fixes reproduced accounting, contract and forecast defects; it is not a claim of a fully balanced career economy.

## Implemented

- Recurring settlement now writes a durable per-team receipt. Re-entering a settled week cannot repeat cash changes, morale loss, insolvency counters, news or RNG draws. The receipt survives canonical save/JSON round trips and ledger compaction. Existing managed-team league-payment rows allow an old completed batch to be adopted without charging again. Managed-club ledger rows now contain their actual running balances, rather than repeating the final balance on every row.
- Academy facility upkeep and enrolled-prospect costs now join player wages, staff wages, facilities and equipment in the shared `EconomyEngine` report and weekly settlement. The later academy development action no longer charges them a second time. AI academy facilities now pay base upkeep as well; AI prospect simulation remains separate work.
- Small cash balances now display actual dollars instead of rounding a debt to negative zero millions, and weekly streaming revenue is labelled per week rather than per player.
- The dashboard, Finances and negotiation preview use that shared calculation. Twelve-week projections account for dated player/staff expiry and sponsor duration, retain negative balances, and state their assumptions. They exclude unearned prizes, sponsor goals, conditional player bonuses and speculative transactions. Runway is explicitly a current-rate measure; a club already in debt has zero available runway even if weekly cashflow is positive.
- The signing dialog now uses the shared ID-seeded baked portrait for missing/placeholder images, matching the transfer list. The broken WebGL fallback was removed from negotiation, profile and squad cards. Missing seed wiring is corrected in career previews, training, FPL, rankings, desktop market/academy, awards and match presentation. Failed original sources no longer stick to the fallback after the source changes. Offer contract and agent feedback sit below Current Team in the left panel; the right-side terms scroll independently and the close control remains fixed.
- Negotiation shows the one-time fee, cash remaining, added weekly wages, scheduled wage total, estimated weekly net and runway before signing. A free-agent upfront payment is labelled a signing bonus in the ledger.
- Transfers require agreed bounded terms starting this week with future expiry. Missing terms, stale dates, non-finite buyer cash, duplicate ownership and insufficient fees cannot partially move or charge the player. Wrong-owner and repeated releases cannot remove another team's contract or repeat chemistry loss. Renewals enforce salary/remaining-term limits, roster ownership and the existing 26-week salary-increase reserve without treating that reserve as a payment.
- Dated staff contracts now issue expiry warnings, stop before training/payroll/match index construction, and return the member once to the staff market. Undated legacy staff remain employed. Staff renewal rejects expired/unrostered contracts and unaffordable salary-increase reserves; managers cannot dismiss rival staff.
- Optional contractual match-win and MVP bonuses now become wage expenses only when eligible participants complete a match. Weekly simulation and the live/instant result commit call one shared idempotent bonus function. Losing/benched players do not receive win bonuses, and replaying the result cannot repeat payment.
- Weekly-focus costs and rewards have a durable per-team/week receipt. Reopening a save or switching activities cannot obtain a second reward. Unaffordable paid activities produce a single cancellation notice and apply neither payment nor player effects.
- Contract expiry only frees training slots actually occupied by the departing player. The finance screen and insolvency warning explain the eight-settlement disbanding rule and how a positive closing balance resets it.

## Requested identity and interface follow-ups

- Generated-player portraits now resolve through `playerPortraitSource`, using a permanent player ID. Existing authored photos keep priority; pooled faces may be shared by different generated players, but a given player keeps the same face across views. No save or image-file rewrite is needed. Old image-only preview records without player IDs retain the neutral fallback until rich preview data is available.
- Generic team letter tiles now use nine original vector motifs: fox, raptor, owl, cobra, kraken, knight, comet, crown and melon. Club names select meaningful motifs where possible; other clubs use a stable ID choice. WETERMELON receives a melon emblem and QWINTRY an owl. Brand primary colors remain, all sizes use the emblem alone; the owner requested removal of the small club-letter tags. Uploaded/authored logos and the earlier individual redesigns retain priority. These are shared fallback identities, not a claim that every club now has individually commissioned artwork.
- Save-slot display metadata now carries the actual club identity, branding and uploaded logo into the shared renderer. This metadata is derived while reading; it does not rewrite saved careers.
- The player-ID/source resolver and rendered portraits are tested at four sizes; every pooled asset is checked on disk. Crest checks cover compact readability, independent gradient references, hostile colors and named motif differences.

## Cash-flow trace

| Flow | Settlement / decision owner | Ledger and forecast treatment |
| --- | --- | --- |
| Player/staff wages | `EconomyEngine`, `FinanceProcessor` | Shared recurring report; dated eligibility, wage categories, durable settlement receipt |
| Facilities/equipment | `team-facilities-slice`, equipment helpers, `FinanceProcessor` | Purchase entries remain one-offs; upkeep is recurring and included in previews |
| Academy | `academy-slice`, `academy-constants`, `FinanceProcessor` | Build/scout/development/release entries remain one-offs; upkeep moved to shared recurring settlement |
| Transfers/signing fees | `transfer-contract-slice`; AI transfer modules | Atomic fee/roster/contract mutation; paired seller/buyer entries or FA signing expense; primary negotiation preview |
| Sponsor weekly revenue | `EconomyEngine`, sponsor goal processor | Reputation floor and difficulty rules retained; expired agreements excluded; forecast applies duration |
| Sponsor goals | `sponsor-goal-payout`, `match-sponsor-goals`, live result commit | Conditional revenue becomes a ledger entry on completion; goal state plus payment IDs prevent repeats |
| Player win/MVP clauses | `player-contract-bonuses`, both result paths | Conditional expenses only after a completed eligible match; unique match/player/bonus IDs |
| Prizes | `standings-processor` | Placement IDs guard payments; not presumed in recurring cashflow |
| Staff signing / renewals | `staff-management-slice` | One-time signing fee; renewal changes future payroll without an invented upfront charge |
| Activities/training/scouting/merch | Their existing store/weekly processors | Action-specific one-off ledger entries; weekly focus now additionally receipt-guarded; no speculative forecast assumption |
| Manager job change | `events-slice` | Existing club signing-bonus ledger entry retained; job-switch economy/abuse balancing remains a follow-up |
| Loans / payment schedules | No shipped loan/repayment implementation found in inspected finance paths | No invented borrowing, interest or delayed-payment guarantees |

The ledger is still capped by existing save compaction. AI recurring cash has receipts but retains the existing absence of itemized recurring ledger history; one-off AI transfers/infrastructure have entries. A complete all-club historical accounting archive is not claimed.

## Verification

- Full Jest: **1,482 tests / 152 suites pass**. New coverage includes healthy/distressed/season-boundary re-entry, canonical round trip and compaction, old receipt adoption, sponsor/player/staff expiry, academy reconciliation and no second charge, wrong-owner/repeated releases, invalid signing dates, renewal limits/reserves, cancelled/replayed activities, conditional bonuses, and actual weekly/live result integration.
- [Windows Node finance run](L15-finance-runtime.json): seed 3402, explicit synthetic scenarios starting at week 52. The stable fixture reconciles 52 recurring settlements through week 104; the deliberately distressed fixture reaches BANKRUPTCY at its eighth insolvent settlement. Every managed-team row reconciles and every serialized replay is unchanged. This isolates finance/expiry/sponsor processing; it is not a full season balance study or a packaged test.
- [Final focused checks](L15-focused.txt): **90 tests / 8 suites pass**. [Full regression JSON](L15-jest.json), [regression log](L15-jest.txt), [type check](L15-types.txt), [focused lint](L15-lint.txt). Lint has zero errors and existing warnings; the CLI script is excluded by the existing lint pattern and is separately run/type-checked.
- [Actual Electron week coordinator](L15-native-week.json): **10 comparisons pass**, spanning two weeks in worker, repeated worker, main-thread fallback, injected worker failure and save/reload modes. Exactly one authoritative write per week; duplicate advance input does not advance twice. This L15 fixture includes academy costs, staff expiry and conditional match bonuses. Managed cash reconciles in every mode, academy charges once, and the coach expires at the second tick. Source-native Electron 44.3.0, not the packaged game.
- [L14 compiled-worker revalidation](L15-L14-native-replays.json): all six physical replay envelopes match Node and repeat; final live/instant/skipped lab projections agree, position restores and foreign digest rejection pass. This preserves L14 lab evidence, not full career-mode parity.
- The two native probes used engine build `8oLRlUfW6uZLOeYJf6u2Q` (week worker `3444.35c5444f5ec717dc.js`, spatial worker `2063.dbacc41a85fa0716.js`). Subsequent changes correct small-cash display, streaming units, portraits, generated club emblems and read-only save-preview metadata. Native probe results describe that earlier engine build; final UI build evidence follows below.

## Browser regression evidence

The following checks used actual Chrome controls and rendered DOM, with synthetic finance careers kept separate from the existing WETERMELON save:

- Distressed QA fixture: cash -$1,000, insolvency 3/8, weekly revenue $25,289, expenses $56,000 and net -$30,711. Negative forecast balances remain visible. See [overview](L15-finances-overview.png) and [forecast](L15-finances-forecast.png).
- Funded QA signing: a 52-week offer is rejected with visible agent feedback. A 156-week offer at $4,900/week succeeds; the zero-fee signing leaves cash $200,000, adds the player to payroll and changes forecast net to $1,889. Save and full-page reload retain the player and payroll. This successful mutation occurred only in the synthetic career.
- The signing action stays at the same screen position when the right terms panel scrolls (53 px scroll, action bounds unchanged). The action is below Current Team, not at the bottom of the terms.
- Reported zForce ID `fpl_nonpro_1_97989_4293`: both profile and signing dialog load `/assets/teams/tide/players/eliqe.png`; zero canvas elements remain. The offer was opened and closed without signing in the WETERMELON career. See [profile](L15-profile-portrait.png) and [signing](L15-signing-preview.png).
- All ten QA player images across the two career previews are loaded and use matching source paths for matching IDs. No portrait silhouettes remain in that screen. See [career previews](L15-career-portraits.png).
- The final saved-career preview also renders WETERMELON with the same melon mark as the dashboard; QA Aurora uses its stable purple motif. See [career club logo](L15-career-club-logo.png).
- The dashboard renders the melon and owl marks for WETERMELON and QWINTRY. See [club emblems](L15-club-emblems.png).
- After the full 1,482-test run, the final read-only save-preview metadata change passes **33 focused tests / 4 suites**, including a new test proving identity propagation and no storage writes. The final production build rechecks types and worker startup. [Focused identity checks](L15-identity-tests.txt), [build log](L15-build.txt), [source/build receipt](L15-build-receipt.json).

Final production build: `ukEFQCRmP1t-qPbb2ToF0`; source and worker filenames are recorded in the build receipt. The final save-preview metadata change alters the compiled week-worker hash; full native coordinator comparisons remain scoped to the earlier recorded build.

## Compatibility and rollback

No save-version bump, owner-career reset or map edit. `financeSettlement` and `weeklyActivityWeek` are optional team fields carried by the canonical teams serializer; newly created career teams have neither. Current saved receipts prevent repeated settlement even after ledger trimming. The old league-ledger fallback reconstructs managed-team totals; other teams' legacy receipt totals are current-rate estimates because old builds never retained their itemized payroll.

This update deliberately enforces previously unenforced dated staff expiry, includes academy costs in weekly financial state, and pays existing performance-bonus clauses. These can change future cashflow and AI decisions. Existing recorded match history is not recomputed and no historic bonus arrears are charged. Keep a pre-update save when comparing older builds; restoring an old binary will not provide these protections. Contracts retain the existing exclusive `endWeek` convention: a signing during a week first pays at the next settlement, so a duration of N weeks schedules N-1 wage payments. The preview exposes this; any change to term semantics needs a separate migration, not silent redating of existing contracts.

Both owner Mirage files retain their recorded SHA-256 values (see runtime receipt). The L14 replay-import source draft remains unwired; it is not delivered as a working import feature.

## Remaining acceptance and next work

- Run the shipped Windows package through finance/contract decisions, saves, reloads, write failures and multiple careers. Complete L03/L04 prerequisites; source and browser evidence do not satisfy this gate.
- Validate all secondary purchase/renewal/signing surfaces against the same decision preview. The Payroll table still labels nominal `weekly wage * remaining weeks` as Total Value, whereas the signing preview counts actual future settlements under exclusive expiry; this needs term-semantics alignment in L16. Continue with desktop Market, onboarding, staff and academy. Add full commitment scheduling for chosen future activities and scenario changes if promised by the UI; current forecast labels these exclusions.
- Run long-career balance and insolvency/recovery scenarios with recruitment, sponsorship choices, academy growth, job switching and all shipped difficulties. Calibrate the impact of now-paid AI academy upkeep, staff expiry and performance clauses. General financial grade formulas and strategic AI budget policies remain balance work.
- Review contract term semantics and release policy together with L16. Senior release currently has no severance fee; no new severance debt was invented. Historical receipts are bounded, not an unlimited audit archive. Assess roster viability after multiple simultaneous expiries and all AI contract writers.
- Remaining L14: complete spatial 5v5/career adapters, buys/halves/overtime/series, live/instant/resume parity and durable packaged recovery; continue Mirage geometry/utility calibration. The lab replay is not activated for career payouts.

All L15 acceptance boxes remain unchecked until the cross-surface, long-career and packaged evidence is complete. **Next development package: L16 - squad, recruitment, scouting and transfer AI**, carrying the above contract/affordability follow-ups alongside remaining L14 validation. Windows packaged testing, the real Steam App ID and content clearance remain launch requirements.
