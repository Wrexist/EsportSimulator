# L24 ? Accessibility, input and localization readiness

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
