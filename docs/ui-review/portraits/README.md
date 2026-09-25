# Top-25 portrait synchronization — 2026-09-25

128 roster members across the 25 highest-reputation stock teams now resolve to their authored stylized portraits by permanent player ID. Names, club transfers and list order no longer decide their face. Other players retain existing stable randomized portraits; custom/community portrait paths remain explicit.

92 existing retained PNGs were matched to unique original-pipeline nickname stems using the verified raw-to-fictional identity mapping. Another 36 existing stylized WebPs received transparent face crops that omit branded kit. Source images were not overwritten. The optional generated apexx plain-hoodie experiment is retained under `tmp/apexx-plain-hoodie-imagegen-review.png`, but is **not used in the game**; production uses the original face pixels instead.

The snapshot changed 108 portrait references and no other fields among 1,368 players. Existing saves receive the same correction during identity refresh. The shared portrait component resolves the same file in previews, lists, profiles and negotiations, and handles errors against the resolved source.

## Verification

- `npx jest __tests__/player-portrait-source.test.ts __tests__/identity-refresh.test.ts --runInBand`: 17 passed.
- TypeScript: passed; lint: no errors, existing project warnings remain.
- `npm run build`: passed, including production worker startup verification. Existing lint and server-render storage warnings remain.
- Source content gate: passed after 39 exact portrait/data derivative records were reconciled. This is not installed-package acceptance.
- Chrome production server on port 3371: Vitalis selected in New Career, all portraits displayed. Both apexx images resolve to `face-429bf6627cd8dd51.png`, loaded successfully. Screenshot: `vitalis-in-game.png` (1049 × 827).
- Old-save, custom-art, transferred-player and four UI-size consistency cases are covered by tests; not every route was manually clicked in this pass.

## Review and reproduction

- `top-25-2026-09-25.html`: standalone visual roster review, all 128 assignments.
- `scripts/branding/portrait-face-crops.json`: explicit original crop rectangles.
- `node scripts/branding/export-portrait-faces.cjs`
- `npx tsx scripts/branding/sync-player-portraits.ts --write`
- `node scripts/branding/review-player-portraits.cjs`
- Exact identity/source hashes: `docs/launch-readiness/evidence/2026-09-25-portrait-sync.json`.

The Steam build was not uploaded in this pass. Remaining release acceptance, including Overpass floor-support failures, production physical-match integration, store gallery and installed Windows/Steam testing, is tracked in `docs/launch-readiness/REMAINING-2026-09-25.md`.
