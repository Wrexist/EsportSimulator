# L08 — Content provenance and distribution rights

Status: **partial; distribution remains blocked**. Reviewed 13 September 2026.

## Implemented

`scripts/launch/content-provenance.cjs --inventory` creates a SHA-256 file roster across all public assets, data, application/component/library/engine source (including embedded player text), fonts and build artwork. Each row records category, known source, evidence pointer, license, permission, attribution, allowed use and release disposition. Unknown evidence is explicitly `UNVERIFIED` / `hold`; generated or sanitized metadata is not upgraded to ownership proof.

`npm run content:verify` rejects unknown, changed or unresolved content. The release verifier and electron-builder `beforePack` hook both run this gate, including direct builder invocation. A disposition label alone cannot exclude an asset that is still present or bundled. Development builds and user files remain intact. Tests cover changed bytes, absent review, missing permission and unsupported exclusion claims.

`NOTICE.md` previously claimed no third-party content and complete packaged license texts without artifact evidence. It now describes the actual development content and review limits. Packaging now explicitly includes NOTICE and licenses; the official Archivo Black SIL OFL text is retained. Exact font binary matching and final dependency-license aggregation remain open.

`L08-lineup-inventory.json` records all 640 imported library markings individually, with source and content hashes, plus the provenance of all 142 owner-draft markings. No reference coordinates were changed. The local roster and both strict scanners are retained as evidence; unresolved findings intentionally remain blocking.

Final local inventory: **4,906 files**, all held pending item-specific clearance. Re-inventory preserves unchanged reviewed rows and retains the previous review when bytes change. Content gate: expected rejection. Strict readiness: 0 blocker, 1 high, 1 medium, 3 information findings; expanded compliance: 1 medium (`public/hltvrankiing`). See `L08-content-gate.txt`, `L08-readiness.json` and `L08-compliance.json`. No allowlist was expanded. The production build passes independently; this does not clear the shipping gate.

## Verified source findings and required dispositions

| Content | Finding | Required next action |
|---|---|---|
| Eight spatial maps, radar images, meshes and overview transforms | [Awpy-data licensing](https://github.com/pnxenopoulos/awpy-data#licensing) expressly separates MIT extraction scripts from Valve-owned extracted assets. Imported release 2000908 is not commercial redistribution permission. | Obtain explicit permission covering distribution in this game, or create original map art and geometry and migrate annotations with owner review. |
| Imported lineup library | CS2Nades is recorded as the source in the data. Its public [site](https://cs2nades.gg) did not provide verifiable redistribution terms in this review; the attempted `/en/terms` page failed. | Obtain permission covering the copied database, coordinates and text, or replace with independently authored content. Do not scrape more while unresolved. |
| Mirage utility templates | The strict scanner's CS2 token is in a real [external reference URL](https://getreplay.gg/en/articles/cs2-mirage-lineups), not a false game identity claim. | Preserve the accurate URL and keep the finding open with this disposition. Do not rename it or widen the scanner allowlist. |
| `dust2` in library / `public/hltvrankiing` | Source identifiers and an existing data artifact, not permission evidence. | Keep traceability; review the underlying data and remove unused source artifacts from a reviewed shipping layout. Current strict failures remain intentional. |
| 198 club identities, portraits, tournament art and other graphics | Existing references/redesign records and `sources.json` claims of “Generated” do not establish original input rights, likeness clearance or provider terms. | Match every included file to creator/source receipts; complete original replacements where needed. Edge cleanup preserves pixels, not rights. |
| Music, effects and remote/generated content | Code is included in the roster so generated sounds/text and external resource references are not outside review. | Inspect and disposition runtime outputs and every remote asset separately; a local file hash does not cover a remote URL's future contents. |
| Store assets | Local Steamworks artwork is inventoried. No current Steam account-side screenshots, trailer or review export was available. | Supply the actual candidate media and review against the same content roster; capture new media only after its visible content is cleared. |

[Steam's onboarding rules](https://partner.steamgames.com/doc/gettingstarted/onboarding#5) require adequate rights to published content. This review does not provide a legal clearance opinion.

## Historical Steam feedback

`docs/STEAM_REVIEW_REMEDIATION_PLAN.md` references BuildID 22405717 and Early Access. These are historical evidence, not this Windows 1.0 candidate or a current account-side decision. Its advice to refresh accepted baselines is superseded by L34; no baseline or allowlist was changed. Current App ID and candidate depot/media receipts remain unavailable. The old mobile roadmap and Early Access marketing paragraph do not define this launch.

## Preservation, rollback and acceptance

No maps, portraits, careers or drafts were removed or renamed. The Mirage owner draft remains at `public/map-studio/drafts/mirage-user-areas-2026-09-13.json`, expected SHA-256 `46e2c94658a547f6d8bf7d4af8643e3b690e946b14060daece37fc8315c11e65`. It contains both owner marks and imported lineups: provenance must remain per marking. Existing portrait backups remain outside the repository.

The package gate is reversible source configuration, but should only be lifted after item-specific evidence or a tested replacement/exclusion build exists. None of the three release acceptance criteria is met. The roster is a complete enumeration of its stated roots, not a completed artistic/legal review or actual packaged-file manifest. An unresolved content gate is the expected result, not a regression to hide.

Next: L03 save recovery; return to L08 with exact permission/creator receipts and Steam media, then verify the actual packaged notices and inclusion list.
