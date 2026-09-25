# L25 - Team identities and asset delivery

Status: **partial**, 14 September 2026. The launch census is 198 fictional teams: **3 retained SVG studies, 12 new vector studies and 183 shared-family fallbacks**. No visual or rights approval is asserted. Required dependencies L08 and L23 remain partial.

## Delivered

- Added distinct vector studies for Vitalis, Furiax, Mouze, Spiryt, Phaze, Natus Vincera, G3, The Mongalz, Astralys, 3DMaxx, Futura and Liquis. Existing Falcone, Paravision and Auroria studies remain. Permanent team IDs select the new studies, preserving artwork when a team is renamed. Fictional names and launch snapshot bytes are unchanged.
- Centralized source selection and removed display-name filename guessing from legacy logo wrappers. Desktop, rivalry, bracket and unified team portraits now use the shared path. Explicit replacement SVG/raster art and custom uploads retain priority; failed images fall back to stable vector crests. Stock legacy monograms and source-only `.original` paths do not enter the normal fallback chain.
- Removed the small-size enlargement that could clip crest edges. Dark primary colors now receive a contrasting outer outline. Inline gradient IDs remain isolated across the whole roster; no letter labels were added beneath crests.
- Generated a [searchable 198-team review](L25-assets/index.html), [versioned manifest](L25-assets/manifest.json), seven PNG contact sheets and 594 individual SVG/PNG/lossless WebP files. Each entry records source hashes, file sizes, team mapping, approval/rights holds and duplicate-pixel links. [First sheet](L25-assets/sheet-1.png). All exports are review artifacts under docs, not a cleared runtime asset pack.
- Added an explicit electron-builder exclusion for `public/assets/teams/**/logo.original.*`. Originals remain on disk for development reference. Packaged exclusion is not yet verified; the existing content gate still blocks distribution.
- Corrected the portrait audit to inspect the launch snapshot by default instead of raw import data. All 1,368 launch portrait paths resolve, but all 1,368 are flagged for PNG use against the script's WebP preference. This is not a passing strict portrait audit or confirmation of correct face identity.

## Verification

- **1,595 tests / 164 suites pass:** [results](L25-tests.json), [log](L25-tests.txt). Six new cases cover catalog drift, legacy wrappers, explicit override priority, excluded source fallback, stable ID studies and whole-roster SVG ID references/contrast. These are source/SSR checks; browser image failures and upload interactions still need real UI tests.
- [TypeScript](L25-types.txt), [production build and worker startup](L25-build.txt) pass. Build `cq8dsNxFQpI_H_o3H8Svp`; worker `3816.0d3a693d9299321c.js`. Existing repository lint warnings remain. Preview `http://127.0.0.1:3210`, PID 531800. [HTTP smoke](L25-http-smoke.json) establishes route availability only.
- `npm run assets:review` regenerated all 198 mappings. `node scripts/branding/validate-identity-review.cjs` independently decoded and hashed all **594 files**, checked 256px raster dimensions/alpha and transparent outer margins: [zero failures](L25-asset-validation.json). Manifest detects **18 groups with identical pixels**. Similar-but-not-identical silhouettes are not detected by this check.
- Contact sheets 1 and 7 were visually inspected locally; the first inspection prompted the dark-outline fix. This sampled review is not approval of all identities or 24px UI legibility. No real browser/UI or packaged acceptance was performed; the prior browser selection reported no available browser.
- [Portrait audit](L25-portrait-audit.json): 1,368 resolved, zero broken paths, 1,368 non-WebP flags. Existing portraits were not edited.
- Steam App ID **4326170** passes `node scripts/check-steam-appid.js`. Refreshed content inventory: **4,986 unresolved/changed items**; `node scripts/launch/content-provenance.cjs` exits 1 as expected. The gate was not bypassed.
- Scoped `git diff --check` passes. Owner careers were not opened or advanced. Mirage draft hashes remain `efc599edc2dcfd27d450e734d476ff94426c98bb2ef631e96ca09f63d91a8fe2` (v12) and `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65` (areas). Launch team snapshot hash remains `1d175e66684c7b0b31d8d46d9dd99b81bf07a64d4cd7249d613997363f46285b`.

## Files and compatibility

Implementation: `data/team-identity-catalog.json`, `lib/team-identity.ts`, `lib/team-emblem-design.ts`, `components/ui/{TeamLogoDisplay,TeamEmblem,asset-images,unified-portrait}.tsx`, `components/tournament/TournamentBracket.tsx`, `app/{desktop,stats}/page.tsx`, `package.json`, `scripts/audit-portraits.js`, `scripts/branding/{build-identity-review.tsx,validate-identity-review.cjs}` and `__tests__/team-identity-delivery.test.ts`. Evidence, content inventory and launch status documents also updated.

No save schema, career data, map geometry, snapshot identity or original image bytes changed. The small catalog is derived from the launch snapshot and checked for drift. Vector source changes are delivered through code; PNG/WebP review exports are not yet runtime raster fallbacks. Reversing this increment requires restoring only its source-selection/design/build-config edits, not old saves. Preserve unrelated work in the dirty workspace.

## Remaining L25 work

1. Create distinct reviewed identities for the 183 shared-family teams, prioritizing the manifest's 18 identical-pixel groups. Compare all studies for similar silhouettes as well as byte-level duplicates. The 15 studies also need approval; they are not accepted final identities.
2. Review all 198 at 24/48/96px in tables, profiles, match cards and light/dark/high-contrast modes. Verify custom PNG/JPEG/WebP upload, explicit SVG mod replacement, broken-source recovery, renamed teams and old saves in the actual UI.
3. Review standalone SVG metadata in the three retained studies, which can still contain earlier fictional labels; runtime alternative text uses the current team name. Finish portrait visual/mapping acceptance and decide whether WebP conversion is worth the asset migration.
4. Resolve L08 item-specific source/rights/replacement evidence. Produce a packaged artifact and inspect included assets, exclusion rules and actual raster delivery. Export hashes and a packaging pattern do not establish distribution clearance.

**Next package: L26 - content, terminology, audio and feedback.** L25 redesign/approval work, earlier UI/fresh-player testing, full 5v5 integration/calibration, packaged Windows testing and content clearance remain open.
