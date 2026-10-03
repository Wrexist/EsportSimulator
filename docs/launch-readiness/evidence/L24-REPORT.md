# L24 ? Accessibility, input and localization readiness

## 3 October 2026 pass — L24.1, L24.2, L23.A1, L26.1 (branch `claude/accessibility-pass`)

Status stays **partial**. Every change below is verified by code, unit tests, typecheck, lint and build only. No browser, screen reader or real viewport was used, so no acceptance checkbox is ticked.

### Modals and dialogs (L24.1)

- **One shared contract.** Added `lib/modal-focus.ts` (`attachModalFocus`); `useFocusTrap` in `lib/accessibility.tsx` is now a thin hook over it. On open, focus moves to the dialog surface, never pre-focusing a primary or irreversible action. Tab and Shift+Tab wrap and skip disabled or hidden controls. Focus that lands outside the dialog is pulled back in. While a dialog is open, Escape never reaches page shortcuts; it closes the dialog unless the caller passes no handler (destructive action in flight, or a required choice). Nested dialogs stack, and only the top one reacts. On close, focus returns to the trigger, else the next dialog down, else `#main-content`.
- **Radix dialogs.** `components/ui/dialog`, `alert-dialog` and `sheet` already met this contract and are unchanged.
- **Wired 23 bespoke dialogs** with `role="dialog"`/`alertdialog`, `aria-modal`, `aria-labelledby` (or `aria-label`) and `tabIndex={-1}`:
  - Transfer listing, activity picker, bootcamp/marketing/scrim booking, staff details, tournament details, team match popup.
  - Exit confirm: Escape is disabled while a save is in flight.
  - Match navigation guard, Academy release confirm.
  - Season recap, Pro Awards, tournament win.
  - Legend pick, roster builder and veto side selection: required choices, so focus is trapped but Escape does not dismiss.
  - Week review overlay, advancement animation (gains Enter/Escape skip), rankings team detail, squad promotion.
- **Duplicate Escape handlers removed.** ExitConfirm, TournamentDetails and TeamMatchPopup had their own window Escape listeners; these are gone.
- **TournamentDetailsModal was not positioned.** It had no top/left, so it rendered in page flow below the fold. It is now centred.
- **Regression guard.** A test fails if any non-Radix `aria-modal` surface in `app/` or `components/` lacks `useFocusTrap`.

### Keyboard and labels (L24.1)

- Added `pressable()` in `lib/accessibility.tsx`. It gives `role="button"`, a tab stop, Enter/Space activation (only when the card itself has focus, so nested buttons never double-fire), and `aria-pressed`/`aria-expanded`/`aria-disabled`.
- Applied `pressable()` to 23 mouse-only clickable cards and rows. Locations: save slots (main menu, career), new-game team picker, training drills, staff meetings, stats match rows, tournament cards, bracket matches, standings rows, schedule match card, player weapon tiles, Pro Awards list, and the Calendar, Facilities, Market, News, Social, bootcamp-type and scrim-team pickers.
- Icon-only buttons: added names to the TeamMatchPopup close and rankings close buttons. The two NewsApp Bookmark/Share buttons had no handler, so they were removed rather than labelled. The transfers action column header now has an sr-only "Actions".
- Veto map cards now announce the map's display name instead of its raw ID. Map W-L records carry the team name for screen readers.
- Focus-ring CSS (`app/globals.css`, `premium-ui.css`) already covered `:focus-visible` on all interactive roles and was unchanged.

### Reduced motion (L24.2)

- **One app-wide signal.** Added `lib/reduced-motion.ts`: `useAppReducedMotion()` and `isReducedMotionActive()` both mean "in-game setting OR OS `prefers-reduced-motion`". framer-motion's `useReducedMotion()` reads only the OS preference, so these components previously ignored the in-game toggle: TournamentWinCelebration, DefeatOverlay, HalfTimeOverlay, LiveMatchScoreboard, MapRadarPanel, and MapRadar3D (which had a local OS-only hook).
- **Every framer-motion animation stops.** The app-root `MotionConfig` in `GameShell` now also sets `skipAnimations`. This jumps all framer-motion animations, including roughly 32 infinite opacity/colour loops that `reducedMotion="always"` leaves running, straight to their final value.
- **Count-ups.** `AnimatedNumber` (top bar budget, finances, dashboard, prize reveal) jumps to the final value under the in-game toggle too, not just the OS preference.
- **Radar playback.** With reduced motion on, dots step once per game tick instead of gliding between ticks. Positions are unchanged; SVG pulse effects were already static.
- **CSS.** The global CSS rules for `prefers-reduced-motion` and `html.reduce-motion` already existed and were unchanged.
- **Regression guard.** A test fails if any component calls framer's `useReducedMotion()` directly.

### Colour-only signals (L24.2)

- **Radar.** Shape now carries the side as well as colour: CT players are circles and T players are diamonds. The alive counter shows a ● CT / ◆ T legend.
- **Finance projections.** Values route through the shared formatter, which prints a minus sign, and gain an sr-only "(deficit)".
- **Already reinforced (unchanged).** Finance cash-flow already pairs colour with arrow icons and +/− signs. The veto CT/T choice already has text and the shaped `SideEmblem`.

### Layout at 1024×640 / 1280×720 (L23.A1, static review)

Panels whose primary action could fall below the viewport now have a max height in `dvh` units with internal scrolling, or tighter spacing:

- TransferListingModal and TeamMatchPopup. TeamMatchPopup's action footer is now sticky.
- TournamentWinCelebration: smaller trophy below 800 px of height.
- LegendPickModal, SeasonRecapModal (cap now accounts for the top bar), BookBootcamp/Scrim/Marketing, ActivityPicker, ExitConfirm, MatchNavigationGuard, squad promotion, Academy release, RosterBuilder, rankings detail.
- Veto: the side-choice tiles are smaller, and the header and map cards shrink below 800 px of height.

Elsewhere:

- **Transfers table.** The Tactic and Teamwork columns hide below 1280 px, so the Buy/Negotiate column is on screen at 1024 px.
- **Tactical loadout editor.** The sidebar narrows to `w-64` and the 5-column grid becomes 3 columns below 1280 px.
- **Finances header.** The 12-column metric row only applies at 2xl or wider; at 1280 px the money tiles were about 115 px wide and clipped.
- **Week review card.** Its width is capped at the viewport.

### Formatting and placeholders (L26.1)

- **No exact duplicate formatters.** No local money/percent/date formatter is byte-identical to `formatCurrency`/`formatPercentage`, so there was no pure drop-in refactor. Near-duplicates are listed below as remaining work.
- **"undefined"/"NaN" text fixed in these places:**
  - Desktop notifications: AI_TRANSFER, JOB_OFFER, streaks and ROSTER_UPDATE could print "undefined" or "$undefined". They now use fallbacks and `formatCurrency`.
  - Finance 4/8/12-week forecasts could print "$NaNk"; they now use `formatCurrency` with a "—" fallback.
  - The NewsApp fee could read "$undisclosed".
  - FPL showed a raw player ID, a bare "$" and "+ XP".
  - The FinanceApp balance and the staff salary could show a bare "$".
  - The negotiation header could read "Negotiating with undefined".
- **No literal placeholder text in the UI.** No TODO, FIXME or lorem appears in rendered UI. "TBD" is an intentional unknown-team label.

### Verification

- **New tests.** `__tests__/l24-modal-motion-contract.test.tsx` adds 20 tests:
  - The focus contract against a minimal fake DOM: entry focus, Tab wrap, disabled skip, focus pull-back, Escape close vs. busy swallow, focus return, `#main-content` fallback, nested stacking, and empty dialogs.
  - Dialog markup and the aria-modal regression guard.
  - `pressable` keyboard semantics.
  - Reduced-motion resolution (setting, OS, html class, SSR), the framer-hook guard, and the `skipAnimations` wiring.
  - Radar CT/T shapes.
- **Checks.** `npx tsc --noEmit` passes. `npm run lint` passes with zero warnings. `npm run build` passes, including the worker verify. Full `npx jest --silent`: **195 suites / 1,866 tests pass** (473 s).

### Still needs a human pass (cannot be closed from source)

1. **Screen reader.** Run NVDA through every dialog above: announcement of the name, focus landing, Tab cycle and focus return. Confirm that `pressable` cards read sensibly, since cards given an explicit `label` hide their inner text.
2. **Keyboard-only.** Run the core loop: new game → roster builder → advance week → week review → veto (including side choice) → live match → result → transfers → finances. Check for visible focus on every stop.
3. **Viewports.** Check 1024×640, 1280×720 and 1440×900, plus Windows 125%/150% scaling, on every route in ROUTE-MATRIX. The fixes above come from static class arithmetic only. Still unchecked: the live-match Finish button and tactics Start position; the veto "Back to HQ" button overlapping the home logo at 1024 px; the TopBar wrapping to two rows in daily mode at 1024 px.
4. **Reduced motion.** Toggle the in-game setting during celebrations, confetti, radar playback and week review, with the OS preference both on and off. Check that nothing remains invisible because an entrance animation was skipped. Spot-check canvas/WebGL camera damping in MapRadar3D.
5. **Colour vision.** Check the colour-vision filters, other status pills, and the near-duplicate money formats that still differ from `formatCurrency`: inline `$Nk` in scouting, market, main menu, career, equipment, PlayerCard, CalendarApp and ShopApp, plus `toLocaleString()` money that uses the system locale. Unifying those changes visible output, so it needs an owner sign-off.

---

## 14 September 2026 increment

Status: **partial**. Implemented 14 September 2026 for the local Windows 1.0 candidate. L23 visual acceptance and L22 fresh-player/UI testing remain open; no acceptance criterion is checked off.

## Changes

- Replaced the unused document-wide focus trap with a container-scoped implementation and connected it to player negotiation, staff negotiation and settings. It recomputes visible enabled controls, handles empty/changed controls, wraps keyboard focus, handles Escape and attempts focus return. The existing skip link now uses the shared component to focus the main scroll container; there is one skip link, not a duplicate.
- Named signing fee/salary/duration fields and settings controls. Settings toggles use the shared switch component. Shared slider thumbs receive the caller's accessible name, description and value text, so units such as weeks and percentages are exposed on the operable control.
- Added coordinate entry for new Map Studio points and numeric editing for existing points. Drawing, selection, locking, snap rules, undo, validation and save guards use the existing project model. Existing point-arrow nudging is retained; markings accept Enter/Space, and the focused canvas supports arrow-key panning and Home to fit. Spatial Lab can place A and B by numeric coordinates through its existing surface-selection logic.
- Moved color-vision mode into validated device settings with one-time adoption of the earlier storage key and startup application in the shell. Explicit Off wins over the older value. Corrected high-contrast foreground/background tokens to the HSL format used by the theme and made card/dialog surfaces opaque in high contrast.
- Confetti honors both app and OS reduced motion before loading and before firing; toggling reduced motion also resets loaded confetti. Existing CSS, radar SVG static-effect and controlled playback paths remain. This does not certify every remaining animation or flash.
- Kept English as the implemented language, normalized unsupported stored language values, excluded incomplete dictionaries from selection and made interpolation literal-safe. The top bar now uses en-US number separators; its existing UTC calendar formatting is retained.

## Scope and audit

See [input/language scope](L24-INPUT-LANGUAGE-SCOPE.md), [localization source inventory](L24-localization-inventory.json) and [42 unexecuted acceptance cases](L24-acceptance-cases.csv).

The scan identifies **2,088 text-extraction candidates across 146 TSX files**; these are regex signals, not unique messages or a complete extraction. The translation helper has no current UI import consumers, so broad string extraction/integration remains unfinished. One bundled Latin display font is hashed; glyph coverage and system-font fallback rendering remain unverified.

The implementation target is Windows keyboard/mouse and English. No controller input integration was found in the scanned UI/Electron source. Controller/Steam Deck support is not implemented or advertised by this increment; Steam store/device metadata was not changed. All English/input/display acceptance cases remain NOT_RUN.

## Verification

- **1,589 tests / 163 suites pass:** [Jest JSON](L24-jest.json), [log](L24-tests.txt). Eighteen new cases cover focus boundaries, empty/changed control lists, invalid/boundary/fractional coordinates, recovery/locked field semantics, slider names/units, legacy preference precedence, mocked-storage hydration, English normalization, incomplete dictionaries, literal interpolation and reduced-motion suppression. These do not exercise a real DOM focus lifecycle, browser geometry or actual user input.
- **TypeScript passes:** [types](L24-types.txt). **Production build and worker startup pass:** build `s-yb7lubDHeLiB9Wk6WOV`, worker `3816.0d3a693d9299321c.js`. Scoped `git diff --check` passes. Preview: `http://127.0.0.1:3210`, PID 531792. See [build log](L24-build.txt). Existing repository lint warnings remain. This is a local production build, not packaged Windows acceptance.
- [Production HTTP smoke](L24-http-smoke.json) passes: main menu, Map Studio and Spatial Lab return 200; developer tools return 404. This establishes route availability only.
- Browser inventory returned no apps or browsers; attempting browser selection explicitly returned `No browser is available`. No new screenshot, NVDA pass, keyboard walkthrough, controller test, glyph test or fresh-player session is accepted.
- **Steam App ID 4326170 passes:** [check](L24-steam-appid.txt). **Content release blocks 4,984 unresolved/changed items:** [check](L24-content.txt). Its existing inventory was refreshed; no allowlist was expanded and no asset was removed.
- Owner careers were not opened or advanced. Mirage drawings remain untouched: `mirage-user-v12-2026-09-13.json` SHA-256 `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2`; `mirage-user-areas-2026-09-13.json` SHA-256 `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`.

## Files and compatibility

Shared behavior: `lib/accessibility.tsx`, `lib/focus-cycle.ts`, `lib/accessibility-preferences.ts`, `lib/settings-store.ts`, `lib/confetti-lazy.ts`, `lib/i18n.ts`, `components/ui/slider.tsx`; shell/layout/settings: `app/layout.tsx`, `app/globals.css`, `app/settings/page.tsx`, `components/layout/{GameShell,TopBar}.tsx`, `components/settings/SettingsModal.tsx`; signing dialogs: `components/transfer/NegotiationModal.tsx`, `components/staff/StaffNegotiationModal.tsx`.

Map changes: `lib/map-coordinate-input.ts`, `components/maps/{MapCoordinateInput,MapPointEditor,MapAnnotationEditor,SpatialLab}.tsx`; tests: `__tests__/accessibility-readiness.test.ts`.

No career/save schema or map-project schema migration. Two optional device settings store color-vision choice and whether it has been chosen; the earlier key remains intact. Unsupported language preferences now normalize to the only implemented language. New map actions produce normal project edits and undo records, rather than a separate geometry format. Reverting this increment should restore only its reviewed UI/settings changes; do not reset the large pre-existing worktree or restore whole files from Git HEAD. Do not roll back careers or drawings.

## Remaining work and next

1. Run the 42 prepared cases at all three viewports and declared Windows scaling, then extend route coverage from L23. Verify keyboard-only core career, map creation/refinement/validation, mouse parity, focus return, disabled controls, empty/error states and an NVDA walkthrough. Test nested/shared/custom dialogs and background exclusion; only three custom dialogs were integrated here.
2. Verify every shipped reduced-motion, contrast/filter and scale combination in real playback, including toggling during effects. Check status meaning without color, custom canvas/SVG loops, camera motion, opacity flashes and popovers. Functional radar/lab movement still has manual playback controls; full 5v5 and geometry calibration remain open.
3. Complete glyph coverage/rendering and text expansion checks, extract and connect route strings, audit remaining dates/numbers and complete any language/device claimed for release. Dictionary key completeness is not language acceptance. Retain English-only scope until supported evidence exists.
4. L22 fresh-player testing, L23 UI acceptance, full 5v5 integration/calibration, packaged Windows tests and content clearance remain launch requirements. **Next: L25 ? original team identities and asset delivery**, alongside the unresolved L24 acceptance work.
