# L24 input, display and language scope

Implementation scope: Windows desktop, keyboard and mouse; English interface. This is a support target, not a completed acceptance claim. Steam controller/Deck metadata was not changed. No controller navigation handlers were found in the application, component, Electron or library source scan. Do not claim controller support or Deck verification from these changes.

## Input paths prepared

- Core UI uses ordinary Tab/Shift+Tab, Enter/Space on controls and native arrow-key selects/sliders. The skip link now explicitly focuses the main scroll container. Global game shortcuts already yield while a dialog is open or a form control owns input.
- Player signing, staff signing and settings dialogs now scope focus to their own container, recompute visible enabled controls, wrap Tab/Shift+Tab, close on Escape and attempt to return focus to the triggering element. Initial focus is the dialog summary. Native selects remain native. Test nested/custom/Radix overlays and trigger removal separately; only three custom dialogs were integrated in this increment.
- Settings switches use the shared switch semantics. Display/audio controls and contract salary/duration controls have names; shared slider thumbs receive labels, descriptions and units from their callers. Other slider callers still need a label audit.
- Map Studio: choose a tool; enter X and Y from 0 to 100 percent; Add point; repeat and Finish. Existing snap settings still apply. Utility throws use the same first/last-point and bounce rules as clicking. Select a marking from the searchable list, open Edit point coordinates, select a point and apply a numeric replacement. Locked marks remain read-only. These operations use the existing undo/save pipeline, and recovery blocks edits.
- Existing SVG point nudging remains available. Markings accept Enter or Space. When the canvas itself has focus, arrows pan and Home fits the map. Numeric creation/refinement is an alternative to precise pointer use, not a complete screen-reader description of spatial geometry.
- Spatial Lab: enter coordinates for A and B; each placement uses existing walk-surface selection and rejects out-of-surface points. Floor/surface choice, validation controls and the timeline remain available. Continuous diagnostic/match movement is functional information and remains user-controlled through play/pause/timeline controls.

## Display settings

The existing UI scale range remains 80?120 percent. Validate 1024x640, 1280x720 and 1440x900 at declared Windows scaling, including 100/125/150 percent. No new claim that every combination fits has been made.

Color-vision mode now lives in validated device settings and is applied by the shell at startup. An older colorblind-mode value is adopted once when no newer preference exists; explicit Off wins on later launches. The old storage key is retained. High-contrast tokens now use the HSL values expected by the design system instead of incompatible hex values. High contrast uses opaque card/dialog surfaces. Existing color-vision filters remain; perception, contrast ratios and fixed-position behavior need visual review.

Confetti checks both the app and OS reduced-motion preference before loading and again before firing. Enabling reduced motion resets loaded confetti. Existing CSS reduced-motion rules and the main radar's static SVG-effect path were retained. Audit remaining custom animation loops, flashes, zoom/camera effects and state transitions with actual playback; static/unit checks cannot certify comfort or readability.

## Localization readiness

The shipped interface is English. The language preference now normalizes unsupported persisted values to en. Partial registered dictionaries remain unavailable for selection; interpolation preserves literal dollar signs and braces. Dictionary completeness checks are only infrastructure: they cannot certify translated routes or appropriate wording.

The source scan found 2,088 literal-text extraction candidates across 146 TSX files. The i18n helper currently has no UI import consumers. Those counts are regex triage, not unique translated messages or a complete extraction. They demonstrate that broad string extraction/integration remains unfinished. See L24-localization-inventory.json for files and examples.

The top bar formats money with en-US separators. Its existing game-calendar formatter uses en-US and UTC, preventing local time-zone/DST shifts in displayed game dates; it was retained. Other dates/numbers and string concatenation still need a route-by-route formatting audit. No simulation dates, currency amounts or career data were changed.

One bundled Archivo Black Latin WOFF2 file is hashed in the inventory; body text uses system sans/Segoe UI fallback. Glyph coverage has not been measured, and actual rendering is unverified. Test Latin accents, Cyrillic/non-Latin names, currency signs, arrows, symbols, emoji/flags and missing-font fallback. Test 35-percent text expansion before accepting future translations. No extra language is advertised based on a partial dictionary.

## Acceptance status

All 42 prepared cases in L24-acceptance-cases.csv are NOT_RUN. Browser inventory returned zero apps and browsers; no keyboard/screen-reader walkthrough or screenshot was captured. Controller and Deck are outside the implemented target, not silently counted as passing. English, keyboard/mouse and display-setting acceptance remain open until actual cases are recorded. L23 visual acceptance and L22 fresh-player testing also remain open.
