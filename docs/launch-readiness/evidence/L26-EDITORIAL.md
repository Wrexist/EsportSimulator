# L26 editorial and content review

Local source review, 14 September 2026. **Partial; no player, audio, rights or packaged acceptance.**

## Language and number rules

| Concept | Display rule | Applied / remaining |
|---|---|---|
| Club money | `$` is the game currency; `-$1,234` for negative values. Use exact values for spending decisions; compact figures only where space demands it. | Shared `formatCurrency`; finances and signing updated. Other local formatters still need migration. |
| Percentages | `formatPercentage` accepts fractions: `0.42` means `42%`. Attribute values on a 0–100 scale must not be multiplied again. Unknown/non-finite values use a dash. | Helper guarded; full attribute-call-site audit remains. |
| OVR / potential | Overall ability summary / development headroom. Potential is not a promised future rating. | Added guide topic; detailed balancing remains. |
| Match rating / ADR | Match-performance measure / average damage per round. Neither is OVR. | Added guide topic. |
| Series / map score | Best-of counts maps; each map score counts rounds. | Added guide topic; full result/replay text review remains. |
| Cash / market value / fee | Available balance / estimated player value / agreed transfer cost. A free agent still needs wages. | Signing and guide reviewed; full recruitment UI acceptance remains. |
| Calendar | Preserve game-calendar UTC formatter; distinguish advancing a day from weekly settlement. | Weekly-focus guide corrected. Remaining route-local date formatting needs review. |
| Forecast | Estimated next settlement using current commitments; uncertain prizes are not guaranteed income. | Income bars use actual shares; help clarifies runway and insolvency. |

## Reviewed changes and mechanics

| Area | Finding and edit | Source checked |
|---|---|---|
| Finance income | Removed the invented $15,000 fallback when league share is zero. Replaced fixed 75/25/100 bars with actual proportions. | `engine/economy-manager.ts`, `engine/finance-forecast.ts` |
| Contracts | Removed separate abbreviated formatter so fee and wage decisions retain exact values. | `components/transfer/NegotiationModal.tsx` |
| Development help | Removed universal age-22–25 peak and automatic post-25 decline claims. Described individual growth/decline instead. | `engine/player-lifecycle.ts`: growth and decline are conditional; decline check starts after 27. |
| Rankings | World ranking remains Elo-ordered with tie-breakers. Removed the claim that Elo alone sets match odds and event seeding. | `engine/league-engine.ts`, `engine/ai-manager.ts`, `engine/tournament-qualification.ts` |
| Circuit points | Direct players to each event's qualification route; removed unsupported blanket decay/biggest-payout statements. | `engine/processors/circuit-points-awarder.ts`, `engine/tournament-qualification.ts` |
| Weekly focus | Reset happens at weekly settlement, not every day advance. Bootcamp awards flat +50 XP per roster player, not doubled training XP; card, guide and processor share the existing award formula. Reward values are unchanged. | `types/activities.ts`, `engine/processors/weekly-activity-processor.ts`, `components/dashboard/WeeklyFocusWidget.tsx` |
| Inbox | Old entries lacking `data` no longer break title rendering; finance title says “Finance update”. | `lib/event-format.ts` |
| Progress semantics | Shared progress component now forwards its value to the accessible primitive. | SSR income tests revealed missing `aria-valuenow`. |
| Audio | Info/XP are silent; warnings use a notification cue; shared feedback has a 0.6s cooldown, input 0.09s, error 0.65s and match cues 1.2s. Errors can interrupt normal feedback. | `lib/audio-feedback.ts`; all visuals/actions still occur. |
| Music lifecycle | Shell owns menu/live-match scenes. Finished notes are disconnected, scene swaps stop old notes, and studio/mute/background guards remain. | `lib/sound-manager.ts`, `lib/route-audio.ts`, `components/layout/GameShell.tsx` |

## AI-content disclosure preparation

The [Steam content-survey documentation](https://partner.steamgames.com/doc/gettingstarted/contentsurvey), checked 14 September 2026, distinguishes player-consumed content created during development from content produced by AI services during play. It focuses on shipped art, audio and writing rather than efficiency tools alone. Disclosure does not establish distribution rights.

The [local inventory](L26-content-inventory.json) records hashes, paths, player mappings and review limitations. It maps **1,368 players to 161 portrait files**, connects the L25 crest manifest, and records visible writing and procedural audio separately. Session history describes generated portraits and AI-assisted crest/text work; this is not proof of permissions for each input or likeness. Crest paths authored through code are still player-facing art, not automatically “coding only”.

No recorded audio files or common model-service endpoint/SDK signals were found in the inspected source paths. Audio uses Web Audio synthesis; match AI and news use algorithms/templates. These findings do not prove absence of all runtime model services, remote content or AI-assisted authored material. Review imported assets, source histories, the packaged build and Steam account media before finalizing answers. No survey or store page was submitted.

## Remaining editorial queue

The scanner flags **289 signals in 103 files** across 508 inspected source/data files. These include locale-dependent number calls, placeholders and comments such as TODO; they are triage candidates, not 289 proven player-facing defects. Inspect `editorialCandidates` in the inventory. Keep development-only labels, input examples and intentional empty states when appropriate.

Complete primary-journey walkthroughs for onboarding, contracts, inbox decisions/recovery, schedules, results/replays and season outcomes. Check raw IDs and missing names with old-save fixtures; verify every number against authoritative state. Review remaining tutorial/tooltip formulas and exact reward claims before acceptance. An audible pass must measure clipping, transition clicks and repeated cue density on speakers/headphones, with mute and resume exercised. Mock Web Audio tests cannot satisfy that gate.
