# Steamworks review audit — 15 September 2026

App 4326170, inspected in the owner's signed-in Chrome session.

## Confirmed release state

- Store presence already approved and visible as Coming Soon.
- Build review failed, BuildID **23989573**.
- Configured launch executable: `EsportsManager.exe`. Valve reports the uploaded depot instead contains a development dependency executable under `game/node_modules/7zip-bin/win/arm64/7za.exe`; the configured game executable is missing.
- Do **not** fix this by pointing the launch option to 7za.exe. Create the actual Windows game distribution, upload the correct depot root, and test installation/launch through Steam.
- Review also rejects non-gameplay overlays in the screenshot gallery and requests gameplay-only captures.
- Existing store copy says Early Access, while the owner's intended release is Windows 1.0. Reconcile the Early Access setting and text before resubmitting; do not claim an unfinished build is complete.
- Checklist also shows trailer processing/incomplete.
- No build resubmission was made: the executable and screenshot failures are unresolved.

## Revised artwork

Folder: `marketing/esports-manager-steam-assets-4326170/UPLOAD-READY-v2`.

17 field-sized images and a seven-frame ICO. Outlined Barlow Condensed wordmark, genuine transparent library logo, coordinated EM icon. Three approved cinematic scenes edited to remove baked-in typography before placing the vector wordmark. Original files retained. Source font and OFL license retained in `brand-v2`.

Root cause of owner screenshot's dimension errors: master files were dropped into Steam's graphical uploader, including About images and an app icon that belong in different editors. The new upload-only package excludes source masters and separates destination fields.

## Remaining acceptance

### Steam edits completed this session

- English short description saved and reloaded: **202/300 characters**.
- English long description rewritten with concise feature sections; Swedish long description translated consistently. Both saved as unpublished drafts.
- Three 1460×600 feature panels uploaded through **Description / Custom images**, then inserted into the English long description using Steam-issued `{STEAM_APP_IMAGE}/extras/...` references. Uploaded assets resolve as 1460×600 images in the editor DOM.
- Save response explicitly shows `SuccessMsg[0]=Changes saved`.
- No public Publish action or build review submission performed.
- Store/library capsules and app icons remain **local only**. The legacy graphical drop area does not open a supported file chooser, while the Description uploader works. Repeated old-tab input/screenshot timeouts were also observed. Do not interpret an attempted click as an upload.

1. Upload final store/library assets and app icons; verify Steam's own field assignments and previews.
2. Check the complete English customer-facing preview, including the three saved feature panels and language fallback.
3. Capture current gameplay at 1920×1080 or higher, without marketing overlays, menus or load screens; replace flagged gallery assets.
4. Reconcile release model (Windows 1.0 intended), trailer and accurate feature/content disclosures.
5. Package the actual Windows application, upload the correct depot and verify fresh Steam install, launch, save/load and overlay behavior.
6. Clear outstanding content and calibration gates before declaring launch readiness.
7. Resubmit only after the specific Valve failures are resolved.

Live checklist: https://partner.steamgames.com/apps/landing/4326170

This audit does not constitute packaged-game acceptance or content clearance.
