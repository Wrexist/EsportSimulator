# Packaged-content reconciliation â€” 16 September 2026

## Verified scope

`L31-PACKAGED-CONTENT-RECONCILIATION.json` inventories the exact public assets, license files and NOTICE in the most recent local QA archive, using the packaged bytes and SHA-256 hashes. It contains 1,501 files; all match the corresponding current source bytes. Another 3,113 source assets are absent at those paths in this archive. This is narrower and more useful than the source-wide gate, but does not inspect embedded data in compiled JavaScript, runtime dependency notices, remote content or store media.

No release permission records were invented or changed. Missing records are not proof that an asset belongs to a third party. The QA archive remains prohibited from Steam upload.

## Decisions supported by current evidence

| Content | Evidence | Release action |
| --- | --- | --- |
| Retired portraits and marketing masters | Archive exclusion guard; original files retained locally | Keep excluded. Legacy portrait paths resolve to the 161 retained images. |
| Retained portraits and EM artwork | Byte-preserving migration and owner-approved artwork exports | Preserve these creation/migration records; original-input and permission review remains unresolved in the existing ledger. Renaming files does not grant rights. |
| Stock vector emblem code | Local authored path drawings and canonical catalog | Use deterministic distinct stock assignments; preserve custom artwork. Raw legacy logo files still in public assets require separate review or removal after consumers are migrated. |
| Imported radar/nav/collision/overview assets | Pinned Awpy import manifest; upstream licensing statement | Hold for applicable redistribution permission or replace with original independently created maps. Do not label extracted game assets MIT. |
| Mirage drawings and utility data | Owner drafts mixed with traced outlines and external lineup references | Preserve original projects and backups. Separate owner annotations from imported material before release clearance. |
| Archivo Black | Local OFL text exists | Match the bundled font binary to its source/version and retain the OFL notice. The report does not silently certify unmatched binaries. |
| Other environment/equipment/staff/art/database files | Exact list and hashes in reconciliation JSON | Review source by asset family; remove unused files only after checking runtime consumers. |

## Upstream clarification

Checked https://github.com/pnxenopoulos/awpy-data#licensing on 16 September 2026. The repository distinguishes MIT-licensed build scripts from extracted game assets. Its radar images, navigation meshes, collision geometry and overview data are Valve property and remain subject to Valve's copyright and terms. The repository's availability is not permission evidence for this game's commercial distribution. This is the concrete imported-map blocker, not a conclusion about every inventory entry.

## Next release path

1. Establish applicable permission for the imported map assets, or create independent replacement maps and calibrate simulation against those replacements. Preserve Mirage projects in the development workspace.
2. Match retained artwork and font records to distributed bytes; remove redundant old assets after verifying consumers.
3. Run the unchanged release gate and build the real `EsportsManager.exe` artifact. The previous QA boot predates the current energy/emblem fixes.
4. Upload only the validated release, record the new Steam Build ID, install through Steam, then verify launch, new career, save/reload and a match. No new upload or Steam installation test occurred in this reconciliation pass.

## Artwork records resolved — 16 September 2026

Resolved eight specific ledger records with reproducible evidence in L31-VERIFIED-ICONS.json:
- Five shipped EM icon copies reproduced byte-for-byte from the retained monogram SVG and matched their approved exports.
- Barlow ExtraBold font and OFL license matched Google Fonts exactly. Added the Barlow notice under licenses for packaging.
- Existing Archivo Black WOFF2 matched @fontsource/archivo-black 5.3.0 exactly. Existing OFL license text matched the package after whitespace normalization; no font bytes or visual design changed.

The source-wide gate now reports 5,146 unresolved/changed records. This count includes source/development files and is not a count of known third-party assets. Older portrait import scripts explicitly downloaded HLTV material; later cleanup/migration audits prove edits and continuity but do not prove that retained images have independent creation/permission records. Do not apply the verified icon/font approval to those images.

L31-REMAINING-ASSET-RECORDS.csv lists exact pending public/license/NOTICE files from the inspected archive, including available source links and next actions. Remaining artwork cannot be resolved solely by changing fictional names or record statuses. Applicable creator/license evidence or documented replacements are still required. Imported map permission remains independently unresolved.

## Owner map confirmation — 16 September 2026
The owner stated: "For the maps they are verified as fine to use" in the Steam-build conversation. Recorded this as owner-attested permitted use for 54 exact map-image/geometry/navigation assets in L31-OWNER-MAP-CONFIRMATION.json, with current hashes. This supersedes the missing-owner-confirmation blocker for those bytes; it is not independent verification, a supplied agreement, or Valve endorsement. External lineup collections, mixed drafts, photography and logos are outside this confirmation. Existing source files and packaging filters are unchanged. Clarification pending on whether "now included" means include original photos/logos or keep them local and exclude them from Steam.
