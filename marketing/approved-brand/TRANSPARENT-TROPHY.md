# Current approved game logo — September 20, 2026

`ESM_LOGO.png` is the owner's original transparent trophy PNG, preserved byte-for-byte. This supersedes the previous square trophy reference for future game branding and promotional layouts.

Installed locally: main-menu/new-career shared logo, browser metadata, web-app icons, Electron window image and Windows build ICO. `exports/` contains 256/512 PNGs and a seven-size Windows ICO. The original full-resolution PNG is suitable for placement over promotional backgrounds.

Previous files are preserved in `backups-before-transparent-trophy/`. Reproduce exports with `node scripts/branding/install-owner-trophy.cjs`. Content records reference the exact original hash and owner authorization in `docs/launch-readiness/evidence/OWNER-TROPHY-20260920.json`.

The existing Steam build and previously generated promotional composites are unchanged. A new packaged build is needed to update installed Windows shortcuts/executable icons; Steam artwork needs its separate upload. Historical `record-verified-icons.cjs` validates the previous EM monogram and is not the verifier for these trophy files.
