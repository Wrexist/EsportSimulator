# Premium desktop UI rebuild

## Inspection and preservation boundary

Next 15 / React 19 App Router; Electron is the desktop host. Root `app/layout.tsx` loads the single `components/layout/GameShell.tsx`, which owns Sidebar, TopBar, route scroll, shortcuts, save/close coordination, accessibility preferences, match navigation guard and global overlays. Keep this owner intact. `store/game-store` and slices, `engine/`, persisted saves and workers remain outside this presentation change.

Existing shared controls live in `components/ui` (Radix controls, Button, Card, GlassSurface/Table, portraits, team emblems, loading/empty states); some small headings/metrics also live under `src/components/ui`. Restyle existing primitives rather than duplicate the shell. Existing font: shipped Archivo display plus system Segoe UI body. Retain the system body font for readable desktop text.

Showcase owners: `app/page.tsx` and dashboard widgets; `app/match/[id]/live/page.tsx`, LiveMatchScoreboard/ControlBar/MapRadarPanel and useLiveMatch; `app/player/[id]/page.tsx` plus player-detail; scouting page and its report/watchlist/mission actions; basecamp/equipment pages with existing purchase/upgrade actions and organization-effects formulas.

All route families: home, academy, animations, basecamp, career, credits, desktop/inbox, equipment, finances, FPL, hall-of-fame, load-game, main-menu, map-editor/lab, match live/result/tactics/veto, new-game/create-team, player, rankings, schedule/staff-meeting, scouting, settings/community-import, sponsorships, squad, staff, stats, tournaments/detail, training, transfers, trophies and developer tools. Map Studio keeps its precision geometry canvas and controls; generic shared controls can adopt the same material without modifying drawings.

Baseline `npm run type-check` passed before edits. Existing scripts: type-check, test (Jest), build (Next + worker verification), screenshots:capture and screenshots:steam (Playwright fixtures; inspect before use). Browser validation uses an isolated UI review career; never clear the user's existing storage. `npm run lint` works on Next 15 with its deprecation notice and existing warnings.

## Implementation sequence

1. Add semantic navy/acrylic tokens and one route atmosphere in the current shell. Refine existing buttons, panels, tabs, tables, input/dialog states; preserve focus and reduced-motion behavior. Avoid blurred nested table rows.
2. Copy non-portrait supplied art to `public/esport-ui-assets`, retain source names, and generate WebP derivatives using the existing sharp pipeline. Add a central manifest. Preserve all portraits and current club/team identities; crests only available as optional supplied assets.
3. Home: arena-backed next-match focal card, compact support metrics, weekly focus/actions beside it. Preserve schedule/live/result CTAs and all condition branches.
4. Live match: compact scoreboard/rosters, larger central radar, bounded feed and clear existing tactical decisions. Do not fabricate win probability or add unimplemented actions.
5. Player dossier: compact hierarchy, existing stats/radar/traits/equipment/history. Keep existing portrait resolver and data visibility boundaries.
6. Scouting: sticky table headers, keyboard-selectable rows, focused filters and readable intelligence panel; keep fog of war and mission/shortlist actions.
7. Campus: accessible scene hotspots selecting real facility types, all four existing upgrades and exact current/next benefits; equipment uses supplied product art without changing catalogue IDs/prices/bonuses.
8. Full route sweep: shared layout/material density across remaining pages, modals, loading/empty/error states. Preserve routes, tests and actions.
9. Typecheck, lint, relevant and full Jest checks, production build/worker verification; browser screenshots and flow checks at 1280×720, 1440×900 and 1920×1080. Record measured results and outstanding limitations honestly.

## Art rules

Five reference images are visual direction only. No reference UI text or fabricated stats go into production. Background plates are decorative, optimized and rendered once per route beneath a navy veil. User explicitly excludes new portraits. Original transparent trophy remains the game identity. No new dependencies planned.

## Verification record

Implemented the semantic material/token layer in `app/premium-ui.css`, retained the one GameShell, and integrated decorative route backdrops through `lib/ui-assets.ts`. Existing buttons, panels, tables, tabs, dialogs, empty/loading states and metrics share the new treatment. Selected navigation has no cyan edge glow; primary buttons use white with dark text and a restrained shadow. Corners have subtle highlights; reduced-motion, reduced-transparency and high-contrast handling remain available.

Showcase changes cover dashboard hero/support hierarchy, compact live scoreboard/rosters/radar/tactical controls, player dossier and recent-match strip, scouting table/keyboard selection/report-coverage indicator, and campus facility hotspots. Remaining route owners received shared materials and compact heading/layout adjustments; exhaustive route/branch validation is still open.

Equipment follow-up: 18 unique original transparent renders cover mouse, keyboard, monitor, headset, chair and PC across Standard, Pro and Elite. Standard is charcoal/slate, Pro graphite/silver, Elite ivory/carbon/champagne. Both Equipment and the desktop Shop use the same type/tier resolver. Prices, IDs and effects are unchanged. Original PNG masters and generation records are in `esport-ui-assets/equipment/`; reproducible delivery export is `scripts/branding/export-equipment-tiers.cjs`. All 18 alpha channels were verified; WebP delivery totals 593,264 bytes. Equipment comparison now uses the shared accessible Radix dialog. Escape closes it without also navigating back.

Component inventory: existing GameShell/Sidebar/TopBar, Button, Card, GlassSurface, GlassTable, Dialog, tabs, inputs and badges; new shared PageHeader and ReportCoverage; existing avatar/crest resolution retained. No new portraits or dependency packages.

Evidence is under `docs/ui-review/`, including `equipment-tier-contact.png`, `equipment-comparison-1280.png`, showcase captures and equipment in-game captures. Browser checks exercised facility upgrade, equipment purchase, training, day advance, veto/start match, scouting selection/watchlist, profile tabs and dialog keyboard dismissal in a separate localhost review career. No existing careers or map drawings were cleared.

Earlier verification: all 176 Jest suites / 1,663 tests passed; accessibility checks passed (18 tests); lint passed with existing warnings. Latest restored-checkpoint regression checks passed (2 suites / 18 tests). A live UI test found frozen persisted map history reused as mutable round history; canonical restored maps now detach their nested values, with a frozen-checkpoint regression test. Simulation formulas are unchanged. Post-fix live-match completion remains to be verified.

Final production verification: `npm run build` passed, including TypeScript validation, lint (existing warnings), page generation and production-worker startup verification. Log: `tmp/premium-ui-build.log`. An earlier standalone typecheck was interrupted by build cleanup removing generated `.next/types`; the sequential type validation within the successful production build supersedes that run.

Open verification: exact-size recapture for some viewport captures, complete route/branch sweep, final match-to-results test and packaged Windows testing. Browser control disconnected during the post-fix match check, so that flow is not claimed complete. New artwork has generation provenance but this UI change has not been uploaded to Steam or reconciled with the release content inventory. This is not a launch-completion claim.

## Follow-up UI and recovery review

Code review found and fixed the remaining blue Resume Career CTA, equipment-filter halo and continuously pulsing selected training drill. Settings licenses now use the shared Radix dialog with explicit focus return to the opener. Equipment comparison returns keyboard focus to its originating card. TacticalLoadoutEditor now declares its dialog semantics, labels the strategy-name input and uses the existing focus trap for Tab, Escape and focus restoration; the old black scaled container is replaced with the shared panel and a viewport-bounded height.

Recovery regression now covers three successive JSON career-snapshot round trips through Immer-frozen checkpoints. Recorded pending events remain intact and each restored round history accepts the next round without mutating its persisted source. This verifies data ownership and playback cursor behavior, not a full React match-completion flow.

Validation: 5 suites / 52 tests passed (live checkpoint, live initialization, live utilities, tactical timeout and accessibility). Production build passed after all follow-up changes, including type validation, lint with existing warnings, page generation and worker startup. Logs: `tmp/ui-followup-tests.log`, `tmp/ui-followup-build.log`.

Reviewed prior scouting 1280x720, player 1440x900 and match 1280x720 screenshots for density and hierarchy. Fresh visual/interaction validation remains blocked: browser inventory, existing-tab selection and a new dedicated review-tab request all timed out, including after the user's reconnection. No new screenshots or successful post-fix match-to-results run are claimed. Resume with a dedicated tab at `http://127.0.0.1:3370`; use the isolated review career, leaving other careers intact.
