# Continued release reconciliation

## Completed

- Reproduced all 198 current stock team SVGs from local Python drawing functions. Exact file hashes and generator arguments: `L31-VECTOR-CREATION-AUDIT.json`.
- Reproduced 41 tournament SVGs from inspected repository history, normalizing line endings only. Evidence: `L31-TOURNAMENT-VECTOR-CREATION.json`.
- Matched 52 flag SVGs byte-for-byte to the importer-declared Flagcdn vendor. The vendor declares commercial use permitted/public domain: https://flagpedia.net/download . Evidence: `L31-FLAG-SOURCE-MATCHES.json`.
- Replaced mislabeled Uzbekistan flag WebP bytes with the vendor's real SVG, keeping the old bytes in `tmp/artwork-source-check/uz-original-mislabeled.webp`. Evidence: `L31-UZ-FLAG-REPAIR.json`.
- Excluded 19 obsolete team SVGs, 33 unused country thumbnails, the unused Hong Kong WebP duplicate and the old ranking-source file. Original files remain local. Checked references across app/components/lib/engine/store/src/data/public-data; no current stock logo is excluded.
- All 10 targeted content/provenance, packaged-artwork and team-identity tests pass. The existing production worker passes its browser-global-free startup check.

The selected-source inventory now has 813 files, of which 199 still require reconciliation, down from 545 pending records. This is not a count of proven third-party assets. An additional owner question remains pending for status badges, merchandise, weapon/grenade icons and older tournament illustrations.

## Not completed

No real release package, Steam upload, installed-Steam acceptance test or review submission was completed in this pass. Chrome automation timed out twice, including a fresh inventory/reconnection attempt. The prepared gallery has not replaced the Steamworks gallery. The real release must pass the source and exact-ASAR checks before upload; the existing QA artifact remains prohibited from upload.
