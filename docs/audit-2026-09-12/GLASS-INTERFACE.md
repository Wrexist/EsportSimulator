# Glass interface and navigation pass

12 September 2026. Continues the cleanup in IMPLEMENTATION.md with the requested liquid-glass direction.

## Visual rules

- Use system sans-serif for body text, labels and numbers. Archivo Black is available as `font-display` for deliberate branding; it is no longer forced on the entire game.
- Reserve backdrop blur for the floating navigation/status surfaces and larger overlay panels. Ordinary cards use translucent fills and specular borders without blur. Avoid stacking filters on data rows.
- Use cool blue light, a subdued violet background and narrow highlights to suggest a lens edge. Keep typography and data crisp; do not distort text through a refraction shader.
- Use 22px panel corners, smaller nested controls, readable secondary labels, and one strong primary action. Financial and gameplay colors keep their semantic meaning.
- Keep background light static. Give interactions a short response; avoid idle shimmer and multi-stage page entrance animations. Respect app/OS reduced motion and provide a reduced-transparency CSS fallback.

## Implemented

- Floating sidebar and status bar with translucent lens rims, reframed background and compact navigation.
- Immediate pending selection feedback, intent-based route prefetch, accessible active/collapsed navigation labels, and functional keyboard blocking while live-match navigation is locked.
- Searchable game navigation, available from the sidebar and Ctrl/Cmd+K. Keyboard selection, empty search, dismissal and focus restoration use the existing command/dialog primitives.
- Dashboard title, stronger hierarchy, readable metadata and a useful between-matches panel with training/schedule actions.
- Shared typography, button feedback, scrollbars and faster page/loading presentation throughout the application.

## Verification and limits

Validation:

- Production Next.js build, type validation and compiled-worker startup gate passed after the final edits. Lint retains 154 existing warnings, zero errors.
- Full regression suite: 1,207 tests / 121 suites passed. The subsequent changes were the search trigger/focus fix and accessible names; these were verified in the final production build and browser.
- Browser checks passed for the saved career, dashboard, sidebar navigation to Training, collapsed navigation to Squad, and command-search navigation to Finances and Training.
- Ctrl+K opens search, typing filters results, unmatched queries show a helpful empty state, Enter opens the selected screen, and Escape restores focus to the named trigger. The final search input and collapsed manager-profile link have explicit accessible names.
- DAILY, Next day and SKIP WEEK remain within the viewport at 1024×640, 1280×800 and 1440×900. Desktop dashboard, compact Training, and Crystal/Onyx variants were visually inspected. Restored Crystal after testing.
- No captured console warnings/errors in the final browser pass. `git diff --check` passed. Test tabs/server were closed and viewport overrides reset.

See [screenshots and verification evidence](glass-evidence/), especially the [final overview](glass-evidence/final-overview.png), [navigation search](glass-evidence/final-navigation-search.png), and [viewport measurements](glass-evidence/progression-viewports.json).

This pass changes presentation and navigation; it does not rebalance the simulation or modify save contracts. Shared styles reach every screen, but individual feature pages still need the route-by-route composition work in PLAN.md. Navigation feedback starts immediately; cold route loading and expensive feature rendering still depend on hardware and bundle availability. No device FPS benchmark or packaged Electron visual certification is claimed. Changes remain local and uncommitted.
