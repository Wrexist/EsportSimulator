# L23 ? Consistent interface polish across routes

Status: **partial; no UI acceptance criteria checked off**. Implemented 14 September 2026 for the local Windows 1.0 candidate. L22 UI and fresh-player validation remain open.

## Changes

- Standardized headings across 15 management routes and reduced duplicated page/hero padding in the shell, Basecamp, Equipment and Trophies.
- Shared dialogs now have a dynamic viewport height limit, vertical scrolling and wrapping footer actions. Staff negotiation, settings and season recap received corresponding fixes for their custom containers. Player negotiation and its left-side offer button are preserved.
- Keyboard shortcuts now reuse the shared Radix dialog instead of a separate backdrop/Escape implementation. It has a close control and accessible title/description; actual focus and Escape behavior still needs UI validation.
- Shared tables expose a named, keyboard-focusable horizontal scroll region. GlassTable uses the existing non-blurred card surface with more compact cells and readable header defaults. Shared tabs support horizontal overflow. Empty states use readable text and Next links; loading text no longer claims cloud/server operations.
- Added bounded, career-specific, session-only view state for Transfers, Rankings and Tournaments search/filter/tab/pagination controls. These views recover on route remount, including returning from details. The game shell now restores its own scroll container, waits up to three seconds for growing content, and yields to user input. Standalone setup/menu, Desktop and map tools are excluded from this scroll handler.
- Matched all 40 page entry points to the existing route matrix. The [source triage](L23-ROUTE-REVIEW.md), [hashed inventory](L23-route-inventory.json) and [150 prepared UI cases](L23-ui-cases.csv) distinguish source findings from actual visual acceptance. All UI cases remain NOT_RUN.

## Verification

- **1,571 tests / 162 suites pass:** [Jest results](L23-jest.json), [log](L23-tests.txt). Eleven new tests cover career/route separation, cache eviction, cleared values, no-career defaults, collision-safe keys, delayed scroll restoration, user interruption, new-route reset, table region semantics, empty-state destinations and truthful loading announcements. These do not prove browser rendering or input behavior.
- **TypeScript and production build pass:** [types](L23-types.txt), [build](L23-build.txt). Build `P6YMlEYBkceFlAeTBiDU5`; compiled worker `3816.0d3a693d9299321c.js` startup passes. Existing repository lint warnings remain. Scoped `git diff --check` passes (only a line-ending advisory).
- **Production HTTP smoke passes:** [statuses](L23-http-smoke.json): main menu and transfers return 200; dev and animations return 404. This is route availability/gating evidence, not UI acceptance. Local preview runs at `http://127.0.0.1:3210`, PID 389184.
- CUA inventory contained no enabled apps or browsers. No new screenshot or browser interaction is accepted. No packaged Windows test or fresh-player session was performed in L23.
- **Steam App ID 4326170 passes:** [check](L23-steam-appid.txt). **Content release remains blocked by 4,979 unresolved/changed items:** [check](L23-content.txt). The provenance tool refreshed its existing inventory; no allowlist was expanded or asset removed.
- Existing careers were not loaded or advanced. Mirage drawings were not edited. SHA-256 remains `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2` for `mirage-user-v12-2026-09-13.json` and `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65` for `mirage-user-areas-2026-09-13.json`.

## Files and compatibility

Shared components: `components/ui/{dialog,alert-dialog,table,tabs,GlassTable,KeyboardShortcutsModal,loading}.tsx`, `src/components/ui/EmptyState.tsx`, `components/layout/GameShell.tsx`; custom overlays: `components/settings/SettingsModal.tsx`, `components/staff/StaffNegotiationModal.tsx`, `components/celebration/SeasonRecapModal.tsx`. Styles: `app/globals.css`.

New behavior: `lib/{route-view-cache,route-scroll}.ts`, `hooks/{use-route-view-state,use-route-scroll}.ts` with corresponding cache/scroll and shared rendering tests. Page changes: transfers, rankings, tournaments, basecamp, equipment, trophies, training, squad, scouting, staff, sponsorships, finances, fpl, settings, career and schedule/staff-meeting.

No save schema, career serializer, simulation, player asset or map-project migration. Presentation state is in memory, bounded to 96 field entries and resets on restart. It does not persist through browser reload or keep separate versions of a route for each browser-history entry. Scroll recovery is time-bounded and may stop short if content arrives after three seconds or list contents changed; user input always takes precedence.

Rollback should restore only this increment's shared UI, route styling and view-state hooks from a reviewed copy. The working tree includes extensive earlier owner-authorized changes; do not revert whole files to Git HEAD or reset the workspace. No career or drawing rollback is needed.

## Remaining work and next step

1. Execute the 150 prepared cases with declared Windows scaling, valid/missing/stale fixtures, all three resolutions, keyboard operation, modal close/focus return, empty/loading/error states and real Back/Forward/filter/scroll checks. Attach accepted screenshots and logs to the route matrix. Source scans and HTTP 200s are not substitutes.
2. Finish local/native table and custom modal consistency, scale long labels and large financial values, review the remaining viewport-height layouts and Desktop/Inbox navigation, and test Map Studio tools/inspector and spatial lab without changing the drawings. See the detailed route triage for the specific surfaces still outside shared primitives.
3. Complete L22 real UI validation and the 12-person fresh-player protocol (still zero participants tested), alongside L21/full 5v5 integration, calibration, packaged Windows testing and content clearance. L23 dependencies and all three acceptance criteria remain open.
4. **Next: L24 ? accessibility, input and localization readiness**, alongside L23 visual acceptance: keyboard journeys, focus/error announcements, motion/scaling/contrast, map input alternatives and localization-ready presentation.
