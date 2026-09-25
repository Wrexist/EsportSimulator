# Windows 1.0 product contract

Owner direction: Windows 1.0, single-player esports organization management. This replaces the Early Access framing in the local store draft. It does not authorize publication. Target player: someone who enjoys roster building, tactical preparation and sustained club development, including people who need the game to explain esports terminology.

## Ten-minute product brief

The player runs a club, not a shooter character. Each week begins with five questions: who is available, what can we afford, what does the next opponent demand, where do we lack reliable information, and which investment still matters next season? The dashboard should answer these before asking the player to act.

Assess the squad and booked cash. Choose a constrained plan. Recruit or develop the missing role, allocate training and recovery, and prepare tactics for the next fixture. Observe a readable 2D match and its result. Review the ledger, fatigue, morale and competition standing. Adapt the next week using those consequences. Advancing time must finish once, save honestly and return control promptly.

Three tradeoffs make this loop meaningful:

1. **Recruit now or develop talent.** A proven signing can fill a role immediately but consumes transfer funds and recurring wages. Training and academy development cost time and capacity, with uncertain future value. Show both the immediate commitment and the ongoing cost before confirmation.
2. **Earn cash or arrive fresh.** Streaming offers income while increasing fatigue; bonding and recovery support readiness but consume money or opportunity. Bootcamp must explain its cost and fatigue before its promised development benefit. A player should be able to connect next week's condition to this week's choice.
3. **Buy information or accept uncertainty.** Scouting takes money and time. Signing from a broad rating range is quicker but less informed. Scouting quality is about the information available; it must not imply a guaranteed future performance or a guaranteed match result.

The reason to return next season is a changed problem: an aging starter, a prospect ready for responsibility, higher board expectations, stronger opponents, and the cost of retaining a successful squad. History and trophies provide continuity. This is a design commitment to validate in L20/L28/L33, not evidence that long-term balance or fun is already proven.

## Fixed direction and scope

Windows desktop 1.0 is confirmed. Fictional team names, a 2D radar, silent Map Studio/lab and restrained glass surfaces with clear text are confirmed. Core single-player progression, recruitment, training, finances, competition, readable tactics and safe save/recovery are required launch commitments. All-map spatial match integration is still implementation work under L09-L14; the existing lab is an authoring/inspection tool, not a completed live combat engine.

Workshop distribution remains conditional L29. Multiplayer, licensed real team identities, perfect physical grenade fidelity, a 3D radar, console/mobile releases and claims of unlimited balanced simulation are not promises in the store draft. This does not remove existing tools or owner annotations. Optional work must not displace save trust and the core journey.

## Shared vocabulary and implementation owners

| Term | Contract and source of truth | Acceptance / known gap |
|---|---|---|
| Player OVR | `evaluatePlayer(...).overallRating` in `engine/player-evaluation.ts`: composite display evaluation, including experience/prestige confidence. Not a raw stat or guaranteed win rate. | Compare the same player on squad, transfer, scout and profile surfaces (L16/L23). |
| Team OVR | Roster aggregate must state whether it is mean display evaluation or raw skill. Never label two different aggregates identically. | Browser QA found Pulsar 52 in selection and 44 on the dashboard (tooltip says average roster skill). Reconcile in L16/L23; not fixed by this contract. |
| Scouting confidence | `engine/scouting-system.ts` visible stats, level and deterministic fuzzy bands; quality config in `lib/constants.ts`. Distinct from the evaluator's experience confidence. | Unscouted bands must not reveal exact hidden OVR via midpoint; compare after report completion (L16). |
| Booked cash | Current team budget plus the auditable transactions in `financeLedger`; mutations owned by finance/action processors. | Every charge/reward occurs once and agrees after reload (L03/L15). |
| Forecast | `engine/economy-engine.ts` recurring projections used by financial views. An estimate, not another balance or an already-paid reward. | Compare next-week actual with estimate and explain irregular transactions (L15). |
| Date and week | Saved `gameStartDate`, `currentWeek`, `currentDay`, `timeMode` in `engine/save-types.ts`; progression owns these values. UI date is derived, never a separate saved authority. | Same fixture and timezone show consistent schedule/header; WEEKLY versus HYBRID_DAILY must remain explicit (L19). |
| Training capacity | `engine/training-manager.ts` owns role-training slot admission/release; team `trainingSlotsUsed` and `maxTrainingSlots`. Session-based drills are a separate allowance. | Label each allowance separately; no overbooking or free extra sessions on reload (L17). |

These define intended shared semantics. They do not certify every existing screen already follows them.

## Store promise inventory

All proposed public copy in `STEAM_STORE_LISTING.md` is covered here. Implementation references establish that behavior exists; linked acceptance cases still require complete runtime execution before publication.

| ID | Promise in draft | Implementation entry point | Acceptance case |
|---|---|---|---|
| C01 | Manage a fictional esports club | `app/new-game/page.tsx`, `store/game-store.ts` | QA-01 create, inspect named club and roster, save and reopen |
| C02 | Recruit players and manage contracts | `app/transfers/page.tsx`, `store/slices/transfer-contract-slice.ts` | QA-02 sign affordable free agent; correct roster, wages and one charge after reload |
| C03 | Plan training and readiness | `app/training/page.tsx`, `engine/training-manager.ts` | QA-03 assign, advance and reload; capacity/cost/effect agree |
| C04 | Prepare tactics and follow 2D matches | `app/match/[id]/tactics/page.tsx`, `app/match/[id]/live/page.tsx` | QA-04 preparation through result; one authoritative outcome; no claim of complete spatial physics |
| C05 | Manage finances and review results as weeks progress | `app/finances/page.tsx`, `engine/processors/finance-processor.ts` | QA-05/06 ledger, next week, save/reload preserve results and cash |

Detailed scenario and evidence procedure: [Browser acceptance](BROWSER-ACCEPTANCE.md). No public copy is approved for publishing solely because the source mapping exists.

## Decisions still to settle

| Decision | Working assumption | Closure evidence / owner |
|---|---|---|
| OS and minimum hardware | Windows x64; precise OS/CPU/GPU/RAM/storage unconfirmed | Packaged L27/L31 measurements and owner approval; previous spec numbers were untested |
| Input support | Mouse and keyboard first; no controller claim | Keyboard navigation and focus coverage L24; owner confirms marketed support |
| Languages | English working UI; no completeness claim | Full string inventory and localization QA L24/L26; owner selects launch languages |
| Price/release date | Unset | Owner business decision after L32/L36 |
| Asset/map/likeness rights | Unresolved | Itemized provenance and distribution review L08; filenames and fictional names do not prove permission |
| Offline/cloud/Steam features | No store promise until accepted | Packaged offline, Steam/cloud conflict tests L30/L31 |

Review scope or promises when evidence changes. Every implementation completion report must name the next package, why it comes next, and outstanding acceptance work.

## Identity and presentation direction (13 September follow-up)

The owner now wants recognizable original-inspired fictional names (for example, donk becomes dunk), while keeping fictional identities. Stock player/club display names change through stable IDs; custom names, roster relationships and career progress are preserved. This is a presentation direction, not evidence of asset or likeness clearance. L08 remains responsible for the distribution review. Profiles use restrained navy surfaces, readable labels and compact decision summaries; decorative glass is concentrated on shell controls.
