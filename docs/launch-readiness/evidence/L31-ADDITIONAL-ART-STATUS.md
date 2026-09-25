# Additional owner confirmation — 16 September 2026

The owner confirmed: "Yes, these were created for my project" for status badges, merchandise, weapon/grenade icons and older tournament illustrations. `L31-OWNER-ADDITIONAL-ART-CONFIRMATION.json` records 112 exact current file hashes; the source ledger now recognizes these as owner-attested project-created artwork. The earlier extra-art question is resolved. No further confirmation is needed for those exact files.

During reconciliation, `public/assets/teams/masonic/logo.png.webp` was found to bypass the previous single-extension legacy-logo exclusion. The package rule, exact-archive guard and runtime legacy-logo resolver now reject legacy `logo*` raster files, including double extensions. The source file remains local. Custom mod assets outside legacy stock folders and the authored SVG logos remain supported.

All 10 targeted content-provenance, packaged-artwork and team-identity tests pass, including double-extension regression coverage. The selected source scope is 812 files with 86 remaining reconciliation entries in `L31-RELEASE-CONTENT-REMAINING.json`. This is not a count of proven third-party assets.

No Windows package, Steam upload, installed-game test or review submission occurred in this pass. The production build must be rebuilt to include the runtime logo-resolver change before packaging. Source/compiled-data/notice reconciliation and the previously timed-out Chrome connection remain open.
